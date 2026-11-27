import type { CardRef } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { rulesFor } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const THE_CHEERFUL_COFFIN_ID = '41142615';
type Seat = 0 | 1 | 2 | 3;
type Team = 0 | 1;

export type CheerfulCoffinPlan = {
  eventId: string;
  sourceUid: string;
  sourceId: string;
  ownerSeat: Seat;
  ownerTeam: Team;
  turn: number;
};
export type CheerfulCoffinActivation = { state: TagDuel; plan: CheerfulCoffinPlan };
export type CheerfulCoffinResolution = {
  state: TagDuel;
  discardedUids: string[];
  negated: boolean;
};
type ReceiptState = TagDuel & { cheerfulCoffinResolvedEvents?: string[] };

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
function inventorySignature(duel: TagDuel): string {
  return tagInventory(duel).map(card => card.uid + '|' + card.id).sort().join('\n');
}
function assertSameInventory(before: string, after: TagDuel): void {
  if (before !== inventorySignature(after)) {
    throw new Error('O adapter alterou a identidade ou o inventário físico das cartas.');
  }
}
function isSpellCardId(cardId: string): boolean {
  if (cardId === THE_CHEERFUL_COFFIN_ID) return true;
  const metadata = getDuelCard(cardId);
  return metadata?.kind === 'spell' && metadata.field !== true;
}
function isMonsterCard(card: CardRef): boolean {
  return card.entityKind !== 'token' && getDuelCard(card.id)?.kind === 'monster';
}

/** Keeps the owner's physical 2v2 limits explicit without truncating any Deck or hand. */
export function assertPhysicalExtraDeckCounts(extraCounts: readonly number[], maximum = 5): void {
  if (!Array.isArray(extraCounts) || extraCounts.length !== 4 || !Number.isSafeInteger(maximum) ||
      maximum < 0 || extraCounts.some(count => !Number.isSafeInteger(count) || count < 0)) {
    throw new Error('Contagem do Deck Adicional inválida.');
  }
  if (extraCounts.some(count => count > maximum)) {
    throw new Error('Deck Adicional físico excede cinco cartas.');
  }
}

/** Enforces the project's classic TagDuel profile; the six-card hand check remains End Phase-only. */
export function assertCheerfulCoffinRules(duel: TagDuel): void {
  assertTagDuel(duel);
  if (duel.mode !== 'tag-classic') throw new Error('The Cheerful Coffin exige TagDuel clássico.');
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
  assertPhysicalExtraDeckCounts(extra, rules.extraDeckMax);
  for (const team of duel.core.players) {
    if (team.monsters.length > rules.monsterZones) throw new Error('Equipe excedeu as três Zonas de Monstros.');
    if (team.backrow.length > rules.spellTrapZones) {
      throw new Error('Equipe excedeu as três Zonas de Magias/Armadilhas.');
    }
    // Field Zone is separate and is deliberately not counted as a Spell/Trap Zone.
  }
}

function activeMainHandSource(
  duel: TagDuel,
  sourceUid: string,
  cardId: string,
): { team: Team; seat: Seat; source: CardRef } | null {
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
  return { team, seat, source };
}

/** Registers a Normal Spell activation from the active physical seat's private hand. */
export function activateCheerfulCoffin(
  input: TagDuel,
  sourceUid: string,
  options: { cardId?: string } = {},
): CheerfulCoffinActivation | null {
  assertCheerfulCoffinRules(input);
  const cardId = options.cardId ?? THE_CHEERFUL_COFFIN_ID;
  const active = activeMainHandSource(input, sourceUid, cardId);
  if (!active) return null;
  const before = inventorySignature(input);
  const next = structuredClone(input);
  const hand = privateHandForSeat(next, active.seat);
  const index = hand.findIndex(card => card.uid === sourceUid && card.id === cardId);
  if (index < 0) return null;
  const [spell] = hand.splice(index, 1);
  // A Normal Spell has no persistent backrow occupancy after its activation resolves.
  next.core.players[active.team].grave.push(spell);
  const plan: CheerfulCoffinPlan = {
    eventId: 'the-cheerful-coffin:' + next.core.turn + ':' + sourceUid,
    sourceUid,
    sourceId: cardId,
    ownerSeat: active.seat,
    ownerTeam: active.team,
    turn: next.core.turn,
  };
  assertCheerfulCoffinRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, plan };
}

/** Discards zero to three Monster Cards from the same physical owner's hand, atomically at resolution. */
export function resolveCheerfulCoffin(
  input: TagDuel,
  plan: CheerfulCoffinPlan,
  selectedUids: readonly string[],
  options: { negated?: boolean; cardId?: string } = {},
): CheerfulCoffinResolution | null {
  assertCheerfulCoffinRules(input);
  const cardId = options.cardId ?? THE_CHEERFUL_COFFIN_ID;
  if (!plan || typeof plan.eventId !== 'string' || !plan.eventId.trim() ||
      plan.sourceId !== cardId || !Number.isInteger(plan.turn) || plan.turn !== input.core.turn ||
      !isTeam(plan.ownerTeam) || !Number.isInteger(plan.ownerSeat) || plan.ownerSeat < 0 ||
      plan.ownerSeat > 3 || plan.ownerTeam !== plan.ownerSeat % 2 ||
      physicalSeat(plan.sourceUid) !== plan.ownerSeat ||
      plan.eventId !== 'the-cheerful-coffin:' + plan.turn + ':' + plan.sourceUid ||
      input.active[plan.ownerTeam] !== plan.ownerSeat || !Array.isArray(selectedUids) ||
      selectedUids.length > 3 ||
      selectedUids.some(uid => typeof uid !== 'string' || !uid) ||
      new Set(selectedUids).size !== selectedUids.length) return null;

  const receipts = (input as ReceiptState).cheerfulCoffinResolvedEvents ?? [];
  if (!Array.isArray(receipts) || receipts.includes(plan.eventId)) return null;
  const source = input.core.players[plan.ownerTeam].grave.find(card =>
    card.uid === plan.sourceUid && card.id === cardId && card.entityKind !== 'token');
  if (!source) return null;

  const negated = options.negated === true;
  if (negated && selectedUids.length !== 0) return null;
  const hand = privateHandForSeat(input, plan.ownerSeat);
  const selected = selectedUids.map(uid => hand.find(card => card.uid === uid));
  if (selected.some(card => !card || !isMonsterCard(card))) return null;

  const before = inventorySignature(input);
  const next = structuredClone(input);
  const nextHand = privateHandForSeat(next, plan.ownerSeat);
  const discardedUids: string[] = [];
  if (!negated) {
    for (const uid of selectedUids) {
      const index = nextHand.findIndex(card => card.uid === uid);
      if (index < 0) return null;
      const [monster] = nextHand.splice(index, 1);
      next.core.players[plan.ownerTeam].grave.push(monster);
      discardedUids.push(monster.uid);
    }
  }
  const nextReceipts = (next as ReceiptState).cheerfulCoffinResolvedEvents ?? [];
  (next as ReceiptState).cheerfulCoffinResolvedEvents = [...nextReceipts, plan.eventId].slice(-256);
  assertCheerfulCoffinRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, discardedUids, negated };
}
