export const BATTLE_DESTROYED_SWARM_CARD_IDS = Object.freeze([
  '22567609',
  '95178994'
] as const);

export type BattleDestroyedSwarmCardId =
  typeof BATTLE_DESTROYED_SWARM_CARD_IDS[number];
export type BattleDestroyedSwarmSeat = 0 | 1 | 2 | 3;
export type BattleDestroyedSwarmTeam = 0 | 1;
export type BattleDestroyedSwarmPosition = 'face-down-defense' | 'face-up-attack';

type CardRule = Readonly<{
  lifePointKind: 'gain' | 'damage';
  lifePointAmount: 1000 | 500;
  lifePointTeam: 'controller' | 'opponent';
  summonPosition: BattleDestroyedSwarmPosition;
}>;

const CARD_RULES: Readonly<Record<BattleDestroyedSwarmCardId, CardRule>> = Object.freeze({
  '22567609': Object.freeze({
    lifePointKind: 'gain',
    lifePointAmount: 1000,
    lifePointTeam: 'controller',
    summonPosition: 'face-down-defense'
  }),
  '95178994': Object.freeze({
    lifePointKind: 'damage',
    lifePointAmount: 500,
    lifePointTeam: 'opponent',
    summonPosition: 'face-up-attack'
  })
});

export type BattleDestroyedSwarmTriggerEvent = Readonly<{
  eventId: string;
  cardId: BattleDestroyedSwarmCardId;
  sourceUid: string;
  sourceGraveEpoch: number;
  sourcePhysicalOwnerSeat: BattleDestroyedSwarmSeat;
  controllerSeatAtDestruction: BattleDestroyedSwarmSeat;
  controllerTeam: BattleDestroyedSwarmTeam;
  opponentTeam: BattleDestroyedSwarmTeam;
  triggerLocation: 'grave';
  triggerWindow: 'damage-step-end';
  mandatoryTrigger: true;
  targets: false;
  chainLinkRequired: true;
}>;

export type ScheduleBattleDestroyedSwarmInput = Readonly<{
  eventId: string;
  cardId: string;
  sourceUid: string;
  sourceGraveEpoch: number;
  sourcePhysicalOwnerSeat: BattleDestroyedSwarmSeat;
  controllerSeatAtDestruction: BattleDestroyedSwarmSeat;
  destroyedByBattle: boolean;
  sentToGraveyard: boolean;
  phase: string;
  turn: number;
  effectNegated?: boolean;
}>;

export type ScheduleBattleDestroyedSwarmResult =
  | Readonly<{ ok: true; event: BattleDestroyedSwarmTriggerEvent }>
  | Readonly<{
      ok: false;
      reason:
        | 'wrong-card'
        | 'invalid-context'
        | 'not-battle-destroyed-to-graveyard'
        | 'wrong-window'
        | 'effect-negated'
        | 'duplicate-event';
    }>;

export type BattleDestroyedSwarmDeckCandidate = Readonly<{
  uid: string;
  cardId: BattleDestroyedSwarmCardId;
  physicalOwnerSeat: BattleDestroyedSwarmSeat;
  zone: 'deck';
}>;

export type ResolveBattleDestroyedSwarmResult =
  | Readonly<{
      status: 'resolved';
      eventId: string;
      lifePointChange: Readonly<{
        kind: 'gain' | 'damage';
        amount: 1000 | 500;
        team: BattleDestroyedSwarmTeam;
      }>;
      resolutionSteps: readonly ['life-point-change', 'optional-special-summon'];
      summonChoiceOptional: true;
      maxSummons: number;
      summonPosition: BattleDestroyedSwarmPosition;
      summons: readonly Readonly<{
        uid: string;
        cardId: BattleDestroyedSwarmCardId;
        physicalOwnerSeat: BattleDestroyedSwarmSeat;
        controllerSeat: BattleDestroyedSwarmSeat;
        team: BattleDestroyedSwarmTeam;
        zone: 'monster';
        position: BattleDestroyedSwarmPosition;
      }>[];
    }>
  | Readonly<{ status: 'negated'; eventId: string }>
  | Readonly<{
      status: 'invalid-selection';
      eventId: string;
      reason: 'invalid-context' | 'duplicate-selection' | 'not-in-controller-deck' | 'zone-capacity-or-deck-limit';
    }>
  | Readonly<{ status: 'invalid-event'; eventId?: string }>;

function isSeat(value: unknown): value is BattleDestroyedSwarmSeat {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function isTeam(value: unknown): value is BattleDestroyedSwarmTeam {
  return value === 0 || value === 1;
}

function teamOfSeat(seat: BattleDestroyedSwarmSeat): BattleDestroyedSwarmTeam {
  return (seat % 2) as BattleDestroyedSwarmTeam;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\u0000-\u001f]/.test(value);
}

function isSupportedCard(value: string): value is BattleDestroyedSwarmCardId {
  return (BATTLE_DESTROYED_SWARM_CARD_IDS as readonly string[]).includes(value);
}

function validEvent(event: BattleDestroyedSwarmTriggerEvent): boolean {
  if (!event || !isSupportedCard(event.cardId)) return false;
  return validId(event.eventId) &&
    validId(event.sourceUid) &&
    Number.isSafeInteger(event.sourceGraveEpoch) &&
    event.sourceGraveEpoch >= 0 &&
    isSeat(event.sourcePhysicalOwnerSeat) &&
    isSeat(event.controllerSeatAtDestruction) &&
    event.controllerTeam === teamOfSeat(event.controllerSeatAtDestruction) &&
    event.opponentTeam === (event.controllerTeam === 0 ? 1 : 0) &&
    event.triggerLocation === 'grave' &&
    event.triggerWindow === 'damage-step-end' &&
    event.mandatoryTrigger === true &&
    event.targets === false &&
    event.chainLinkRequired === true;
}

/**
 * Capture the mandatory Graveyard trigger only when the card was destroyed
 * by battle and actually sent there. The effect controller at destruction
 * determines the LP team and the Deck used for its optional swarm summons;
 * the source card's physical owner is preserved independently.
 */
export function scheduleBattleDestroyedSwarmEffect(
  input: ScheduleBattleDestroyedSwarmInput,
  existingEvents: readonly BattleDestroyedSwarmTriggerEvent[] = []
): ScheduleBattleDestroyedSwarmResult {
  if (!isSupportedCard(input.cardId)) return { ok: false, reason: 'wrong-card' };
  if (!validId(input.eventId) ||
      !validId(input.sourceUid) ||
      !isSeat(input.sourcePhysicalOwnerSeat) ||
      !isSeat(input.controllerSeatAtDestruction) ||
      !Number.isSafeInteger(input.sourceGraveEpoch) ||
      input.sourceGraveEpoch < 0 ||
      !Number.isSafeInteger(input.turn) ||
      input.turn < 1 ||
      typeof input.destroyedByBattle !== 'boolean' ||
      typeof input.sentToGraveyard !== 'boolean' ||
      typeof input.phase !== 'string' ||
      (input.effectNegated !== undefined && typeof input.effectNegated !== 'boolean') ||
      !Array.isArray(existingEvents)) {
    return { ok: false, reason: 'invalid-context' };
  }
  if (!input.destroyedByBattle || !input.sentToGraveyard) {
    return { ok: false, reason: 'not-battle-destroyed-to-graveyard' };
  }
  if (input.phase !== 'damage-step-end') return { ok: false, reason: 'wrong-window' };
  if (input.effectNegated === true) return { ok: false, reason: 'effect-negated' };
  if (existingEvents.some(event =>
    event?.eventId === input.eventId ||
    (event?.sourceUid === input.sourceUid && event?.sourceGraveEpoch === input.sourceGraveEpoch)
  )) {
    return { ok: false, reason: 'duplicate-event' };
  }

  const controllerTeam = teamOfSeat(input.controllerSeatAtDestruction);
  const opponentTeam = (controllerTeam === 0 ? 1 : 0) as BattleDestroyedSwarmTeam;
  const event: BattleDestroyedSwarmTriggerEvent = Object.freeze({
    eventId: input.eventId,
    cardId: input.cardId,
    sourceUid: input.sourceUid,
    sourceGraveEpoch: input.sourceGraveEpoch,
    sourcePhysicalOwnerSeat: input.sourcePhysicalOwnerSeat,
    controllerSeatAtDestruction: input.controllerSeatAtDestruction,
    controllerTeam,
    opponentTeam,
    triggerLocation: 'grave',
    triggerWindow: 'damage-step-end',
    mandatoryTrigger: true,
    targets: false,
    chainLinkRequired: true
  });
  return { ok: true, event };
}

/**
 * Resolve the mandatory LP operation first, then validate the player's
 * optional Deck summons. availableMonsterZones is the remaining capacity
 * in the controller team's shared three Monster Zones.
 */
export function resolveBattleDestroyedSwarmEffect(
  event: BattleDestroyedSwarmTriggerEvent,
  deckCandidates: readonly BattleDestroyedSwarmDeckCandidate[],
  availableMonsterZones: number,
  selectedUids: readonly string[],
  effectNegated = false
): ResolveBattleDestroyedSwarmResult {
  if (!validEvent(event) ||
      !Number.isInteger(availableMonsterZones) ||
      availableMonsterZones < 0 ||
      availableMonsterZones > 3 ||
      !Array.isArray(deckCandidates) ||
      !Array.isArray(selectedUids) ||
      typeof effectNegated !== 'boolean') {
    return { status: 'invalid-event', eventId: event?.eventId };
  }
  if (effectNegated) return { status: 'negated', eventId: event.eventId };

  const rule = CARD_RULES[event.cardId];
  const candidateIds = new Set<string>();
  for (const candidate of deckCandidates) {
    if (!validId(candidate.uid) ||
        candidate.cardId !== event.cardId ||
        candidate.physicalOwnerSeat !== event.controllerSeatAtDestruction ||
        candidate.zone !== 'deck' ||
        !isSeat(candidate.physicalOwnerSeat) ||
        candidateIds.has(candidate.uid)) {
      return { status: 'invalid-selection', eventId: event.eventId, reason: 'invalid-context' };
    }
    candidateIds.add(candidate.uid);
  }

  const selectedSet = new Set<string>();
  for (const uid of selectedUids) {
    if (!validId(uid)) {
      return { status: 'invalid-selection', eventId: event.eventId, reason: 'invalid-context' };
    }
    if (selectedSet.has(uid)) {
      return { status: 'invalid-selection', eventId: event.eventId, reason: 'duplicate-selection' };
    }
    selectedSet.add(uid);
    if (!candidateIds.has(uid)) {
      return { status: 'invalid-selection', eventId: event.eventId, reason: 'not-in-controller-deck' };
    }
  }

  const maxSummons = Math.min(deckCandidates.length, availableMonsterZones);
  if (selectedUids.length > maxSummons) {
    return { status: 'invalid-selection', eventId: event.eventId, reason: 'zone-capacity-or-deck-limit' };
  }

  const lifePointTeam = rule.lifePointTeam === 'controller' ? event.controllerTeam : event.opponentTeam;
  const candidateByUid = new Map(deckCandidates.map(candidate => [candidate.uid, candidate]));
  const summons = Object.freeze(selectedUids.map(uid => {
    const candidate = candidateByUid.get(uid)!;
    return Object.freeze({
      uid: candidate.uid,
      cardId: candidate.cardId,
      physicalOwnerSeat: candidate.physicalOwnerSeat,
      controllerSeat: event.controllerSeatAtDestruction,
      team: event.controllerTeam,
      zone: 'monster' as const,
      position: rule.summonPosition
    });
  }));

  return {
    status: 'resolved',
    eventId: event.eventId,
    lifePointChange: Object.freeze({
      kind: rule.lifePointKind,
      amount: rule.lifePointAmount,
      team: lifePointTeam
    }),
    resolutionSteps: Object.freeze(['life-point-change', 'optional-special-summon'] as const),
    summonChoiceOptional: true,
    maxSummons,
    summonPosition: rule.summonPosition,
    summons
  };
}
