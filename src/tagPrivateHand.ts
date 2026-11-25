import type { CardRef } from './duelEngine';
import { tagInventory, type TagDuel } from './tagDuel';

export type PhysicalTagSeat = 0 | 1 | 2 | 3;

/** Resolves the physical owner encoded in the immutable card UID. */
export function tagPhysicalSeat(uid: string): PhysicalTagSeat | null {
  const match = /^m([0-3]):/.exec(uid);
  return match ? Number(match[1]) as PhysicalTagSeat : null;
}

/** Reads the active member's live zone or the inactive member's private reserve. */
export function tagPrivateHandForSeat(duel: TagDuel, seat: PhysicalTagSeat): CardRef[] {
  const team = (seat % 2) as 0 | 1;
  if (duel.active[team] === seat) return duel.core.players[team].hand;
  const reserve = duel.reserves[String(seat)];
  if (!reserve) throw new Error('Mão privada do assento físico não encontrada.');
  return reserve.hand;
}

/** Reads the physical owner's private Deck, including inactive partner reserves. */
export function tagPrivateDeckForSeat(duel: TagDuel, seat: PhysicalTagSeat): CardRef[] {
  const team = (seat % 2) as 0 | 1;
  if (duel.active[team] === seat) return duel.core.players[team].deck;
  const reserve = duel.reserves[String(seat)];
  if (!reserve) throw new Error('Deck privado do assento físico não encontrado.');
  return reserve.deck;
}

/** A hand inspection is safe only when every card belongs to that physical seat. */
export function tagPrivateHandOwnedBySeat(duel: TagDuel, seat: PhysicalTagSeat): boolean {
  return tagPrivateHandForSeat(duel, seat).every(card =>
    card.entityKind !== 'token' && tagPhysicalSeat(card.uid) === seat);
}

export function tagInventorySignature(duel: TagDuel): string {
  return tagInventory(duel).map(card => card.uid + '|' + card.id).sort().join('\n');
}

export function assertTagInventoryUnchanged(before: string, after: TagDuel): void {
  if (before !== tagInventorySignature(after)) {
    throw new Error('O adapter alterou a identidade ou o inventário físico das cartas.');
  }
}
