export const WICKED_WORM_BEAST_ID = '06285791' as const;

export type WickedWormBeastSeat = 0 | 1 | 2 | 3;
export type WickedWormBeastZone = 'monster' | 'spell-trap' | 'field' | 'hand' | 'deck' | 'grave' | 'banished' | 'extra';

export type WickedWormBeastReturnLedger = Readonly<{
  turn: number;
  returnedUids: readonly string[];
}>;

export type WickedWormBeastEndPhaseInput = Readonly<{
  cardId: string;
  uid: string;
  physicalOwnerSeat: WickedWormBeastSeat;
  controllerSeat: WickedWormBeastSeat;
  activeSeat: WickedWormBeastSeat;
  turn: number;
  phase: 'draw' | 'standby' | 'main' | 'battle' | 'end' | 'finished';
  zone: WickedWormBeastZone;
  faceUp: boolean;
  effectNegated?: boolean;
  ledger?: WickedWormBeastReturnLedger | null;
}>;

export type WickedWormBeastEndPhaseResult =
  | Readonly<{
      ok: true;
      plan: Readonly<{
        uid: string;
        fromZone: 'monster';
        toZone: 'hand';
        physicalOwnerSeat: WickedWormBeastSeat;
        physicalOwnerTeam: 0 | 1;
        controllerTeam: 0 | 1;
      }>;
      ledger: WickedWormBeastReturnLedger;
    }>
  | Readonly<{
      ok: false;
      reason:
        | 'wrong-card'
        | 'invalid-context'
        | 'not-end-phase'
        | 'not-on-field'
        | 'not-face-up'
        | 'effect-negated'
        | 'not-controller-team-end-phase'
        | 'already-returned';
    }>;

function isSeat(value: unknown): value is WickedWormBeastSeat {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function teamOfSeat(seat: WickedWormBeastSeat): 0 | 1 {
  return (seat % 2) as 0 | 1;
}

function validUid(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\u0000-\u001f]/.test(value);
}

function validLedger(value: unknown, turn: number): value is WickedWormBeastReturnLedger {
  if (value == null) return true;
  if (typeof value !== 'object') return false;
  const ledger = value as WickedWormBeastReturnLedger;
  if (!Number.isSafeInteger(ledger.turn) || ledger.turn < 1 || ledger.turn > turn ||
      !Array.isArray(ledger.returnedUids)) return false;
  const ids = ledger.returnedUids;
  return ids.every(validUid) && new Set(ids).size === ids.length;
}

function validInput(input: WickedWormBeastEndPhaseInput): boolean {
  return input.cardId === WICKED_WORM_BEAST_ID &&
    validUid(input.uid) &&
    isSeat(input.physicalOwnerSeat) &&
    isSeat(input.controllerSeat) &&
    isSeat(input.activeSeat) &&
    Number.isSafeInteger(input.turn) &&
    input.turn >= 1 &&
    ['draw', 'standby', 'main', 'battle', 'end', 'finished'].includes(input.phase) &&
    ['monster', 'spell-trap', 'field', 'hand', 'deck', 'grave', 'banished', 'extra'].includes(input.zone) &&
    typeof input.faceUp === 'boolean' &&
    (input.effectNegated === undefined || typeof input.effectNegated === 'boolean') &&
    validLedger(input.ledger, input.turn);
}

/**
 * Plan The Wicked Worm Beast's mandatory End Phase return.
 *
 * A 2v2 team turn is represented by the active seat; seats 0/2 and 1/3
 * share a team. The destination is always the card's physical owner's hand,
 * never the controller's hand. This helper is pure: the duel resolver must
 * revalidate the UID and execute the move.
 */
export function planWickedWormBeastEndPhaseReturn(
  input: WickedWormBeastEndPhaseInput
): WickedWormBeastEndPhaseResult {
  if (input.cardId !== WICKED_WORM_BEAST_ID) return { ok: false, reason: 'wrong-card' };
  if (!validInput(input)) return { ok: false, reason: 'invalid-context' };
  if (input.phase !== 'end') return { ok: false, reason: 'not-end-phase' };
  if (input.zone !== 'monster') return { ok: false, reason: 'not-on-field' };
  if (!input.faceUp) return { ok: false, reason: 'not-face-up' };
  if (input.effectNegated === true) return { ok: false, reason: 'effect-negated' };

  const controllerTeam = teamOfSeat(input.controllerSeat);
  if (teamOfSeat(input.activeSeat) !== controllerTeam) {
    return { ok: false, reason: 'not-controller-team-end-phase' };
  }

  const prior = input.ledger?.turn === input.turn ? input.ledger.returnedUids : [];
  if (prior.includes(input.uid)) return { ok: false, reason: 'already-returned' };

  const ledger: WickedWormBeastReturnLedger = Object.freeze({
    turn: input.turn,
    returnedUids: Object.freeze([...prior, input.uid])
  });
  const plan = Object.freeze({
    uid: input.uid,
    fromZone: 'monster' as const,
    toZone: 'hand' as const,
    physicalOwnerSeat: input.physicalOwnerSeat,
    physicalOwnerTeam: teamOfSeat(input.physicalOwnerSeat),
    controllerTeam
  });

  return { ok: true, plan, ledger };
}
