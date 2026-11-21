import {getDuelCard} from './effectRegistry';
import {
  AGIDO_CARD_ID,
  agidoRecruitCandidates,
  resolveAgidoRecruitSelection,
  rollAgidoDie,
  type AgidoGraveCard,
} from './agidoRecruit';
import type {DuelRandom} from './duelRandom';
import type {TagDuel} from './tagDuel';

export {AGIDO_CARD_ID};

export type AgidoTagTeam=0|1;
export type AgidoTagSeat=0|1|2|3;
type TagPlayer=TagDuel['core']['players'][number];
type TagMonster=TagPlayer['monsters'][number];
type TagGraveRef=TagPlayer['grave'][number];

export type AgidoTagGraveCard=AgidoGraveCard & Readonly<{
  physicalOwnerSeat:AgidoTagSeat;
}>;

export type AgidoTagFieldMonster=Readonly<{
  uid:string;
  cardId?:string;
  physicalOwnerSeat:AgidoTagSeat;
  controllerSeat:AgidoTagSeat;
  zone:'monster';
  zoneSlot:0|1|2;
  faceUp:boolean;
  position:'attack'|'defense';
}>;

export type AgidoTagTriggerSnapshot=Readonly<{
  eventId:string;
  turn:number;
  team:AgidoTagTeam;
  activeSeat:AgidoTagSeat;
  sourceUid:string;
  sourcePhysicalOwnerSeat:AgidoTagSeat;
  destroyedByBattle:true;
  sentToGraveyard:true;
}>;

export type AgidoTagProjection=Readonly<{
  team:AgidoTagTeam;
  activeSeat:AgidoTagSeat;
  turn:number;
  graveyard:readonly AgidoTagGraveCard[];
  field:readonly AgidoTagFieldMonster[];
}>;

export type AgidoTagPlan=Readonly<{
  eventId:string;
  turn:number;
  team:AgidoTagTeam;
  activeSeat:AgidoTagSeat;
  sourceUid:string;
  sourcePhysicalOwnerSeat:AgidoTagSeat;
  roll:number;
  selectedUid:string|null;
  selectedPhysicalOwnerSeat:AgidoTagSeat|null;
  monsterZoneSlot:0|1|2|null;
}>;

export type AgidoTagPlanResult=
  | Readonly<{allowed:false;reason:'not-tag-classic'|'invalid-trigger'|'stale-trigger'|'invalid-selection'|'monster-zone-full'}>
  | Readonly<{allowed:true;plan:AgidoTagPlan}>;

export type AgidoTagResolution=
  | Readonly<{resolved:false;reason:'not-tag-classic'|'invalid-trigger'|'stale-trigger'|'duplicate-event'|'selected-card-missing'|'monster-zone-full'}>
  | Readonly<{
      resolved:true;
      summoned:boolean;
      team:AgidoTagTeam;
      activeSeat:AgidoTagSeat;
      selectedUid:string|null;
      graveyard:readonly AgidoTagGraveCard[];
      field:readonly AgidoTagFieldMonster[];
      processedEventIds:readonly string[];
    }>;

export type AgidoTagDieRoll=Readonly<{roll:number;nextRandom:DuelRandom}>;

const isSeat=(value:unknown):value is AgidoTagSeat=>
  typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=3;
const isTeam=(value:unknown):value is AgidoTagTeam=>value===0||value===1;
export function physicalSeatFromAgidoUid(uid:string):AgidoTagSeat|null{
  const match=/^m([0-3]):/.exec(uid);
  return match?Number(match[1]) as AgidoTagSeat:null;
}

/** Rolls against a cloned persisted stream. The caller commits nextRandom only
 * with the same action that records the trigger result; the input state is never mutated. */
export function rollTagAgidoDie(random:DuelRandom):AgidoTagDieRoll{
  if(!random||typeof random!=='object')throw new TypeError('Invalid persisted duel random state.');
  const nextRandom={...random};
  const roll=rollAgidoDie(nextRandom);
  return {roll,nextRandom};
}

function phaseAllowsTrigger(game:TagDuel):boolean{
  return !!game&&!!game.core&&(game.core.phase==='battle'||game.core.phase==='response');
}

function graveProjection(player:TagPlayer):AgidoTagGraveCard[]|null{
  if(!Array.isArray(player.grave))return null;
  const result:AgidoTagGraveCard[]=[];
  const seen=new Set<string>();
  for(const card of player.grave as readonly TagGraveRef[]){
    if(!card||typeof card!=='object'||typeof card.uid!=='string'||typeof card.id!=='string')return null;
    const physicalOwnerSeat=physicalSeatFromAgidoUid(card.uid);
    if(physicalOwnerSeat===null||seen.has(card.uid))return null;
    seen.add(card.uid);
    const extended=card as TagGraveRef & {properlySummoned?:boolean;entityKind?:string};
    result.push({
      uid:card.uid,id:card.id,physicalOwnerSeat,
      ...(extended.properlySummoned===true?{properlySummoned:true}:{}),
      ...(extended.entityKind==='token'?{entityKind:'token'}:{})
    });
  }
  return result;
}

function fieldProjection(game:TagDuel,team:AgidoTagTeam,activeSeat:AgidoTagSeat):AgidoTagFieldMonster[]|null{
  const player=game.core.players[team];
  if(!player||!Array.isArray(player.monsters)||player.monsters.length>3)return null;
  const result:AgidoTagFieldMonster[]=[];
  const seen=new Set<string>();
  for(let index=0;index<player.monsters.length;index++){
    const card:TagMonster=player.monsters[index];
    if(!card||typeof card!=='object'||typeof card.uid!=='string'||typeof card.id!=='string'||
      typeof card.faceUp!=='boolean')return null;
    const physicalOwnerSeat=physicalSeatFromAgidoUid(card.uid);
    if(physicalOwnerSeat===null||seen.has(card.uid))return null;
    const position=card.position==='atk'?'attack':card.position==='def'?'defense':null;
    if(!position)return null;
    seen.add(card.uid);
    result.push({
      uid:card.uid,...(card.faceUp?{cardId:card.id}:{}),
      physicalOwnerSeat,controllerSeat:activeSeat,zone:'monster',
      zoneSlot:index as 0|1|2,faceUp:card.faceUp,position
    });
  }
  return result;
}

function project(game:TagDuel,team:AgidoTagTeam):AgidoTagProjection|null{
  if(!game||game.mode!=='tag-classic'||!game.core||!Array.isArray(game.core.players)||
    game.core.players.length!==2||!Array.isArray(game.active)||game.active.length!==2||
    !isTeam(team)||!Number.isSafeInteger(game.core.turn)||game.core.turn<1)return null;
  const activeSeat=game.active[team];
  if(!isSeat(activeSeat)||activeSeat%2!==team)return null;
  const player=game.core.players[team];
  if(!player)return null;
  const graveyard=graveProjection(player);
  const field=fieldProjection(game,team,activeSeat);
  if(!graveyard||!field)return null;
  const allUids=new Set<string>();
  for(const card of [...graveyard,...field]){
    if(allUids.has(card.uid))return null;
    allUids.add(card.uid);
  }
  return {team,activeSeat,turn:game.core.turn,graveyard,field};
}

/** Capture only a battle-destruction event that has already reached the team's shared GY. */
export function captureTagAgidoBattleTrigger(
  game:TagDuel,eventId:string,team:AgidoTagTeam,sourceUid:string,
  destroyedByBattle:boolean,sentToGraveyard:boolean
):AgidoTagTriggerSnapshot|null{
  if(!game||game.mode!=='tag-classic'||!game.core||!Array.isArray(game.core.players)||
    game.core.players.length!==2||!Array.isArray(game.active)||game.active.length!==2||
    typeof eventId!=='string'||!eventId.trim()||eventId.length>128||
    !isTeam(team)||typeof sourceUid!=='string'||!sourceUid||
    !destroyedByBattle||!sentToGraveyard||!phaseAllowsTrigger(game))return null;
  const context=project(game,team);
  if(!context)return null;
  const source=context.graveyard.find(card=>card.uid===sourceUid&&card.id===AGIDO_CARD_ID);
  if(!source)return null;
  return {
    eventId,turn:context.turn,team,activeSeat:context.activeSeat,
    sourceUid,sourcePhysicalOwnerSeat:source.physicalOwnerSeat,
    destroyedByBattle:true,sentToGraveyard:true
  };
}

function currentContext(
  game:TagDuel,snapshot:AgidoTagTriggerSnapshot
):AgidoTagProjection|null{
  if(!snapshot||typeof snapshot!=='object'||typeof snapshot.eventId!=='string'||
    !snapshot.eventId.trim()||snapshot.eventId.length>128||
    !isTeam(snapshot.team)||!isSeat(snapshot.activeSeat)||
    !isSeat(snapshot.sourcePhysicalOwnerSeat)||typeof snapshot.sourceUid!=='string'||
    !snapshot.sourceUid||snapshot.destroyedByBattle!==true||snapshot.sentToGraveyard!==true||
    !Number.isSafeInteger(snapshot.turn)||snapshot.turn<1)return null;
  if(!game||game.mode!=='tag-classic'||!game.core||!Array.isArray(game.core.players)||
    game.core.players.length!==2||!Array.isArray(game.active)||game.active.length!==2||
    !phaseAllowsTrigger(game)||game.core.turn!==snapshot.turn||
    game.active[snapshot.team]!==snapshot.activeSeat||
    snapshot.activeSeat%2!==snapshot.team)return null;
  const context=project(game,snapshot.team);
  if(!context||context.activeSeat!==snapshot.activeSeat)return null;
  const source=context.graveyard.find(card=>card.uid===snapshot.sourceUid&&card.id===AGIDO_CARD_ID);
  if(!source||source.physicalOwnerSeat!==snapshot.sourcePhysicalOwnerSeat)return null;
  return context;
}

/** Returns the private team's shared-GY/field view used by Agido's choice. */
export function projectTagAgidoState(
  game:TagDuel,team:AgidoTagTeam
):AgidoTagProjection|null{
  return project(game,team);
}

export function planTagAgidoRecruit(
  game:TagDuel,snapshot:AgidoTagTriggerSnapshot,roll:number,selectedUid:string|null,
  getCard:(id:string)=>ReturnType<typeof getDuelCard>=getDuelCard
):AgidoTagPlanResult{
  if(!game||game.mode!=='tag-classic')return {allowed:false,reason:'not-tag-classic'};
  const context=currentContext(game,snapshot);
  if(!context)return {allowed:false,reason:'invalid-trigger'};
  if(!Number.isInteger(roll)||roll<1||roll>6)return {allowed:false,reason:'invalid-selection'};
  if(selectedUid!==null&&(typeof selectedUid!=='string'||!selectedUid))return {allowed:false,reason:'invalid-selection'};
  if(selectedUid===null){
    return {allowed:true,plan:{
      eventId:snapshot.eventId,turn:snapshot.turn,team:snapshot.team,activeSeat:snapshot.activeSeat,
      sourceUid:snapshot.sourceUid,sourcePhysicalOwnerSeat:snapshot.sourcePhysicalOwnerSeat,
      roll,selectedUid:null,selectedPhysicalOwnerSeat:null,monsterZoneSlot:null
    }};
  }
  if(context.field.length>=3)return {allowed:false,reason:'monster-zone-full'};
  const selected=resolveAgidoRecruitSelection(
    context.graveyard,roll,context.field.length,selectedUid,getCard
  );
  if(!selected)return {allowed:false,reason:'invalid-selection'};
  const physicalOwnerSeat=physicalSeatFromAgidoUid(selected.uid);
  if(physicalOwnerSeat===null)return {allowed:false,reason:'invalid-selection'};
  const occupied=new Set(context.field.map(card=>card.zoneSlot));
  const slot=([0,1,2] as const).find(value=>!occupied.has(value));
  if(slot===undefined)return {allowed:false,reason:'monster-zone-full'};
  return {allowed:true,plan:{
    eventId:snapshot.eventId,turn:snapshot.turn,team:snapshot.team,activeSeat:snapshot.activeSeat,
    sourceUid:snapshot.sourceUid,sourcePhysicalOwnerSeat:snapshot.sourcePhysicalOwnerSeat,
    roll,selectedUid:selected.uid,selectedPhysicalOwnerSeat:physicalOwnerSeat,monsterZoneSlot:slot
  }};
}

export function resolveTagAgidoRecruit(
  game:TagDuel,snapshot:AgidoTagTriggerSnapshot,plan:AgidoTagPlan,
  processedEventIds:readonly string[]=[],
  getCard:(id:string)=>ReturnType<typeof getDuelCard>=getDuelCard
):AgidoTagResolution{
  if(!game||game.mode!=='tag-classic')return {resolved:false,reason:'not-tag-classic'};
  if(!Array.isArray(processedEventIds)||processedEventIds.length>10000||
    processedEventIds.some(id=>typeof id!=='string'||!id||id.length>128)||
    new Set(processedEventIds).size!==processedEventIds.length)return {resolved:false,reason:'invalid-trigger'};
  if(!plan||typeof plan!=='object'||!snapshot||typeof snapshot!=='object'||
    plan.eventId!==snapshot.eventId||plan.turn!==snapshot.turn||plan.team!==snapshot.team||
    plan.activeSeat!==snapshot.activeSeat||plan.sourceUid!==snapshot.sourceUid||
    plan.sourcePhysicalOwnerSeat!==snapshot.sourcePhysicalOwnerSeat||
    !Number.isInteger(plan.roll)||plan.roll<1||plan.roll>6)return {resolved:false,reason:'invalid-trigger'};
  if(processedEventIds.includes(plan.eventId))return {resolved:false,reason:'duplicate-event'};
  const context=currentContext(game,snapshot);
  if(!context)return {resolved:false,reason:'stale-trigger'};
  if(plan.selectedUid===null){
    if(plan.selectedPhysicalOwnerSeat!==null||plan.monsterZoneSlot!==null)
      return {resolved:false,reason:'invalid-trigger'};
    return {resolved:true,summoned:false,team:plan.team,activeSeat:plan.activeSeat,
      selectedUid:null,graveyard:context.graveyard,field:context.field,
      processedEventIds:[...processedEventIds,plan.eventId]};
  }
  if(typeof plan.selectedUid!=='string'||!plan.selectedUid||
    !isSeat(plan.selectedPhysicalOwnerSeat)||plan.monsterZoneSlot===null||
    plan.monsterZoneSlot===undefined)return {resolved:false,reason:'invalid-trigger'};
  const selected=resolveAgidoRecruitSelection(
    context.graveyard,plan.roll,context.field.length,plan.selectedUid,getCard
  );
  if(!selected)return {resolved:false,reason:'selected-card-missing'};
  const physicalOwnerSeat=physicalSeatFromAgidoUid(selected.uid);
  if(physicalOwnerSeat===null||physicalOwnerSeat!==plan.selectedPhysicalOwnerSeat)
    return {resolved:false,reason:'selected-card-missing'};
  const occupied=new Set(context.field.map(card=>card.zoneSlot));
  const slot=([0,1,2] as const).find(value=>!occupied.has(value));
  if(slot===undefined)return {resolved:false,reason:'monster-zone-full'};
  if(slot!==plan.monsterZoneSlot)return {resolved:false,reason:'stale-trigger' as const};
  const nextGraveyard=context.graveyard.filter(card=>card.uid!==selected.uid);
  const nextField:AgidoTagFieldMonster[]=[...context.field,{
    uid:selected.uid,cardId:selected.id,physicalOwnerSeat,controllerSeat:plan.activeSeat,
    zone:'monster',zoneSlot:slot,faceUp:true,position:'attack'
  }];
  return {resolved:true,summoned:true,team:plan.team,activeSeat:plan.activeSeat,
    selectedUid:selected.uid,graveyard:nextGraveyard,field:nextField,
    processedEventIds:[...processedEventIds,plan.eventId]};
}
