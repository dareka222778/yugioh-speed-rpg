import type { Card } from './cardCatalog';
import { randomIndex, type DuelRandom } from './duelRandom';
import { RULES_PROFILE } from './rulesProfile';

/** Agido (16135253): a battle-destruction trigger that rolls a six-sided die
 * and may Special Summon a Fairy from the team's shared Graveyard.
 *
 * This module is deliberately a pure selection primitive. The duel resolver
 * owns trigger timing, the optional choice, and the actual zone movement.
 * Callers must pass the team's shared Monster Zones/Graveyard in classic 2v2;
 * never pass a partner's private hand or Deck.
 */
export const AGIDO_CARD_ID = '16135253';
export const AGIDO_FAIRY_RACE = 'Fairy';

export interface AgidoGraveCard {
  readonly uid: string;
  readonly id: string;
  readonly properlySummoned?: boolean;
  readonly entityKind?: 'token';
}

/** Roll with the duel's persisted private random stream (uniform 1–6). */
export function rollAgidoDie(random: DuelRandom): number {
  return randomIndex(random, 6) + 1;
}

function assertAgidoInputs<T extends AgidoGraveCard>(
  graveyard: readonly T[],
  roll: number,
  fieldMonsterCount: number,
  getCard: (id: string) => Card | undefined,
): void {
  if (!Array.isArray(graveyard)) {
    throw new TypeError('Agido Graveyard must be an array.');
  }
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    throw new RangeError('Agido die result must be an integer from 1 to 6.');
  }
  if (!Number.isInteger(fieldMonsterCount) || fieldMonsterCount < 0 ||
      fieldMonsterCount > RULES_PROFILE.monsterZones) {
    throw new RangeError('Agido shared Monster Zone count is invalid.');
  }
  if (typeof getCard !== 'function') {
    throw new TypeError('Agido card lookup must be a function.');
  }

  const seen = new Set<string>();
  for (const ref of graveyard) {
    if (!ref || typeof ref.uid !== 'string' || ref.uid.length === 0 ||
        typeof ref.id !== 'string' || ref.id.length === 0) {
      throw new TypeError('Agido Graveyard contains an invalid physical card reference.');
    }
    if (seen.has(ref.uid)) {
      throw new Error('Agido Graveyard contains a duplicate physical UID.');
    }
    seen.add(ref.uid);
  }
}

function isEligibleAgidoFairy<T extends AgidoGraveCard>(
  ref: T,
  roll: number,
  getCard: (id: string) => Card | undefined,
): boolean {
  if (ref.entityKind === 'token') return false;
  const info = getCard(ref.id);
  if (!info || info.kind !== 'monster' || info.race !== AGIDO_FAIRY_RACE ||
      !Number.isInteger(info.level)) return false;

  // Fusion/Ritual monsters can only be revived if they were properly
  // Summoned first. The resolver's pile movement performs the same check.
  const requiresProperSummon = !!info.fusion?.length ||
    info.monsterType === 'fusion' || info.monsterType === 'ritual';
  if (requiresProperSummon && ref.properlySummoned !== true) return false;

  return roll === 6 ? info.level! >= 6 : info.level === roll;
}

/**
 * Return the legal Fairy references for the rolled result.
 *
 * Roll 1–5 requires an exact Level match; roll 6 permits Level 6 or higher.
 * The active team's shared field capacity is checked before exposing choices.
 * Original references and physical UIDs are preserved; no zone is mutated.
 */
export function agidoRecruitCandidates<T extends AgidoGraveCard>(
  graveyard: readonly T[],
  roll: number,
  fieldMonsterCount: number,
  getCard: (id: string) => Card | undefined,
): readonly T[] {
  assertAgidoInputs(graveyard, roll, fieldMonsterCount, getCard);
  if (fieldMonsterCount >= RULES_PROFILE.monsterZones) return Object.freeze([]);

  return Object.freeze(
    graveyard.filter(ref => isEligibleAgidoFairy(ref, roll, getCard)),
  );
}

/** Validate an optional selection against a freshly computed candidate list.
 * A null UID represents the player's legal choice not to Special Summon.
 * A stale/forged UID returns null and must not move any card.
 */
export function resolveAgidoRecruitSelection<T extends AgidoGraveCard>(
  graveyard: readonly T[],
  roll: number,
  fieldMonsterCount: number,
  selectedUid: string | null,
  getCard: (id: string) => Card | undefined,
): T | null {
  if (selectedUid === null) return null;
  if (typeof selectedUid !== 'string' || selectedUid.length === 0) return null;

  const current = agidoRecruitCandidates(graveyard, roll, fieldMonsterCount, getCard);
  return current.find(ref => ref.uid === selectedUid) ?? null;
}
