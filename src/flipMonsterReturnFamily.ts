export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 0 | 1;
export type MonsterPosition = 'face-up-attack' | 'face-up-defense' | 'face-down-defense';
export type FlipReturnSelectionMode = 'targeted-at-activation' | 'non-targeting-at-resolution';

export const FLIP_MONSTER_RETURN_CARDS = {
  penguinSoldier: {
    id: '93920745',
    konamiCardDatabaseId: 4608,
    name: 'Penguin Soldier',
    selectionMode: 'targeted-at-activation',
    maxTargets: 2,
  },
  hadeHane: {
    id: '28357177',
    konamiCardDatabaseId: 6124,
    name: 'Hade-Hane',
    selectionMode: 'non-targeting-at-resolution',
    maxTargets: 3,
  },
} as const;

export interface FieldMonster {
  uid: string;
  id: string;
  physicalOwnerSeat: DuelSeat;
  controllerTeam: DuelTeam;
  zone: 'monster';
  monsterZoneIndex: 0 | 1 | 2;
  position: MonsterPosition;
}

export interface FlipSourceEvent extends FieldMonster {
  wasFaceDownAtFlip: boolean;
  flippedTurn: number;
}

export interface FlipReturnPlan {
  sourceUid: string;
  sourceCardId: string;
  sourcePhysicalOwnerSeat: DuelSeat;
  controllerTeam: DuelTeam;
  resolverSeat: DuelSeat;
  triggerTurn: number;
  selectionMode: FlipReturnSelectionMode;
  maxTargets: 2 | 3;
}

export interface ReturnedMonster {
  uid: string;
  id: string;
  physicalOwnerSeat: DuelSeat;
  fromControllerTeam: DuelTeam;
  fromMonsterZoneIndex: 0 | 1 | 2;
  wasFaceUpAtResolution: boolean;
}

export interface FlipReturnResolution {
  sourceCardId: string;
  selectionMode: FlipReturnSelectionMode;
  returned: ReturnedMonster[];
  releasedMonsterZones: Array<{ team: DuelTeam; zoneIndex: 0 | 1 | 2 }>;
}

export type RuleResult<T> = { ok: true; value: T } | { ok: false; reason: string };
export type FlipReturnViewer = DuelSeat | 'public';

export interface FlipReturnProjection {
  sourceCardId: string;
  returnedCount: number;
  cards: Array<{
    label: string;
    cardId?: string;
    destination: 'your-hand' | 'owners-hand';
  }>;
}

function fail<T>(reason: string): RuleResult<T> {
  return { ok: false, reason };
}

function validUid(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validCardId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{8}$/.test(value);
}

function validSeat(value: unknown): value is DuelSeat {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;
}

function validTeam(value: unknown): value is DuelTeam {
  return value === 0 || value === 1;
}

function validZoneIndex(value: unknown): value is 0 | 1 | 2 {
  return value === 0 || value === 1 || value === 2;
}

function validPosition(value: unknown): value is MonsterPosition {
  return value === 'face-up-attack' || value === 'face-up-defense' || value === 'face-down-defense';
}

function getCardRule(id: string) {
  if (id === FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id) return FLIP_MONSTER_RETURN_CARDS.penguinSoldier;
  if (id === FLIP_MONSTER_RETURN_CARDS.hadeHane.id) return FLIP_MONSTER_RETURN_CARDS.hadeHane;
  return undefined;
}

export function teamOfSeat(seat: number): DuelTeam | undefined {
  if (!validSeat(seat)) return undefined;
  return (seat % 2) as DuelTeam;
}

function validateFieldSnapshot(cards: readonly FieldMonster[]): string | undefined {
  if (!Array.isArray(cards) || cards.length > 6) return 'invalid-shared-monster-field-size';
  const seenUids = new Set<string>();
  const seenSlots = new Set<string>();
  for (const card of cards) {
    if (!card || !validUid(card.uid)) return 'invalid-field-monster-uid';
    if (!validCardId(card.id)) return 'invalid-field-monster-card-id';
    if (!validSeat(card.physicalOwnerSeat)) return 'invalid-field-monster-physical-owner';
    if (!validTeam(card.controllerTeam)) return 'invalid-field-monster-controller-team';
    if (card.zone !== 'monster') return 'target-is-not-in-monster-zone';
    if (!validZoneIndex(card.monsterZoneIndex)) return 'invalid-shared-monster-zone-index';
    if (!validPosition(card.position)) return 'invalid-monster-position';
    if (seenUids.has(card.uid)) return 'duplicate-physical-uid-on-field';
    seenUids.add(card.uid);
    const slot = card.controllerTeam + ':' + card.monsterZoneIndex;
    if (seenSlots.has(slot)) return 'duplicate-shared-monster-zone-occupancy';
    seenSlots.add(slot);
  }
  return undefined;
}

/** Plans a FLIP trigger. The resolver must belong to the team controlling the source at the flip event. */
export function planFlipMonsterReturn(input: {
  source: FlipSourceEvent;
  currentTurn: number;
  resolverSeat: number;
}): RuleResult<FlipReturnPlan> {
  const { source, currentTurn, resolverSeat } = input;
  if (!source || !validUid(source.uid)) return fail('invalid-flip-source-uid');
  if (!validCardId(source.id)) return fail('invalid-flip-source-card-id');
  const rule = getCardRule(source.id);
  if (!rule) return fail('unsupported-flip-return-card');
  if (!validSeat(source.physicalOwnerSeat)) return fail('invalid-flip-source-physical-owner');
  if (!validTeam(source.controllerTeam)) return fail('invalid-flip-source-controller-team');
  if (source.zone !== 'monster' || !validZoneIndex(source.monsterZoneIndex)) return fail('flip-source-not-in-shared-monster-zone');
  if (!validPosition(source.position) || source.position === 'face-down-defense') return fail('flip-source-not-face-up-after-flip');
  if (source.wasFaceDownAtFlip !== true) return fail('source-was-not-flipped-from-face-down');
  if (!Number.isInteger(currentTurn) || currentTurn < 0 || !Number.isInteger(source.flippedTurn) || source.flippedTurn < 0) return fail('invalid-flip-turn');
  if (source.flippedTurn !== currentTurn) return fail('flip-trigger-from-different-turn');
  if (!validSeat(resolverSeat)) return fail('invalid-resolver-seat');
  if (teamOfSeat(resolverSeat) !== source.controllerTeam) return fail('resolver-not-on-source-controller-team');
  return {
    ok: true,
    value: {
      sourceUid: source.uid,
      sourceCardId: rule.id,
      sourcePhysicalOwnerSeat: source.physicalOwnerSeat,
      controllerTeam: source.controllerTeam,
      resolverSeat,
      triggerTurn: currentTurn,
      selectionMode: rule.selectionMode,
      maxTargets: rule.maxTargets,
    },
  };
}

function validatePlan(plan: FlipReturnPlan): string | undefined {
  if (!plan || !validUid(plan.sourceUid)) return 'invalid-plan-source-uid';
  if (!validCardId(plan.sourceCardId)) return 'invalid-plan-source-card-id';
  const rule = getCardRule(plan.sourceCardId);
  if (!rule) return 'unsupported-plan-source-card';
  if (!validSeat(plan.sourcePhysicalOwnerSeat)) return 'invalid-plan-source-owner';
  if (!validTeam(plan.controllerTeam)) return 'invalid-plan-controller-team';
  if (!validSeat(plan.resolverSeat) || teamOfSeat(plan.resolverSeat) !== plan.controllerTeam) return 'invalid-plan-resolver-seat';
  if (!Number.isInteger(plan.triggerTurn) || plan.triggerTurn < 0) return 'invalid-plan-trigger-turn';
  if (plan.selectionMode !== rule.selectionMode || plan.maxTargets !== rule.maxTargets) return 'tampered-flip-return-plan';
  return undefined;
}

/**
 * Resolves the return operation without mutating either snapshot.
 * Penguin Soldier locks targets at activation; Hade-Hane chooses monsters at resolution.
 * Every returned card goes to its physical owner's private hand, not its current controller's hand.
 */
export function resolveFlipMonsterReturn(input: {
  plan: FlipReturnPlan;
  currentTurn: number;
  fieldAtActivation: readonly FieldMonster[];
  fieldAtResolution: readonly FieldMonster[];
  selectedUids: readonly string[];
}): RuleResult<FlipReturnResolution> {
  const { plan, currentTurn, fieldAtActivation, fieldAtResolution, selectedUids } = input;
  const planError = validatePlan(plan);
  if (planError) return fail(planError);
  if (!Number.isInteger(currentTurn) || currentTurn < 0 || currentTurn !== plan.triggerTurn) return fail('flip-return-resolution-turn-mismatch');
  const activationError = validateFieldSnapshot(fieldAtActivation);
  if (activationError) return fail('activation-' + activationError);
  const resolutionError = validateFieldSnapshot(fieldAtResolution);
  if (resolutionError) return fail('resolution-' + resolutionError);
  if (!Array.isArray(selectedUids)) return fail('invalid-selected-uid-list');
  if (selectedUids.length > plan.maxTargets) return fail('too-many-selected-monsters');

  const selectedSet = new Set<string>();
  for (const uid of selectedUids) {
    if (!validUid(uid)) return fail('invalid-selected-monster-uid');
    if (selectedSet.has(uid)) return fail('duplicate-selected-monster-uid');
    selectedSet.add(uid);
  }

  const sourceAtActivation = fieldAtActivation.find(card => card.uid === plan.sourceUid);
  if (!sourceAtActivation) return fail('flip-source-missing-from-activation-field');
  if (sourceAtActivation.id !== plan.sourceCardId
    || sourceAtActivation.physicalOwnerSeat !== plan.sourcePhysicalOwnerSeat
    || sourceAtActivation.controllerTeam !== plan.controllerTeam
    || sourceAtActivation.position === 'face-down-defense') {
    return fail('flip-source-identity-or-controller-changed');
  }

  const currentByUid = new Map<string, FieldMonster>(fieldAtResolution.map(card => [card.uid, card] as const));
  const returned: ReturnedMonster[] = [];

  if (plan.selectionMode === 'targeted-at-activation') {
    const activationByUid = new Map<string, FieldMonster>(fieldAtActivation.map(card => [card.uid, card] as const));
    for (const uid of selectedUids) {
      const targetAtActivation = activationByUid.get(uid);
      if (!targetAtActivation) return fail('target-not-on-field-at-activation');
      const targetNow = currentByUid.get(uid);
      if (!targetNow) continue;
      if (targetNow.id !== targetAtActivation.id || targetNow.physicalOwnerSeat !== targetAtActivation.physicalOwnerSeat) {
        return fail('target-physical-identity-changed');
      }
      returned.push({
        uid: targetNow.uid,
        id: targetNow.id,
        physicalOwnerSeat: targetNow.physicalOwnerSeat,
        fromControllerTeam: targetNow.controllerTeam,
        fromMonsterZoneIndex: targetNow.monsterZoneIndex,
        wasFaceUpAtResolution: targetNow.position !== 'face-down-defense',
      });
    }
  } else {
    for (const uid of selectedUids) {
      const targetNow = currentByUid.get(uid);
      if (!targetNow) return fail('non-targeting-selection-not-on-field-at-resolution');
      returned.push({
        uid: targetNow.uid,
        id: targetNow.id,
        physicalOwnerSeat: targetNow.physicalOwnerSeat,
        fromControllerTeam: targetNow.controllerTeam,
        fromMonsterZoneIndex: targetNow.monsterZoneIndex,
        wasFaceUpAtResolution: targetNow.position !== 'face-down-defense',
      });
    }
  }

  return {
    ok: true,
    value: {
      sourceCardId: plan.sourceCardId,
      selectionMode: plan.selectionMode,
      returned,
      releasedMonsterZones: returned.map(card => ({
        team: card.fromControllerTeam,
        zoneIndex: card.fromMonsterZoneIndex,
      })),
    },
  };
}

/** Projects returned cards without exposing physical UIDs or hidden face-down identities. */
export function projectFlipMonsterReturnForViewer(
  resolution: FlipReturnResolution,
  viewerSeat: FlipReturnViewer,
): FlipReturnProjection {
  return {
    sourceCardId: resolution.sourceCardId,
    returnedCount: resolution.returned.length,
    cards: resolution.returned.map(card => {
      const maySeeIdentity = card.wasFaceUpAtResolution || viewerSeat === card.physicalOwnerSeat;
      return {
        label: maySeeIdentity ? card.id : 'Monstro virado para baixo',
        ...(maySeeIdentity ? { cardId: card.id } : {}),
        destination: viewerSeat === card.physicalOwnerSeat ? 'your-hand' : 'owners-hand',
      };
    }),
  };
}
