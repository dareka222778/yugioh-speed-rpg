import {createHash as nodeCreateHash} from 'node:crypto';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {getDuelCard} from './effectRegistry';
import {rulesFor,RULES_PROFILE} from './rulesProfile';
import {bindTarget,synchronizeCardLifetimes,type TargetBinding} from './cardLifetime';

export const DD_SCOUT_PLANE_ID='03773196';
export const DD_SCOUT_PLANE_KONAMI_CID=5822;
export const DIMENSION_FUSION_ID='23557835';
export const DIMENSION_FUSION_KONAMI_CID=5906;
export const RETURN_FROM_DIFFERENT_DIMENSION_ID='27174286';
export const RETURN_FROM_DIFFERENT_DIMENSION_KONAMI_CID=6078;

export type BanishedReturnTeam=0|1;
export type BanishedReturnSeat=0|1|2|3;
export type BanishedReturnCard='dd-scout-plane'|'dimension-fusion'|'return-from-different-dimension';
type Card=TagDuel['core']['players'][number]['deck'][number];
type Monster=TagDuel['core']['players'][number]['monsters'][number];

export type BanishedReturnLookups=Readonly<Record<BanishedReturnCard,(id:string)=>boolean>>;
export function createExactBanishedReturnLookups():BanishedReturnLookups{
 return {
  'dd-scout-plane':id=>id===DD_SCOUT_PLANE_ID,
  'dimension-fusion':id=>id===DIMENSION_FUSION_ID,
  'return-from-different-dimension':id=>id===RETURN_FROM_DIFFERENT_DIMENSION_ID
 };
}

export type BanishTransitionEvent=Readonly<{
 kind:'ioc-banish-transition';
 eventId:string;
 sequence:number;
 turn:number;
 cardUid:string;
 fromZone:TargetBinding['zone'];
 toZone:'banished';
 binding:TargetBinding;
 reason:'battle'|'effect'|'cost'|'send'|'discard'|'mill'|'other';
}>;
export type BanishPending=Readonly<{
 eventId:string;
 fingerprint:string;
 sequence:number;
 turn:number;
 cardUid:string;
 ownerTeam:BanishedReturnTeam;
 banishedEpoch:number;
}>;
export type BanishProcessed=Readonly<{
 eventId:string;
 fingerprint:string;
 sequence:number;
 status:'no-trigger'|'scheduled'|'summoned'|'effect-negated'|'no-target';
}>;
export type ReturnEndCard=Readonly<{uid:string;ownerTeam:BanishedReturnTeam;epoch:number}>;
export type ReturnEndEntry=Readonly<{
 effectId:string;
 turn:number;
 activatingTeam:BanishedReturnTeam;
 cards:readonly ReturnEndCard[];
}>;
export type ScoutUsed=Readonly<{uid:string;turn:number}>;
export type BanishedReturnLedger=Readonly<{
 version:1;
 lastSequence:number;
 pendingScout:readonly BanishPending[];
 processed:readonly BanishProcessed[];
 scoutUsed:readonly ScoutUsed[];
 returnAtEnd:readonly ReturnEndEntry[];
}>;

export type BanishedRecordResult=Readonly<{status:'scheduled'|'no-trigger'|'duplicate';ledger:BanishedReturnLedger}>;
export type ScoutEndPhaseWindow=Readonly<{
 kind:'dd-scout-plane-end-phase';
 eventId:string;
 turn:number;
 turnTeam:BanishedReturnTeam;
 turnSeat:BanishedReturnSeat;
 resolvingTeam:BanishedReturnTeam;
 resolvingSeat:BanishedReturnSeat;
 effectNegated?:boolean;
}>;
export type TurnWindow=Readonly<{
 turn:number;
 turnTeam:BanishedReturnTeam;
 turnSeat:BanishedReturnSeat;
}>;
export type DimensionFusionWindow=TurnWindow&Readonly<{
 kind:'dimension-fusion-resolution';
 cardId:string;
 activatingTeam:BanishedReturnTeam;
 activatingSeat:BanishedReturnSeat;
 selectedByTeam?:readonly [readonly string[],readonly string[]];
 effectNegated?:boolean;
}>;
export type ReturnDifferentDimensionWindow=TurnWindow&Readonly<{
 kind:'return-different-dimension-resolution';
 cardId:string;
 eventId:string;
 activatingTeam:BanishedReturnTeam;
 activatingSeat:BanishedReturnSeat;
 selectedUids?:readonly string[];
 effectNegated?:boolean;
}>;
export type ReturnEndPhaseWindow=TurnWindow&Readonly<{kind:'return-different-dimension-end-phase'}>;

export type BanishedReturnResult=Readonly<{
 status:'resolved'|'effect-negated'|'no-target'|'no-space'|'insufficient-lp'|'lethal-cost'|'summoned';
 state:TagDuel;
 ledger:BanishedReturnLedger;
 changedTeams:readonly BanishedReturnTeam[];
 summonedUids:readonly string[];
 banishedUids:readonly string[];
 lpDelta:Readonly<[number,number]>;
}>;

const isTeam=(value:unknown):value is BanishedReturnTeam=>value===0||value===1;
const isSeat=(value:unknown):value is BanishedReturnSeat=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<=3;
function assertText(value:unknown,label:string):asserts value is string{
 if(typeof value!=='string'||!value.trim()||value.length>256)throw new Error(label+' inválido.');
}
function ownerSeatOfUid(state:TagDuel,uid:string):BanishedReturnSeat{
 const match=/^m([0-3]):(.+)$/.exec(uid);
 if(!match)throw new Error('UID físico sem assento proprietário.');
 const seat=Number(match[1]) as BanishedReturnSeat;
 if(state.members[seat]?.team!==seat%2)throw new Error('UID físico não corresponde ao assento proprietário.');
 return seat;
}
function ownerTeamOfUid(state:TagDuel,uid:string):BanishedReturnTeam{
 return (ownerSeatOfUid(state,uid)%2) as BanishedReturnTeam;
}
function assertRules(state:TagDuel):void{
 if(!state||state.version!==1||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||
  !Array.isArray(state.active)||state.active.length!==2||!Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
  !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation){
  throw new Error('Adapter de banidos exige TagDuel clássico 2v2.');
 }
 assertTagDuel(state);
 if(state.core.teamRotation.cursor!==state.cursor||
  state.core.teamRotation.active[0]!==state.active[0]||state.core.teamRotation.active[1]!==state.active[1]||
  state.core.current!==state.cursor%2||
  state.active[state.cursor%2]!==state.cursor&&
   !(state.core.teamRotation.overflowReturn?.seat===state.cursor&&state.core.teamRotation.overflowReturn.team===state.cursor%2)){
  throw new Error('Rotação física do TagDuel inconsistente.');
 }
 const rules=rulesFor(state.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 }
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const player of state.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones||player.backrow.length>RULES_PROFILE.spellTrapZones){
   throw new Error('Limite compartilhado 3+3 excedido.');
  }
 }
 for(const card of tagInventory(state).filter(item=>item.entityKind!=='token')){
  const seat=ownerSeatOfUid(state,card.uid),info=getDuelCard(card.id);
  if(!info)throw new Error('Carta física sem metadata habilitado.');
  if(info.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A mão de seis só é cobrada no encerramento; este adapter não altera mãos.
}
function assertLookups(lookups:BanishedReturnLookups):void{
 if(!lookups||typeof lookups['dd-scout-plane']!=='function'||
  typeof lookups['dimension-fusion']!=='function'||typeof lookups['return-from-different-dimension']!=='function'){
  throw new Error('Lookups de retorno banido inválidos.');
 }
}
function cardKey(id:string,lookups:BanishedReturnLookups):BanishedReturnCard|null{
 if(lookups['dd-scout-plane'](id))return 'dd-scout-plane';
 if(lookups['dimension-fusion'](id))return 'dimension-fusion';
 if(lookups['return-from-different-dimension'](id))return 'return-from-different-dimension';
 return null;
}
function inventorySnapshot(state:TagDuel):string[]{
 return tagInventory(state).filter(card=>card.entityKind!=='token').map(card=>card.uid+'|'+card.id).sort();
}
function currentBinding(state:TagDuel,uid:string):TargetBinding|undefined{return bindTarget(state.core,uid);}
function movedToBanished(state:TagDuel,binding:TargetBinding):boolean{
 const current=currentBinding(state,binding.uid);
 return !!current&&current.zone==='banished'&&current.epoch===binding.epoch+1;
}
function fingerprint(event:BanishTransitionEvent):string{
 return requireHash([
  event.kind,event.eventId,event.sequence,event.turn,event.cardUid,event.fromZone,event.toZone,
  event.binding.uid,event.binding.zone,event.binding.epoch,event.reason
 ]);
}
function requireHash(parts:unknown[]):string{
 // Keep the event fingerprint deterministic and independent of object key order.
 const text=JSON.stringify(parts);
 return createHash(text);
}
function createHash(text:string):string{
 return nodeCreateHash('sha256').update(text).digest('hex');
}
function assertLedger(ledger:BanishedReturnLedger):void{
 if(!ledger||ledger.version!==1||!Number.isSafeInteger(ledger.lastSequence)||ledger.lastSequence<0||
  !Array.isArray(ledger.pendingScout)||ledger.pendingScout.length>4096||
  !Array.isArray(ledger.processed)||ledger.processed.length>4096||
  !Array.isArray(ledger.scoutUsed)||ledger.scoutUsed.length>4096||
  !Array.isArray(ledger.returnAtEnd)||ledger.returnAtEnd.length>4096){
  throw new Error('Ledger de retorno banido inválido.');
 }
 const ids=new Set<string>(),sequences=new Set<number>();
 for(const item of [...ledger.pendingScout,...ledger.processed]){
  if(!item||typeof item.eventId!=='string'||!item.eventId||ids.has(item.eventId)||
   !/^[a-f0-9]{64}$/.test(item.fingerprint)||!Number.isSafeInteger(item.sequence)||item.sequence<1||
   item.sequence>ledger.lastSequence||sequences.has(item.sequence)){
   throw new Error('Evento de banimento duplicado ou inválido.');
  }
  ids.add(item.eventId);sequences.add(item.sequence);
 }
 const used=new Set<string>();
 for(const item of ledger.scoutUsed){
  if(!item||typeof item.uid!=='string'||!item.uid||!Number.isSafeInteger(item.turn)||item.turn<1||
   used.has(item.uid+'|'+item.turn))throw new Error('Uso de D.D. Scout Plane duplicado ou inválido.');
  used.add(item.uid+'|'+item.turn);
 }
 const effects=new Set<string>();
 for(const entry of ledger.returnAtEnd){
  if(!entry||typeof entry.effectId!=='string'||!entry.effectId||effects.has(entry.effectId)||
   !Number.isSafeInteger(entry.turn)||entry.turn<1||!isTeam(entry.activatingTeam)||
   !Array.isArray(entry.cards)||entry.cards.length>RULES_PROFILE.monsterZones){
   throw new Error('Fila de banimento atrasado inválida.');
  }
  effects.add(entry.effectId);const uids=new Set<string>();
  for(const card of entry.cards){
   if(!card||typeof card.uid!=='string'||!card.uid||!isTeam(card.ownerTeam)||
    !Number.isSafeInteger(card.epoch)||card.epoch<0||uids.has(card.uid)){
    throw new Error('Identidade da fila de banimento atrasado inválida.');
   }
   uids.add(card.uid);
  }
 }
}
export function createBanishedReturnLedger():BanishedReturnLedger{
 return {version:1,lastSequence:0,pendingScout:[],processed:[],scoutUsed:[],returnAtEnd:[]};
}
function markProcessed(
 ledger:BanishedReturnLedger,event:BanishTransitionEvent,hash:string,status:BanishProcessed['status']
):BanishedReturnLedger{
 if(ledger.processed.length>=4096)throw new Error('Ledger de banidos atingiu 4096 eventos processados.');
 return {...ledger,lastSequence:event.sequence,processed:[...ledger.processed,{
  eventId:event.eventId,fingerprint:hash,sequence:event.sequence,status
 }]};
}
function assertTurnWindow(state:TagDuel,window:TurnWindow):void{
 if(!window||!Number.isSafeInteger(window.turn)||window.turn!==state.core.turn||
  !isTeam(window.turnTeam)||!isSeat(window.turnSeat)||window.turnTeam!==state.core.current||
  window.turnSeat!==state.cursor||state.active[window.turnTeam]!==window.turnSeat){
  throw new Error('Janela de resolução não corresponde ao turno/assento atual.');
 }
}
function assertEndPhase(state:TagDuel,window:TurnWindow):void{
 assertTurnWindow(state,window);
 if(state.core.turnEnding!==true||state.core.phase==='finished'){
  throw new Error('Retorno banido só resolve na janela da End Phase antes do descarte final.');
 }
}
function assertInventory(before:string[],after:string[]):void{
 if(before.length!==after.length||before.some((value,index)=>value!==after[index])){
  throw new Error('Resolução de banidos alterou o inventário físico.');
 }
}
function eligibleBanished(state:TagDuel,team:BanishedReturnTeam):Card[]{
 return (state.core.players[team].banished??[]).filter(card=>{
  if(card.entityKind==='token')return false;
  const info=getDuelCard(card.id);
  if(info?.kind!=='monster')return false;
  if((info.fusion||info.monsterType==='ritual')&&!card.properlySummoned)return false;
  return true;
 });
}
function freeMonsterZones(state:TagDuel,team:BanishedReturnTeam):number{
 return Math.max(0,RULES_PROFILE.monsterZones-state.core.players[team].monsters.length);
}
function validateSelection(state:TagDuel,team:BanishedReturnTeam,selected:readonly string[],required:number):Card[]{
 if(!Array.isArray(selected)||new Set(selected).size!==selected.length||selected.length!==required){
  throw new Error('Seleção precisa Invocar o máximo possível sem duplicar UIDs.');
 }
 const available=eligibleBanished(state,team),byUid=new Map(available.map(card=>[card.uid,card]));
 const result=selected.map(uid=>byUid.get(uid));
 if(result.some(card=>!card))throw new Error('Seleção contém monstro banido inelegível ou de outra equipe.');
 return result as Card[];
}
function makeMonster(card:Card,team:BanishedReturnTeam,turn:number):Monster{
 return {...card,owner:team,position:'atk',faceUp:true,entered:turn,changed:turn,attacked:0,atkBoost:0,defBoost:0};
}
function moveSelected(state:TagDuel,team:BanishedReturnTeam,cards:readonly Card[],turn:number):string[]{
 const banished=state.core.players[team].banished??=[];
 const summoned:string[]=[];
 for(const selected of cards){
  const index=banished.findIndex(card=>card.uid===selected.uid);
  if(index<0)throw new Error('Monstro deixou a zona banida antes da resolução.');
  const [card]=banished.splice(index,1);
  const ownerTeam=ownerTeamOfUid(state,card.uid);
  if(ownerTeam!==team)throw new Error('Monstro banido fora do time proprietário.');
  state.core.players[team].monsters.push(makeMonster(card,ownerTeam,turn));
  summoned.push(card.uid);
 }
 synchronizeCardLifetimes(state.core);
 return summoned;
}
function lpDelta(before:readonly [number,number],state:TagDuel):readonly [number,number]{
 return [state.core.players[0].lp-before[0],state.core.players[1].lp-before[1]];
}
function changedTeams(before:TagDuel,state:TagDuel):BanishedReturnTeam[]{
 const result:BanishedReturnTeam[]=[];
 for(const team of [0,1] as const){
  const oldPlayer=before.core.players[team],newPlayer=state.core.players[team];
  const oldMonsters=oldPlayer.monsters.map(card=>card.uid).sort().join('|');
  const newMonsters=newPlayer.monsters.map(card=>card.uid).sort().join('|');
  const oldBanished=(oldPlayer.banished??[]).map(card=>card.uid).sort().join('|');
  const newBanished=(newPlayer.banished??[]).map(card=>card.uid).sort().join('|');
  if(oldPlayer.lp!==newPlayer.lp||oldMonsters!==newMonsters||oldBanished!==newBanished)result.push(team);
 }
 return result;
}
function applyLifeCost(state:TagDuel,team:BanishedReturnTeam,cost:number):'paid'|'insufficient'|'lethal'{
 const player=state.core.players[team];
 if(!Number.isSafeInteger(cost)||cost<1||player.lp<cost)return 'insufficient';
 player.lp-=cost;
 if(player.lp<=0){
  state.core.phase='finished';state.core.turnEnding=false;
  state.core.winner=state.core.players[1-team].id;state.core.reason='pontos de vida';
  state.core.log.push(player.name+' perdeu ao pagar Pontos de Vida.');
  return 'lethal';
 }
 return 'paid';
}

/** Records the physical move into the owner's banished pile. The current
 * CardRef model has no face-down-banished bit; all represented banished cards
 * are therefore treated as face-up by this adapter. */
export function recordBanishTransition(
 state:TagDuel,ledger:BanishedReturnLedger,event:BanishTransitionEvent,
 lookups:BanishedReturnLookups
):BanishedRecordResult{
 assertRules(state);assertLedger(ledger);assertLookups(lookups);
 if(!event||event.kind!=='ioc-banish-transition')throw new Error('Evento de banimento inválido.');
 assertText(event.eventId,'ID do evento de banimento');assertText(event.cardUid,'UID do evento de banimento');
 if(!Number.isSafeInteger(event.sequence)||event.sequence<1||!Number.isSafeInteger(event.turn)||
  event.turn!==state.core.turn||event.toZone!=='banished'||
  !['deck','hand','monsters','backrow','extra','grave','field'].includes(event.fromZone)||
  !event.binding||event.binding.uid!==event.cardUid||event.binding.zone!==event.fromZone||
  !Number.isSafeInteger(event.binding.epoch)||event.binding.epoch<0||
  !['battle','effect','cost','send','discard','mill','other'].includes(event.reason)){
  throw new Error('Origem, destino, turno, motivo ou binding de banimento inválido.');
 }
 const hash=fingerprint(event);
 const previous=[...ledger.pendingScout,...ledger.processed].find(item=>item.eventId===event.eventId);
 if(previous){
  if(previous.fingerprint!==hash)throw new Error('Replay divergente de evento de banimento.');
  return {status:'duplicate',ledger};
 }
 if(event.sequence<=ledger.lastSequence)throw new Error('Sequência de banimento fora de ordem.');
 if(!movedToBanished(state,event.binding))return {status:'no-trigger',ledger:markProcessed(ledger,event,hash,'no-trigger')};
 const ownerTeam=ownerTeamOfUid(state,event.cardUid);
 const card=state.core.players[ownerTeam].banished?.find(item=>item.uid===event.cardUid);
 if(!card)throw new Error('Carta banida não está na zona física de seu time proprietário.');
 if(!cardKey(card.id,lookups)||cardKey(card.id,lookups)!=='dd-scout-plane'){
  return {status:'no-trigger',ledger:markProcessed(ledger,event,hash,'no-trigger')};
 }
 if(ledger.pendingScout.length>=4096)throw new Error('Ledger de gatilhos banidos atingiu o limite.');
 const pending:BanishPending={
  eventId:event.eventId,fingerprint:hash,sequence:event.sequence,turn:event.turn,
  cardUid:event.cardUid,ownerTeam,banishedEpoch:event.binding.epoch+1
 };
 return {status:'scheduled',ledger:{...ledger,lastSequence:event.sequence,pendingScout:[...ledger.pendingScout,pending]}};
}

export function resolveDDScoutPlaneEndPhase(
 input:TagDuel,ledger:BanishedReturnLedger,window:ScoutEndPhaseWindow
):BanishedReturnResult{
 assertRules(input);assertLedger(ledger);assertEndPhase(input,window);
 if(window?.kind!=='dd-scout-plane-end-phase'||typeof window.eventId!=='string'||!window.eventId.trim()||
  !isTeam(window.resolvingTeam)||!isSeat(window.resolvingSeat)||
  input.active[window.resolvingTeam]!==window.resolvingSeat||
  window.effectNegated!==undefined&&typeof window.effectNegated!=='boolean'){
  throw new Error('Janela D.D. Scout Plane inválida.');
 }
 const pending=ledger.pendingScout.find(item=>item.eventId===window.eventId);
 if(!pending)return {status:'no-target',state:input,ledger,changedTeams:[],summonedUids:[],banishedUids:[],lpDelta:[0,0]};
 if(window.resolvingTeam!==pending.ownerTeam||window.resolvingSeat!==input.active[pending.ownerTeam]){
  throw new Error('D.D. Scout Plane só resolve pelo assento ativo do time proprietário.');
 }
 const state=structuredClone(input),before=inventorySnapshot(input),lpBefore=[
  input.core.players[0].lp,input.core.players[1].lp
 ] as const;
 const banished=state.core.players[pending.ownerTeam].banished??[];
 const index=banished.findIndex(card=>card.uid===pending.cardUid);
 const current=currentBinding(input,pending.cardUid);
 const used=ledger.scoutUsed.some(item=>item.uid===pending.cardUid&&item.turn===pending.turn);
 let status:BanishedReturnResult['status']='no-target',summonedUids:string[]=[];
 let next:BanishedReturnLedger={...ledger,pendingScout:ledger.pendingScout.filter(item=>item.eventId!==pending.eventId)};
 if(ledger.processed.length>=4096)throw new Error('Ledger de retorno banido atingiu 4096 eventos processados.');
 if(used||pending.turn!==window.turn||!current||current.zone!=='banished'||
  current.epoch!==pending.banishedEpoch||index<0||freeMonsterZones(state,pending.ownerTeam)<1){
  next={...next,processed:[...next.processed,{eventId:pending.eventId,fingerprint:pending.fingerprint,sequence:pending.sequence,status:'no-target'}]};
 }else if(window.effectNegated){
  status='effect-negated';
  next={...next,scoutUsed:[...next.scoutUsed,{uid:pending.cardUid,turn:pending.turn}],
   processed:[...next.processed,{eventId:pending.eventId,fingerprint:pending.fingerprint,sequence:pending.sequence,status:'effect-negated'}]};
 }else{
  const [card]=banished.splice(index,1);
  state.core.players[pending.ownerTeam].monsters.push(makeMonster(card,pending.ownerTeam,state.core.turn));
  synchronizeCardLifetimes(state.core);
  summonedUids=[card.uid];status='summoned';
  next={...next,scoutUsed:[...next.scoutUsed,{uid:pending.cardUid,turn:pending.turn}],
   processed:[...next.processed,{eventId:pending.eventId,fingerprint:pending.fingerprint,sequence:pending.sequence,status:'summoned'}]};
 }
 assertRules(state);assertLedger(next);assertInventory(before,inventorySnapshot(state));
 return {status,state,ledger:next,changedTeams:changedTeams(input,state),summonedUids,banishedUids:[],lpDelta:lpDelta(lpBefore,state)};
}

export function resolveDimensionFusion(
 input:TagDuel,ledger:BanishedReturnLedger,window:DimensionFusionWindow
):BanishedReturnResult{
 assertRules(input);assertLedger(ledger);assertTurnWindow(input,window);
 if(window?.kind!=='dimension-fusion-resolution'||window.cardId!==DIMENSION_FUSION_ID||
  !isTeam(window.activatingTeam)||!isSeat(window.activatingSeat)||
  window.activatingTeam!==window.turnTeam||window.activatingSeat!==window.turnSeat||
  window.effectNegated!==undefined&&typeof window.effectNegated!=='boolean'){
  throw new Error('Janela Dimension Fusion inválida.');
 }
 const free=[freeMonsterZones(input,0),freeMonsterZones(input,1)];
 const available=[eligibleBanished(input,0),eligibleBanished(input,1)];
 const required=[Math.min(available[0].length,free[0]),Math.min(available[1].length,free[1])];
 if(required[0]+required[1]===0)return {status:'no-target',state:input,ledger,changedTeams:[],summonedUids:[],banishedUids:[],lpDelta:[0,0]};
 const state=structuredClone(input),before=inventorySnapshot(input),lpBefore=[
  input.core.players[0].lp,input.core.players[1].lp
 ] as const;
 const cost=applyLifeCost(state,window.activatingTeam,2000);
 if(cost==='insufficient')return {status:'insufficient-lp',state:input,ledger,changedTeams:[],summonedUids:[],banishedUids:[],lpDelta:[0,0]};
 if(cost==='lethal'){
  assertRules(state);assertInventory(before,inventorySnapshot(state));
  return {status:'lethal-cost',state,ledger,changedTeams:[window.activatingTeam],summonedUids:[],banishedUids:[],lpDelta:lpDelta(lpBefore,state)};
 }
 if(window.effectNegated){
  assertRules(state);assertInventory(before,inventorySnapshot(state));
  return {status:'effect-negated',state,ledger,changedTeams:[window.activatingTeam],summonedUids:[],banishedUids:[],lpDelta:lpDelta(lpBefore,state)};
 }
 if(!window.selectedByTeam)throw new Error('Dimension Fusion exige escolhas independentes dos dois times.');
 const chosen=[
  validateSelection(input,0,window.selectedByTeam[0],required[0]),
  validateSelection(input,1,window.selectedByTeam[1],required[1])
 ] as const;
 const summoned=[...moveSelected(state,0,chosen[0],state.core.turn),...moveSelected(state,1,chosen[1],state.core.turn)];
 assertRules(state);assertLedger(ledger);assertInventory(before,inventorySnapshot(state));
 return {status:'resolved',state,ledger,changedTeams:changedTeams(lpBefore,state),summonedUids:summoned,banishedUids:[],lpDelta:lpDelta(lpBefore,state)};
}

export function resolveReturnFromDifferentDimension(
 input:TagDuel,ledger:BanishedReturnLedger,window:ReturnDifferentDimensionWindow
):BanishedReturnResult{
 assertRules(input);assertLedger(ledger);assertTurnWindow(input,window);
 if(window?.kind!=='return-different-dimension-resolution'||window.cardId!==RETURN_FROM_DIFFERENT_DIMENSION_ID||
  typeof window.eventId!=='string'||!window.eventId.trim()||!isTeam(window.activatingTeam)||
  !isSeat(window.activatingSeat)||input.active[window.activatingTeam]!==window.activatingSeat||
  window.effectNegated!==undefined&&typeof window.effectNegated!=='boolean'){
  throw new Error('Janela Return from the Different Dimension inválida.');
 }
 const team=window.activatingTeam,available=eligibleBanished(input,team),required=Math.min(available.length,freeMonsterZones(input,team));
 if(required===0)return {status:'no-target',state:input,ledger,changedTeams:[],summonedUids:[],banishedUids:[],lpDelta:[0,0]};
 if(ledger.returnAtEnd.length>=4096)throw new Error('Fila de retorno End Phase atingiu o limite.');
 if(!window.effectNegated&& !window.selectedUids)throw new Error('Return from the Different Dimension exige seleção de monstros banidos.');
 const chosen=window.effectNegated?[]:validateSelection(input,team,window.selectedUids!,required);
 const state=structuredClone(input),before=inventorySnapshot(input),lpBefore=[
  input.core.players[0].lp,input.core.players[1].lp
 ] as const;
 const payment=Math.ceil(state.core.players[team].lp/2);
 const cost=applyLifeCost(state,team,payment);
 if(cost==='insufficient')return {status:'insufficient-lp',state:input,ledger,changedTeams:[],summonedUids:[],banishedUids:[],lpDelta:[0,0]};
 if(cost==='lethal'){
  assertRules(state);assertInventory(before,inventorySnapshot(state));
  return {status:'lethal-cost',state,ledger,changedTeams:[team],summonedUids:[],banishedUids:[],lpDelta:lpDelta(lpBefore,state)};
 }
 if(window.effectNegated){
  assertRules(state);assertInventory(before,inventorySnapshot(state));
  return {status:'effect-negated',state,ledger,changedTeams:[team],summonedUids:[],banishedUids:[],lpDelta:lpDelta(lpBefore,state)};
 }
 const summoned=moveSelected(state,team,chosen,state.core.turn);
 const cards:ReturnEndCard[]=summoned.map(uid=>{
  const binding=currentBinding(state,uid);
  if(!binding||binding.zone!=='monsters')throw new Error('Invocação banida sem binding de campo.');
  return {uid,ownerTeam:ownerTeamOfUid(state,uid),epoch:binding.epoch};
 });
 const next:BanishedReturnLedger={
  ...ledger,returnAtEnd:[...ledger.returnAtEnd,{
   effectId:window.eventId,turn:state.core.turn,activatingTeam:team,cards
  }]
 };
 assertRules(state);assertLedger(next);assertInventory(before,inventorySnapshot(state));
 return {status:'resolved',state,ledger:next,changedTeams:changedTeams(lpBefore,state),summonedUids:summoned,banishedUids:[],lpDelta:lpDelta(lpBefore,state)};
}

export function resolveReturnFromDifferentDimensionEndPhase(
 input:TagDuel,ledger:BanishedReturnLedger,window:ReturnEndPhaseWindow,
 lookups:BanishedReturnLookups
):BanishedReturnResult{
 assertRules(input);assertLedger(ledger);assertEndPhase(input,window);assertLookups(lookups);
 if(window?.kind!=='return-different-dimension-end-phase')throw new Error('Janela End Phase de retorno banido inválida.');
 const entries=ledger.returnAtEnd.filter(entry=>entry.turn===window.turn);
 if(entries.length===0)return {status:'no-target',state:input,ledger,changedTeams:[],summonedUids:[],banishedUids:[],lpDelta:[0,0]};
 const state=structuredClone(input),before=inventorySnapshot(input),lpBefore=[
  input.core.players[0].lp,input.core.players[1].lp
 ] as const;
 let next:BanishedReturnLedger={...ledger,returnAtEnd:ledger.returnAtEnd.filter(entry=>entry.turn!==window.turn)};
 const banishedUids:string[]=[],scheduledScoutUids:string[]=[];
 for(const entry of entries){
  for(const tracked of entry.cards){
   const binding=currentBinding(state,tracked.uid);
   if(!binding||binding.zone!=='monsters'||binding.epoch!==tracked.epoch)continue;
   const controllerTeam=state.core.players.findIndex(player=>player.monsters.some(card=>card.uid===tracked.uid));
   if(controllerTeam<0)continue;
   const index=state.core.players[controllerTeam].monsters.findIndex(card=>card.uid===tracked.uid);
   if(index<0)continue;
   const [monster]=state.core.players[controllerTeam].monsters.splice(index,1);
   const ownerTeam=ownerTeamOfUid(state,monster.uid);
   if(ownerTeam!==tracked.ownerTeam)throw new Error('Dono físico mudou durante Return from the Different Dimension.');
   const beforeBinding=binding;
   const card:Card={uid:monster.uid,id:monster.id,...monster.properlySummoned?{properlySummoned:true}:{}};
   (state.core.players[ownerTeam].banished??=[]).push(card);
   synchronizeCardLifetimes(state.core);banishedUids.push(monster.uid);
   if(lookups['dd-scout-plane'](monster.id)){
    const event:BanishTransitionEvent={
     kind:'ioc-banish-transition',eventId:entry.effectId+':end:'+monster.uid,
     sequence:next.lastSequence+1,turn:state.core.turn,cardUid:monster.uid,
     fromZone:'monsters',toZone:'banished',binding:beforeBinding,reason:'effect'
    };
    const recorded=recordBanishTransition(state,next,event,lookups);
    next=recorded.ledger;if(recorded.status==='scheduled')scheduledScoutUids.push(monster.uid);
   }
  }
 }
 assertRules(state);assertLedger(next);assertInventory(before,inventorySnapshot(state));
 return {status:'resolved',state,ledger:next,changedTeams:changedTeams(lpBefore,state),summonedUids:[],banishedUids,lpDelta:lpDelta(lpBefore,state)};
}
