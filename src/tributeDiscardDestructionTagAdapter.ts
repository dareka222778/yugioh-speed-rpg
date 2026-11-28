import type { CardRef } from './duelEngine';
import type { TagDuel } from './tagDuel';
import { assertTagDuel, tagInventory } from './tagDuel';
import { getDuelCard } from './effectRegistry';
import { monsterEffectsNegated } from './continuousEffects';
import { RULES_PROFILE } from './rulesProfile';

export const EXILED_FORCE_ID = '74131780';
export const TRIBE_INFECTING_VIRUS_ID = '33184167';
export const BANISHER_OF_THE_LIGHT_ID = '61528025';

type Team = 0 | 1;
type Seat = 0 | 1 | 2 | 3;
type AdapterIds = {
  exiledForceId?: string;
  tribeVirusId?: string;
  banisherId?: string;
};
type CardSnapshot = Pick<CardRef, 'uid' | 'id'>;

export type ExiledForcePlan = {
  sourceUid: string;
  controllerSeat: Seat;
  controllerTeam: Team;
  turn: number;
  candidates: readonly CardSnapshot[];
};

export type ExiledForceActivation = {
  state: TagDuel;
  plan: ExiledForcePlan;
};

export type ExiledForceResolution = {
  state: TagDuel;
  destroyedUid: string | null;
  negated: boolean;
};

export type TribeInfectingVirusPlan = {
  sourceUid: string;
  controllerSeat: Seat;
  controllerTeam: Team;
  turn: number;
  declaredRace: string;
  discardedUid: string;
};

export type TribeInfectingVirusActivation = {
  state: TagDuel;
  plan: TribeInfectingVirusPlan;
};

export type TribeInfectingVirusResolution = {
  state: TagDuel;
  destroyedUids: string[];
  negated: boolean;
};

function adapterIds(ids: AdapterIds = {}) {
  return {
    exiledForceId: ids.exiledForceId ?? EXILED_FORCE_ID,
    tribeVirusId: ids.tribeVirusId ?? TRIBE_INFECTING_VIRUS_ID,
    banisherId: ids.banisherId ?? BANISHER_OF_THE_LIGHT_ID,
  };
}

function validTeam(team: number): team is Team {
  return team === 0 || team === 1;
}

function validSeat(seat: number): seat is Seat {
  return Number.isInteger(seat) && seat >= 0 && seat <= 3;
}

function physicalSeat(uid: string): Seat {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido: ' + uid);
  return Number(match[1]) as Seat;
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

function mainActionWindow(duel: TagDuel, controllerSeat: number): controllerSeat is Seat {
  if (!validSeat(controllerSeat)) return false;
  const team = (controllerSeat % 2) as Team;
  return duel.core.current === team && duel.active[team] === controllerSeat &&
    duel.cursor === controllerSeat && duel.core.phase === 'main' &&
    duel.core.pending.kind === 'none' && duel.core.chain.length === 0 &&
    !duel.core.turnEnding;
}

function privateHand(duel: TagDuel, seat: Seat): CardRef[] {
  const team = (seat % 2) as Team;
  if (duel.active[team] === seat) return duel.core.players[team].hand;
  const held = duel.reserves[seat];
  if (!held) throw new Error('Mão privada do proprietário físico ausente.');
  return held.hand;
}

function banisherApplies(duel: TagDuel, banisherId: string): boolean {
  return duel.core.players.some(player => player.monsters.some(monster =>
    monster.id === banisherId && monster.faceUp &&
    !monsterEffectsNegated(duel.core, monster.uid)
  ));
}

/** Tribute/discard costs are moved to the shared GY, or banished when a
 * face-up, non-negated Banisher of the Light replaces GY destinations. */
function sendCost(duel: TagDuel, team: Team, card: CardRef, ids: AdapterIds): void {
  const { banisherId } = adapterIds(ids);
  if (banisherApplies(duel, banisherId)) {
    (duel.core.players[team].banished ??= []).push(card);
  } else {
    duel.core.players[team].grave.push(card);
  }
}

/** Exiled Force pays its own Tribute before the target prompt is created.
 * Targets include face-down monsters and either team's shared field. */
export function activateExiledForce(
  duel: TagDuel,
  sourceUid: string,
  controllerSeat: Seat,
  ids: AdapterIds = {},
): ExiledForceActivation | null {
  assertPhysicalRules(duel);
  if (!mainActionWindow(duel, controllerSeat) || typeof sourceUid !== 'string' || !sourceUid) return null;
  const controllerTeam = (controllerSeat % 2) as Team;
  const { exiledForceId } = adapterIds(ids);
  const source = duel.core.players[controllerTeam].monsters.find(monster =>
    monster.uid === sourceUid && monster.id === exiledForceId && monster.faceUp &&
    monster.entityKind !== 'token'
  );
  if (!source || monsterEffectsNegated(duel.core, sourceUid)) return null;

  const candidates = duel.core.players.flatMap(player => player.monsters)
    .filter(monster => monster.uid !== sourceUid)
    .map(monster => ({ uid: monster.uid, id: monster.id }));
  if (!candidates.length) return null;

  const before = inventorySnapshot(duel);
  const state = structuredClone(duel);
  const monsters = state.core.players[controllerTeam].monsters;
  const sourceIndex = monsters.findIndex(monster => monster.uid === sourceUid && monster.id === exiledForceId);
  if (sourceIndex < 0) return null;
  const [tributed] = monsters.splice(sourceIndex, 1);
  sendCost(state, controllerTeam, tributed, ids);
  assertSameInventory(before, state);
  assertPhysicalRules(state);

  return {
    state,
    plan: Object.freeze({
      sourceUid,
      controllerSeat,
      controllerTeam,
      turn: duel.core.turn,
      candidates: Object.freeze(candidates),
    }),
  };
}

/** The caller passes the selected target to the shared destruction pipeline.
 * A target that left the field before resolution is no longer destroyed. */
export function resolveExiledForceTarget(
  duel: TagDuel,
  plan: ExiledForcePlan,
  targetUid: string,
  effectNegatedAtResolution = false,
  ids: AdapterIds = {},
): ExiledForceResolution | null {
  assertPhysicalRules(duel);
  if (!plan || !validSeat(plan.controllerSeat) || !validTeam(plan.controllerTeam) ||
      plan.controllerTeam !== (plan.controllerSeat % 2) || plan.turn !== duel.core.turn ||
      typeof plan.sourceUid !== 'string' || !Array.isArray(plan.candidates) ||
      typeof targetUid !== 'string' || !targetUid) return null;
  const { exiledForceId } = adapterIds(ids);
  if (!tagInventory(duel).some(card => card.uid === plan.sourceUid && card.id === exiledForceId)) return null;

  const candidate = plan.candidates.find(card => card.uid === targetUid);
  if (!candidate || plan.candidates.some((card, index) =>
    plan.candidates.findIndex(other => other.uid === card.uid) !== index
  )) return null;

  const before = inventorySnapshot(duel);
  const state = structuredClone(duel);
  if (effectNegatedAtResolution) {
    assertSameInventory(before, state);
    return { state, destroyedUid: null, negated: true };
  }
  const stillOnField = state.core.players.some(player =>
    player.monsters.some(monster => monster.uid === targetUid && monster.id === candidate.id)
  );
  assertSameInventory(before, state);
  return { state, destroyedUid: stillOnField ? targetUid : null, negated: false };
}

/** Tribe-Infecting Virus discards from the active physical seat's private
 * hand, then declares a monster Type. The discard is a cost and is not
 * refunded if the effect is negated later in the chain. */
export function activateTribeInfectingVirus(
  duel: TagDuel,
  sourceUid: string,
  controllerSeat: Seat,
  discardUid: string,
  declaredRace: string,
  ids: AdapterIds = {},
): TribeInfectingVirusActivation | null {
  assertPhysicalRules(duel);
  if (!mainActionWindow(duel, controllerSeat) || typeof sourceUid !== 'string' || !sourceUid ||
      typeof discardUid !== 'string' || !discardUid ||
      typeof declaredRace !== 'string' || !declaredRace.trim() || declaredRace.length > 40) return null;
  const controllerTeam = (controllerSeat % 2) as Team;
  const { tribeVirusId } = adapterIds(ids);
  const source = duel.core.players[controllerTeam].monsters.find(monster =>
    monster.uid === sourceUid && monster.id === tribeVirusId && monster.faceUp &&
    monster.entityKind !== 'token'
  );
  if (!source || monsterEffectsNegated(duel.core, sourceUid)) return null;
  const hand = privateHand(duel, controllerSeat);
  const discardIndex = hand.findIndex(card => card.uid === discardUid && card.entityKind !== 'token');
  if (discardIndex < 0) return null;

  const before = inventorySnapshot(duel);
  const state = structuredClone(duel);
  const nextHand = privateHand(state, controllerSeat);
  const [discarded] = nextHand.splice(discardIndex, 1);
  sendCost(state, controllerTeam, discarded, ids);
  assertSameInventory(before, state);
  assertPhysicalRules(state);

  return {
    state,
    plan: Object.freeze({
      sourceUid,
      controllerSeat,
      controllerTeam,
      turn: duel.core.turn,
      declaredRace: declaredRace.trim(),
      discardedUid: discardUid,
    }),
  };
}

/** Tribe is non-targeting: at resolution it returns every face-up monster of
 * the declared race on either shared field, including the source if it matches. */
export function resolveTribeInfectingVirus(
  duel: TagDuel,
  plan: TribeInfectingVirusPlan,
  effectNegatedAtResolution = false,
  ids: AdapterIds = {},
): TribeInfectingVirusResolution | null {
  assertPhysicalRules(duel);
  if (!plan || !validSeat(plan.controllerSeat) || !validTeam(plan.controllerTeam) ||
      plan.controllerTeam !== (plan.controllerSeat % 2) || plan.turn !== duel.core.turn ||
      typeof plan.sourceUid !== 'string' || typeof plan.declaredRace !== 'string' ||
      !plan.declaredRace.trim() || typeof plan.discardedUid !== 'string') return null;
  const { tribeVirusId } = adapterIds(ids);
  if (!tagInventory(duel).some(card => card.uid === plan.sourceUid && card.id === tribeVirusId)) return null;

  const before = inventorySnapshot(duel);
  const state = structuredClone(duel);
  const destroyedUids = effectNegatedAtResolution ? [] : state.core.players
    .flatMap(player => player.monsters)
    .filter(monster => monster.faceUp && getDuelCard(monster.id)?.race === plan.declaredRace)
    .map(monster => monster.uid);
  assertSameInventory(before, state);
  return { state, destroyedUids, negated: effectNegatedAtResolution };
}
