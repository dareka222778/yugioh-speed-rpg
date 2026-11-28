import {createHash} from 'node:crypto';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {bindTarget,synchronizeCardLifetimes,targetBindingValid,type TargetBinding} from './cardLifetime';
import {randomIndex} from './duelRandom';
import {monsterEffectsNegated} from './continuousEffects';
import {cleanEquips} from './classicEffects';

export const GIGANTES_ID='47606319';
export const GIGANTES_KONAMI_CID=5831;
export const FENRIR_ID='00218704';
export const FENRIR_KONAMI_CID=5830;
export const INFERNO_ID='74823665';
export const INFERNO_KONAMI_CID=5829;
export const SILPHEED_ID='73001017';
export const SILPHEED_KONAMI_CID=5832;

export type IocTeam=0|1;
export type IocSeat=0|1|2|3;
export type IocAttribute='EARTH'|'WATER'|'FIRE'|'WIND';
export type IocCardKey='gigantes'|'fenrir'|'inferno'|'silpheed';
type Monster=TagDuel['core']['players'][number]['monsters'][number];
type Card=TagDuel['core']['players'][number]['grave'][number];

export type InvasionChaosLookups=Readonly<Record<IocCardKey,(id:string)=>boolean>>;

export function createExactInvasionChaosLookups():InvasionChaosLookups{
 return {
  gigantes:id=>id===GIGANTES_ID,
  fenrir:id=>id===FENRIR_ID,
  inferno:id=>id===INFERNO_ID,
  silpheed:id=>id===SILPHEED_ID
 };
}

export type InvasionChaosSummonResult=Readonly<{
 status:'summoned'|'no-space';
 state:TagDuel;
 summonedUid:string|null;
 banishedCostUids:readonly string[];
}>;

export type IocBattleSourceDestroyedEvent=Readonly<{
 kind:'ioc-attribute-source-destroyed';
 eventId:string;
 sequence:number;
 turn:number;
 sourceUid:string;
 controllerTeam:IocTeam;
 destruction:'battle'|'effect';
 destination:'grave'|'banished';
 sourceBinding:TargetBinding;
}>;

export type IocBattleTargetDestroyedEvent=Readonly<{
 kind:'ioc-attribute-target-destroyed';
 eventId:string;
 sequence:number;
 turn:number;
 sourceUid:string;
 sourceControllerTeam:IocTeam;
 sourceBinding:TargetBinding;
 targetUid:string;
 targetControllerTeam:IocTeam;
 targetDestination:'grave'|'banished'|'hand'|'deck'|'extra';
 targetBinding:TargetBinding;
 destruction:'battle';
}>;

export type IocBattleEvent=IocBattleSourceDestroyedEvent|IocBattleTargetDestroyedEvent;
export type IocTriggerKind=IocCardKey;

export type IocPendingTrigger=Readonly<{
 eventId:string;
 fingerprint:string;
 sequence:number;
 turn:number;
 kind:IocTriggerKind;
 sourceUid:string;
 sourceTeam:IocTeam;
 targetUid?:string;
 targetDestination?:'grave'|'banished'|'hand'|'deck'|'extra';
}>;

export type IocProcessedTrigger=Readonly<{
 eventId:string;
 fingerprint:string;
 sequence:number;
 status:'no-trigger'|'resolved'|'effect-negated'|'no-target';
}>;

export type IocDrawSkip=Readonly<{
 eventId:string;
 sourceUid:string;
 team:IocTeam;
 dueTurn:number;
}>;

export type InvasionChaosLedger=Readonly<{
 version:1;
 lastSequence:number;
 pending:readonly IocPendingTrigger[];
 processed:readonly IocProcessedTrigger[];
 drawSkips:readonly IocDrawSkip[];
}>;

export type IocRecordResult=Readonly<{
 status:'scheduled'|'no-trigger'|'duplicate';
 ledger:InvasionChaosLedger;
}>;

export type IocResolutionWindow=Readonly<{
 kind:'ioc-attribute-trigger-window';
 eventId:string;
 turn:number;
 activeTeam:IocTeam;
 activeSeat:IocSeat;
 effectNegated?:boolean;
}>;

export type IocResolutionResult=Readonly<{
 status:'resolved'|'effect-negated'|'no-target'|'skip-scheduled';
 state:TagDuel;
 ledger:InvasionChaosLedger;
 affectedUids:readonly string[];
 discardedUid:string|null;
 damage:number;
}>;

export type IocDrawSkipResult=Readonly<{
 skip:boolean;
 ledger:InvasionChaosLedger;
 sourceUid:string|null;
}>;

const isTeam=(value:unknown):value is IocTeam=>value===0||value===1;
const isSeat=(value:unknown):value is IocSeat=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<=3;

function assertText(value:unknown,label:string):asserts value is string{
 if(typeof value!=='string'||!value.trim()||value.length>256)throw new Error(label+' inválido.');
}

function assertClassicShape(state:TagDuel):void{
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
}

export function assertInvasionChaosRules(state:TagDuel):void{
 assertClassicShape(state);
 const rules=rulesFor(state.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 }
 for(const player of state.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones compartilhadas.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones compartilhadas.');
 }
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const card of tagInventory(state).filter(item=>item.entityKind!=='token')){
  const seat=ownerSeatOfUid(state,card.uid);
  const info=getDuelCard(card.id);
  if(!info)throw new Error('Carta física sem metadata habilitado.');
  if(info.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A mão pode ultrapassar seis durante o turno; a conferência ocorre somente na End Phase.
}

function ownerSeatOfUid(state:TagDuel,uid:string):IocSeat{
 const match=/^m([0-3]):(.+)$/.exec(uid);
 if(!match)throw new Error('UID físico sem assento proprietário verificável.');
 const seat=Number(match[1]) as IocSeat;
 if(state.members[seat]?.team!==seat%2)throw new Error('UID físico não corresponde ao proprietário do assento.');
 return seat;
}

function cardKey(id:string,lookups:InvasionChaosLookups):IocCardKey|null{
 for(const key of ['gigantes','fenrir','inferno','silpheed'] as const)if(lookups[key](id))return key;
 return null;
}

function assertLookups(lookups:InvasionChaosLookups):void{
 if(!lookups||['gigantes','fenrir','inferno','silpheed'].some(key=>typeof lookups[key as IocCardKey]!=='function')){
  throw new Error('Lookups IOC inválidos.');
 }
}

/** These four IOC monsters are Special-Summon-only; the procedure does not
 * consume the team's Normal Summon and cannot be replaced by Normal Set. */
export function isInvasionChaosSpecialSummonOnly(id:string,lookups:InvasionChaosLookups):boolean{
 assertLookups(lookups);
 return cardKey(id,lookups)!==null;
}

export function assertInvasionChaosNormalSummonForbidden(id:string,lookups:InvasionChaosLookups):void{
 if(isInvasionChaosSpecialSummonOnly(id,lookups))throw new Error('Monstro IOC não pode ser Invocado por Invocação-Normal nem Baixado.');
}

function requiredCost(key:IocCardKey):Readonly<{attribute:IocAttribute;count:number}>{
 if(key==='gigantes')return {attribute:'EARTH',count:1};
 if(key==='fenrir')return {attribute:'WATER',count:2};
 if(key==='inferno')return {attribute:'FIRE',count:1};
 return {attribute:'WIND',count:1};
}

function inventorySnapshot(state:TagDuel):string[]{
 return tagInventory(state).filter(card=>card.entityKind!=='token').map(card=>card.uid+'|'+card.id).sort();
}

/** Special Summon procedure, not an activated effect: the active physical seat
 * supplies the card from its own private hand; costs come from the team's GY. */
export function specialSummonInvasionChaosFromHand(
 input:TagDuel,seat:IocSeat,candidateUid:string,costUids:readonly string[],
 lookups:InvasionChaosLookups
):InvasionChaosSummonResult{
 assertInvasionChaosRules(input);assertLookups(lookups);
 if(!isSeat(seat)||seat!==input.cursor||input.active[seat%2]!==seat)throw new Error('Somente o assento físico ativo pode executar o procedimento.');
 assertText(candidateUid,'UID do candidato IOC');
 const team=(seat%2) as IocTeam;
 const hand=input.core.players[team].hand;
 const handIndex=hand.findIndex(card=>card.uid===candidateUid);
 if(handIndex<0)throw new Error('O monstro IOC deve estar na mão privada do assento ativo.');
 const candidate=hand[handIndex],key=cardKey(candidate.id,lookups);
 if(!key)throw new Error('A carta não pertence à família IOC de Invocação-Especial.');
 const info=getDuelCard(candidate.id);
 if(!info||info.kind!=='monster'||info.fusion)throw new Error('Candidato IOC não é um Monstro habilitado no fixture.');
 const requirement=requiredCost(key);
 if(!Array.isArray(costUids)||costUids.length!==requirement.count||new Set(costUids).size!==costUids.length){
  throw new Error('Quantidade ou identidade de custos IOC inválida.');
 }
 if(input.core.players[team].monsters.length>=RULES_PROFILE.monsterZones){
  return {status:'no-space',state:input,summonedUid:null,banishedCostUids:[]};
 }
 const grave=input.core.players[team].grave;
 const costs=costUids.map(uid=>grave.find(card=>card.uid===uid));
 if(costs.some(card=>!card))throw new Error('O custo deve estar no Cemitério compartilhado da equipe.');
 for(const card of costs){
  const costInfo=getDuelCard(card!.id);
  if(!costInfo||costInfo.kind!=='monster'||costInfo.attribute!==requirement.attribute||card!.entityKind==='token'){
   throw new Error('Custo de atributo incorreto para '+key+'.');
  }
 }
 const before=inventorySnapshot(input),state=structuredClone(input);
 const nextHand=state.core.players[team].hand,index=nextHand.findIndex(card=>card.uid===candidateUid);
 if(index<0)throw new Error('A mão privada mudou antes da resolução.');
 const summoned=nextHand.splice(index,1)[0];
 const nextGrave=state.core.players[team].grave;
 const nextBanished=state.core.players[team].banished??=[];
 state.core.players[team].banished=nextBanished;
 for(const uid of costUids){
  const costIndex=nextGrave.findIndex(card=>card.uid===uid);
  if(costIndex<0)throw new Error('Custo IOC deixou o Cemitério antes da resolução.');
  nextBanished.push(nextGrave.splice(costIndex,1)[0]);
 }
 const monster:Monster={
  ...summoned,position:'atk',faceUp:true,entered:state.core.turn,changed:state.core.turn,
  attacked:0,atkBoost:0,defBoost:0,owner:team
 };
 state.core.players[team].monsters.push(monster);
 synchronizeCardLifetimes(state.core);
 assertInvasionChaosRules(state);
 const after=inventorySnapshot(state);
 if(before.length!==after.length||before.some((value,index)=>value!==after[index]))throw new Error('Invocação IOC alterou o inventário físico.');
 return {status:'summoned',state,summonedUid:monster.uid,banishedCostUids:[...costUids]};
}

function assertLedger(ledger:InvasionChaosLedger):void{
 if(!ledger||ledger.version!==1||!Number.isSafeInteger(ledger.lastSequence)||ledger.lastSequence<0||
  !Array.isArray(ledger.pending)||ledger.pending.length>4096||
  !Array.isArray(ledger.processed)||ledger.processed.length>4096||
  !Array.isArray(ledger.drawSkips)||ledger.drawSkips.length>4096){
  throw new Error('Ledger IOC inválido.');
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
 const skipIds=new Set<string>();
 for(const item of ledger.drawSkips){
  if(!item||typeof item.eventId!=='string'||!item.eventId||skipIds.has(item.eventId)||
   typeof item.sourceUid!=='string'||!item.sourceUid||!isTeam(item.team)||
   !Number.isSafeInteger(item.dueTurn)||item.dueTurn<1)throw new Error('Agendamento de Draw Phase IOC inválido.');
  skipIds.add(item.eventId);
 }
}

export function createInvasionChaosLedger():InvasionChaosLedger{
 return {version:1,lastSequence:0,pending:[],processed:[],drawSkips:[]};
}

function eventFingerprint(event:IocBattleEvent):string{
 if(event.kind==='ioc-attribute-source-destroyed'){
  return createHash('sha256').update(JSON.stringify([
   event.kind,event.eventId,event.sequence,event.turn,event.sourceUid,event.controllerTeam,
   event.destruction,event.destination,event.sourceBinding.uid,event.sourceBinding.zone,event.sourceBinding.epoch
  ])).digest('hex');
 }
 return createHash('sha256').update(JSON.stringify([
  event.kind,event.eventId,event.sequence,event.turn,event.sourceUid,event.sourceControllerTeam,
  event.sourceBinding.uid,event.sourceBinding.zone,event.sourceBinding.epoch,event.targetUid,
  event.targetControllerTeam,event.targetDestination,event.targetBinding.uid,event.targetBinding.zone,event.targetBinding.epoch,
  event.destruction
 ])).digest('hex');
}

function markProcessed(
 ledger:InvasionChaosLedger,event:IocBattleEvent,fingerprint:string,
 status:IocProcessedTrigger['status']
):InvasionChaosLedger{
 if(ledger.processed.length>=4096)throw new Error('Ledger IOC atingiu o limite de eventos processados.');
 return {...ledger,lastSequence:event.sequence,processed:[...ledger.processed,{
  eventId:event.eventId,fingerprint,sequence:event.sequence,status
 }]};
}

function currentBinding(state:TagDuel,uid:string):TargetBinding|undefined{
 return bindTarget(state.core,uid);
}

function movedBindingMatches(state:TagDuel,binding:TargetBinding,destination:TargetBinding['zone']):boolean{
 const current=currentBinding(state,binding.uid);
 return !!current&&current.zone===destination&&current.epoch===binding.epoch+1;
}

/** Capture after physical movement. Source-destroyed triggers belong to the
 * physical owner; attack triggers belong to the team controlling the attacker. */
export function recordInvasionChaosBattleEvent(
 state:TagDuel,ledger:InvasionChaosLedger,event:IocBattleEvent,lookups:InvasionChaosLookups
):IocRecordResult{
 assertInvasionChaosRules(state);assertLedger(ledger);assertLookups(lookups);
 if(!event||!['ioc-attribute-source-destroyed','ioc-attribute-target-destroyed'].includes(event.kind)){
  throw new Error('Tipo de evento IOC inválido.');
 }
 assertText(event.eventId,'ID do evento IOC');
 if(!Number.isSafeInteger(event.sequence)||event.sequence<1||!Number.isSafeInteger(event.turn)||
  event.turn!==state.core.turn||!isTeam(event.kind==='ioc-attribute-source-destroyed'?event.controllerTeam:event.sourceControllerTeam)){
  throw new Error('Sequência, turno ou equipe do evento IOC inválidos.');
 }
 if(event.kind==='ioc-attribute-source-destroyed'){
  if(!event.sourceBinding||event.sourceBinding.uid!==event.sourceUid||event.sourceBinding.zone!=='monsters')throw new Error('Binding de origem IOC inválido.');
 }else if(!event.sourceBinding||event.sourceBinding.uid!==event.sourceUid||event.sourceBinding.zone!=='monsters'||
  !event.targetBinding||event.targetBinding.uid!==event.targetUid||event.targetBinding.zone!=='monsters'){
  throw new Error('Bindings de batalha IOC inválidos.');
 }
 const fingerprint=eventFingerprint(event);
 const previous=[...ledger.pending,...ledger.processed].find(item=>item.eventId===event.eventId);
 if(previous){
  if(previous.fingerprint!==fingerprint)throw new Error('Replay divergente de evento IOC.');
  return {status:'duplicate',ledger};
 }
 if(event.sequence<=ledger.lastSequence)throw new Error('Sequência de evento IOC fora de ordem.');
 let kind:IocCardKey|null=null,sourceTeam:IocTeam,sourceUid=event.sourceUid,targetUid:string|undefined,targetDestination:IocPendingTrigger['targetDestination'];
 if(event.kind==='ioc-attribute-source-destroyed'){
  assertText(event.sourceUid,'UID da carta IOC destruída');
  if(event.destruction!=='battle'||event.destination!=='grave'||
   !event.sourceBinding||event.sourceBinding.uid!==event.sourceUid||event.sourceBinding.zone!=='monsters'||
   !Number.isSafeInteger(event.sourceBinding.epoch)||event.sourceBinding.epoch<0||
   !movedBindingMatches(state,event.sourceBinding,'grave')){
   return {status:'no-trigger',ledger:markProcessed(ledger,event,fingerprint,'no-trigger')};
  }
  const ownerSeat=ownerSeatOfUid(state,event.sourceUid),ownerTeam=(ownerSeat%2) as IocTeam;
  const grave=state.core.players[ownerTeam].grave.find(card=>card.uid===event.sourceUid);
  if(!grave)throw new Error('Monstro destruído não está no Cemitério de seu proprietário físico.');
  kind=cardKey(grave.id,lookups);sourceTeam=ownerTeam;
  if(kind!=='gigantes'&&kind!=='silpheed')kind=null;
 }else{
  assertText(event.sourceUid,'UID do atacante IOC');assertText(event.targetUid,'UID do alvo destruído');
  if(event.destruction!=='battle'||!isTeam(event.sourceControllerTeam)||!isTeam(event.targetControllerTeam)||
   event.sourceControllerTeam===event.targetControllerTeam||
   !event.sourceBinding||event.sourceBinding.uid!==event.sourceUid||event.sourceBinding.zone!=='monsters'||
   !targetBindingValid(state.core,event.sourceBinding)||
   !event.targetBinding||event.targetBinding.uid!==event.targetUid||event.targetBinding.zone!=='monsters'||
   !movedBindingMatches(state,event.targetBinding,event.targetDestination)){
   return {status:'no-trigger',ledger:markProcessed(ledger,event,fingerprint,'no-trigger')};
  }
  const source=state.core.players[event.sourceControllerTeam].monsters.find(card=>card.uid===event.sourceUid);
  if(!source||!source.faceUp||source.position!=='atk'||monsterEffectsNegated(state.core,event.sourceUid))return {status:'no-trigger',ledger:markProcessed(ledger,event,fingerprint,'no-trigger')};
  kind=cardKey(source.id,lookups);sourceTeam=event.sourceControllerTeam;
  targetUid=event.targetUid;targetDestination=event.targetDestination;
  if(kind==='inferno'&&targetDestination!=='grave')kind=null;
  if(kind!=='inferno'&&kind!=='fenrir')kind=null;
 }
 if(!kind)return {status:'no-trigger',ledger:markProcessed(ledger,event,fingerprint,'no-trigger')};
 if(ledger.pending.length>=4096)throw new Error('Ledger IOC atingiu o limite de eventos pendentes.');
 const pending:IocPendingTrigger={
  eventId:event.eventId,fingerprint,sequence:event.sequence,turn:event.turn,kind,sourceUid,sourceTeam,
  ...(targetUid?{targetUid}:{}),...(targetDestination?{targetDestination}:{})
 };
 return {status:'scheduled',ledger:{...ledger,lastSequence:event.sequence,pending:[...ledger.pending,pending]}};
}

export function resolveInvasionChaosBattleTrigger(
 input:TagDuel,ledger:InvasionChaosLedger,window:IocResolutionWindow
):IocResolutionResult{
 assertInvasionChaosRules(input);assertLedger(ledger);
 if(window?.kind!=='ioc-attribute-trigger-window'||typeof window.eventId!=='string'||!window.eventId.trim()||
  !Number.isSafeInteger(window.turn)||window.turn!==input.core.turn||
  !isTeam(window.activeTeam)||!isSeat(window.activeSeat)||window.activeTeam!==input.core.current||
  window.activeSeat!==input.cursor||input.active[window.activeTeam]!==window.activeSeat||
  window.effectNegated!==undefined&&typeof window.effectNegated!=='boolean'){
  throw new Error('Janela de resolução IOC não corresponde ao assento ativo.');
 }
 const pending=ledger.pending.find(item=>item.eventId===window.eventId);
 if(!pending)return {status:'no-target',state:input,ledger,affectedUids:[],discardedUid:null,damage:0};
 const state=structuredClone(input),affected:string[]=[];
 let status:IocResolutionResult['status']='resolved',discardedUid:string|null=null,damage=0;
 if(window.effectNegated){
  status='effect-negated';
 }else if(pending.kind==='gigantes'){
  for(let team=0;team<2;team++){
   const player=state.core.players[team];
   const backrow=player.backrow.splice(0);
   const field=player.field?[player.field]:[];
   player.field=null;
   for(const card of [...backrow,...field]){
    const ownerSeat=ownerSeatOfUid(state,card.uid),ownerTeam=ownerSeat%2;
    state.core.players[ownerTeam].grave.push({uid:card.uid,id:card.id});
    affected.push(card.uid);
   }
  }
  cleanEquips(state.core);synchronizeCardLifetimes(state.core);
 }else if(pending.kind==='silpheed'){
  const opponentTeam=(1-pending.sourceTeam) as IocTeam;
  const hand=state.core.players[opponentTeam].hand;
  if(hand.length){
   if(!state.core.random)throw new Error('Silpheed exige o fluxo HMAC persistido do Duelo.');
   const index=randomIndex(state.core.random,hand.length),card=hand.splice(index,1)[0];
   const ownerSeat=ownerSeatOfUid(state,card.uid),ownerTeam=ownerSeat%2;
   state.core.players[ownerTeam].grave.push({uid:card.uid,id:card.id});
   discardedUid=card.uid;affected.push(card.uid);synchronizeCardLifetimes(state.core);
  }else status='no-target';
 }else if(pending.kind==='inferno'){
  const opponentTeam=(1-pending.sourceTeam) as IocTeam;
  state.core.players[opponentTeam].lp-=1500;damage=1500;
 }else{
  const opponentTeam=(1-pending.sourceTeam) as IocTeam;
  const dueTurn=pending.turn+(state.core.current===pending.sourceTeam?1:2);
  const drawSkips=[...ledger.drawSkips,{eventId:pending.eventId,sourceUid:pending.sourceUid,team:opponentTeam,dueTurn}];
  status='skip-scheduled';
  const processed:InvasionChaosLedger={...ledger,pending:ledger.pending.filter(item=>item.eventId!==pending.eventId),
   processed:[...ledger.processed,{eventId:pending.eventId,fingerprint:pending.fingerprint,sequence:pending.sequence,status:'resolved'}],
   drawSkips};
  assertInvasionChaosRules(state);
  return {status,state,ledger:processed,affectedUids:[],discardedUid:null,damage:0};
 }
 const nextLedger:InvasionChaosLedger={
  ...ledger,pending:ledger.pending.filter(item=>item.eventId!==pending.eventId),
  processed:[...ledger.processed,{eventId:pending.eventId,fingerprint:pending.fingerprint,sequence:pending.sequence,status}]
 };
 assertInvasionChaosRules(state);
 const before=inventorySnapshot(input),after=inventorySnapshot(state);
 if(before.length!==after.length||before.some((value,index)=>value!==after[index]))throw new Error('Resolução IOC alterou o inventário físico.');
 return {status,state,ledger:nextLedger,affectedUids:affected,discardedUid,damage};
}

/** Consume one queued Draw Phase skip. Additional simultaneous skips are
 * carried to the following team turn, so one effect cannot erase several turns. */
export function consumeInvasionChaosDrawSkip(
 ledger:InvasionChaosLedger,team:IocTeam,turn:number
):IocDrawSkipResult{
 assertLedger(ledger);
 if(!isTeam(team)||!Number.isSafeInteger(turn)||turn<1)throw new Error('Consumo de Draw Phase IOC inválido.');
 const due=ledger.drawSkips.filter(item=>item.team===team&&item.dueTurn===turn);
 if(!due.length)return {skip:false,ledger,sourceUid:null};
 const [first,...remaining]=due;
 const next:InvasionChaosLedger={
  ...ledger,
  drawSkips:ledger.drawSkips.filter(item=>!(item.team===team&&item.dueTurn===turn))
   .concat(remaining.map(item=>({...item,dueTurn:turn+2})))
 };
 assertLedger(next);
 return {skip:true,ledger:next,sourceUid:first.sourceUid};
}
