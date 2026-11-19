export const ARMOR_EXE_CARD_ID = '07180418' as const;

export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 'even' | 'odd';
export type FieldZone = 'monster' | 'backrow' | 'field';

export type ArmorExeFieldCard = Readonly<{
  uid: string;
  cardId: string;
  physicalOwnerSeat: DuelSeat;
  controllerSeat: DuelSeat;
  zone: FieldZone;
  zoneSlot?: 0 | 1 | 2;
  faceUp: boolean;
  spellCounters: number;
  lastSummonedTurn?: number;
  lastSummonKind?: 'normal' | 'flip' | 'special';
}>;

export type StandbyPhaseSnapshot = Readonly<{
  eventId: string;
  turn: number;
  activeSeat: DuelSeat;
  phase: 'standby';
  sourcePresentAtPhaseStart: boolean;
}>;

export type ArmorExeNoopReason =
  | 'wrong-source'
  | 'source-not-on-monster-field'
  | 'source-face-down'
  | 'source-not-present-at-phase-start'
  | 'duplicate-standby-phase';

export type ArmorExeUpkeepPlan =
  | Readonly<{ action: 'none'; reason: ArmorExeNoopReason; phaseEventId: string }>
  | Readonly<{
      action: 'destroy';
      phaseEventId: string;
      sourceUid: string;
      sourcePhysicalOwnerSeat: DuelSeat;
      controllerTeam: DuelTeam;
      reason: 'no-team-spell-counters';
    }>
  | Readonly<{
      action: 'remove-counter';
      phaseEventId: string;
      sourceUid: string;
      sourcePhysicalOwnerSeat: DuelSeat;
      controllerTeam: DuelTeam;
      eligibleCounterUids: readonly string[];
    }>;

export type ArmorExeResolution =
  | Readonly<{ resolved: false; reason: 'stale-plan' | ArmorExeNoopReason }>
  | Readonly<{
      resolved: true;
      action: 'destroy';
      sourceUid: string;
      sourcePhysicalOwnerSeat: DuelSeat;
      controllerTeam: DuelTeam;
      phaseEventId: string;
    }>
  | Readonly<{
      resolved: true;
      action: 'remove-counter';
      sourceUid: string;
      sourcePhysicalOwnerSeat: DuelSeat;
      counterUid: string;
      counterPhysicalOwnerSeat: DuelSeat;
      counterControllerSeat: DuelSeat;
      remainingCountersOnSelectedCard: number;
      controllerTeam: DuelTeam;
      phaseEventId: string;
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

export function teamOfArmorExeSeat(seat: DuelSeat): DuelTeam {
  requireSeat(seat, 'seat');
  return seat % 2 === 0 ? 'even' : 'odd';
}

function validateFieldCard(card: ArmorExeFieldCard): void {
  if (!card || typeof card !== 'object') throw new TypeError('Invalid field card.');
  requireText(card.uid, 'physical UID');
  requireText(card.cardId, 'card ID');
  requireSeat(card.physicalOwnerSeat, 'physical owner');
  requireSeat(card.controllerSeat, 'controller');
  if (!['monster', 'backrow', 'field'].includes(card.zone)) throw new TypeError('Invalid field zone.');
  if (card.zone === 'field') {
    if (card.zoneSlot !== undefined) throw new TypeError('Field Zone cards do not use a numbered slot.');
  } else if (card.zoneSlot !== 0 && card.zoneSlot !== 1 && card.zoneSlot !== 2) {
    throw new TypeError('Card must occupy one of the three shared zones.');
  }
  if (typeof card.faceUp !== 'boolean') throw new TypeError('Invalid face-up state.');
  if (!Number.isSafeInteger(card.spellCounters) || card.spellCounters < 0 || card.spellCounters > 999) {
    throw new TypeError('Invalid Spell Counter count.');
  }
  if (card.lastSummonedTurn !== undefined && (!Number.isSafeInteger(card.lastSummonedTurn) || card.lastSummonedTurn < 1)) {
    throw new TypeError('Invalid last-summoned turn.');
  }
  if (card.lastSummonKind !== undefined && !['normal', 'flip', 'special'].includes(card.lastSummonKind)) {
    throw new TypeError('Invalid summon kind.');
  }
}

/** Validates both teams' shared 3 Monster + 3 backrow slots and Field Zone. */
export function validateArmorExeField(field: readonly ArmorExeFieldCard[]): void {
  if (!Array.isArray(field) || field.length > 14) throw new TypeError('Invalid shared field.');
  const uids = new Set<string>();
  const slots = new Set<string>();
  const fieldZones = new Set<DuelTeam>();
  for (const card of field) {
    validateFieldCard(card);
    if (uids.has(card.uid)) throw new TypeError('Duplicate physical UID on shared field.');
    uids.add(card.uid);
    const team = teamOfArmorExeSeat(card.controllerSeat);
    if (card.zone === 'field') {
      if (fieldZones.has(team)) throw new TypeError('A team may control only one Field Zone card.');
      fieldZones.add(team);
      continue;
    }
    const key = `${team}:${card.zone}:${card.zoneSlot}`;
    if (slots.has(key)) throw new TypeError('A shared field slot is occupied more than once.');
    slots.add(key);
  }
}

function validatePhase(phase: StandbyPhaseSnapshot): void {
  if (!phase || typeof phase !== 'object') throw new TypeError('Invalid Standby Phase snapshot.');
  requireText(phase.eventId, 'Standby Phase event ID');
  if (!Number.isSafeInteger(phase.turn) || phase.turn < 1) throw new TypeError('Invalid Standby Phase turn.');
  requireSeat(phase.activeSeat, 'Standby Phase active seat');
  if (phase.phase !== 'standby') throw new TypeError('Armor Exe upkeep only runs in a Standby Phase.');
  if (typeof phase.sourcePresentAtPhaseStart !== 'boolean') throw new TypeError('Invalid source-at-phase-start snapshot.');
}

function validateLedger(ids: readonly string[]): void {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || id.length === 0 || id.length > 128)) {
    throw new TypeError('Invalid processed Standby Phase ledger.');
  }
  if (new Set(ids).size !== ids.length) throw new TypeError('Duplicate processed Standby Phase ID.');
}

function findSource(sourceUid: string, field: readonly ArmorExeFieldCard[]): ArmorExeFieldCard | undefined {
  requireText(sourceUid, 'Armor Exe UID');
  return field.find(card => card.uid === sourceUid);
}

/**
 * Armor Exe pays one Spell Counter from its current controller team's shared
 * field in every Standby Phase (both teams' turns). If none is available, it
 * must be destroyed. The snapshot prevents a copy summoned mid-phase from
 * receiving an upkeep retroactively.
 */
export function prepareArmorExeStandbyUpkeep(
  sourceUid: string,
  field: readonly ArmorExeFieldCard[],
  phase: StandbyPhaseSnapshot,
  processedPhaseIds: readonly string[] = [],
): ArmorExeUpkeepPlan {
  validateArmorExeField(field);
  validatePhase(phase);
  validateLedger(processedPhaseIds);
  const none = (reason: ArmorExeNoopReason): ArmorExeUpkeepPlan => ({
    action: 'none', reason, phaseEventId: phase.eventId,
  });
  if (processedPhaseIds.includes(phase.eventId)) return none('duplicate-standby-phase');
  const source = findSource(sourceUid, field);
  if (!source || source.cardId !== ARMOR_EXE_CARD_ID) return none('wrong-source');
  if (source.zone !== 'monster') return none('source-not-on-monster-field');
  if (!source.faceUp) return none('source-face-down');
  if (!phase.sourcePresentAtPhaseStart) return none('source-not-present-at-phase-start');

  const controllerTeam = teamOfArmorExeSeat(source.controllerSeat);
  const eligibleCounterUids = field
    .filter(card =>
      card.faceUp &&
      card.spellCounters > 0 &&
      teamOfArmorExeSeat(card.controllerSeat) === controllerTeam,
    )
    .map(card => card.uid)
    .sort();

  if (eligibleCounterUids.length === 0) {
    return {
      action: 'destroy',
      phaseEventId: phase.eventId,
      sourceUid: source.uid,
      sourcePhysicalOwnerSeat: source.physicalOwnerSeat,
      controllerTeam,
      reason: 'no-team-spell-counters',
    };
  }

  return {
    action: 'remove-counter',
    phaseEventId: phase.eventId,
    sourceUid: source.uid,
    sourcePhysicalOwnerSeat: source.physicalOwnerSeat,
    controllerTeam,
    eligibleCounterUids,
  };
}

/** Revalidates the phase, source, current controller team and selected counter. */
export function resolveArmorExeStandbyUpkeep(
  sourceUid: string,
  field: readonly ArmorExeFieldCard[],
  phase: StandbyPhaseSnapshot,
  plan: ArmorExeUpkeepPlan,
  selectedCounterUid?: string,
): ArmorExeResolution {
  const current = prepareArmorExeStandbyUpkeep(sourceUid, field, phase);
  if (current.action === 'none') return { resolved: false, reason: current.reason };
  if (plan.action === 'none') return { resolved: false, reason: 'stale-plan' };
  if (
    plan.phaseEventId !== phase.eventId ||
    plan.sourceUid !== sourceUid ||
    plan.controllerTeam !== current.controllerTeam
  ) {
    return { resolved: false, reason: 'stale-plan' };
  }
  const source = findSource(sourceUid, field);
  if (!source) return { resolved: false, reason: 'stale-plan' };

  if (current.action === 'destroy') {
    return {
      resolved: true,
      action: 'destroy',
      sourceUid: source.uid,
      sourcePhysicalOwnerSeat: source.physicalOwnerSeat,
      controllerTeam: current.controllerTeam,
      phaseEventId: phase.eventId,
    };
  }
  if (plan.action !== 'remove-counter' || !selectedCounterUid ||
      !plan.eligibleCounterUids.includes(selectedCounterUid) ||
      !current.eligibleCounterUids.includes(selectedCounterUid)) {
    return { resolved: false, reason: 'stale-plan' };
  }
  const counter = field.find(card => card.uid === selectedCounterUid);
  if (!counter || !counter.faceUp || counter.spellCounters < 1 ||
      teamOfArmorExeSeat(counter.controllerSeat) !== current.controllerTeam) {
    return { resolved: false, reason: 'stale-plan' };
  }

  return {
    resolved: true,
    action: 'remove-counter',
    sourceUid: source.uid,
    sourcePhysicalOwnerSeat: source.physicalOwnerSeat,
    counterUid: counter.uid,
    counterPhysicalOwnerSeat: counter.physicalOwnerSeat,
    counterControllerSeat: counter.controllerSeat,
    remainingCountersOnSelectedCard: counter.spellCounters - 1,
    controllerTeam: current.controllerTeam,
    phaseEventId: phase.eventId,
  };
}

/** Returns a new idempotency ledger; callers persist it with the phase result. */
export function recordArmorExeStandbyPhase(
  processedPhaseIds: readonly string[],
  eventId: string,
): readonly string[] {
  validateLedger(processedPhaseIds);
  requireText(eventId, 'Standby Phase event ID');
  if (processedPhaseIds.includes(eventId)) return processedPhaseIds;
  if (processedPhaseIds.length >= 4096) throw new RangeError('Armor Exe Standby Phase ledger limit exceeded.');
  return [...processedPhaseIds, eventId];
}

/** The summon-turn restriction applies after Normal, Flip, or Special Summon. */
export function armorExeCanAttack(source: ArmorExeFieldCard, currentTurn: number): boolean {
  validateFieldCard(source);
  if (source.cardId !== ARMOR_EXE_CARD_ID) throw new TypeError('Wrong Armor Exe source.');
  if (!Number.isSafeInteger(currentTurn) || currentTurn < 1) throw new TypeError('Invalid current turn.');
  return source.zone === 'monster' && source.faceUp && source.lastSummonedTurn !== currentTurn;
}
