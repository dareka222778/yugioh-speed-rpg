import type { CardRef } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { rulesFor } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const GRACEFUL_CHARITY_ID = '79571449';
type Seat = 0 | 1 | 2 | 3;
type Team = 0 | 1;

export type GracefulCharityPlan = {
  eventId: string;
  sourceUid: string;
  sourceId: string;
  ownerSeat: Seat;
  ownerTeam: Team;
  turn: number;
};
export type GracefulCharityActivation = { state: TagDuel; plan: GracefulCharityPlan };
export type GracefulCharityResolution = {
  state: TagDuel;
  drawnUids: string[];
  discardedUids: string[];
  negated: boolean;
};
type ReceiptState = TagDuel & { gracefulCharityResolvedEvents?: string[] };

function isTeam(value: unknown): value is Team { return value === 0 || value === 1; }
function physicalSeat(uid: string): Seat | null {
  const match = /^m([0-3]):/.exec(uid);
  return match ? Number(match[1]) as Seat : null;
}
function privateHandForSeat(duel: TagDuel, seat: Seat): CardRef[] {
  const team = (seat % 2) as Team;
  if (duel.active[team] === seat) return duel.core.players[team].hand;
  const reserve = duel.reserves[String(seat)];
  if (!reserve) throw new Error('Mão privada do assento físico não encontrada.');
  return reserve.hand;
}
function privateDeckForSeat(duel: TagDuel, seat: Seat): CardRef[] {
  const team = (seat % 2) as Team;
  if (duel.active[team] === seat) return duel.core.players[team].deck;
  const reserve = duel.reserves[String(seat)];
  if (!reserve) throw new Error('Deck privado do assento físico não encontrado.');
  return reserve.deck;
}
function inventorySignature(duel: TagDuel): string {
  return tagInventory(duel).map(card => card.uid + '|' + card.id).sort().join('\n');
}
function assertSameInventory(before: string, after: TagDuel): void {
  if (before !== inventorySignature(after)) {
    throw new Error('O adapter alterou a identidade ou o inventário físico das cartas.');
  }
}
function isSpellCardId(cardId: string): boolean {
  if (cardId === GRACEFUL_CHARITY_ID) return true;
  const metadata = getDuelCard(cardId);
  return metadata?.kind === 'spell' && metadata.field !== true;
}

/** Enforces the owner's physical deck/zone profile; hand overflow remains End Phase-only. */
export function assertGracefulCharityRules(duel: TagDuel): void {
  assertTagDuel(duel);
  if (duel.mode !== 'tag-classic') throw new Error('Graceful Charity exige TagDuel clássico.');
  const rules = rulesFor(duel.core);
  if (rules.mainDeckMin !== 20 || rules.mainDeckMax !== 30 || rules.handLimit !== 6 ||
      rules.handCheck !== 'end' || rules.monsterZones !== 3 || rules.spellTrapZones !== 3 ||
      rules.extraDeckMax !== 5) {
    throw new Error('Perfil de regras incompatível com o proprietário.');
  }
  const main = [0, 0, 0, 0];
  const extra = [0, 0, 0, 0];
  for (const ref of tagInventory(duel)) {
    if (ref.entityKind === 'token') continue;
    const seat = physicalSeat(ref.uid);
    if (seat === null) throw new Error('UID sem proprietário físico m0–m3.');
    const metadata = getDuelCard(ref.id);
    if (!metadata) throw new Error('Carta sem metadados habilitados no estado de teste.');
    if (metadata.fusion) extra[seat]++;
    else main[seat]++;
  }
  for (let seat = 0; seat < 4; seat++) {
    if (main[seat] < rules.mainDeckMin || main[seat] > rules.mainDeckMax) {
      throw new Error('Deck principal físico fora do limite 20–30.');
    }
  }
  if (extra.some(count => count > rules.extraDeckMax)) {
    throw new Error('Deck Adicional físico excede cinco cartas.');
  }
  for (const team of duel.core.players) {
    if (team.monsters.length > rules.monsterZones) throw new Error('Equipe excedeu as três Zonas de Monstros.');
    if (team.backrow.length > rules.spellTrapZones) {
      throw new Error('Equipe excedeu as três Zonas de Magias/Armadilhas.');
    }
    // Field Zone remains separate from the three Spell/Trap Zones.
  }
}

function activeMainHandSource(
  duel: TagDuel,
  sourceUid: string,
  cardId: string,
): { team: Team; seat: Seat } | null {
  const core = duel.core;
  if (core.phase !== 'main' || core.pending.kind !== 'none' || core.chain.length !== 0 ||
      core.turnEnding || core.handFlow || core.choice || typeof sourceUid !== 'string' || !sourceUid) {
    return null;
  }
  const team = core.current as Team;
  const seat = duel.cursor as Seat;
  if (!isTeam(team) || duel.active[team] !== seat || duel.members[seat]?.team !== team) return null;
  const source = privateHandForSeat(duel, seat).find(card =>
    card.uid === sourceUid && card.id === cardId && card.entityKind !== 'token');
  if (!source || physicalSeat(source.uid) !== seat || !isSpellCardId(cardId)) return null;
  return { team, seat };
}

/** Activates from the active physical seat's private hand; the Spell itself has no discard cost. */
export function activateGracefulCharity(
  input: TagDuel,
  sourceUid: string,
  options: { cardId?: string } = {},
): GracefulCharityActivation | null {
  assertGracefulCharityRules(input);
  const cardId = options.cardId ?? GRACEFUL_CHARITY_ID;
  const active = activeMainHandSource(input, sourceUid, cardId);
  if (!active || privateDeckForSeat(input, active.seat).length < 3) return null;

  const before = inventorySignature(input);
  const next = structuredClone(input);
  const hand = privateHandForSeat(next, active.seat);
  const index = hand.findIndex(card => card.uid === sourceUid && card.id === cardId);
  if (index < 0) return null;
  const [spell] = hand.splice(index, 1);
  next.core.players[active.team].grave.push(spell);

  const plan: GracefulCharityPlan = {
    eventId: 'graceful-charity:' + next.core.turn + ':' + sourceUid,
    sourceUid,
    sourceId: cardId,
    ownerSeat: active.seat,
    ownerTeam: active.team,
    turn: next.core.turn,
  };
  assertGracefulCharityRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, plan };
}

/** Draws three from that physical seat's Deck, then discards exactly two cards from its post-draw hand. */
export function resolveGracefulCharity(
  input: TagDuel,
  plan: GracefulCharityPlan,
  selectedUids: readonly string[],
  options: { negated?: boolean; cardId?: string } = {},
): GracefulCharityResolution | null {
  assertGracefulCharityRules(input);
  const cardId = options.cardId ?? GRACEFUL_CHARITY_ID;
  if (!plan || typeof plan.eventId !== 'string' || !plan.eventId.trim() ||
      plan.sourceId !== cardId || !Number.isInteger(plan.turn) || plan.turn !== input.core.turn ||
      !isTeam(plan.ownerTeam) || !Number.isInteger(plan.ownerSeat) || plan.ownerSeat < 0 ||
      plan.ownerSeat > 3 || plan.ownerTeam !== plan.ownerSeat % 2 ||
      physicalSeat(plan.sourceUid) !== plan.ownerSeat ||
      plan.eventId !== 'graceful-charity:' + plan.turn + ':' + plan.sourceUid ||
      input.active[plan.ownerTeam] !== plan.ownerSeat || !Array.isArray(selectedUids) ||
      selectedUids.some(uid => typeof uid !== 'string' || !uid) ||
      new Set(selectedUids).size !== selectedUids.length) return null;

  const receipts = (input as ReceiptState).gracefulCharityResolvedEvents ?? [];
  if (!Array.isArray(receipts) || receipts.includes(plan.eventId)) return null;
  const source = input.core.players[plan.ownerTeam].grave.find(card =>
    card.uid === plan.sourceUid && card.id === cardId && card.entityKind !== 'token');
  if (!source) return null;

  const negated = options.negated === true;
  if (negated) {
    if (selectedUids.length !== 0) return null;
  } else {
    if (selectedUids.length !== 2 || privateDeckForSeat(input, plan.ownerSeat).length < 3) return null;
  }

  const before = inventorySignature(input);
  const next = structuredClone(input);
  const drawnUids: string[] = [];
  const discardedUids: string[] = [];
  if (!negated) {
    const deck = privateDeckForSeat(next, plan.ownerSeat);
    const hand = privateHandForSeat(next, plan.ownerSeat);
    const drawn = deck.splice(0, 3);
    if (drawn.length !== 3) return null;
    hand.push(...drawn);
    drawnUids.push(...drawn.map(card => card.uid));

    const selected = selectedUids.map(uid => hand.find(card => card.uid === uid));
    if (selected.some(card => !card || card.entityKind === 'token')) return null;
    for (const uid of selectedUids) {
      const index = hand.findIndex(card => card.uid === uid);
      if (index < 0) return null;
      const [discarded] = hand.splice(index, 1);
      next.core.players[plan.ownerTeam].grave.push(discarded);
      discardedUids.push(discarded.uid);
    }
  }

  const nextReceipts = (next as ReceiptState).gracefulCharityResolvedEvents ?? [];
  (next as ReceiptState).gracefulCharityResolvedEvents = [...nextReceipts, plan.eventId].slice(-256);
  assertGracefulCharityRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, drawnUids, discardedUids, negated };
}
