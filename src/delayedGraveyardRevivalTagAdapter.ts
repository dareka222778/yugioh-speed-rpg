import {createHash} from 'node:crypto';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {bindTarget,synchronizeCardLifetimes,targetBindingValid,type TargetBinding} from './cardLifetime';

export const TWIN_HEADED_BEHEMOTH_ID='43586926';
export const TWIN_HEADED_BEHEMOTH_KONAMI_CID=5030;
export const VAMPIRE_LORD_ID='53839837';
export const VAMPIRE_LORD_KONAMI_CID=5410;

export type RevivalTeam=0|1;
export type RevivalSeat=0|1|2|3;
type Monster=TagDuel['core']['players'][number]['monsters'][number];
type GraveCard=TagDuel['core']['players'][number]['grave'][number];

export type DelayedGraveyardRevivalLookups=Readonly<{
 twinHeadedBehemoth:(id:string)=>boolean;
 vampireLord:(id:string)=>boolean;
}>;

export function createExactDelayedGraveyardRevivalLookups():DelayedGraveyardRevivalLookups{
 return {
  twinHeadedBehemoth:id=>id===TWIN_HEADED_BEHEMOTH_ID,
  vampireLord:id=>id===VAMPIRE_LORD_ID
 };
}

export type DelayedRevivalKind='twin-headed-behemoth'|'vampire-lord';
export type DelayedRevivalPhase='end'|'standby';
export type DelayedRevivalPending=Readonly<{
 eventId:string;
 fingerprint:string;
 sequence:number;
 destroyedTurn:number;
 dueTurn:number;
 duePhase:DelayedRevivalPhase;
 kind:DelayedRevivalKind;
 cardUid:string;
 cardId:string;
 ownerSeat:RevivalSeat;
 ownerTeam:RevivalTeam;
 controllerTeam:RevivalTeam;
 sourceTeam:RevivalTeam|null;
 sourceBinding:TargetBinding;
 graveBinding:TargetBinding;
}>;

export type DelayedRevivalProcessed=Readonly<{
 eventId:string;
 fingerprint:string;
 sequence:number;
 status:'no-trigger'|'summoned'|'effect-negated';
}>;

export type DelayedGraveyardRevivalLedger=Readonly<{
 version:1;
 lastSequence:number;
 pending:readonly DelayedRevivalPending[];
 processed:readonly DelayedRevivalProcessed[];
 twinUsedUids:readonly string[];
 vampireUsedTurns:readonly Readonly<{uid:string;turn:number}>[];
}>;

export type DelayedRevivalDestructionEvent=Readonly<{
 kind:'delayed-graveyard-revival-destruction';
 eventId:string;
 sequence:number;
 turn:number;
 cardUid:string;
 destination:'grave'|'banished'|'hand'|'deck'|'extra'|'none';
 destruction:'battle'|'effect';
 controllerTeam:RevivalTeam;
 sourceTeam:RevivalTeam|null;
 sourceBinding:TargetBinding;
 graveBinding:TargetBinding|null;
}>;

export type DelayedRevivalWindow=Readonly<{
 kind:'delayed-graveyard-revival-window';
 eventId:string;
 phase:DelayedRevivalPhase;
 turn:number;
 activeTeam:RevivalTeam;
 activeSeat:RevivalSeat;
 accepted:boolean;
 activationNegated?:boolean;
 effectNegated?:boolean;
}>;

export type DelayedRevivalRecordResult=Readonly<{
 status:'scheduled'|'no-trigger'|'duplicate';
 ledger:DelayedGraveyardRevivalLedger;
}>;

export type DelayedRevivalResolution=Readonly<{
 status:'summoned'|'no-trigger'|'effect-negated'|'no-space'|'duplicate';
 state:TagDuel;
 ledger:DelayedGraveyardRevivalLedger;
 atkAfter:number|null;
 defAfter:number|null;
}>;

const isTeam=(value:unknown):value is RevivalTeam=>value===0||value===1;
const isSeat=(value:unknown):value is RevivalSeat=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<=3;

function assertText(value:unknown,label:string):asserts value is string{
 if(typeof value!=='string'||!value.trim()||value.length>256)throw new Error(label+' inválido.');
}

function assertClassicShape(state:TagDuel):void{
 if(!state||state.version!==1||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||
  !Array.isArray(state.active)||state.active.length!==2||!Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
  !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation){
  throw new Error('Revival TagDuel exige modo clássico 2v2.');
 }
 assertTagDuel(state);
 if(state.core.teamRotation.cursor!==state.cursor||
  state.core.teamRotation.active[0]!==state.active[0]||
  state.core.teamRotation.active[1]!==state.active[1]||
  state.core.current!==state.cursor%2||
  state.active[state.cursor%2]!==state.cursor&&
   !(state.core.teamRotation.overflowReturn?.seat===state.cursor&&state.core.teamRotation.overflowReturn.team===state.cursor%2)){
  throw new Error('Rotação física do TagDuel inconsistente.');
 }
}

export function assertDelayedGraveyardRevivalRules(state:TagDuel):void{
 assertClassicShape(state);
 const rules=rulesFor(state.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 }
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const player of state.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones compartilhadas.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones compartilhadas.');
 }
 for(const card of tagInventory(state).filter(card=>card.entityKind!=='token')){
  const seat=ownerSeatOfUid(state,card.uid);
  const info=getDuelCard(card.id);
  if(!info)throw new Error('Carta física sem metadata habilitado.');
  if(info.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax){
   throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  }
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // O limite seis é conferido somente na End Phase; a mão pode crescer durante o turno.
}

function ownerSeatOfUid(state:TagDuel,uid:string):RevivalSeat{
 const match=/^m([0-3]):(.+)$/.exec(uid);
 if(!match)throw new Error('UID físico sem assento proprietário verificável.');
 const seat=Number(match[1]) as RevivalSeat;
 if(state.members[seat]?.team!==seat%2)throw new Error('UID físico não corresponde ao proprietário do assento.');
 return seat;
}

function findGrave(state:TagDuel,team:RevivalTeam,uid:string):GraveCard|undefined{
 return state.core.players[team].grave.find(card=>card.uid===uid);
}

function assertLookups(lookups:DelayedGraveyardRevivalLookups):void{
 if(!lookups||typeof lookups.twinHeadedBehemoth!=='function'||typeof lookups.vampireLord!=='function'){
  throw new Error('Lookups de revival inválidos.');
 }
}

function assertLedger(ledger:DelayedGraveyardRevivalLedger):void{
 if(!ledger||ledger.version!==1||!Number.isSafeInteger(ledger.lastSequence)||ledger.lastSequence<0||
  !Array.isArray(ledger.pending)||ledger.pending.length>4096||
  !Array.isArray(ledger.processed)||ledger.processed.length>4096||
  !Array.isArray(ledger.twinUsedUids)||!Array.isArray(ledger.vampireUsedTurns)){
  throw new Error('Ledger de revival inválido.');
 }
 const ids=new Set<string>(),sequences=new Set<number>();
 for(const item of [...ledger.pending,...ledger.processed]){
  if(!item||typeof item.eventId!=='string'||!item.eventId||ids.has(item.eventId)||
   !/^[a-f0-9]{64}$/.test(item.fingerprint)||!Number.isSafeInteger(item.sequence)||item.sequence<1||
   item.sequence>ledger.lastSequence||sequences.has(item.sequence)){
   throw new Error('Evento de revival duplicado ou inválido.');
  }
  ids.add(item.eventId);sequences.add(item.sequence);
 }
 for(const item of ledger.pending){
  if(!Number.isSafeInteger(item.destroyedTurn)||item.destroyedTurn<1||
   !Number.isSafeInteger(item.dueTurn)||item.dueTurn<item.destroyedTurn||
   !['end','standby'].includes(item.duePhase)||
   !['twin-headed-behemoth','vampire-lord'].includes(item.kind)||
   typeof item.cardUid!=='string'||!item.cardUid||typeof item.cardId!=='string'||!item.cardId||
   !isSeat(item.ownerSeat)||item.ownerTeam!==item.ownerSeat%2||
   !isTeam(item.controllerTeam)||!(item.sourceTeam===null||isTeam(item.sourceTeam))||
   !item.sourceBinding||item.sourceBinding.uid!==item.cardUid||item.sourceBinding.zone!=='monsters'||
   !item.graveBinding||item.graveBinding.uid!==item.cardUid||item.graveBinding.zone!=='grave'){
   throw new Error('Agendamento de revival inválido.');
  }
 }
 if(new Set(ledger.twinUsedUids).size!==ledger.twinUsedUids.length||
  ledger.twinUsedUids.some(uid=>typeof uid!=='string'||!uid)){
  throw new Error('Uso por Duelo de Twin-Headed Behemoth inválido.');
 }
 const used=new Set<string>();
 for(const item of ledger.vampireUsedTurns){
  const key=item?.uid+':'+item?.turn;
  if(!item||typeof item.uid!=='string'||!item.uid||!Number.isSafeInteger(item.turn)||item.turn<1||used.has(key)){
   throw new Error('Uso por turno de Vampire Lord inválido.');
  }
  used.add(key);
 }
}

export function createDelayedGraveyardRevivalLedger():DelayedGraveyardRevivalLedger{
 return {version:1,lastSequence:0,pending:[],processed:[],twinUsedUids:[],vampireUsedTurns:[]};
}

function eventFingerprint(event:DelayedRevivalDestructionEvent):string{
 return createHash('sha256').update(JSON.stringify([
  event.kind,event.eventId,event.sequence,event.turn,event.cardUid,event.destination,event.destruction,
  event.controllerTeam,event.sourceTeam,event.sourceBinding.uid,event.sourceBinding.zone,event.sourceBinding.epoch,
  event.graveBinding?.uid??null,event.graveBinding?.zone??null,event.graveBinding?.epoch??null
 ])).digest('hex');
}

function processed(
 ledger:DelayedGraveyardRevivalLedger,
 event:DelayedRevivalDestructionEvent,
 fingerprint:string,
 status:DelayedRevivalProcessed['status']
):DelayedGraveyardRevivalLedger{
 if(ledger.processed.length>=4096)throw new Error('Ledger de revival atingiu o limite de eventos.');
 return {
  ...ledger,lastSequence:event.sequence,
  processed:[...ledger.processed,{eventId:event.eventId,fingerprint,sequence:event.sequence,status}]
 };
}

/** Capture after the physical card has moved to its owner's GY; the source binding must be from before destruction. */
export function recordDelayedGraveyardRevivalDestruction(
 state:TagDuel,ledger:DelayedGraveyardRevivalLedger,event:DelayedRevivalDestructionEvent,
 lookups:DelayedGraveyardRevivalLookups
):DelayedRevivalRecordResult{
 assertDelayedGraveyardRevivalRules(state);assertLedger(ledger);assertLookups(lookups);
 if(event?.kind!=='delayed-graveyard-revival-destruction')throw new Error('Tipo de evento de destruição inválido.');
 assertText(event.eventId,'ID do evento de destruição');assertText(event.cardUid,'UID destruído');
 if(!Number.isSafeInteger(event.sequence)||event.sequence<1||!Number.isSafeInteger(event.turn)||
  event.turn!==state.core.turn||!['grave','banished','hand','deck','extra','none'].includes(event.destination)||
  !['battle','effect'].includes(event.destruction)||!isTeam(event.controllerTeam)||
  !(event.sourceTeam===null||isTeam(event.sourceTeam))||
  !event.sourceBinding||event.sourceBinding.uid!==event.cardUid||event.sourceBinding.zone!=='monsters'||
  !Number.isSafeInteger(event.sourceBinding.epoch)||event.sourceBinding.epoch<0){
  throw new Error('Evidência de destruição inválida.');
 }
 const fingerprint=eventFingerprint(event);
 const priorPending=ledger.pending.find(item=>item.eventId===event.eventId);
 const priorProcessed=ledger.processed.find(item=>item.eventId===event.eventId);
 const prior=priorPending??priorProcessed;
 if(prior){
  if(prior.fingerprint!==fingerprint)throw new Error('Replay divergente de destruição.');
  return {status:'duplicate',ledger};
 }
 if(event.sequence<=ledger.lastSequence)throw new Error('Sequência de destruição fora de ordem.');
 const ownerSeat=ownerSeatOfUid(state,event.cardUid),ownerTeam=(ownerSeat%2) as RevivalTeam;
 if(event.destination!=='grave'){
  if(event.graveBinding!==null)throw new Error('Destino diferente do Cemitério não pode carregar binding de GY.');
  return {status:'no-trigger',ledger:processed(ledger,event,fingerprint,'no-trigger')};
 }
 if(!event.graveBinding||event.graveBinding.uid!==event.cardUid||event.graveBinding.zone!=='grave'||
  !Number.isSafeInteger(event.graveBinding.epoch)||event.graveBinding.epoch!==event.sourceBinding.epoch+1||
  !targetBindingValid(state.core,event.graveBinding)){
  throw new Error('Binding de destino no Cemitério inválido.');
 }
 const grave=findGrave(state,ownerTeam,event.cardUid);
 if(!grave)throw new Error('Carta destruída não está no Cemitério de seu proprietário físico.');
 let kind:DelayedRevivalKind|null=null,duePhase:DelayedRevivalPhase='end',dueTurn=event.turn;
 if(lookups.twinHeadedBehemoth(grave.id)&&!ledger.twinUsedUids.includes(event.cardUid)){
  kind='twin-headed-behemoth';duePhase='end';dueTurn=event.turn;
 }else if(lookups.vampireLord(grave.id)&&event.destruction==='effect'&&
  event.sourceTeam!==null&&event.sourceTeam!==event.controllerTeam&&event.controllerTeam===ownerTeam){
  kind='vampire-lord';duePhase='standby';
  dueTurn=event.turn+(state.core.current===ownerTeam?2:1);
 }
 if(!kind){
  return {status:'no-trigger',ledger:processed(ledger,event,fingerprint,'no-trigger')};
 }
 if(ledger.pending.length>=4096)throw new Error('Ledger de revival atingiu o limite de eventos pendentes.');
 const pending:DelayedRevivalPending={
  eventId:event.eventId,fingerprint,sequence:event.sequence,destroyedTurn:event.turn,dueTurn,duePhase,kind,
  cardUid:event.cardUid,cardId:grave.id,ownerSeat,ownerTeam,controllerTeam:event.controllerTeam,
  sourceTeam:event.sourceTeam,sourceBinding:event.sourceBinding,graveBinding:event.graveBinding
 };
 return {status:'scheduled',ledger:{...ledger,lastSequence:event.sequence,pending:[...ledger.pending,pending]}};
}

function assertWindow(state:TagDuel,window:DelayedRevivalWindow):void{
 if(window?.kind!=='delayed-graveyard-revival-window'||!assertWindowFields(window)||
  window.turn!==state.core.turn||window.activeTeam!==state.core.current||window.activeSeat!==state.cursor||
  state.active[window.activeTeam]!==window.activeSeat){
  throw new Error('Janela de End/Standby Phase não corresponde ao assento ativo.');
}
}
function assertWindowFields(window:DelayedRevivalWindow):boolean{
 return typeof window.eventId==='string'&&!!window.eventId.trim()&&window.eventId.length<=256&&
  (window.phase==='end'||window.phase==='standby')&&Number.isSafeInteger(window.turn)&&window.turn>=1&&
  isTeam(window.activeTeam)&&isSeat(window.activeSeat)&&typeof window.accepted==='boolean'&&
  (window.activationNegated===undefined||typeof window.activationNegated==='boolean')&&
  (window.effectNegated===undefined||typeof window.effectNegated==='boolean');
}

function appendProcessed(
 ledger:DelayedGraveyardRevivalLedger,pending:DelayedRevivalPending,status:DelayedRevivalProcessed['status']
):DelayedGraveyardRevivalLedger{
 if(ledger.processed.length>=4096)throw new Error('Ledger de revival atingiu o limite de eventos.');
 return {
  ...ledger,pending:ledger.pending.filter(item=>item.eventId!==pending.eventId),
  processed:[...ledger.processed,{eventId:pending.eventId,fingerprint:pending.fingerprint,sequence:pending.sequence,status}]
 };
}

function markUsed(
 ledger:DelayedGraveyardRevivalLedger,pending:DelayedRevivalPending,turn:number
):DelayedGraveyardRevivalLedger{
 if(pending.kind==='twin-headed-behemoth'){
  return ledger.twinUsedUids.includes(pending.cardUid)?ledger:
   {...ledger,twinUsedUids:[...ledger.twinUsedUids,pending.cardUid]};
 }
 const key=ledger.vampireUsedTurns.some(item=>item.uid===pending.cardUid&&item.turn===turn);
 return key?ledger:{...ledger,vampireUsedTurns:[...ledger.vampireUsedTurns,{uid:pending.cardUid,turn}]};
}

/** Resolve one due optional revival. A full Monster Zone leaves the trigger pending for the same phase. */
export function resolveDelayedGraveyardRevival(
 state:TagDuel,ledger:DelayedGraveyardRevivalLedger,window:DelayedRevivalWindow,
 lookups:DelayedGraveyardRevivalLookups
):DelayedRevivalResolution{
 assertDelayedGraveyardRevivalRules(state);assertLedger(ledger);assertLookups(lookups);assertWindow(state,window);
 const prior=ledger.processed.find(item=>item.eventId===window.eventId);
 if(prior)return {status:'duplicate',state:structuredClone(state),ledger,atkAfter:null,defAfter:null};
 const pending=ledger.pending.find(item=>item.eventId===window.eventId);
 if(!pending)throw new Error('Evento de revival pendente não encontrado.');
 if(pending.duePhase!==window.phase||pending.dueTurn!==window.turn||
  pending.kind==='vampire-lord'&&window.activeTeam!==pending.ownerTeam){
  throw new Error('Revival fora da próxima janela válida.');
 }
 if(!window.accepted){
  const nextLedger=appendProcessed(ledger,pending,'no-trigger');
  return {status:'no-trigger',state:structuredClone(state),ledger:nextLedger,atkAfter:null,defAfter:null};
 }
 const used=pending.kind==='twin-headed-behemoth'
  ?ledger.twinUsedUids.includes(pending.cardUid)
  :ledger.vampireUsedTurns.some(item=>item.uid===pending.cardUid&&item.turn===window.turn);
 if(used){
  const nextLedger=appendProcessed(ledger,pending,'no-trigger');
  return {status:'no-trigger',state:structuredClone(state),ledger:nextLedger,atkAfter:null,defAfter:null};
 }
 const grave=findGrave(state,pending.ownerTeam,pending.cardUid);
 if(!grave||grave.id!==pending.cardId||!targetBindingValid(state.core,pending.graveBinding)){
  const nextLedger=appendProcessed(ledger,pending,'no-trigger');
  return {status:'no-trigger',state:structuredClone(state),ledger:nextLedger,atkAfter:null,defAfter:null};
 }
 if(state.core.players[pending.ownerTeam].monsters.length>=RULES_PROFILE.monsterZones){
  return {status:'no-space',state:structuredClone(state),ledger,atkAfter:null,defAfter:null};
 }
 const info=getDuelCard(grave.id);
 if(!info||info.kind!=='monster'||!Number.isSafeInteger(info.atk)||!Number.isSafeInteger(info.defense)){
  throw new Error('Metadata de monstro inválida durante revival.');
 }
 if(pending.kind==='twin-headed-behemoth'&&!lookups.twinHeadedBehemoth(grave.id)||
  pending.kind==='vampire-lord'&&!lookups.vampireLord(grave.id)){
  throw new Error('Identidade do card mudou antes do revival.');
 }
 if(window.activationNegated||window.effectNegated){
  let nextLedger=markUsed(ledger,pending,window.turn);
  nextLedger=appendProcessed(nextLedger,pending,'effect-negated');
  return {status:'effect-negated',state:structuredClone(state),ledger:nextLedger,atkAfter:null,defAfter:null};
 }
 const before=tagInventory(state).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]).sort();
 const next=structuredClone(state);
 const nextGrave=next.core.players[pending.ownerTeam].grave;
 const index=nextGrave.findIndex(card=>card.uid===pending.cardUid);
 if(index<0)throw new Error('Carta desapareceu do Cemitério durante revival.');
 const card=nextGrave.splice(index,1)[0];
 const twin=pending.kind==='twin-headed-behemoth';
 const monster:Monster={
  ...card,position:'atk',faceUp:true,entered:next.core.turn,changed:next.core.turn,attacked:0,
  atkBoost:twin?1000-info.atk:0,defBoost:twin?1000-info.defense:0,owner:pending.ownerTeam
 };
 next.core.players[pending.ownerTeam].monsters.push(monster);
 synchronizeCardLifetimes(next.core);
 assertDelayedGraveyardRevivalRules(next);
 const after=tagInventory(next).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]).sort();
 if(JSON.stringify(before)!==JSON.stringify(after)){
  throw new Error('Revival alterou o inventário físico.');
 }
 let nextLedger=markUsed(ledger,pending,window.turn);
 nextLedger=appendProcessed(nextLedger,pending,'summoned');
 return {status:'summoned',state:next,ledger:nextLedger,atkAfter:twin?1000:info.atk,defAfter:twin?1000:info.defense};
}
