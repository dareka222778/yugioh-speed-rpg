import type {DuelState} from './duelEngine';
import {cardActivationAllowed, continuousTrapsNegated} from './continuousEffects';

export const A_FEINT_PLAN_ID = '68170903';
export type AFeintTrapNegationCheck = (state: DuelState) => boolean;

export type AFeintPlanLock = Readonly<{
  effect: 'aFeintPlan';
  sourceUid: string;
  sourceOwnerSeat: number;
  controllerTeam: 0 | 1;
  turn: number;
  scope: 'all-monsters';
  blockedTarget: 'face-down';
  expiresAt: 'endOfTurn';
  exemptAttackUid: string | null;
  exemptTargetUid: string | null;
}>;

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('A Feint Plan sem proprietário físico válido.');
  return Number(match[1]);
}

function targetMonster(state: DuelState, uid: string | undefined) {
  if (!uid) return undefined;
  for (let team = 0; team < 2; team++) {
    const monster = state.players[team].monsters.find(candidate => candidate.uid === uid);
    if (monster) return monster;
  }
  return undefined;
}

/**
 * Captures a turn-scoped global prohibition. If the Trap is chained to an
 * already-declared attack against a face-down monster, that exact declaration
 * is allowed to finish; subsequent declarations are checked against the lock.
 */
export function prepareAFeintPlan(
  state: DuelState,
  sourceUid: string,
  isTrapNegated: AFeintTrapNegationCheck = continuousTrapsNegated
): AFeintPlanLock {
  if (!Number.isSafeInteger(state.turn) || state.turn < 1 || state.phase === 'finished' || state.damageStep) {
    throw new Error('A Feint Plan não pode ser ativado neste estado/Etapa de Dano.');
  }
  if (state.pending.kind === 'attack' && state.pending.stage !== 'declare') {
    throw new Error('A Feint Plan não pode ser ativado após a declaração de ataque.');
  }

  const matches = state.players.flatMap((player, team) =>
    player.backrow.filter(card => card.uid === sourceUid).map(card => ({card, team: team as 0 | 1}))
  );
  if (matches.length !== 1) throw new Error('A Feint Plan precisa estar em uma única Zona de Magias/Armadilhas.');
  const {card: source, team: controllerTeam} = matches[0];
  if (source.id !== A_FEINT_PLAN_ID || !source.faceUp || source.resolved || source.setTurn >= state.turn) {
    throw new Error('A Feint Plan precisa ser uma Armadilha Setada em turno anterior e ativada face-up.');
  }
  const sourceOwnerSeat = physicalSeat(source.uid);
  if (sourceOwnerSeat % 2 !== controllerTeam) throw new Error('A Armadilha não pertence fisicamente à equipe controladora (proprietário físico incompatível).');
  if (!cardActivationAllowed(state, controllerTeam, 'trap') || isTrapNegated(state)) {
    throw new Error('A ativação ou o efeito de Armadilhas está bloqueado/negado.');
  }

  let exemptAttackUid: string | null = null;
  let exemptTargetUid: string | null = null;
  if (state.pending.kind === 'attack' && state.pending.stage === 'declare' && state.pending.target) {
    const declaredTarget = targetMonster(state, state.pending.target);
    if (declaredTarget && !declaredTarget.faceUp) {
      exemptAttackUid = state.pending.card;
      exemptTargetUid = state.pending.target;
    }
  }

  return Object.freeze({
    effect: 'aFeintPlan',
    sourceUid,
    sourceOwnerSeat,
    controllerTeam,
    turn: state.turn,
    scope: 'all-monsters',
    blockedTarget: 'face-down',
    expiresAt: 'endOfTurn',
    exemptAttackUid,
    exemptTargetUid
  });
}

/** True only for a face-down target while this turn's lock is still active. */
export function aFeintPlanBlocksAttack(
  lock: AFeintPlanLock,
  state: DuelState,
  attackerUid: string,
  targetUid: string | undefined
): boolean {
  if (!lock || lock.effect !== 'aFeintPlan' || !Number.isSafeInteger(lock.turn) || state.turn !== lock.turn || !targetUid) {
    return false;
  }
  if (lock.exemptAttackUid === attackerUid && lock.exemptTargetUid === targetUid) return false;
  const target = targetMonster(state, targetUid);
  return target !== undefined && target.faceUp === false;
}
