import {createHash} from 'node:crypto';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {synchronizeCardLifetimes} from './cardLifetime';
import {shuffleDuel} from './duelRandom';

export const THE_FIRST_SARCOPHAGUS_ID='31076103';
export const THE_FIRST_SARCOPHAGUS_KONAMI_CID=6063;
export const THE_SECOND_SARCOPHAGUS_ID='04081094';
export const THE_SECOND_SARCOPHAGUS_KONAMI_CID=6062;
export const THE_THIRD_SARCOPHAGUS_ID='78697395';
export const THE_THIRD_SARCOPHAGUS_KONAMI_CID=6061;
export const SPIRIT_OF_THE_PHARAOH_ID='25343280';
export const SPIRIT_OF_THE_PHARAOH_KONAMI_CID=6024;

export type SarcophagusTeam=0|1;
export type SarcophagusSeat=0|1|2|3;
export type SarcophagusPiece='second'|'third';
type Monster=TagDuel['core']['players'][number]['monsters'][number];
type Backrow=TagDuel['core']['players'][number]['backrow'][number];
type PhysicalCard=ReturnType<typeof tagInventory>[number];

export type SarcophagusLookups=Readonly<{
 first:(id:string)=>boolean;
 second:(id:string)=>boolean;
 third:(id:string)=>boolean;
 spirit:(id:string)=>boolean;
}>;

export function createExactSarcophagusLookups():SarcophagusLookups{
 return {
  first:id=>id===THE_FIRST_SARCOPHAGUS_ID,
  second:id=>id===THE_SECOND_SARCOPHAGUS_ID,
  third:id=>id===THE_THIRD_SARCOPHAGUS_ID,
  spirit:id=>id===SPIRIT_OF_THE_PHARAOH_ID
 };
}

export type SarcophagusEndPhaseEvent=Readonly<{
 kind:'sarcophagus-end-phase';
 eventId:string;
 sequence:number;
 turn:number;
 actorSeat:SarcophagusSeat;
 phase:'end';
 sourceUid:string;
 negatedSourceUids?:readonly string[];
}>;

export type SarcophagusCandidate=Readonly<{
 sourceUid:string;
 controllerTeam:SarcophagusTeam;
 recipientSeat:SarcophagusSeat;
 nextPiece:SarcophagusPiece;
 handUids:readonly string[];
 deckUids:readonly string[];
 stateFingerprint:string;
}>;

export type SarcophagusPending=Readonly<{
 event:SarcophagusEndPhaseEvent;
 fingerprint:string;
 candidate:SarcophagusCandidate;
}>;

export type SarcophagusProcessed=Readonly<{
 eventId:string;
 fingerprint:string;
 choiceFingerprint:string;
 status:string;
 turn:number;
 sourceUid:string;
}>;

export type SarcophagusSpiritSummon=Readonly<{
 uid:string;
 team:SarcophagusTeam;
 turn:number;
 sourceEventId:string;
 effectUsed:boolean;
}>;

export type SarcophagusLedger=Readonly<{
 version:1;
 lastSequence:number;
 pending:readonly SarcophagusPending[];
 processed:readonly SarcophagusProcessed[];
 lastUseBySource:readonly Readonly<{sourceUid:string;turn:number}>[];
 spiritSummons:readonly SarcophagusSpiritSummon[];
}>;

export type SarcophagusCapture=Readonly<{
 status:'pending-resolution'|'no-trigger'|'no-target'|'zone-full'|'duplicate';
 ledger:SarcophagusLedger;
 candidate:SarcophagusCandidate|null;
}>;

export type SarcophagusChoice=Readonly<{
 eventId:string;
 sourceUid:string;
 pieceUid:string;
 sourceLocation:'hand'|'deck';
 spiritUid?:string;
 spiritLocation?:'hand'|'deck';
 effectNegated?:boolean;
 summonEffectNegated?:boolean;
}>;

export type SarcophagusResolution=Readonly<{
 status:'placed'|'summoned'|'effect-negated'|'summon-negated'|'no-monster-zone'|'duplicate';
 ledger:SarcophagusLedger;
 placedUid:string|null;
 summonedUid:string|null;
 sentToGraveyardUids:readonly string[];
 shuffled:boolean;
}>;

export type SpiritOfPharaohEvent=Readonly<{
 kind:'spirit-of-pharaoh-trigger';
 eventId:string;
 sequence:number;
 actorSeat:SarcophagusSeat;
 spiritUid:string;
 targetUids:readonly string[];
}>;

export type SpiritOfPharaohResolution=Readonly<{
 status:'resolved'|'declined'|'duplicate';
 ledger:SarcophagusLedger;
 summonedUids:readonly string[];
}>;

export type SarcophagusProgress=Readonly<{
 first:boolean;
 second:boolean;
 third:boolean;
 nextPiece:SarcophagusPiece|null;
 complete:boolean;
}>;

const isSeat=(value:unknown):value is SarcophagusSeat=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<=3;
const isTeam=(value:unknown):value is SarcophagusTeam=>value===0||value===1;

function assertText(value:unknown,label:string):asserts value is string{
 if(typeof value!=='string'||!value.trim()||value.length>256)throw new Error(label+' inválido.');
}
function assertUidList(value:unknown,label:string):asserts value is readonly string[]{
 if(!Array.isArray(value)||value.some(uid=>typeof uid!=='string'||!uid.trim()||uid.length>256)||new Set(value).size!==value.length){
  throw new Error(label+' inválido.');
 }
}
function fingerprint(value:unknown):string{
 return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function physicalSeat(uid:string):SarcophagusSeat|null{
 const match=/^m([0-3]):(.+)$/.exec(uid);
 return match?Number(match[1]) as SarcophagusSeat:null;
}
function ownerOfUid(state:TagDuel,uid:string):SarcophagusSeat{
 const seat=physicalSeat(uid);
 if(seat===null||state.members[seat]?.team!==seat%2)throw new Error('UID físico sem proprietário de assento verificável.');
 return seat;
}
function assertClassicShape(state:TagDuel):void{
 if(!state||state.version!==1||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||
  !Array.isArray(state.active)||state.active.length!==2||!Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
  !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation||
  !Array.isArray(state.core.chain)||!state.reserves)throw new Error('Sarcophagus exige TagDuel clássico 2v2.');
 assertTagDuel(state);
 if(new Set(state.members.map(member=>member.id)).size!==4||
  state.members.some((member,index)=>!member.id||member.team!==index%2)||
  state.active.some((seat,team)=>!isSeat(seat)||seat%2!==team)||
  state.active[state.cursor%2]!==state.cursor||
  state.core.teamRotation.cursor!==state.cursor||
  state.core.teamRotation.active[0]!==state.active[0]||
  state.core.teamRotation.active[1]!==state.active[1]||
  state.core.current!==state.cursor%2||
  state.core.players.some((player,team)=>player.id!=='tag-team-'+team||!Number.isSafeInteger(player.lp)||player.lp<0||
   !Array.isArray(player.hand)||!Array.isArray(player.deck)||!Array.isArray(player.backrow)||!Array.isArray(player.grave))){
  throw new Error('Rotação, assentos físicos, mãos privadas ou zonas compartilhadas inconsistentes.');
 }
}
export function assertSarcophagusRules(state:TagDuel):void{
 assertClassicShape(state);
 const rules=rulesFor(state.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 }
 const all=tagInventory(state).filter(card=>card.entityKind!=='token');
 const extraUids=new Set<string>(),main=[0,0,0,0],extra=[0,0,0,0];
 for(const player of state.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(state.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const card of all){
  const seat=ownerOfUid(state,card.uid);
  if(extraUids.has(card.uid)||!!getDuelCard(card.id)?.fusion)extra[seat]++;
  else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A Field Zone, quando usada, permanece independente das três zonas compartilhadas.
}
function holder(state:TagDuel,seat:SarcophagusSeat){
 const team=(seat%2) as SarcophagusTeam;
 const held=state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
 if(!held)throw new Error('Mão/Deck físico do participante não está disponível.');
 return held;
}
function findPhysical(state:TagDuel,uid:string,lookup:(id:string)=>boolean,label:string):PhysicalCard{
 assertText(uid,'UID físico');
 const found=tagInventory(state).filter(card=>card.uid===uid);
 if(found.length!==1)throw new Error('UID físico precisa corresponder a uma única carta.');
 if(!lookup(found[0].id))throw new Error(label+' não corresponde à identidade registrada pelo resolver.');
 ownerOfUid(state,uid);
 return found[0];
}
function findBackrow(state:TagDuel,uid:string,lookup:(id:string)=>boolean):{team:SarcophagusTeam;card:Backrow}|null{
 const found:{team:SarcophagusTeam;card:Backrow}[]=[];
 for(const team of [0,1] as const)for(const card of state.core.players[team].backrow){
  if(card.uid===uid&&lookup(card.id))found.push({team,card});
 }
 if(found.length>1)throw new Error('UID duplicado de Sarcophagus na backrow.');
 return found[0]??null;
}
function findMonster(state:TagDuel,uid:string,lookup:(id:string)=>boolean):{team:SarcophagusTeam;card:Monster}|null{
 const found:{team:SarcophagusTeam;card:Monster}[]=[];
 for(const team of [0,1] as const)for(const card of state.core.players[team].monsters){
  if(card.uid===uid&&lookup(card.id))found.push({team,card});
 }
 if(found.length>1)throw new Error('UID duplicado de Spirit of the Pharaoh no campo.');
 return found[0]??null;
}
function assertLookups(lookups:SarcophagusLookups):void{
 if(!lookups||typeof lookups.first!=='function'||typeof lookups.second!=='function'||
  typeof lookups.third!=='function'||typeof lookups.spirit!=='function'){
  throw new Error('Lookups de identidade Sarcophagus inválidos.');
 }
}
function assertEvent(state:TagDuel,event:SarcophagusEndPhaseEvent,lookups:SarcophagusLookups):void{
 if(event?.kind!=='sarcophagus-end-phase')throw new Error('Tipo de evento Sarcophagus inválido.');
 assertText(event.eventId,'ID do evento Sarcophagus');
 assertText(event.sourceUid,'UID da fonte Sarcophagus');
 if(!Number.isSafeInteger(event.sequence)||event.sequence<1||!Number.isSafeInteger(event.turn)||event.turn!==state.core.turn||
  !isSeat(event.actorSeat)||event.phase!=='end'||state.active[event.actorSeat%2]!==event.actorSeat){
  throw new Error('Assento, turno ou End Phase do evento Sarcophagus inválidos.');
 }
 if(event.negatedSourceUids!==undefined)assertUidList(event.negatedSourceUids,'Lista de fontes negadas');
 const source=findBackrow(state,event.sourceUid,lookups.first);
 if(!source||!source.card.faceUp||source.card.resolved!==true)throw new Error('The First Sarcophagus precisa estar ativo e resolvido na backrow.');
 const controllerTeam=source.team;
 if(controllerTeam===(event.actorSeat%2))throw new Error('O efeito de The First Sarcophagus só dispara na End Phase da equipe oponente.');
 if(event.negatedSourceUids?.includes(event.sourceUid))throw new Error('The First Sarcophagus está negado.');
 ownerOfUid(state,event.sourceUid);
}
function progressForTeam(state:TagDuel,team:SarcophagusTeam,lookups:SarcophagusLookups):SarcophagusProgress{
 const cards=state.core.players[team].backrow;
 const first=cards.some(card=>lookups.first(card.id)&&card.faceUp===true&&card.resolved===true);
 const second=cards.some(card=>lookups.second(card.id)&&card.faceUp===true);
 const third=cards.some(card=>lookups.third(card.id)&&card.faceUp===true);
 return {first,second,third,nextPiece:!second?'second':!third?'third':null,complete:first&&second&&third};
}
function relevantFingerprint(state:TagDuel,team:SarcophagusTeam,recipientSeat:SarcophagusSeat):string{
 const held=holder(state,recipientSeat),field=state.core.players[team];
 return fingerprint({
  turn:state.core.turn,active:state.active,cursor:state.cursor,team,recipientSeat,
  backrow:field.backrow.map(card=>({uid:card.uid,id:card.id,faceUp:card.faceUp,resolved:card.resolved})),
  hand:held.hand.map(card=>({uid:card.uid,id:card.id})),
  deck:held.deck.map(card=>({uid:card.uid,id:card.id}))
 });
}
function takeFrom(list:PhysicalCard[],uid:string,label:string):PhysicalCard{
 const index=list.findIndex(card=>card.uid===uid);
 if(index<0)throw new Error(label+' não está na zona física selecionada.');
 return list.splice(index,1)[0];
}
function makeMonster(card:PhysicalCard,state:TagDuel):Monster{
 return {...card,position:'atk',faceUp:true,entered:state.core.turn,changed:state.core.turn,attacked:0,
  atkBoost:0,defBoost:0,owner:(ownerOfUid(state,card.uid)%2) as SarcophagusTeam,properlySummoned:true};
}
function assertNormalZombie(card:PhysicalCard):void{
 const info=getDuelCard(card.id);
 if(!info||info.kind!=='monster'||info.monsterType!=='normal'||info.race!=='Zombie'||
  typeof info.level!=='number'||info.level>2){
  throw new Error('Spirit of the Pharaoh só pode escolher Monstros Normais Zumbi de Nível 2 ou menos.');
 }
}

export function createSarcophagusLedger():SarcophagusLedger{
 return {version:1,lastSequence:0,pending:[],processed:[],lastUseBySource:[],spiritSummons:[]};
}
export function assertSarcophagusCardPlacement(cardId:string,method:'normal'|'first-sarcophagus-effect',lookups:SarcophagusLookups):void{
 assertLookups(lookups);assertText(cardId,'Identidade Sarcophagus');
 if((lookups.second(cardId)||lookups.third(cardId))&&method!=='first-sarcophagus-effect'){
  throw new Error('The Second/Third Sarcophagus só pode ser colocado pelo efeito de The First Sarcophagus.');
 }
}
export function assertSpiritOfPharaohSummonMethod(method:'normal'|'other-effect'|'first-sarcophagus-effect'):void{
 if(method!=='first-sarcophagus-effect')throw new Error('Spirit of the Pharaoh só pode ser Invocado por Invocação-Especial pelo efeito de The First Sarcophagus.');
}
export function sarcophagusProgress(state:TagDuel,team:SarcophagusTeam,lookups:SarcophagusLookups):SarcophagusProgress{
 assertSarcophagusRules(state);assertLookups(lookups);if(!isTeam(team))throw new Error('Equipe Sarcophagus inválida.');
 return progressForTeam(state,team,lookups);
}

export function captureSarcophagusEndPhase(
 state:TagDuel,ledger:SarcophagusLedger,event:SarcophagusEndPhaseEvent,lookups:SarcophagusLookups
):SarcophagusCapture{
 assertSarcophagusRules(state);assertLookups(lookups);
 if(!event||event.kind!=='sarcophagus-end-phase')throw new Error('Tipo de evento Sarcophagus inválido.');
 if(!ledger||ledger.version!==1||!Number.isSafeInteger(ledger.lastSequence)||!Array.isArray(ledger.pending)||
  !Array.isArray(ledger.processed)||!Array.isArray(ledger.lastUseBySource)||!Array.isArray(ledger.spiritSummons)){
  throw new Error('Ledger Sarcophagus inválido.');
 }
 const prior=ledger.processed.find(item=>item.eventId===event.eventId);
 if(prior)return {status:'duplicate',ledger,candidate:null};
 const pending=ledger.pending.find(item=>item.event.eventId===event.eventId);
 if(pending)return {status:'duplicate',ledger,candidate:pending.candidate};
 assertEvent(state,event,lookups);
 if(event.sequence<=ledger.lastSequence)throw new Error('Sequência Sarcophagus deve ser estritamente crescente.');
 if(ledger.lastUseBySource.some(item=>item.sourceUid===event.sourceUid&&item.turn===event.turn)||
  ledger.pending.some(item=>item.candidate.sourceUid===event.sourceUid&&item.event.turn===event.turn)){
  throw new Error('The First Sarcophagus já usou seu efeito neste turno.');
 }
 const source=findBackrow(state,event.sourceUid,lookups.first)!;
 const team=source.team,recipientSeat=state.active[team] as SarcophagusSeat;
 const progress=progressForTeam(state,team,lookups);
 if(!progress.nextPiece)return {status:'no-trigger',ledger:{...ledger,lastSequence:event.sequence},candidate:null};
 const held=holder(state,recipientSeat);
 const predicate=progress.nextPiece==='second'?lookups.second:lookups.third;
 const handUids=held.hand.filter(card=>predicate(card.id)).map(card=>card.uid);
 const deckUids=held.deck.filter(card=>predicate(card.id)).map(card=>card.uid);
 const nextLedger={...ledger,lastSequence:event.sequence};
 if(state.core.players[team].backrow.length>=RULES_PROFILE.spellTrapZones){
  return {status:'zone-full',ledger:nextLedger,candidate:null};
 }
 if(!handUids.length&&!deckUids.length)return {status:'no-target',ledger:nextLedger,candidate:null};
 const candidate:SarcophagusCandidate={
  sourceUid:event.sourceUid,controllerTeam:team,recipientSeat,nextPiece:progress.nextPiece,
  handUids,deckUids,stateFingerprint:relevantFingerprint(state,team,recipientSeat)
 };
 const pendingEntry:SarcophagusPending={event,fingerprint:fingerprint(event),candidate};
 return {status:'pending-resolution',ledger:{...nextLedger,pending:[...ledger.pending,pendingEntry]},candidate};
}

export function resolveSarcophagusEndPhase(
 input:TagDuel,ledger:SarcophagusLedger,choice:SarcophagusChoice,lookups:SarcophagusLookups
):Readonly<{state:TagDuel;resolution:SarcophagusResolution}>{
 assertSarcophagusRules(input);assertLookups(lookups);
 assertText(choice?.eventId,'ID do evento Sarcophagus');assertText(choice?.sourceUid,'UID da fonte Sarcophagus');
 assertText(choice?.pieceUid,'UID da peça Sarcophagus');
 if(choice.sourceLocation!=='hand'&&choice.sourceLocation!=='deck')throw new Error('Origem da peça Sarcophagus inválida.');
 const choiceFingerprint=fingerprint({sourceUid:choice.sourceUid,pieceUid:choice.pieceUid,sourceLocation:choice.sourceLocation,
  spiritUid:choice.spiritUid??null,spiritLocation:choice.spiritLocation??null,effectNegated:choice.effectNegated===true,
  summonEffectNegated:choice.summonEffectNegated===true});
 const prior=ledger.processed.find(item=>item.eventId===choice.eventId);
 if(prior){
  if(prior.choiceFingerprint!==choiceFingerprint)throw new Error('A escolha do evento Sarcophagus mudou após resolução.');
  return {state:input,resolution:{status:'duplicate',ledger,placedUid:null,summonedUid:null,sentToGraveyardUids:[],shuffled:false}};
 }
 const pending=ledger.pending.find(item=>item.event.eventId===choice.eventId);
 if(!pending)throw new Error('Evento Sarcophagus não está pendente.');
 const candidate=pending.candidate;
 if(candidate.sourceUid!==choice.sourceUid)throw new Error('Fonte do evento Sarcophagus mudou.');
 const state=structuredClone(input);
 if(relevantFingerprint(state,candidate.controllerTeam,candidate.recipientSeat)!==candidate.stateFingerprint){
  throw new Error('Estado físico mudou entre captura e resolução do efeito Sarcophagus.');
 }
 const source=findBackrow(state,choice.sourceUid,lookups.first);
 if(!source||source.team!==candidate.controllerTeam||!source.card.faceUp||source.card.resolved!==true){
  throw new Error('The First Sarcophagus deixou de estar ativo antes da resolução.');
 }
 const holderState=holder(state,candidate.recipientSeat);
 const allowed=choice.sourceLocation==='hand'?candidate.handUids:candidate.deckUids;
 if(!allowed.includes(choice.pieceUid))throw new Error('A peça escolhida não estava na mão/Deck capturados.');
 const pieceLookup=candidate.nextPiece==='second'?lookups.second:lookups.third;
 const piece=findPhysical(state,choice.pieceUid,pieceLookup,candidate.nextPiece==='second'?'The Second Sarcophagus':'The Third Sarcophagus');
 // A zona física selecionada define a mão/Deck; o UID preserva o proprietário mesmo se a carta mudou de controle.
 if(choice.effectNegated===true){
  const processed:SarcophagusProcessed={eventId:choice.eventId,fingerprint:pending.fingerprint,choiceFingerprint,status:'effect-negated',
   turn:pending.event.turn,sourceUid:choice.sourceUid};
  const nextLedger:SarcophagusLedger={...ledger,pending:ledger.pending.filter(item=>item.event.eventId!==choice.eventId),
   processed:[...ledger.processed,processed],lastUseBySource:[...ledger.lastUseBySource,{sourceUid:choice.sourceUid,turn:pending.event.turn}]};
  return {state:input,resolution:{status:'effect-negated',ledger:nextLedger,placedUid:null,summonedUid:null,sentToGraveyardUids:[],shuffled:false}};
 }
 const pool=choice.sourceLocation==='hand'?holderState.hand:holderState.deck;
 const moved=takeFrom(pool,choice.pieceUid,'Peça Sarcophagus');
 const teamState=state.core.players[candidate.controllerTeam];
 teamState.backrow.push({...moved,setTurn:state.core.turn,faceUp:true,resolved:true});
 let shuffled=false;
 if(choice.sourceLocation==='deck'){shuffleDuel(holderState.deck,state.core);shuffled=true;}
 assertSarcophagusCardPlacement(moved.id,'first-sarcophagus-effect',lookups);
 synchronizeCardLifetimes(state.core);
 const progress=progressForTeam(state,candidate.controllerTeam,lookups);
 let status:SarcophagusResolution['status']='placed',summonedUid:string|null=null;
 const sentToGraveyardUids:string[]=[];
 if(progress.complete){
  const pieces=teamState.backrow.filter(card=>lookups.first(card.id)||lookups.second(card.id)||lookups.third(card.id));
  if(!pieces.some(card=>lookups.first(card.id))||!pieces.some(card=>lookups.second(card.id))||!pieces.some(card=>lookups.third(card.id))){
   throw new Error('Conjunto Sarcophagus incompleto durante o sacrifício.');
  }
  const pieceUids=new Set(pieces.map(card=>card.uid));
  teamState.backrow=teamState.backrow.filter(card=>!pieceUids.has(card.uid));
  teamState.grave.push(...pieces.map(card=>({uid:card.uid,id:card.id})));
  sentToGraveyardUids.push(...pieces.map(card=>card.uid));
  const held=holder(state,candidate.recipientSeat);
  const spiritPool=[...held.hand,...held.deck].filter(card=>lookups.spirit(card.id));
  if(choice.spiritUid){
   if(choice.spiritLocation!=='hand'&&choice.spiritLocation!=='deck')throw new Error('Origem de Spirit of the Pharaoh inválida.');
   if(!spiritPool.some(card=>card.uid===choice.spiritUid))throw new Error('Spirit of the Pharaoh escolhido não está na mão/Deck privado.');
   const spirit=findPhysical(state,choice.spiritUid,lookups.spirit,'Spirit of the Pharaoh');
   assertSpiritOfPharaohSummonMethod('first-sarcophagus-effect');
   if(choice.summonEffectNegated===true){
    status='summon-negated';
   }else if(teamState.monsters.length>=RULES_PROFILE.monsterZones){
    status='no-monster-zone';
   }else{
    const spiritHolder=holder(state,candidate.recipientSeat);
    const spiritCard=takeFrom(choice.spiritLocation==='hand'?spiritHolder.hand:spiritHolder.deck,spirit.uid,'Spirit of the Pharaoh');
    if(choice.spiritLocation==='deck'){shuffleDuel(spiritHolder.deck,state.core);shuffled=true;}
    const monster=makeMonster(spiritCard,state);
    teamState.monsters.push(monster);summonedUid=monster.uid;status='summoned';
   }
  }else if(spiritPool.length>0){
   throw new Error('Selecione Spirit of the Pharaoh da mão/Deck após completar os três Sarcophagi.');
  }else{
   status='placed';
  }
 }
 synchronizeCardLifetimes(state.core);
 assertSarcophagusRules(state);
 const nextLedger:SarcophagusLedger={
  ...ledger,pending:ledger.pending.filter(item=>item.event.eventId!==choice.eventId),
  processed:[...ledger.processed,{eventId:choice.eventId,fingerprint:pending.fingerprint,choiceFingerprint,status,
   turn:pending.event.turn,sourceUid:choice.sourceUid}],
  lastUseBySource:[...ledger.lastUseBySource,{sourceUid:choice.sourceUid,turn:pending.event.turn}],
  spiritSummons:summonedUid?[...ledger.spiritSummons,{uid:summonedUid,team:candidate.controllerTeam,turn:state.core.turn,
   sourceEventId:choice.eventId,effectUsed:false}]:ledger.spiritSummons
 };
 assertTagDuel(state);
 return {state,resolution:{status,ledger:nextLedger,placedUid:moved.uid,summonedUid,sentToGraveyardUids,shuffled}};
}

export function cleanupSarcophagusAfterLeave(
 input:TagDuel,leavingUid:string,controllerTeam:SarcophagusTeam,lookups:SarcophagusLookups
):Readonly<{state:TagDuel;movedUids:readonly string[]}>{
 assertSarcophagusRules(input);assertLookups(lookups);assertText(leavingUid,'UID Sarcophagus que deixou o campo');
 if(!isTeam(controllerTeam))throw new Error('Equipe controladora Sarcophagus inválida.');
 findPhysical(input,leavingUid,id=>lookups.first(id)||lookups.second(id)||lookups.third(id),'Sarcophagus');
 const onField=findBackrow(input,leavingUid,id=>lookups.first(id)||lookups.second(id)||lookups.third(id));
 if(onField&&onField.team!==controllerTeam)throw new Error('Equipe controladora não corresponde à zona de campo.');
 const team=controllerTeam;
 const state=structuredClone(input),field=state.core.players[team],moved=field.backrow.filter(card=>lookups.first(card.id)||lookups.second(card.id)||lookups.third(card.id));
 if(!moved.length)return {state,movedUids:[]};
 const movedUids=moved.map(card=>card.uid),ids=new Set(movedUids);
 field.backrow=field.backrow.filter(card=>!ids.has(card.uid));
 field.grave.push(...moved.map(card=>({uid:card.uid,id:card.id})));
 synchronizeCardLifetimes(state.core);assertSarcophagusRules(state);assertTagDuel(state);
 return {state,movedUids};
}

export function resolveSpiritOfPharaohTrigger(
 input:TagDuel,ledger:SarcophagusLedger,event:SpiritOfPharaohEvent,lookups:SarcophagusLookups
):Readonly<{state:TagDuel;resolution:SpiritOfPharaohResolution}>{
 assertSarcophagusRules(input);assertLookups(lookups);
 if(event?.kind!=='spirit-of-pharaoh-trigger')throw new Error('Tipo de evento Spirit of the Pharaoh inválido.');
 assertText(event.eventId,'ID do gatilho Spirit of the Pharaoh');assertText(event.spiritUid,'UID Spirit of the Pharaoh');
 assertUidList(event.targetUids,'Alvos Spirit of the Pharaoh');
 const prior=ledger.processed.find(item=>item.eventId===event.eventId);
 if(prior){
  if(prior.choiceFingerprint!==fingerprint(event.targetUids))throw new Error('Os alvos do gatilho Spirit of the Pharaoh mudaram após resolução.');
  return {state:input,resolution:{status:'duplicate',ledger,summonedUids:[]}};
 }
 if(!Number.isSafeInteger(event.sequence)||event.sequence<=ledger.lastSequence||!isSeat(event.actorSeat)){
  throw new Error('Sequência/assento do gatilho Spirit of the Pharaoh inválidos.');
 }
 const found=findMonster(input,event.spiritUid,lookups.spirit);
 if(!found)throw new Error('Spirit of the Pharaoh não está no campo.');
 const team=found.team,record=ledger.spiritSummons.find(item=>item.uid===event.spiritUid&&item.team===team);
 if(!record||record.effectUsed)throw new Error('Gatilho de Spirit of the Pharaoh não foi concedido por The First Sarcophagus ou já foi usado.');
 if(event.actorSeat!==input.active[team])throw new Error('A mão/Cemitério do assento físico ativo da equipe deve resolver o gatilho.');
 const freeZones=RULES_PROFILE.monsterZones-input.core.players[team].monsters.length;
 if(event.targetUids.length>4||event.targetUids.length>freeZones){
  throw new Error('Spirit of the Pharaoh excede o limite de quatro alvos ou as Monster Zones livres.');
 }
 const grave=input.core.players[team].grave;
 for(const uid of event.targetUids){
  const target=grave.find(card=>card.uid===uid);
  if(!target)throw new Error('Alvo Spirit of the Pharaoh não está no Cemitério compartilhado da equipe.');
  assertNormalZombie(target);ownerOfUid(input,uid);
  // O Cemitério compartilhado da equipe define a elegibilidade; o UID mantém o proprietário físico original.
 }
 const state=structuredClone(input),teamState=state.core.players[team],summonedUids:string[]=[];
 for(const uid of event.targetUids){
  const target=takeFrom(teamState.grave,uid,'Monstro Normal Zumbi');
  teamState.monsters.push({...target,position:'atk',faceUp:true,entered:state.core.turn,changed:state.core.turn,attacked:0,
   atkBoost:0,defBoost:0,owner:(ownerOfUid(state,uid)%2) as SarcophagusTeam});
  summonedUids.push(uid);
 }
 synchronizeCardLifetimes(state.core);assertSarcophagusRules(state);assertTagDuel(state);
 const nextLedger:SarcophagusLedger={
  ...ledger,lastSequence:event.sequence,
  processed:[...ledger.processed,{eventId:event.eventId,fingerprint:fingerprint(event),choiceFingerprint:fingerprint(event.targetUids),
   status:'spirit-effect-resolved',turn:state.core.turn,sourceUid:event.spiritUid}],
  spiritSummons:ledger.spiritSummons.map(item=>item.uid===event.spiritUid?{...item,effectUsed:true}:item)
 };
 return {state,resolution:{status:event.targetUids.length?'resolved':'declined',ledger:nextLedger,summonedUids}};
}
