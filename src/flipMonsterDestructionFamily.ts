export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 0 | 1;
export type MonsterPosition = 'face-up-attack' | 'face-up-defense' | 'face-down-defense';
export type FlipDestructionSelectionMode = 'targeted-at-activation' | 'non-targeting-at-resolution';

export const FLIP_MONSTER_DESTRUCTION_CARDS = {
  oldVindictiveMagician: {
    id: '45141844',
    konamiCardDatabaseId: 5651,
    name: 'Old Vindictive Magician',
    selectionMode: 'targeted-at-activation',
    maxTargets: 1,
  },
  fourStarredLadybug: {
    id: '83994646',
    konamiCardDatabaseId: 5139,
    name: '4-Starred Ladybug of Doom',
    selectionMode: 'non-targeting-at-resolution',
    maxTargets: 0,
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
  level: number;
  destructionProtected?: boolean;
}

export interface FlipSourceEvent extends FieldMonster {
  wasFaceDownAtFlip: boolean;
  flippedTurn: number;
}

export interface FlipDestructionPlan {
  sourceUid: string;
  sourceCardId: string;
  sourcePhysicalOwnerSeat: DuelSeat;
  controllerTeam: DuelTeam;
  resolverSeat: DuelSeat;
  triggerTurn: number;
  selectionMode: FlipDestructionSelectionMode;
  maxTargets: 0 | 1;
}

export interface DestroyedMonster {
  uid: string;
  id: string;
  physicalOwnerSeat: DuelSeat;
  destinationGraveyardTeam: DuelTeam;
  fromControllerTeam: DuelTeam;
  fromMonsterZoneIndex: 0 | 1 | 2;
  wasFaceUpAtResolution: boolean;
}

export interface FlipDestructionResolution {
  sourceCardId: string;
  selectionMode: FlipDestructionSelectionMode;
  attemptedUids: string[];
  protectedUids: string[];
  destroyed: DestroyedMonster[];
  releasedMonsterZones: Array<{ team: DuelTeam; zoneIndex: 0 | 1 | 2 }>;
}

export type RuleResult<T> = { ok: true; value: T } | { ok: false; reason: string };
export type FlipDestructionViewer = DuelSeat | 'public';

export interface FlipDestructionTargetOption {
  label: string;
  cardId?: string;
  controllerTeam: DuelTeam;
  monsterZoneIndex: 0 | 1 | 2;
}

export interface FlipDestructionProjection {
  sourceCardId: string;
  destroyedCount: number;
  cards: Array<{ cardId: string; destinationGraveyardTeam: DuelTeam }>;
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

function validLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12;
}

export function teamOfSeat(seat: number): DuelTeam | undefined {
  if (!validSeat(seat)) return undefined;
  return (seat % 2) as DuelTeam;
}

function getCardRule(id: string) {
  if (id === FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id) return FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician;
  if (id === FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id) return FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug;
  return undefined;
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
    if (!validLevel(card.level)) return 'invalid-monster-level';
    if (card.destructionProtected !== undefined && typeof card.destructionProtected !== 'boolean') return 'invalid-destruction-protection-state';
    if (seenUids.has(card.uid)) return 'duplicate-physical-uid-on-field';
    seenUids.add(card.uid);
    const slot = card.controllerTeam + ':' + card.monsterZoneIndex;
    if (seenSlots.has(slot)) return 'duplicate-shared-monster-zone-occupancy';
    seenSlots.add(slot);
  }
  return undefined;
}

/** Plans a FLIP trigger. The controller team, not the source's physical owner, resolves it. */
export function planFlipMonsterDestruction(input: {
  source: FlipSourceEvent;
  currentTurn: number;
  resolverSeat: number;
}): RuleResult<FlipDestructionPlan> {
  const { source, currentTurn, resolverSeat } = input;
  if (!source || !validUid(source.uid)) return fail('invalid-flip-source-uid');
  if (!validCardId(source.id)) return fail('invalid-flip-source-card-id');
  const rule = getCardRule(source.id);
  if (!rule) return fail('unsupported-flip-destruction-card');
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

function validatePlan(plan: FlipDestructionPlan): string | undefined {
  if (!plan || !validUid(plan.sourceUid)) return 'invalid-plan-source-uid';
  if (!validCardId(plan.sourceCardId)) return 'invalid-plan-source-card-id';
  const rule = getCardRule(plan.sourceCardId);
  if (!rule) return 'unsupported-plan-source-card';
  if (!validSeat(plan.sourcePhysicalOwnerSeat)) return 'invalid-plan-source-owner';
  if (!validTeam(plan.controllerTeam)) return 'invalid-plan-controller-team';
  if (!validSeat(plan.resolverSeat) || teamOfSeat(plan.resolverSeat) !== plan.controllerTeam) return 'invalid-plan-resolver-seat';
  if (!Number.isInteger(plan.triggerTurn) || plan.triggerTurn < 0) return 'invalid-plan-trigger-turn';
  if (plan.selectionMode !== rule.selectionMode || plan.maxTargets !== rule.maxTargets) return 'tampered-flip-destruction-plan';
  return undefined;
}

function destroyedRecord(card: FieldMonster): DestroyedMonster {
  return {
    uid: card.uid,
    id: card.id,
    physicalOwnerSeat: card.physicalOwnerSeat,
    destinationGraveyardTeam: teamOfSeat(card.physicalOwnerSeat) as DuelTeam,
    fromControllerTeam: card.controllerTeam,
    fromMonsterZoneIndex: card.monsterZoneIndex,
    wasFaceUpAtResolution: card.position !== 'face-down-defense',
  };
}

/**
 * Old Vindictive Magician locks one opposing-team monster at activation.
 * 4-Starred Ladybug of Doom selects no targets and destroys all face-up Level 4 monsters
 * currently controlled by the opposing team at resolution.
 */
export function resolveFlipMonsterDestruction(input: {
  plan: FlipDestructionPlan;
  currentTurn: number;
  fieldAtActivation: readonly FieldMonster[];
  fieldAtResolution: readonly FieldMonster[];
  selectedUids: readonly string[];
}): RuleResult<FlipDestructionResolution> {
  const { plan, currentTurn, fieldAtActivation, fieldAtResolution, selectedUids } = input;
  const planError = validatePlan(plan);
  if (planError) return fail(planError);
  if (!Number.isInteger(currentTurn) || currentTurn < 0 || currentTurn !== plan.triggerTurn) return fail('flip-destruction-resolution-turn-mismatch');
  const activationError = validateFieldSnapshot(fieldAtActivation);
  if (activationError) return fail('activation-' + activationError);
  const resolutionError = validateFieldSnapshot(fieldAtResolution);
  if (resolutionError) return fail('resolution-' + resolutionError);
  if (!Array.isArray(selectedUids)) return fail('invalid-selected-uid-list');

  const selectedSet = new Set<string>();
  for (const uid of selectedUids) {
    if (!validUid(uid)) return fail('invalid-selected-monster-uid');
    if (selectedSet.has(uid)) return fail('duplicate-selected-monster-uid');
    selectedSet.add(uid);
  }

  // A FLIP effect can still resolve after battle destruction removes its source.
  const sourceAtActivation = fieldAtActivation.find(card => card.uid === plan.sourceUid);
  if (sourceAtActivation && (sourceAtActivation.id !== plan.sourceCardId
    || sourceAtActivation.physicalOwnerSeat !== plan.sourcePhysicalOwnerSeat
    || sourceAtActivation.controllerTeam !== plan.controllerTeam
    || sourceAtActivation.position === 'face-down-defense')) {
    return fail('flip-source-identity-or-controller-changed');
  }

  const currentByUid = new Map<string, FieldMonster>(fieldAtResolution.map(card => [card.uid, card] as const));
  const attemptedUids: string[] = [];
  const protectedUids: string[] = [];
  const destroyed: DestroyedMonster[] = [];

  if (plan.selectionMode === 'targeted-at-activation') {
    if (selectedUids.length !== 1) return fail('old-vindictive-requires-exactly-one-target');
    const activationByUid = new Map<string, FieldMonster>(fieldAtActivation.map(card => [card.uid, card] as const));
    const targetAtActivation = activationByUid.get(selectedUids[0]);
    if (!targetAtActivation) return fail('target-not-on-field-at-activation');
    if (targetAtActivation.controllerTeam === plan.controllerTeam) return fail('target-not-controlled-by-opposing-team');
    const targetNow = currentByUid.get(selectedUids[0]);
    if (!targetNow) {
      return {
        ok: true,
        value: {
          sourceCardId: plan.sourceCardId,
          selectionMode: plan.selectionMode,
          attemptedUids,
          protectedUids,
          destroyed,
          releasedMonsterZones: [],
        },
      };
    }
    if (targetNow.id !== targetAtActivation.id || targetNow.physicalOwnerSeat !== targetAtActivation.physicalOwnerSeat) {
      return fail('target-physical-identity-changed');
    }
    attemptedUids.push(targetNow.uid);
    if (targetNow.destructionProtected === true) protectedUids.push(targetNow.uid);
    else destroyed.push(destroyedRecord(targetNow));
  } else {
    if (selectedUids.length !== 0) return fail('non-targeting-effect-does-not-accept-targets');
    const affected = fieldAtResolution.filter(card =>
      card.controllerTeam !== plan.controllerTeam
      && card.position !== 'face-down-defense'
      && card.level === 4
    );
    for (const card of affected) {
      attemptedUids.push(card.uid);
      if (card.destructionProtected === true) protectedUids.push(card.uid);
      else destroyed.push(destroyedRecord(card));
    }
  }

  return {
    ok: true,
    value: {
      sourceCardId: plan.sourceCardId,
      selectionMode: plan.selectionMode,
      attemptedUids,
      protectedUids,
      destroyed,
      releasedMonsterZones: destroyed.map(card => ({
        team: card.fromControllerTeam,
        zoneIndex: card.fromMonsterZoneIndex,
      })),
    },
  };
}

/** A hidden target is selectable by slot without exposing its card identity or physical UID. */
export function projectFlipDestructionTargetOption(
  monster: FieldMonster,
  viewerSeat: FlipDestructionViewer,
): FlipDestructionTargetOption {
  const maySeeIdentity = monster.position !== 'face-down-defense' || viewerSeat === monster.physicalOwnerSeat;
  return {
    label: maySeeIdentity ? monster.id : 'Monstro virado para baixo',
    ...(maySeeIdentity ? { cardId: monster.id } : {}),
    controllerTeam: monster.controllerTeam,
    monsterZoneIndex: monster.monsterZoneIndex,
  };
}

/** Destroyed cards are public in the shared Graveyard; UIDs and physical seat IDs remain internal. */
export function projectFlipDestructionResultForViewer(
  resolution: FlipDestructionResolution,
  _viewerSeat: FlipDestructionViewer,
): FlipDestructionProjection {
  return {
    sourceCardId: resolution.sourceCardId,
    destroyedCount: resolution.destroyed.length,
    cards: resolution.destroyed.map(card => ({
      cardId: card.id,
      destinationGraveyardTeam: card.destinationGraveyardTeam,
    })),
  };
}
