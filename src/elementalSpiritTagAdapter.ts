import type { Card } from './cardCatalog';
import type { DuelState, Monster } from './duelEngine';
import type { TagDuel } from './tagDuel';
import { tagInventory } from './tagDuel';
import { RULES_PROFILE } from './rulesProfile';

export const SPIRIT_OF_FLAMES_ID = '13522325';
export const THE_ROCK_SPIRIT_ID = '76305638';
export const GARUDA_THE_WIND_SPIRIT_ID = '12800777';

type Team = 0 | 1;
type ElementalSpiritId =
  | typeof SPIRIT_OF_FLAMES_ID
  | typeof THE_ROCK_SPIRIT_ID
  | typeof GARUDA_THE_WIND_SPIRIT_ID;

type PhysicalCard = {
  uid: string;
  id: string;
  properlySummoned?: boolean;
  entityKind?: 'token';
};

export type ElementalSpiritSummonPlan = {
  team: Team;
  activeSeat: number;
  source: PhysicalCard;
  costCandidates: readonly PhysicalCard[];
};

export type GarudaEndPhaseWindow = {
  phase: 'opponent-end';
  activeTeam: Team;
};

const spiritAttributes: Readonly<Record<ElementalSpiritId, string>> = {
  [SPIRIT_OF_FLAMES_ID]: 'FIRE',
  [THE_ROCK_SPIRIT_ID]: 'EARTH',
  [GARUDA_THE_WIND_SPIRIT_ID]: 'WIND',
};

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido: ' + uid);
  return Number(match[1]);
}

function assertClassicShape(duel: TagDuel): void {
  if (!duel || duel.mode !== 'tag-classic' || !duel.core ||
      !Array.isArray(duel.core.players) || duel.core.players.length !== 2 ||
      !Array.isArray(duel.active) || duel.active.length !== 2 ||
      !Array.isArray(duel.members) || duel.members.length !== 4 ||
      !Array.isArray(duel.core.chain) || !duel.reserves ||
      !Number.isInteger(duel.cursor) || duel.cursor < 0 || duel.cursor > 3 ||
      duel.active.some((seat, team) => !Number.isInteger(seat) || seat < 0 || seat > 3 || seat % 2 !== team)) {
    throw new Error('Estado TagDuel clássico inválido.');
  }
}

function inventorySnapshot(duel: TagDuel): Map<string, string> {
  const result = new Map<string, string>();
  for (const card of tagInventory(duel).filter(card => card.entityKind !== 'token')) {
    const seat = physicalSeat(card.uid);
    if (duel.members[seat]?.team !== seat % 2) throw new Error('Proprietário físico fora da equipe do UID.');
    if (result.has(card.uid)) throw new Error('UID físico duplicado: ' + card.uid);
    result.set(card.uid, card.id);
  }
  return result;
}

function handSnapshot(duel: TagDuel): Map<string, string> {
  const result = new Map<string, string>();
  for (const player of duel.core.players) for (const card of player.hand) result.set(card.uid, card.id);
  for (const held of Object.values(duel.reserves)) for (const card of held.hand) result.set(card.uid, card.id);
  return result;
}

function assertSameInventory(before: Map<string, string>, duel: TagDuel): void {
  const after = inventorySnapshot(duel);
  if (after.size !== before.size) throw new Error('O adapter alterou a quantidade de cartas físicas.');
  for (const [uid, id] of before) {
    if (after.get(uid) !== id) throw new Error('O adapter alterou a identidade física: ' + uid);
  }
}

function assertHandsAfterSummon(before: Map<string, string>, duel: TagDuel, sourceUid: string): void {
  const after = handSnapshot(duel);
  if (before.size !== after.size + 1 || after.has(sourceUid)) {
    throw new Error('A Invocação-Especial alterou mais de uma carta de mão.');
  }
  for (const [uid, id] of before) {
    if (uid !== sourceUid && after.get(uid) !== id) {
      throw new Error('A Invocação-Especial alterou a mão privada de outro participante.');
    }
  }
}

function assertHandsUnchanged(before: Map<string, string>, duel: TagDuel): void {
  const after = handSnapshot(duel);
  if (before.size !== after.size) throw new Error('O efeito de Garuda alterou uma mão privada.');
  for (const [uid, id] of before) {
    if (after.get(uid) !== id) throw new Error('O efeito de Garuda alterou uma mão privada.');
  }
}

function assertPhysicalRules(duel: TagDuel): void {
  assertClassicShape(duel);
  if (duel.core.current !== 0 && duel.core.current !== 1 ||
      duel.active[duel.core.current] !== duel.cursor ||
      duel.members[duel.cursor]?.team !== duel.core.current) {
    throw new Error('Representante físico ativo fora de sincronia com a equipe.');
  }
  const all = inventorySnapshot(duel);
  const extra = new Set<string>();
  const extraCounts = [0, 0, 0, 0];
  const mainCounts = [0, 0, 0, 0];

  for (let team = 0; team < 2; team++) {
    const player = duel.core.players[team];
    if (player.monsters.length > RULES_PROFILE.monsterZones) throw new Error('A equipe excedeu as três Monster Zones.');
    if (player.backrow.length > RULES_PROFILE.spellTrapZones) throw new Error('A equipe excedeu as três Spell/Trap Zones.');
    for (const card of player.extra ?? []) {
      const seat = physicalSeat(card.uid);
      extra.add(card.uid);
      extraCounts[seat]++;
    }
  }
  for (const [seatKey, held] of Object.entries(duel.reserves)) {
    if (!/^\d$/.test(seatKey) || Number(seatKey) > 3 || duel.active.includes(Number(seatKey))) {
      throw new Error('Assento físico de reserva inválido.');
    }
    for (const card of held.extra ?? []) {
      const seat = physicalSeat(card.uid);
      extra.add(card.uid);
      extraCounts[seat]++;
    }
  }
  for (const [uid] of all) {
    if (!extra.has(uid)) mainCounts[physicalSeat(uid)]++;
  }
  for (let seat = 0; seat < 4; seat++) {
    if (mainCounts[seat] < RULES_PROFILE.mainDeckMin || mainCounts[seat] > RULES_PROFILE.mainDeckMax) {
      throw new Error('Deck Principal físico fora do limite 20–30 no assento ' + seat + '.');
    }
    if (extraCounts[seat] > RULES_PROFILE.extraDeckMax) {
      throw new Error('Deck Adicional físico excedeu cinco cartas no assento ' + seat + '.');
    }
  }
}

function activeSummonSource(duel: TagDuel, sourceUid: string): {
  team: Team;
  activeSeat: number;
  source: PhysicalCard;
} | null {
  assertPhysicalRules(duel);
  const core = duel.core;
  if (core.phase !== 'main' || core.pending.kind !== 'none' || core.chain.length !== 0 ||
      core.turnEnding || typeof sourceUid !== 'string' || !sourceUid) return null;
  const team = core.current as Team;
  const activeSeat = duel.cursor;
  if (duel.active[team] !== activeSeat || duel.members[activeSeat]?.team !== team ||
      core.players[team].monsters.length >= RULES_PROFILE.monsterZones) return null;
  const source = core.players[team].hand.find(card =>
    card.uid === sourceUid && card.entityKind !== 'token' &&
    Object.prototype.hasOwnProperty.call(spiritAttributes, card.id));
  if (!source || physicalSeat(source.uid) !== activeSeat) return null;
  return { team, activeSeat, source };
}

function graveBanishCandidates(
  duel: TagDuel,
  team: Team,
  sourceId: ElementalSpiritId,
  getCard: (id: string) => Card | undefined,
): readonly PhysicalCard[] {
  if (typeof getCard !== 'function') throw new TypeError('A consulta de cartas é obrigatória.');
  const grave = duel.core.players[team].grave;
  const banished = duel.core.players[team].banished ?? [];
  const seen = new Set<string>();
  for (const card of [...grave, ...banished]) {
    if (!card || typeof card.uid !== 'string' || !card.uid || typeof card.id !== 'string' || !card.id) {
      throw new TypeError('Cemitério/banidos contém uma referência física inválida.');
    }
    if (seen.has(card.uid)) throw new Error('UID físico duplicado no Cemitério/banidos.');
    seen.add(card.uid);
    const owner = physicalSeat(card.uid);
    if (duel.members[owner]?.team !== team) throw new Error('A equipe tentou usar carta do Cemitério de outra equipe.');
  }
  const requiredAttribute = spiritAttributes[sourceId];
  return Object.freeze(grave.filter(card => {
    if (card.entityKind === 'token') return false;
    const info = getCard(card.id);
    return info?.kind === 'monster' && info.attribute === requiredAttribute;
  }));
}

/** Build a non-mutating prompt from only the active physical player's private hand
 * and their team's shared Graveyard. A partner's hand is never searched. */
export function prepareElementalSpiritSummon(
  duel: TagDuel,
  sourceUid: string,
  getCard: (id: string) => Card | undefined,
): ElementalSpiritSummonPlan | null {
  const source = activeSummonSource(duel, sourceUid);
  if (!source) return null;
  const costCandidates = graveBanishCandidates(duel, source.team, source.source.id as ElementalSpiritId, getCard);
  if (costCandidates.length === 0) return null;
  return Object.freeze({ ...source, costCandidates });
}

/** Pay exactly one same-Attribute monster from the team's shared Graveyard and
 * Special Summon that exact physical hand copy. The input snapshot is untouched. */
export function payElementalSpiritSummon(
  input: TagDuel,
  sourceUid: string,
  costUid: string,
  getCard: (id: string) => Card | undefined,
  position: 'atk' | 'def' = 'atk',
): TagDuel | null {
  if (position !== 'atk' && position !== 'def') return null;
  const plan = prepareElementalSpiritSummon(input, sourceUid, getCard);
  if (!plan || typeof costUid !== 'string' || !plan.costCandidates.some(card => card.uid === costUid)) return null;

  const beforeInventory = inventorySnapshot(input);
  const beforeHands = handSnapshot(input);
  const next = structuredClone(input);
  const player = next.core.players[plan.team];
  const sourceIndex = player.hand.findIndex(card => card.uid === sourceUid && card.id === plan.source.id);
  const costIndex = player.grave.findIndex(card => card.uid === costUid);
  if (sourceIndex < 0 || costIndex < 0 || player.monsters.length >= RULES_PROFILE.monsterZones) return null;

  const [source] = player.hand.splice(sourceIndex, 1);
  const [cost] = player.grave.splice(costIndex, 1);
  player.banished ??= [];
  player.banished.push(cost);
  const monster: Monster = {
    ...source,
    properlySummoned: true,
    owner: plan.team,
    faceUp: true,
    position,
    entered: next.core.turn,
    lastSummonedTurn: next.core.turn,
    changed: next.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  };
  player.monsters.push(monster);

  assertPhysicalRules(next);
  assertSameInventory(beforeInventory, next);
  assertHandsAfterSummon(beforeHands, next, sourceUid);
  return next;
}

/** Battle-phase ATK modifiers are derived, never stored in atkBoost. */
export function elementalSpiritAtkBonus(
  cardId: string,
  controllerTeam: Team,
  battleTeam: Team,
  phase: DuelState['phase'],
): number {
  if (phase !== 'battle') return 0;
  if (cardId === SPIRIT_OF_FLAMES_ID && controllerTeam === battleTeam) return 300;
  if (cardId === THE_ROCK_SPIRIT_ID && controllerTeam !== battleTeam) return 300;
  return 0;
}

export function elementalSpiritEffectiveAtk(
  monster: Pick<Monster, 'id' | 'faceUp'>,
  baseAtk: number,
  controllerTeam: Team,
  battleTeam: Team,
  phase: DuelState['phase'],
): number {
  if (!Number.isSafeInteger(baseAtk) || baseAtk < 0) throw new RangeError('ATK base inválido.');
  return baseAtk + (monster.faceUp
    ? elementalSpiritAtkBonus(monster.id, controllerTeam, battleTeam, phase)
    : 0);
}

function garudaSource(duel: TagDuel, sourceUid: string): { team: Team; monster: Monster } | null {
  for (const team of [0, 1] as const) {
    const monster = duel.core.players[team].monsters.find(card => card.uid === sourceUid);
    if (monster) {
      if (monster.id !== GARUDA_THE_WIND_SPIRIT_ID || !monster.faceUp ||
          physicalSeat(monster.uid) % 2 !== team) return null;
      return { team, monster };
    }
  }
  return null;
}

/** Garuda is offered only in the opponent's End Phase. The caller supplies this
 * explicit timing window because the current resolver has no public End Phase hook. */
export function garudaEndPhaseTargets(
  duel: TagDuel,
  sourceUid: string,
  window: GarudaEndPhaseWindow,
): readonly Monster[] {
  assertPhysicalRules(duel);
  if (!window || window.phase !== 'opponent-end' ||
      (window.activeTeam !== 0 && window.activeTeam !== 1) ||
      window.activeTeam !== duel.core.current) return Object.freeze([]);
  const source = garudaSource(duel, sourceUid);
  if (!source || window.activeTeam === source.team || source.monster.effectUsedTurn === duel.core.turn) {
    return Object.freeze([]);
  }
  const opponent = (1 - source.team) as Team;
  const targets = duel.core.players[opponent].monsters.filter(monster => {
    if (!monster.faceUp || (monster.position !== 'atk' && monster.position !== 'def')) return false;
    const lock = monster.positionLockedThrough;
    if (lock !== undefined && (!Number.isSafeInteger(lock) || lock >= duel.core.turn)) return false;
    return true;
  });
  return Object.freeze(targets);
}

/** Resolve one selected face-up opposing monster; once-per-turn is per Garuda copy. */
export function resolveGarudaPositionChange(
  input: TagDuel,
  sourceUid: string,
  targetUid: string,
  window: GarudaEndPhaseWindow,
): TagDuel | null {
  const targets = garudaEndPhaseTargets(input, sourceUid, window);
  if (!targets.some(monster => monster.uid === targetUid)) return null;
  const beforeInventory = inventorySnapshot(input);
  const beforeHands = handSnapshot(input);
  const next = structuredClone(input);
  const source = garudaSource(next, sourceUid);
  if (!source) return null;
  const target = next.core.players[(1 - source.team) as Team].monsters.find(monster => monster.uid === targetUid);
  if (!target) return null;
  source.monster.effectUsedTurn = next.core.turn;
  target.position = target.position === 'atk' ? 'def' : 'atk';
  assertPhysicalRules(next);
  assertSameInventory(beforeInventory, next);
  assertHandsUnchanged(beforeHands, next);
  return next;
}
