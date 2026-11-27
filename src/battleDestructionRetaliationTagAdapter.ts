import type {CardRef,Monster} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {assertDuelRandom,randomIndex} from './duelRandom';
import {bindTarget,targetBindingValid,type TargetBinding} from './cardLifetime';
import {sendMonsterToGrave} from './monsterExit';

export const YOMI_SHIP_ID='51534754';
export const YOMI_SHIP_KONAMI_CID=5521;
export const HELPOEMER_ID='76052811';
export const HELPOEMER_KONAMI_CID=5489;

export type BattleRetaliationTeam=0|1;
export type BattleRetaliationSeat=0|1|2|3;
export type BattleRetaliationEffect='yomi-ship'|'helpoemer';
export type BattleRetaliationLookup=(id:string)=>{kind:'monster';effect:BattleRetaliationEffect}|undefined;
type PhysicalHolder={deck:CardRef[];hand:CardRef[];extra?:CardRef[]};
type ActiveMonster={team:BattleRetaliationTeam;monster:Monster};

export type BattleDestructionEvent={
 eventId:string;destroyedUid:string;destroyerUid:string;battleSeat:BattleRetaliationSeat;
 turn:number;destroyedByBattle:boolean;sentToGrave:boolean;
};
export type BattlePhaseEndWindow={
 kind:'opponent-battle-phase-end';eventId:string;team:BattleRetaliationTeam;
 activeSeat:BattleRetaliationSeat;turn:number;
};
export type YomiShipPlan={
 activationId:string;eventId:string;sourceUid:string;sourceOwnerSeat:BattleRetaliationSeat;
 ownerTeam:BattleRetaliationTeam;destroyerUid:string;destroyerBinding?:TargetBinding;
 sourceBinding:TargetBinding;turn:number;
};
export type HelpoemerPlan={
 activationId:string;eventId:string;sourceUid:string;sourceOwnerSeat:BattleRetaliationSeat;
 ownerTeam:BattleRetaliationTeam;sourceBinding:TargetBinding;destroyedTurn:number;
};
export type YomiShipResolution={
 activationId:string;sourceUid:string;destroyerUid:string;turn:number;
 status:'destroyed'|'source-left-grave'|'destroyer-left-field'|'negated';
 replayed:boolean;
};
export type HelpoemerResolution={
 activationId:string;windowEventId:string;sourceUid:string;sourceOwnerSeat:BattleRetaliationSeat;
 targetSeat:BattleRetaliationSeat;turn:number;
 status:'discarded'|'empty-hand'|'source-left-grave'|'activation-negated'|'effect-negated';
 replayed:boolean;
};
export type BattleDestructionCapture={
 accepted:boolean;reason?:'not-battle-destruction'|'not-in-grave'|'unsupported-card'|'same-team';
 activationIds:string[];replayed:boolean;
};
export type BattleDestructionRetaliationSession={
 duel:TagDuel;
 capturedEvents:Record<string,BattleDestructionEvent>;
 yomiPending:Record<string,YomiShipPlan>;
 yomiResolved:Record<string,YomiShipResolution>;
 helpoemerPending:Record<string,HelpoemerPlan>;
 helpoemerResolved:Record<string,HelpoemerResolution>;
};

const isTeam=(value:unknown):value is BattleRetaliationTeam=>value===0||value===1;
const isSeat=(value:unknown):value is BattleRetaliationSeat=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=3;
function assertId(value:unknown,label:string,max=128):asserts value is string{
 if(typeof value!=='string'||!value.trim()||value.length>max||!/^[a-zA-Z0-9:_-]+$/.test(value))throw new Error(label+' inválido.');
}
function teamForSeat(seat:BattleRetaliationSeat):BattleRetaliationTeam{return (seat%2) as BattleRetaliationTeam;}
function physicalSeat(uid:string):BattleRetaliationSeat|null{
 const match=/^m([0-3]):/.exec(uid);return match?Number(match[1]) as BattleRetaliationSeat:null;
}
function assertClassicShape(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 assertTagDuel(duel);
 if(!duel.core.teamRotation||duel.core.players.length!==2||duel.members.length!==4||
  duel.active.length!==2||!Array.isArray(duel.core.chain)||!duel.reserves){
  throw new Error('Estrutura física TagDuel incompleta.');
 }
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  const seat=physicalSeat(card.uid);
  if(seat===null||duel.members[seat]?.team!==teamForSeat(seat)||result.has(card.uid)){
   throw new Error('Identidade física inválida: '+card.uid);
  }
  result.set(card.uid,card.id);
 }
 return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('A resolução alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A resolução alterou a identidade física: '+uid);
}
export function assertBattleDestructionRetaliationRules(duel:TagDuel):void{
 assertClassicShape(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra Deck 5.');
 }
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
 // A mão pode exceder seis durante o turno; a verificação ocorre somente na End Phase.
}
function physicalHolder(duel:TagDuel,seat:BattleRetaliationSeat):PhysicalHolder{
 const team=teamForSeat(seat);
 if(duel.active[team]===seat)return duel.core.players[team] as PhysicalHolder;
 const held=duel.reserves[String(seat)];
 if(!held)throw new Error('Zona privada do assento físico não encontrada.');
 return held as PhysicalHolder;
}
function findMonster(duel:TagDuel,uid:string):ActiveMonster|undefined{
 for(const team of [0,1] as const){
  const monster=duel.core.players[team].monsters.find(card=>card.uid===uid);
  if(monster)return {team,monster};
 }
 return undefined;
}
function findGrave(duel:TagDuel,team:BattleRetaliationTeam,uid:string):CardRef|undefined{
 return duel.core.players[team].grave.find(card=>card.uid===uid);
}
function sameEvent(a:BattleDestructionEvent,b:BattleDestructionEvent):boolean{
 return a.eventId===b.eventId&&a.destroyedUid===b.destroyedUid&&a.destroyerUid===b.destroyerUid&&
  a.battleSeat===b.battleSeat&&a.turn===b.turn&&a.destroyedByBattle===b.destroyedByBattle&&a.sentToGrave===b.sentToGrave;
}
function sourceStillInGrave(duel:TagDuel,team:BattleRetaliationTeam,uid:string,binding:TargetBinding):boolean{
 return binding.zone==='grave'&&targetBindingValid(duel.core,binding)&&!!findGrave(duel,team,uid);
}
function assertBattleDestructionEvent(duel:TagDuel,event:BattleDestructionEvent):{
 sourceSeat:BattleRetaliationSeat;destroyerSeat:BattleRetaliationSeat
}{
 if(!event||typeof event!=='object')throw new Error('Evento de destruição em batalha inválido.');
 assertId(event.eventId,'ID do evento',96);assertId(event.destroyedUid,'UID destruído');assertId(event.destroyerUid,'UID destruidor');
 if(!isSeat(event.battleSeat)||!Number.isSafeInteger(event.turn)||event.turn!==duel.core.turn||
  duel.cursor!==event.battleSeat||duel.active[event.battleSeat%2]!==event.battleSeat||
  duel.core.current!==event.battleSeat%2||!['battle','response'].includes(duel.core.phase)||duel.core.resume!=='battle'){
  throw new Error('Assento, fase ou turno do evento de batalha inválido.');
 }
 const sourceSeat=physicalSeat(event.destroyedUid),destroyerSeat=physicalSeat(event.destroyerUid);
 if(sourceSeat===null||destroyerSeat===null)throw new Error('UID sem proprietário físico.');
 return {sourceSeat,destroyerSeat};
}
function assertWindow(duel:TagDuel,window:BattlePhaseEndWindow):void{
 if(!window||window.kind!=='opponent-battle-phase-end'||!isTeam(window.team)||!isSeat(window.activeSeat)){
  throw new Error('Janela de fim da Battle Phase inválida.');
 }
 assertId(window.eventId,'ID da janela',96);
 if(!Number.isSafeInteger(window.turn)||window.turn!==duel.core.turn||
  duel.cursor!==window.activeSeat||duel.active[window.team]!==window.activeSeat||
  duel.core.current!==window.team||window.activeSeat%2!==window.team||
  !['battle','response'].includes(duel.core.phase)||duel.core.resume!=='battle'){
  throw new Error('A janela não pertence à Battle Phase do assento ativo.');
 }
}
function assertSession(session:BattleDestructionRetaliationSession):void{
 if(!session||!session.duel||!session.capturedEvents||!session.yomiPending||!session.yomiResolved||
  !session.helpoemerPending||!session.helpoemerResolved)throw new Error('Sessão M679 inválida.');
 assertTagDuel(session.duel);assertBattleDestructionRetaliationRules(session.duel);
}
function yomiActivationId(eventId:string,uid:string):string{return 'yomi:'+eventId+':'+uid;}
function helpoemerActivationId(eventId:string,uid:string):string{return 'helpoemer:'+eventId+':'+uid;}

export const defaultBattleDestructionLookup:BattleRetaliationLookup=(id)=>{
 if(id===YOMI_SHIP_ID)return {kind:'monster',effect:'yomi-ship'};
 if(id===HELPOEMER_ID)return {kind:'monster',effect:'helpoemer'};
 return undefined;
};

export function createBattleDestructionRetaliationAdapter(lookup:BattleRetaliationLookup=defaultBattleDestructionLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):BattleDestructionRetaliationSession{
  assertTagDuel(duel);assertBattleDestructionRetaliationRules(duel);
  return {duel:structuredClone(duel),capturedEvents:{},yomiPending:{},yomiResolved:{},helpoemerPending:{},helpoemerResolved:{}};
 }
 function capture(session:BattleDestructionRetaliationSession,event:BattleDestructionEvent):BattleDestructionCapture{
  assertSession(session);
  const {sourceSeat,destroyerSeat}=assertBattleDestructionEvent(session.duel,event);
  const previous=session.capturedEvents[event.eventId];
  if(previous){
   if(!sameEvent(previous,event))throw new Error('ID de evento reutilizado com conteúdo diferente.');
   const ids=[...Object.values(session.yomiPending),...Object.values(session.helpoemerPending)]
    .filter(plan=>plan.eventId===event.eventId).map(plan=>plan.activationId);
   return {accepted:ids.length>0,activationIds:ids,replayed:true};
  }
  if(!event.destroyedByBattle||!event.sentToGrave){
   return {accepted:false,reason:'not-battle-destruction',activationIds:[],replayed:false};
  }
  const ownerTeam=teamForSeat(sourceSeat),destroyerTeam=teamForSeat(destroyerSeat);
  if(ownerTeam===destroyerTeam)return {accepted:false,reason:'same-team',activationIds:[],replayed:false};
  const source=findGrave(session.duel,ownerTeam,event.destroyedUid);
  if(!source)return {accepted:false,reason:'not-in-grave',activationIds:[],replayed:false};
  if(!tagInventory(session.duel).some(card=>card.uid===event.destroyerUid)){
   throw new Error('O monstro que destruiu a carta não pertence ao inventário do duelo.');
  }
  const definition=lookup(source.id);
  if(!definition||definition.kind!=='monster')return {accepted:false,reason:'unsupported-card',activationIds:[],replayed:false};
  const sourceBinding=bindTarget(session.duel.core,event.destroyedUid);
  if(!sourceBinding||sourceBinding.zone!=='grave')return {accepted:false,reason:'not-in-grave',activationIds:[],replayed:false};
  const activationIds:string[]=[];
  if(definition.effect==='yomi-ship'){
   const activationId=yomiActivationId(event.eventId,event.destroyedUid);
   const destroyerBinding=bindTarget(session.duel.core,event.destroyerUid);
   session.yomiPending[activationId]={activationId,eventId:event.eventId,sourceUid:event.destroyedUid,
    sourceOwnerSeat:sourceSeat,ownerTeam,destroyerUid:event.destroyerUid,destroyerBinding,sourceBinding,turn:event.turn};
   activationIds.push(activationId);
  }else if(definition.effect==='helpoemer'){
   const activationId=helpoemerActivationId(event.eventId,event.destroyedUid);
   session.helpoemerPending[activationId]={activationId,eventId:event.eventId,sourceUid:event.destroyedUid,
    sourceOwnerSeat:sourceSeat,ownerTeam,sourceBinding,destroyedTurn:event.turn};
   activationIds.push(activationId);
  }
  if(!activationIds.length)return {accepted:false,reason:'unsupported-card',activationIds:[],replayed:false};
  session.capturedEvents[event.eventId]={...event};
  assertSession(session);
  return {accepted:true,activationIds,replayed:false};
 }
 function resolveYomiShip(session:BattleDestructionRetaliationSession,activationId:string,options:{negated?:boolean}={}):YomiShipResolution{
  assertSession(session);assertId(activationId,'ID de ativação');
  const previous=session.yomiResolved[activationId];
  if(previous)return {...previous,replayed:true};
  const plan=session.yomiPending[activationId];
  if(!plan)throw new Error('Ativação Yomi Ship não encontrada.');
  let status:YomiShipResolution['status'];
  if(options.negated)status='negated';
  else if(!sourceStillInGrave(session.duel,plan.ownerTeam,plan.sourceUid,plan.sourceBinding))status='source-left-grave';
  else if(!plan.destroyerBinding||plan.destroyerBinding.zone!=='monsters'||
   !targetBindingValid(session.duel.core,plan.destroyerBinding)||!findMonster(session.duel,plan.destroyerUid)){
   status='destroyer-left-field';
  }else{
   const before=inventorySnapshot(session.duel),next=structuredClone(session.duel);
   if(sendMonsterToGrave(next.core,plan.destroyerUid,false,'destroy')){
    assertTagDuel(next);assertSameInventory(before,next);session.duel=next;status='destroyed';
   }else status='destroyer-left-field';
  }
  const result:YomiShipResolution={activationId,sourceUid:plan.sourceUid,destroyerUid:plan.destroyerUid,
   turn:plan.turn,status,replayed:false};
  session.yomiResolved[activationId]=result;assertSession(session);return result;
 }
 function resolveHelpoemerBattlePhaseEnd(session:BattleDestructionRetaliationSession,window:BattlePhaseEndWindow,
  options:{negatedActivationIds?:readonly string[];negatedEffectIds?:readonly string[]}={}):HelpoemerResolution[]{
  assertSession(session);assertWindow(session.duel,window);
  const results:HelpoemerResolution[]=[];
  for(const plan of Object.values(session.helpoemerPending)){
   if(plan.ownerTeam===window.team||window.turn<plan.destroyedTurn)continue;
   const key=plan.activationId+':'+window.eventId;
   const previous=session.helpoemerResolved[key];
   if(previous){results.push({...previous,replayed:true});continue;}
   let status:HelpoemerResolution['status'];
   if(!sourceStillInGrave(session.duel,plan.ownerTeam,plan.sourceUid,plan.sourceBinding))status='source-left-grave';
   else if(options.negatedActivationIds?.includes(plan.activationId))status='activation-negated';
   else if(options.negatedEffectIds?.includes(plan.activationId))status='effect-negated';
   else{
    const before=inventorySnapshot(session.duel),next=structuredClone(session.duel),holder=physicalHolder(next,window.activeSeat);
    if(!holder.hand.length)status='empty-hand';
    else{
     const random=next.core.random;if(!random)throw new Error('Fluxo HMAC do duelo ausente.');
     assertDuelRandom(random);
     const index=randomIndex(random,holder.hand.length),discarded=holder.hand.splice(index,1)[0];
     next.core.players[window.team].grave.push(discarded);
     assertTagDuel(next);assertSameInventory(before,next);session.duel=next;status='discarded';
    }
   }
   const result:HelpoemerResolution={activationId:plan.activationId,windowEventId:window.eventId,
    sourceUid:plan.sourceUid,sourceOwnerSeat:plan.sourceOwnerSeat,targetSeat:window.activeSeat,
    turn:window.turn,status,replayed:false};
   session.helpoemerResolved[key]=result;results.push(result);
  }
  assertSession(session);return results;
 }
 function canSpecialSummonFromGraveyard(cardId:string):boolean{
  return lookup(cardId)?.effect!=='helpoemer';
 }
 return {createSession,capture,resolveYomiShip,resolveHelpoemerBattlePhaseEnd,canSpecialSummonFromGraveyard};
}
