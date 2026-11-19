import type { Card } from './cardCatalog';

export const ABSORBING_KID_FROM_THE_SKY_ID = '49771608';
export const AIRKNIGHT_PARSHATH_ID = '18036057';
export const ASWAN_APPARITION_ID = '88236094';

export type BattleTeam = 0 | 1;

export interface BattleDamageSnapshot {
  readonly attackerUid: string;
  readonly attackerTeam: BattleTeam;
  readonly defenderUid?: string;
  readonly defenderTeam?: BattleTeam;
  /** Battle damage already calculated for each shared team LP total. */
  readonly damageToTeams: readonly [number, number];
  /** All monsters destroyed in this battle resolution. */
  readonly destroyedUids: readonly string[];
  /** The subset of destroyed monsters whose cause was battle. */
  readonly battleDestroyedUids: readonly string[];
  /** Physical UIDs actually sent to the shared Graveyard. */
  readonly sentToGraveUids: readonly string[];
  readonly banishedUids?: readonly string[];
  readonly tokenUids?: readonly string[];
}

export interface PhysicalGraveCard {
  readonly uid: string;
  readonly id: string;
  readonly entityKind?: 'token';
}

function validTeam(value: unknown): value is BattleTeam {
  return value === 0 || value === 1;
}

function assertUidList(value: unknown, label: string): asserts value is readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  const seen = new Set<string>();
  for (const uid of value) {
    if (typeof uid !== 'string' || uid.length === 0) {
      throw new TypeError(`${label} contains an invalid physical UID.`);
    }
    if (seen.has(uid)) throw new Error(`${label} contains a duplicate physical UID.`);
    seen.add(uid);
  }
}

/** Reject contradictory or incomplete combat snapshots before any reward is offered. */
export function assertBattleDamageSnapshot(value: BattleDamageSnapshot): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Battle damage snapshot is invalid.');
  }
  if (typeof value.attackerUid !== 'string' || value.attackerUid.length === 0 ||
      !validTeam(value.attackerTeam)) {
    throw new TypeError('Battle attacker identity/team is invalid.');
  }
  const hasDefender = value.defenderUid !== undefined;
  if (hasDefender !== (value.defenderTeam !== undefined) ||
      hasDefender && (typeof value.defenderUid !== 'string' ||
        value.defenderUid.length === 0 || !validTeam(value.defenderTeam) ||
        value.defenderTeam === value.attackerTeam ||
        value.defenderUid === value.attackerUid)) {
    throw new TypeError('Battle defender identity/team is invalid.');
  }
  if (!Array.isArray(value.damageToTeams) || value.damageToTeams.length !== 2 ||
      value.damageToTeams.some(amount => !Number.isSafeInteger(amount) || amount < 0)) {
    throw new RangeError('Battle damage must contain two non-negative safe integers.');
  }
  assertUidList(value.destroyedUids, 'Destroyed UID list');
  assertUidList(value.battleDestroyedUids, 'Battle-destroyed UID list');
  assertUidList(value.sentToGraveUids, 'Graveyard UID list');
  assertUidList(value.banishedUids ?? [], 'Banished UID list');
  assertUidList(value.tokenUids ?? [], 'Token UID list');

  const destroyed = new Set(value.destroyedUids);
  const banished = new Set(value.banishedUids ?? []);
  for (const uid of value.battleDestroyedUids) {
    if (!destroyed.has(uid)) throw new Error('Battle-destroyed UID was not destroyed.');
  }
  for (const uid of value.sentToGraveUids) {
    if (banished.has(uid)) throw new Error('A card cannot be both banished and sent to the Graveyard.');
  }
}

function participantTeam(value: BattleDamageSnapshot, uid: string): BattleTeam | undefined {
  if (value.attackerUid === uid) return value.attackerTeam;
  if (value.defenderUid === uid) return value.defenderTeam;
  return undefined;
}

/**
 * Returns the battle damage inflicted by a surviving combat participant.
 * The event snapshot contains battle damage only; effect damage is never
 * eligible for Airknight Parshath or Aswan Apparition.
 */
export function battleDamageInflictedBy(
  value: BattleDamageSnapshot,
  sourceUid: string,
): number {
  assertBattleDamageSnapshot(value);
  if (typeof sourceUid !== 'string' || sourceUid.length === 0) return 0;
  const team = participantTeam(value, sourceUid);
  if (team === undefined || value.destroyedUids.includes(sourceUid) ||
      (value.banishedUids ?? []).includes(sourceUid) ||
      (value.tokenUids ?? []).includes(sourceUid)) return 0;
  return value.damageToTeams[1 - team];
}

/** Airknight Parshath draws exactly one card after it inflicts battle damage. */
export function airknightParshathDrawReward(
  value: BattleDamageSnapshot,
  sourceUid: string,
  sourceCardId: string,
): Readonly<{ drawCount: 1; battleDamage: number }> | null {
  if (sourceCardId !== AIRKNIGHT_PARSHATH_ID) return null;
  const battleDamage = battleDamageInflictedBy(value, sourceUid);
  return battleDamage > 0 ? Object.freeze({ drawCount: 1, battleDamage }) : null;
}

function assertPhysicalGraveyard<T extends PhysicalGraveCard>(graveyard: readonly T[]): void {
  if (!Array.isArray(graveyard)) throw new TypeError('Shared Graveyard must be an array.');
  const seen = new Set<string>();
  for (const ref of graveyard) {
    if (!ref || typeof ref.uid !== 'string' || ref.uid.length === 0 ||
        typeof ref.id !== 'string' || ref.id.length === 0) {
      throw new TypeError('Shared Graveyard contains an invalid physical card reference.');
    }
    if (seen.has(ref.uid)) throw new Error('Shared Graveyard contains a duplicate physical UID.');
    seen.add(ref.uid);
  }
}

/**
 * Aswan Apparition may select a Trap from the controller team's shared
 * Graveyard only after this monster has inflicted battle damage. References
 * are returned unchanged so the resolver can preserve physical ownership.
 */
export function aswanApparitionTrapCandidates<T extends PhysicalGraveCard>(
  value: BattleDamageSnapshot,
  sourceUid: string,
  sourceCardId: string,
  sharedGraveyard: readonly T[],
  getCard: (id: string) => Card | undefined,
): readonly T[] {
  assertBattleDamageSnapshot(value);
  assertPhysicalGraveyard(sharedGraveyard);
  if (typeof getCard !== 'function') throw new TypeError('Card lookup must be a function.');
  if (sourceCardId !== ASWAN_APPARITION_ID ||
      battleDamageInflictedBy(value, sourceUid) <= 0) return Object.freeze([]);
  return Object.freeze(sharedGraveyard.filter(ref =>
    ref.entityKind !== 'token' && getCard(ref.id)?.kind === 'trap',
  ));
}

/** Revalidate an optional Aswan choice against the current shared Graveyard. */
export function resolveAswanApparitionTrapSelection<T extends PhysicalGraveCard>(
  value: BattleDamageSnapshot,
  sourceUid: string,
  sourceCardId: string,
  sharedGraveyard: readonly T[],
  selectedUid: string | null,
  getCard: (id: string) => Card | undefined,
): T | null {
  const current = aswanApparitionTrapCandidates(
    value, sourceUid, sourceCardId, sharedGraveyard, getCard,
  );
  if (selectedUid === null || typeof selectedUid !== 'string' || selectedUid.length === 0) {
    return null;
  }
  return current.find(ref => ref.uid === selectedUid) ?? null;
}

/**
 * Absorbing Kid heals its controller's shared team LP only when it survives
 * the battle, destroys the opposing participant by battle, and that physical
 * card is actually sent to the Graveyard. The destroyed monster's original
 * Level determines the amount (Level × 300).
 */
export function absorbingKidBattleHealReward(
  value: BattleDamageSnapshot,
  sourceUid: string,
  sourceCardId: string,
  destroyedUid: string,
  destroyedMonsterOriginalLevel: number,
): Readonly<{ team: BattleTeam; amount: number; destroyedUid: string }> | null {
  assertBattleDamageSnapshot(value);
  if (sourceCardId !== ABSORBING_KID_FROM_THE_SKY_ID ||
      typeof destroyedUid !== 'string' || destroyedUid.length === 0) return null;

  const sourceTeam = participantTeam(value, sourceUid);
  const targetTeam = participantTeam(value, destroyedUid);
  if (sourceTeam === undefined || targetTeam === undefined || sourceTeam === targetTeam ||
      value.destroyedUids.includes(sourceUid) ||
      !value.destroyedUids.includes(destroyedUid) ||
      !value.battleDestroyedUids.includes(destroyedUid) ||
      !value.sentToGraveUids.includes(destroyedUid) ||
      (value.banishedUids ?? []).includes(destroyedUid) ||
      (value.tokenUids ?? []).includes(destroyedUid)) return null;

  if (!Number.isSafeInteger(destroyedMonsterOriginalLevel) ||
      destroyedMonsterOriginalLevel < 1 || destroyedMonsterOriginalLevel > 12) {
    throw new RangeError('Destroyed monster original Level must be an integer from 1 to 12.');
  }
  return Object.freeze({
    team: sourceTeam,
    amount: destroyedMonsterOriginalLevel * 300,
    destroyedUid,
  });
}
