export const DELAYED_BATTLE_DESTRUCTION_CARD_IDS = Object.freeze([
  '86100785',
  '85255550',
  '13599884'
] as const);

export type DelayedBattleDestructionCardId =
  typeof DELAYED_BATTLE_DESTRUCTION_CARD_IDS[number];
export type DelayedBattleTeam = 0 | 1;
export type DelayedBattleSeat = 0 | 1 | 2 | 3;
export type DelayedBattleZone =
  | 'monster'
  | 'spell-trap'
  | 'field'
  | 'hand'
  | 'deck'
  | 'grave'
  | 'banished'
  | 'extra';
export type DelayedBattleTriggerRole = 'attacker' | 'defender';
export type DelayedBattleTurnCountMode = 'all-turns-fifth' | 'opponent-turn-third';

type CardRule = Readonly<{
  triggerRole: DelayedBattleTriggerRole;
  turnCountMode: DelayedBattleTurnCountMode;
  requiresNonMachineTarget: boolean;
}>;

const CARD_RULES: Readonly<Record<DelayedBattleDestructionCardId, CardRule>> = Object.freeze({
  '86100785': Object.freeze({
    triggerRole: 'attacker',
    turnCountMode: 'all-turns-fifth',
    requiresNonMachineTarget: false
  }),
  '85255550': Object.freeze({
    triggerRole: 'attacker',
    turnCountMode: 'all-turns-fifth',
    requiresNonMachineTarget: false
  }),
  '13599884': Object.freeze({
    triggerRole: 'defender',
    turnCountMode: 'opponent-turn-third',
    requiresNonMachineTarget: true
  })
});

export type DelayedBattleDestructionEvent = Readonly<{
  eventId: string;
  sourceCardId: DelayedBattleDestructionCardId;
  sourceUid: string;
  sourceTeam: DelayedBattleTeam;
  triggerRole: DelayedBattleTriggerRole;
  turnCountMode: DelayedBattleTurnCountMode;
  targetUid: string;
  targetEpoch: number;
  targetPhysicalOwnerSeat: DelayedBattleSeat;
  targetPhysicalOwnerTeam: DelayedBattleTeam;
  targetControllerTeamAtAttack: DelayedBattleTeam;
  attackTurn: number;
  dueTurn: number;
}>;

export type ScheduleDelayedBattleDestructionInput = Readonly<{
  eventId: string;
  sourceCardId: string;
  sourceUid: string;
  sourceTeam: DelayedBattleTeam;
  targetUid: string;
  targetEpoch: number;
  targetPhysicalOwnerSeat: DelayedBattleSeat;
  targetControllerSeat: DelayedBattleSeat;
  targetRace?: string;
  attackTurn: number;
  phase: string;
  targetWasMonsterAtAttack: boolean;
  sourceEffectWasFaceUp: boolean;
  sourceDestroyedByBattle?: boolean;
  effectNegated?: boolean;
}>;

export type ScheduleDelayedBattleDestructionResult =
  | Readonly<{ ok: true; event: DelayedBattleDestructionEvent }>
  | Readonly<{
      ok: false;
      reason:
        | 'unsupported-source'
        | 'invalid-context'
        | 'wrong-window'
        | 'target-not-opponent-monster'
        | 'duplicate-event'
        | 'effect-negated'
        | 'source-not-face-up'
        | 'steel-scorpion-requires-non-machine-target';
    }>;

export type DelayedBattleTargetSnapshot = Readonly<{
  uid: string;
  epoch: number;
  physicalOwnerSeat: DelayedBattleSeat;
  controllerSeat: DelayedBattleSeat;
  zone: DelayedBattleZone;
  faceUp: boolean;
}>;

export type ResolveDelayedBattleDestructionResult =
  | Readonly<{ status: 'waiting' }>
  | Readonly<{ status: 'expired'; eventId: string }>
  | Readonly<{
      status: 'skipped';
      eventId: string;
      reason: 'target-left-monster-zone' | 'target-instance-changed' | 'physical-owner-changed';
    }>
  | Readonly<{
      status: 'destroy';
      eventId: string;
      targetUid: string;
      graveyardTeam: DelayedBattleTeam;
      chainBlockCreated: false;
    }>
  | Readonly<{ status: 'invalid-event'; eventId?: string }>;

function isSeat(value: unknown): value is DelayedBattleSeat {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function isTeam(value: unknown): value is DelayedBattleTeam {
  return value === 0 || value === 1;
}

function teamOfSeat(seat: DelayedBattleSeat): DelayedBattleTeam {
  return (seat % 2) as DelayedBattleTeam;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\u0000-\u001f]/.test(value);
}

function isSupportedCard(value: string): value is DelayedBattleDestructionCardId {
  return (DELAYED_BATTLE_DESTRUCTION_CARD_IDS as readonly string[]).includes(value);
}

function validEvent(event: DelayedBattleDestructionEvent): boolean {
  if (!event || !isSupportedCard(event.sourceCardId)) return false;
  const rule = CARD_RULES[event.sourceCardId];
  return validId(event.eventId) &&
    validId(event.sourceUid) &&
    isTeam(event.sourceTeam) &&
    event.triggerRole === rule.triggerRole &&
    event.turnCountMode === rule.turnCountMode &&
    validId(event.targetUid) &&
    Number.isSafeInteger(event.targetEpoch) &&
    event.targetEpoch >= 0 &&
    isSeat(event.targetPhysicalOwnerSeat) &&
    event.targetPhysicalOwnerTeam === teamOfSeat(event.targetPhysicalOwnerSeat) &&
    isTeam(event.targetControllerTeamAtAttack) &&
    event.targetControllerTeamAtAttack !== event.sourceTeam &&
    Number.isSafeInteger(event.attackTurn) &&
    event.attackTurn >= 1 &&
    Number.isSafeInteger(event.dueTurn) &&
    event.dueTurn === event.attackTurn + 4;
}

/**
 * Schedule a non-targeting delayed battle destruction after damage calculation.
 * Zone Eater/Swordsman count the attack turn as turn 1 and count all turns.
 * Steel Scorpion counts the attack turn as the opponent's first turn and waits
 * for the opponent's third turn. With alternating team turns, both windows
 * map to the global turn index attackTurn + 4.
 *
 * The source may already have been destroyed by battle; its trigger still
 * resolves if the effect was available and not negated.
 */
export function scheduleDelayedBattleDestruction(
  input: ScheduleDelayedBattleDestructionInput,
  existingEvents: readonly DelayedBattleDestructionEvent[] = []
): ScheduleDelayedBattleDestructionResult {
  if (!isSupportedCard(input.sourceCardId)) return { ok: false, reason: 'unsupported-source' };
  if (!validId(input.eventId) ||
      !validId(input.sourceUid) ||
      !isTeam(input.sourceTeam) ||
      !validId(input.targetUid) ||
      !Number.isSafeInteger(input.targetEpoch) ||
      input.targetEpoch < 0 ||
      !isSeat(input.targetPhysicalOwnerSeat) ||
      !isSeat(input.targetControllerSeat) ||
      !Number.isSafeInteger(input.attackTurn) ||
      input.attackTurn < 1 ||
      !Array.isArray(existingEvents) ||
      input.targetWasMonsterAtAttack !== true ||
      typeof input.sourceEffectWasFaceUp !== 'boolean' ||
      (input.sourceDestroyedByBattle !== undefined && typeof input.sourceDestroyedByBattle !== 'boolean') ||
      (input.effectNegated !== undefined && typeof input.effectNegated !== 'boolean') ||
      (input.targetRace !== undefined && typeof input.targetRace !== 'string')) {
    return { ok: false, reason: 'invalid-context' };
  }
  if (input.effectNegated === true) return { ok: false, reason: 'effect-negated' };
  if (!input.sourceEffectWasFaceUp) return { ok: false, reason: 'source-not-face-up' };
  if (input.phase !== 'damage-calculation-complete') {
    return { ok: false, reason: 'wrong-window' };
  }

  const rule = CARD_RULES[input.sourceCardId];
  if (rule.requiresNonMachineTarget) {
    if (!input.targetRace || input.targetRace.trim().length === 0) {
      return { ok: false, reason: 'invalid-context' };
    }
    if (input.targetRace.trim().toLowerCase() === 'machine') {
      return { ok: false, reason: 'steel-scorpion-requires-non-machine-target' };
    }
  }

  const targetControllerTeamAtAttack = teamOfSeat(input.targetControllerSeat);
  if (targetControllerTeamAtAttack === input.sourceTeam) {
    return { ok: false, reason: 'target-not-opponent-monster' };
  }
  if (existingEvents.some(event => event?.eventId === input.eventId)) {
    return { ok: false, reason: 'duplicate-event' };
  }

  const dueTurn = input.attackTurn + 4;
  if (!Number.isSafeInteger(dueTurn)) return { ok: false, reason: 'invalid-context' };

  const event: DelayedBattleDestructionEvent = Object.freeze({
    eventId: input.eventId,
    sourceCardId: input.sourceCardId,
    sourceUid: input.sourceUid,
    sourceTeam: input.sourceTeam,
    triggerRole: rule.triggerRole,
    turnCountMode: rule.turnCountMode,
    targetUid: input.targetUid,
    targetEpoch: input.targetEpoch,
    targetPhysicalOwnerSeat: input.targetPhysicalOwnerSeat,
    targetPhysicalOwnerTeam: teamOfSeat(input.targetPhysicalOwnerSeat),
    targetControllerTeamAtAttack,
    attackTurn: input.attackTurn,
    dueTurn
  });
  return { ok: true, event };
}

/**
 * Resolve the delayed destruction at the scheduled End Phase.
 * The target is tracked by physical UID + epoch, not by its former zone or
 * controller. A card that left and re-entered the field is a new instance.
 * The destruction does not create a chain block and routes to the physical
 * owner's team Graveyard.
 */
export function resolveDelayedBattleDestruction(
  event: DelayedBattleDestructionEvent,
  currentTurn: number,
  phase: string,
  currentTarget: DelayedBattleTargetSnapshot | null | undefined
): ResolveDelayedBattleDestructionResult {
  if (!validEvent(event) || !Number.isSafeInteger(currentTurn) || currentTurn < 1) {
    return { status: 'invalid-event', eventId: event?.eventId };
  }
  if (currentTurn > event.dueTurn) return { status: 'expired', eventId: event.eventId };
  if (currentTurn < event.dueTurn || phase !== 'end') return { status: 'waiting' };

  if (!currentTarget || currentTarget.zone !== 'monster') {
    return { status: 'skipped', eventId: event.eventId, reason: 'target-left-monster-zone' };
  }
  if (!validId(currentTarget.uid) ||
      !Number.isSafeInteger(currentTarget.epoch) ||
      currentTarget.epoch < 0 ||
      currentTarget.uid !== event.targetUid ||
      currentTarget.epoch !== event.targetEpoch) {
    return { status: 'skipped', eventId: event.eventId, reason: 'target-instance-changed' };
  }
  if (!isSeat(currentTarget.physicalOwnerSeat) ||
      !isSeat(currentTarget.controllerSeat)) {
    return { status: 'invalid-event', eventId: event.eventId };
  }
  if (currentTarget.physicalOwnerSeat !== event.targetPhysicalOwnerSeat) {
    return { status: 'skipped', eventId: event.eventId, reason: 'physical-owner-changed' };
  }

  return {
    status: 'destroy',
    eventId: event.eventId,
    targetUid: event.targetUid,
    graveyardTeam: event.targetPhysicalOwnerTeam,
    chainBlockCreated: false
  };
}
