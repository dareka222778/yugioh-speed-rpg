export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 0 | 1;
export type RecruitPosition = 'face-up-attack' | 'face-down-defense';

export const TYPE_AND_SAME_NAME_RECRUIT_CARDS = {
  pyramidTurtle: { id: '77044671', konamiId: 5423, filter: 'zombie-def', race: 'Zombie', maximumDef: 2000 },
  troopDragon: { id: '55013285', konamiId: 5341, filter: 'same-name', race: 'Dragon' },
} as const;

export interface DestroyedSource {
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

export interface TypeRecruitPlan {
  sourceUid: string;
  sourceCardId: string;
  physicalOwnerSeat: DuelSeat;
  ownerTeam: DuelTeam;
  controllerTeamAtDestruction: DuelTeam;
  opposingTeam: DuelTeam;
  filter: 'zombie-def' | 'same-name';
  race: 'Zombie' | 'Dragon';
  maximumDef?: 2000;
  triggerTurn: number;
  allowedPositions: readonly RecruitPosition[];
}

export interface RecruitDeckMonster {
  uid: string;
  id: string;
  physicalOwnerSeat: number;
  zone: 'deck';
  kind: 'monster';
  race: string;
  def: number;
}

export interface TypeRecruitResolution {
  summoned: null | {
    uid: string;
    id: string;
    physicalOwnerSeat: DuelSeat;
    controllerTeam: DuelTeam;
    monsterZoneIndex: 0 | 1 | 2;
    position: RecruitPosition;
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
  if (id === TYPE_AND_SAME_NAME_RECRUIT_CARDS.pyramidTurtle.id) return TYPE_AND_SAME_NAME_RECRUIT_CARDS.pyramidTurtle;
  if (id === TYPE_AND_SAME_NAME_RECRUIT_CARDS.troopDragon.id) return TYPE_AND_SAME_NAME_RECRUIT_CARDS.troopDragon;
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

/** Pure battle-destruction trigger plan; the physical owner receives the effect even after control changes. */
export function planTypeAndSameNameBattleRecruit(input: {
  source: DestroyedSource;
  currentTurn: number;
}): RuleResult<TypeRecruitPlan> {
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
      filter: rule.filter,
      race: rule.race,
      ...('maximumDef' in rule ? { maximumDef: rule.maximumDef } : {}),
      triggerTurn: currentTurn,
      allowedPositions: ['face-up-attack', 'face-down-defense'],
    },
  };
}

/** One optional Special Summon from the physical owner's private Deck into a shared team Monster Zone. */
export function resolveTypeAndSameNameBattleRecruit(input: {
  plan: TypeRecruitPlan;
  ownerDeckAtResolution: readonly RecruitDeckMonster[];
  occupiedMonsterZoneIndices: readonly number[];
  selectedUid: string | null;
  selectedPosition: RecruitPosition | null;
}): RuleResult<TypeRecruitResolution> {
  const { plan, ownerDeckAtResolution, occupiedMonsterZoneIndices, selectedUid, selectedPosition } = input;
  if (!validUid(plan.sourceUid) || !Number.isInteger(plan.triggerTurn) || plan.triggerTurn < 0) return fail('invalid-plan-identity');
  const ownerTeam = teamOfSeat(plan.physicalOwnerSeat);
  if (ownerTeam === undefined || ownerTeam !== plan.ownerTeam) return fail('plan-owner-team-mismatch');
  if (!validTeam(plan.controllerTeamAtDestruction)) return fail('invalid-controller-team');
  if (plan.opposingTeam !== (plan.ownerTeam === 0 ? 1 : 0)) return fail('invalid-opposing-team');
  const rule = cardRule(plan.sourceCardId);
  if (!rule || rule.filter !== plan.filter || rule.race !== plan.race
    || ('maximumDef' in rule ? rule.maximumDef !== plan.maximumDef : plan.maximumDef !== undefined)
    || plan.allowedPositions.length !== 2 || !plan.allowedPositions.includes('face-up-attack') || !plan.allowedPositions.includes('face-down-defense')) {
    return fail('plan-does-not-match-registered-card-rule');
  }
  if (!Array.isArray(ownerDeckAtResolution) || ownerDeckAtResolution.length > 30) return fail('invalid-owner-deck-size');
  if (!Array.isArray(occupiedMonsterZoneIndices)) return fail('invalid-occupied-monster-zones');
  const occupied = new Set<number>();
  for (const zone of occupiedMonsterZoneIndices) {
    if (!Number.isInteger(zone) || zone < 0 || zone > 2 || occupied.has(zone)) return fail('invalid-occupied-monster-zones');
    occupied.add(zone);
  }
  for (const card of ownerDeckAtResolution) {
    if (!validUid(card.uid) || typeof card.id !== 'string' || card.id.trim().length === 0 || card.zone !== 'deck' || card.kind !== 'monster'
      || typeof card.race !== 'string' || !Number.isSafeInteger(card.def) || card.def < 0) return fail('invalid-owner-deck-card');
    if (card.physicalOwnerSeat !== plan.physicalOwnerSeat) return fail('deck-card-not-in-physical-owners-private-deck');
  }
  if (!uniqueUids([{ uid: plan.sourceUid }, ...ownerDeckAtResolution])) return fail('duplicate-physical-uid-across-graveyard-and-deck');
  if (selectedUid === null) {
    if (selectedPosition !== null) return fail('position-without-selected-card');
    return { ok: true, value: { summoned: null, remainingMonsterZoneIndices: ([0, 1, 2] as const).filter(zone => !occupied.has(zone)) } };
  }
  if (!validUid(selectedUid)) return fail('invalid-selected-uid');
  if (selectedPosition === null || !plan.allowedPositions.includes(selectedPosition)) return fail('invalid-summon-position');
  const freeZone = ([0, 1, 2] as const).find(zone => !occupied.has(zone));
  if (freeZone === undefined) return fail('no-free-shared-monster-zone');
  const selected = ownerDeckAtResolution.find(card => card.uid === selectedUid);
  if (!selected) return fail('selected-card-not-in-physical-owners-deck');
  if (plan.filter === 'same-name') {
    if (selected.id !== plan.sourceCardId) return fail('selected-card-is-not-same-name');
  } else if (selected.race !== 'Zombie' || selected.def > 2000) {
    return fail('selected-card-does-not-match-zombie-def-filter');
  }
  return {
    ok: true,
    value: {
      summoned: {
        uid: selected.uid,
        id: selected.id,
        physicalOwnerSeat: plan.physicalOwnerSeat,
        controllerTeam: plan.ownerTeam,
        monsterZoneIndex: freeZone,
        position: selectedPosition,
      },
      remainingMonsterZoneIndices: ([0, 1, 2] as const).filter(zone => !occupied.has(zone) && zone !== freeZone),
    },
  };
}
