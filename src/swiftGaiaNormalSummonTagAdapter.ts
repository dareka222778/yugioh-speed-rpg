import type { CardRef, Monster } from './duelEngine';
import type { TagDuel } from './tagDuel';
import { assertTagDuel, tagInventory } from './tagDuel';
import { getDuelCard } from './effectRegistry';
import { ownedPrivateZone } from './teamRotation';
import { RULES_PROFILE } from './rulesProfile';

export const SWIFT_GAIA_ID = '16589042';

type Team = 0 | 1;

export type SwiftGaiaNormalSummonPlan = Readonly<{
  kind: 'swiftGaiaNoTributeNormalSummon';
  sourceUid: string;
  sourceId: string;
  ownerSeat: number;
  ownerTeam: Team;
  turn: number;
  phase: 'main';
  handSnapshot: readonly [string];
}>;

export type SwiftGaiaNormalSummonResolution = Readonly<{
  state: TagDuel;
  summonedUid: string;
  ownerSeat: number;
  ownerTeam: Team;
  position: 'atk';
  faceUp: true;
  normalSummonConsumed: true;
  tributesUsed: 0;
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

function validPlanOwner(plan: SwiftGaiaNormalSummonPlan): boolean {
  return !!plan && typeof plan.sourceUid === 'string' &&
    /^m[0-3]:/.test(plan.sourceUid) &&
    physicalSeat(plan.sourceUid) === plan.ownerSeat &&
    Number.isInteger(plan.ownerSeat) && plan.ownerSeat >= 0 && plan.ownerSeat <= 3 &&
    validTeam(plan.ownerTeam) && plan.ownerTeam === plan.ownerSeat % 2 &&
    plan.sourceId === SWIFT_GAIA_ID &&
    Array.isArray(plan.handSnapshot) && plan.handSnapshot.length === 1 &&
    plan.handSnapshot[0] === plan.sourceUid;
}

/**
 * Optional Normal Summon procedure: Swift Gaia must be the only card in the
 * active physical owner's private hand. The partner's private hand is not
 * part of this condition. The adapter offers only face-up Attack Summoning.
 */
export function prepareSwiftGaiaNormalSummon(
  duel: TagDuel,
  sourceUid: string,
): SwiftGaiaNormalSummonPlan | null {
  assertPhysicalRules(duel);
  if (typeof sourceUid !== 'string' || !sourceUid.trim()) return null;

  const source = tagInventory(duel).find(card => card.uid === sourceUid && card.entityKind !== 'token');
  if (!source || source.id !== SWIFT_GAIA_ID) return null;

  const ownerSeat = physicalSeat(source.uid);
  const ownerTeam = (ownerSeat % 2) as Team;
  if (duel.members[ownerSeat]?.team !== ownerTeam ||
      duel.active[ownerTeam] !== ownerSeat ||
      duel.core.current !== ownerTeam ||
      duel.core.phase !== 'main' ||
      duel.core.players[ownerTeam].summoned ||
      duel.core.players[ownerTeam].monsters.length >= RULES_PROFILE.monsterZones) return null;

  const hand = ownedPrivateZone(duel.core, source, ownerTeam, 'hand');
  if (hand.length !== 1 || hand[0].uid !== source.uid || hand[0].id !== SWIFT_GAIA_ID) return null;

  return Object.freeze({
    kind: 'swiftGaiaNoTributeNormalSummon',
    sourceUid: source.uid,
    sourceId: source.id,
    ownerSeat,
    ownerTeam,
    turn: duel.core.turn,
    phase: 'main',
    handSnapshot: Object.freeze([source.uid]) as readonly [string],
  });
}

/**
 * Resolves the no-Tribute Normal Summon against the exact one-card hand
 * snapshot. It consumes the team's Normal Summon flag and moves the existing
 * UID to the shared Monster Zone; no Tribute or new inventory is created.
 */
export function resolveSwiftGaiaNormalSummon(
  input: TagDuel,
  plan: SwiftGaiaNormalSummonPlan,
): SwiftGaiaNormalSummonResolution | null {
  assertPhysicalRules(input);
  if (!plan || plan.kind !== 'swiftGaiaNoTributeNormalSummon' ||
      !validPlanOwner(plan) || plan.turn !== input.core.turn ||
      plan.phase !== 'main' || input.core.phase !== 'main' ||
      input.core.current !== plan.ownerTeam ||
      input.active[plan.ownerTeam] !== plan.ownerSeat ||
      input.core.players[plan.ownerTeam].summoned ||
      input.core.players[plan.ownerTeam].monsters.length >= RULES_PROFILE.monsterZones) return null;

  const source: CardRef = { uid: plan.sourceUid, id: plan.sourceId };
  const currentHand = ownedPrivateZone(input.core, source, plan.ownerTeam, 'hand');
  if (currentHand.length !== 1 || currentHand[0].uid !== plan.sourceUid ||
      currentHand[0].id !== SWIFT_GAIA_ID) return null;

  const before = inventorySnapshot(input);
  const next = structuredClone(input);
  const nextHand = ownedPrivateZone(next.core, source, plan.ownerTeam, 'hand');
  if (nextHand.length !== 1 || nextHand[0].uid !== plan.sourceUid) return null;

  const [card] = nextHand.splice(0, 1);
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
  next.core.players[plan.ownerTeam].summoned = true;
  next.reserves = next.core.teamRotation!.reserves as TagDuel['reserves'];

  assertTagDuel(next);
  assertPhysicalRules(next);
  assertSameInventory(before, next);
  return {
    state: next,
    summonedUid: card.uid,
    ownerSeat: plan.ownerSeat,
    ownerTeam: plan.ownerTeam,
    position: 'atk',
    faceUp: true,
    normalSummonConsumed: true,
    tributesUsed: 0,
  };
}
