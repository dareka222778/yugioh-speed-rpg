import {randomInt} from 'node:crypto';
import type {CardRef,Monster} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {bindTarget,synchronizeCardLifetimes,targetBindingValid,type TargetBinding} from './cardLifetime';
import {getDuelCard} from './effectRegistry';

export const JOWGEN_THE_SPIRITUALIST_ID='41855169';
export type JowgenCardInfo={kind:'monster'|'spell'|'trap';effect?:'jowgen';name?:string};
export type JowgenLookup=(id:string)=>JowgenCardInfo|undefined;
export type JowgenNegation=(duel:TagDuel,uid:string)=>boolean;
export type RandomHandIndex=(length:number)=>number;
type Team=0|1;
type Seat=0|1|2|3;
type SpecialRecord={uid:string;cardId:string;team:Team;ownerSeat:Seat|null;binding:TargetBinding};
type SummonEvent={eventId:string;uid:string;turn:number;method:'normal'|'special'};
type SummonReceipt={event:SummonEvent;replayed:boolean};
type JowgenPlan={activationId:string;sourceUid:string;sourceOwnerSeat:Seat;controllerTeam:Team;actorSeat:Seat;turn:number;privateDiscardedUid:string};
export type JowgenWipeResult={
 activationId:string;status:'destroyed'|'resolved'|'activation-negated'|'effect-negated';
 destroyedUids:string[];privateDiscardedUid:string;activationNegated?:boolean;effectNegated?:boolean;replayed:boolean
};
export type JowgenSession={
 duel:TagDuel;
 specialSummons:Record<string,SpecialRecord>;
 summonReceipts:Record<string,SummonReceipt>;
 activations:Record<string,JowgenPlan>;
 receipts:Record<string,JowgenWipeResult>
};

const defaultLookup:JowgenLookup=(id)=>{
 if(id===JOWGEN_THE_SPIRITUALIST_ID)return {kind:'monster',effect:'jowgen',name:'Jowgen the Spiritualist'};
 const card=getDuelCard(id);
 return card?{kind:card.kind,name:card.englishName||card.name}:undefined;
};
const noNegation:JowgenNegation=()=>false;
const secureRandomIndex:RandomHandIndex=(length)=>randomInt(length);
type PrivateZone='hand'|'deck';
const teamForSeat=(seat:Seat):Team=>(seat%2) as Team;

function assertSeat(value:unknown):asserts value is Seat{
 if(!Number.isInteger(value)||Number(value)<0||Number(value)>3)throw new Error('Assento físico inválido.');
}
function physicalSeat(uid:string):Seat|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as Seat:null;
}
function assertId(value:string,label:string,max=128):void{
 if(typeof value!=='string'||!value.trim()||value.length>max||!/^[a-zA-Z0-9:_-]+$/.test(value)||
  ['__proto__','constructor','prototype'].includes(value))throw new Error(label+' inválido.');
}
function assertJowgenRules(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 assertTagDuel(duel);
 if(!duel.core.teamRotation||duel.core.players.length!==2||duel.members.length!==4||duel.active.length!==2){
  throw new Error('Estrutura física TagDuel incompleta.');
 }
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('O adapter exige Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra Deck 5.');
 }
 const extraUids=new Set<string>();
 for(const player of duel.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('A equipe excedeu três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('A equipe excedeu três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const card of tagInventory(duel).filter(item=>item.entityKind!=='token')){
  const owner=physicalSeat(card.uid);
  if(owner===null)throw new Error('Carta sem proprietário físico m0–m3.');
  const metadata=getDuelCard(card.id);
  if(extraUids.has(card.uid)||!!metadata?.fusion)extra[owner]++;else main[owner]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A mão pode exceder seis durante a resolução; o descarte é tratado na End Phase.
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(item=>item.entityKind!=='token')){
  if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
  result.set(card.uid,card.id);
 }
 return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('O adapter alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('O adapter alterou a identidade física: '+uid);
}
function findMonster(duel:TagDuel,uid:string):{team:Team;monster:Monster}|undefined{
 for(const team of [0,1] as const){
  const monster=duel.core.players[team].monsters.find(card=>card.uid===uid);
  if(monster)return {team,monster};
 }
 return undefined;
}
function privateZone(duel:TagDuel,seat:Seat,zone:PrivateZone):CardRef[]{
 const team=teamForSeat(seat);
 if(duel.active[team]===seat)return duel.core.players[team][zone];
 const held=duel.reserves[String(seat)];
 if(!held)throw new Error('Zona privada do proprietário físico não encontrada.');
 return held[zone];
}
function syncSpecialSummons(session:JowgenSession):void{
 synchronizeCardLifetimes(session.duel.core);
 for(const [uid,record] of Object.entries(session.specialSummons)){
  const found=findMonster(session.duel,uid);
  const binding=bindTarget(session.duel.core,uid);
  if(!found||found.monster.id!==record.cardId||!binding||binding.zone!=='monsters'||
   !targetBindingValid(session.duel.core,record.binding)){
   delete session.specialSummons[uid];
   continue;
  }
  record.team=found.team;
 }
}
function hasFaceUpJowgen(duel:TagDuel,lookup:JowgenLookup,isNegated:JowgenNegation):boolean{
 for(const team of [0,1] as const){
  for(const monster of duel.core.players[team].monsters){
   if(monster.faceUp&&lookup(monster.id)?.effect==='jowgen'&&!isNegated(duel,monster.uid))return true;
  }
 }
 return false;
}
function mainPriority(duel:TagDuel,actorSeat:Seat):boolean{
 const team=teamForSeat(actorSeat),core=duel.core;
 return duel.active[team]===actorSeat&&duel.cursor===actorSeat&&core.current===team&&core.phase==='main'&&
  core.pending.kind==='none'&&core.chain.length===0&&core.turnEnding!==true&&!core.choice&&core.priority===team;
}
function sameSummonEvent(a:SummonEvent,b:SummonEvent):boolean{
 return a.eventId===b.eventId&&a.uid===b.uid&&a.turn===b.turn&&a.method===b.method;
}
function samePlan(a:JowgenPlan,b:JowgenPlan):boolean{
 return a.sourceUid===b.sourceUid&&a.actorSeat===b.actorSeat&&a.turn===b.turn;
}

export function createJowgenAdapter(
 lookup:JowgenLookup=defaultLookup,
 isNegated:JowgenNegation=noNegation,
 randomIndex:RandomHandIndex=secureRandomIndex
){
 return {
  createSession(duel:TagDuel,initialSpecialSummonedUids:string[]=[]):JowgenSession{
   assertJowgenRules(duel);
   synchronizeCardLifetimes(duel.core);
   const session:JowgenSession={duel,specialSummons:{},summonReceipts:{},activations:{},receipts:{}};
   for(const uid of initialSpecialSummonedUids){
    assertId(uid,'UID de Invocação-Especial');
    const found=findMonster(duel,uid),binding=bindTarget(duel.core,uid);
    if(!found||!binding||binding.zone!=='monsters')throw new Error('Histórico inicial aponta para monstro fora do campo.');
    session.specialSummons[uid]={uid,cardId:found.monster.id,team:found.team,ownerSeat:physicalSeat(uid),binding};
   }
   return session;
  },
  recordMonsterSummon(
   session:JowgenSession,event:SummonEvent
  ):{replayed:boolean}{
   assertJowgenRules(session.duel);
   assertId(event.eventId,'Identificador do evento');assertId(event.uid,'UID do monstro');
   if(!Number.isSafeInteger(event.turn)||event.turn!==session.duel.core.turn||
    (event.method!=='normal'&&event.method!=='special'))throw new Error('Evento de Invocação inválido.');
   const previous=session.summonReceipts[event.eventId];
   if(previous){
    if(!sameSummonEvent(previous.event,event))throw new Error('Evento de Invocação reutilizado com conteúdo diferente.');
    return {replayed:true};
   }
   const before=inventorySnapshot(session.duel);
   synchronizeCardLifetimes(session.duel.core);
   const found=findMonster(session.duel,event.uid),binding=bindTarget(session.duel.core,event.uid);
   if(!found||!binding||binding.zone!=='monsters')throw new Error('Monstro não está em uma Monster Zone.');
   if(event.method==='special'){
    const ownerSeat=physicalSeat(event.uid);
    if(ownerSeat===null&&found.monster.entityKind!=='token')throw new Error('Monstro sem proprietário físico.');
    session.specialSummons[event.uid]={uid:event.uid,cardId:found.monster.id,team:found.team,ownerSeat,binding};
   }else delete session.specialSummons[event.uid];
   session.summonReceipts[event.eventId]={event:{...event},replayed:false};
   assertSameInventory(before,session.duel);
   return {replayed:false};
  },
  canSpecialSummon(duel:TagDuel):boolean{
   assertJowgenRules(duel);
   return !hasFaceUpJowgen(duel,lookup,isNegated);
  },
  activateJowgenWipe(
   session:JowgenSession,input:{activationId:string;sourceUid:string;actorSeat:Seat;turn:number}
  ):{activationId:string;sourceUid:string;costPaid:true;privateDiscardedUid:string;replayed:boolean}{
   assertJowgenRules(session.duel);
   assertId(input.activationId,'Identificador de ativação');assertId(input.sourceUid,'UID do Jowgen');assertSeat(input.actorSeat);
   if(!Number.isSafeInteger(input.turn)||input.turn!==session.duel.core.turn||!mainPriority(session.duel,input.actorSeat)){
    throw new Error('Jowgen só pode ativar na Main Phase da equipe ativa.');
   }
   const prior=session.activations[input.activationId];
   if(prior){
    if(!samePlan(prior,{...prior,sourceUid:input.sourceUid,actorSeat:input.actorSeat,turn:input.turn})){
     throw new Error('Ativação de Jowgen reutilizada.');
    }
    return {activationId:input.activationId,sourceUid:input.sourceUid,costPaid:true,privateDiscardedUid:prior.privateDiscardedUid,replayed:true};
   }
   if(session.receipts[input.activationId])throw new Error('Identificador de ativação já resolvido.');
   const found=findMonster(session.duel,input.sourceUid);
   if(!found||!found.monster.faceUp||lookup(found.monster.id)?.effect!=='jowgen')throw new Error('Fonte não é Jowgen face-up.');
   const team=teamForSeat(input.actorSeat);
   if(found.team!==team)throw new Error('Jowgen não é controlado pela equipe ativa.');
   if(isNegated(session.duel,input.sourceUid))throw new Error('Efeito de Jowgen está negado.');
   const hand=privateZone(session.duel,input.actorSeat,'hand');
   if(!hand.length)throw new Error('Jowgen exige uma carta na mão privada do assento ativo.');
   const index=randomIndex(hand.length);
   if(!Number.isInteger(index)||index<0||index>=hand.length)throw new Error('Índice aleatório fora da mão.');
   const before=inventorySnapshot(session.duel);
   const [discarded]=hand.splice(index,1);
   session.duel.core.players[team].grave.push(discarded);
   const ownerSeat=physicalSeat(input.sourceUid);
   if(ownerSeat===null)throw new Error('Jowgen sem proprietário físico.');
   session.activations[input.activationId]={
    activationId:input.activationId,sourceUid:input.sourceUid,sourceOwnerSeat:ownerSeat,
    controllerTeam:team,actorSeat:input.actorSeat,turn:input.turn,privateDiscardedUid:discarded.uid
   };
   assertSameInventory(before,session.duel);
   return {activationId:input.activationId,sourceUid:input.sourceUid,costPaid:true,privateDiscardedUid:discarded.uid,replayed:false};
  },
  resolveJowgenWipe(
   session:JowgenSession,input:{activationId:string;activationNegated?:boolean;effectNegated?:boolean}
  ):JowgenWipeResult{
   assertJowgenRules(session.duel);
   assertId(input.activationId,'Identificador de ativação');
   if(input.activationNegated!==undefined&&typeof input.activationNegated!=='boolean'||
    input.effectNegated!==undefined&&typeof input.effectNegated!=='boolean')throw new Error('Estado de negação inválido.');
   const previous=session.receipts[input.activationId];
   if(previous){
    if(previous.activationNegated!==(input.activationNegated===true)||previous.effectNegated!==(input.effectNegated===true)){
     throw new Error('Resolução de Jowgen reutilizada com resultado diferente.');
    }
    return {...previous,destroyedUids:[...previous.destroyedUids],replayed:true};
   }
   const plan=session.activations[input.activationId];
   if(!plan)throw new Error('Ativação de Jowgen não encontrada.');
   const before=inventorySnapshot(session.duel),destroyedUids:string[]=[];
   if(!input.activationNegated&&!input.effectNegated){
    syncSpecialSummons(session);
    for(const uid of Object.keys(session.specialSummons)){
     const found=findMonster(session.duel,uid);
     if(!found){delete session.specialSummons[uid];continue;}
     const monsters=session.duel.core.players[found.team].monsters,index=monsters.findIndex(card=>card.uid===uid);
     if(index<0){delete session.specialSummons[uid];continue;}
     const [monster]=monsters.splice(index,1);
     if(monster.entityKind!=='token'){
      session.duel.core.players[found.team].grave.push({uid:monster.uid,id:monster.id,...(monster.properlySummoned?{properlySummoned:true}:{})});
     }
     destroyedUids.push(uid);
     delete session.specialSummons[uid];
    }
    synchronizeCardLifetimes(session.duel.core);
   }
   assertSameInventory(before,session.duel);
   const result:JowgenWipeResult={
    activationId:input.activationId,
    status:input.activationNegated?'activation-negated':input.effectNegated?'effect-negated':destroyedUids.length?'destroyed':'resolved',
    destroyedUids,privateDiscardedUid:plan.privateDiscardedUid,
    activationNegated:input.activationNegated===true,effectNegated:input.effectNegated===true,replayed:false
   };
   session.receipts[input.activationId]=result;
   return result;
  }
 };
}
