import type { DuelState, Monster, CardRef } from './duelEngine';
import type { TagDuel } from './tagDuel';
import { assertTagDuel, tagInventory } from './tagDuel';
import { getDuelCard } from './effectRegistry';
import { continuousModifier, monsterEffectsNegated } from './continuousEffects';
import { RULES_PROFILE } from './rulesProfile';

export const BANISHER_OF_THE_LIGHT_ID = '61528025';
export const BAZOO_THE_SOUL_EATER_ID = '40133511';
export const BAZOO_BASE_ATK = 1600;

type Team = 0 | 1;
type DestinationZone = 'grave' | 'banished' | 'vanish';
type AdapterIds = {
  banisherId?: string;
  bazooId?: string;
  bazooBaseAtk?: number;
};

export type TagGraveDestination = {
  zone: DestinationZone;
  ownerSeat: number;
  ownerTeam: Team;
  replacement: 'none' | 'banisher-of-the-light' | 'token-ceases-to-exist';
};

export type BazooCandidate = Pick<CardRef, 'uid' | 'id'>;
export type BazooPlan = {
  sourceUid: string;
  controllerTeam: Team;
  turn: number;
  candidates: readonly BazooCandidate[];
};
export type BazooActivation = {
  sourceUid: string;
  controllerTeam: Team;
  turn: number;
  banishedCount: number;
};
export type BazooActivationResult = {
  state: TagDuel;
  activation: BazooActivation;
};

function adapterIds(ids: AdapterIds = {}) {
  return {
    banisherId: ids.banisherId ?? BANISHER_OF_THE_LIGHT_ID,
    bazooId: ids.bazooId ?? BAZOO_THE_SOUL_EATER_ID,
    bazooBaseAtk: ids.bazooBaseAtk ?? BAZOO_BASE_ATK,
  };
}

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido: ' + uid);
  return Number(match[1]);
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

function assertPhysicalRules(duel: TagDuel): void {
  assertClassic(duel);
  const all = inventorySnapshot(duel);
  const extra = new Set<string>();
  const mainCounts = [0, 0, 0, 0];
  const extraCounts = [0, 0, 0, 0];
  for (let team = 0; team < 2; team++) {
    const player = duel.core.players[team];
    if (player.monsters.length > RULES_PROFILE.monsterZones) throw new Error('A equipe excedeu três Monster Zones.');
    if (player.backrow.length > RULES_PROFILE.spellTrapZones) throw new Error('A equipe excedeu três Spell/Trap Zones.');
    for (const card of player.extra ?? []) {
      const seat = physicalSeat(card.uid);
      extra.add(card.uid);
      extraCounts[seat]++;
    }
  }
  for (const [seatKey, held] of Object.entries(duel.reserves)) {
    const seat = Number(seatKey);
    if (!/^\d$/.test(seatKey) || seat > 3 || duel.active.includes(seat)) throw new Error('Assento físico de reserva inválido.');
    for (const card of held.extra ?? []) {
      const owner = physicalSeat(card.uid);
      extra.add(card.uid);
      extraCounts[owner]++;
    }
  }
  for (const uid of all.keys()) if (!extra.has(uid)) mainCounts[physicalSeat(uid)]++;
  for (let seat = 0; seat < 4; seat++) {
    if (mainCounts[seat] < RULES_PROFILE.mainDeckMin || mainCounts[seat] > RULES_PROFILE.mainDeckMax) {
      throw new Error('Deck Principal físico fora de 20–30 no assento ' + seat + '.');
    }
    if (extraCounts[seat] > RULES_PROFILE.extraDeckMax) throw new Error('Deck Adicional excedeu cinco cartas no assento ' + seat + '.');
  }
}

function validTeam(team: number): team is Team {
  return team === 0 || team === 1;
}

/** Banisher is global: a face-up, non-negated copy on either field replaces
 * any pending move to the GY for both teams. Tokens are not cards and vanish. */
export function banisherOfTheLightApplies(duel: TagDuel, ids: AdapterIds = {}): boolean {
  assertClassic(duel);
  const { banisherId } = adapterIds(ids);
  return duel.core.players.some(player => player.monsters.some(monster =>
    monster.id === banisherId && monster.faceUp && !monsterEffectsNegated(duel.core, monster.uid)
  ));
}

/** Resolve the physical owner and replacement destination without mutating state.
 * Callers must use this before placing a card that would otherwise enter a GY. */
export function tagGraveDestination(
  duel: TagDuel,
  cardUid: string,
  ids: AdapterIds = {},
): TagGraveDestination | null {
  assertClassic(duel);
  if (typeof cardUid !== 'string' || !cardUid) return null;
  const card = tagInventory(duel).find(item => item.uid === cardUid);
  if (!card) return null;
  const ownerSeat = physicalSeat(cardUid);
  const ownerTeam = (ownerSeat % 2) as Team;
  if (duel.members[ownerSeat]?.team !== ownerTeam) throw new Error('Proprietário físico não corresponde ao UID.');
  if (card.entityKind === 'token') {
    return { zone: 'vanish', ownerSeat, ownerTeam, replacement: 'token-ceases-to-exist' };
  }
  const replaced = banisherOfTheLightApplies(duel, ids);
  return {
    zone: replaced ? 'banished' : 'grave',
    ownerSeat,
    ownerTeam,
    replacement: replaced ? 'banisher-of-the-light' : 'none',
  };
}

/** Build Bazoo's Main Phase prompt from its controller team's shared GY.
 * The card may be controlled by a team other than its physical owner. */
export function prepareBazooActivation(
  duel: TagDuel,
  sourceUid: string,
  controllerTeam: Team,
  ids: AdapterIds = {},
): BazooPlan | null {
  assertPhysicalRules(duel);
  const { bazooId } = adapterIds(ids);
  const core = duel.core;
  if (!validTeam(controllerTeam) || core.current !== controllerTeam ||
      duel.active[controllerTeam] !== duel.cursor || core.phase !== 'main' ||
      core.pending.kind !== 'none' || core.chain.length !== 0 || core.turnEnding ||
      typeof sourceUid !== 'string' || !sourceUid) return null;
  const source = core.players[controllerTeam].monsters.find(monster =>
    monster.uid === sourceUid && monster.id === bazooId && monster.faceUp && monster.entityKind !== 'token'
  );
  if (!source || source.effectUsedTurn === core.turn || monsterEffectsNegated(core, sourceUid)) return null;
  const candidates = core.players[controllerTeam].grave.filter(card => {
    if (!card || card.entityKind === 'token') return false;
    const owner = physicalSeat(card.uid);
    return owner % 2 === controllerTeam && getDuelCard(card.id)?.kind === 'monster';
  }).map(card => ({ uid: card.uid, id: card.id }));
  if (!candidates.length) return null;
  return Object.freeze({
    sourceUid,
    controllerTeam,
    turn: core.turn,
    candidates: Object.freeze(candidates),
  });
}

/** Pay Bazoo's direct banish cost at activation. The selected physical cards
 * move from the team's shared GY to that team's banished zone exactly once. */
export function activateBazoo(
  input: TagDuel,
  plan: BazooPlan,
  selectedUids: readonly string[],
  ids: AdapterIds = {},
): BazooActivationResult | null {
  assertPhysicalRules(input);
  const { bazooId } = adapterIds(ids);
  if (!plan || plan.turn !== input.core.turn || plan.controllerTeam !== input.core.current ||
      !validTeam(plan.controllerTeam) || !Array.isArray(selectedUids) ||
      selectedUids.length < 1 || selectedUids.length > 3 ||
      new Set(selectedUids).size !== selectedUids.length) return null;
  const source = input.core.players[plan.controllerTeam].monsters.find(monster =>
    monster.uid === plan.sourceUid && monster.id === bazooId && monster.faceUp
  );
  if (!source || source.effectUsedTurn === input.core.turn || monsterEffectsNegated(input.core, source.uid)) return null;
  const chosen = selectedUids.map(uid => plan.candidates.find(card => card.uid === uid));
  if (chosen.some(card => !card)) return null;
  const beforeInventory = inventorySnapshot(input);
  const next = structuredClone(input);
  const player = next.core.players[plan.controllerTeam];
  const sourceNext = player.monsters.find(monster => monster.uid === plan.sourceUid);
  if (!sourceNext) return null;
  player.banished ??= [];
  for (const candidate of chosen as BazooCandidate[]) {
    const index = player.grave.findIndex(card => card.uid === candidate.uid && card.id === candidate.id);
    if (index < 0 || physicalSeat(candidate.uid) % 2 !== plan.controllerTeam) return null;
    const [card] = player.grave.splice(index, 1);
    player.banished.push({ uid: card.uid, id: card.id, ...(card.properlySummoned ? { properlySummoned: true } : {}) });
  }
  sourceNext.effectUsedTurn = next.core.turn;
  next.reserves = next.core.teamRotation!.reserves as TagDuel['reserves'];
  assertTagDuel(next);
  assertPhysicalRules(next);
  assertSameInventory(beforeInventory, next);
  return {
    state: next,
    activation: {
      sourceUid: plan.sourceUid,
      controllerTeam: plan.controllerTeam,
      turn: plan.turn,
      banishedCount: selectedUids.length,
    },
  };
}

/** Resolve the ATK gain after the activation chain. A negated effect or a
 * source that left the field keeps the paid cost but receives no modifier. */
export function resolveBazooActivation(
  input: TagDuel,
  activation: BazooActivation,
  negated = false,
  ids: AdapterIds = {},
): TagDuel | null {
  assertPhysicalRules(input);
  const { bazooId } = adapterIds(ids);
  if (!activation || activation.turn !== input.core.turn ||
      !validTeam(activation.controllerTeam) ||
      !Number.isInteger(activation.banishedCount) ||
      activation.banishedCount < 1 || activation.banishedCount > 3) return null;
  const next = structuredClone(input);
  const source = next.core.players.flatMap(player => player.monsters).find(monster =>
    monster.uid === activation.sourceUid && monster.id === bazooId && monster.faceUp
  );
  if (!negated && source && !monsterEffectsNegated(next.core, source.uid)) {
    const ledger = next.core.continuousState ??= { next: 0, sources: {}, temporary: [] };
    ledger.temporary.push({
      sequence: ++ledger.next,
      uid: source.uid,
      epoch: next.core.cardLifetimes?.[source.uid]?.epoch ?? 0,
      atk: 300 * activation.banishedCount,
      def: 0,
      expiresTurn: activation.turn + 1,
    });
  }
  next.reserves = next.core.teamRotation!.reserves as TagDuel['reserves'];
  assertTagDuel(next);
  assertPhysicalRules(next);
  return next;
}

/** Effective ATK includes the temporary modifier through the end of the
 * opponent's next turn, then naturally returns to the printed value. */
export function bazooEffectiveAtk(
  duel: TagDuel,
  sourceUid: string,
  ids: AdapterIds = {},
): number | null {
  assertClassic(duel);
  const { bazooId, bazooBaseAtk } = adapterIds(ids);
  const source = duel.core.players.flatMap(player => player.monsters).find(monster =>
    monster.uid === sourceUid && monster.id === bazooId
  );
  if (!source || !source.faceUp) return null;
  return bazooBaseAtk + source.atkBoost + continuousModifier(duel.core, source, 'atk');
}
