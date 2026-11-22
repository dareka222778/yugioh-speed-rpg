import type {DuelState} from './duelEngine';
import {monsterEffectsNegated} from './continuousEffects';

export const EIGHT_CLAWS_SCORPION_ID='14261867';
export type EightClawsNegationCheck=(state:DuelState,sourceUid:string)=>boolean;

export type EightClawsTurnDownPlan=Readonly<{
  effect:'eightClawsTurnDown';
  sourceUid:string;
  team:0|1;
  activeSeat:number;
  turn:number;
  position:'def';
  faceUp:false;
  effectUsedTurn:number;
}>;

export type EightClawsAttackSnapshot=Readonly<{
  sourceUid:string;
  targetUid:string;
  team:0|1;
  activeSeat:number;
  turn:number;
  targetWasFaceDownDefenseAtDeclaration:true;
}>;

export type EightClawsAttackActivation=Readonly<{
  effect:'eightClawsBattle';
  sourceUid:string;
  targetUid:string;
  team:0|1;
  activeSeat:number;
  turn:number;
  targetWasFaceDownDefenseAtDeclaration:true;
}>;

export type EightClawsBattlePlan=Readonly<{
  effect:'eightClawsBattle';
  sourceUid:string;
  targetUid:string;
  team:0|1;
  activeSeat:number;
  turn:number;
  atkMode:'set';
  atkValue:2400;
  duration:'damage-calculation-only';
  targetNeedNotRemainFaceDown:true;
  equipModifiersDoNotChangeSetValue:true;
}>;

function assertTeam(team:number):asserts team is 0|1{
  if(!Number.isInteger(team)||team<0||team>1)throw new Error('Equipe inválida para 8-Claws Scorpion.');
}
function assertActiveRepresentative(state:DuelState,team:number,activeSeat:number):asserts team is 0|1{
  assertTeam(team);
  if(!Number.isInteger(activeSeat)||activeSeat<0||activeSeat>3||activeSeat%2!==team)throw new Error('Assento físico inválido para 8-Claws Scorpion.');
  if(!state.teamRotation||state.teamRotation.active[team]!==activeSeat||state.current!==team)throw new Error('O representante ativo mudou; reabra 8-Claws Scorpion.');
}
function sourceOnTeam(state:DuelState,team:0|1,sourceUid:string){
  const source=state.players[team].monsters.find(monster=>monster.uid===sourceUid);
  if(!source||source.id!==EIGHT_CLAWS_SCORPION_ID||!source.faceUp)throw new Error('8-Claws Scorpion precisa estar face-up no campo da equipe.');
  return source;
}

/** Ignition Effect: the caller must persist effectUsedTurn with the position change. */
export function planEightClawsTurnDown(
  state:DuelState,
  team:0|1,
  activeSeat:number,
  sourceUid:string,
  isNegated:EightClawsNegationCheck=monsterEffectsNegated
):EightClawsTurnDownPlan{
  assertActiveRepresentative(state,team,activeSeat);
  if(state.phase!=='main')throw new Error('8-Claws Scorpion só pode usar a mudança de posição na Main Phase.');
  const source=sourceOnTeam(state,team,sourceUid);
  if(source.effectUsedTurn===state.turn)throw new Error('8-Claws Scorpion já usou este efeito neste turno.');
  if(isNegated(state,sourceUid))throw new Error('O efeito de 8-Claws Scorpion está negado.');
  return Object.freeze({
    effect:'eightClawsTurnDown',sourceUid,team,activeSeat,turn:state.turn,
    position:'def',faceUp:false,effectUsedTurn:state.turn
  });
}

function assertAttackContext(state:DuelState,context:EightClawsAttackSnapshot|EightClawsAttackActivation):void{
  assertActiveRepresentative(state,context.team,context.activeSeat);
  if(state.turn!==context.turn)throw new Error('O turno mudou durante o ataque de 8-Claws Scorpion.');
  const pending=state.pending;
  if(pending.kind!=='attack'||pending.actor!==context.team||pending.card!==context.sourceUid||
     pending.target!==context.targetUid||(pending.stage!=='damage'&&pending.stage!=='calculation')){
    throw new Error('O ataque de 8-Claws Scorpion não corresponde à declaração capturada.');
  }
  if(!state.players[1-context.team].monsters.some(monster=>monster.uid===context.targetUid)){
    throw new Error('O alvo do ataque de 8-Claws Scorpion deixou o campo.');
  }
}

/**
 * The engine reveals a face-down defender while advancing an attack to the
 * response window. The caller must pass the face-down Defense snapshot captured
 * before that reveal; current face-up state is deliberately not used as a proxy.
 */
export function prepareEightClawsBattleEffect(
  state:DuelState,
  snapshot:EightClawsAttackSnapshot,
  isNegated:EightClawsNegationCheck=monsterEffectsNegated
):EightClawsAttackActivation|undefined{
  if(!snapshot?.targetWasFaceDownDefenseAtDeclaration)return undefined;
  assertAttackContext(state,snapshot);
  sourceOnTeam(state,snapshot.team,snapshot.sourceUid);
  if(isNegated(state,snapshot.sourceUid))return undefined;
  return Object.freeze({
    effect:'eightClawsBattle',
    sourceUid:snapshot.sourceUid,targetUid:snapshot.targetUid,
    team:snapshot.team,activeSeat:snapshot.activeSeat,turn:snapshot.turn,
    targetWasFaceDownDefenseAtDeclaration:true
  });
}

/** Resolves to a temporary set-value, not an additive +2100 modifier. */
export function resolveEightClawsBattleEffect(
  state:DuelState,
  activation:EightClawsAttackActivation,
  isNegated:EightClawsNegationCheck=monsterEffectsNegated
):EightClawsBattlePlan|undefined{
  if(!activation||activation.effect!=='eightClawsBattle'||activation.targetWasFaceDownDefenseAtDeclaration!==true)throw new Error('Ativação de batalha de 8-Claws Scorpion inválida.');
  assertAttackContext(state,activation);
  sourceOnTeam(state,activation.team,activation.sourceUid);
  if(isNegated(state,activation.sourceUid))return undefined;
  return Object.freeze({
    effect:'eightClawsBattle',
    sourceUid:activation.sourceUid,targetUid:activation.targetUid,
    team:activation.team,activeSeat:activation.activeSeat,turn:activation.turn,
    atkMode:'set',atkValue:2400,duration:'damage-calculation-only',
    targetNeedNotRemainFaceDown:true,equipModifiersDoNotChangeSetValue:true
  });
}
