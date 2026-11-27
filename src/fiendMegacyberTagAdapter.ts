import type { CardRef, Monster } from './duelEngine';
import type { TagDuel } from './tagDuel';
import { assertTagDuel, tagInventory } from './tagDuel';
import { getDuelCard } from './effectRegistry';
import { ownedPrivateZone } from './teamRotation';
import { RULES_PROFILE } from './rulesProfile';

export const FIEND_MEGACYBER_ID = '66362965';

type Team = 0 | 1;

export type FiendMegacyberPlan = Readonly<{
  kind: 'fiendMegacyber';
  sourceUid: string;
  sourceId: string;
  ownerSeat: number;
  ownerTeam: Team;
  opponentTeam: Team;
  turn: number;
  ownMonsterCount: number;
  opponentMonsterCount: number;
  phase: 'main';
}>;

export type FiendMegacyberResolution = Readonly<{
  state: TagDuel;
  summonedUid: string;
  ownerSeat: number;
  ownerTeam: Team;
  opponentTeam: Team;
  position: 'atk';
  faceUp: true;
}>;

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

function assertPhysicalRules(duel: TagDuel): void {
  assertClassic(duel);
  for (let team = 0; team < 2; team++) {
    const player = duel.core.players[team];
    if (player.monsters.length > RULES_PROFILE.monsterZones) {
      throw new Error('A equipe excedeu três Monster Zones.');
    }
    if (player.backrow.length > RULES_PROFILE.spellTrapZones) {
      throw new Error('A equipe excedeu três Spell/Trap Zones.');
    }
  }

  const mainCounts = [0, 0, 0, 0];
  const extraCounts = [0, 0, 0, 0];
  for (const card of tagInventory(duel)) {
    if (card.entityKind === 'token') continue;
    const seat = physicalSeat(card.uid);
    if (duel.members[seat]?.team !== seat % 2) {
      throw new Error('Proprietário físico incompatível com o UID.');
    }
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

function inventorySnapshot(duel: TagDuel): Map<string, string> {
  const result = new Map<string, string>();
  for (const card of tagInventory(duel).filter(card => card.entityKind !== 'token')) {
    const seat = physicalSeat(card.uid);
    if (duel.members[seat]?.team !== seat % 2) {
      throw new Error('Proprietário físico incompatível com o UID.');
    }
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

function validPlanOwner(plan: FiendMegacyberPlan, expectedCardId: string): boolean {
  return !!plan && typeof plan.sourceUid === 'string' &&
    /^m[0-3]:/.test(plan.sourceUid) &&
    physicalSeat(plan.sourceUid) === plan.ownerSeat &&
    Number.isInteger(plan.ownerSeat) && plan.ownerSeat >= 0 && plan.ownerSeat <= 3 &&
    validTeam(plan.ownerTeam) && plan.ownerTeam === plan.ownerSeat % 2 &&
    plan.opponentTeam === (1 - plan.ownerTeam) &&
    plan.sourceId === expectedCardId;
}

/**
 * This is an optional, non-chain Special Summon procedure. The caller invokes
 * prepare only when the active physical owner chooses to attempt it. The
 * historical ruling limits the procedure to the Main Phase.
 */
function prepareForCardId(
  duel: TagDuel,
  sourceUid: string,
  expectedCardId: string,
): FiendMegacyberPlan | null {
  assertPhysicalRules(duel);
  if (typeof sourceUid !== 'string' || !sourceUid.trim()) return null;

  const source = tagInventory(duel).find(card => card.uid === sourceUid && card.entityKind !== 'token');
  if (!source || source.id !== expectedCardId) return null;

  const ownerSeat = physicalSeat(source.uid);
  const ownerTeam = (ownerSeat % 2) as Team;
  const opponentTeam = (1 - ownerTeam) as Team;
  if (duel.members[ownerSeat]?.team !== ownerTeam ||
      duel.active[ownerTeam] !== ownerSeat ||
      duel.core.current !== ownerTeam ||
      duel.core.phase !== 'main') return null;

  const hand = ownedPrivateZone(duel.core, source, ownerTeam, 'hand');
  if (!hand.some(card => card.uid === source.uid && card.id === expectedCardId)) return null;

  const ownMonsterCount = duel.core.players[ownerTeam].monsters.length;
  const opponentMonsterCount = duel.core.players[opponentTeam].monsters.length;
  if (opponentMonsterCount - ownMonsterCount < 2 ||
      ownMonsterCount >= RULES_PROFILE.monsterZones) return null;

  return Object.freeze({
    kind: 'fiendMegacyber',
    sourceUid: source.uid,
    sourceId: source.id,
    ownerSeat,
    ownerTeam,
    opponentTeam,
    turn: duel.core.turn,
    ownMonsterCount,
    opponentMonsterCount,
    phase: 'main',
  });
}

/**
 * Resolves the already-offered procedure against the same field snapshot.
 * It moves one existing physical card from its owner's private hand to the
 * team's shared Monster Zone; it never creates inventory or consumes the
 * Normal Summon flag.
 */
function resolveForCardId(
  input: TagDuel,
  plan: FiendMegacyberPlan,
  expectedCardId: string,
): FiendMegacyberResolution | null {
  assertPhysicalRules(input);
  if (!plan || plan.kind !== 'fiendMegacyber' || !validPlanOwner(plan, expectedCardId) ||
      plan.turn !== input.core.turn || plan.phase !== 'main' ||
      input.core.phase !== 'main' || input.core.current !== plan.ownerTeam ||
      input.active[plan.ownerTeam] !== plan.ownerSeat) return null;

  const ownMonsterCount = input.core.players[plan.ownerTeam].monsters.length;
  const opponentMonsterCount = input.core.players[plan.opponentTeam].monsters.length;
  if (ownMonsterCount !== plan.ownMonsterCount ||
      opponentMonsterCount !== plan.opponentMonsterCount ||
      opponentMonsterCount - ownMonsterCount < 2 ||
      ownMonsterCount >= RULES_PROFILE.monsterZones) return null;

  const source: CardRef = { uid: plan.sourceUid, id: plan.sourceId };
  const currentHand = ownedPrivateZone(input.core, source, plan.ownerTeam, 'hand');
  if (!currentHand.some(card => card.uid === plan.sourceUid && card.id === expectedCardId)) return null;

  const before = inventorySnapshot(input);
  const next = structuredClone(input);
  const nextHand = ownedPrivateZone(next.core, source, plan.ownerTeam, 'hand');
  const index = nextHand.findIndex(card => card.uid === plan.sourceUid && card.id === expectedCardId);
  if (index < 0) return null;

  const [card] = nextHand.splice(index, 1);
  const monster: Monster = {
    ...card,
    position: 'atk',
    faceUp: true,
    entered: next.core.turn,
    changed: next.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  };
  next.core.players[plan.ownerTeam].monsters.push(monster);
  next.reserves = next.core.teamRotation!.reserves as TagDuel['reserves'];

  assertTagDuel(next);
  assertPhysicalRules(next);
  assertSameInventory(before, next);
  return {
    state: next,
    summonedUid: card.uid,
    ownerSeat: plan.ownerSeat,
    ownerTeam: plan.ownerTeam,
    opponentTeam: plan.opponentTeam,
    position: 'atk',
    faceUp: true,
  };
}

/**
 * Test seam for catalog-valid fixtures. Production callers should use the
 * default exports, which are pinned to the official passcode.
 */
export function createFiendMegacyberAdapter(cardId = FIEND_MEGACYBER_ID) {
  if (typeof cardId !== 'string' || !cardId.trim()) {
    throw new Error('ID de carta inválido para o adapter.');
  }
  return Object.freeze({
    prepare: (duel: TagDuel, sourceUid: string) => prepareForCardId(duel, sourceUid, cardId),
    resolve: (input: TagDuel, plan: FiendMegacyberPlan) => resolveForCardId(input, plan, cardId),
  });
}

const productionAdapter = createFiendMegacyberAdapter();
export const prepareFiendMegacyber = productionAdapter.prepare;
export const resolveFiendMegacyber = productionAdapter.resolve;
