import type {Backrow,CardRef,Monster} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {bindTarget,targetBindingValid,synchronizeCardLifetimes,type TargetBinding} from './cardLifetime';
import {cleanEquips} from './classicEffects';
import {removeToken} from './tokens';

export const NIGHTMARE_PENGUIN_ID='81306586';
export const NIGHTMARE_PENGUIN_KONAMI_CID=5803;
export const COMPULSORY_EVACUATION_DEVICE_ID='94192409';
export const COMPULSORY_EVACUATION_DEVICE_KONAMI_CID=5914;
export type OwnerReturnTeam=0|1;
export type OwnerReturnSeat=0|1|2|3;
export type OwnerReturnEffect='nightmare-penguin'|'compulsory';
export type OwnerReturnLookup=(id:string)=>{kind:'monster'|'trap';effect:OwnerReturnEffect}|undefined;
export type ReturnDestination='hand'|'extra'|'gone';
export type LocatedCard={team:OwnerReturnTeam;zone:'monsters'|'backrow'|'field';card:Monster|Backrow};
export type ReturnReceipt={targetUid:string;ownerSeat:OwnerReturnSeat;destination:ReturnDestination};
export type NightmarePlan={activationId:string;sourceUid:string;sourceTeam:OwnerReturnTeam;sourceBinding:TargetBinding;targetUid:string;targetBinding:TargetBinding};
export type CompulsoryPlan={activationId:string;sourceUid:string;sourceTeam:OwnerReturnTeam;targetUid:string;targetBinding:TargetBinding};
export type NightmareResolution={activationId:string;status:'returned'|'target-left-field'|'effect-negated';receipt?:ReturnReceipt;replayed:boolean};
export type CompulsoryResolution={activationId:string;status:'returned'|'target-left-field'|'activation-negated'|'effect-negated';receipt?:ReturnReceipt;replayed:boolean};
export type OwnerHandReturnSession={duel:TagDuel;nightmarePending:Record<string,NightmarePlan>;nightmareResolved:Record<string,NightmareResolution>;nightmareActivations:Record<string,NightmarePlan>;compulsoryPending:Record<string,CompulsoryPlan>;compulsoryResolved:Record<string,CompulsoryResolution>;compulsoryActivations:Record<string,CompulsoryPlan>};

const isTeam=(v:unknown):v is OwnerReturnTeam=>v===0||v===1;
const isSeat=(v:unknown):v is OwnerReturnSeat=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=3;
function assertId(v:unknown,label:string):asserts v is string{
 if(typeof v!=='string'||!v.trim()||v.length>128||!/^[a-zA-Z0-9:_-]+$/.test(v))throw new Error(label+' inválido.');
}
function teamForSeat(seat:OwnerReturnSeat):OwnerReturnTeam{return (seat%2) as OwnerReturnTeam;}
function physicalSeat(uid:string):OwnerReturnSeat|null{
 const match=/^m([0-3]):/.exec(uid);return match?Number(match[1]) as OwnerReturnSeat:null;
}
function assertClassicShape(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 assertTagDuel(duel);
 if(duel.core.players.length!==2||duel.members.length!==4||duel.active.length!==2||!duel.core.teamRotation||!duel.reserves)throw new Error('Estrutura física TagDuel incompleta.');
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(c=>c.entityKind!=='token')){
  const seat=physicalSeat(card.uid);
  if(seat===null||duel.members[seat]?.team!==teamForSeat(seat)||result.has(card.uid))throw new Error('Identidade física inválida: '+card.uid);
  result.set(card.uid,card.id);
 }
 return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('O retorno alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('O retorno alterou a identidade física: '+uid);
}
export function assertOwnerHandReturnRules(duel:TagDuel):void{
 assertClassicShape(duel);const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5)throw new Error('Regras incompatíveis: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra Deck 5.');
 const extraUids=new Set<string>(),main=[0,0,0,0],extra=[0,0,0,0];
 for(const player of duel.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const [uid,id] of inventorySnapshot(duel)){
  const seat=physicalSeat(uid);if(seat===null)throw new Error('Carta sem proprietário físico.');
  if(extraUids.has(uid)||!!getDuelCard(id)?.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A mão pode exceder seis durante o turno; o descarte é exigido apenas na End Phase.
}
function locateCard(duel:TagDuel,uid:string):LocatedCard|undefined{
 for(const team of [0,1] as const){
  const player=duel.core.players[team],monster=player.monsters.find(m=>m.uid===uid);
  if(monster)return {team,zone:'monsters',card:monster};
  const backrow=player.backrow.find(c=>c.uid===uid);
  if(backrow)return {team,zone:'backrow',card:backrow};
  const field=player.field;if(field&&field.uid===uid)return {team,zone:'field',card:field};
 }
 return undefined;
}
function ownerHolder(duel:TagDuel,seat:OwnerReturnSeat):{hand:CardRef[];extra?:CardRef[]}{
 const team=teamForSeat(seat);
 if(duel.active[team]===seat)return duel.core.players[team];
 const held=duel.reserves[String(seat)];if(!held)throw new Error('Mão privada do proprietário físico ausente.');
 return held;
}
function assertTrapWindow(duel:TagDuel,team:OwnerReturnTeam,seat:OwnerReturnSeat):void{
 if(!isTeam(team)||!isSeat(seat)||duel.active[team]!==seat)throw new Error('Assento ativo da equipe inválido.');
 if(duel.core.phase==='main'||duel.core.phase==='battle'){
  const resume=duel.core.phase==='battle'?'battle':'main';
  if(duel.cursor!==seat||duel.core.current!==team||duel.core.resume!==resume)throw new Error('Armadilha fora da janela ativa.');
  return;
 }
 if(duel.core.phase==='response'&&duel.core.priority===team&&(duel.core.resume==='main'||duel.core.resume==='battle'))return;
 throw new Error('A Armadilha exige Main/Battle Phase própria ou janela de resposta.');
}
function returnCardToOwner(duel:TagDuel,uid:string):{duel:TagDuel;receipt:ReturnReceipt}|undefined{
 const before=inventorySnapshot(duel),next=structuredClone(duel),located=locateCard(next,uid);
 if(!located)return;
 const ownerSeat=physicalSeat(uid);if(ownerSeat===null)throw new Error('Carta sem assento físico proprietário.');
 if(located.zone==='monsters'&&located.card.entityKind==='token'){
  if(!removeToken(next.core,uid,'return'))return;
  cleanEquips(next.core);synchronizeCardLifetimes(next.core);assertTagDuel(next);assertSameInventory(before,next);
  return {duel:next,receipt:{targetUid:uid,ownerSeat,destination:'gone'}};
 }
 if(located.zone==='monsters')next.core.players[located.team].monsters=next.core.players[located.team].monsters.filter(m=>m.uid!==uid);
 else if(located.zone==='backrow')next.core.players[located.team].backrow=next.core.players[located.team].backrow.filter(c=>c.uid!==uid);
 else next.core.players[located.team].field=null;
 const holder=ownerHolder(next,ownerSeat),fusion=located.zone==='monsters'&&!!getDuelCard(located.card.id)?.fusion;
 const ref:CardRef={uid:located.card.uid,id:located.card.id};
 if(fusion){holder.extra??=[];holder.extra.push(ref);}else holder.hand.push(ref);
 cleanEquips(next.core);synchronizeCardLifetimes(next.core);assertTagDuel(next);assertSameInventory(before,next);
 return {duel:next,receipt:{targetUid:uid,ownerSeat,destination:fusion?'extra':'hand'}};
}
function moveTrapToOwnerGrave(duel:TagDuel,sourceUid:string):TagDuel{
 const ownerSeat=physicalSeat(sourceUid);if(ownerSeat===null)throw new Error('Armadilha sem assento físico proprietário.');
 const ownerTeam=teamForSeat(ownerSeat),before=inventorySnapshot(duel),next=structuredClone(duel),located=locateCard(next,sourceUid);
 if(located?.zone==='backrow'){
  next.core.players[located.team].backrow=next.core.players[located.team].backrow.filter(c=>c.uid!==sourceUid);
  if(!next.core.players[ownerTeam].grave.some(c=>c.uid===sourceUid))next.core.players[ownerTeam].grave.push({uid:located.card.uid,id:located.card.id});
 }
 cleanEquips(next.core);synchronizeCardLifetimes(next.core);assertTagDuel(next);assertSameInventory(before,next);return next;
}
function assertSession(session:OwnerHandReturnSession):void{
 if(!session||!session.duel||!session.nightmarePending||!session.nightmareResolved||!session.nightmareActivations||
  !session.compulsoryPending||!session.compulsoryResolved||!session.compulsoryActivations)throw new Error('Sessão M681 inválida.');
 assertTagDuel(session.duel);assertOwnerHandReturnRules(session.duel);
}
export const defaultOwnerHandReturnLookup:OwnerReturnLookup=(id)=>{
 if(id===NIGHTMARE_PENGUIN_ID)return {kind:'monster',effect:'nightmare-penguin'};
 if(id===COMPULSORY_EVACUATION_DEVICE_ID)return {kind:'trap',effect:'compulsory'};
 return undefined;
};
export function publicReturnReceipt(receipt:ReturnReceipt):{ownerSeat:OwnerReturnSeat;destination:ReturnDestination}{
 return {ownerSeat:receipt.ownerSeat,destination:receipt.destination};
}
export function createOwnerHandReturnAdapter(lookup:OwnerReturnLookup=defaultOwnerHandReturnLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):OwnerHandReturnSession{
  assertTagDuel(duel);assertOwnerHandReturnRules(duel);
  return {duel:structuredClone(duel),nightmarePending:{},nightmareResolved:{},nightmareActivations:{},compulsoryPending:{},compulsoryResolved:{},compulsoryActivations:{}};
 }
 function activateNightmareFlip(session:OwnerHandReturnSession,activationId:string,sourceUid:string,targetUid:string):NightmarePlan{
  assertSession(session);assertId(activationId,'ID de ativação');assertId(sourceUid,'UID da fonte');assertId(targetUid,'UID do alvo');
  const previous=session.nightmareActivations[activationId];
  if(previous){if(previous.sourceUid!==sourceUid||previous.targetUid!==targetUid)throw new Error('ID Nightmare reutilizado com fatos diferentes.');return previous;}
  const source=locateCard(session.duel,sourceUid),target=locateCard(session.duel,targetUid);
  if(!source||source.zone!=='monsters'||!(source.card as Monster).faceUp||lookup(source.card.id)?.effect!=='nightmare-penguin')throw new Error('Nightmare Penguin precisa estar face-up no campo.');
  if(!target||target.team===source.team)throw new Error('Nightmare Penguin só pode escolher carta controlada pelo oponente.');
  const sourceBinding=bindTarget(session.duel.core,sourceUid),targetBinding=bindTarget(session.duel.core,targetUid);
  if(!sourceBinding||!targetBinding)throw new Error('Binding de flip/alvo ausente.');
  const plan:NightmarePlan={activationId,sourceUid,sourceTeam:source.team,sourceBinding,targetUid,targetBinding};
  session.nightmarePending[activationId]=plan;session.nightmareActivations[activationId]=plan;return plan;
 }
 function resolveNightmareFlip(session:OwnerHandReturnSession,activationId:string,options:{negated?:boolean}={}):NightmareResolution{
  assertSession(session);assertId(activationId,'ID de ativação');
  const previous=session.nightmareResolved[activationId];if(previous)return {...previous,replayed:true};
  const plan=session.nightmarePending[activationId];if(!plan)throw new Error('Efeito Nightmare Penguin não encontrado.');
  let result:NightmareResolution;
  if(options.negated)result={activationId,status:'effect-negated',replayed:false};
  else if(!targetBindingValid(session.duel.core,plan.targetBinding)||!locateCard(session.duel,plan.targetUid))result={activationId,status:'target-left-field',replayed:false};
  else{
   const returned=returnCardToOwner(session.duel,plan.targetUid);
   if(!returned)result={activationId,status:'target-left-field',replayed:false};
   else{session.duel=returned.duel;result={activationId,status:'returned',receipt:returned.receipt,replayed:false};}
  }
  delete session.nightmarePending[activationId];session.nightmareResolved[activationId]=result;assertSession(session);return result;
 }
 function nightmareWaterAtkBonus(session:OwnerHandReturnSession,team:OwnerReturnTeam,monsterUid:string):number{
  assertSession(session);if(!isTeam(team))throw new Error('Equipe inválida.');
  const target=locateCard(session.duel,monsterUid);
  if(!target||target.zone!=='monsters'||target.team!==team||!(target.card as Monster).faceUp)return 0;
  const targetWater=getDuelCard(target.card.id)?.attribute==='WATER'||lookup(target.card.id)?.effect==='nightmare-penguin';
  if(!targetWater)return 0;
  return session.duel.core.players[team].monsters.filter(m=>m.faceUp&&lookup(m.id)?.effect==='nightmare-penguin').length*200;
 }
 function effectiveAtk(session:OwnerHandReturnSession,monsterUid:string):number|undefined{
  const target=locateCard(session.duel,monsterUid);if(!target||target.zone!=='monsters')return;
  return Math.max(0,(getDuelCard(target.card.id)?.atk??0)+(target.card as Monster).atkBoost+nightmareWaterAtkBonus(session,target.team,monsterUid));
 }
 function activateCompulsory(session:OwnerHandReturnSession,activationId:string,sourceUid:string,activeSeat:OwnerReturnSeat,targetUid:string):CompulsoryPlan{
  assertSession(session);assertId(activationId,'ID de ativação');assertId(sourceUid,'UID da Armadilha');assertId(targetUid,'UID do monstro');
  const previous=session.compulsoryActivations[activationId];
  if(previous){if(previous.sourceUid!==sourceUid||previous.targetUid!==targetUid)throw new Error('ID Compulsory reutilizado com fatos diferentes.');return previous;}
  if(!isSeat(activeSeat))throw new Error('Assento ativo inválido.');
  const team=teamForSeat(activeSeat),source=locateCard(session.duel,sourceUid),target=locateCard(session.duel,targetUid);
  if(!source||source.zone!=='backrow'||source.team!==team|| (source.card as Backrow).faceUp||
   (source.card as Backrow).setTurn>=session.duel.core.turn||lookup(source.card.id)?.kind!=='trap'||lookup(source.card.id)?.effect!=='compulsory'){
   throw new Error('Compulsory precisa estar setada desde turno anterior sob controle da equipe.');
  }
  assertTrapWindow(session.duel,team,activeSeat);
  if(!target||target.zone!=='monsters')throw new Error('Compulsory só escolhe um monstro no campo.');
  const targetBinding=bindTarget(session.duel.core,targetUid);if(!targetBinding)throw new Error('Binding do monstro ausente.');
  const liveSource=locateCard(session.duel,sourceUid);if(!liveSource||liveSource.zone!=='backrow')throw new Error('Fonte Compulsory saiu da zona.');
  (liveSource.card as Backrow).faceUp=true;(liveSource.card as Backrow).resolved=false;
  const plan:CompulsoryPlan={activationId,sourceUid,sourceTeam:team,targetUid,targetBinding};
  session.compulsoryPending[activationId]=plan;session.compulsoryActivations[activationId]=plan;assertSession(session);return plan;
 }
 function resolveCompulsory(session:OwnerHandReturnSession,activationId:string,options:{negatedActivation?:boolean;negatedEffect?:boolean}={}):CompulsoryResolution{
  assertSession(session);assertId(activationId,'ID de ativação');
  const previous=session.compulsoryResolved[activationId];if(previous)return {...previous,replayed:true};
  const plan=session.compulsoryPending[activationId];if(!plan)throw new Error('Ativação Compulsory não encontrada.');
  let result:CompulsoryResolution;
  if(options.negatedActivation){session.duel=moveTrapToOwnerGrave(session.duel,plan.sourceUid);result={activationId,status:'activation-negated',replayed:false};}
  else if(options.negatedEffect){session.duel=moveTrapToOwnerGrave(session.duel,plan.sourceUid);result={activationId,status:'effect-negated',replayed:false};}
  else if(!targetBindingValid(session.duel.core,plan.targetBinding)||locateCard(session.duel,plan.targetUid)?.zone!=='monsters'){
   session.duel=moveTrapToOwnerGrave(session.duel,plan.sourceUid);result={activationId,status:'target-left-field',replayed:false};
  }else{
   const returned=returnCardToOwner(session.duel,plan.targetUid);
   if(returned){session.duel=moveTrapToOwnerGrave(returned.duel,plan.sourceUid);result={activationId,status:'returned',receipt:returned.receipt,replayed:false};}
   else{session.duel=moveTrapToOwnerGrave(session.duel,plan.sourceUid);result={activationId,status:'target-left-field',replayed:false};}
  }
  delete session.compulsoryPending[activationId];session.compulsoryResolved[activationId]=result;assertSession(session);return result;
 }
 return {createSession,activateNightmareFlip,resolveNightmareFlip,nightmareWaterAtkBonus,effectiveAtk,activateCompulsory,resolveCompulsory};
}
