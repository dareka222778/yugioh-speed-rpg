import {createHash} from 'node:crypto';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {getDuelCard} from './effectRegistry';
import {rulesFor,RULES_PROFILE} from './rulesProfile';
import {bindTarget,synchronizeCardLifetimes,type TargetBinding} from './cardLifetime';

export const BURNING_ALGAE_ID='41859700';
export const BURNING_ALGAE_KONAMI_CID=5877;
export const THING_IN_THE_CRATER_ID='78243409';
export const THING_IN_THE_CRATER_KONAMI_CID=5878;

export type GraveyardTransitionTeam=0|1;
export type GraveyardTransitionSeat=0|1|2|3;
export type GraveyardTransitionCard='burning-algae'|'thing-in-the-crater';
type Monster=TagDuel['core']['players'][number]['monsters'][number];

export type GraveyardTransitionLookups=Readonly<Record<GraveyardTransitionCard,(id:string)=>boolean>>;

export function createExactGraveyardTransitionLookups():GraveyardTransitionLookups{
 return {
  'burning-algae':id=>id===BURNING_ALGAE_ID,
  'thing-in-the-crater':id=>id===THING_IN_THE_CRATER_ID
 };
}

export type GraveyardSendEvent=Readonly<{
 kind:'ioc-graveyard-send';
 eventId:string;
 sequence:number;
 turn:number;
 cardUid:string;
 fromZone:TargetBinding['zone'];
 toZone:'grave';
 binding:TargetBinding;
 destroyed:boolean;
 reason:'battle'|'effect'|'cost'|'send'|'discard'|'mill'|'other';
}>;

export type GraveyardPending=Readonly<{
 eventId:string;
 fingerprint:string;
 sequence:number;
 turn:number;
 kind:GraveyardTransitionCard;
 cardUid:string;
 ownerTeam:GraveyardTransitionTeam;
 fromZone:TargetBinding['zone'];
 destroyed:boolean;
}>;

export type GraveyardProcessed=Readonly<{
 eventId:string;
 fingerprint:string;
 sequence:number;
 status:'no-trigger'|'resolved'|'declined'|'effect-negated'|'no-target'|'summoned';
}>;

export type GraveyardTransitionLedger=Readonly<{
 version:1;
 lastSequence:number;
 pending:readonly GraveyardPending[];
 processed:readonly GraveyardProcessed[];
}>;

export type GraveyardRecordResult=Readonly<{
 status:'scheduled'|'no-trigger'|'duplicate';
 ledger:GraveyardTransitionLedger;
}>;

export type GraveyardResolutionWindow=Readonly<{
 kind:'ioc-graveyard-resolution';
 eventId:string;
 turn:number;
 activeTeam:GraveyardTransitionTeam;
 activeSeat:GraveyardTransitionSeat;
 acceptThingInCrater?:boolean;
 pyroUid?:string;
 effectNegated?:boolean;
}>;

export type GraveyardResolutionResult=Readonly<{
 status:'resolved'|'declined'|'effect-negated'|'no-target'|'summoned';
 state:TagDuel;
 ledger:GraveyardTransitionLedger;
 changedTeams:readonly GraveyardTransitionTeam[];
 summonedUid:string|null;
 lpDelta:Readonly<[number,number]>;
}>;

const isTeam=(value:unknown):value is GraveyardTransitionTeam=>value===0||value===1;
const isSeat=(value:unknown):value is GraveyardTransitionSeat=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<=3;

function assertText(value:unknown,label:string):asserts value is string{
 if(typeof value!=='string'||!value.trim()||value.length>256)throw new Error(label+' inválido.');
}

function ownerSeatOfUid(state:TagDuel,uid:string):GraveyardTransitionSeat{
 const match=/^m([0-3]):(.+)$/.exec(uid);
 if(!match)throw new Error('UID físico sem assento proprietário.');
 const seat=Number(match[1]) as GraveyardTransitionSeat;
 if(state.members[seat]?.team!==seat%2)throw new Error('UID físico não corresponde ao assento proprietário.');
 return seat;
}

function assertRules(state:TagDuel):void{
 if(!state||state.version!==1||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||
  !Array.isArray(state.active)||state.active.length!==2||!Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
  !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation){
  throw new Error('Adapter IOC exige TagDuel clássico 2v2.');
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
 // Mão 6 é conferida apenas no encerramento do turno, nunca no meio da resolução.
}

function assertLookups(lookups:GraveyardTransitionLookups):void{
 if(!lookups||typeof lookups['burning-algae']!=='function'||typeof lookups['thing-in-the-crater']!=='function'){
  throw new Error('Lookups de transição IOC inválidos.');
 }
}

function cardKey(id:string,lookups:GraveyardTransitionLookups):GraveyardTransitionCard|null{
 if(lookups['burning-algae'](id))return 'burning-algae';
 if(lookups['thing-in-the-crater'](id))return 'thing-in-the-crater';
 return null;
}

function inventorySnapshot(state:TagDuel):string[]{
 return tagInventory(state).filter(card=>card.entityKind!=='token').map(card=>card.uid+'|'+card.id).sort();
}

function currentBinding(state:TagDuel,uid:string):TargetBinding|undefined{
 return bindTarget(state.core,uid);
}

function movedToGrave(state:TagDuel,binding:TargetBinding):boolean{
 const current=currentBinding(state,binding.uid);
 return !!current&&current.zone==='grave'&&current.epoch===binding.epoch+1;
}

function fingerprint(event:GraveyardSendEvent):string{
 return createHash('sha256').update(JSON.stringify([
  event.kind,event.eventId,event.sequence,event.turn,event.cardUid,event.fromZone,event.toZone,
  event.binding.uid,event.binding.zone,event.binding.epoch,event.destroyed,event.reason
 ])).digest('hex');
}

function assertLedger(ledger:GraveyardTransitionLedger):void{
 if(!ledger||ledger.version!==1||!Number.isSafeInteger(ledger.lastSequence)||ledger.lastSequence<0||
  !Array.isArray(ledger.pending)||ledger.pending.length>4096||
  !Array.isArray(ledger.processed)||ledger.processed.length>4096){
  throw new Error('Ledger de transição IOC inválido.');
 }
 const ids=new Set<string>(),sequences=new Set<number>();
 for(const item of [...ledger.pending,...ledger.processed]){
  if(!item||typeof item.eventId!=='string'||!item.eventId||ids.has(item.eventId)||
   !/^[a-f0-9]{64}$/.test(item.fingerprint)||!Number.isSafeInteger(item.sequence)||item.sequence<1||
   item.sequence>ledger.lastSequence||sequences.has(item.sequence)){
   throw new Error('Evento IOC duplicado ou inválido.');
  }
  ids.add(item.eventId);sequences.add(item.sequence);
 }
}

export function createGraveyardTransitionLedger():GraveyardTransitionLedger{
 return {version:1,lastSequence:0,pending:[],processed:[]};
}

function markProcessed(
 ledger:GraveyardTransitionLedger,event:GraveyardSendEvent,hash:string,
 status:GraveyardProcessed['status']
):GraveyardTransitionLedger{
 if(ledger.processed.length>=4096)throw new Error('Ledger IOC atingiu o limite de eventos processados.');
 return {...ledger,lastSequence:event.sequence,processed:[...ledger.processed,{
  eventId:event.eventId,fingerprint:hash,sequence:event.sequence,status
 }]};
}

/** Captures a physical transition into the owner's shared GY. Burning Algae
 * triggers from any source zone; The Thing in the Crater requires destruction
 * from the Monster Zone, then entry into the GY. */
export function recordGraveyardTransition(
 state:TagDuel,ledger:GraveyardTransitionLedger,event:GraveyardSendEvent,
 lookups:GraveyardTransitionLookups
):GraveyardRecordResult{
 assertRules(state);assertLedger(ledger);assertLookups(lookups);
 if(!event||event.kind!=='ioc-graveyard-send')throw new Error('Evento de envio ao GY inválido.');
 assertText(event.eventId,'ID do evento GY');assertText(event.cardUid,'UID do evento GY');
 if(!Number.isSafeInteger(event.sequence)||event.sequence<1||
  !Number.isSafeInteger(event.turn)||event.turn!==state.core.turn||
  event.toZone!=='grave'||!['deck','hand','monsters','backrow','extra','banished','field'].includes(event.fromZone)||
  !event.binding||event.binding.uid!==event.cardUid||event.binding.zone!==event.fromZone||
  !Number.isSafeInteger(event.binding.epoch)||event.binding.epoch<0||
  !['battle','effect','cost','send','discard','mill','other'].includes(event.reason)||
  typeof event.destroyed!=='boolean'){
  throw new Error('Origem, destino, turno, motivo ou binding do evento GY inválido.');
 }
 const hash=fingerprint(event);
 const previous=[...ledger.pending,...ledger.processed].find(item=>item.eventId===event.eventId);
 if(previous){
  if(previous.fingerprint!==hash)throw new Error('Replay divergente de evento GY.');
  return {status:'duplicate',ledger};
 }
 if(event.sequence<=ledger.lastSequence)throw new Error('Sequência de evento GY fora de ordem.');
 if(!movedToGrave(state,event.binding))return {status:'no-trigger',ledger:markProcessed(ledger,event,hash,'no-trigger')};
 const ownerSeat=ownerSeatOfUid(state,event.cardUid),ownerTeam=(ownerSeat%2) as GraveyardTransitionTeam;
 const card=state.core.players[ownerTeam].grave.find(item=>item.uid===event.cardUid);
 if(!card)throw new Error('Carta enviada ao GY não está no Cemitério do proprietário físico.');
 const kind=cardKey(card.id,lookups);
 const eligible=kind==='burning-algae'||
  kind==='thing-in-the-crater'&&event.fromZone==='monsters'&&event.destroyed;
 if(!eligible)return {status:'no-trigger',ledger:markProcessed(ledger,event,hash,'no-trigger')};
 if(ledger.pending.length>=4096)throw new Error('Ledger IOC atingiu o limite de eventos pendentes.');
 const pending:GraveyardPending={
  eventId:event.eventId,fingerprint:hash,sequence:event.sequence,turn:event.turn,
  kind:kind!,cardUid:event.cardUid,ownerTeam,fromZone:event.fromZone,destroyed:event.destroyed
 };
 return {status:'scheduled',ledger:{...ledger,lastSequence:event.sequence,pending:[...ledger.pending,pending]}};
}

export function resolveGraveyardTransition(
 input:TagDuel,ledger:GraveyardTransitionLedger,window:GraveyardResolutionWindow
):GraveyardResolutionResult{
 assertRules(input);assertLedger(ledger);
 if(window?.kind!=='ioc-graveyard-resolution'||typeof window.eventId!=='string'||!window.eventId.trim()||
  !Number.isSafeInteger(window.turn)||window.turn!==input.core.turn||
  !isTeam(window.activeTeam)||!isSeat(window.activeSeat)||window.activeTeam!==input.core.current||
  window.activeSeat!==input.cursor||input.active[window.activeTeam]!==window.activeSeat||
  window.acceptThingInCrater!==undefined&&typeof window.acceptThingInCrater!=='boolean'||
  window.effectNegated!==undefined&&typeof window.effectNegated!=='boolean'){
  throw new Error('Janela de resolução GY IOC não corresponde ao assento ativo.');
 }
 const pending=ledger.pending.find(item=>item.eventId===window.eventId);
 if(!pending)return {status:'no-target',state:input,ledger,changedTeams:[],summonedUid:null,lpDelta:[0,0]};
 if(ledger.processed.length>=4096)throw new Error('Ledger IOC atingiu o limite de eventos processados.');
 if(window.pyroUid!==undefined&&(typeof window.pyroUid!=='string'||!window.pyroUid.trim())){
  throw new Error('UID Pyro inválido na janela de resolução IOC.');
 }
 const state=structuredClone(input),before=inventorySnapshot(input),lpBefore=[
  state.core.players[0].lp,state.core.players[1].lp
 ] as const;
 let status:GraveyardResolutionResult['status']='resolved',summonedUid:string|null=null;
 if(window.effectNegated){
  status='effect-negated';
 }else if(pending.kind==='burning-algae'){
  const opponentTeam=(1-pending.ownerTeam) as GraveyardTransitionTeam;
  state.core.players[opponentTeam].lp+=1000;
 }else if(window.acceptThingInCrater!==true){
  status='declined';
 }else{
  const ownerTeam=pending.ownerTeam;
  if(state.core.players[ownerTeam].monsters.length>=RULES_PROFILE.monsterZones||!window.pyroUid){
   status='no-target';
  }else{
   const ownerActiveSeat=state.active[ownerTeam],hand=state.core.players[ownerTeam].hand;
   const index=hand.findIndex(card=>card.uid===window.pyroUid);
   if(index<0||ownerSeatOfUid(state,window.pyroUid)!==ownerActiveSeat){
    throw new Error('The Thing in the Crater só pode usar a mão privada do assento ativo de sua equipe.');
   }
   const candidate=hand[index],info=getDuelCard(candidate.id);
   if(!info||info.kind!=='monster'||info.race!=='Pyro'||candidate.entityKind==='token'){
    throw new Error('The Thing in the Crater exige um Monstro Pyro na mão.');
   }
   const card=hand.splice(index,1)[0];
   const monster:Monster={
    ...card,position:'atk',faceUp:true,entered:state.core.turn,changed:state.core.turn,
    attacked:0,atkBoost:0,defBoost:0,owner:ownerTeam
   };
   state.core.players[ownerTeam].monsters.push(monster);
   synchronizeCardLifetimes(state.core);
   summonedUid=monster.uid;status='summoned';
  }
 }
 const nextLedger:GraveyardTransitionLedger={
  ...ledger,pending:ledger.pending.filter(item=>item.eventId!==pending.eventId),
  processed:[...ledger.processed,{
   eventId:pending.eventId,fingerprint:pending.fingerprint,sequence:pending.sequence,status
  }]
 };
 assertRules(state);
 const after=inventorySnapshot(state);
 if(before.length!==after.length||before.some((value,index)=>value!==after[index])){
  throw new Error('Resolução GY IOC alterou o inventário físico.');
 }
 const lpAfter=[state.core.players[0].lp,state.core.players[1].lp] as const;
 const changedTeams:GraveyardTransitionTeam[]=[];
 for(const team of [0,1] as const)if(lpAfter[team]!==lpBefore[team])changedTeams.push(team);
 return {
  status,state,ledger:nextLedger,changedTeams,summonedUid,
  lpDelta:[lpAfter[0]-lpBefore[0],lpAfter[1]-lpBefore[1]]
 };
}
