import type {Backrow,CardRef} from './duelEngine';
import {getDuelCard} from './effectRegistry';
import {rulesFor} from './rulesProfile';
import {assertTagDuel,tagDecisionMember,tagInventory,type TagDuel} from './tagDuel';
import {synchronizeCardLifetimes} from './cardLifetime';

export const HARPIES_FEATHER_DUSTER_ID='18144506';
export const HEAVY_STORM_ID='19613556';
export const GIANT_TRUNADE_ID='42703248';

export type MassBackrowEffect='harpie-feather-duster'|'heavy-storm'|'giant-trunade';
export type MassBackrowCardInfo={kind:'monster'|'spell'|'trap';effect?:MassBackrowEffect};
export type MassBackrowLookup=(id:string)=>MassBackrowCardInfo|undefined;
export type MassBackrowLeaveReason='destroy'|'return';
export type MassBackrowLeaveEvent={
 uid:string;cardId:string;ownerSeat:Seat;ownerTeam:Team;controllerTeam:Team;
 zone:'backrow'|'field';reason:MassBackrowLeaveReason;card:Backrow
};
export type MassBackrowLeaveHandler=(duel:TagDuel,event:MassBackrowLeaveEvent)=>void;
type Seat=0|1|2|3;
type Team=0|1;
type Location={team:Team;zone:'backrow'|'field';card:Backrow};
type Plan={
 activationId:string;sourceUid:string;sourceCardId:string;effect:MassBackrowEffect;
 sourceOwnerSeat:Seat;controllerTeam:Team;actorSeat:Seat;turn:number
};
type Receipt={
 activationId:string;status:'destroyed'|'returned'|'resolved'|'activation-negated'|'effect-negated';
 destroyedUids:string[];returnedCount:number;activationNegated:boolean;effectNegated:boolean;replayed:boolean
};
export type MassBackrowSession={
 duel:TagDuel;activations:Record<string,Plan>;receipts:Record<string,Receipt>
};
const defaultLookup:MassBackrowLookup=(id)=>{
 if(id===HARPIES_FEATHER_DUSTER_ID)return {kind:'spell',effect:'harpie-feather-duster'};
 if(id===HEAVY_STORM_ID)return {kind:'spell',effect:'heavy-storm'};
 if(id===GIANT_TRUNADE_ID)return {kind:'spell',effect:'giant-trunade'};
 const card=getDuelCard(id);
 return card?{kind:card.kind}:undefined;
};
function physicalSeat(uid:string):Seat|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as Seat:null;
}
function teamForSeat(seat:Seat):Team{return (seat%2) as Team;}
function assertSeat(value:unknown):asserts value is Seat{
 if(!Number.isInteger(value)||Number(value)<0||Number(value)>3)throw new Error('Assento físico inválido.');
}
function assertId(value:string,label:string):void{
 if(typeof value!=='string'||!value.trim()||value.length>128||!/^[a-zA-Z0-9:_-]+$/.test(value)||
  ['__proto__','constructor','prototype'].includes(value))throw new Error(label+' inválido.');
}
function privateHandForSeat(duel:TagDuel,seat:Seat):CardRef[]{
 const team=teamForSeat(seat);
 if(duel.active[team]===seat)return duel.core.players[team].hand;
 const held=duel.reserves[String(seat)];
 if(!held)throw new Error('Mão privada do assento físico não encontrada.');
 return held.hand;
}
function findSpellTrap(core:TagDuel['core'],uid:string):Location|undefined{
 for(const team of [0,1] as const){
  const backrow=core.players[team].backrow.find(card=>card.uid===uid);
  if(backrow)return {team,zone:'backrow',card:backrow};
  const field=core.players[team].field;
  if(field?.uid===uid)return {team,zone:'field',card:field};
 }
 return undefined;
}
function allSpellTraps(core:TagDuel['core']):Location[]{
 const result:Location[]=[];
 for(const team of [0,1] as const){
  for(const card of core.players[team].backrow)result.push({team,zone:'backrow',card});
  const field=core.players[team].field;
  if(field)result.push({team,zone:'field',card:field});
 }
 return result;
}
function removeLocation(core:TagDuel['core'],location:Location):Backrow{
 if(location.zone==='backrow'){
  const list=core.players[location.team].backrow,index=list.findIndex(card=>card.uid===location.card.uid);
  if(index<0)throw new Error('Carta deixou a Spell/Trap Zone antes da movimentação.');
  return list.splice(index,1)[0];
 }
 const field=core.players[location.team].field;
 if(!field||field.uid!==location.card.uid)throw new Error('Carta deixou a Field Zone antes da movimentação.');
 core.players[location.team].field=null;
 return field;
}
function inventorySignature(duel:TagDuel):string{
 return tagInventory(duel).filter(card=>card.entityKind!=='token')
  .map(card=>card.uid+'|'+card.id).sort().join('\n');
}
function assertSameInventory(before:string,duel:TagDuel):void{
 if(before!==inventorySignature(duel))throw new Error('O adapter alterou a identidade ou o inventário físico das cartas.');
}
function isSpellTrapCardId(id:string):boolean{
 const card=getDuelCard(id);return card?.kind==='spell'||card?.kind==='trap';
}
/** Enforces the owner's TagDuel rules without checking the six-card hand limit before End Phase. */
export function assertMassBackrowRules(duel:TagDuel):void{
 assertTagDuel(duel);
 if(duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Perfil de regras incompatível com o proprietário.');
 }
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const ref of tagInventory(duel)){
  if(ref.entityKind==='token')continue;
  const owner=physicalSeat(ref.uid);
  if(owner===null)throw new Error('Carta sem proprietário físico m0–m3.');
  const metadata=getDuelCard(ref.id);
  if(!metadata)throw new Error('Carta sem metadados habilitados no estado de teste.');
  if(metadata.fusion)extra[owner]++;else main[owner]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck principal físico fora de 20–30 no assento '+seat+': '+main[seat]+' cartas; Extra '+extra[seat]+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excede cinco cartas.');
 }
 for(const player of duel.core.players){
  if(player.monsters.length>rules.monsterZones)throw new Error('Equipe excedeu três Monster Zones.');
  if(player.backrow.length>rules.spellTrapZones)throw new Error('Equipe excedeu três Spell/Trap Zones.');
  // The Field Zone is deliberately separate from the three Spell/Trap Zones.
 }
}
function mainPriority(duel:TagDuel,actorSeat:Seat):boolean{
 const actor=tagDecisionMember(duel),team=actor.team,core=duel.core;
 return duel.active[team]===actorSeat&&duel.cursor===actorSeat&&core.current===team&&core.priority===team&&
  core.phase==='main'&&core.pending.kind==='none'&&core.chain.length===0&&core.turnEnding!==true&&
  core.handFlow===undefined&&!core.choice&&core.damageStep!==true;
}
function samePlan(a:Plan,b:Plan):boolean{
 return a.sourceUid===b.sourceUid&&a.sourceCardId===b.sourceCardId&&a.effect===b.effect&&
  a.actorSeat===b.actorSeat&&a.turn===b.turn;
}
function pushToOwnerGrave(duel:TagDuel,ownerSeat:Seat,card:CardRef):void{
 duel.core.players[teamForSeat(ownerSeat)].grave.push({
  uid:card.uid,id:card.id,...(card.properlySummoned?{properlySummoned:true}:{})
 });
}
export function createMassBackrowAdapter(
 lookup:MassBackrowLookup=defaultLookup,
 onLeaveField?:MassBackrowLeaveHandler
){
 return {
  createSession(duel:TagDuel):MassBackrowSession{
   assertMassBackrowRules(duel);
   return {duel,activations:Object.create(null) as Record<string,Plan>,receipts:Object.create(null) as Record<string,Receipt>};
  },
  activate(session:MassBackrowSession,input:{activationId:string;sourceUid:string;actorSeat:Seat;turn:number}):{
   activationId:string;sourceUid:string;effect:MassBackrowEffect;replayed:boolean
  }{
   assertMassBackrowRules(session.duel);
   assertId(input.activationId,'Identificador de ativação');assertId(input.sourceUid,'UID da Magia');assertSeat(input.actorSeat);
   const duel=session.duel,team=teamForSeat(input.actorSeat);
   if(input.turn!==duel.core.turn||!Number.isSafeInteger(input.turn)||!mainPriority(duel,input.actorSeat)){
    throw new Error('A Magia só pode ser ativada na Main Phase do assento ativo.');
   }
   const previous=session.activations[input.activationId];
   if(previous){
    if(!samePlan(previous,{...previous,sourceUid:input.sourceUid,actorSeat:input.actorSeat,turn:input.turn})){
     throw new Error('Identificador de ativação reutilizado com conteúdo diferente.');
    }
    return {activationId:input.activationId,sourceUid:input.sourceUid,effect:previous.effect,replayed:true};
   }
   if(session.receipts[input.activationId])throw new Error('Identificador de ativação já resolvido.');
   const hand=privateHandForSeat(duel,input.actorSeat),index=hand.findIndex(card=>card.uid===input.sourceUid);
   if(index<0)throw new Error('A Magia precisa estar na mão privada do assento ativo.');
   const source=hand[index],sourceOwnerSeat=physicalSeat(source.uid),info=lookup(source.id);
   if(sourceOwnerSeat!==input.actorSeat||!info||info.kind!=='spell'||!info.effect){
    throw new Error('A fonte não é uma das três Magias de varredura.');
   }
   if(duel.core.players[team].backrow.length>=3)throw new Error('Não há Spell/Trap Zone livre para ativar a Magia.');
   const before=inventorySignature(duel),next=structuredClone(duel);
   const nextHand=privateHandForSeat(next,input.actorSeat),sourceIndex=nextHand.findIndex(card=>card.uid===input.sourceUid);
   if(sourceIndex<0)throw new Error('A Magia deixou a mão privada antes da ativação.');
   const [activated]=nextHand.splice(sourceIndex,1);
   next.core.players[team].backrow.push({...activated,faceUp:true,setTurn:input.turn});
   synchronizeCardLifetimes(next.core);
   const plan:Plan={
    activationId:input.activationId,sourceUid:activated.uid,sourceCardId:activated.id,effect:info.effect,
    sourceOwnerSeat:sourceOwnerSeat,controllerTeam:team,actorSeat:input.actorSeat,turn:input.turn
   };
   assertMassBackrowRules(next);assertSameInventory(before,next);
   session.duel=next;session.activations[input.activationId]=plan;
   return {activationId:input.activationId,sourceUid:input.sourceUid,effect:info.effect,replayed:false};
  },
  resolve(session:MassBackrowSession,input:{activationId:string;activationNegated?:boolean;effectNegated?:boolean}):Receipt{
   assertMassBackrowRules(session.duel);
   assertId(input.activationId,'Identificador de ativação');
   if(input.activationNegated!==undefined&&typeof input.activationNegated!=='boolean'||
    input.effectNegated!==undefined&&typeof input.effectNegated!=='boolean')throw new Error('Estado de negação inválido.');
   const activationNegated=input.activationNegated===true,effectNegated=input.effectNegated===true;
   const previous=session.receipts[input.activationId];
   if(previous){
    if(previous.activationNegated!==activationNegated||previous.effectNegated!==effectNegated){
     throw new Error('Resolução repetida com resultado diferente.');
    }
    return {...previous,destroyedUids:[...previous.destroyedUids],replayed:true};
   }
   const plan=session.activations[input.activationId];
   if(!plan)throw new Error('Ativação da Magia não encontrada.');
   const before=inventorySignature(session.duel),next=structuredClone(session.duel);
   const destroyedUids:string[]=[];let returnedCount=0;
   if(!activationNegated&&!effectNegated){
    const candidates=allSpellTraps(next.core).filter(location=>location.card.uid!==plan.sourceUid&&
     isSpellTrapCardId(location.card.id));
    for(const candidate of candidates){
     if(plan.effect==='harpie-feather-duster'&&candidate.team===plan.controllerTeam)continue;
     const current=findSpellTrap(next.core,candidate.card.uid);
     if(!current)continue;
     const ownerSeat=physicalSeat(current.card.uid);
     if(ownerSeat===null)throw new Error('Carta de Spell/Trap sem proprietário físico.');
     const card=removeLocation(next.core,current),ownerTeam=teamForSeat(ownerSeat);
     if(plan.effect==='giant-trunade'){
      privateHandForSeat(next,ownerSeat).push({uid:card.uid,id:card.id,...(card.properlySummoned?{properlySummoned:true}:{})});
      returnedCount++;
      onLeaveField?.(next,{uid:card.uid,cardId:card.id,ownerSeat,ownerTeam,controllerTeam:current.team,zone:current.zone,reason:'return',card});
     }else{
      pushToOwnerGrave(next,ownerSeat,card);destroyedUids.push(card.uid);
      onLeaveField?.(next,{uid:card.uid,cardId:card.id,ownerSeat,ownerTeam,controllerTeam:current.team,zone:current.zone,reason:'destroy',card});
     }
    }
   }
   const sourceLocation=findSpellTrap(next.core,plan.sourceUid);
   if(sourceLocation){
    const source=removeLocation(next.core,sourceLocation);
    pushToOwnerGrave(next,plan.sourceOwnerSeat,source);
   }
   synchronizeCardLifetimes(next.core);
   assertMassBackrowRules(next);assertSameInventory(before,next);
   const status:Receipt['status']=activationNegated?'activation-negated':effectNegated?'effect-negated':
    destroyedUids.length?'destroyed':returnedCount?'returned':'resolved';
   const result:Receipt={
    activationId:input.activationId,status,destroyedUids,returnedCount,
    activationNegated,effectNegated,replayed:false
   };
   session.duel=next;session.receipts[input.activationId]=result;
   return {...result,destroyedUids:[...destroyedUids]};
  }
 };
}
