import type {CardRef,Monster} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {bindTarget,synchronizeCardLifetimes,targetBindingValid,type TargetBinding} from './cardLifetime';
import {getDuelCard} from './effectRegistry';

export const ROYAL_MAGICAL_LIBRARY_ID='70791313';
export const SKILLED_DARK_MAGICIAN_ID='73752131';
export const SKILLED_WHITE_MAGICIAN_ID='46363422';
export const DARK_MAGICIAN_ID='46986414';
export const BUSTER_BLADER_ID='78193831';

export type SpellCounterEffect='royal-library'|'skilled-dark'|'skilled-white';
export type SpellCounterCardInfo={
 kind:'monster'|'spell'|'trap';
 effect?:SpellCounterEffect;
 name?:string;
 atk?:number|null;
 defense?:number|null;
 level?:number|null;
};
export type SpellCounterLookup=(id:string)=>SpellCounterCardInfo|undefined;
export type SpellCounterNegation=(duel:TagDuel,uid:string)=>boolean;
type Team=0|1;
type Seat=0|1|2|3;
type PrivateZone='hand'|'deck';
type CounterEntry={uid:string;cardId:string;ownerSeat:Seat;controllerTeam:Team;binding:TargetBinding;count:number};
type SpellResolutionEvent={
 eventId:string;spellUid:string;spellId:string;activatingSeat:Seat;turn:number;activationZone:'hand'|'backrow';
 resolved:boolean;activationNegated?:boolean;effectNegated?:boolean
};
type SpellResolutionReceipt={
 event:SpellResolutionEvent;addedUids:string[];replayed:boolean
};
type LibraryPlan={
 activationId:string;sourceUid:string;sourceOwnerSeat:Seat;controllerTeam:Team;actorSeat:Seat;turn:number
};
type SkilledEffect='skilled-dark'|'skilled-white';
type SkilledPlan=LibraryPlan&{effect:SkilledEffect;targetName:'Dark Magician'|'Buster Blader'};
export type LibraryDrawResult={
 activationId:string;status:'drawn'|'activation-negated'|'effect-negated'|'deck-empty';
 costPaid:3;drawnUid?:string;activationNegated?:boolean;effectNegated?:boolean;replayed:boolean
};
export type SkilledSummonResult={
 activationId:string;status:'summoned'|'activation-negated'|'effect-negated'|'no-target'|'zone-full';
 tributeUid:string;targetUid?:string;targetFrom?:'hand'|'deck'|'grave';requestedTargetUid?:string;activationNegated?:boolean;effectNegated?:boolean;replayed:boolean
};
export type SpellCounterSession={
 duel:TagDuel;
 counters:Record<string,CounterEntry>;
 spellReceipts:Record<string,SpellResolutionReceipt>;
 libraryActivations:Record<string,LibraryPlan>;
 libraryReceipts:Record<string,LibraryDrawResult>;
 skilledActivations:Record<string,SkilledPlan>;
 skilledReceipts:Record<string,SkilledSummonResult>
};

const defaultLookup:SpellCounterLookup=(id)=>{
 if(id===ROYAL_MAGICAL_LIBRARY_ID)return {kind:'monster',effect:'royal-library',name:'Royal Magical Library',atk:0,defense:2000,level:4};
 if(id===SKILLED_DARK_MAGICIAN_ID)return {kind:'monster',effect:'skilled-dark',name:'Skilled Dark Magician',atk:1900,defense:1700,level:4};
 if(id===SKILLED_WHITE_MAGICIAN_ID)return {kind:'monster',effect:'skilled-white',name:'Skilled White Magician',atk:1700,defense:1900,level:4};
 const card=getDuelCard(id);
 return card?{kind:card.kind,name:card.englishName||card.name,atk:card.atk,defense:card.defense,level:card.level}:undefined;
};
const noNegation:SpellCounterNegation=()=>false;
const teamForSeat=(seat:Seat):Team=>(seat%2) as Team;

function assertSeat(value:unknown):asserts value is Seat{
 if(!Number.isInteger(value)||Number(value)<0||Number(value)>3)throw new Error('Assento físico inválido.');
}
function physicalSeat(uid:string):Seat|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as Seat:null;
}
function assertId(value:string,label:string,max=128):void{
 if(typeof value!=='string'||!value.trim()||value.length>max||!/^[a-zA-Z0-9:_-]+$/.test(value)||['__proto__','constructor','prototype'].includes(value)){
  throw new Error(label+' inválido.');
 }
}
function assertClassic(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 assertTagDuel(duel);
 if(!duel.core.teamRotation||duel.core.players.length!==2||duel.members.length!==4||duel.active.length!==2||!Array.isArray(duel.core.chain)){
  throw new Error('Estrutura física TagDuel incompleta.');
 }
}
export function assertSpellCounterRules(duel:TagDuel):void{
 assertClassic(duel);
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
 // A mão pode exceder seis durante a resolução; o descarte pertence à End Phase.
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
function syncCounters(session:SpellCounterSession):void{
 synchronizeCardLifetimes(session.duel.core);
 for(const [uid,entry] of Object.entries(session.counters)){
  const found=findMonster(session.duel,uid);
  const binding=bindTarget(session.duel.core,uid);
  if(!found||!found.monster.faceUp||found.monster.id!==entry.cardId||!binding||
   !targetBindingValid(session.duel.core,entry.binding)||binding.zone!=='monsters'){
   delete session.counters[uid];
   continue;
  }
  entry.controllerTeam=found.team;
 }
}
function findCounterSource(
 duel:TagDuel,uid:string,lookup:SpellCounterLookup
):{team:Team;monster:Monster;ownerSeat:Seat;effect:SpellCounterEffect}|undefined{
 const found=findMonster(duel,uid);
 if(!found||!found.monster.faceUp)return;
 const info=lookup(found.monster.id);
 if(info?.kind!=='monster'||!info.effect)return;
 const ownerSeat=physicalSeat(uid);
 if(ownerSeat===null)throw new Error('Fonte sem proprietário físico.');
 return {team:found.team,monster:found.monster,ownerSeat,effect:info.effect};
}
function mainPriority(duel:TagDuel,actorSeat:Seat):boolean{
 const team=teamForSeat(actorSeat),core=duel.core;
 return duel.active[team]===actorSeat&&duel.cursor===actorSeat&&core.current===team&&core.phase==='main'&&
  core.pending.kind==='none'&&core.chain.length===0&&core.turnEnding!==true&&!core.choice&&core.priority===team;
}
function sameSpellEvent(a:SpellResolutionEvent,b:SpellResolutionEvent):boolean{
 return a.eventId===b.eventId&&a.spellUid===b.spellUid&&a.spellId===b.spellId&&a.activatingSeat===b.activatingSeat&&
  a.turn===b.turn&&a.activationZone===b.activationZone&&a.resolved===b.resolved&&a.activationNegated===b.activationNegated&&a.effectNegated===b.effectNegated;
}
function sourceForActivation(
 session:SpellCounterSession,uid:string,actorSeat:Seat,expected:SpellCounterEffect,
 lookup:SpellCounterLookup,isNegated:SpellCounterNegation
):{team:Team;monster:Monster;ownerSeat:Seat;binding:TargetBinding}{
 assertId(uid,'UID da fonte');
 const found=findCounterSource(session.duel,uid,lookup);
 if(!found||found.effect!==expected)throw new Error('A fonte não corresponde ao efeito solicitado.');
 const team=teamForSeat(actorSeat);
 if(found.team!==team)throw new Error('A fonte não é controlada pela equipe ativa.');
 if(isNegated(session.duel,uid))throw new Error('O efeito da fonte está negado.');
 const binding=bindTarget(session.duel.core,uid);
 if(!binding||binding.zone!=='monsters')throw new Error('A fonte perdeu sua identidade de campo.');
 return {team,monster:found.monster,ownerSeat:found.ownerSeat,binding};
}
function assertActivationId(id:string):void{assertId(id,'Identificador de ativação');}
function skilledTargetName(effect:SkilledEffect):'Dark Magician'|'Buster Blader'{
 return effect==='skilled-dark'?'Dark Magician':'Buster Blader';
}
type LocatedTarget={zone:'hand'|'deck'|'grave';list:CardRef[];index:number;card:CardRef};
function locateSkilledTarget(
 duel:TagDuel,team:Team,actorSeat:Seat,targetUid:string,targetName:string,lookup:SpellCounterLookup
):LocatedTarget|undefined{
 const owner=physicalSeat(targetUid);
 if(owner===null)return;
 const hand=privateZone(duel,actorSeat,'hand');
 const handIndex=hand.findIndex(card=>card.uid===targetUid);
 if(handIndex>=0){
  if(owner!==actorSeat)return;
  const card=hand[handIndex],info=lookup(card.id);
  if(info?.kind!=='monster'||info.name!==targetName)return;
  return {zone:'hand',list:hand,index:handIndex,card};
 }
 const deck=privateZone(duel,actorSeat,'deck');
 const deckIndex=deck.findIndex(card=>card.uid===targetUid);
 if(deckIndex>=0){
  if(owner!==actorSeat)return;
  const card=deck[deckIndex],info=lookup(card.id);
  if(info?.kind!=='monster'||info.name!==targetName)return;
  return {zone:'deck',list:deck,index:deckIndex,card};
 }
 const grave=duel.core.players[team].grave;
 const graveIndex=grave.findIndex(card=>card.uid===targetUid);
 if(graveIndex>=0){
  if(owner%2!==team)return;
  const card=grave[graveIndex],info=lookup(card.id);
  if(info?.kind!=='monster'||info.name!==targetName)return;
  return {zone:'grave',list:grave,index:graveIndex,card};
 }
 return;
}

export function createSpellCounterAdapter(
 lookup:SpellCounterLookup=defaultLookup,
 isNegated:SpellCounterNegation=noNegation
){
 return {
  createSession(duel:TagDuel):SpellCounterSession{
   assertSpellCounterRules(duel);
   synchronizeCardLifetimes(duel.core);
   return {duel,counters:{},spellReceipts:{},libraryActivations:{},libraryReceipts:{},skilledActivations:{},skilledReceipts:{}};
  },
  onSpellResolved(session:SpellCounterSession,event:SpellResolutionEvent):{addedUids:string[];replayed:boolean}{
   assertSpellCounterRules(session.duel);
   if(!event||typeof event!=='object')throw new Error('Evento de resolução de Magia inválido.');
   assertId(event.eventId,'Identificador do evento');
   assertId(event.spellUid,'UID da Magia');
   assertId(event.spellId,'ID da Magia',16);
   assertSeat(event.activatingSeat);
   if(!Number.isSafeInteger(event.turn)||event.turn!==session.duel.core.turn)throw new Error('Turno do evento de Magia inválido.');
   if(event.activationZone!=='hand'&&event.activationZone!=='backrow')throw new Error('Zona de ativação da Magia inválida.');
   if(typeof event.resolved!=='boolean'||event.activationNegated!==undefined&&typeof event.activationNegated!=='boolean'||
    event.effectNegated!==undefined&&typeof event.effectNegated!=='boolean')throw new Error('Resultado de resolução de Magia inválido.');
   const receipt=session.spellReceipts[event.eventId];
   if(receipt){
    if(!sameSpellEvent(receipt.event,event))throw new Error('Identificador de evento reutilizado com conteúdo diferente.');
    return {addedUids:[...receipt.addedUids],replayed:true};
   }
   const before=inventorySnapshot(session.duel);
   if(!tagInventory(session.duel).some(card=>card.uid===event.spellUid&&card.id===event.spellId)||
    lookup(event.spellId)?.kind!=='spell')throw new Error('A fonte do evento não é uma Magia física do duelo.');
   const addedUids:string[]=[];
   if(event.resolved&&event.activationNegated!==true){
    syncCounters(session);
    for(const team of [0,1] as const){
     for(const monster of session.duel.core.players[team].monsters){
      if(!monster.faceUp||isNegated(session.duel,monster.uid))continue;
      const info=lookup(monster.id);
      if(info?.kind!=='monster'||!info.effect)continue;
      const ownerSeat=physicalSeat(monster.uid);
      if(ownerSeat===null)throw new Error('Monstro com contador sem proprietário físico.');
      const binding=bindTarget(session.duel.core,monster.uid);
      if(!binding||binding.zone!=='monsters')continue;
      let entry=session.counters[monster.uid];
      if(!entry||entry.cardId!==monster.id||!targetBindingValid(session.duel.core,entry.binding)){
       entry={uid:monster.uid,cardId:monster.id,ownerSeat,controllerTeam:team,binding,count:0};
       session.counters[monster.uid]=entry;
      }
      if(entry.count<3){entry.count++;addedUids.push(monster.uid);}
     }
    }
   }
   assertSameInventory(before,session.duel);
   session.spellReceipts[event.eventId]={event:{...event},addedUids:[...addedUids],replayed:false};
   return {addedUids,replayed:false};
  },
  counterCount(session:SpellCounterSession,uid:string):number{
   assertId(uid,'UID da fonte');
   syncCounters(session);
   return session.counters[uid]?.count??0;
  },
  activateLibraryDraw(
   session:SpellCounterSession,input:{activationId:string;sourceUid:string;actorSeat:Seat;turn:number}
  ):{activationId:string;sourceUid:string;costPaid:3;replayed:boolean}{
   assertSpellCounterRules(session.duel);
   assertActivationId(input.activationId);assertId(input.sourceUid,'UID da Biblioteca');assertSeat(input.actorSeat);
   if(!Number.isSafeInteger(input.turn)||input.turn!==session.duel.core.turn||!mainPriority(session.duel,input.actorSeat)){
    throw new Error('A Biblioteca só pode ativar na Main Phase da equipe ativa.');
   }
   const prior=session.libraryActivations[input.activationId];
   if(prior){
    if(prior.sourceUid!==input.sourceUid||prior.actorSeat!==input.actorSeat||prior.turn!==input.turn)throw new Error('Ativação da Biblioteca reutilizada.');
    return {activationId:input.activationId,sourceUid:input.sourceUid,costPaid:3,replayed:true};
   }
   if(session.libraryReceipts[input.activationId])return {activationId:input.activationId,sourceUid:input.sourceUid,costPaid:3,replayed:true};
   if(session.skilledActivations[input.activationId]||session.skilledReceipts[input.activationId])throw new Error('Identificador de ativação já utilizado.');
   syncCounters(session);
   const source=sourceForActivation(session,input.sourceUid,input.actorSeat,'royal-library',lookup,isNegated);
   const entry=session.counters[input.sourceUid];
   if(!entry||entry.count<3)throw new Error('A Biblioteca exige três Marcadores de Magia.');
   const before=inventorySnapshot(session.duel);
   entry.count-=3;
   session.libraryActivations[input.activationId]={activationId:input.activationId,sourceUid:input.sourceUid,sourceOwnerSeat:source.ownerSeat,controllerTeam:source.team,actorSeat:input.actorSeat,turn:input.turn};
   assertSameInventory(before,session.duel);
   return {activationId:input.activationId,sourceUid:input.sourceUid,costPaid:3,replayed:false};
  },
  resolveLibraryDraw(
   session:SpellCounterSession,input:{activationId:string;activationNegated?:boolean;effectNegated?:boolean}
  ):LibraryDrawResult{
   assertSpellCounterRules(session.duel);
   assertActivationId(input.activationId);
   if(input.activationNegated!==undefined&&typeof input.activationNegated!=='boolean'||
    input.effectNegated!==undefined&&typeof input.effectNegated!=='boolean')throw new Error('Estado de negação inválido.');
   const previous=session.libraryReceipts[input.activationId];
   if(previous){
    if(previous.activationNegated!==(input.activationNegated===true)||previous.effectNegated!==(input.effectNegated===true))throw new Error('Resolução da Biblioteca reutilizada com resultado diferente.');
    return {...previous,replayed:true};
   }
   const plan=session.libraryActivations[input.activationId];
   if(!plan)throw new Error('Ativação da Biblioteca não encontrada.');
   const before=inventorySnapshot(session.duel);
   let result:LibraryDrawResult;
   if(input.activationNegated)result={activationId:input.activationId,status:'activation-negated',costPaid:3,replayed:false};
   else if(input.effectNegated)result={activationId:input.activationId,status:'effect-negated',costPaid:3,replayed:false};
   else{
    const deck=privateZone(session.duel,plan.actorSeat,'deck');
    if(!deck.length)result={activationId:input.activationId,status:'deck-empty',costPaid:3,replayed:false};
    else{
     const [card]=deck.splice(0,1);
     privateZone(session.duel,plan.actorSeat,'hand').push(card);
     result={activationId:input.activationId,status:'drawn',costPaid:3,drawnUid:card.uid,replayed:false};
    }
   }
   result.activationNegated=input.activationNegated===true;
   result.effectNegated=input.effectNegated===true;
   assertSameInventory(before,session.duel);
   session.libraryReceipts[input.activationId]=result;
   return result;
  },
  activateSkilledSummon(
   session:SpellCounterSession,input:{activationId:string;sourceUid:string;actorSeat:Seat;turn:number}
  ):{activationId:string;sourceUid:string;costPaid:3;replayed:boolean}{
   assertSpellCounterRules(session.duel);
   assertActivationId(input.activationId);assertId(input.sourceUid,'UID do Mago Habilidoso');assertSeat(input.actorSeat);
   if(!Number.isSafeInteger(input.turn)||input.turn!==session.duel.core.turn||!mainPriority(session.duel,input.actorSeat)){
    throw new Error('O Mago Habilidoso só pode ativar na Main Phase da equipe ativa.');
   }
   const prior=session.skilledActivations[input.activationId];
   if(prior){
    if(prior.sourceUid!==input.sourceUid||prior.actorSeat!==input.actorSeat||prior.turn!==input.turn)throw new Error('Ativação do Mago Habilidoso reutilizada.');
    return {activationId:input.activationId,sourceUid:input.sourceUid,costPaid:3,replayed:true};
   }
   if(session.skilledReceipts[input.activationId])return {activationId:input.activationId,sourceUid:input.sourceUid,costPaid:3,replayed:true};
   if(session.libraryActivations[input.activationId]||session.libraryReceipts[input.activationId])throw new Error('Identificador de ativação já utilizado.');
   syncCounters(session);
   const found=findCounterSource(session.duel,input.sourceUid,lookup);
   if(!found||(found.effect!=='skilled-dark'&&found.effect!=='skilled-white'))throw new Error('A fonte não é um Mago Habilidoso.');
   const team=teamForSeat(input.actorSeat);
   if(found.team!==team)throw new Error('A fonte não é controlada pela equipe ativa.');
   if(isNegated(session.duel,input.sourceUid))throw new Error('O efeito da fonte está negado.');
   const entry=session.counters[input.sourceUid];
   if(!entry||entry.count<3)throw new Error('O Mago Habilidoso exige três Marcadores de Magia.');
   const binding=bindTarget(session.duel.core,input.sourceUid);
   if(!binding||binding.zone!=='monsters')throw new Error('A fonte perdeu sua identidade de campo.');
   const before=inventorySnapshot(session.duel);
   const monsters=session.duel.core.players[team].monsters;
   const index=monsters.findIndex(monster=>monster.uid===input.sourceUid);
   if(index<0)throw new Error('O Mago Habilidoso saiu do campo antes do Tributo.');
   const [tribute]=monsters.splice(index,1);
   session.duel.core.players[team].grave.push({uid:tribute.uid,id:tribute.id,...(tribute.properlySummoned?{properlySummoned:true}:{})});
   delete session.counters[input.sourceUid];
   synchronizeCardLifetimes(session.duel.core);
   const effect=found.effect as SkilledEffect;
   session.skilledActivations[input.activationId]={
    activationId:input.activationId,sourceUid:input.sourceUid,sourceOwnerSeat:found.ownerSeat,
    controllerTeam:team,actorSeat:input.actorSeat,turn:input.turn,effect,targetName:skilledTargetName(effect)
   };
   assertSameInventory(before,session.duel);
   return {activationId:input.activationId,sourceUid:input.sourceUid,costPaid:3,replayed:false};
  },
  resolveSkilledSummon(
   session:SpellCounterSession,input:{activationId:string;targetUid?:string;activationNegated?:boolean;effectNegated?:boolean}
  ):SkilledSummonResult{
   assertSpellCounterRules(session.duel);
   assertActivationId(input.activationId);
   if(input.targetUid!==undefined)assertId(input.targetUid,'UID do alvo');
   if(input.activationNegated!==undefined&&typeof input.activationNegated!=='boolean'||
    input.effectNegated!==undefined&&typeof input.effectNegated!=='boolean')throw new Error('Estado de negação inválido.');
   const previous=session.skilledReceipts[input.activationId];
   if(previous){
    if(previous.requestedTargetUid!==input.targetUid||previous.activationNegated!==(input.activationNegated===true)||
     previous.effectNegated!==(input.effectNegated===true))throw new Error('Resolução do Mago Habilidoso reutilizada com resultado diferente.');
    return {...previous,replayed:true};
   }
   const plan=session.skilledActivations[input.activationId];
   if(!plan)throw new Error('Ativação do Mago Habilidoso não encontrada.');
   const before=inventorySnapshot(session.duel);
   let result:SkilledSummonResult;
   if(input.activationNegated)result={activationId:input.activationId,status:'activation-negated',tributeUid:plan.sourceUid,replayed:false};
   else if(input.effectNegated)result={activationId:input.activationId,status:'effect-negated',tributeUid:plan.sourceUid,replayed:false};
   else if(!input.targetUid)result={activationId:input.activationId,status:'no-target',tributeUid:plan.sourceUid,replayed:false};
   else{
    const target=locateSkilledTarget(session.duel,plan.controllerTeam,plan.actorSeat,input.targetUid,plan.targetName,lookup);
    if(!target)result={activationId:input.activationId,status:'no-target',tributeUid:plan.sourceUid,replayed:false};
    else if(session.duel.core.players[plan.controllerTeam].monsters.length>=RULES_PROFILE.monsterZones){
     result={activationId:input.activationId,status:'zone-full',tributeUid:plan.sourceUid,replayed:false};
    }else{
     const [card]=target.list.splice(target.index,1);
     const monster:Monster={
      ...card,position:'atk',faceUp:true,entered:plan.turn,lastSummonedTurn:plan.turn,changed:plan.turn,
      attacked:0,atkBoost:0,defBoost:0,owner:plan.controllerTeam
     };
     session.duel.core.players[plan.controllerTeam].monsters.push(monster);
     synchronizeCardLifetimes(session.duel.core);
     result={activationId:input.activationId,status:'summoned',tributeUid:plan.sourceUid,targetUid:card.uid,targetFrom:target.zone,replayed:false};
    }
   }
   result.requestedTargetUid=input.targetUid;
   result.activationNegated=input.activationNegated===true;
   result.effectNegated=input.effectNegated===true;
   assertSameInventory(before,session.duel);
   session.skilledReceipts[input.activationId]=result;
   return result;
  }
 };
}
