export const AMEBA_CARD_ID = '95174353' as const;
export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 'even' | 'odd';

export type AmebaControlChangeEvent = Readonly<{
  eventId: string;
  faceUpSessionId: string;
  sourceUid: string;
  cardId: string;
  physicalOwnerSeat: DuelSeat;
  previousControllerSeat: DuelSeat;
  newControllerSeat: DuelSeat;
  faceUpAtChange: boolean;
  effectNegated?: boolean;
}>;

export type AmebaBurnReason =
  | 'wrong-card'
  | 'not-face-up-at-control-change'
  | 'effect-negated'
  | 'controller-did-not-change'
  | 'control-remained-within-team'
  | 'duplicate-event'
  | 'already-used-this-face-up-period';

export type AmebaBurnEvaluation =
  | Readonly<{ eligible: false; reason: AmebaBurnReason }>
  | Readonly<{
      eligible: true;
      plan: Readonly<{
        eventId: string;
        faceUpSessionId: string;
        sourceUid: string;
        physicalOwnerSeat: DuelSeat;
        fromTeam: DuelTeam;
        recipientSeat: DuelSeat;
        recipientTeam: DuelTeam;
        damage: 2000;
        oncePerFaceUpPeriod: true;
      }>;
    }>;

function isSeat(value: unknown): value is DuelSeat {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;
}

function requireSeat(value: unknown, name: string): asserts value is DuelSeat {
  if (!isSeat(value)) throw new TypeError(`Invalid ${name}.`);
}

function requireText(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new TypeError(`Invalid ${name}.`);
  }
}

function validateLedger(values: readonly string[], name: string): void {
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || value.length === 0)) {
    throw new TypeError(`Invalid ${name} ledger.`);
  }
  if (new Set(values).size !== values.length) throw new TypeError(`Duplicate entry in ${name} ledger.`);
}

export function teamOfAmebaSeat(seat: DuelSeat): DuelTeam {
  requireSeat(seat, 'seat');
  return seat % 2 === 0 ? 'even' : 'odd';
}

function validateEvent(event: AmebaControlChangeEvent): void {
  if (!event || typeof event !== 'object') throw new TypeError('Invalid Ameba control-change event.');
  requireText(event.eventId, 'event ID');
  requireText(event.faceUpSessionId, 'face-up session ID');
  requireText(event.sourceUid, 'source UID');
  requireText(event.cardId, 'card ID');
  requireSeat(event.physicalOwnerSeat, 'physical owner');
  requireSeat(event.previousControllerSeat, 'previous controller');
  requireSeat(event.newControllerSeat, 'new controller');
  if (typeof event.faceUpAtChange !== 'boolean') throw new TypeError('Invalid face-up snapshot.');
  if (event.effectNegated !== undefined && typeof event.effectNegated !== 'boolean') {
    throw new TypeError('Invalid effect-negation snapshot.');
  }
}

/**
 * Ameba inflicts 2000 damage when control of this face-up card changes.
 * The effect is usable once per face-up period; a new face-up session after
 * being turned face-down creates a new eligibility epoch.
 */
export function prepareAmebaControlChangeBurn(
  event: AmebaControlChangeEvent,
  processedEventIds: readonly string[] = [],
  usedFaceUpSessionIds: readonly string[] = [],
): AmebaBurnEvaluation {
  validateEvent(event);
  validateLedger(processedEventIds, 'processed-event');
  validateLedger(usedFaceUpSessionIds, 'used-face-up-session');
  if (event.cardId !== AMEBA_CARD_ID) return { eligible: false, reason: 'wrong-card' };
  if (!event.faceUpAtChange) return { eligible: false, reason: 'not-face-up-at-control-change' };
  if (event.effectNegated) return { eligible: false, reason: 'effect-negated' };
  if (processedEventIds.includes(event.eventId)) return { eligible: false, reason: 'duplicate-event' };
  if (usedFaceUpSessionIds.includes(event.faceUpSessionId)) {
    return { eligible: false, reason: 'already-used-this-face-up-period' };
  }
  if (event.previousControllerSeat === event.newControllerSeat) {
    return { eligible: false, reason: 'controller-did-not-change' };
  }

  const fromTeam = teamOfAmebaSeat(event.previousControllerSeat);
  const recipientTeam = teamOfAmebaSeat(event.newControllerSeat);
  // A seat handoff between partners does not change the controlling team or
  // the team's shared LP. It must not manufacture an Ameba damage trigger.
  if (fromTeam === recipientTeam) return { eligible: false, reason: 'control-remained-within-team' };

  return {
    eligible: true,
    plan: {
      eventId: event.eventId,
      faceUpSessionId: event.faceUpSessionId,
      sourceUid: event.sourceUid,
      physicalOwnerSeat: event.physicalOwnerSeat,
      fromTeam,
      recipientSeat: event.newControllerSeat,
      recipientTeam,
      damage: 2000,
      oncePerFaceUpPeriod: true,
    },
  };
}

/** Returns a new replay ledger; it never mutates the caller's persisted array. */
export function recordAmebaControlChangeEvent(
  processedEventIds: readonly string[],
  eventId: string,
): readonly string[] {
  validateLedger(processedEventIds, 'processed-event');
  requireText(eventId, 'event ID');
  if (processedEventIds.includes(eventId)) return processedEventIds;
  if (processedEventIds.length >= 4096) throw new RangeError('Ameba event ledger limit exceeded.');
  return [...processedEventIds, eventId];
}

/** Tracks the once-while-face-up clause independently from event replay IDs. */
export function recordAmebaFaceUpSession(
  usedFaceUpSessionIds: readonly string[],
  faceUpSessionId: string,
): readonly string[] {
  validateLedger(usedFaceUpSessionIds, 'used-face-up-session');
  requireText(faceUpSessionId, 'face-up session ID');
  if (usedFaceUpSessionIds.includes(faceUpSessionId)) return usedFaceUpSessionIds;
  if (usedFaceUpSessionIds.length >= 4096) throw new RangeError('Ameba face-up session ledger limit exceeded.');
  return [...usedFaceUpSessionIds, faceUpSessionId];
}
