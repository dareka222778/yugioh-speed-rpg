import type { CardRef } from './duelEngine';
import type { TagDuel } from './tagDuel';
import { assertTagDuel, tagInventory } from './tagDuel';
import { getDuelCard } from './effectRegistry';
import { ownedPrivateZone } from './teamRotation';
import { shuffleDuel } from './duelRandom';
import { RULES_PROFILE } from './rulesProfile';

export const BIRDFACE_ID = '45547649';
export const KELDO_ID = '80441106';
export const HARPIE_LADY_ID = '76812113';

type Team = 0 | 1;
type AdapterIds = {
  birdfaceId?: string;
  keldoId?: string;
  harpieLadyId?: string;
};
type CardSnapshot = Pick<CardRef, 'uid' | 'id'>;

export type BattleDestroyedEvent = {
  cardUid: string;
  destroyedByBattle: boolean;
  sentToGrave: boolean;
  damageStepComplete: boolean;
};

type BattleDestroyedBase = {
  sourceUid: string;
  sourceId: string;
  ownerSeat: number;
  ownerTeam: Team;
  turn: number;
};

export type BirdfacePlan = BattleDestroyedBase & { kind: 'birdface' };
export type KeldoPlan = BattleDestroyedBase & {
  kind: 'keldo';
  candidates: readonly CardSnapshot[];
};
export type BattleDestroyedPlan = BirdfacePlan | KeldoPlan;

export type BirdfaceResolution = {
  state: TagDuel;
  searched: boolean;
  movedUid: string | null;
  negated: boolean;
};
export type KeldoResolution = {
  state: TagDuel;
  movedUids: string[];
  negated: boolean;
};

function adapterIds(ids: AdapterIds = {}) {
  return {
    birdfaceId: ids.birdfaceId ?? BIRDFACE_ID,
    keldoId: ids.keldoId ?? KELDO_ID,
    harpieLadyId: ids.harpieLadyId ?? HARPIE_LADY_ID,
  };
}

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido: ' + uid);
  return Number(match[1]);
}

function validTeam(team: number): team is Team {
  return team === 0 || team === 1;
}

function assertClassic(duel: TagDuel): void {
  if (!duel || duel.mode !== 'tag-classic') throw new Error('O adapter exige TagDuel clássico.');
  assertTagDuel(duel);
  if (!duel.core.teamRotation || duel.core.players.length !== 2 ||
      duel.members.length !== 4 || duel.active.length !== 2 ||
      !Array.isArray(duel.core.chain)) {
    throw new Error('Estrutura física TagDuel incompleta.');
  }
}

function inventorySnapshot(duel: TagDuel): Map<string, string> {
  const result = new Map<string, string>();
  for (const card of tagInventory(duel).filter(card => card.entityKind !== 'token')) {
    const seat = physicalSeat(card.uid);
    if (duel.members[seat]?.team !== seat % 2) throw new Error('Proprietário físico incompatível com o UID.');
    if (result.has(card.uid)) throw new Error('UID físico duplicado: ' + card.uid);
    result.set(card.uid, card.id);
  }
  return result;
}

function assertSameInventory(before: Map<string, string>, duel: TagDuel): void {
  const after = inventorySnapshot(duel);
  if (after.size !== before.size) throw new Error('O adapter alterou a quantidade de cartas físicas.');
  for (const [uid, id] of before) {
    if (after.get(uid) !== id) throw new Error('O adapter alterou a identidade física: ' + uid);
  }
}

/** Fusion cards remain part of their owner's Extra Deck even while in the GY.
 * The Main Deck count remains 20–30 per physical seat; the Extra Deck stays <= 5. */
function assertPhysicalRules(duel: TagDuel): void {
  assertClassic(duel);
  for (let team = 0; team < 2; team++) {
    const player = duel.core.players[team];
    if (player.monsters.length > RULES_PROFILE.monsterZones) throw new Error('A equipe excedeu três Monster Zones.');
    if (player.backrow.length > RULES_PROFILE.spellTrapZones) throw new Error('A equipe excedeu três Spell/Trap Zones.');
  }
  const mainCounts = [0, 0, 0, 0];
  const extraCounts = [0, 0, 0, 0];
  for (const card of tagInventory(duel)) {
    if (card.entityKind === 'token') continue;
    const seat = physicalSeat(card.uid);
    if (getDuelCard(card.id)?.fusion) extraCounts[seat]++;
    else mainCounts[seat]++;
  }
  for (let seat = 0; seat < 4; seat++) {
    if (mainCounts[seat] < RULES_PROFILE.mainDeckMin || mainCounts[seat] > RULES_PROFILE.mainDeckMax) {
      throw new Error('Deck Principal físico fora de 20–30 no assento ' + seat + '.');
    }
    if (extraCounts[seat] > RULES_PROFILE.extraDeckMax) {
      throw new Error('Deck Adicional excedeu cinco cartas no assento ' + seat + '.');
    }
  }
}

function validPlanOwner(plan: BattleDestroyedBase): boolean {
  const match = /^m([0-3]):/.exec(plan.sourceUid);
  return !!match && Number(match[1]) === plan.ownerSeat &&
    plan.ownerTeam === (plan.ownerSeat % 2) && validTeam(plan.ownerTeam);
}

/** Only the post-damage-step event for a card actually present in its owner's
 * shared GY can create either trigger. Destruction by effect or a replacement
 * destination such as banishment is deliberately excluded. */
export function prepareBattleDestroyedTrigger(
  duel: TagDuel,
  event: BattleDestroyedEvent,
  ids: AdapterIds = {},
): BattleDestroyedPlan | null {
  assertPhysicalRules(duel);
  if (!event || typeof event.cardUid !== 'string' || !event.cardUid ||
      event.destroyedByBattle !== true || event.sentToGrave !== true ||
      event.damageStepComplete !== true) return null;

  const source = duel.core.players.flatMap(player => player.grave)
    .find(card => card.uid === event.cardUid && card.entityKind !== 'token');
  if (!source) return null;
  const ownerSeat = physicalSeat(source.uid);
  const ownerTeam = (ownerSeat % 2) as Team;
  if (duel.members[ownerSeat]?.team !== ownerTeam ||
      !duel.core.players[ownerTeam].grave.some(card => card.uid === source.uid && card.id === source.id)) {
    return null;
  }

  const { birdfaceId, keldoId, harpieLadyId } = adapterIds(ids);
  const base: BattleDestroyedBase = {
    sourceUid: source.uid,
    sourceId: source.id,
    ownerSeat,
    ownerTeam,
    turn: duel.core.turn,
  };

  if (source.id === birdfaceId) {
    const deck = ownedPrivateZone(duel.core, source, ownerTeam, 'deck');
    if (!deck.some(card => card.id === harpieLadyId && !getDuelCard(card.id)?.fusion)) return null;
    return Object.freeze({ ...base, kind: 'birdface' });
  }

  if (source.id === keldoId) {
    const opponentTeam = (1 - ownerTeam) as Team;
    const candidates = duel.core.players[opponentTeam].grave
      .filter(card => card.entityKind !== 'token' && physicalSeat(card.uid) % 2 === opponentTeam)
      .map(card => ({ uid: card.uid, id: card.id }));
    if (candidates.length < 2) return null;
    return Object.freeze({ ...base, kind: 'keldo', candidates: Object.freeze(candidates) });
  }

  return null;
}

function validResolutionBase(
  duel: TagDuel,
  plan: BattleDestroyedBase,
  expectedSourceId: string,
): boolean {
  return !!plan && typeof plan.sourceUid === 'string' && plan.sourceId === expectedSourceId &&
    plan.turn === duel.core.turn && validPlanOwner(plan);
}

/** Birdface searches the physical owner's private Deck and returns Harpie Lady
 * to that same seat's private hand, including an inactive partner's reserve.
 * The post-search shuffle consumes the persisted HMAC random stream. */
export function resolveBirdface(
  input: TagDuel,
  plan: BirdfacePlan,
  negated = false,
  ids: AdapterIds = {},
): BirdfaceResolution | null {
  assertPhysicalRules(input);
  const { birdfaceId, harpieLadyId } = adapterIds(ids);
  if (!plan || plan.kind !== 'birdface' || !validResolutionBase(input, plan, birdfaceId)) return null;

  const before = inventorySnapshot(input);
  const next = structuredClone(input);
  let movedUid: string | null = null;
  if (!negated) {
    const source: CardSnapshot = { uid: plan.sourceUid, id: plan.sourceId };
    const deck = ownedPrivateZone(next.core, source, plan.ownerTeam, 'deck');
    const hand = ownedPrivateZone(next.core, source, plan.ownerTeam, 'hand');
    const index = deck.findIndex(card => card.id === harpieLadyId && !getDuelCard(card.id)?.fusion);
    if (index >= 0) {
      const [card] = deck.splice(index, 1);
      hand.push(card);
      shuffleDuel(deck, next.core);
      movedUid = card.uid;
    }
  }

  next.reserves = next.core.teamRotation!.reserves as TagDuel['reserves'];
  assertTagDuel(next);
  assertPhysicalRules(next);
  assertSameInventory(before, next);
  return { state: next, searched: movedUid !== null, movedUid, negated };
}

/** Keldo targets exactly two cards in the opposing shared GY. Each target is
 * returned to its physical owner's private Deck; Fusion cards go to that
 * owner's Extra Deck. Every affected Main Deck is shuffled once via HMAC. */
export function resolveKeldo(
  input: TagDuel,
  plan: KeldoPlan,
  selectedUids: readonly string[],
  negated = false,
  ids: AdapterIds = {},
): KeldoResolution | null {
  assertPhysicalRules(input);
  const { keldoId } = adapterIds(ids);
  if (!plan || plan.kind !== 'keldo' || !validResolutionBase(input, plan, keldoId) ||
      !Array.isArray(plan.candidates) || !Array.isArray(selectedUids) ||
      selectedUids.length !== 2 || new Set(selectedUids).size !== 2) return null;

  const chosen = selectedUids.map(uid => plan.candidates.find(card => card.uid === uid));
  if (chosen.some(card => !card)) return null;

  const before = inventorySnapshot(input);
  const next = structuredClone(input);
  const opponentTeam = (1 - plan.ownerTeam) as Team;
  const grave = next.core.players[opponentTeam].grave;
  const decksToShuffle = new Map<number, CardRef[]>();
  const movedUids: string[] = [];

  if (!negated) {
    for (const candidate of chosen as CardSnapshot[]) {
      const index = grave.findIndex(card =>
        card.uid === candidate.uid && card.id === candidate.id &&
        card.entityKind !== 'token' && physicalSeat(card.uid) % 2 === opponentTeam
      );
      if (index < 0) continue; // A target that left the GY before resolution is not moved.
      const [card] = grave.splice(index, 1);
      const seat = physicalSeat(card.uid);
      if (getDuelCard(card.id)?.fusion) {
        ownedPrivateZone(next.core, card, opponentTeam, 'extra').push(card);
      } else {
        const deck = ownedPrivateZone(next.core, card, opponentTeam, 'deck');
        deck.push(card);
        decksToShuffle.set(seat, deck);
      }
      movedUids.push(card.uid);
    }
    for (const deck of decksToShuffle.values()) shuffleDuel(deck, next.core);
  }

  next.reserves = next.core.teamRotation!.reserves as TagDuel['reserves'];
  assertTagDuel(next);
  assertPhysicalRules(next);
  assertSameInventory(before, next);
  return { state: next, movedUids, negated };
}
