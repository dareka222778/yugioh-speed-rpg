import {createHash} from 'node:crypto';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {continuousTrapActivationsBlocked,continuousTrapsNegated} from './continuousEffects';
export const APPROPRIATE_ID='48539234';
export const APPROPRIATE_KONAMI_CID=4947;
export type AppropriateTeam=0|1;
export type AppropriateSeat=0|1|2|3;
export type DrawPhase='draw'|'standby'|'main1'|'battle'|'main2'|'end';
export type AppropriateSourceLookup=(cardId:string)=>boolean;
export type AppropriateDrawEvent=Readonly<{eventId:string;sequence:number;drawingSeat:AppropriateSeat;phase:DrawPhase;drawCount:number;drawnUids:readonly string[];negatedSourceUids?:readonly string[]}>;
export type AppropriateActivationInput=Readonly<{sourceUid:string;controllerTeam:AppropriateTeam;actorSeat:AppropriateSeat;activationEventId:string;drawEvent:AppropriateDrawEvent;activationResolved:boolean;activationNegated:boolean;effectNegated:boolean}>;
export type AppropriateActivation=Readonly<{sourceUid:string;activationEventId:string;armedAfterSequence:number;setTurn:number}>;
export type AppropriateLedger=Readonly<{version:1;activations:readonly AppropriateActivation[];processedDrawEvents:readonly Readonly<{eventId:string;fingerprint:string}>[]}>;
export type AppropriateDrawPlan=Readonly<{eventId:string;sourceUid:string;controllerTeam:AppropriateTeam;drawSeat:AppropriateSeat;requestedDrawCount:2;actualDrawCount:number;drawnCards:readonly Readonly<{uid:string;id:string}>[];expectedDeckTopUids:readonly string[];deckOut:boolean}>;
export type AppropriateResolution=Readonly<{status:'armed'|'activation-negated'|'effect-negated'|'activation-blocked'|'not-resolved'|'not-triggerable'|'duplicate'|'no-trigger'|'draw-phase'|'triggered'|'deck-out';ledger:AppropriateLedger;plans:readonly AppropriateDrawPlan[]}>;
type ActiveAppropriate=Readonly<{uid:string;team:AppropriateTeam;armedAfterSequence:number;setTurn:number}>;
const isSeat=(v:unknown):v is AppropriateSeat=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=3;
const isTeam=(v:unknown):v is AppropriateTeam=>v===0||v===1;
const phases:readonly DrawPhase[]=['draw','standby','main1','battle','main2','end'];
function assertNonEmpty(value:unknown,label:string):asserts value is string{if(typeof value!=='string'||!value.trim()||value.length>256)throw new Error(label+' inválido.');}
function physicalSeat(uid:string):AppropriateSeat|null{const match=/^m([0-3]):(.+)$/.exec(uid);return match?Number(match[1]) as AppropriateSeat:null;}
function ownerOfUid(state:TagDuel,uid:string):AppropriateSeat{
 const seat=physicalSeat(uid);if(seat===null||state.members[seat]?.team!==seat%2)throw new Error('UID físico sem proprietário de assento verificável.');return seat;
}
function assertClassicShape(state:TagDuel):void{
 if(!state||state.version!==1||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||
  !Array.isArray(state.active)||state.active.length!==2||!Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
  !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation||
  !Array.isArray(state.core.teamRotation.active)||state.core.teamRotation.active.length!==2)throw new Error('Appropriate exige TagDuel clássico 2v2.');
 assertTagDuel(state);
 if(new Set(state.members.map(member=>member.id)).size!==4||state.members.some((member,index)=>!member.id||member.team!==index%2)||
  state.active.some((seat,team)=>!isSeat(seat)||seat%2!==team)||state.active[state.cursor%2]!==state.cursor||
  state.core.teamRotation.cursor!==state.cursor||state.core.teamRotation.active[0]!==state.active[0]||
  state.core.teamRotation.active[1]!==state.active[1]||state.core.current!==state.cursor%2||
  state.core.players.some((player,team)=>player.id!=='tag-team-'+team||!Number.isSafeInteger(player.lp)||player.lp<0||
   !Array.isArray(player.hand)||!Array.isArray(player.deck)||!Array.isArray(player.backrow)||!Array.isArray(player.grave))){
  throw new Error('Rotação, assentos físicos, mãos privadas ou zonas compartilhadas inconsistentes.');
 }
}
export function assertAppropriateRules(state:TagDuel):void{
 const rules=rulesFor(state.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 }
 const extraUids=new Set<string>(),main=[0,0,0,0],extra=[0,0,0,0];
 for(const player of state.core.players){if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);}
 for(const held of Object.values(state.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const card of tagInventory(state)){if(card.entityKind==='token')continue;const seat=ownerOfUid(state,card.uid);
  if(extraUids.has(card.uid)||!!getDuelCard(card.id)?.fusion)extra[seat]++;else main[seat]++;}
 for(let seat=0;seat<4;seat++){if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');}
}
function assertLedger(ledger:AppropriateLedger):void{
 if(!ledger||ledger.version!==1||!Array.isArray(ledger.activations)||!Array.isArray(ledger.processedDrawEvents)||
  ledger.activations.some(item=>!item||typeof item.sourceUid!=='string'||!item.sourceUid.trim()||typeof item.activationEventId!=='string'||!item.activationEventId.trim()||
   !Number.isSafeInteger(item.armedAfterSequence)||item.armedAfterSequence<1||!Number.isSafeInteger(item.setTurn)||item.setTurn<0)||
  new Set(ledger.activations.map(item=>item.sourceUid)).size!==ledger.activations.length||
  ledger.processedDrawEvents.some(item=>!item||typeof item.eventId!=='string'||!item.eventId.trim()||typeof item.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(item.fingerprint))||
  new Set(ledger.processedDrawEvents.map(item=>item.eventId)).size!==ledger.processedDrawEvents.length)throw new Error('Ledger Appropriate inválido.');
}
function assertDrawEventShape(event:AppropriateDrawEvent):void{
 assertNonEmpty(event?.eventId,'ID do evento de compra');
 if(!Number.isSafeInteger(event.sequence)||event.sequence<1||!isSeat(event.drawingSeat)||!phases.includes(event.phase)||
  !Number.isSafeInteger(event.drawCount)||event.drawCount<0||!Array.isArray(event.drawnUids)||event.drawnUids.length!==event.drawCount||
  event.drawnUids.some(uid=>typeof uid!=='string'||!uid.trim())||new Set(event.drawnUids).size!==event.drawnUids.length||
  (event.negatedSourceUids!==undefined&&(!Array.isArray(event.negatedSourceUids)||event.negatedSourceUids.some(uid=>typeof uid!=='string'||!uid.trim())||
   new Set(event.negatedSourceUids).size!==event.negatedSourceUids.length)))throw new Error('Evento de compra inválido.');
}
function assertDrawEventInState(state:TagDuel,event:AppropriateDrawEvent):void{
 const team=(event.drawingSeat%2) as AppropriateTeam;if(state.active[team]!==event.drawingSeat)throw new Error('Compra atribuída a um assento físico que não está ativo.');
 const hand=state.core.players[team].hand;
 for(const uid of event.drawnUids)if(ownerOfUid(state,uid)!==event.drawingSeat||!hand.some(card=>card.uid===uid))throw new Error('UID comprado não está na mão privada do assento físico informado.');
}
function findPhysical(state:TagDuel,uid:string,lookup:AppropriateSourceLookup):{id:string}{
 const cards=tagInventory(state).filter(card=>card.uid===uid);if(cards.length!==1)throw new Error('Fonte Appropriate precisa corresponder a uma única carta física.');
 if(!lookup(cards[0].id)||getDuelCard(cards[0].id)?.kind!=='trap')throw new Error('UID informado não pertence a uma Carta de Armadilha Appropriate.');
 ownerOfUid(state,uid);return {id:cards[0].id};
}
function findBackrowSource(state:TagDuel,uid:string):{team:AppropriateTeam;card:TagDuel['core']['players'][number]['backrow'][number]}|null{
 const found:{team:AppropriateTeam;card:TagDuel['core']['players'][number]['backrow'][number]}[]=[];
 for(const team of [0,1] as const)for(const card of state.core.players[team].backrow)if(card.uid===uid)found.push({team,card});
 if(found.length>1)throw new Error('UID duplicado de Appropriate no campo.');return found[0]??null;
}
function reconcile(state:TagDuel,ledger:AppropriateLedger,lookup:AppropriateSourceLookup):AppropriateLedger{
 const activations=ledger.activations.filter(item=>{const found=findBackrowSource(state,item.sourceUid);
  return !!found&&found.card.faceUp===true&&found.card.resolved===true&&found.card.setTurn===item.setTurn&&lookup(found.card.id);});
 return activations.length===ledger.activations.length?ledger:{...ledger,activations};
}
function activeSources(state:TagDuel,ledger:AppropriateLedger,lookup:AppropriateSourceLookup,negated:Set<string>):
 {ledger:AppropriateLedger;sources:ActiveAppropriate[]}{
 const next=reconcile(state,ledger,lookup);if(continuousTrapsNegated(state.core))return {ledger:next,sources:[]};
 const sources:ActiveAppropriate[]=[];
 for(const activation of next.activations){const found=findBackrowSource(state,activation.sourceUid);
  if(found&&found.card.faceUp===true&&found.card.resolved===true&&found.card.setTurn===activation.setTurn&&!negated.has(activation.sourceUid)){
   sources.push({uid:activation.sourceUid,team:found.team,armedAfterSequence:activation.armedAfterSequence,setTurn:activation.setTurn});}}
 return {ledger:next,sources:sources.sort((a,b)=>a.uid.localeCompare(b.uid))};
}
function fingerprint(event:AppropriateDrawEvent,sources:readonly ActiveAppropriate[]):string{
 const canonical={event:{...event,drawnUids:[...event.drawnUids],negatedSourceUids:[...(event.negatedSourceUids??[])].sort()},sources:sources.map(source=>({...source}))};
 return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
function resolution(status:AppropriateResolution['status'],ledger:AppropriateLedger,plans:readonly AppropriateDrawPlan[]=[]):AppropriateResolution{return {status,ledger,plans};}
export function createAppropriateLedger():AppropriateLedger{return {version:1,activations:[],processedDrawEvents:[]};}
export function registerAppropriateActivation(state:TagDuel,ledger:AppropriateLedger,input:AppropriateActivationInput,lookup:AppropriateSourceLookup):AppropriateResolution{
 assertLedger(ledger);assertClassicShape(state);assertAppropriateRules(state);assertDrawEventShape(input.drawEvent);
 assertNonEmpty(input.sourceUid,'UID físico de Appropriate');assertNonEmpty(input.activationEventId,'ID da ativação Appropriate');
 if(!isTeam(input.controllerTeam)||!isSeat(input.actorSeat)||typeof input.activationResolved!=='boolean'||
  typeof input.activationNegated!=='boolean'||typeof input.effectNegated!=='boolean')throw new Error('Evento de ativação Appropriate inválido.');
 if(input.activationResolved&&input.activationNegated)throw new Error('Ativação negada não pode ser registrada como resolvida.');
 const physical=findPhysical(state,input.sourceUid,lookup),actorTeam=(input.actorSeat%2) as AppropriateTeam,drawingTeam=(input.drawEvent.drawingSeat%2) as AppropriateTeam;
 if(actorTeam!==input.controllerTeam||state.active[input.controllerTeam]!==input.actorSeat)throw new Error('A ativação deve partir do assento ativo da equipe controladora.');
 assertDrawEventInState(state,input.drawEvent);
 if(input.drawEvent.phase==='draw'||input.drawEvent.drawCount===0||drawingTeam===input.controllerTeam)return resolution('not-triggerable',ledger);
 if(input.activationNegated)return resolution('activation-negated',ledger);
 if(!input.activationResolved)return resolution('not-resolved',ledger);
 if(input.effectNegated)return resolution('effect-negated',ledger);
 if(continuousTrapActivationsBlocked(state.core))return resolution('activation-blocked',ledger);
 if(continuousTrapsNegated(state.core))return resolution('effect-negated',ledger);
 const source=findBackrowSource(state,input.sourceUid);
 if(!source||source.team!==input.controllerTeam||source.card.id!==physical.id||source.card.faceUp!==true||source.card.resolved!==true||
  !Number.isSafeInteger(source.card.setTurn)||source.card.setTurn>=state.core.turn)throw new Error('Appropriate precisa estar resolvida, face-up e ter sido setada em turno anterior.');
 const clean=reconcile(state,ledger,lookup),prior=clean.activations.find(item=>item.sourceUid===input.sourceUid);
 if(prior){if(prior.activationEventId===input.activationEventId&&prior.armedAfterSequence===input.drawEvent.sequence&&prior.setTurn===source.card.setTurn)return resolution('duplicate',clean);
  throw new Error('Appropriate já está armada nesta instância física.');}
 const next:AppropriateLedger={...clean,activations:[...clean.activations,{sourceUid:input.sourceUid,activationEventId:input.activationEventId,armedAfterSequence:input.drawEvent.sequence,setTurn:source.card.setTurn}]};
 return resolution('armed',next);
}
export function processAppropriateDraw(state:TagDuel,ledger:AppropriateLedger,event:AppropriateDrawEvent,lookup:AppropriateSourceLookup):AppropriateResolution{
 assertLedger(ledger);assertClassicShape(state);assertAppropriateRules(state);assertDrawEventShape(event);
 const active=activeSources(state,ledger,lookup,new Set(event.negatedSourceUids??[])),hash=fingerprint(event,active.sources);
 const prior=ledger.processedDrawEvents.find(item=>item.eventId===event.eventId);
 if(prior){if(prior.fingerprint!==hash)throw new Error('ID de compra reutilizado com conteúdo diferente.');return resolution('duplicate',ledger);}
 assertDrawEventInState(state,event);
 const nextBase=active.ledger,next:AppropriateLedger={...nextBase,processedDrawEvents:[...nextBase.processedDrawEvents,{eventId:event.eventId,fingerprint:hash}]};
 if(event.phase==='draw')return resolution('draw-phase',next);
 if(event.drawCount===0||active.sources.length===0)return resolution('no-trigger',next);
 const drawingTeam=(event.drawingSeat%2) as AppropriateTeam,plans:AppropriateDrawPlan[]=[],cursors:Record<AppropriateTeam,number>={0:0,1:0};
 for(const source of active.sources){
  if(source.team===drawingTeam||event.sequence<=source.armedAfterSequence)continue;
  const drawSeat=state.active[source.team],deck=state.core.players[source.team].deck,cursor=cursors[source.team],cards=deck.slice(cursor,cursor+2);
  for(const card of cards)if(ownerOfUid(state,card.uid)!==drawSeat)throw new Error('Deck de compra não pertence ao assento físico ativo.');
  cursors[source.team]+=cards.length;
  plans.push({eventId:event.eventId,sourceUid:source.uid,controllerTeam:source.team,drawSeat,requestedDrawCount:2,actualDrawCount:cards.length,
   drawnCards:cards.map(card=>({uid:card.uid,id:card.id})),expectedDeckTopUids:cards.map(card=>card.uid),deckOut:cards.length<2});
  if(cards.length<2)break;
 }
 if(plans.length===0)return resolution('no-trigger',next,plans);
 return resolution(plans.some(plan=>plan.deckOut)?'deck-out':'triggered',next,plans);
}
