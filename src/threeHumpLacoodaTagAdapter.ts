import type {DuelState} from './duelEngine';
import {monsterEffectsNegated} from './continuousEffects';

export const THREE_HUMP_LACOODA_ID = '86988864';
export type ThreeHumpNegationCheck = (state:DuelState,sourceUid:string)=>boolean;

export type ThreeHumpActivation = Readonly<{
  sourceUid:string;
  team:0|1;
  activeSeat:number;
  turn:number;
  candidateUids:readonly string[];
}>;

export type ThreeHumpResolutionPlan = Readonly<{
  effect:'threeHumpLacooda';
  sourceUid:string;
  team:0|1;
  activeSeat:number;
  turn:number;
  tributeUids:readonly [string,string];
  costTiming:'activation';
  graveyard:'shared-team-graveyard';
  drawSeat:number;
  drawCount:3;
  drawVisibility:'active-seat-only';
  keepPrivateFromPartner:true;
  shuffleDeck:false;
}>;

function assertTeam(team:number):asserts team is 0|1{
  if(!Number.isInteger(team)||team<0||team>1)throw new Error('Equipe inválida para 3-Hump Lacooda.');
}
function assertActiveRepresentative(state:DuelState,team:number,activeSeat:number):asserts team is 0|1{
  assertTeam(team);
  if(!Number.isInteger(activeSeat)||activeSeat<0||activeSeat>3||activeSeat%2!==team)throw new Error('Assento físico inválido para 3-Hump Lacooda.');
  if(!state.teamRotation||state.teamRotation.active[team]!==activeSeat||state.current!==team)throw new Error('O representante ativo mudou; reabra 3-Hump Lacooda.');
}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('Carta do Deck sem proprietário físico válido.');
  return Number(match[1]);
}
function faceUpCopies(state:DuelState,team:0|1):string[]{
  return state.players[team].monsters.filter(monster=>monster.id===THREE_HUMP_LACOODA_ID&&monster.faceUp).map(monster=>monster.uid);
}
function assertActiveDeckOwnership(state:DuelState,team:0|1,activeSeat:number):void{
  for(const card of state.players[team].deck){
    if(physicalSeat(card.uid)!==activeSeat)throw new Error('O Deck usado por 3-Hump Lacooda não pertence ao representante ativo.');
  }
}

/**
 * Captures the Ignition Effect condition before the activation cost is paid.
 * Team control is shared, but the draw always belongs to the active physical
 * representative. At least three face-up copies are required; the source may
 * itself be one of the two copies Tributed as cost.
 */
export function prepareThreeHumpLacooda(
  state:DuelState,
  team:0|1,
  activeSeat:number,
  sourceUid:string,
  isNegated:ThreeHumpNegationCheck=monsterEffectsNegated
):ThreeHumpActivation{
  assertActiveRepresentative(state,team,activeSeat);
  const source=state.players[team].monsters.find(monster=>monster.uid===sourceUid);
  if(!source||source.id!==THREE_HUMP_LACOODA_ID||!source.faceUp)throw new Error('3-Hump Lacooda precisa estar face-up no campo da equipe.');
  if(isNegated(state,sourceUid))throw new Error('O efeito de 3-Hump Lacooda está negado.');
  const candidates=faceUpCopies(state,team);
  if(candidates.length<3)throw new Error('3-Hump Lacooda exige pelo menos três cópias face-up na equipe.');
  return Object.freeze({
    sourceUid,team,activeSeat,turn:state.turn,
    candidateUids:Object.freeze([...candidates])
  });
}

function assertActivationCurrent(state:DuelState,activation:ThreeHumpActivation):void{
  if(!activation||!Number.isSafeInteger(activation.turn)||activation.turn<1||
     !Array.isArray(activation.candidateUids)||activation.candidateUids.length<3||
     new Set(activation.candidateUids).size!==activation.candidateUids.length||
     !activation.candidateUids.includes(activation.sourceUid))throw new Error('Ativação de 3-Hump Lacooda inválida.');
  assertActiveRepresentative(state,activation.team,activation.activeSeat);
  if(state.turn!==activation.turn)throw new Error('O turno mudou antes da resolução de 3-Hump Lacooda.');
}

/**
 * Builds the immutable operation plan. The two Tributes are an activation cost;
 * therefore resolution does not re-check whether those monsters remain on the
 * field (the source itself may have been Tributed). The central resolver must
 * apply both the cost and the three draws atomically.
 */
export function resolveThreeHumpLacooda(
  state:DuelState,
  activation:ThreeHumpActivation,
  tributeUids:readonly string[]
):ThreeHumpResolutionPlan{
  assertActivationCurrent(state,activation);
  if(!Array.isArray(tributeUids)||tributeUids.length!==2||
     new Set(tributeUids).size!==2||
     tributeUids.some(uid=>!activation.candidateUids.includes(uid)))throw new Error('Escolha exatamente duas 3-Hump Lacooda face-up para oferecer como Tributo.');
  assertActiveDeckOwnership(state,activation.team,activation.activeSeat);
  return Object.freeze({
    effect:'threeHumpLacooda',
    sourceUid:activation.sourceUid,
    team:activation.team,
    activeSeat:activation.activeSeat,
    turn:activation.turn,
    tributeUids:Object.freeze([tributeUids[0],tributeUids[1]]) as readonly [string,string],
    costTiming:'activation',
    graveyard:'shared-team-graveyard',
    drawSeat:activation.activeSeat,
    drawCount:3,
    drawVisibility:'active-seat-only',
    keepPrivateFromPartner:true,
    shuffleDeck:false
  });
}
