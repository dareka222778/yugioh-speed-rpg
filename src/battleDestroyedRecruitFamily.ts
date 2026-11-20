export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 0 | 1;
export type RecruitPosition = 'face-up-attack' | 'face-down-defense';

export const BATTLE_DESTROYED_RECRUIT_CARDS = {
  giantGerm: {
    id: '95178994',
    konamiId: 4921,
    lpEffect: 'damage',
    amount: 500,
    position: 'face-up-attack',
  },
  nimbleMomonga: {
    id: '22567609',
    konamiId: 4922,
    lpEffect: 'gain',
    amount: 1000,
    position: 'face-down-defense',
  },
} as const;

export interface BattleDestroyedSource {
  uid: string;
  id: string;
  physicalOwnerSeat: number;
  controllerTeamAtDestruction: number;
  zone: 'grave';
  graveyardTeam: number;
  destroyedByBattle: boolean;
  sentToGraveByBattle: boolean;
  destroyedTurn: number;
}

export interface BattleDestroyedRecruitPlan {
  cardId: typeof BATTLE_DESTROYED_RECRUIT_CARDS[keyof typeof BATTLE_DESTROYED_RECRUIT_CARDS]['id'];
  sourceUid: string;
  physicalOwnerSeat: DuelSeat;
  ownerTeam: DuelTeam;
  controllerTeamAtDestruction: DuelTeam;
  opposingTeam: DuelTeam;
  lpEffect: 'damage' | 'gain';
  lpAmount: 500 | 1000;
  summonPosition: RecruitPosition;
  triggerTurn: number;
}

export interface RecruitDeckCard {
  uid: string;
  id: string;
  physicalOwnerSeat: number;
  zone: 'deck';
  kind: 'monster';
}

export interface BattleDestroyedRecruitResolution {
  lpTeam: DuelTeam;
  lpBefore: number;
  lpAfter: number;
  lpChange: number;
  lpEffect: 'damage' | 'gain';
  summoned: Array<{
    uid: string;
    id: string;
    physicalOwnerSeat: DuelSeat;
    controllerTeam: DuelTeam;
    monsterZoneIndex: 0 | 1 | 2;
    position: RecruitPosition;
  }>;
  remainingMonsterZoneIndices: Array<0 | 1 | 2>;
}

export type RuleResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export function teamOfSeat(seat: number): DuelTeam | undefined {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) return undefined;
  return (seat % 2) as DuelTeam;
}

function fail<T>(reason: string): RuleResult<T> {
  return { ok: false, reason };
}

function validUid(uid: unknown): uid is string {
  return typeof uid === 'string' && uid.trim().length > 0;
}

function validNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validTeam(value: number): value is DuelTeam {
  return value === 0 || value === 1;
}

function uniqueUids(cards: readonly { uid: string }[]): boolean {
  const seen = new Set<string>();
  for (const card of cards) {
    if (!validUid(card.uid) || seen.has(card.uid)) return false;
    seen.add(card.uid);
  }
  return true;
}

function cardRule(id: string) {
  if (id === BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id) return BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm;
  if (id === BATTLE_DESTROYED_RECRUIT_CARDS.nimbleMomonga.id) return BATTLE_DESTROYED_RECRUIT_CARDS.nimbleMomonga;
  return undefined;
}

/**
 * Plans the mandatory LP change and optional same-name recruitment.
 * The physical owner receives the trigger even if the opposing team controlled
 * the monster when battle destroyed it. The owner's own physical Deck is used.
 * This is a pure plan: it does not mutate LP, Graveyards, Decks, or the field.
 */
export function planBattleDestroyedRecruit(input: {
  source: BattleDestroyedSource;
  currentTurn: number;
}): RuleResult<BattleDestroyedRecruitPlan> {
  const { source, currentTurn } = input;
  if (!validUid(source.uid)) return fail('invalid-source-uid');
  if (!Number.isInteger(currentTurn) || currentTurn < 0 || !Number.isInteger(source.destroyedTurn) || source.destroyedTurn < 0) {
    return fail('invalid-turn');
  }
  if (source.destroyedTurn !== currentTurn) return fail('trigger-from-different-turn');
  if (source.zone !== 'grave' || source.sentToGraveByBattle !== true || source.destroyedByBattle !== true) {
    return fail('source-not-destroyed-by-battle-and-sent-to-grave');
  }
  const rule = cardRule(source.id);
  if (!rule) return fail('unsupported-card-id');
  const ownerTeam = teamOfSeat(source.physicalOwnerSeat);
  const controllerTeam = validTeam(source.controllerTeamAtDestruction)
    ? source.controllerTeamAtDestruction
    : undefined;
  const graveyardTeam = validTeam(source.graveyardTeam) ? source.graveyardTeam : undefined;
  if (ownerTeam === undefined) return fail('invalid-physical-owner-seat');
  if (controllerTeam === undefined) return fail('invalid-controller-team');
  if (graveyardTeam === undefined || graveyardTeam !== ownerTeam) return fail('source-not-in-physical-owners-shared-graveyard');

  return {
    ok: true,
    value: {
      cardId: rule.id,
      sourceUid: source.uid,
      physicalOwnerSeat: source.physicalOwnerSeat as DuelSeat,
      ownerTeam,
      controllerTeamAtDestruction: controllerTeam,
      opposingTeam: ownerTeam === 0 ? 1 : 0,
      lpEffect: rule.lpEffect,
      lpAmount: rule.amount,
      summonPosition: rule.position,
      triggerTurn: currentTurn,
    },
  };
}

/**
 * Resolves the LP change first, then an optional selection of any number of
 * same-name copies from the physical owner's Deck. Shared Monster Zones are
 * team-owned and capped at three; the separate Field Zone is not counted here.
 * The selected UID list is server-side and must not be sent to public Discord.
 */
export function resolveBattleDestroyedRecruit(input: {
  plan: BattleDestroyedRecruitPlan;
  lifePointsByTeam: readonly [number, number];
  ownerDeckAtResolution: readonly RecruitDeckCard[];
  occupiedMonsterZoneIndices: readonly number[];
  selectedUids: readonly string[];
}): RuleResult<BattleDestroyedRecruitResolution> {
  const { plan, lifePointsByTeam, ownerDeckAtResolution, occupiedMonsterZoneIndices, selectedUids } = input;
  if (!validUid(plan.sourceUid) || !Number.isInteger(plan.triggerTurn) || plan.triggerTurn < 0) return fail('invalid-plan-identity');
  const physicalOwnerTeam = teamOfSeat(plan.physicalOwnerSeat);
  if (physicalOwnerTeam === undefined || physicalOwnerTeam !== plan.ownerTeam) return fail('plan-owner-team-mismatch');
  if (!validTeam(plan.controllerTeamAtDestruction)) return fail('invalid-controller-team');
  const expectedOpposingTeam: DuelTeam = plan.ownerTeam === 0 ? 1 : 0;
  if (plan.opposingTeam !== expectedOpposingTeam) return fail('invalid-opposing-team');
  const rule = cardRule(plan.cardId);
  if (!rule || rule.lpEffect !== plan.lpEffect || rule.amount !== plan.lpAmount || rule.position !== plan.summonPosition) {
    return fail('plan-does-not-match-registered-card-rule');
  }
  if (!Array.isArray(lifePointsByTeam) || lifePointsByTeam.length !== 2
    || !validNonNegativeSafeInteger(lifePointsByTeam[0]) || !validNonNegativeSafeInteger(lifePointsByTeam[1])) {
    return fail('invalid-team-life-points');
  }
  if (!Array.isArray(ownerDeckAtResolution) || ownerDeckAtResolution.length > 30) return fail('invalid-owner-deck-size');
  if (!Array.isArray(occupiedMonsterZoneIndices)) return fail('invalid-occupied-monster-zones');
  const occupied = new Set<number>();
  for (const zone of occupiedMonsterZoneIndices) {
    if (!Number.isInteger(zone) || zone < 0 || zone > 2 || occupied.has(zone)) return fail('invalid-occupied-monster-zones');
    occupied.add(zone);
  }
  if (!Array.isArray(selectedUids) || !uniqueUids(selectedUids.map(uid => ({ uid })))) return fail('duplicate-or-invalid-selected-uid');

  for (const card of ownerDeckAtResolution) {
    if (!validUid(card.uid) || typeof card.id !== 'string' || card.id.trim().length === 0
      || card.zone !== 'deck' || card.kind !== 'monster') return fail('invalid-owner-deck-card');
    if (card.physicalOwnerSeat !== plan.physicalOwnerSeat) return fail('deck-card-not-in-physical-owners-private-deck');
  }
  if (!uniqueUids([{ uid: plan.sourceUid }, ...ownerDeckAtResolution])) return fail('duplicate-physical-uid-across-graveyard-and-deck');

  const available = ownerDeckAtResolution.filter(card => card.id === plan.cardId);
  const availableByUid = new Map(available.map(card => [card.uid, card]));
  const ownerDeckByUid = new Map(ownerDeckAtResolution.map(card => [card.uid, card]));
  const freeZones = ([0, 1, 2] as const).filter(zone => !occupied.has(zone));
  if (selectedUids.length > freeZones.length) return fail('selection-exceeds-free-shared-monster-zones');
  for (const uid of selectedUids) {
    if (!ownerDeckByUid.has(uid)) return fail('selected-card-not-in-physical-owners-deck');
  }
  for (const uid of selectedUids) {
    if (!availableByUid.has(uid)) return fail('selected-card-not-eligible-same-name-copy');
  }

  const lpTeam = plan.lpEffect === 'damage' ? plan.opposingTeam : plan.ownerTeam;
  const lpBefore = lifePointsByTeam[lpTeam];
  const rawLpAfter = plan.lpEffect === 'damage' ? lpBefore - plan.lpAmount : lpBefore + plan.lpAmount;
  if (!Number.isSafeInteger(rawLpAfter)) return fail('life-point-result-outside-safe-integer-range');
  const lpAfter = Math.max(0, rawLpAfter);
  const summoned = selectedUids.map((uid, index) => {
    const card = availableByUid.get(uid)!;
    return {
      uid: card.uid,
      id: card.id,
      physicalOwnerSeat: plan.physicalOwnerSeat,
      controllerTeam: plan.ownerTeam,
      monsterZoneIndex: freeZones[index],
      position: plan.summonPosition,
    };
  });

  return {
    ok: true,
    value: {
      lpTeam,
      lpBefore,
      lpAfter,
      lpChange: lpAfter - lpBefore,
      lpEffect: plan.lpEffect,
      summoned,
      remainingMonsterZoneIndices: freeZones.slice(selectedUids.length),
    },
  };
}
