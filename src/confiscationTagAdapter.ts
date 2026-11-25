import type { CardRef } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { rulesFor } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';
import { assertTagInventoryUnchanged, tagInventorySignature, tagPhysicalSeat, tagPrivateHandForSeat, tagPrivateHandOwnedBySeat } from './tagPrivateHand';

export const CONFISCATION_ID = '17375316';
const COST_LP = 1000;
type Seat = 0 | 1 | 2 | 3;
type Team = 0 | 1;

export type ConfiscationPlan = {
  eventId: string;
  sourceUid: string;
  sourceId: string;
  ownerSeat: Seat;
  ownerTeam: Team;
  opponentSeat: Seat;
  opponentTeam: Team;
  turn: number;
};
export type ConfiscationActivation = { state: TagDuel; plan: ConfiscationPlan };
export type ConfiscationPrivateHand = {
  privateToSeat: Seat;
  opponentSeat: Seat;
  cards: Array<{ uid: string; id: string }>;
};
export type ConfiscationResolution = {
  state: TagDuel;
  discardedUid: string | null;
  discardedId: string | null;
  negated: boolean;
  noCardToDiscard: boolean;
};
type ReceiptState = TagDuel & { confiscationResolvedEvents?: string[] };

function isTeam(value: unknown): value is Team { return value === 0 || value === 1; }
function isSeat(value: unknown): value is Seat {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}
function isSpellCardId(cardId: string): boolean {
  if (cardId === CONFISCATION_ID) return true;
  const metadata = getDuelCard(cardId);
  return metadata?.kind === 'spell' && metadata.field !== true;
}

/** Enforces the owner's physical deck/zone profile without truncating hands or Decks. */
export function assertConfiscationRules(duel: TagDuel): void {
  assertTagDuel(duel);
  if (duel.mode !== 'tag-classic') throw new Error('Confiscation exige TagDuel clássico.');
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
    const seat = tagPhysicalSeat(ref.uid);
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
    if (extra[seat] > rules.extraDeckMax) {
      throw new Error('Deck Adicional físico excede cinco cartas.');
    }
  }
  for (const team of duel.core.players) {
    if (team.monsters.length > rules.monsterZones) {
      throw new Error('Equipe excedeu as três Zonas de Monstros.');
    }
    if (team.backrow.length > rules.spellTrapZones) {
      throw new Error('Equipe excedeu as três Zonas de Magias/Armadilhas.');
    }
    // A Field Zone é independente e não consome uma das três zonas de S/T.
  }
}

function activeMainHandSource(
  duel: TagDuel,
  sourceUid: string,
  cardId: string,
): { team: Team; seat: Seat; opponentTeam: Team; opponentSeat: Seat } | null {
  const core = duel.core;
  if (core.phase !== 'main' || core.pending.kind !== 'none' || core.chain.length !== 0 ||
      core.turnEnding || core.handFlow || core.choice || core.damageStep === true ||
      typeof sourceUid !== 'string' || !sourceUid) return null;
  const team = core.current as Team;
  const seat = duel.cursor as Seat;
  if (!isTeam(team) || !isSeat(seat) || seat % 2 !== team ||
      duel.active[team] !== seat || duel.members[seat]?.team !== team) return null;
  const opponentTeam = (1 - team) as Team;
  const opponentSeat = duel.active[opponentTeam];
  if (!isSeat(opponentSeat) || duel.members[opponentSeat]?.team !== opponentTeam) return null;
  const source = tagPrivateHandForSeat(duel, seat).find(card =>
    card.uid === sourceUid && card.id === cardId && card.entityKind !== 'token');
  if (!source || tagPhysicalSeat(source.uid) !== seat || !isSpellCardId(cardId)) return null;
  if (tagPrivateHandForSeat(duel, opponentSeat).length === 0) return null;
  // Costs are paid from the shared team LP pool; the core also forbids a cost
  // that would reduce the team to zero LP.
  if (core.players[team].lp <= COST_LP) return null;
  return { team, seat, opponentTeam, opponentSeat };
}

function validPlan(duel: TagDuel, plan: ConfiscationPlan, cardId: string): boolean {
  if (!plan || typeof plan.eventId !== 'string' || !plan.eventId.trim() ||
      plan.sourceId !== cardId || !Number.isSafeInteger(plan.turn) ||
      plan.turn !== duel.core.turn || !isTeam(plan.ownerTeam) || !isSeat(plan.ownerSeat) ||
      plan.ownerTeam !== plan.ownerSeat % 2 || tagPhysicalSeat(plan.sourceUid) !== plan.ownerSeat ||
      !isTeam(plan.opponentTeam) || plan.opponentTeam !== 1 - plan.ownerTeam ||
      !isSeat(plan.opponentSeat) || plan.opponentSeat % 2 !== plan.opponentTeam ||
      duel.active[plan.ownerTeam] !== plan.ownerSeat ||
      duel.active[plan.opponentTeam] !== plan.opponentSeat) return false;
  return plan.eventId === 'confiscation:' + plan.turn + ':' + plan.sourceUid + ':' + plan.opponentSeat;
}
function sourceInGrave(duel: TagDuel, plan: ConfiscationPlan, cardId: string): boolean {
  return duel.core.players[plan.ownerTeam].grave.some(card =>
    card.uid === plan.sourceUid && card.id === cardId && card.entityKind !== 'token' &&
    tagPhysicalSeat(card.uid) === plan.ownerSeat);
}

/** Pays 1000 shared LP and sends the Normal Spell to the team's GY at activation. */
export function activateConfiscation(
  input: TagDuel,
  sourceUid: string,
  options: { cardId?: string } = {},
): ConfiscationActivation | null {
  assertConfiscationRules(input);
  const cardId = options.cardId ?? CONFISCATION_ID;
  const active = activeMainHandSource(input, sourceUid, cardId);
  if (!active) return null;

  const before = tagInventorySignature(input);
  const next = structuredClone(input);
  const hand = tagPrivateHandForSeat(next, active.seat);
  const index = hand.findIndex(card => card.uid === sourceUid && card.id === cardId);
  if (index < 0) return null;
  const [spell] = hand.splice(index, 1);
  next.core.players[active.team].lp -= COST_LP;
  next.core.players[active.team].grave.push(spell);

  const plan: ConfiscationPlan = {
    eventId: 'confiscation:' + next.core.turn + ':' + sourceUid + ':' + active.opponentSeat,
    sourceUid,
    sourceId: cardId,
    ownerSeat: active.seat,
    ownerTeam: active.team,
    opponentSeat: active.opponentSeat,
    opponentTeam: active.opponentTeam,
    turn: next.core.turn,
  };
  assertConfiscationRules(next);
  assertTagInventoryUnchanged(before, next);
  assertTagDuel(next);
  return { state: next, plan };
}

/** Returns the opponent's current active-seat hand for an ephemeral, private UI response.
 * The caller must deliver this payload only to privateToSeat; it is never written to state. */
export function inspectConfiscationHand(
  input: TagDuel,
  plan: ConfiscationPlan,
  options: { cardId?: string } = {},
): ConfiscationPrivateHand | null {
  assertConfiscationRules(input);
  const cardId = options.cardId ?? CONFISCATION_ID;
  if (!validPlan(input, plan, cardId) || !sourceInGrave(input, plan, cardId)) return null;
  const receipts = (input as ReceiptState).confiscationResolvedEvents ?? [];
  if (!Array.isArray(receipts) || receipts.includes(plan.eventId)) return null;
  if (!tagPrivateHandOwnedBySeat(input, plan.opponentSeat)) return null;
  const hand = tagPrivateHandForSeat(input, plan.opponentSeat);
  return {
    privateToSeat: plan.ownerSeat,
    opponentSeat: plan.opponentSeat,
    cards: hand.map(card => ({ uid: card.uid, id: card.id })),
  };
}

/** Confiscation does not target at activation: the active opponent's current hand is
 * inspected at resolution and the selected physical card is discarded to its team's GY. */
export function resolveConfiscation(
  input: TagDuel,
  plan: ConfiscationPlan,
  selectedUid: string | null,
  options: { negated?: boolean; cardId?: string } = {},
): ConfiscationResolution | null {
  assertConfiscationRules(input);
  const cardId = options.cardId ?? CONFISCATION_ID;
  if (!validPlan(input, plan, cardId) || !sourceInGrave(input, plan, cardId)) return null;
  const receipts = (input as ReceiptState).confiscationResolvedEvents ?? [];
  if (!Array.isArray(receipts) || receipts.includes(plan.eventId)) return null;

  const hand = tagPrivateHandForSeat(input, plan.opponentSeat);
  const negated = options.negated === true;
  if (negated) {
    if (selectedUid !== null) return null;
  } else if (hand.length === 0) {
    if (selectedUid !== null) return null;
  } else {
    if (typeof selectedUid !== 'string' || !selectedUid) return null;
    const selected = hand.find(card => card.uid === selectedUid);
    if (!selected || selected.entityKind === 'token' ||
        tagPhysicalSeat(selected.uid) !== plan.opponentSeat) return null;
  }

  const before = tagInventorySignature(input);
  const next = structuredClone(input);
  let discardedUid: string | null = null;
  let discardedId: string | null = null;
  if (!negated && selectedUid !== null) {
    const nextHand = tagPrivateHandForSeat(next, plan.opponentSeat);
    const index = nextHand.findIndex(card => card.uid === selectedUid);
    if (index < 0) return null;
    const [discarded] = nextHand.splice(index, 1);
    next.core.players[plan.opponentTeam].grave.push(discarded);
    discardedUid = discarded.uid;
    discardedId = discarded.id;
  }
  const nextReceipts = (next as ReceiptState).confiscationResolvedEvents ?? [];
  (next as ReceiptState).confiscationResolvedEvents = [...nextReceipts, plan.eventId].slice(-256);
  assertConfiscationRules(next);
  assertTagInventoryUnchanged(before, next);
  assertTagDuel(next);
  return {
    state: next,
    discardedUid,
    discardedId,
    negated,
    noCardToDiscard: !negated && discardedUid === null,
  };
}
