import {createHash} from 'node:crypto';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';

export const CARD_OF_SAFE_RETURN_ID='57953380';
export const CARD_OF_SAFE_RETURN_KONAMI_CID=5123;
export const SPIRIT_OF_THE_POT_OF_GREED_ID='04896788';
export const SPIRIT_OF_THE_POT_OF_GREED_KONAMI_CID=5819;
export const POT_OF_GREED_ID='55144522';
export const POT_OF_GREED_KONAMI_CID=4844;

export type DrawTriggerTeam=0|1;
export type DrawTriggerSeat=0|1|2|3;
export type DrawTriggerPhase='draw'|'standby'|'main1'|'battle'|'damage'|'main2'|'end'|'response';
type DrawTriggerMonster=TagDuel['core']['players'][number]['monsters'][number];
type DrawTriggerBackrow=TagDuel['core']['players'][number]['backrow'][number];
type PhysicalCard=ReturnType<typeof tagInventory>[number];

export type DrawTriggerLookups=Readonly<{
  cardOfSafeReturn:(cardId:string)=>boolean;
  spiritOfPotOfGreed:(cardId:string)=>boolean;
  potOfGreed:(cardId:string)=>boolean;
}>;

export function createExactDrawTriggerLookups():DrawTriggerLookups{
  return {
    cardOfSafeReturn:(cardId)=>cardId===CARD_OF_SAFE_RETURN_ID,
    spiritOfPotOfGreed:(cardId)=>cardId===SPIRIT_OF_THE_POT_OF_GREED_ID,
    potOfGreed:(cardId)=>cardId===POT_OF_GREED_ID
  };
}

export type GraveyardSpecialSummonEvent=Readonly<{
  kind:'graveyard-special-summon';
  eventId:string;
  sequence:number;
  actorSeat:DrawTriggerSeat;
  phase:DrawTriggerPhase;
  damageStep:boolean;
  summonedUids:readonly string[];
  origins:readonly Readonly<{uid:string;graveyardTeam:DrawTriggerTeam}>[];
  negatedSourceUids?:readonly string[];
}>;

export type PotOfGreedActivationEvent=Readonly<{
  kind:'pot-of-greed-activation';
  eventId:string;
  sequence:number;
  actorSeat:DrawTriggerSeat;
  phase:'main1'|'main2';
  sourceUid:string;
  sourceLocation:'hand'|'backrow';
  negatedSourceUids?:readonly string[];
}>;

export type DrawTriggerEvent=GraveyardSpecialSummonEvent|PotOfGreedActivationEvent;
export type DrawTriggerKind='card-of-safe-return'|'spirit-of-the-pot-of-greed';

export type DrawTriggerCandidate=Readonly<{
  sourceUid:string;
  triggerKind:DrawTriggerKind;
  controllerTeam:DrawTriggerTeam;
  recipientSeat:DrawTriggerSeat;
}>;

export type DrawTriggerPending=Readonly<{
  event:DrawTriggerEvent;
  fingerprint:string;
  candidates:readonly DrawTriggerCandidate[];
}>;

export type DrawTriggerProcessed=Readonly<{
  eventId:string;
  fingerprint:string;
  choiceFingerprint:string;
}>;

export type DrawTriggerLedger=Readonly<{
  version:1;
  lastSequence:number;
  pending:readonly DrawTriggerPending[];
  processed:readonly DrawTriggerProcessed[];
}>;

export type DrawTriggerPlan=Readonly<{
  eventId:string;
  sourceUid:string;
  triggerKind:DrawTriggerKind;
  controllerTeam:DrawTriggerTeam;
  recipientSeat:DrawTriggerSeat;
  requestedDrawCount:1;
  actualDrawCount:0|1;
  deckCountAtPlan:number;
  handCountAtPlan:number;
  deckOut:boolean;
}>;

export type DrawTriggerResolution=Readonly<{
  status:'choice-required'|'no-trigger'|'duplicate'|'triggered'|'deck-out'|'declined';
  ledger:DrawTriggerLedger;
  candidates:readonly DrawTriggerCandidate[];
  plans:readonly DrawTriggerPlan[];
  skippedSourceUids:readonly string[];
}>;

const isTeam=(value:unknown):value is DrawTriggerTeam=>value===0||value===1;
const isSeat=(value:unknown):value is DrawTriggerSeat=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<=3;
const phases:readonly DrawTriggerPhase[]=['draw','standby','main1','battle','damage','main2','end','response'];

function assertNonEmpty(value:unknown,label:string):asserts value is string{
  if(typeof value!=='string'||!value.trim()||value.length>256)throw new Error(label+' inválido.');
}
function physicalSeat(uid:string):DrawTriggerSeat|null{
  const match=/^m([0-3]):(.+)$/.exec(uid);
  return match?Number(match[1]) as DrawTriggerSeat:null;
}
function ownerOfUid(state:TagDuel,uid:string):DrawTriggerSeat{
  const seat=physicalSeat(uid);
  if(seat===null||state.members[seat]?.team!==seat%2)throw new Error('UID físico sem proprietário de assento verificável.');
  return seat;
}
function assertClassicShape(state:TagDuel):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||
    !Array.isArray(state.active)||state.active.length!==2||!Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
    !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation||
    !Array.isArray(state.core.chain)||!state.reserves)throw new Error('Draw triggers exigem TagDuel clássico 2v2.');
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
export function assertDrawTriggerRules(state:TagDuel):void{
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
  // The Field Zone is independent from the three shared Spell/Trap Zones.
}
function validIdList(value:unknown,label:string):asserts value is readonly string[]{
  if(!Array.isArray(value)||value.some(uid=>typeof uid!=='string'||!uid.trim()||uid.length>256)||new Set(value).size!==value.length){
    throw new Error(label+' inválido.');
  }
}
function assertNegatedList(value:unknown):void{
  if(value!==undefined)validIdList(value,'Lista de fontes negadas');
}
function physicalHolder(state:TagDuel,seat:DrawTriggerSeat){
  const team=(seat%2) as DrawTriggerTeam;
  const held=state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
  if(!held)throw new Error('Mão/Deck físico do participante não está disponível.');
  return held;
}
function findPhysical(state:TagDuel,uid:string,lookup:(id:string)=>boolean,label:string):PhysicalCard{
  assertNonEmpty(uid,'UID físico');
  const found=tagInventory(state).filter(card=>card.uid===uid);
  if(found.length!==1)throw new Error('UID físico precisa corresponder a uma única carta.');
  if(!lookup(found[0].id))throw new Error(label+' não corresponde à identidade registrada pelo resolver.');
  ownerOfUid(state,uid);
  return found[0];
}
function findBackrowSource(state:TagDuel,uid:string,lookup:(id:string)=>boolean):{team:DrawTriggerTeam;card:DrawTriggerBackrow}|null{
  const found:{team:DrawTriggerTeam;card:DrawTriggerBackrow}[]=[];
  for(const team of [0,1] as const)for(const card of state.core.players[team].backrow){
    if(card.uid===uid&&lookup(card.id))found.push({team,card});
  }
  if(found.length>1)throw new Error('UID duplicado de Card of Safe Return na backrow.');
  return found[0]??null;
}
function findSpiritSource(state:TagDuel,uid:string,lookup:(id:string)=>boolean):{team:DrawTriggerTeam;card:DrawTriggerMonster}|null{
  const found:{team:DrawTriggerTeam;card:DrawTriggerMonster}[]=[];
  for(const team of [0,1] as const)for(const card of state.core.players[team].monsters){
    if(card.uid===uid&&lookup(card.id))found.push({team,card});
  }
  if(found.length>1)throw new Error('UID duplicado de Spirit of the Pot of Greed no campo.');
  return found[0]??null;
}
function activeSourcesForSafeReturn(state:TagDuel,team:DrawTriggerTeam,lookup:DrawTriggerLookups,negated:Set<string>):DrawTriggerCandidate[]{
  const result:DrawTriggerCandidate[]=[];
  for(const card of state.core.players[team].backrow){
    if(lookup.cardOfSafeReturn(card.id)&&card.faceUp===true&&card.resolved===true&&!negated.has(card.uid)){
      ownerOfUid(state,card.uid);
      result.push({sourceUid:card.uid,triggerKind:'card-of-safe-return',controllerTeam:team,recipientSeat:state.active[team] as DrawTriggerSeat});
    }
  }
  return result.sort((a,b)=>a.sourceUid.localeCompare(b.sourceUid));
}
function activeSpiritSources(state:TagDuel,lookup:DrawTriggerLookups,negated:Set<string>):DrawTriggerCandidate[]{
  const result:DrawTriggerCandidate[]=[];
  for(const controllerTeam of [0,1] as const)for(const card of state.core.players[controllerTeam].monsters){
    if(lookup.spiritOfPotOfGreed(card.id)&&card.faceUp===true&&card.position==='atk'&&!negated.has(card.uid)){
      ownerOfUid(state,card.uid);
      result.push({sourceUid:card.uid,triggerKind:'spirit-of-the-pot-of-greed',controllerTeam,
        recipientSeat:0 as DrawTriggerSeat});
    }
  }
  return result.sort((a,b)=>a.sourceUid.localeCompare(b.sourceUid));
}
function assertLookups(lookups:DrawTriggerLookups):void{
  if(!lookups||typeof lookups.cardOfSafeReturn!=='function'||typeof lookups.spiritOfPotOfGreed!=='function'||
    typeof lookups.potOfGreed!=='function')throw new Error('Lookups de identidade draw-trigger inválidos.');
}
function assertEvent(state:TagDuel,event:DrawTriggerEvent,lookups:DrawTriggerLookups):void{
  assertNonEmpty(event?.eventId,'ID do evento draw-trigger');
  if(!Number.isSafeInteger(event.sequence)||event.sequence<1||!isSeat(event.actorSeat)||
    state.active[event.actorSeat%2]!==event.actorSeat)throw new Error('Assento/sequence do evento draw-trigger inválido.');
  assertNegatedList(event.negatedSourceUids);
  if(event.kind==='graveyard-special-summon'){
    if(!phases.includes(event.phase)||typeof event.damageStep!=='boolean')throw new Error('Janela de Special Summon inválida.');
    validIdList(event.summonedUids,'UIDs Invocados');
    if(event.summonedUids.length===0||!Array.isArray(event.origins)||event.origins.length===0||
      event.origins.some(origin=>!origin||!event.summonedUids.includes(origin.uid)||!isTeam(origin.graveyardTeam))||
      new Set(event.origins.map(origin=>origin.uid)).size!==event.origins.length){
      throw new Error('Origens do Cemitério inválidas.');
    }
    for(const uid of event.summonedUids){
      const onField=state.core.players.some(player=>player.monsters.some(monster=>monster.uid===uid));
      if(!onField)throw new Error('Monstro informado não está em uma Monster Zone após a Invocação.');
    }
    for(const origin of event.origins){
      if(ownerOfUid(state,origin.uid)%2!==origin.graveyardTeam)throw new Error('A equipe do Cemitério não corresponde ao proprietário físico.');
    }
    return;
  }
  if(event.kind==='pot-of-greed-activation'){
    if((event.phase!=='main1'&&event.phase!=='main2')||
      (event.sourceLocation!=='hand'&&event.sourceLocation!=='backrow'))throw new Error('Ativação de Pot of Greed fora da Main Phase ou origem inválida.');
    const source=findPhysical(state,event.sourceUid,lookups.potOfGreed,'Pot of Greed');
    if(ownerOfUid(state,source.uid)!==event.actorSeat)throw new Error('Pot of Greed precisa pertencer ao assento físico ativador.');
    return;
  }
  throw new Error('Tipo de evento draw-trigger desconhecido.');
}
function canonicalEvent(event:DrawTriggerEvent):unknown{
  if(event.kind==='graveyard-special-summon'){
    return {...event,summonedUids:[...event.summonedUids].sort(),
      origins:[...event.origins].map(origin=>({...origin})).sort((a,b)=>a.uid.localeCompare(b.uid)),
      negatedSourceUids:[...(event.negatedSourceUids??[])].sort()};
  }
  return {...event,negatedSourceUids:[...(event.negatedSourceUids??[])].sort()};
}
function hash(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function assertLedger(ledger:DrawTriggerLedger):void{
  if(!ledger||ledger.version!==1||!Number.isSafeInteger(ledger.lastSequence)||ledger.lastSequence<0||
    !Array.isArray(ledger.pending)||ledger.pending.length>1||!Array.isArray(ledger.processed)||
    ledger.pending.some(item=>!item||!item.event||typeof item.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(item.fingerprint)||
      !Array.isArray(item.candidates)||item.candidates.some((candidate:DrawTriggerCandidate)=>!candidate||typeof candidate.sourceUid!=='string'||
        !['card-of-safe-return','spirit-of-the-pot-of-greed'].includes(candidate.triggerKind)||
        !isTeam(candidate.controllerTeam)||!isSeat(candidate.recipientSeat)))||
    ledger.processed.some(item=>!item||typeof item.eventId!=='string'||!item.eventId.trim()||
      !/^[a-f0-9]{64}$/.test(item.fingerprint)||!/^[a-f0-9]{64}$/.test(item.choiceFingerprint))||
    new Set(ledger.processed.map(item=>item.eventId)).size!==ledger.processed.length||
    new Set(ledger.pending.map(item=>item.event.eventId)).size!==ledger.pending.length){
    throw new Error('Ledger draw-trigger inválido.');
  }
}
function resolution(status:DrawTriggerResolution['status'],ledger:DrawTriggerLedger,
  candidates:readonly DrawTriggerCandidate[]=[],plans:readonly DrawTriggerPlan[]=[],skippedSourceUids:readonly string[]=[]):DrawTriggerResolution{
  return {status,ledger,candidates,plans,skippedSourceUids};
}
export function createDrawTriggerLedger():DrawTriggerLedger{
  return {version:1,lastSequence:0,pending:[],processed:[]};
}
function eventCandidates(state:TagDuel,event:DrawTriggerEvent,lookups:DrawTriggerLookups):DrawTriggerCandidate[]{
  const negated=new Set(event.negatedSourceUids??[]);
  if(event.kind==='graveyard-special-summon'){
    if(event.damageStep||event.phase==='damage')return [];
    const originTeams=new Set(event.origins.map(origin=>origin.graveyardTeam));
    const result:DrawTriggerCandidate[]=[];
    for(const team of originTeams)result.push(...activeSourcesForSafeReturn(state,team,lookups,negated));
    return result.sort((a,b)=>a.sourceUid.localeCompare(b.sourceUid));
  }
  const recipientSeat=event.actorSeat;
  return activeSpiritSources(state,lookups,negated).map(candidate=>({...candidate,recipientSeat}));
}
export function captureDrawTriggerEvent(state:TagDuel,ledger:DrawTriggerLedger,event:DrawTriggerEvent,
  lookups:DrawTriggerLookups):DrawTriggerResolution{
  assertLedger(ledger);assertDrawTriggerRules(state);assertLookups(lookups);
  if(!event||typeof event!=='object')throw new Error('Evento draw-trigger inválido.');
  assertNonEmpty(event.eventId,'ID do evento draw-trigger');
  const fingerprint=hash(event);
  const prior=ledger.processed.find(item=>item.eventId===event.eventId);
  if(prior){
    if(prior.fingerprint!==fingerprint)throw new Error('ID de evento reutilizado com conteúdo diferente.');
    return resolution('duplicate',ledger);
  }
  const pending=ledger.pending.find(item=>item.event.eventId===event.eventId);
  if(pending){
    if(pending.fingerprint!==fingerprint)throw new Error('ID de evento pendente reutilizado com conteúdo diferente.');
    return resolution('choice-required',ledger,pending.candidates);
  }
  assertEvent(state,event,lookups);
  const candidates=eventCandidates(state,event,lookups);
  if(ledger.pending.length)throw new Error('Resolva o evento draw-trigger pendente antes de capturar outro.');
  if(event.sequence<=ledger.lastSequence)throw new Error('Sequence draw-trigger precisa ser estritamente crescente.');
  const base:DrawTriggerLedger={...ledger,lastSequence:event.sequence};
  if(candidates.length===0){
    const next:DrawTriggerLedger={...base,processed:[...base.processed,{eventId:event.eventId,fingerprint,choiceFingerprint:hash([])}]};
    return resolution('no-trigger',next);
  }
  const next:DrawTriggerLedger={...base,pending:[{event,fingerprint,candidates}]};
  return resolution('choice-required',next,candidates);
}
function sourceStillActive(state:TagDuel,candidate:DrawTriggerCandidate,lookups:DrawTriggerLookups,negated:Set<string>):boolean{
  if(negated.has(candidate.sourceUid))return false;
  if(candidate.triggerKind==='card-of-safe-return'){
    const found=findBackrowSource(state,candidate.sourceUid,lookups.cardOfSafeReturn);
    return !!found&&found.team===candidate.controllerTeam&&found.card.faceUp===true&&found.card.resolved===true;
  }
  const found=findSpiritSource(state,candidate.sourceUid,lookups.spiritOfPotOfGreed);
  return !!found&&found.team===candidate.controllerTeam&&found.card.faceUp===true&&found.card.position==='atk';
}
export function resolveDrawTriggerEvent(state:TagDuel,ledger:DrawTriggerLedger,input:{
  eventId:string;acceptedSourceUids:readonly string[];negatedSourceUids?:readonly string[];
},lookups:DrawTriggerLookups):DrawTriggerResolution{
  assertLedger(ledger);assertDrawTriggerRules(state);assertLookups(lookups);
  assertNonEmpty(input?.eventId,'ID do evento draw-trigger');validIdList(input.acceptedSourceUids,'Escolhas draw-trigger');
  assertNegatedList(input.negatedSourceUids);
  const choiceFingerprint=hash({accepted:[...input.acceptedSourceUids].sort(),negated:[...(input.negatedSourceUids??[])].sort()});
  const prior=ledger.processed.find(item=>item.eventId===input.eventId);
  if(prior){
    if(prior.choiceFingerprint!==choiceFingerprint)throw new Error('Evento draw-trigger resolvido novamente com escolhas diferentes.');
    return resolution('duplicate',ledger);
  }
  const pending=ledger.pending.find(item=>item.event.eventId===input.eventId);
  if(!pending)throw new Error('Evento draw-trigger não está pendente.');
  const candidateIds=new Set(pending.candidates.map(candidate=>candidate.sourceUid));
  if(input.acceptedSourceUids.some(uid=>!candidateIds.has(uid)))throw new Error('Escolha não pertence aos efeitos pendentes.');
  const negated=new Set(input.negatedSourceUids??[]),accepted=new Set(input.acceptedSourceUids);
  const plans:DrawTriggerPlan[]=[],skipped:string[]=[],drawnBySeat=new Map<DrawTriggerSeat,number>();
  let deckOut=false;
  for(const candidate of [...pending.candidates].sort((a,b)=>a.sourceUid.localeCompare(b.sourceUid))){
    if(!accepted.has(candidate.sourceUid))continue;
    if(!sourceStillActive(state,candidate,lookups,negated)){skipped.push(candidate.sourceUid);continue;}
    if(deckOut){skipped.push(candidate.sourceUid);continue;}
    const holder=physicalHolder(state,candidate.recipientSeat),priorDraws=drawnBySeat.get(candidate.recipientSeat)??0;
    const deckCountAtPlan=holder.deck.length-priorDraws,handCountAtPlan=holder.hand.length+priorDraws;
    if(deckCountAtPlan<=0){
      plans.push({eventId:input.eventId,sourceUid:candidate.sourceUid,triggerKind:candidate.triggerKind,
        controllerTeam:candidate.controllerTeam,recipientSeat:candidate.recipientSeat,requestedDrawCount:1,
        actualDrawCount:0,deckCountAtPlan:0,handCountAtPlan,deckOut:true});
      deckOut=true;
      continue;
    }
    plans.push({eventId:input.eventId,sourceUid:candidate.sourceUid,triggerKind:candidate.triggerKind,
      controllerTeam:candidate.controllerTeam,recipientSeat:candidate.recipientSeat,requestedDrawCount:1,
      actualDrawCount:1,deckCountAtPlan,handCountAtPlan,deckOut:false});
    drawnBySeat.set(candidate.recipientSeat,priorDraws+1);
  }
  const next:DrawTriggerLedger={...ledger,pending:ledger.pending.filter(item=>item.event.eventId!==input.eventId),
    processed:[...ledger.processed,{eventId:input.eventId,fingerprint:pending.fingerprint,choiceFingerprint}]};
  if(deckOut)return resolution('deck-out',next,[],plans,skipped);
  if(plans.length)return resolution('triggered',next,[],plans,skipped);
  if(input.acceptedSourceUids.length===0)return resolution('declined',next,[],[],skipped);
  return resolution('no-trigger',next,[],[],skipped);
}
