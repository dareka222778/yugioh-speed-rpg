export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 0 | 1;
export type RecruitAttribute = 'EARTH' | 'LIGHT';

export const ATTRIBUTE_BATTLE_RECRUIT_CARDS = {
  giantRat: { id: '97017120', konamiId: 4915, attribute: 'EARTH', maximumAtk: 1500 },
  shiningAngel: { id: '95956346', konamiId: 4924, attribute: 'LIGHT', maximumAtk: 1500 },
} as const;

export interface DestroyedRecruitSource {
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

export interface AttributeRecruitPlan {
  sourceUid: string;
  sourceCardId: string;
  physicalOwnerSeat: DuelSeat;
  ownerTeam: DuelTeam;
  controllerTeamAtDestruction: DuelTeam;
  opposingTeam: DuelTeam;
  attribute: RecruitAttribute;
  maximumAtk: 1500;
  summonCount: 1;
  position: 'face-up-attack';
  triggerTurn: number;
}

export interface AttributeDeckMonster {
  uid: string;
  id: string;
  physicalOwnerSeat: number;
  zone: 'deck';
  kind: 'monster';
  attribute: string;
  atk: number;
}

export interface AttributeRecruitResolution {
  summoned: null | {
    uid: string;
    id: string;
    physicalOwnerSeat: DuelSeat;
    controllerTeam: DuelTeam;
    monsterZoneIndex: 0 | 1 | 2;
    position: 'face-up-attack';
  };
  remainingMonsterZoneIndices: Array<0 | 1 | 2>;
}

export type RuleResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export function teamOfSeat(seat: number): DuelTeam | undefined {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) return undefined;
  return (seat % 2) as DuelTeam;
}

function fail<T>(reason: string): RuleResult<T> { return { ok: false, reason }; }
function validUid(uid: unknown): uid is string { return typeof uid === 'string' && uid.trim().length > 0; }
function validTeam(value: number): value is DuelTeam { return value === 0 || value === 1; }
function cardRule(id: string) {
  if (id === ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id) return ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat;
  if (id === ATTRIBUTE_BATTLE_RECRUIT_CARDS.shiningAngel.id) return ATTRIBUTE_BATTLE_RECRUIT_CARDS.shiningAngel;
  return undefined;
}
function uniqueUids(cards: readonly { uid: string }[]): boolean {
  const seen = new Set<string>();
  for (const card of cards) {
    if (!validUid(card.uid) || seen.has(card.uid)) return false;
    seen.add(card.uid);
  }
  return true;
}

/** Pure trigger plan. Physical ownership, not temporary control, identifies the effect player. */
export function planAttributeBattleRecruit(input: {
  source: DestroyedRecruitSource;
  currentTurn: number;
}): RuleResult<AttributeRecruitPlan> {
  const { source, currentTurn } = input;
  if (!validUid(source.uid)) return fail('invalid-source-uid');
  if (!Number.isInteger(currentTurn) || currentTurn < 0 || !Number.isInteger(source.destroyedTurn) || source.destroyedTurn < 0) return fail('invalid-turn');
  if (source.destroyedTurn !== currentTurn) return fail('trigger-from-different-turn');
  if (source.zone !== 'grave' || source.destroyedByBattle !== true || source.sentToGraveByBattle !== true) return fail('source-not-destroyed-by-battle-and-sent-to-grave');
  const rule = cardRule(source.id);
  if (!rule) return fail('unsupported-card-id');
  const ownerTeam = teamOfSeat(source.physicalOwnerSeat);
  if (ownerTeam === undefined) return fail('invalid-physical-owner-seat');
  if (!validTeam(source.controllerTeamAtDestruction)) return fail('invalid-controller-team');
  if (!validTeam(source.graveyardTeam) || source.graveyardTeam !== ownerTeam) return fail('source-not-in-physical-owners-shared-graveyard');
  return {
    ok: true,
    value: {
      sourceUid: source.uid,
      sourceCardId: rule.id,
      physicalOwnerSeat: source.physicalOwnerSeat as DuelSeat,
      ownerTeam,
      controllerTeamAtDestruction: source.controllerTeamAtDestruction,
      opposingTeam: ownerTeam === 0 ? 1 : 0,
      attribute: rule.attribute,
      maximumAtk: rule.maximumAtk,
      summonCount: 1,
      position: 'face-up-attack',
      triggerTurn: currentTurn,
    },
  };
}

/** Resolves an optional single recruit from the owner's private Deck into one of three shared Monster Zones. */
export function resolveAttributeBattleRecruit(input: {
  plan: AttributeRecruitPlan;
  ownerDeckAtResolution: readonly AttributeDeckMonster[];
  occupiedMonsterZoneIndices: readonly number[];
  selectedUid: string | null;
}): RuleResult<AttributeRecruitResolution> {
  const { plan, ownerDeckAtResolution, occupiedMonsterZoneIndices, selectedUid } = input;
  if (!validUid(plan.sourceUid) || !Number.isInteger(plan.triggerTurn) || plan.triggerTurn < 0) return fail('invalid-plan-identity');
  const ownerTeam = teamOfSeat(plan.physicalOwnerSeat);
  if (ownerTeam === undefined || ownerTeam !== plan.ownerTeam) return fail('plan-owner-team-mismatch');
  if (!validTeam(plan.controllerTeamAtDestruction)) return fail('invalid-controller-team');
  if (plan.opposingTeam !== (plan.ownerTeam === 0 ? 1 : 0)) return fail('invalid-opposing-team');
  const rule = cardRule(plan.sourceCardId);
  if (!rule || rule.attribute !== plan.attribute || rule.maximumAtk !== plan.maximumAtk || plan.summonCount !== 1 || plan.position !== 'face-up-attack') return fail('plan-does-not-match-registered-card-rule');
  if (!Array.isArray(ownerDeckAtResolution) || ownerDeckAtResolution.length > 30) return fail('invalid-owner-deck-size');
  if (!Array.isArray(occupiedMonsterZoneIndices)) return fail('invalid-occupied-monster-zones');
  const occupied = new Set<number>();
  for (const zone of occupiedMonsterZoneIndices) {
    if (!Number.isInteger(zone) || zone < 0 || zone > 2 || occupied.has(zone)) return fail('invalid-occupied-monster-zones');
    occupied.add(zone);
  }
  for (const card of ownerDeckAtResolution) {
    if (!validUid(card.uid) || typeof card.id !== 'string' || card.id.trim().length === 0 || card.zone !== 'deck' || card.kind !== 'monster'
      || typeof card.attribute !== 'string' || !Number.isSafeInteger(card.atk) || card.atk < 0) return fail('invalid-owner-deck-card');
    if (card.physicalOwnerSeat !== plan.physicalOwnerSeat) return fail('deck-card-not-in-physical-owners-private-deck');
  }
  if (!uniqueUids([{ uid: plan.sourceUid }, ...ownerDeckAtResolution])) return fail('duplicate-physical-uid-across-graveyard-and-deck');
  if (selectedUid !== null && !validUid(selectedUid)) return fail('invalid-selected-uid');
  const freeZone = ([0, 1, 2] as const).find(zone => !occupied.has(zone));
  if (selectedUid !== null && freeZone === undefined) return fail('no-free-shared-monster-zone');
  if (selectedUid === null) return { ok: true, value: { summoned: null, remainingMonsterZoneIndices: ([0, 1, 2] as const).filter(zone => !occupied.has(zone)) } };
  const selected = ownerDeckAtResolution.find(card => card.uid === selectedUid);
  if (!selected) return fail('selected-card-not-in-physical-owners-deck');
  if (selected.attribute !== plan.attribute || selected.atk > plan.maximumAtk) return fail('selected-card-does-not-match-attribute-and-atk-filter');
  return {
    ok: true,
    value: {
      summoned: {
        uid: selected.uid,
        id: selected.id,
        physicalOwnerSeat: plan.physicalOwnerSeat,
        controllerTeam: plan.ownerTeam,
        monsterZoneIndex: freeZone!,
        position: 'face-up-attack',
      },
      remainingMonsterZoneIndices: ([0, 1, 2] as const).filter(zone => !occupied.has(zone) && zone !== freeZone),
    },
  };
}
