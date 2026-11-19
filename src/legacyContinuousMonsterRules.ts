export const AMAZONESS_TIGER_CARD_ID = '10979723' as const;
export const ARSENAL_BUG_CARD_ID = '42364374' as const;

export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 'even' | 'odd';

export type LegacyFieldMonster = Readonly<{
  uid: string;
  cardId: string;
  physicalOwnerSeat: DuelSeat;
  controllerSeat: DuelSeat;
  zoneSlot: 0 | 1 | 2;
  faceUp: boolean;
  race: string;
  archetypes: readonly string[];
  baseAtk: number;
  baseDef: number;
  effectNegated?: boolean;
}>;

export type LegacyFieldReason =
  | 'wrong-source'
  | 'source-face-down'
  | 'source-effect-negated';

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

export function teamOfLegacySeat(seat: DuelSeat): DuelTeam {
  requireSeat(seat, 'seat');
  return seat % 2 === 0 ? 'even' : 'odd';
}

function validateMonster(monster: LegacyFieldMonster): void {
  if (!monster || typeof monster !== 'object') throw new TypeError('Invalid field monster.');
  requireText(monster.uid, 'physical UID');
  requireText(monster.cardId, 'card ID');
  requireSeat(monster.physicalOwnerSeat, 'physical owner');
  requireSeat(monster.controllerSeat, 'controller');
  if (monster.zoneSlot !== 0 && monster.zoneSlot !== 1 && monster.zoneSlot !== 2) {
    throw new TypeError('Monster must occupy one of the three shared Monster Zones.');
  }
  if (typeof monster.faceUp !== 'boolean') throw new TypeError('Invalid face-up state.');
  requireText(monster.race, 'monster race');
  if (!Array.isArray(monster.archetypes) || monster.archetypes.length > 32 ||
      monster.archetypes.some(value => typeof value !== 'string' || value.length === 0 || value.length > 64) ||
      new Set(monster.archetypes).size !== monster.archetypes.length) {
    throw new TypeError('Invalid monster archetypes.');
  }
  for (const [name, value] of [['base ATK', monster.baseAtk], ['base DEF', monster.baseDef]] as const) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10000) {
      throw new TypeError(`Invalid ${name}.`);
    }
  }
  if (monster.effectNegated !== undefined && typeof monster.effectNegated !== 'boolean') {
    throw new TypeError('Invalid effect-negation state.');
  }
}

/** Validates the six physical Monster Zones as two shared 3-slot team fields. */
export function validateLegacyMonsterField(field: readonly LegacyFieldMonster[]): void {
  if (!Array.isArray(field) || field.length > 6) throw new TypeError('Invalid shared Monster Field.');
  const uids = new Set<string>();
  const slots = new Set<string>();
  for (const monster of field) {
    validateMonster(monster);
    if (uids.has(monster.uid)) throw new TypeError('Duplicate physical UID in shared Monster Field.');
    uids.add(monster.uid);
    const key = `${teamOfLegacySeat(monster.controllerSeat)}:${monster.zoneSlot}`;
    if (slots.has(key)) throw new TypeError('A shared Monster Zone slot is occupied more than once.');
    slots.add(key);
  }
}

function isAmazoness(monster: LegacyFieldMonster): boolean {
  return monster.cardId === AMAZONESS_TIGER_CARD_ID || monster.archetypes.includes('Amazoness');
}

function findMonster(uid: string, field: readonly LegacyFieldMonster[]): LegacyFieldMonster {
  requireText(uid, 'source UID');
  const found = field.find(monster => monster.uid === uid);
  if (!found) throw new Error('Monster UID is not present on the shared field.');
  return found;
}

export type AmazonessTigerEvaluation =
  | Readonly<{ active: false; reason: LegacyFieldReason; atk: number }>
  | Readonly<{
      active: true;
      atk: number;
      amazonessCount: number;
      controlLimitSatisfied: boolean;
      duplicateFaceUpTigerUids: readonly string[];
    }>;

/**
 * Evaluates Amazoness Tiger from the shared team field.
 * Only face-up Amazoness monsters contribute to visible ATK; physical ownership
 * is intentionally independent from current team control.
 */
export function evaluateAmazonessTiger(
  sourceUid: string,
  field: readonly LegacyFieldMonster[],
): AmazonessTigerEvaluation {
  validateLegacyMonsterField(field);
  const source = findMonster(sourceUid, field);
  if (source.cardId !== AMAZONESS_TIGER_CARD_ID) {
    return { active: false, reason: 'wrong-source', atk: source.baseAtk };
  }
  if (!source.faceUp) return { active: false, reason: 'source-face-down', atk: source.baseAtk };
  if (source.effectNegated) {
    return { active: false, reason: 'source-effect-negated', atk: source.baseAtk };
  }

  const team = teamOfLegacySeat(source.controllerSeat);
  const controlled = field.filter(monster =>
    monster.faceUp && teamOfLegacySeat(monster.controllerSeat) === team,
  );
  const amazonessCount = controlled.filter(isAmazoness).length;
  const duplicateFaceUpTigerUids = controlled
    .filter(monster => monster.uid !== source.uid && monster.cardId === AMAZONESS_TIGER_CARD_ID)
    .map(monster => monster.uid)
    .sort();

  return {
    active: true,
    atk: source.baseAtk + amazonessCount * 400,
    amazonessCount,
    controlLimitSatisfied: duplicateFaceUpTigerUids.length === 0,
    duplicateFaceUpTigerUids,
  };
}

/** Face-down Tigers may coexist; the face-up continuous restriction is team-wide. */
export function amazonessTigerCanRemainFaceUp(
  candidate: LegacyFieldMonster,
  field: readonly LegacyFieldMonster[],
): boolean {
  validateLegacyMonsterField(field);
  validateMonster(candidate);
  if (candidate.cardId !== AMAZONESS_TIGER_CARD_ID || !candidate.faceUp) return true;
  const team = teamOfLegacySeat(candidate.controllerSeat);
  return !field.some(monster =>
    monster.uid !== candidate.uid &&
    monster.cardId === AMAZONESS_TIGER_CARD_ID &&
    monster.faceUp &&
    teamOfLegacySeat(monster.controllerSeat) === team,
  );
}

export type AmazonessAttackCheck = Readonly<{ allowed: boolean }>;

/**
 * Amazoness Tiger protects other Amazoness monsters on its controller's team.
 * The result intentionally contains no card name, archetype, UID, or reason,
 * so callers can enforce target legality without serializing hidden identity.
 */
export function amazonessTigerAttackAllowed(
  attackerSeat: DuelSeat,
  targetUid: string,
  field: readonly LegacyFieldMonster[],
): AmazonessAttackCheck {
  validateLegacyMonsterField(field);
  requireSeat(attackerSeat, 'attacker seat');
  const target = findMonster(targetUid, field);
  const targetTeam = teamOfLegacySeat(target.controllerSeat);
  if (teamOfLegacySeat(attackerSeat) === targetTeam) return { allowed: true };

  const protectedByTiger = field.some(monster =>
    monster.cardId === AMAZONESS_TIGER_CARD_ID &&
    monster.faceUp &&
    !monster.effectNegated &&
    teamOfLegacySeat(monster.controllerSeat) === targetTeam,
  );
  if (!protectedByTiger || target.cardId === AMAZONESS_TIGER_CARD_ID || !isAmazoness(target)) {
    return { allowed: true };
  }
  return { allowed: false };
}

export type ArsenalBugEvaluation =
  | Readonly<{ active: false; reason: LegacyFieldReason; atk: number; def: number }>
  | Readonly<{ active: true; atk: number; def: number; otherFaceUpInsectCount: number }>;

/** Arsenal Bug counts other face-up Insects controlled by the same team. */
export function evaluateArsenalBug(
  sourceUid: string,
  field: readonly LegacyFieldMonster[],
): ArsenalBugEvaluation {
  validateLegacyMonsterField(field);
  const source = findMonster(sourceUid, field);
  if (source.cardId !== ARSENAL_BUG_CARD_ID) {
    return { active: false, reason: 'wrong-source', atk: source.baseAtk, def: source.baseDef };
  }
  if (!source.faceUp) {
    return { active: false, reason: 'source-face-down', atk: source.baseAtk, def: source.baseDef };
  }
  if (source.effectNegated) {
    return { active: false, reason: 'source-effect-negated', atk: source.baseAtk, def: source.baseDef };
  }

  const team = teamOfLegacySeat(source.controllerSeat);
  const otherFaceUpInsectCount = field.filter(monster =>
    monster.uid !== source.uid &&
    monster.faceUp &&
    monster.race === 'Insect' &&
    teamOfLegacySeat(monster.controllerSeat) === team,
  ).length;

  return otherFaceUpInsectCount === 0
    ? { active: true, atk: 1000, def: 1000, otherFaceUpInsectCount }
    : { active: true, atk: source.baseAtk, def: source.baseDef, otherFaceUpInsectCount };
}
