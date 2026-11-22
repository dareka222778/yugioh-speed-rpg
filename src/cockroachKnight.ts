export const COCKROACH_KNIGHT_ID = '33413638' as const;

export type CockroachKnightSeat = 0 | 1 | 2 | 3;
export type CockroachKnightSourceZone = 'monster' | 'hand' | 'deck' | 'banished';

export type CockroachKnightTriggerEvent = Readonly<{
  eventId: string;
  cardId: typeof COCKROACH_KNIGHT_ID;
  uid: string;
  physicalOwnerSeat: CockroachKnightSeat;
  controllerSeatAtSend: CockroachKnightSeat | null;
  sourceZoneAtSend: CockroachKnightSourceZone;
  graveEpoch: number;
  sendTurn: number;
  sendPhase: string;
  triggerLocation: 'grave';
  mandatory: true;
  targets: false;
  chainLinkRequired: true;
}>;

export type ScheduleCockroachKnightInput = Readonly<{
  eventId: string;
  cardId: string;
  uid: string;
  physicalOwnerSeat: CockroachKnightSeat;
  controllerSeatAtSend?: CockroachKnightSeat | null;
  sourceZoneAtSend: string;
  graveEpoch: number;
  sendTurn: number;
  sendPhase: string;
  effectNegated?: boolean;
}>;

export type ScheduleCockroachKnightResult =
  | Readonly<{ ok: true; event: CockroachKnightTriggerEvent }>
  | Readonly<{
      ok: false;
      reason:
        | 'wrong-card'
        | 'invalid-context'
        | 'not-sent-to-graveyard'
        | 'effect-negated'
        | 'duplicate-event';
    }>;

export type CockroachKnightCurrentSnapshot = Readonly<{
  uid: string;
  physicalOwnerSeat: CockroachKnightSeat;
  graveEpoch: number;
  zone: string;
}>;

export type ResolveCockroachKnightResult =
  | Readonly<{
      status: 'return-to-deck-top';
      eventId: string;
      plan: Readonly<{
        uid: string;
        fromZone: 'grave';
        toZone: 'deck-top';
        physicalOwnerSeat: CockroachKnightSeat;
        destinationDeckSeat: CockroachKnightSeat;
        shuffleDeck: false;
        mandatory: true;
        targets: false;
      }>;
    }>
  | Readonly<{
      status: 'skipped';
      eventId: string;
      reason: 'left-graveyard' | 'physical-instance-changed' | 'physical-owner-changed' | 'effect-negated';
    }>
  | Readonly<{ status: 'invalid-event'; eventId?: string }>;

function isSeat(value: unknown): value is CockroachKnightSeat {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\u0000-\u001f]/.test(value);
}

function isSourceZone(value: string): value is CockroachKnightSourceZone {
  return value === 'monster' || value === 'hand' || value === 'deck' || value === 'banished';
}

function validEvent(event: CockroachKnightTriggerEvent): boolean {
  return !!event &&
    event.cardId === COCKROACH_KNIGHT_ID &&
    validId(event.eventId) &&
    validId(event.uid) &&
    isSeat(event.physicalOwnerSeat) &&
    (event.controllerSeatAtSend === null || isSeat(event.controllerSeatAtSend)) &&
    isSourceZone(event.sourceZoneAtSend) &&
    Number.isSafeInteger(event.graveEpoch) &&
    event.graveEpoch >= 0 &&
    Number.isSafeInteger(event.sendTurn) &&
    event.sendTurn >= 1 &&
    typeof event.sendPhase === 'string' &&
    event.sendPhase.length > 0 &&
    event.triggerLocation === 'grave' &&
    event.mandatory === true &&
    event.targets === false &&
    event.chainLinkRequired === true;
}

/**
 * Cockroach Knight has a mandatory trigger effect that activates in the GY
 * whenever this physical card is sent there. The official OCG FAQ confirms
 * that it also triggers when sent from the hand or Deck and during the Damage
 * Step. This creates a chain link; it is not a replacement effect.
 */
export function scheduleCockroachKnightTopdeckReturn(
  input: ScheduleCockroachKnightInput,
  existingEvents: readonly CockroachKnightTriggerEvent[] = []
): ScheduleCockroachKnightResult {
  if (input.cardId !== COCKROACH_KNIGHT_ID) return { ok: false, reason: 'wrong-card' };
  if (!validId(input.eventId) ||
      !validId(input.uid) ||
      !isSeat(input.physicalOwnerSeat) ||
      (input.controllerSeatAtSend !== undefined &&
        input.controllerSeatAtSend !== null &&
        !isSeat(input.controllerSeatAtSend)) ||
      !Number.isSafeInteger(input.graveEpoch) ||
      input.graveEpoch < 0 ||
      !Number.isSafeInteger(input.sendTurn) ||
      input.sendTurn < 1 ||
      typeof input.sendPhase !== 'string' ||
      input.sendPhase.length === 0 ||
      (input.effectNegated !== undefined && typeof input.effectNegated !== 'boolean') ||
      !Array.isArray(existingEvents)) {
    return { ok: false, reason: 'invalid-context' };
  }
  if (!isSourceZone(input.sourceZoneAtSend)) {
    return { ok: false, reason: 'not-sent-to-graveyard' };
  }
  if (input.effectNegated === true) return { ok: false, reason: 'effect-negated' };
  if (existingEvents.some(event =>
    event?.eventId === input.eventId ||
    (event?.uid === input.uid && event?.graveEpoch === input.graveEpoch)
  )) {
    return { ok: false, reason: 'duplicate-event' };
  }

  const event: CockroachKnightTriggerEvent = Object.freeze({
    eventId: input.eventId,
    cardId: COCKROACH_KNIGHT_ID,
    uid: input.uid,
    physicalOwnerSeat: input.physicalOwnerSeat,
    controllerSeatAtSend: input.controllerSeatAtSend ?? null,
    sourceZoneAtSend: input.sourceZoneAtSend,
    graveEpoch: input.graveEpoch,
    sendTurn: input.sendTurn,
    sendPhase: input.sendPhase,
    triggerLocation: 'grave',
    mandatory: true,
    targets: false,
    chainLinkRequired: true
  });
  return { ok: true, event };
}

/**
 * Resolve the GY trigger. The caller must revalidate the UID/epoch and apply
 * the returned plan. If the card left the GY or became a different physical
 * instance before resolution, no stale move is issued.
 */
export function resolveCockroachKnightTopdeckReturn(
  event: CockroachKnightTriggerEvent,
  current: CockroachKnightCurrentSnapshot | null | undefined,
  effectNegated = false
): ResolveCockroachKnightResult {
  if (!validEvent(event) || typeof effectNegated !== 'boolean') {
    return { status: 'invalid-event', eventId: event?.eventId };
  }
  if (effectNegated) return { status: 'skipped', eventId: event.eventId, reason: 'effect-negated' };
  if (!current || current.zone !== 'grave') {
    return { status: 'skipped', eventId: event.eventId, reason: 'left-graveyard' };
  }
  if (!validId(current.uid) ||
      !Number.isSafeInteger(current.graveEpoch) ||
      current.graveEpoch < 0 ||
      current.uid !== event.uid ||
      current.graveEpoch !== event.graveEpoch) {
    return { status: 'skipped', eventId: event.eventId, reason: 'physical-instance-changed' };
  }
  if (!isSeat(current.physicalOwnerSeat)) {
    return { status: 'invalid-event', eventId: event.eventId };
  }
  if (current.physicalOwnerSeat !== event.physicalOwnerSeat) {
    return { status: 'skipped', eventId: event.eventId, reason: 'physical-owner-changed' };
  }

  return {
    status: 'return-to-deck-top',
    eventId: event.eventId,
    plan: Object.freeze({
      uid: event.uid,
      fromZone: 'grave',
      toZone: 'deck-top',
      physicalOwnerSeat: event.physicalOwnerSeat,
      destinationDeckSeat: event.physicalOwnerSeat,
      shuffleDeck: false,
      mandatory: true,
      targets: false
    })
  };
}
