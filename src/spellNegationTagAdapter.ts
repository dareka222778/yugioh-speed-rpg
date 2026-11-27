import {RULES_PROFILE,rulesFor} from './rulesProfile';
import type {DuelState,Backrow} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {engineCard} from './effectRegistry';
import {continuousTrapsNegated,monsterEffectsNegated} from './continuousEffects';
import {synchronizeCardLifetimes} from './cardLifetime';

export const SPELL_CANCELLER_ID='84636823';
export const IMPERIAL_ORDER_ID='61740673';
export type SpellNegationTeam=0|1;
export type SpellNegationSeat=0|1|2|3;
export type SpellNegationEffect='spell-canceller'|'imperial-order';
export type SpellNegationLookup=(id:string)=>{kind:'monster'|'trap';effect:SpellNegationEffect}|undefined;
export type SpellMaintenanceReceipt={
 activationId:string;sourceUid:string;actorSeat:SpellNegationSeat;turn:number;window:'standby';
};
export type SpellMaintenanceResult={
 activationId:string;sourceUid:string;turn:number;controllerTeam:SpellNegationTeam;
 ownerSeat:SpellNegationSeat;status:'paid'|'paid-and-lost'|'destroyed-unpaid'|'negated'|'source-lost'|'already-processed';
 lpBefore:number;lpAfter:number;paid:number;
};
export type SpellNegationSession={
 duel:TagDuel;lastMaintenanceTurn:Record<string,number>;processed:Record<string,SpellMaintenanceResult>;
};
type SpellTrap=NonNullable<DuelState['players'][number]['field']>;
type SpellLocation={team:SpellNegationTeam;zone:'backrow'|'field';card:SpellTrap};
const validTeam=(value:unknown):value is SpellNegationTeam=>value===0||value===1;
const validSeat=(value:unknown):value is SpellNegationSeat=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<=3;
const validId=(value:unknown):value is string=>typeof value==='string'&&/^[-a-zA-Z0-9:_]{1,128}$/.test(value);
function physicalSeat(uid:string):SpellNegationSeat|null{
 const match=/^m([0-3]):/.exec(uid);return match?Number(match[1]) as SpellNegationSeat:null;
}
function assertClassicShape(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic'||!duel.core||!Array.isArray(duel.core.players)||
  duel.core.players.length!==2||!Array.isArray(duel.active)||duel.active.length!==2||
  !Array.isArray(duel.members)||duel.members.length!==4||!duel.reserves||!duel.core.teamRotation){
  throw new Error('O adapter exige TagDuel clássico 2v2.');
 }
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  if(result.has(card.uid)||physicalSeat(card.uid)===null)throw new Error('UID físico inválido ou duplicado: '+card.uid);
  result.set(card.uid,card.id);
 }
 return result;
}
function handSnapshot(duel:TagDuel):string[]{
 const result:string[]=[];
 for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
 for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
 return result.sort();
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('A operação alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A operação alterou a identidade física: '+uid);
}
function assertHandsUnchanged(before:string[],duel:TagDuel):void{
 if(JSON.stringify(before)!==JSON.stringify(handSnapshot(duel)))throw new Error('A operação alterou uma mão privada.');
}
function findMonster(core:DuelState,uid:string){
 for(const team of [0,1] as const){
  const monster=core.players[team].monsters.find(card=>card.uid===uid);
  if(monster)return {team,monster};
 }
 return undefined;
}
function findSpellTrap(core:DuelState,uid:string):SpellLocation|undefined{
 for(const team of [0,1] as const){
  const backrow=core.players[team].backrow.find(card=>card.uid===uid);
  if(backrow)return {team,zone:'backrow',card:backrow};
  const field=core.players[team].field;
  if(field?.uid===uid)return {team,zone:'field',card:field};
 }
 return undefined;
}
/** Validates the owner's immutable classic profile and every physical seat. */
export function assertSpellNegationRules(duel:TagDuel):void{
 assertClassicShape(duel);assertTagDuel(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 }
 const extraUids=new Set<string>(),extra=[0,0,0,0],main=[0,0,0,0];
 for(const player of duel.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const [uid,id] of inventorySnapshot(duel)){
  const seat=physicalSeat(uid);if(seat===null)throw new Error('Carta sem proprietário físico.');
  if(extraUids.has(uid)||!!engineCard(id)?.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck principal fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Extra Deck excedeu cinco cartas no assento '+seat+'.');
 }
}
function assertSession(session:SpellNegationSession):void{
 if(!session||!session.duel||!session.lastMaintenanceTurn||typeof session.lastMaintenanceTurn!=='object'||
  Array.isArray(session.lastMaintenanceTurn)||!session.processed||typeof session.processed!=='object'||Array.isArray(session.processed)){
  throw new Error('Sessão M661 inválida.');
 }
 assertSpellNegationRules(session.duel);
 for(const [uid,turn] of Object.entries(session.lastMaintenanceTurn)){
  if(physicalSeat(uid)===null||!Number.isSafeInteger(turn)||turn<1)throw new Error('Registro de manutenção inválido.');
 }
 for(const [id,result] of Object.entries(session.processed)){
  if(!validId(id)||!result||result.activationId!==id||!validId(result.sourceUid)||!Number.isSafeInteger(result.turn)){
   throw new Error('Recibo de manutenção inválido.');
  }
 }
}
function moveSpellTrapToOwnerGrave(core:DuelState,uid:string):boolean{
 const location=findSpellTrap(core,uid),ownerSeat=physicalSeat(uid);
 if(!location||ownerSeat===null)return false;
 if(location.zone==='backrow')core.players[location.team].backrow=core.players[location.team].backrow.filter(card=>card.uid!==uid);
 else core.players[location.team].field=null;
 core.players[ownerSeat%2].grave.push({uid:location.card.uid,id:location.card.id});
 synchronizeCardLifetimes(core);return true;
}
function assertReceipt(receipt:SpellMaintenanceReceipt):void{
 if(!receipt||!validId(receipt.activationId)||typeof receipt.sourceUid!=='string'||
  physicalSeat(receipt.sourceUid)===null||!validSeat(receipt.actorSeat)||!Number.isSafeInteger(receipt.turn)||
  receipt.turn<1||receipt.window!=='standby'){
  throw new Error('Recibo de Standby M661 inválido.');
 }
}
export const defaultSpellNegationLookup:SpellNegationLookup=(id)=>{
 if(id===SPELL_CANCELLER_ID)return {kind:'monster',effect:'spell-canceller'};
 if(id===IMPERIAL_ORDER_ID)return {kind:'trap',effect:'imperial-order'};
 return undefined;
};
export function createSpellNegationAdapter(lookup:SpellNegationLookup=defaultSpellNegationLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):SpellNegationSession{
  assertSpellNegationRules(duel);
  return {duel:structuredClone(duel),lastMaintenanceTurn:{},processed:{}};
 }
 function activeSources(duel:TagDuel){
  assertSpellNegationRules(duel);
  const core=duel.core;
  const spellCancellerUids=core.players.flatMap(player=>player.monsters
   .filter(monster=>monster.faceUp&&lookup(monster.id)?.effect==='spell-canceller'&&!monsterEffectsNegated(core,monster.uid))
   .map(monster=>monster.uid));
  const trapEffectsSuppressed=continuousTrapsNegated(core);
  const imperialOrderUids=trapEffectsSuppressed?[]:core.players.flatMap(player=>
   [...player.backrow,...player.field?[player.field]:[]]
    .filter(card=>card.faceUp&&lookup(card.id)?.effect==='imperial-order')
    .map(card=>card.uid));
  return {spellCancellerUids,imperialOrderUids};
 }
 /** Spell Canceller blocks new Spell activations for both teams; Imperial Order does not. */
 function spellActivationBlocked(duel:TagDuel):boolean{
  return activeSources(duel).spellCancellerUids.length>0;
 }
 /** Both active sources negate Spell effects that are currently on the field. */
 function spellEffectsNegated(duel:TagDuel):boolean{
  const sources=activeSources(duel);return sources.spellCancellerUids.length>0||sources.imperialOrderUids.length>0;
 }
 function isSpellEffectNegated(duel:TagDuel,spellUid:string):boolean{
  assertSpellNegationRules(duel);
  const location=findSpellTrap(duel.core,spellUid);
  if(!location||!location.card.faceUp||engineCard(location.card.id)?.kind!=='spell')return false;
  return spellEffectsNegated(duel);
 }
 /** The host invokes this once per controller-team Standby window before Main Phase actions. */
 function processMaintenance(session:SpellNegationSession,receipt:SpellMaintenanceReceipt):SpellMaintenanceResult{
  assertSession(session);assertReceipt(receipt);
  const previous=session.processed[receipt.activationId];
  if(previous){
   if(previous.sourceUid!==receipt.sourceUid||previous.turn!==receipt.turn)throw new Error('ID de manutenção reutilizado.');
   return structuredClone(previous);
  }
  const duel=session.duel,core=duel.core;
  if(receipt.turn!==core.turn||core.phase!=='main'||core.pending.kind!=='none'||core.chain.length!==0||
   core.turnEnding||!validTeam(core.current))throw new Error('O recibo não corresponde ao início do turno.');
  const location=findSpellTrap(core,receipt.sourceUid),ownerSeat=physicalSeat(receipt.sourceUid);
  if(!location||!location.card.faceUp||lookup(location.card.id)?.effect!=='imperial-order'||ownerSeat===null){
   return {activationId:receipt.activationId,sourceUid:receipt.sourceUid,turn:receipt.turn,
    controllerTeam:core.current as SpellNegationTeam,ownerSeat:ownerSeat??receipt.actorSeat,
    status:'source-lost',lpBefore:core.players[core.current].lp,lpAfter:core.players[core.current].lp,paid:0};
  }
  const team=location.team;
  if(core.current!==team||duel.cursor!==receipt.actorSeat||duel.active[team]!==receipt.actorSeat||receipt.actorSeat%2!==team){
   throw new Error('A manutenção pertence à equipe e ao assento ativo da carta controladora.');
  }
  if(session.lastMaintenanceTurn[receipt.sourceUid]===core.turn){
   return {activationId:receipt.activationId,sourceUid:receipt.sourceUid,turn:receipt.turn,
    controllerTeam:team,ownerSeat,status:'already-processed',lpBefore:core.players[team].lp,
    lpAfter:core.players[team].lp,paid:0};
  }
  if(continuousTrapsNegated(core)){
   return {activationId:receipt.activationId,sourceUid:receipt.sourceUid,turn:receipt.turn,
    controllerTeam:team,ownerSeat,status:'negated',lpBefore:core.players[team].lp,
    lpAfter:core.players[team].lp,paid:0};
  }
  const working=structuredClone(duel),before=inventorySnapshot(duel),handsBefore=handSnapshot(duel);
  const lpBefore=working.core.players[team].lp;
  let status:SpellMaintenanceResult['status'],paid=0;
  if(lpBefore>=700){
   paid=700;working.core.players[team].lp-=paid;
   if(working.core.players[team].lp===0){
    working.core.phase='finished';working.core.winner=working.core.players[1-team].id;
    working.core.reason='pontos de vida';working.core.pending={kind:'none'};
    working.core.chain=[];working.core.choice=undefined;working.core.handFlow=undefined;
    delete working.core.standby;working.core.turnEnding=undefined;
    status='paid-and-lost';
   }else status='paid';
  }else{
   if(!moveSpellTrapToOwnerGrave(working.core,receipt.sourceUid))throw new Error('Imperial Order saiu do campo antes da destruição.');
   status='destroyed-unpaid';
  }
  working.core.log.push(status==='destroyed-unpaid'?'Imperial Order destruída: PV insuficientes para pagar 700.':
   status==='paid-and-lost'?'Imperial Order pagou 700 PV; a equipe perdeu por chegar a zero.':'Imperial Order pagou 700 PV na Standby Phase.');
  working.core.log=working.core.log.slice(-12);
  assertSameInventory(before,working);assertHandsUnchanged(handsBefore,working);
  assertSpellNegationRules(working);assertTagDuel(working);
  session.duel=working;session.lastMaintenanceTurn[receipt.sourceUid]=receipt.turn;
  const result:SpellMaintenanceResult={activationId:receipt.activationId,sourceUid:receipt.sourceUid,
   turn:receipt.turn,controllerTeam:team,ownerSeat,status,lpBefore,lpAfter:working.core.players[team].lp,paid};
  session.processed[receipt.activationId]=structuredClone(result);
  return structuredClone(result);
 }
 return {createSession,activeSources,spellActivationBlocked,spellEffectsNegated,isSpellEffectNegated,processMaintenance};
}
