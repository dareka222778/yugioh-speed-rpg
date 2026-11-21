import {
  identityTributeEligibility,
  payIdentityTributes,
  type IdentityTributeEligibility,
} from './identityScopedTribute';

export const THREE_HUMP_LACOODA_ID = '86988864';
export const THREE_HUMP_LACOODA_DRAW_COUNT = 3;
export const THREE_HUMP_LACOODA_REQUIRED_COPIES = 3;
export const THREE_HUMP_LACOODA_TRIBUTE_COUNT = 2;

export type PhysicalSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 0 | 1;

export type PhysicalCardRef = {
  readonly uid: string;
  readonly id: string;
  readonly ownerSeat: PhysicalSeat;
};

export type ThreeHumpFieldCard = PhysicalCardRef & {
  readonly faceUp: boolean;
  readonly controllerTeam: DuelTeam;
};

export type ThreeHumpSeatZones = {
  readonly deck: PhysicalCardRef[];
  readonly hand: PhysicalCardRef[];
};

export type ThreeHumpState = {
  readonly field: ThreeHumpFieldCard[];
  readonly grave: PhysicalCardRef[];
  readonly seats: Readonly<Record<PhysicalSeat, ThreeHumpSeatZones>>;
  readonly activeSeat: PhysicalSeat;
  readonly activeTeam: DuelTeam;
};

export type ThreeHumpActivation = {
  readonly sourceUid: string;
  readonly activeSeat: PhysicalSeat;
  readonly activeTeam: DuelTeam;
  readonly eligibleUids: readonly string[];
};

export type ThreeHumpPaidCost = {
  readonly sourceUid: string;
  readonly activeSeat: PhysicalSeat;
  readonly activeTeam: DuelTeam;
  readonly tributedUids: readonly string[];
  status: 'paid' | 'resolved';
};

export type ThreeHumpDrawResolution = {
  readonly activeSeat: PhysicalSeat;
  readonly drawn: readonly PhysicalCardRef[];
  readonly deckOut: boolean;
  readonly negated: boolean;
  readonly deckSizeAfter: number;
  readonly handSizeAfter: number;
  readonly costPaid: true;
};

function isSeat(value: number): value is PhysicalSeat {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

function assertState(state: ThreeHumpState): void {
  if (!state || !Array.isArray(state.field) || !Array.isArray(state.grave) || !state.seats) {
    throw new TypeError('3-Hump Lacooda state is incomplete.');
  }
  if (!isSeat(state.activeSeat) || (state.activeTeam !== 0 && state.activeTeam !== 1)) {
    throw new RangeError('3-Hump Lacooda active seat/team is invalid.');
  }
  if (state.activeSeat % 2 !== state.activeTeam) {
    throw new Error('3-Hump Lacooda active seat does not belong to the controlling team.');
  }

  const seen = new Set<string>();
  const add = (card: PhysicalCardRef, zone: string, expectedOwner?: PhysicalSeat): void => {
    if (!card || typeof card.uid !== 'string' || card.uid.length === 0 ||
        typeof card.id !== 'string' || card.id.length === 0 || !isSeat(card.ownerSeat)) {
      throw new TypeError('3-Hump Lacooda ' + zone + ' contains an invalid physical card.');
    }
    if (expectedOwner !== undefined && card.ownerSeat !== expectedOwner) {
      throw new Error('3-Hump Lacooda ' + zone + ' contains a card owned by another physical seat.');
    }
    if (seen.has(card.uid)) throw new Error('3-Hump Lacooda state contains a duplicate physical UID.');
    seen.add(card.uid);
  };

  for (const card of state.field) {
    add(card, 'field');
    if (typeof card.faceUp !== 'boolean' || card.controllerTeam !== state.activeTeam) {
      throw new Error('3-Hump Lacooda field must contain only this team controlled Monster Zones.');
    }
  }
  for (const card of state.grave) add(card, 'Graveyard');
  for (const seat of [0, 1, 2, 3] as const) {
    const zones = state.seats[seat];
    if (!zones || !Array.isArray(zones.deck) || !Array.isArray(zones.hand)) {
      throw new TypeError('3-Hump Lacooda private zones for seat ' + seat + ' are incomplete.');
    }
    for (const card of zones.deck) add(card, 'seat ' + seat + ' Deck', seat);
    for (const card of zones.hand) add(card, 'seat ' + seat + ' hand', seat);
  }
}

/** Three face-up copies and three drawable cards are required before activation. */
export function prepareThreeHumpLacooda(state: ThreeHumpState, sourceUid: string): ThreeHumpActivation | null {
  assertState(state);
  if (state.seats[state.activeSeat].deck.length < THREE_HUMP_LACOODA_DRAW_COUNT) return null;
  const eligibility = identityTributeEligibility(
    state.field, sourceUid, THREE_HUMP_LACOODA_ID,
    THREE_HUMP_LACOODA_REQUIRED_COPIES, THREE_HUMP_LACOODA_TRIBUTE_COUNT,
  );
  if (!eligibility) return null;
  return Object.freeze({
    sourceUid,
    activeSeat: state.activeSeat,
    activeTeam: state.activeTeam,
    eligibleUids: Object.freeze(eligibility.candidates.map(card => card.uid)),
  });
}

/** Pay exactly two Tributes at activation; revalidate before any mutation. */
export function payThreeHumpLacoodaCost(
  state: ThreeHumpState,
  activation: ThreeHumpActivation,
  selectedUids: readonly string[],
): ThreeHumpPaidCost | null {
  assertState(state);
  if (!activation || state.activeSeat !== activation.activeSeat || state.activeTeam !== activation.activeTeam) return null;
  if (state.seats[activation.activeSeat].deck.length < THREE_HUMP_LACOODA_DRAW_COUNT) return null;
  if (!Array.isArray(selectedUids) || selectedUids.length !== THREE_HUMP_LACOODA_TRIBUTE_COUNT ||
      selectedUids.some(uid => !activation.eligibleUids.includes(uid))) return null;

  const eligibility: IdentityTributeEligibility<ThreeHumpFieldCard> | null = identityTributeEligibility(
    state.field, activation.sourceUid, THREE_HUMP_LACOODA_ID,
    THREE_HUMP_LACOODA_REQUIRED_COPIES, THREE_HUMP_LACOODA_TRIBUTE_COUNT,
  );
  if (!eligibility) return null;
  const tributed = payIdentityTributes(state.field, state.grave, eligibility, selectedUids);
  if (!tributed) return null;

  return {
    sourceUid: activation.sourceUid,
    activeSeat: activation.activeSeat,
    activeTeam: activation.activeTeam,
    tributedUids: Object.freeze(tributed.map(card => card.uid)),
    status: 'paid',
  };
}

/** Negation does not refund the cost. Draw only from the physical seat captured
 * at activation. A short Deck at resolution is reported to the duel engine.
 * The six-card hand limit remains an End Phase operation, never an immediate cap. */
export function resolveThreeHumpLacoodaDraw(
  state: ThreeHumpState,
  paidCost: ThreeHumpPaidCost,
  effectNegated = false,
): ThreeHumpDrawResolution | null {
  assertState(state);
  if (!paidCost || paidCost.status !== 'paid') return null;
  const zones = state.seats[paidCost.activeSeat];
  if (!zones) throw new Error('3-Hump Lacooda paid-cost seat no longer exists.');

  if (effectNegated) {
    paidCost.status = 'resolved';
    return {
      activeSeat: paidCost.activeSeat, drawn: Object.freeze([]), deckOut: false, negated: true,
      deckSizeAfter: zones.deck.length, handSizeAfter: zones.hand.length, costPaid: true,
    };
  }

  const count = Math.min(THREE_HUMP_LACOODA_DRAW_COUNT, zones.deck.length);
  const drawn = zones.deck.splice(0, count);
  zones.hand.push(...drawn);
  paidCost.status = 'resolved';
  return {
    activeSeat: paidCost.activeSeat, drawn: Object.freeze([...drawn]),
    deckOut: count < THREE_HUMP_LACOODA_DRAW_COUNT, negated: false,
    deckSizeAfter: zones.deck.length, handSizeAfter: zones.hand.length, costPaid: true,
  };
}
