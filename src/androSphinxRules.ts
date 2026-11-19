export const ANDRO_SPHINX_CARD_ID = '15013468' as const;
export const PYRAMID_OF_LIGHT_CARD_ID = '53569894' as const;
export const ANDRO_SPHINX_LP_COST = 500 as const;

export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 'even' | 'odd';
export type MonsterPosition = 'attack' | 'defense';
export type FieldZone = 'monster' | 'backrow' | 'field';

export type AndroSphinxFieldCard = Readonly<{
  uid: string;
  cardId?: string;
  physicalOwnerSeat: DuelSeat;
  controllerSeat: DuelSeat;
  zone: FieldZone;
  zoneSlot?: 0 | 1 | 2;
  faceUp: boolean;
  position?: MonsterPosition;
  atk?: number;
  lastNormalOrSpecialSummonTurn?: number;
  effectNegated?: boolean;
}>;

export type AndroSphinxHandCard = Readonly<{
  uid: string;
  cardId: string;
  physicalOwnerSeat: DuelSeat;
  kind: 'monster' | 'spell' | 'trap';
  atk?: number;
}>;

export type AndroSphinxSummonPlan = Readonly<{
  sourceUid: string;
  activeSeat: DuelSeat;
  team: DuelTeam;
  pyramidUid: string;
  monsterZoneSlot: 0 | 1 | 2;
  lpCost: typeof ANDRO_SPHINX_LP_COST;
}>;

export type AndroSphinxSummonPlanResult =
  | Readonly<{ allowed: false; reason: 'source-not-in-active-hand' | 'pyramid-not-face-up-for-team' | 'insufficient-team-lp' | 'monster-zone-full' }>
  | Readonly<{ allowed: true; plan: AndroSphinxSummonPlan }>;

export type AndroSphinxSummonResolution =
  | Readonly<{ resolved: false; reason: 'stale-plan' | 'source-not-in-active-hand' | 'pyramid-not-face-up-for-team' | 'insufficient-team-lp' | 'monster-zone-full' }>
  | Readonly<{
      resolved: true;
      team: DuelTeam;
      activeSeat: DuelSeat;
      remainingTeamLP: number;
      hand: readonly AndroSphinxHandCard[];
      field: readonly AndroSphinxFieldCard[];
      summonedUid: string;
      physicalOwnerSeat: DuelSeat;
      controllerSeat: DuelSeat;
      monsterZoneSlot: 0 | 1 | 2;
      summonedTurn: number;
      position: MonsterPosition;
    }>;

export type AndroSphinxBattleEvent = Readonly<{
  eventId: string;
  sourceUid: string;
  sourceCardId: string;
  sourcePhysicalOwnerSeat: DuelSeat;
  sourceControllerSeat: DuelSeat;
  sourceEffectNegated?: boolean;
  destroyedUid: string;
  destroyedBySourceUid: string;
  destroyedPhysicalOwnerSeat: DuelSeat;
  destroyedControllerSeat: DuelSeat;
  destroyedPosition: MonsterPosition;
  destroyedMonsterAtk: number;
  result: 'destroyed' | 'survived';
  byBattle: boolean;
}>;

export type AndroSphinxBattleDamageResult =
  | Readonly<{ applied: false; reason: 'wrong-source' | 'not-battle-destruction' | 'not-defense-position' | 'not-opponent-team' | 'source-effect-negated' | 'duplicate-event' }>
  | Readonly<{
      applied: true;
      eventId: string;
      damage: number;
      damagedTeam: DuelTeam;
      sourcePhysicalOwnerSeat: DuelSeat;
      sourceControllerSeat: DuelSeat;
      destroyedPhysicalOwnerSeat: DuelSeat;
      processedEventIds: readonly string[];
    }>;

const seats: readonly DuelSeat[] = [0, 1, 2, 3];
const isSeat = (value: unknown): value is DuelSeat =>
  typeof value === 'number' && Number.isInteger(value) && seats.includes(value as DuelSeat);

function requireSeat(value: unknown, label: string): asserts value is DuelSeat {
  if (!isSeat(value)) throw new TypeError(`Invalid ${label}.`);
}

function requireId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new TypeError(`Invalid ${label}.`);
  }
}

function requireNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 1000000000) {
    throw new TypeError(`Invalid ${label}.`);
  }
}

export function teamOfAndroSphinxSeat(seat: DuelSeat): DuelTeam {
  requireSeat(seat, 'seat');
  return seat % 2 === 0 ? 'even' : 'odd';
}

function oppositeTeam(team: DuelTeam): DuelTeam {
  return team === 'even' ? 'odd' : 'even';
}

function validateField(field: readonly AndroSphinxFieldCard[]): void {
  if (!Array.isArray(field) || field.length > 14) throw new TypeError('Invalid shared field.');
  const uids = new Set<string>();
  const slots = new Set<string>();
  const fieldZones = new Set<DuelTeam>();

  for (const card of field) {
    if (!card || typeof card !== 'object') throw new TypeError('Invalid field card.');
    requireId(card.uid, 'physical UID');
    requireId(card.cardId, 'card ID');
    requireSeat(card.physicalOwnerSeat, 'physical owner');
    requireSeat(card.controllerSeat, 'controller');
    if (!['monster', 'backrow', 'field'].includes(card.zone)) throw new TypeError('Invalid field zone.');
    if (typeof card.faceUp !== 'boolean') throw new TypeError('Invalid face-up state.');
    if (card.faceUp) requireId(card.cardId, 'face-up card ID');
    else if (card.cardId !== undefined) throw new TypeError('Face-down card identity must remain hidden.');
    if (card.position !== undefined && card.position !== 'attack' && card.position !== 'defense') {
      throw new TypeError('Invalid monster position.');
    }
    if (card.atk !== undefined) requireNonNegativeInteger(card.atk, 'ATK');
    if (card.lastNormalOrSpecialSummonTurn !== undefined) {
      requireNonNegativeInteger(card.lastNormalOrSpecialSummonTurn, 'summon turn');
      if (card.lastNormalOrSpecialSummonTurn < 1) throw new TypeError('Invalid summon turn.');
    }
    if (card.effectNegated !== undefined && typeof card.effectNegated !== 'boolean') {
      throw new TypeError('Invalid effect-negation state.');
    }
    if (uids.has(card.uid)) throw new TypeError('Duplicate physical UID on shared field.');
    uids.add(card.uid);

    const team = teamOfAndroSphinxSeat(card.controllerSeat);
    if (card.zone === 'field') {
      if (card.zoneSlot !== undefined) throw new TypeError('Field Zone cards do not use a numbered slot.');
      if (fieldZones.has(team)) throw new TypeError('A team may control only one Field Zone card.');
      fieldZones.add(team);
      continue;
    }
    if (card.zoneSlot !== 0 && card.zoneSlot !== 1 && card.zoneSlot !== 2) {
      throw new TypeError('A shared Monster/Spell/Trap card must occupy slot 0, 1, or 2.');
    }
    const key = `${team}:${card.zone}:${card.zoneSlot}`;
    if (slots.has(key)) throw new TypeError('A shared field slot is occupied more than once.');
    slots.add(key);
    if (card.zone === 'monster' && card.position === undefined) {
      throw new TypeError('Monster position is required.');
    }
  }
}

function validateHand(hand: readonly AndroSphinxHandCard[], activeSeat: DuelSeat): void {
  if (!Array.isArray(hand) || hand.length > 30) throw new TypeError('Invalid active physical hand.');
  const uids = new Set<string>();
  for (const card of hand) {
    if (!card || typeof card !== 'object') throw new TypeError('Invalid hand card.');
    requireId(card.uid, 'hand physical UID');
    requireId(card.cardId, 'hand card ID');
    requireSeat(card.physicalOwnerSeat, 'hand physical owner');
    if (card.physicalOwnerSeat !== activeSeat) throw new TypeError('Partner private hand must not be read.');
    if (!['monster', 'spell', 'trap'].includes(card.kind)) throw new TypeError('Invalid hand card kind.');
    if (card.atk !== undefined) requireNonNegativeInteger(card.atk, 'hand monster ATK');
    if (uids.has(card.uid)) throw new TypeError('Duplicate physical UID in active hand.');
    uids.add(card.uid);
  }
}

function findPyramid(field: readonly AndroSphinxFieldCard[], team: DuelTeam): AndroSphinxFieldCard | undefined {
  return field.find(card =>
    card.cardId === PYRAMID_OF_LIGHT_CARD_ID &&
    card.zone === 'field' &&
    card.faceUp &&
    teamOfAndroSphinxSeat(card.controllerSeat) === team,
  );
}

function freeMonsterSlot(field: readonly AndroSphinxFieldCard[], team: DuelTeam): 0 | 1 | 2 | undefined {
  const occupied = new Set(field
    .filter(card => card.zone === 'monster' && teamOfAndroSphinxSeat(card.controllerSeat) === team)
    .map(card => card.zoneSlot));
  return ([0, 1, 2] as const).find(slot => !occupied.has(slot));
}

export function planAndroSphinxSpecialSummon(input: Readonly<{
  activeSeat: DuelSeat;
  teamLP: number;
  sourceUid: string;
  hand: readonly AndroSphinxHandCard[];
  field: readonly AndroSphinxFieldCard[];
}>): AndroSphinxSummonPlanResult {
  requireSeat(input.activeSeat, 'active seat');
  requireId(input.sourceUid, 'source UID');
  requireNonNegativeInteger(input.teamLP, 'team LP');
  validateHand(input.hand, input.activeSeat);
  validateField(input.field);

  const team = teamOfAndroSphinxSeat(input.activeSeat);
  const source = input.hand.find(card => card.uid === input.sourceUid && card.cardId === ANDRO_SPHINX_CARD_ID);
  if (!source) return { allowed: false, reason: 'source-not-in-active-hand' };
  if (input.field.some(card => card.uid === source.uid)) throw new TypeError('A physical card cannot be in hand and on the field.');
  if (input.teamLP <= ANDRO_SPHINX_LP_COST) return { allowed: false, reason: 'insufficient-team-lp' };

  const pyramid = findPyramid(input.field, team);
  if (!pyramid) return { allowed: false, reason: 'pyramid-not-face-up-for-team' };

  const monsterZoneSlot = freeMonsterSlot(input.field, team);
  if (monsterZoneSlot === undefined) return { allowed: false, reason: 'monster-zone-full' };

  return {
    allowed: true,
    plan: {
      sourceUid: source.uid,
      activeSeat: input.activeSeat,
      team,
      pyramidUid: pyramid.uid,
      monsterZoneSlot,
      lpCost: ANDRO_SPHINX_LP_COST,
    },
  };
}

export function resolveAndroSphinxSpecialSummon(input: Readonly<{
  plan: AndroSphinxSummonPlan;
  activeSeat: DuelSeat;
  teamLP: number;
  turn: number;
  position: MonsterPosition;
  hand: readonly AndroSphinxHandCard[];
  field: readonly AndroSphinxFieldCard[];
}>): AndroSphinxSummonResolution {
  requireSeat(input.activeSeat, 'active seat');
  requireNonNegativeInteger(input.teamLP, 'team LP');
  requireNonNegativeInteger(input.turn, 'turn');
  if (input.turn < 1) throw new TypeError('Invalid turn.');
  if (input.position !== 'attack' && input.position !== 'defense') throw new TypeError('Invalid summon position.');
  const plan = input.plan;
  if (!plan || typeof plan !== 'object' || plan.lpCost !== ANDRO_SPHINX_LP_COST ||
      !isSeat(plan.activeSeat) || plan.activeSeat !== input.activeSeat ||
      plan.team !== teamOfAndroSphinxSeat(input.activeSeat) ||
      (plan.monsterZoneSlot !== 0 && plan.monsterZoneSlot !== 1 && plan.monsterZoneSlot !== 2)) {
    return { resolved: false, reason: 'stale-plan' };
  }
  requireId(plan.sourceUid, 'planned source UID');
  requireId(plan.pyramidUid, 'planned Pyramid UID');
  validateHand(input.hand, input.activeSeat);
  validateField(input.field);

  const source = input.hand.find(card => card.uid === plan.sourceUid && card.cardId === ANDRO_SPHINX_CARD_ID);
  if (!source || source.physicalOwnerSeat !== input.activeSeat) {
    return { resolved: false, reason: 'source-not-in-active-hand' };
  }
  if (input.field.some(card => card.uid === source.uid)) throw new TypeError('A physical card cannot be in hand and on the field.');
  if (input.teamLP <= ANDRO_SPHINX_LP_COST) return { resolved: false, reason: 'insufficient-team-lp' };

  const pyramid = findPyramid(input.field, plan.team);
  if (!pyramid || pyramid.uid !== plan.pyramidUid) {
    return { resolved: false, reason: 'pyramid-not-face-up-for-team' };
  }
  const slot = freeMonsterSlot(input.field, plan.team);
  if (slot === undefined) return { resolved: false, reason: 'monster-zone-full' };
  if (slot !== plan.monsterZoneSlot) return { resolved: false, reason: 'stale-plan' };

  const summoned: AndroSphinxFieldCard = {
    uid: source.uid,
    cardId: source.cardId,
    physicalOwnerSeat: source.physicalOwnerSeat,
    controllerSeat: input.activeSeat,
    zone: 'monster',
    zoneSlot: slot,
    faceUp: true,
    position: input.position,
    atk: 3000,
    lastNormalOrSpecialSummonTurn: input.turn,
  };
  const nextHand = input.hand.filter(card => card.uid !== source.uid);
  const nextField = [...input.field, summoned];
  validateField(nextField);

  return {
    resolved: true,
    team: plan.team,
    activeSeat: input.activeSeat,
    remainingTeamLP: input.teamLP - ANDRO_SPHINX_LP_COST,
    hand: nextHand,
    field: nextField,
    summonedUid: summoned.uid,
    physicalOwnerSeat: summoned.physicalOwnerSeat,
    controllerSeat: summoned.controllerSeat,
    monsterZoneSlot: slot,
    summonedTurn: input.turn,
    position: input.position,
  };
}

export function canAndroSphinxAttack(card: AndroSphinxFieldCard, turn: number): boolean {
  requireNonNegativeInteger(turn, 'turn');
  if (turn < 1) throw new TypeError('Invalid turn.');
  if (!card || typeof card !== 'object') throw new TypeError('Invalid monster.');
  validateField([card]);
  if (card.cardId !== ANDRO_SPHINX_CARD_ID || card.zone !== 'monster' || !card.faceUp ||
      card.position !== 'attack' || card.lastNormalOrSpecialSummonTurn === undefined) return false;
  return card.lastNormalOrSpecialSummonTurn !== turn;
}

export function resolveAndroSphinxBattleDamage(
  event: AndroSphinxBattleEvent,
  processedEventIds: readonly string[] = [],
): AndroSphinxBattleDamageResult {
  if (!event || typeof event !== 'object') throw new TypeError('Invalid battle event.');
  requireId(event.eventId, 'battle event ID');
  requireId(event.sourceUid, 'source UID');
  requireId(event.sourceCardId, 'source card ID');
  requireSeat(event.sourcePhysicalOwnerSeat, 'source physical owner');
  requireSeat(event.sourceControllerSeat, 'source controller');
  requireId(event.destroyedUid, 'destroyed UID');
  requireId(event.destroyedBySourceUid, 'destroying source UID');
  requireSeat(event.destroyedPhysicalOwnerSeat, 'destroyed physical owner');
  requireSeat(event.destroyedControllerSeat, 'destroyed controller');
  requireNonNegativeInteger(event.destroyedMonsterAtk, 'destroyed monster ATK');
  if (event.destroyedPosition !== 'attack' && event.destroyedPosition !== 'defense') {
    throw new TypeError('Invalid destroyed monster position.');
  }
  if (event.result !== 'destroyed' && event.result !== 'survived') throw new TypeError('Invalid battle result.');
  if (typeof event.byBattle !== 'boolean') throw new TypeError('Invalid battle flag.');
  if (event.sourceEffectNegated !== undefined && typeof event.sourceEffectNegated !== 'boolean') {
    throw new TypeError('Invalid source effect-negation flag.');
  }
  if (!Array.isArray(processedEventIds) || processedEventIds.length > 10000 ||
      processedEventIds.some(id => typeof id !== 'string' || id.length === 0 || id.length > 128) ||
      new Set(processedEventIds).size !== processedEventIds.length) {
    throw new TypeError('Invalid processed battle event ledger.');
  }

  if (event.sourceCardId !== ANDRO_SPHINX_CARD_ID) return { applied: false, reason: 'wrong-source' };
  if (processedEventIds.includes(event.eventId)) return { applied: false, reason: 'duplicate-event' };
  if (event.sourceEffectNegated) return { applied: false, reason: 'source-effect-negated' };
  if (!event.byBattle || event.result !== 'destroyed' || event.destroyedBySourceUid !== event.sourceUid ||
      event.destroyedUid === event.sourceUid) {
    return { applied: false, reason: 'not-battle-destruction' };
  }
  if (event.destroyedPosition !== 'defense') return { applied: false, reason: 'not-defense-position' };
  const sourceTeam = teamOfAndroSphinxSeat(event.sourceControllerSeat);
  const destroyedTeam = teamOfAndroSphinxSeat(event.destroyedControllerSeat);
  if (sourceTeam === destroyedTeam) return { applied: false, reason: 'not-opponent-team' };

  return {
    applied: true,
    eventId: event.eventId,
    damage: Math.floor(event.destroyedMonsterAtk / 2),
    damagedTeam: oppositeTeam(sourceTeam),
    sourcePhysicalOwnerSeat: event.sourcePhysicalOwnerSeat,
    sourceControllerSeat: event.sourceControllerSeat,
    destroyedPhysicalOwnerSeat: event.destroyedPhysicalOwnerSeat,
    processedEventIds: [...processedEventIds, event.eventId],
  };
}
