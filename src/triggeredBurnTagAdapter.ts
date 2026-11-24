import type {TagDuel} from './tagDuel';

export const DARK_ROOM_OF_NIGHTMARE_ID='85562745';
export const COFFIN_SELLER_ID='65830223';
export const SKULL_INVITATION_ID='98139712';

export type BurnTeam=0|1;
export type TriggeredBurnLedger=Readonly<{version:1;processedEventIds:readonly string[]}>;
export type TriggeredBurnPlan=Readonly<{
  eventId:string;
  sourceUid:string;
  sourceCardId:string;
  controllerTeam:BurnTeam;
  targetTeam:BurnTeam;
  amount:number;
  reason:'opponent-effect-damage'|'opponent-monster-sent-to-grave'|'card-owner-sent-to-grave';
}>;
export type TriggeredBurnResolution=Readonly<{
  status:'triggered'|'unchanged'|'not-applicable'|'no-damage'|'no-event'|'duplicate';
  ledger:TriggeredBurnLedger;
  plans:readonly TriggeredBurnPlan[];
}>;

export type EffectDamageEvent=Readonly<{
  eventId:string;
  targetTeam:BurnTeam;
  currentLP:number;
  amount:number;
  sourceCardId:string;
  sourceUid:string;
  cause:'effect'|'battle'|'cost'|'other';
  resolved:boolean;
  damageApplied:boolean;
  effectNegated:boolean;
  negatedSourceUids?:readonly string[];
}>;

export type GraveMovementCard=Readonly<{id:string;uid:string;kind:'monster'|'spell'|'trap'}>;
export type GraveMovementEvent=Readonly<{
  eventId:string;
  committed:boolean;
  cards:readonly GraveMovementCard[];
  currentLPByTeam:readonly [number,number];
  negatedSourceUids?:readonly string[];
}>;

type ActiveSource=Readonly<{uid:string;controllerTeam:BurnTeam}>;
type OwnedGraveCard=GraveMovementCard&Readonly<{ownerSeat:number;ownerTeam:BurnTeam}>;

function assertTeam(value:unknown):asserts value is BurnTeam{
  if(value!==0&&value!==1)throw new Error('Equipe 2v2 inválida para gatilho de dano.');
}
function assertNonEmpty(value:unknown,label:string):asserts value is string{
  if(typeof value!=='string'||!value.trim())throw new Error(label+' inválido.');
}
function assertCardId(value:unknown,label:string):asserts value is string{
  if(typeof value!=='string'||!/^[0-9]{8}$/.test(value))throw new Error(label+' inválido.');
}
function assertLedger(ledger:TriggeredBurnLedger):void{
  if(!ledger||ledger.version!==1||!Array.isArray(ledger.processedEventIds)||
    ledger.processedEventIds.some(id=>typeof id!=='string'||!id.trim())||
    new Set(ledger.processedEventIds).size!==ledger.processedEventIds.length){
    throw new Error('Ledger de gatilhos de dano inválido.');
  }
}
function nextLedger(ledger:TriggeredBurnLedger,eventId:string):TriggeredBurnLedger{
  return {version:1,processedEventIds:[...ledger.processedEventIds,eventId]};
}
function assertClassicTag(state:TagDuel):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||
    !Array.isArray(state.members)||state.members.length!==4||
    !Array.isArray(state.active)||state.active.length!==2||
    !Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
    !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||
    !state.core.teamRotation||!Array.isArray(state.core.teamRotation.active)||
    state.core.teamRotation.active.length!==2){
    throw new Error('Gatilho de dano exige um duelo 2v2 clássico válido.');
  }
  if(new Set(state.members.map(member=>member.id)).size!==4||
    state.members.some((member,index)=>!member.id||member.team!==index%2)||
    state.active.some((seat,team)=>!Number.isInteger(seat)||seat<0||seat>3||seat%2!==team)||
    state.active[state.cursor%2]!==state.cursor){
    throw new Error('Assentos físicos de TagDuel inválidos para gatilho de dano.');
  }
  if(state.core.teamRotation.cursor!==state.cursor||
    state.core.teamRotation.active[0]!==state.active[0]||
    state.core.teamRotation.active[1]!==state.active[1]||
    state.core.players.some((player,team)=>player.id!=='tag-team-'+team||
      !Number.isSafeInteger(player.lp)||player.lp<0||
      !Array.isArray(player.backrow)||!Array.isArray(player.grave))||
    state.core.current!==state.cursor%2){
    throw new Error('Rotação, LP ou zonas compartilhadas inconsistentes para gatilho de dano.');
  }
}
function assertNegatedUids(values:readonly string[]|undefined):Set<string>{
  const ids=values??[];
  if(!Array.isArray(ids)||ids.some(uid=>typeof uid!=='string'||!uid.trim())||
    new Set(ids).size!==ids.length){
    throw new Error('Lista de fontes negadas inválida.');
  }
  return new Set(ids);
}
function activeSources(
  state:TagDuel,
  cardId:string,
  teams:readonly BurnTeam[],
  negated:Set<string>
):ActiveSource[]{
  const sources:ActiveSource[]=[];
  const seen=new Set<string>();
  for(const team of teams){
    for(const card of state.core.players[team].backrow){
      if(card.id!==cardId)continue;
      assertNonEmpty(card.uid,'UID físico da fonte contínua');
      if(seen.has(card.uid))throw new Error('UID duplicado de fonte contínua.');
      seen.add(card.uid);
      if(card.faceUp===true&&!negated.has(card.uid))sources.push({uid:card.uid,controllerTeam:team});
    }
  }
  return sources;
}
function assertCurrentLP(state:TagDuel,team:BurnTeam,currentLP:number):void{
  if(!Number.isSafeInteger(currentLP)||currentLP<0||state.core.players[team].lp!==currentLP){
    throw new Error('Snapshot de LP obsoleto para gatilho de dano.');
  }
}
function assertCurrentLPByTeam(state:TagDuel,values:readonly [number,number]):void{
  if(!Array.isArray(values)||values.length!==2)throw new Error('Snapshot de LP por equipe inválido.');
  assertCurrentLP(state,0,values[0]);
  assertCurrentLP(state,1,values[1]);
}
function assertEffectDamageEvent(event:EffectDamageEvent):void{
  assertNonEmpty(event?.eventId,'ID do evento de dano');
  assertTeam(event.targetTeam);
  assertCardId(event.sourceCardId,'Identidade da carta que causou o dano');
  assertNonEmpty(event.sourceUid,'UID físico da carta que causou o dano');
  if(!Number.isSafeInteger(event.currentLP)||event.currentLP<0||
    !Number.isSafeInteger(event.amount)||event.amount<0||
    !['effect','battle','cost','other'].includes(event.cause)||
    typeof event.resolved!=='boolean'||typeof event.damageApplied!=='boolean'||
    typeof event.effectNegated!=='boolean'){
    throw new Error('Evento de dano de efeito inválido.');
  }
  assertNegatedUids(event.negatedSourceUids);
}
function assertGraveMovementEvent(event:GraveMovementEvent):void{
  assertNonEmpty(event?.eventId,'ID do evento de envio ao Cemitério');
  if(typeof event.committed!=='boolean'||!Array.isArray(event.cards)||
    !Array.isArray(event.currentLPByTeam)||event.currentLPByTeam.length!==2){
    throw new Error('Evento de envio ao Cemitério inválido.');
  }
  assertCurrentLPShape(event.currentLPByTeam);
  const seen=new Set<string>();
  for(const card of event.cards){
    assertCardId(card?.id,'Identidade da carta enviada ao Cemitério');
    assertNonEmpty(card.uid,'UID físico da carta enviada ao Cemitério');
    if(!['monster','spell','trap'].includes(card.kind))throw new Error('Tipo de carta enviado ao Cemitério inválido.');
    if(seen.has(card.uid))throw new Error('UID duplicado no mesmo evento de Cemitério.');
    seen.add(card.uid);
  }
  assertNegatedUids(event.negatedSourceUids);
}
function assertCurrentLPShape(values:readonly [number,number]):void{
  if(values.some(value=>!Number.isSafeInteger(value)||value<0)){
    throw new Error('Snapshot de LP por equipe inválido.');
  }
}
function ownerOfPhysicalUid(state:TagDuel,uid:string):{ownerSeat:number;ownerTeam:BurnTeam}{
  const match=/^m([0-3]):(.+)$/.exec(uid);
  if(!match)throw new Error('UID físico sem proprietário de assento verificável.');
  const ownerSeat=Number(match[1]);
  const member=state.members[ownerSeat];
  if(!member||member.team!==ownerSeat%2)throw new Error('Proprietário físico inconsistente no UID.');
  return {ownerSeat,ownerTeam:member.team};
}
function committedGraveCards(state:TagDuel,event:GraveMovementEvent):OwnedGraveCard[]{
  const result:OwnedGraveCard[]=[];
  for(const card of event.cards){
    const owner=ownerOfPhysicalUid(state,card.uid);
    const matches=state.core.players[owner.ownerTeam].grave.filter(entry=>entry.uid===card.uid);
    if(matches.length!==1||matches[0].id!==card.id){
      throw new Error('A carta do evento não corresponde exatamente ao Cemitério do proprietário físico.');
    }
    result.push({...card,...owner});
  }
  return result;
}
function resolution(
  status:TriggeredBurnResolution['status'],
  ledger:TriggeredBurnLedger,
  plans:readonly TriggeredBurnPlan[]=[]
):TriggeredBurnResolution{
  return {status,ledger,plans};
}

export function createDarkRoomLedger():TriggeredBurnLedger{return {version:1,processedEventIds:[]};}
export function createCoffinSellerLedger():TriggeredBurnLedger{return {version:1,processedEventIds:[]};}
export function createSkullInvitationLedger():TriggeredBurnLedger{return {version:1,processedEventIds:[]};}

/**
 * Dark Room of Nightmare reacts only after effect damage is actually applied
 * to the opposing team. Its own damage is excluded to prevent recursion.
 * Each active copy creates its own 300-LP plan; this function never mutates LP.
 */
export function resolveDarkRoomOfNightmare(
  state:TagDuel,
  ledger:TriggeredBurnLedger,
  event:EffectDamageEvent
):TriggeredBurnResolution{
  assertLedger(ledger);assertEffectDamageEvent(event);
  if(ledger.processedEventIds.includes(event.eventId))return resolution('duplicate',ledger);
  assertClassicTag(state);assertCurrentLP(state,event.targetTeam,event.currentLP);
  const next=nextLedger(ledger,event.eventId);
  if(event.cause!=='effect'||!event.resolved||!event.damageApplied||event.effectNegated||event.amount===0){
    return resolution('no-damage',next);
  }
  if(event.sourceCardId===DARK_ROOM_OF_NIGHTMARE_ID)return resolution('not-applicable',next);
  const controllerTeam=(1-event.targetTeam) as BurnTeam;
  const sources=activeSources(state,DARK_ROOM_OF_NIGHTMARE_ID,[controllerTeam],assertNegatedUids(event.negatedSourceUids));
  const plans=sources.map(source=>({
    eventId:event.eventId,sourceUid:source.uid,sourceCardId:DARK_ROOM_OF_NIGHTMARE_ID,
    controllerTeam:source.controllerTeam,targetTeam:event.targetTeam,amount:300,
    reason:'opponent-effect-damage' as const
  }));
  return resolution(plans.length?'triggered':'unchanged',next,plans);
}

/**
 * Coffin Seller reacts once per movement batch when one or more monsters owned
 * by the opposing team enter that team's shared Graveyard. The amount is 300
 * per active copy, not per monster in the batch.
 */
export function resolveCoffinSeller(
  state:TagDuel,
  ledger:TriggeredBurnLedger,
  event:GraveMovementEvent
):TriggeredBurnResolution{
  assertLedger(ledger);assertGraveMovementEvent(event);
  if(ledger.processedEventIds.includes(event.eventId))return resolution('duplicate',ledger);
  assertClassicTag(state);assertCurrentLPByTeam(state,event.currentLPByTeam);
  const next=nextLedger(ledger,event.eventId);
  if(!event.committed||event.cards.length===0)return resolution('no-event',next);
  const cards=committedGraveCards(state,event);
  const negated=assertNegatedUids(event.negatedSourceUids);
  const plans:TriggeredBurnPlan[]=[];
  for(const controllerTeam of [0,1] as const){
    const targetTeam=(1-controllerTeam) as BurnTeam;
    if(!cards.some(card=>card.kind==='monster'&&card.ownerTeam===targetTeam))continue;
    const sources=activeSources(state,COFFIN_SELLER_ID,[controllerTeam],negated);
    for(const source of sources)plans.push({
      eventId:event.eventId,sourceUid:source.uid,sourceCardId:COFFIN_SELLER_ID,
      controllerTeam:source.controllerTeam,targetTeam,amount:300,
      reason:'opponent-monster-sent-to-grave'
    });
  }
  return resolution(plans.length?'triggered':'unchanged',next,plans);
}

/**
 * Skull Invitation damages each physical owner for every card in a committed
 * Graveyard batch. Every active copy applies independently, so copies stack.
 * Physical ownership is derived from the immutable m{seat}: UID prefix, never
 * from current control or the active seat rotation.
 */
export function resolveSkullInvitation(
  state:TagDuel,
  ledger:TriggeredBurnLedger,
  event:GraveMovementEvent
):TriggeredBurnResolution{
  assertLedger(ledger);assertGraveMovementEvent(event);
  if(ledger.processedEventIds.includes(event.eventId))return resolution('duplicate',ledger);
  assertClassicTag(state);assertCurrentLPByTeam(state,event.currentLPByTeam);
  const next=nextLedger(ledger,event.eventId);
  if(!event.committed||event.cards.length===0)return resolution('no-event',next);
  const cards=committedGraveCards(state,event);
  const counts:[number,number]=[0,0];
  for(const card of cards)counts[card.ownerTeam]++;
  const sources=activeSources(state,SKULL_INVITATION_ID,[0,1],assertNegatedUids(event.negatedSourceUids));
  const plans:TriggeredBurnPlan[]=[];
  for(const source of sources){
    for(const ownerTeam of [0,1] as const){
      if(counts[ownerTeam]===0)continue;
      plans.push({
        eventId:event.eventId,sourceUid:source.uid,sourceCardId:SKULL_INVITATION_ID,
        controllerTeam:source.controllerTeam,targetTeam:ownerTeam,amount:counts[ownerTeam]*300,
        reason:'card-owner-sent-to-grave'
      });
    }
  }
  return resolution(plans.length?'triggered':'unchanged',next,plans);
}
