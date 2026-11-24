import type { CardRef } from './duelEngine';
import type { TagDuel } from './tagDuel';
import { assertTagDuel, tagInventory } from './tagDuel';
import { getDuelCard } from './effectRegistry';
import { monsterEffectsNegated } from './continuousEffects';
import { RULES_PROFILE } from './rulesProfile';

export const THE_END_OF_ANUBIS_ID = '65403020';
export const KYCOO_THE_GHOST_DESTROYER_ID = '88240808';

type Team = 0 | 1;
type GyZone = 'deck' | 'hand' | 'monster' | 'backrow' | 'field' | 'grave' | 'banished' | 'extra';
type AdapterIds = {
  endOfAnubisId?: string;
  kycooId?: string;
};

export type GyEffectContext = {
  sourceZone: GyZone;
  targetZones: readonly GyZone[];
};

type CardSnapshot = Pick<CardRef, 'uid' | 'id'>;

export type KycooBattleDamagePlan = {
  sourceUid: string;
  controllerTeam: Team;
  opponentTeam: Team;
  turn: number;
  candidates: readonly CardSnapshot[];
};

export type KycooBattleDamageResolution = {
  state: TagDuel;
  movedUids: string[];
  negated: boolean;
};

function adapterIds(ids: AdapterIds = {}) {
  return {
    endOfAnubisId: ids.endOfAnubisId ?? THE_END_OF_ANUBIS_ID,
    kycooId: ids.kycooId ?? KYCOO_THE_GHOST_DESTROYER_ID,
  };
}

function validTeam(team: number): team is Team {
  return team === 0 || team === 1;
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
  for (let team = 0; team < 2; team++) {
    const player = duel.core.players[team];
    if (player.monsters.length > RULES_PROFILE.monsterZones) throw new Error('A equipe excedeu três Monster Zones.');
    if (player.backrow.length > RULES_PROFILE.spellTrapZones) throw new Error('A equipe excedeu três Spell/Trap Zones.');
  }

  const mainCounts = [0, 0, 0, 0];
  const extraCounts = [0, 0, 0, 0];
  for (const [uid, id] of inventorySnapshot(duel)) {
    const info = getDuelCard(id);
    if (!info) throw new Error('Carta física sem metadados jogáveis: ' + id);
    const seat = physicalSeat(uid);
    if (info.fusion) extraCounts[seat]++;
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

/** The End of Anubis is a face-up continuous monster effect. It negates
 * effects that activate in the GY or target at least one card in the GY. */
export function endOfAnubisApplies(duel: TagDuel, ids: AdapterIds = {}): boolean {
  assertClassic(duel);
  const { endOfAnubisId } = adapterIds(ids);
  return duel.core.players.some(player => player.monsters.some(monster =>
    monster.id === endOfAnubisId && monster.faceUp &&
    !monsterEffectsNegated(duel.core, monster.uid)
  ));
}

const GY_ZONES = new Set<GyZone>([
  'deck', 'hand', 'monster', 'backrow', 'field', 'grave', 'banished', 'extra',
]);

/** Shared negation predicate for any card type. Merely sending a card to the
 * GY is not enough: the effect must activate there or target a GY card. */
export function gyEffectIsNegated(
  duel: TagDuel,
  context: GyEffectContext,
  ids: AdapterIds = {},
): boolean {
  assertClassic(duel);
  if (!context || !GY_ZONES.has(context.sourceZone) || !Array.isArray(context.targetZones) ||
      context.targetZones.some(zone => !GY_ZONES.has(zone))) {
    throw new Error('Contexto de efeito do Cemitério inválido.');
  }
  return endOfAnubisApplies(duel, ids) &&
    (context.sourceZone === 'grave' || context.targetZones.includes('grave'));
}

/** Kycoo prevents only the opposing team from banishing cards from either
 * shared GY. It does not prevent its controller from banishing cards. */
export function kycooBlocksOpponentBanishFromEitherGy(
  duel: TagDuel,
  actorTeam: Team,
  ids: AdapterIds = {},
): boolean {
  assertClassic(duel);
  if (!validTeam(actorTeam)) throw new Error('Equipe que tenta banir inválida.');
  const { kycooId } = adapterIds(ids);
  return duel.core.players.some((player, controllerTeam) =>
    controllerTeam !== actorTeam && player.monsters.some(monster =>
      monster.id === kycooId && monster.faceUp &&
      !monsterEffectsNegated(duel.core, monster.uid)
    )
  );
}

/** Build Kycoo's optional trigger after positive battle damage. The target
 * pool is the opposing team's shared GY, while every UID keeps its physical
 * owner (m0–m3) when moved to the shared Banished Zone. */
export function prepareKycooBattleDamage(
  duel: TagDuel,
  sourceUid: string,
  controllerTeam: Team,
  battleDamage: number,
  ids: AdapterIds = {},
): KycooBattleDamagePlan | null {
  assertPhysicalRules(duel);
  if (!validTeam(controllerTeam) || duel.core.current !== controllerTeam ||
      duel.active[controllerTeam] !== duel.cursor ||
      !(duel.core.phase === 'battle' || duel.core.resume === 'battle') ||
      !Number.isSafeInteger(battleDamage) || battleDamage <= 0 ||
      typeof sourceUid !== 'string' || !sourceUid) return null;

  const { kycooId } = adapterIds(ids);
  const source = duel.core.players[controllerTeam].monsters.find(monster =>
    monster.uid === sourceUid && monster.id === kycooId && monster.faceUp &&
    monster.entityKind !== 'token'
  );
  if (!source || monsterEffectsNegated(duel.core, sourceUid)) return null;

  const opponentTeam = (1 - controllerTeam) as Team;
  const candidates = duel.core.players[opponentTeam].grave
    .filter(card => card.entityKind !== 'token' && getDuelCard(card.id)?.kind === 'monster')
    .map(card => ({ uid: card.uid, id: card.id }));

  return Object.freeze({
    sourceUid,
    controllerTeam,
    opponentTeam,
    turn: duel.core.turn,
    candidates: Object.freeze(candidates),
  });
}

/** Resolve up to two selected targets. Targets that left the GY before
 * resolution are ignored; duplicate, foreign, stale-plan and >2 selections
 * are rejected. An active End of Anubis negates the targeted GY effect. */
export function resolveKycooBattleDamage(
  duel: TagDuel,
  plan: KycooBattleDamagePlan,
  targetUids: readonly string[],
  ids: AdapterIds = {},
): KycooBattleDamageResolution | null {
  assertPhysicalRules(duel);
  if (!plan || !validTeam(plan.controllerTeam) ||
      plan.opponentTeam !== (1 - plan.controllerTeam) ||
      plan.turn !== duel.core.turn || typeof plan.sourceUid !== 'string' ||
      !Array.isArray(plan.candidates) || !Array.isArray(targetUids) ||
      targetUids.length > 2 || targetUids.some(uid => typeof uid !== 'string' || !uid)) return null;

  const { kycooId } = adapterIds(ids);
  const sourceStillExists = tagInventory(duel).some(card =>
    card.uid === plan.sourceUid && card.id === kycooId
  );
  if (!sourceStillExists) return null;

  const candidateByUid = new Map<string, string>();
  for (const candidate of plan.candidates) {
    if (!candidate || typeof candidate.uid !== 'string' || typeof candidate.id !== 'string' ||
        candidateByUid.has(candidate.uid)) return null;
    candidateByUid.set(candidate.uid, candidate.id);
  }
  if (new Set(targetUids).size !== targetUids.length ||
      targetUids.some(uid => !candidateByUid.has(uid))) return null;

  const before = inventorySnapshot(duel);
  if (gyEffectIsNegated(duel, { sourceZone: 'monster', targetZones: ['grave'] }, ids)) {
    return { state: structuredClone(duel), movedUids: [], negated: true };
  }

  const state = structuredClone(duel);
  const grave = state.core.players[plan.opponentTeam].grave;
  const banished = state.core.players[plan.opponentTeam].banished ??= [];
  const movedUids: string[] = [];
  for (const uid of targetUids) {
    const expectedId = candidateByUid.get(uid)!;
    const index = grave.findIndex(card =>
      card.uid === uid && card.id === expectedId && card.entityKind !== 'token' &&
      getDuelCard(card.id)?.kind === 'monster'
    );
    if (index < 0) continue;
    const [card] = grave.splice(index, 1);
    banished.push(card);
    movedUids.push(uid);
  }

  assertSameInventory(before, state);
  assertPhysicalRules(state);
  return { state, movedUids, negated: false };
}
