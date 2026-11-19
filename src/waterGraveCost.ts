import type { Card } from './cardCatalog';
import { RULES_PROFILE } from './rulesProfile';

/** Aqua Spirit (40916023) uses a WATER monster in the team's shared GY as
 * its Special Summon cost. This helper handles only the cost zone: the caller
 * must first verify that Aqua Spirit is in the active physical player's hand
 * and that the shared team field has an open Monster Zone.
 */
export interface WaterGraveCard {
  readonly uid: string;
  readonly id: string;
  readonly properlySummoned?: boolean;
  readonly entityKind?: 'token';
}

function assertZone<T extends WaterGraveCard>(zone: readonly T[], label: string): Set<string> {
  if (!Array.isArray(zone)) throw new TypeError(`Aqua Spirit ${label} must be an array.`);
  const seen = new Set<string>();
  for (const ref of zone) {
    if (!ref || typeof ref.uid !== 'string' || ref.uid.length === 0 ||
        typeof ref.id !== 'string' || ref.id.length === 0) {
      throw new TypeError(`Aqua Spirit ${label} contains an invalid physical card reference.`);
    }
    if (seen.has(ref.uid)) throw new Error(`Aqua Spirit ${label} contains a duplicate physical UID.`);
    seen.add(ref.uid);
  }
  return seen;
}

function assertWaterGraveInputs<T extends WaterGraveCard>(
  graveyard: readonly T[],
  banished: readonly T[],
  fieldMonsterCount: number,
  getCard: (id: string) => Card | undefined,
): void {
  const graveUids = assertZone(graveyard, 'Graveyard');
  const banishedUids = assertZone(banished, 'banished zone');
  for (const uid of banishedUids) {
    if (graveUids.has(uid)) throw new Error('Aqua Spirit physical UID exists in both Graveyard and banished zone.');
  }
  if (!Number.isInteger(fieldMonsterCount) || fieldMonsterCount < 0 ||
      fieldMonsterCount > RULES_PROFILE.monsterZones) {
    throw new RangeError('Aqua Spirit shared Monster Zone count is invalid.');
  }
  if (typeof getCard !== 'function') throw new TypeError('Aqua Spirit card lookup must be a function.');
}

/** List WATER monsters that can pay Aqua Spirit's Graveyard banish cost.
 * Fusion/Ritual summon history is irrelevant here: the card is banished, not
 * Special Summoned. Physical UIDs and owner metadata are kept untouched.
 */
export function waterGraveBanishCandidates<T extends WaterGraveCard>(
  graveyard: readonly T[],
  banished: readonly T[],
  fieldMonsterCount: number,
  getCard: (id: string) => Card | undefined,
): readonly T[] {
  assertWaterGraveInputs(graveyard, banished, fieldMonsterCount, getCard);
  if (fieldMonsterCount >= RULES_PROFILE.monsterZones) return Object.freeze([]);
  return Object.freeze(graveyard.filter(ref => {
    if (ref.entityKind === 'token') return false;
    const info = getCard(ref.id);
    return info?.kind === 'monster' && info.attribute === 'WATER';
  }));
}

/** Pay exactly one validated WATER banish cost, preserving the original
 * physical reference. Invalid/stale choices never partially mutate either zone.
 */
export function payWaterGraveBanish<T extends WaterGraveCard>(
  graveyard: T[],
  banished: T[],
  fieldMonsterCount: number,
  selectedUid: string,
  getCard: (id: string) => Card | undefined,
): T | null {
  const candidates = waterGraveBanishCandidates(graveyard, banished, fieldMonsterCount, getCard);
  if (typeof selectedUid !== 'string' || selectedUid.length === 0) return null;
  const selected = candidates.find(ref => ref.uid === selectedUid);
  if (!selected) return null;

  const index = graveyard.findIndex(ref => ref.uid === selectedUid);
  if (index < 0) return null;
  const [paid] = graveyard.splice(index, 1);
  banished.push(paid);
  return paid;
}
