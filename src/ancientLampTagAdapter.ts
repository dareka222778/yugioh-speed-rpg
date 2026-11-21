import {getDuelCard} from './effectRegistry';
import type {TagDuel} from './tagDuel';
import {
  ANCIENT_LAMP_CARD_ID,
  LA_JINN_CARD_ID,
  type AncientLampAttackSnapshot,
  type AncientLampFieldMonster,
  type AncientLampHandCard,
  type AncientLampRedirectPlan,
  type AncientLampSummonPlan,
  planAncientLampAttackRedirect,
  planAncientLampLaJinnSummon,
  resolveAncientLampAttackRedirect,
  resolveAncientLampLaJinnSummon,
} from './ancientLampRules';

export {ANCIENT_LAMP_CARD_ID,LA_JINN_CARD_ID};

export type TagLampTeam=0|1;
export type TagLampSeat=0|1|2|3;
type TagPlayer=TagDuel['core']['players'][number];
type TagMonster=TagPlayer['monsters'][number];

export type AncientLampTagProjection=Readonly<{
  team:TagLampTeam;
  activeSeat:TagLampSeat;
  turn:number;
  phase:'main'|'battle'|'response'|'end';
  hand:readonly AncientLampHandCard[];
  field:readonly AncientLampFieldMonster[];
}>;

export type AncientLampTagSummonPlan=Readonly<{
  team:TagLampTeam;
  primitive:AncientLampSummonPlan;
}>;

type SummonPlanFailure=Extract<ReturnType<typeof planAncientLampLaJinnSummon>,{allowed:false}>['reason'];
type SummonResolveFailure=Extract<ReturnType<typeof resolveAncientLampLaJinnSummon>,{resolved:false}>['reason'];
type RedirectPlanFailure=Extract<ReturnType<typeof planAncientLampAttackRedirect>,{allowed:false}>['reason'];
type RedirectResolveFailure=Extract<ReturnType<typeof resolveAncientLampAttackRedirect>,{redirected:false}>['reason'];

export type AncientLampTagSummonPlanResult=
  | Readonly<{allowed:false;reason:'not-tag-classic'|'invalid-tag-state'|SummonPlanFailure}>
  | Readonly<{allowed:true;plan:AncientLampTagSummonPlan}>;

export type AncientLampTagSummonResult=
  | Readonly<{resolved:false;reason:'not-tag-classic'|'invalid-tag-state'|SummonResolveFailure}>
  | Readonly<{
      resolved:true;team:TagLampTeam;activeSeat:TagLampSeat;
      sourceUid:string;physicalOwnerSeat:TagLampSeat;controllerSeat:TagLampSeat;
      monsterZoneSlot:0|1|2;position:'attack'|'defense';
    }>;

export type AncientLampAttackStartSnapshot=Readonly<{
  eventId:string;turn:number;attackerUid:string;lampUid:string;
  attackerTeam:TagLampTeam;lampTeam:TagLampTeam;
  wasFaceDownAtDamageStepStart:true;
}>;

export type AncientLampTagRedirectPlan=Readonly<{
  team:TagLampTeam;primitive:AncientLampRedirectPlan;
}>;

export type AncientLampTagRedirectPlanResult=
  | Readonly<{allowed:false;reason:'not-tag-classic'|'invalid-tag-state'|'lamp-effect-negated'|RedirectPlanFailure}>
  | Readonly<{allowed:true;plan:AncientLampTagRedirectPlan}>;

export type AncientLampTagRedirectResult=
  | Readonly<{redirected:false;reason:'not-tag-classic'|'invalid-tag-state'|'lamp-effect-negated'|RedirectResolveFailure}>
  | Readonly<{
      redirected:true;team:TagLampTeam;eventId:string;
      attackerUid:string;lampUid:string;targetUid:string;
      targetFaceUp:boolean;processedEventIds:readonly string[];
    }>;

const isSeat=(value:unknown):value is TagLampSeat=>
  typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=3;
const isTeam=(value:unknown):value is TagLampTeam=>value===0||value===1;

export function physicalSeatFromAncientLampUid(uid:string):TagLampSeat|null{
  const match=/^m([0-3]):/.exec(uid);
  return match?Number(match[1]) as TagLampSeat:null;
}

function phaseOf(game:TagDuel):AncientLampTagProjection['phase']{
  if(game.core.phase==='main')return 'main';
  if(game.core.phase==='battle')return 'battle';
  if(game.core.phase==='finished')return 'end';
  return 'response';
}

function handProjection(hand:TagPlayer['hand'],activeSeat:TagLampSeat):AncientLampHandCard[]|null{
  if(!Array.isArray(hand))return null;
  const result:AncientLampHandCard[]=[];
  const seenUids=new Set<string>();
  for(const card of hand){
    if(!card||typeof card!=='object'||typeof card.uid!=='string'||typeof card.id!=='string')return null;
    const physicalOwnerSeat=physicalSeatFromAncientLampUid(card.uid);
    if(physicalOwnerSeat===null||physicalOwnerSeat!==activeSeat||seenUids.has(card.uid))return null;
    const kind=card.id===LA_JINN_CARD_ID||card.id===ANCIENT_LAMP_CARD_ID?'monster':getDuelCard(card.id)?.kind;
    if(kind!=='monster'&&kind!=='spell'&&kind!=='trap')return null;
    seenUids.add(card.uid);
    result.push({uid:card.uid,cardId:card.id,physicalOwnerSeat,kind});
  }
  return result;
}

function fieldProjection(game:TagDuel,effectSourceUid?:string,effectNegated=false):AncientLampFieldMonster[]|null{
  if(!game||!game.core||!Array.isArray(game.core.players)||game.core.players.length!==2||
    !Array.isArray(game.active)||game.active.length!==2)return null;
  const field:AncientLampFieldMonster[]=[];
  const seenUids=new Set<string>();
  for(const team of [0,1] as const){
    const controllerSeat=game.active[team];
    const player=game.core.players[team];
    if(!isSeat(controllerSeat)||controllerSeat%2!==team||!player||
      !Array.isArray(player.monsters)||player.monsters.length>3)return null;
    for(let index=0;index<player.monsters.length;index++){
      const card:TagMonster=player.monsters[index];
      if(!card||typeof card!=='object'||typeof card.uid!=='string'||typeof card.id!=='string')return null;
      const physicalOwnerSeat=physicalSeatFromAncientLampUid(card.uid);
      if(physicalOwnerSeat===null||seenUids.has(card.uid)||typeof card.faceUp!=='boolean')return null;
      const position=card.position==='atk'?'attack':card.position==='def'?'defense':null;
      if(!position)return null;
      seenUids.add(card.uid);
      field.push({
        uid:card.uid,
        ...(card.faceUp?{cardId:card.id}:{}),
        physicalOwnerSeat,controllerSeat,zone:'monster',
        zoneSlot:index as 0|1|2,faceUp:card.faceUp,position,
        ...(card.uid===effectSourceUid?{effectNegated}:{})
      });
    }
  }
  return field;
}

/** Projects the active physical hand and the six shared Monster Zones only. */
export function projectAncientLampTagState(
  game:TagDuel,effectSourceUid?:string,effectNegated=false
):AncientLampTagProjection|null{
  if(!game||game.mode!=='tag-classic'||!game.core||!Array.isArray(game.core.players)||
    game.core.players.length!==2||!Array.isArray(game.active)||game.active.length!==2||
    !isTeam(game.core.current)||!Number.isSafeInteger(game.core.turn)||game.core.turn<1)return null;
  const team=game.core.current,activeSeat=game.active[team],player=game.core.players[team];
  if(!isSeat(activeSeat)||activeSeat%2!==team||!player)return null;
  const hand=handProjection(player.hand,activeSeat);
  const field=fieldProjection(game,effectSourceUid,effectNegated);
  if(!hand||!field)return null;
  return {team,activeSeat,turn:game.core.turn,phase:phaseOf(game),hand,field};
}

export function planTagAncientLampSummon(
  game:TagDuel,sourceUid:string,laJinnUid:string,sourceEffectNegated:boolean
):AncientLampTagSummonPlanResult{
  if(!game||game.mode!=='tag-classic')return {allowed:false,reason:'not-tag-classic'};
  if(typeof sourceEffectNegated!=='boolean')return {allowed:false,reason:'invalid-tag-state'};
  const context=projectAncientLampTagState(game,sourceUid,sourceEffectNegated);
  if(!context)return {allowed:false,reason:'invalid-tag-state'};
  const result=planAncientLampLaJinnSummon({
    phase:context.phase,activeSeat:context.activeSeat,sourceUid,laJinnUid,
    hand:context.hand,field:context.field
  });
  return result.allowed?{allowed:true,plan:{team:context.team,primitive:result.plan}}:result;
}

export function resolveTagAncientLampSummon(
  game:TagDuel,plan:AncientLampTagSummonPlan,position:'attack'|'defense',sourceEffectNegated:boolean
):AncientLampTagSummonResult{
  if(!game||game.mode!=='tag-classic')return {resolved:false,reason:'not-tag-classic'};
  if(typeof sourceEffectNegated!=='boolean'||!plan||!plan.primitive||!isTeam(plan.team))return {resolved:false,reason:'invalid-tag-state'};
  const context=projectAncientLampTagState(game,plan.primitive.sourceUid,sourceEffectNegated);
  if(!context||context.team!==plan.team||context.activeSeat!==plan.primitive.activeSeat)return {resolved:false,reason:'invalid-tag-state'};
  const result=resolveAncientLampLaJinnSummon({
    plan:plan.primitive,phase:context.phase,activeSeat:context.activeSeat,
    position,hand:context.hand,field:context.field
  });
  if(!result.resolved)return result;
  return {
    resolved:true,team:context.team,activeSeat:result.activeSeat,
    sourceUid:result.summonedUid,physicalOwnerSeat:result.physicalOwnerSeat,
    controllerSeat:result.controllerSeat,monsterZoneSlot:result.monsterZoneSlot,
    position:result.position
  };
}

/** Capture the server-known face-down target before the engine reveals it. No card identity is returned. */
export function captureTagAncientLampAttackStart(game:TagDuel,eventId:string):AncientLampAttackStartSnapshot|null{
  if(!game||game.mode!=='tag-classic'||!game.core||!Array.isArray(game.core.players)||
    game.core.players.length!==2||!Array.isArray(game.active)||game.active.length!==2||
    typeof eventId!=='string'||!eventId.trim()||eventId.length>128)return null;
  const pending=game.core.pending;
  if(!pending||typeof pending!=='object'||pending.kind!=='attack'||pending.stage!=='declare'||pending.target===undefined||
    !isTeam(pending.actor)||game.core.current!==pending.actor||
    !['battle','response'].includes(game.core.phase))return null;
  const attackerPlayer=game.core.players[pending.actor];
  const lampTeam=(1-pending.actor) as TagLampTeam;
  const lampPlayer=game.core.players[lampTeam];
  if(!attackerPlayer||!Array.isArray(attackerPlayer.monsters)||!lampPlayer||!Array.isArray(lampPlayer.monsters))return null;
  const attacker=attackerPlayer.monsters.find(card=>card&&card.uid===pending.card);
  const lamp=lampPlayer.monsters.find(card=>card&&card.uid===pending.target);
  if(!attacker||!attacker.faceUp||!lamp||lamp.id!==ANCIENT_LAMP_CARD_ID||lamp.faceUp!==false||
    physicalSeatFromAncientLampUid(attacker.uid)===null||
    physicalSeatFromAncientLampUid(lamp.uid)===null)return null;
  const attackerSeat=game.active[pending.actor],lampSeat=game.active[lampTeam];
  if(!isSeat(attackerSeat)||attackerSeat%2!==pending.actor||!isSeat(lampSeat)||lampSeat%2!==lampTeam)return null;
  return {
    eventId,turn:game.core.turn,attackerUid:attacker.uid,lampUid:lamp.uid,
    attackerTeam:pending.actor,lampTeam,wasFaceDownAtDamageStepStart:true
  };
}

function attackSnapshot(
  game:TagDuel,snapshot:AncientLampAttackStartSnapshot,sourceEffectNegated:boolean
):{attack:AncientLampAttackSnapshot;field:AncientLampFieldMonster[]}|null{
  if(!game||game.mode!=='tag-classic'||!game.core||!Array.isArray(game.core.players)||
    game.core.players.length!==2||!Array.isArray(game.active)||game.active.length!==2||
    !snapshot||typeof snapshot!=='object'||typeof snapshot.eventId!=='string'||
    !snapshot.eventId.trim()||snapshot.eventId.length>128||
    typeof snapshot.attackerUid!=='string'||typeof snapshot.lampUid!=='string'||
    typeof sourceEffectNegated!=='boolean'||!snapshot.wasFaceDownAtDamageStepStart||
    !isTeam(snapshot.attackerTeam)||!isTeam(snapshot.lampTeam)||snapshot.lampTeam!==1-snapshot.attackerTeam||
    !Number.isSafeInteger(snapshot.turn)||snapshot.turn!==game.core.turn||
    !game.core.pending||typeof game.core.pending!=='object'||
    game.core.pending.kind!=='attack'||game.core.pending.stage!=='damage'||
    game.core.pending.actor!==snapshot.attackerTeam||game.core.pending.card!==snapshot.attackerUid||
    game.core.pending.target!==snapshot.lampUid||game.core.damageStep!==true)return null;
  const attackerSeat=game.active[snapshot.attackerTeam],lampSeat=game.active[snapshot.lampTeam];
  if(!isSeat(attackerSeat)||attackerSeat%2!==snapshot.attackerTeam||
    !isSeat(lampSeat)||lampSeat%2!==snapshot.lampTeam)return null;
  const field=fieldProjection(game,snapshot.lampUid,sourceEffectNegated);
  if(!field)return null;
  const attacker=field.find(card=>card.uid===snapshot.attackerUid&&card.zone==='monster'&&card.faceUp);
  const lamp=field.find(card=>card.uid===snapshot.lampUid&&card.zone==='monster'&&
    card.cardId===ANCIENT_LAMP_CARD_ID&&card.faceUp);
  if(!attacker||!lamp||sourceEffectNegated)return null;
  return {
    field,
    attack:{
      eventId:snapshot.eventId,timing:'before-damage-calculation',
      attackerUid:snapshot.attackerUid,attackerControllerSeat:attackerSeat,
      currentTargetUid:game.core.pending.target,ancientLampUid:snapshot.lampUid,
      ancientLampControllerSeat:lampSeat,wasFaceDownAtDamageStepStart:true
    }
  };
}

export function planTagAncientLampAttackRedirect(
  game:TagDuel,snapshot:AncientLampAttackStartSnapshot,selectedTargetUid:string,sourceEffectNegated:boolean
):AncientLampTagRedirectPlanResult{
  if(!game||game.mode!=='tag-classic')return {allowed:false,reason:'not-tag-classic'};
  if(sourceEffectNegated)return {allowed:false,reason:'lamp-effect-negated'};
  const context=attackSnapshot(game,snapshot,sourceEffectNegated);
  if(!context)return {allowed:false,reason:'invalid-tag-state'};
  const result=planAncientLampAttackRedirect({
    attack:context.attack,selectedTargetUid,field:context.field
  });
  return result.allowed?{allowed:true,plan:{team:snapshot.attackerTeam,primitive:result.plan}}:result;
}

export function resolveTagAncientLampAttackRedirect(
  game:TagDuel,snapshot:AncientLampAttackStartSnapshot,plan:AncientLampTagRedirectPlan,
  sourceEffectNegated:boolean,processedEventIds:readonly string[]=[]
):AncientLampTagRedirectResult{
  if(!game||game.mode!=='tag-classic')return {redirected:false,reason:'not-tag-classic'};
  if(sourceEffectNegated)return {redirected:false,reason:'lamp-effect-negated'};
  if(!plan||!plan.primitive||!isTeam(plan.team)||!snapshot||plan.team!==snapshot.attackerTeam)
    return {redirected:false,reason:'invalid-tag-state'};
  const context=attackSnapshot(game,snapshot,sourceEffectNegated);
  if(!context)return {redirected:false,reason:'invalid-tag-state'};
  const result=resolveAncientLampAttackRedirect({
    plan:plan.primitive,attack:context.attack,field:context.field,processedEventIds
  });
  return result.redirected
    ?{redirected:true,team:plan.team,eventId:result.eventId,attackerUid:result.attackerUid,
      lampUid:plan.primitive.ancientLampUid,targetUid:result.targetUid,
      targetFaceUp:result.targetFaceUp,processedEventIds:result.processedEventIds}
    :result;
}
