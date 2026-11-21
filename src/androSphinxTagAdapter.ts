import {getDuelCard} from './effectRegistry';
import type {TagDuel} from './tagDuel';
import {
  ANDRO_SPHINX_CARD_ID,
  ANDRO_SPHINX_LP_COST,
  type AndroSphinxBattleDamageResult,
  type AndroSphinxBattleEvent,
  type AndroSphinxFieldCard,
  type AndroSphinxHandCard,
  type AndroSphinxSummonPlan,
  canAndroSphinxAttack,
  planAndroSphinxSpecialSummon,
  resolveAndroSphinxBattleDamage,
  resolveAndroSphinxSpecialSummon,
} from './androSphinxRules';

export type TagTeamIndex = 0 | 1;
export type TagPhysicalSeat = 0 | 1 | 2 | 3;
type TagPlayer = TagDuel['core']['players'][number];
type TagMonster = TagPlayer['monsters'][number];
type TagBackrow = TagPlayer['backrow'][number];

export type AndroSphinxTagProjection = Readonly<{
  teamIndex: TagTeamIndex;
  activeSeat: TagPhysicalSeat;
  teamLP: number;
  turn: number;
  hand: readonly AndroSphinxHandCard[];
  field: readonly AndroSphinxFieldCard[];
}>;

export type AndroSphinxTagPlan = Readonly<{
  teamIndex: TagTeamIndex;
  primitive: AndroSphinxSummonPlan;
}>;

type PlanFailure = Extract<ReturnType<typeof planAndroSphinxSpecialSummon>, {allowed:false}>['reason'];
type ResolveFailure = Extract<ReturnType<typeof resolveAndroSphinxSpecialSummon>, {resolved:false}>['reason'];
type BattleFailure = Extract<AndroSphinxBattleDamageResult, {applied:false}>;
type BattleApplied = Extract<AndroSphinxBattleDamageResult, {applied:true}>;

export type AndroSphinxTagPlanResult =
  | Readonly<{allowed:false;reason:'not-tag-classic'|'wrong-phase'|'invalid-tag-state'|PlanFailure}>
  | Readonly<{allowed:true;plan:AndroSphinxTagPlan}>;

export type AndroSphinxTagSummonResult =
  | Readonly<{resolved:false;reason:'not-tag-classic'|'wrong-phase'|'invalid-tag-state'|ResolveFailure}>
  | Readonly<{
      resolved:true;
      teamIndex:TagTeamIndex;
      activeSeat:TagPhysicalSeat;
      sourceUid:string;
      physicalOwnerSeat:TagPhysicalSeat;
      controllerSeat:TagPhysicalSeat;
      monsterZoneSlot:0|1|2;
      position:'attack'|'defense';
      summonedTurn:number;
      remainingTeamLP:number;
      lpCost:typeof ANDRO_SPHINX_LP_COST;
    }>;

export type AndroSphinxTagBattleInput =
  Omit<AndroSphinxBattleEvent,
    'sourceCardId'|'sourcePhysicalOwnerSeat'|'sourceControllerSeat'|'destroyedPhysicalOwnerSeat'>;

export type AndroSphinxTagBattleResult =
  | BattleFailure
  | (BattleApplied & Readonly<{damagedTeamIndex:TagTeamIndex}>)
  | null;

const isSeat=(value:unknown):value is TagPhysicalSeat=>
  typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=3;
const isTeam=(value:unknown):value is TagTeamIndex=>value===0||value===1;

export function physicalSeatFromTagUid(uid:string):TagPhysicalSeat|null{
  const match=/^m([0-3]):/.exec(uid);
  return match?Number(match[1]) as TagPhysicalSeat:null;
}

function handProjection(hand:TagPlayer['hand'],activeSeat:TagPhysicalSeat):AndroSphinxHandCard[]|null{
  const result:AndroSphinxHandCard[]=[];
  for(const card of hand){
    const physicalOwnerSeat=physicalSeatFromTagUid(card.uid);
    if(physicalOwnerSeat===null||physicalOwnerSeat!==activeSeat)return null;
    const kind=card.id===ANDRO_SPHINX_CARD_ID?'monster':getDuelCard(card.id)?.kind;
    if(kind!=='monster'&&kind!=='spell'&&kind!=='trap')return null;
    result.push({uid:card.uid,cardId:card.id,physicalOwnerSeat,kind});
  }
  return result;
}

function fieldProjection(game:TagDuel):AndroSphinxFieldCard[]|null{
  const field:AndroSphinxFieldCard[]=[];
  for(const teamIndex of [0,1] as const){
    const controllerSeat=game.active[teamIndex];
    const player=game.core.players[teamIndex];
    if(!isSeat(controllerSeat)||controllerSeat%2!==teamIndex||
      player.monsters.length>3||player.backrow.length>3)return null;
    for(let index=0;index<player.monsters.length;index++){
      const card:TagMonster=player.monsters[index];
      const physicalOwnerSeat=physicalSeatFromTagUid(card.uid);
      if(physicalOwnerSeat===null||typeof card.faceUp!=='boolean')return null;
      const position=card.position==='atk'?'attack':card.position==='def'?'defense':null;
      if(!position)return null;
      field.push({
        uid:card.uid,
        ...(card.faceUp?{cardId:card.id}:{}),
        physicalOwnerSeat,controllerSeat,zone:'monster',
        zoneSlot:index as 0|1|2,faceUp:card.faceUp,position,
        ...(card.lastSummonedTurn!==undefined?{lastNormalOrSpecialSummonTurn:card.lastSummonedTurn}:{})
      });
    }
    for(let index=0;index<player.backrow.length;index++){
      const card:TagBackrow=player.backrow[index];
      const physicalOwnerSeat=physicalSeatFromTagUid(card.uid);
      if(physicalOwnerSeat===null||typeof card.faceUp!=='boolean')return null;
      field.push({
        uid:card.uid,
        ...(card.faceUp?{cardId:card.id}:{}),
        physicalOwnerSeat,controllerSeat,zone:'backrow',
        zoneSlot:index as 0|1|2,faceUp:card.faceUp
      });
    }
    const fieldCard=player.field;
    if(fieldCard){
      const physicalOwnerSeat=physicalSeatFromTagUid(fieldCard.uid);
      if(physicalOwnerSeat===null||typeof fieldCard.faceUp!=='boolean')return null;
      field.push({
        uid:fieldCard.uid,
        ...(fieldCard.faceUp?{cardId:fieldCard.id}:{}),
        physicalOwnerSeat,controllerSeat,zone:'field',faceUp:fieldCard.faceUp
      });
    }
  }
  return field;
}

/** Projects only the active representative's private hand and both teams' shared field. */
export function projectAndroSphinxTagState(game:TagDuel):AndroSphinxTagProjection|null{
  if(!game||game.mode!=='tag-classic'||!game.core||!Array.isArray(game.core.players)||
    game.core.players.length!==2||!Array.isArray(game.active)||game.active.length!==2||
    !isTeam(game.core.current)||!Number.isSafeInteger(game.core.turn)||game.core.turn<1)return null;
  const teamIndex=game.core.current;
  const activeSeat=game.active[teamIndex];
  if(!isSeat(activeSeat)||activeSeat%2!==teamIndex)return null;
  const player=game.core.players[teamIndex];
  if(!player||!Number.isSafeInteger(player.lp)||player.lp<0)return null;
  const hand=handProjection(player.hand,activeSeat);
  const field=fieldProjection(game);
  if(!hand||!field)return null;
  return {teamIndex,activeSeat,teamLP:player.lp,turn:game.core.turn,hand,field};
}

export function planTagAndroSphinxSummon(game:TagDuel,sourceUid:string):AndroSphinxTagPlanResult{
  if(!game||game.mode!=='tag-classic')return {allowed:false,reason:'not-tag-classic'};
  if(game.core.phase!=='main')return {allowed:false,reason:'wrong-phase'};
  const context=projectAndroSphinxTagState(game);
  if(!context)return {allowed:false,reason:'invalid-tag-state'};
  const result=planAndroSphinxSpecialSummon({
    activeSeat:context.activeSeat,teamLP:context.teamLP,sourceUid,
    hand:context.hand,field:context.field
  });
  return result.allowed
    ?{allowed:true,plan:{teamIndex:context.teamIndex,primitive:result.plan}}
    :result;
}

export function resolveTagAndroSphinxSummon(
  game:TagDuel,plan:AndroSphinxTagPlan,position:'attack'|'defense'
):AndroSphinxTagSummonResult{
  if(!game||game.mode!=='tag-classic')return {resolved:false,reason:'not-tag-classic'};
  if(game.core.phase!=='main')return {resolved:false,reason:'wrong-phase'};
  if(!plan||!plan.primitive||!isTeam(plan.teamIndex))return {resolved:false,reason:'invalid-tag-state'};
  const context=projectAndroSphinxTagState(game);
  if(!context||plan.teamIndex!==context.teamIndex||
    plan.primitive.activeSeat!==context.activeSeat)return {resolved:false,reason:'invalid-tag-state'};
  const result=resolveAndroSphinxSpecialSummon({
    plan:plan.primitive,activeSeat:context.activeSeat,teamLP:context.teamLP,
    turn:context.turn,position,hand:context.hand,field:context.field
  });
  if(!result.resolved)return result;
  return {
    resolved:true,teamIndex:context.teamIndex,activeSeat:result.activeSeat,
    sourceUid:result.summonedUid,physicalOwnerSeat:result.physicalOwnerSeat,
    controllerSeat:result.controllerSeat,monsterZoneSlot:result.monsterZoneSlot,
    position:result.position,summonedTurn:result.summonedTurn,
    remainingTeamLP:result.remainingTeamLP,lpCost:ANDRO_SPHINX_LP_COST
  };
}

export function canTagAndroSphinxAttack(game:TagDuel,sourceUid:string):boolean{
  if(!game||game.mode!=='tag-classic'||!Number.isSafeInteger(game.core.turn)||game.core.turn<1)return false;
  const field=fieldProjection(game);
  if(!field)return false;
  const source=field.find(card=>card.uid===sourceUid&&card.zone==='monster'&&card.cardId===ANDRO_SPHINX_CARD_ID&&card.faceUp);
  return source?canAndroSphinxAttack(source,game.core.turn):false;
}

/** Resolves the trigger from an immutable battle snapshot; returns the shared LP team, never mutates TagDuel. */
export function resolveTagAndroSphinxBattleDamage(
  game:TagDuel,input:AndroSphinxTagBattleInput,processedEventIds:readonly string[]=[]
):AndroSphinxTagBattleResult{
  if(!game||game.mode!=='tag-classic'||!input||typeof input!=='object')return null;
  const field=fieldProjection(game);
  if(!field)return null;
  const source=field.find(card=>card.uid===input.sourceUid&&card.zone==='monster');
  if(!source||source.cardId!==ANDRO_SPHINX_CARD_ID||!source.faceUp)return {applied:false,reason:'wrong-source'};
  const destroyedPhysicalOwnerSeat=physicalSeatFromTagUid(input.destroyedUid);
  if(destroyedPhysicalOwnerSeat===null||!isSeat(input.destroyedControllerSeat))return null;
  const result=resolveAndroSphinxBattleDamage({
    ...input,
    sourceCardId:source.cardId,
    sourcePhysicalOwnerSeat:source.physicalOwnerSeat,
    sourceControllerSeat:source.controllerSeat,
    destroyedPhysicalOwnerSeat
  },processedEventIds);
  return result.applied
    ?{...result,damagedTeamIndex:result.damagedTeam==='even'?0:1}
    :result;
}
