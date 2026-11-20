export const BERSERK_GORILLA_ID = '39168895' as const;
export const DARK_ZEBRA_ID = '59784896' as const;

export type PositionRuleSeat = 0 | 1 | 2 | 3;
export type PositionRuleTeam = 0 | 1;
export type MonsterPosition = 'attack' | 'defense';

type PositionRuleFailure =
  | 'wrong-card'
  | 'invalid-context'
  | 'not-standby-phase'
  | 'not-face-up'
  | 'effect-negated';

export type DarkZebraStandbyInput = Readonly<{
  cardId: string;
  uid: string;
  controllerSeat: PositionRuleSeat;
  turn: number;
  phase: string;
  faceUp: boolean;
  position: MonsterPosition;
  teamControlledCardCount: number;
  effectNegated?: boolean;
}>;

export type DarkZebraStandbyResult =
  | Readonly<{
      ok: true;
      action: 'set-defense';
      team: PositionRuleTeam;
      uid: string;
      changed: boolean;
      position: 'defense';
      positionChangeLockedForTurn: number;
      countsPartnerControlledCards: true;
    }>
  | Readonly<{
      ok: true;
      action: 'no-change';
      reason: 'another-team-card-is-controlled';
      team: PositionRuleTeam;
      uid: string;
    }>
  | Readonly<{ ok: false; reason: PositionRuleFailure }>;

export type BerserkGorillaInput = Readonly<{
  cardId: string;
  uid: string;
  faceUp: boolean;
  position: MonsterPosition;
  canAttack: boolean;
  effectNegated?: boolean;
}>;

export type BerserkGorillaResult =
  | Readonly<{
      ok: true;
      action: 'destroy-self';
      uid: string;
      timing: 'state-check';
      chainLinkCreated: false;
    }>
  | Readonly<{
      ok: true;
      action: 'must-attack';
      uid: string;
      requiredBefore: 'battle-phase-end';
      targetSelection: 'player-choice';
    }>
  | Readonly<{
      ok: true;
      action: 'no-forced-attack';
      uid: string;
      reason: 'cannot-legally-attack';
    }>
  | Readonly<{
      ok: true;
      action: 'no-effect';
      uid: string;
      reason: 'face-down' | 'effect-negated';
    }>
  | Readonly<{ ok: false; reason: PositionRuleFailure }>;

function isSeat(value: unknown): value is PositionRuleSeat {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function teamOfSeat(seat: PositionRuleSeat): PositionRuleTeam {
  return (seat % 2) as PositionRuleTeam;
}

function validUid(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\u0000-\u001f]/.test(value);
}

/**
 * Dark Zebra checks the entire team-controlled field, not only Monster Zones.
 * In this project the shared field is 3 Monster + 3 Spell/Trap + 1 Field Zone.
 * The Standby Phase position lock is keyed by physical UID and current turn.
 */
export function planDarkZebraStandbyPosition(
  input: DarkZebraStandbyInput
): DarkZebraStandbyResult {
  if (input.cardId !== DARK_ZEBRA_ID) return { ok: false, reason: 'wrong-card' };
  if (!validUid(input.uid) ||
      !isSeat(input.controllerSeat) ||
      !Number.isSafeInteger(input.turn) ||
      input.turn < 1 ||
      typeof input.phase !== 'string' ||
      typeof input.faceUp !== 'boolean' ||
      (input.position !== 'attack' && input.position !== 'defense') ||
      !Number.isInteger(input.teamControlledCardCount) ||
      input.teamControlledCardCount < 1 ||
      input.teamControlledCardCount > 7 ||
      (input.effectNegated !== undefined && typeof input.effectNegated !== 'boolean')) {
    return { ok: false, reason: 'invalid-context' };
  }
  if (input.phase !== 'standby') return { ok: false, reason: 'not-standby-phase' };
  if (!input.faceUp) return { ok: false, reason: 'not-face-up' };
  if (input.effectNegated === true) return { ok: false, reason: 'effect-negated' };

  const team = teamOfSeat(input.controllerSeat);
  if (input.teamControlledCardCount > 1) {
    return {
      ok: true,
      action: 'no-change',
      reason: 'another-team-card-is-controlled',
      team,
      uid: input.uid
    };
  }

  return {
    ok: true,
    action: 'set-defense',
    team,
    uid: input.uid,
    changed: input.position !== 'defense',
    position: 'defense',
    positionChangeLockedForTurn: input.turn,
    countsPartnerControlledCards: true
  };
}

/**
 * Berserk Gorilla's face-up Defense self-destruction is a state check, not a
 * chain link. In Attack Position it must declare an attack if the engine says
 * at least one legal attack is available; this helper never chooses a target.
 */
export function planBerserkGorillaRule(
  input: BerserkGorillaInput
): BerserkGorillaResult {
  if (input.cardId !== BERSERK_GORILLA_ID) return { ok: false, reason: 'wrong-card' };
  if (!validUid(input.uid) ||
      typeof input.faceUp !== 'boolean' ||
      (input.position !== 'attack' && input.position !== 'defense') ||
      typeof input.canAttack !== 'boolean' ||
      (input.effectNegated !== undefined && typeof input.effectNegated !== 'boolean')) {
    return { ok: false, reason: 'invalid-context' };
  }
  if (input.effectNegated === true) {
    return { ok: true, action: 'no-effect', uid: input.uid, reason: 'effect-negated' };
  }
  if (!input.faceUp) {
    return { ok: true, action: 'no-effect', uid: input.uid, reason: 'face-down' };
  }
  if (input.position === 'defense') {
    return {
      ok: true,
      action: 'destroy-self',
      uid: input.uid,
      timing: 'state-check',
      chainLinkCreated: false
    };
  }
  if (!input.canAttack) {
    return {
      ok: true,
      action: 'no-forced-attack',
      uid: input.uid,
      reason: 'cannot-legally-attack'
    };
  }
  return {
    ok: true,
    action: 'must-attack',
    uid: input.uid,
    requiredBefore: 'battle-phase-end',
    targetSelection: 'player-choice'
  };
}
