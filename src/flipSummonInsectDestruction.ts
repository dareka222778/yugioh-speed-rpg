export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 0 | 1;
export type MonsterPosition = 'face-up-attack' | 'face-up-defense' | 'face-down-defense';
export type SpellTrapPosition = 'face-up' | 'face-down';
export type SwarmCardId = '15383415' | '41872150';

export const SWARM_INSECT_CARDS = {
  scarabs: {
    id: '15383415',
    konamiCardDatabaseId: 5418,
    name: 'Swarm of Scarabs',
    flipSummonTargetZone: 'monster',
  },
  locusts: {
    id: '41872150',
    konamiCardDatabaseId: 5419,
    name: 'Swarm of Locusts',
    flipSummonTargetZone: 'spell-trap-or-field',
  },
} as const;

export interface MonsterFieldCard {
  uid: string;
  id: string;
  physicalOwnerSeat: DuelSeat;
  controllerTeam: DuelTeam;
  zone: 'monster';
  zoneIndex: 0 | 1 | 2;
  position: MonsterPosition;
  destructionProtected?: boolean;
}

export interface SpellTrapFieldCard {
  uid: string;
  id: string;
  physicalOwnerSeat: DuelSeat;
  controllerTeam: DuelTeam;
  zone: 'spell-trap';
  zoneIndex: 0 | 1 | 2;
  position: SpellTrapPosition;
  destructionProtected?: boolean;
}

export interface FieldZoneCard {
  uid: string;
  id: string;
  physicalOwnerSeat: DuelSeat;
  controllerTeam: DuelTeam;
  zone: 'field';
  zoneIndex: null;
  position: SpellTrapPosition;
  destructionProtected?: boolean;
}

export type DuelFieldCard = MonsterFieldCard | SpellTrapFieldCard | FieldZoneCard;

export interface FlipSummonEvent {
  uid: string;
  id: SwarmCardId;
  physicalOwnerSeat: DuelSeat;
  controllerTeam: DuelTeam;
  zone: 'monster';
  zoneIndex: 0 | 1 | 2;
  position: 'face-up-attack';
  wasFaceDownBefore: true;
  summonMethod: 'flip-summon';
  summonedTurn: number;
}

export interface FlipSummonDestructionPlan {
  sourceUid: string;
  sourceCardId: SwarmCardId;
  sourcePhysicalOwnerSeat: DuelSeat;
  controllerTeam: DuelTeam;
  resolverSeat: DuelSeat;
  triggerTurn: number;
  targetZone: 'monster' | 'spell-trap-or-field';
}

export interface DestroyedFieldCard {
  uid: string;
  id: string;
  physicalOwnerSeat: DuelSeat;
  destinationGraveyardTeam: DuelTeam;
  fromControllerTeam: DuelTeam;
  fromZone: DuelFieldCard['zone'];
  fromZoneIndex: 0 | 1 | 2 | null;
  wasFaceUpAtResolution: boolean;
}

export interface FlipSummonDestructionResolution {
  sourceCardId: SwarmCardId;
  attemptedUid: string | null;
  protectedUid: string | null;
  destroyed: DestroyedFieldCard | null;
  releasedZone: { team: DuelTeam; zone: DuelFieldCard['zone']; zoneIndex: 0 | 1 | 2 | null } | null;
}

export interface SelfSetPlan {
  sourceUid: string;
  sourceCardId: SwarmCardId;
  sourcePhysicalOwnerSeat: DuelSeat;
  controllerTeam: DuelTeam;
  resolverSeat: DuelSeat;
  turn: number;
  lastSelfSetTurn: number | null;
}

export interface SelfSetResolution {
  sourceUid: string;
  changed: boolean;
  nextPosition: 'face-down-defense' | null;
  consumedTurn: number | null;
  reason: 'set-face-down' | 'source-left-field' | 'source-not-face-up';
}

export type RuleResult<T> = { ok: true; value: T } | { ok: false; reason: string };
export type SwarmViewer = DuelSeat | 'public';

export interface SwarmTargetOption {
  label: string;
  cardId?: string;
  zone: DuelFieldCard['zone'];
  controllerTeam: DuelTeam;
  zoneIndex: 0 | 1 | 2 | null;
}

export interface SwarmDestructionProjection {
  sourceCardId: SwarmCardId;
  destroyedCount: number;
  cardId?: string;
  destinationGraveyardTeam?: DuelTeam;
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

function validIndex(value: unknown): value is 0 | 1 | 2 {
  return value === 0 || value === 1 || value === 2;
}

function validMonsterPosition(value: unknown): value is MonsterPosition {
  return value === 'face-up-attack' || value === 'face-up-defense' || value === 'face-down-defense';
}

function validSpellTrapPosition(value: unknown): value is SpellTrapPosition {
  return value === 'face-up' || value === 'face-down';
}

export function teamOfSeat(seat: number): DuelTeam | undefined {
  if (!validSeat(seat)) return undefined;
  return (seat % 2) as DuelTeam;
}

function cardRule(id: string) {
  if (id === SWARM_INSECT_CARDS.scarabs.id) return SWARM_INSECT_CARDS.scarabs;
  if (id === SWARM_INSECT_CARDS.locusts.id) return SWARM_INSECT_CARDS.locusts;
  return undefined;
}

function validateFieldSnapshot(cards: readonly DuelFieldCard[]): string | undefined {
  if (!Array.isArray(cards) || cards.length > 14) return 'invalid-shared-field-size';
  const seenUids = new Set<string>();
  const seenSlots = new Set<string>();
  for (const card of cards) {
    if (!card || !validUid(card.uid)) return 'invalid-field-card-uid';
    if (!validCardId(card.id)) return 'invalid-field-card-id';
    if (!validSeat(card.physicalOwnerSeat)) return 'invalid-field-card-physical-owner';
    if (!validTeam(card.controllerTeam)) return 'invalid-field-card-controller-team';
    if (card.destructionProtected !== undefined && typeof card.destructionProtected !== 'boolean') return 'invalid-destruction-protection-state';
    let slot: string;
    if (card.zone === 'monster') {
      if (!validIndex(card.zoneIndex) || !validMonsterPosition(card.position)) return 'invalid-monster-zone-card-state';
      slot = card.controllerTeam + ':monster:' + card.zoneIndex;
    } else if (card.zone === 'spell-trap') {
      if (!validIndex(card.zoneIndex) || !validSpellTrapPosition(card.position)) return 'invalid-spell-trap-zone-card-state';
      slot = card.controllerTeam + ':spell-trap:' + card.zoneIndex;
    } else if (card.zone === 'field') {
      if (card.zoneIndex !== null || !validSpellTrapPosition(card.position)) return 'invalid-field-zone-card-state';
      slot = card.controllerTeam + ':field';
    } else {
      return 'invalid-field-zone-kind';
    }
    if (seenUids.has(card.uid)) return 'duplicate-physical-uid-on-field';
    seenUids.add(card.uid);
    if (seenSlots.has(slot)) return 'duplicate-shared-zone-occupancy';
    seenSlots.add(slot);
  }
  return undefined;
}

function targetZoneMatches(card: DuelFieldCard, targetZone: FlipSummonDestructionPlan['targetZone']): boolean {
  if (targetZone === 'monster') return card.zone === 'monster';
  return card.zone === 'spell-trap' || card.zone === 'field';
}

/** Only a true Flip Summon triggers the targeted destruction effect; other flip events do not. */
export function planSwarmFlipSummonDestruction(input: {
  source: FlipSummonEvent;
  currentTurn: number;
  resolverSeat: number;
}): RuleResult<FlipSummonDestructionPlan> {
  const { source, currentTurn, resolverSeat } = input;
  if (!source || !validUid(source.uid)) return fail('invalid-flip-summon-source-uid');
  if (!validCardId(source.id)) return fail('invalid-flip-summon-source-card-id');
  const rule = cardRule(source.id);
  if (!rule) return fail('unsupported-swarm-card');
  if (!validSeat(source.physicalOwnerSeat)) return fail('invalid-source-physical-owner');
  if (!validTeam(source.controllerTeam)) return fail('invalid-source-controller-team');
  if (source.zone !== 'monster' || !validIndex(source.zoneIndex) || source.position !== 'face-up-attack') return fail('flip-summon-source-not-face-up-monster');
  if (source.wasFaceDownBefore !== true || source.summonMethod !== 'flip-summon') return fail('source-was-not-flip-summoned');
  if (!Number.isInteger(currentTurn) || currentTurn < 0 || !Number.isInteger(source.summonedTurn) || source.summonedTurn !== currentTurn) return fail('flip-summon-turn-mismatch');
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
      targetZone: rule.flipSummonTargetZone,
    },
  };
}

function validateDestructionPlan(plan: FlipSummonDestructionPlan): string | undefined {
  if (!plan || !validUid(plan.sourceUid) || !validCardId(plan.sourceCardId)) return 'invalid-flip-summon-plan';
  const rule = cardRule(plan.sourceCardId);
  if (!rule || plan.targetZone !== rule.flipSummonTargetZone) return 'tampered-flip-summon-plan';
  if (!validSeat(plan.sourcePhysicalOwnerSeat) || !validTeam(plan.controllerTeam)) return 'invalid-flip-summon-source-ownership';
  if (!validSeat(plan.resolverSeat) || teamOfSeat(plan.resolverSeat) !== plan.controllerTeam) return 'invalid-flip-summon-resolver-seat';
  if (!Number.isInteger(plan.triggerTurn) || plan.triggerTurn < 0) return 'invalid-flip-summon-trigger-turn';
  return undefined;
}

function destroyedRecord(card: DuelFieldCard): DestroyedFieldCard {
  return {
    uid: card.uid,
    id: card.id,
    physicalOwnerSeat: card.physicalOwnerSeat,
    destinationGraveyardTeam: teamOfSeat(card.physicalOwnerSeat) as DuelTeam,
    fromControllerTeam: card.controllerTeam,
    fromZone: card.zone,
    fromZoneIndex: card.zoneIndex,
    wasFaceUpAtResolution: card.zone === 'monster'
      ? card.position !== 'face-down-defense'
      : card.position === 'face-up',
  };
}

/** Resolves the Flip Summon target; the target is fixed at activation and may leave before resolution. */
export function resolveSwarmFlipSummonDestruction(input: {
  plan: FlipSummonDestructionPlan;
  currentTurn: number;
  fieldAtActivation: readonly DuelFieldCard[];
  fieldAtResolution: readonly DuelFieldCard[];
  selectedUid: string;
}): RuleResult<FlipSummonDestructionResolution> {
  const { plan, currentTurn, fieldAtActivation, fieldAtResolution, selectedUid } = input;
  const planError = validateDestructionPlan(plan);
  if (planError) return fail(planError);
  if (!Number.isInteger(currentTurn) || currentTurn !== plan.triggerTurn) return fail('flip-summon-resolution-turn-mismatch');
  const activationError = validateFieldSnapshot(fieldAtActivation);
  if (activationError) return fail('activation-' + activationError);
  const resolutionError = validateFieldSnapshot(fieldAtResolution);
  if (resolutionError) return fail('resolution-' + resolutionError);
  if (!validUid(selectedUid)) return fail('invalid-selected-target-uid');

  const sourceAtActivation = fieldAtActivation.find(card => card.uid === plan.sourceUid);
  if (sourceAtActivation && (sourceAtActivation.id !== plan.sourceCardId
    || sourceAtActivation.physicalOwnerSeat !== plan.sourcePhysicalOwnerSeat
    || sourceAtActivation.controllerTeam !== plan.controllerTeam
    || sourceAtActivation.zone !== 'monster')) {
    return fail('flip-summon-source-identity-or-controller-changed');
  }

  const targetAtActivation = fieldAtActivation.find(card => card.uid === selectedUid);
  if (!targetAtActivation) return fail('target-not-on-field-at-activation');
  if (!targetZoneMatches(targetAtActivation, plan.targetZone)) return fail('target-zone-does-not-match-swarm-card');
  if (targetAtActivation.controllerTeam === plan.controllerTeam) return fail('target-not-controlled-by-opposing-team');

  const targetNow = fieldAtResolution.find(card => card.uid === selectedUid);
  if (!targetNow) {
    return {
      ok: true,
      value: { sourceCardId: plan.sourceCardId, attemptedUid: null, protectedUid: null, destroyed: null, releasedZone: null },
    };
  }
  if (targetNow.id !== targetAtActivation.id
    || targetNow.physicalOwnerSeat !== targetAtActivation.physicalOwnerSeat
    || targetNow.zone !== targetAtActivation.zone) {
    return fail('target-physical-identity-or-zone-changed');
  }
  if (targetNow.destructionProtected === true) {
    return {
      ok: true,
      value: { sourceCardId: plan.sourceCardId, attemptedUid: targetNow.uid, protectedUid: targetNow.uid, destroyed: null, releasedZone: null },
    };
  }
  const destroyed = destroyedRecord(targetNow);
  return {
    ok: true,
    value: {
      sourceCardId: plan.sourceCardId,
      attemptedUid: targetNow.uid,
      protectedUid: null,
      destroyed,
      releasedZone: { team: targetNow.controllerTeam, zone: targetNow.zone, zoneIndex: targetNow.zoneIndex },
    },
  };
}

/** Projects a selectable slot without leaking a face-down card identity or physical UID. */
export function projectSwarmTargetOption(card: DuelFieldCard, viewerSeat: SwarmViewer): SwarmTargetOption {
  const faceUp = card.zone === 'monster'
    ? card.position !== 'face-down-defense'
    : card.position === 'face-up';
  const maySeeIdentity = faceUp || viewerSeat === card.physicalOwnerSeat;
  return {
    label: maySeeIdentity ? card.id : 'Carta face-down',
    ...(maySeeIdentity ? { cardId: card.id } : {}),
    zone: card.zone,
    controllerTeam: card.controllerTeam,
    zoneIndex: card.zoneIndex,
  };
}

export function projectSwarmDestructionResult(
  resolution: FlipSummonDestructionResolution,
  _viewerSeat: SwarmViewer,
): SwarmDestructionProjection {
  return {
    sourceCardId: resolution.sourceCardId,
    destroyedCount: resolution.destroyed ? 1 : 0,
    ...(resolution.destroyed ? {
      cardId: resolution.destroyed.id,
      destinationGraveyardTeam: resolution.destroyed.destinationGraveyardTeam,
    } : {}),
  };
}

/** Plans the separate once-per-turn ignition effect that sets the Swarm monster face-down. */
export function planSwarmSelfSet(input: {
  card: MonsterFieldCard;
  currentTurn: number;
  phase: 'main1' | 'main2' | 'battle' | 'draw' | 'standby' | 'end';
  turnOwnerTeam: number;
  resolverSeat: number;
  lastSelfSetTurn: number | null;
}): RuleResult<SelfSetPlan> {
  const { card, currentTurn, phase, turnOwnerTeam, resolverSeat, lastSelfSetTurn } = input;
  if (!card || !validUid(card.uid) || !validCardId(card.id)) return fail('invalid-self-set-card');
  if (!cardRule(card.id)) return fail('unsupported-self-set-card');
  if (!validSeat(card.physicalOwnerSeat) || !validTeam(card.controllerTeam)) return fail('invalid-self-set-card-ownership');
  if (card.zone !== 'monster' || !validIndex(card.zoneIndex)) return fail('self-set-source-not-in-monster-zone');
  if (!validMonsterPosition(card.position) || card.position === 'face-down-defense') return fail('self-set-source-not-face-up');
  if (!Number.isInteger(currentTurn) || currentTurn < 0) return fail('invalid-self-set-turn');
  if (phase !== 'main1' && phase !== 'main2') return fail('self-set-only-during-main-phase');
  if (!validTeam(turnOwnerTeam) || turnOwnerTeam !== card.controllerTeam) return fail('self-set-not-controller-team-turn');
  if (!validSeat(resolverSeat) || teamOfSeat(resolverSeat) !== card.controllerTeam) return fail('self-set-resolver-not-controller-team');
  if (lastSelfSetTurn !== null && (!Number.isInteger(lastSelfSetTurn) || lastSelfSetTurn > currentTurn)) return fail('invalid-self-set-usage-ledger');
  if (lastSelfSetTurn === currentTurn) return fail('self-set-already-used-this-turn');
  return {
    ok: true,
    value: {
      sourceUid: card.uid,
      sourceCardId: card.id as SwarmCardId,
      sourcePhysicalOwnerSeat: card.physicalOwnerSeat,
      controllerTeam: card.controllerTeam,
      resolverSeat,
      turn: currentTurn,
      lastSelfSetTurn,
    },
  };
}

/** Returns an immutable position-change instruction; the caller persists the per-UID once-per-turn ledger. */
export function resolveSwarmSelfSet(input: {
  plan: SelfSetPlan;
  currentTurn: number;
  fieldAtResolution: readonly DuelFieldCard[];
}): RuleResult<SelfSetResolution> {
  const { plan, currentTurn, fieldAtResolution } = input;
  if (!plan || !validUid(plan.sourceUid) || !cardRule(plan.sourceCardId)) return fail('invalid-self-set-plan');
  if (!validSeat(plan.sourcePhysicalOwnerSeat) || !validTeam(plan.controllerTeam) || !validSeat(plan.resolverSeat)
    || teamOfSeat(plan.resolverSeat) !== plan.controllerTeam) return fail('invalid-self-set-plan-ownership');
  if (!Number.isInteger(plan.turn) || currentTurn !== plan.turn) return fail('self-set-resolution-turn-mismatch');
  if (plan.lastSelfSetTurn !== null && (!Number.isInteger(plan.lastSelfSetTurn) || plan.lastSelfSetTurn > currentTurn)) return fail('invalid-self-set-usage-ledger');
  if (plan.lastSelfSetTurn === currentTurn) return fail('self-set-already-used-this-turn');
  const fieldError = validateFieldSnapshot(fieldAtResolution);
  if (fieldError) return fail('resolution-' + fieldError);
  const sourceNow = fieldAtResolution.find(card => card.uid === plan.sourceUid);
  if (!sourceNow) {
    return { ok: true, value: { sourceUid: plan.sourceUid, changed: false, nextPosition: null, consumedTurn: currentTurn, reason: 'source-left-field' } };
  }
  if (sourceNow.id !== plan.sourceCardId || sourceNow.physicalOwnerSeat !== plan.sourcePhysicalOwnerSeat || sourceNow.zone !== 'monster') {
    return fail('self-set-source-identity-changed');
  }
  if (sourceNow.position === 'face-down-defense') {
    return { ok: true, value: { sourceUid: plan.sourceUid, changed: false, nextPosition: null, consumedTurn: currentTurn, reason: 'source-not-face-up' } };
  }
  return {
    ok: true,
    value: { sourceUid: plan.sourceUid, changed: true, nextPosition: 'face-down-defense', consumedTurn: currentTurn, reason: 'set-face-down' },
  };
}
