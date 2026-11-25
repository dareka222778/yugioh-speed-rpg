import type { Card } from './cardCatalog';
import type { DuelState, Monster } from './duelEngine';
import { getDuelCard, getPlayableCard } from './effectRegistry';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const WHITE_MAGICAL_HAT_ID = '15150365';
export const ROBBIN_GOBLIN_ID = '88279736';
type Team = 0 | 1;
type DiscardEffect = 'white-magical-hat' | 'robbin-goblin';

export type BattleDamageEvent = Readonly<{
  kind: 'battle-damage-to-opponent';
  eventId: string;
  turn: number;
  controllerTeam: Team;
  attackerUid: string;
  attackerId: string;
  attackerControllerTeam: Team;
  attackerWasFaceUp: true;
  battleDamage: number;
  cause: 'battle';
  damageStepComplete: true;
}>;

export type BattleDamageDiscardPlan = Readonly<{
  kind: 'battleDamageDiscard';
  effect: DiscardEffect;
  eventId: string;
  activationId: string;
  sourceUid: string;
  sourceId: string;
  sourceOwnerSeat: number;
  attackerUid: string;
  attackerId: string;
  attackerOwnerSeat: number;
  controllerTeam: Team;
  opponentTeam: Team;
  opponentActiveSeat: number;
  turn: number;
  battleDamage: number;
}>;

export type BattleDamageDiscardState = TagDuel & {
  battleDamageDiscard?: { resolvedActivationIds: string[] };
};

export type CardLookup = (id: string) => Pick<Card, 'kind' | 'monsterType'> | undefined;
export type ResolveOptions = Readonly<{
  effectNegated?: boolean;
  randomIndex?: (length: number) => number;
}>;

type LocatedMonster = { team: Team; monster: Monster };
type LocatedBackrow = { team: Team; card: { uid: string; id: string; faceUp: boolean } };
type PlanStatus = 'discarded' | 'no-card' | 'negated' | 'source-left-field' | 'stale' | 'duplicate';

const cardLookup: CardLookup = id => getPlayableCard(id);
const validTeam = (team: number): team is Team => team === 0 || team === 1;
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 160;

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido.');
  return Number(match[1]);
}

function assertPhysicalRules(state: BattleDamageDiscardState): void {
  for (let team = 0; team < 2; team++) {
    const player = state.core.players[team];
    if (player.monsters.length > RULES_PROFILE.monsterZones) {
      throw new Error('A equipe excedeu três Monster Zones.');
    }
    if (player.backrow.length > RULES_PROFILE.spellTrapZones) {
      throw new Error('A equipe excedeu três Spell/Trap Zones.');
    }
  }

  const mainCounts = [0, 0, 0, 0];
  const extraCounts = [0, 0, 0, 0];
  for (const card of tagInventory(state)) {
    if (card.entityKind === 'token') continue;
    const seat = physicalSeat(card.uid);
    if (state.members[seat]?.team !== seat % 2) {
      throw new Error('Proprietário físico incompatível com o UID.');
    }
    const info = getDuelCard(card.id);
    if (!info) throw new Error('Carta física sem metadados admitidos.');
    if (info.fusion) extraCounts[seat]++;
    else mainCounts[seat]++;
  }

  for (let seat = 0; seat < 4; seat++) {
    if (mainCounts[seat] < RULES_PROFILE.mainDeckMin ||
        mainCounts[seat] > RULES_PROFILE.mainDeckMax) {
      throw new Error('Deck Principal físico fora de 20–30 no assento ' + seat + '.');
    }
    if (extraCounts[seat] > RULES_PROFILE.extraDeckMax) {
      throw new Error('Deck Adicional excedeu cinco cartas no assento ' + seat + '.');
    }
  }
}

function assertState(state: BattleDamageDiscardState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para descarte por dano de batalha.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);

  const memory = state.battleDamageDiscard;
  const ids = memory?.resolvedActivationIds;
  if (memory && (!Array.isArray(ids) || ids.some(id => !validId(id)) ||
      new Set(ids).size !== ids.length)) {
    throw new Error('Recibos de descarte por dano de batalha inválidos.');
  }
}

function inventorySnapshot(state: BattleDamageDiscardState): string {
  const cards = tagInventory(state);
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function assertConserved(before: string, after: BattleDamageDiscardState): void {
  if (inventorySnapshot(after) !== before) {
    throw new Error('O descarte por dano de batalha alterou o inventário físico.');
  }
}

function locateMonster(state: DuelState, uid: string): LocatedMonster | undefined {
  const matches: LocatedMonster[] = [];
  for (let team = 0; team < 2; team++) {
    const monster = state.players[team].monsters.find(item => item.uid === uid);
    if (monster) matches.push({ team: team as Team, monster });
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function locateBackrow(state: DuelState, uid: string): LocatedBackrow | undefined {
  const matches: LocatedBackrow[] = [];
  for (let team = 0; team < 2; team++) {
    const card = state.players[team].backrow.find(item => item.uid === uid);
    if (card) matches.push({ team: team as Team, card });
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function graveTeams(state: DuelState, uid: string, id: string): Team[] {
  const matches: Team[] = [];
  for (let team = 0; team < 2; team++) {
    if (state.players[team].grave.some(card => card.uid === uid && card.id === id)) {
      matches.push(team as Team);
    }
  }
  return matches;
}

function activationId(eventId: string, effect: DiscardEffect, sourceUid: string): string {
  return eventId + ':' + effect + ':' + sourceUid;
}

function validateBattleEvent(
  state: BattleDamageDiscardState,
  event: BattleDamageEvent,
  lookup: CardLookup
): { ownerSeat: number; ownerTeam: Team } {
  assertState(state);
  if (!event || event.kind !== 'battle-damage-to-opponent' ||
      !validId(event.eventId) || event.eventId.length > 80 ||
      !Number.isSafeInteger(event.turn) || event.turn !== state.core.turn ||
      !validTeam(event.controllerTeam) ||
      !validTeam(event.attackerControllerTeam) ||
      event.controllerTeam !== event.attackerControllerTeam ||
      event.controllerTeam !== state.core.current ||
      typeof event.attackerUid !== 'string' || !event.attackerUid ||
      typeof event.attackerId !== 'string' || !event.attackerId ||
      event.attackerWasFaceUp !== true ||
      !Number.isSafeInteger(event.battleDamage) ||
      event.battleDamage <= 0 || event.battleDamage > 8000 ||
      event.cause !== 'battle' || event.damageStepComplete !== true ||
      state.core.resume !== 'battle' ||
      !['battle', 'response'].includes(state.core.phase)) {
    throw new Error('O descarte exige dano de batalha positivo após o Damage Step.');
  }

  const ownerSeat = physicalSeat(event.attackerUid);
  const ownerTeam = (ownerSeat % 2) as Team;
  if (state.members[ownerSeat]?.team !== ownerTeam) {
    throw new Error('Proprietário físico do atacante incompatível com o UID.');
  }
  const metadata = lookup(event.attackerId);
  if (!metadata || metadata.kind !== 'monster') {
    throw new Error('O atacante não é um monstro admitido.');
  }

  const field = locateMonster(state.core, event.attackerUid);
  if (field) {
    if (field.team !== event.controllerTeam ||
        field.monster.id !== event.attackerId ||
        field.monster.faceUp !== true ||
        field.monster.owner !== undefined && field.monster.owner !== ownerTeam) {
      throw new Error('O atacante no campo não corresponde ao evento de dano.');
    }
  } else {
    const inGrave = graveTeams(state.core, event.attackerUid, event.attackerId);
    if (inGrave.length !== 1 || inGrave[0] !== ownerTeam) {
      throw new Error('O atacante deve permanecer no campo ou no Cemitério de seu dono físico.');
    }
  }
  return { ownerSeat, ownerTeam };
}

function validatePlan(
  state: BattleDamageDiscardState,
  plan: BattleDamageDiscardPlan,
  whiteMagicalHatId: string,
  robbinGoblinId: string
): void {
  if (!plan || plan.kind !== 'battleDamageDiscard' ||
      !['white-magical-hat', 'robbin-goblin'].includes(plan.effect) ||
      !validId(plan.eventId) || !validId(plan.activationId) ||
      typeof plan.sourceUid !== 'string' || !plan.sourceUid ||
      typeof plan.sourceId !== 'string' || !plan.sourceId ||
      typeof plan.attackerUid !== 'string' || !plan.attackerUid ||
      typeof plan.attackerId !== 'string' || !plan.attackerId ||
      plan.activationId !== activationId(plan.eventId, plan.effect, plan.sourceUid) ||
      !validTeam(plan.controllerTeam) || !validTeam(plan.opponentTeam) ||
      plan.opponentTeam !== 1 - plan.controllerTeam ||
      !Number.isSafeInteger(plan.opponentActiveSeat) || plan.opponentActiveSeat < 0 || plan.opponentActiveSeat > 3 ||
      !Number.isSafeInteger(plan.sourceOwnerSeat) || plan.sourceOwnerSeat < 0 || plan.sourceOwnerSeat > 3 ||
      physicalSeat(plan.sourceUid) !== plan.sourceOwnerSeat ||
      !Number.isSafeInteger(plan.attackerOwnerSeat) || plan.attackerOwnerSeat < 0 || plan.attackerOwnerSeat > 3 ||
      physicalSeat(plan.attackerUid) !== plan.attackerOwnerSeat ||
      !Number.isSafeInteger(plan.turn) || plan.turn < 1 ||
      !Number.isSafeInteger(plan.battleDamage) || plan.battleDamage <= 0 ||
      plan.battleDamage > 8000 ||
      plan.sourceId !== (plan.effect === 'white-magical-hat' ? whiteMagicalHatId : robbinGoblinId) ||
      plan.effect === 'white-magical-hat' && plan.sourceUid !== plan.attackerUid ||
      state.members[plan.sourceOwnerSeat]?.team !== plan.sourceOwnerSeat % 2 ||
      state.members[plan.attackerOwnerSeat]?.team !== plan.attackerOwnerSeat % 2) {
    throw new Error('Plano de descarte por dano de batalha inválido.');
  }
}

function planWhiteMagicalHat(
  state: BattleDamageDiscardState,
  event: BattleDamageEvent,
  whiteMagicalHatId: string,
  lookup: CardLookup
): BattleDamageDiscardPlan {
  const attacker = validateBattleEvent(state, event, lookup);
  if (event.attackerId !== whiteMagicalHatId) {
    throw new Error('White Magical Hat exige que o próprio monstro cause o dano de batalha.');
  }
  const metadata = lookup(whiteMagicalHatId);
  if (!metadata || metadata.kind !== 'monster' || metadata.monsterType !== 'effect') {
    throw new Error('White Magical Hat deve ser um monstro de efeito admitido.');
  }
  const opponentTeam = (1 - event.controllerTeam) as Team;
  return Object.freeze({
    kind: 'battleDamageDiscard',
    effect: 'white-magical-hat',
    eventId: event.eventId,
    activationId: activationId(event.eventId, 'white-magical-hat', event.attackerUid),
    sourceUid: event.attackerUid,
    sourceId: whiteMagicalHatId,
    sourceOwnerSeat: attacker.ownerSeat,
    attackerUid: event.attackerUid,
    attackerId: event.attackerId,
    attackerOwnerSeat: attacker.ownerSeat,
    controllerTeam: event.controllerTeam,
    opponentTeam,
    opponentActiveSeat: state.active[opponentTeam],
    turn: event.turn,
    battleDamage: event.battleDamage,
  });
}

function planRobbinGoblin(
  state: BattleDamageDiscardState,
  event: BattleDamageEvent,
  trapUid: string,
  robbinGoblinId: string,
  lookup: CardLookup
): BattleDamageDiscardPlan {
  const attacker = validateBattleEvent(state, event, lookup);
  const metadata = lookup(robbinGoblinId);
  if (!metadata || metadata.kind !== 'trap') {
    throw new Error('Robbin\\' Goblin deve ser uma Armadilha admitida.');
  }
  if (typeof trapUid !== 'string' || !trapUid) throw new Error('UID de Robbin\\' Goblin inválido.');
  const trapOwnerSeat = physicalSeat(trapUid);
  const trapOwnerTeam = (trapOwnerSeat % 2) as Team;
  if (state.members[trapOwnerSeat]?.team !== trapOwnerTeam) {
    throw new Error('Proprietário físico de Robbin\\' Goblin incompatível com o UID.');
  }
  const source = locateBackrow(state.core, trapUid);
  if (!source || source.team !== event.controllerTeam ||
      source.card.id !== robbinGoblinId || source.card.faceUp !== true) {
    throw new Error('Robbin\\' Goblin deve permanecer face-up na equipe que causou o dano.');
  }

  const opponentTeam = (1 - event.controllerTeam) as Team;
  return Object.freeze({
    kind: 'battleDamageDiscard',
    effect: 'robbin-goblin',
    eventId: event.eventId,
    activationId: activationId(event.eventId, 'robbin-goblin', trapUid),
    sourceUid: trapUid,
    sourceId: robbinGoblinId,
    sourceOwnerSeat: trapOwnerSeat,
    attackerUid: event.attackerUid,
    attackerId: event.attackerId,
    attackerOwnerSeat: attacker.ownerSeat,
    controllerTeam: event.controllerTeam,
    opponentTeam,
    opponentActiveSeat: state.active[opponentTeam],
    turn: event.turn,
    battleDamage: event.battleDamage,
  });
}

function sourceStillFaceUp(
  state: BattleDamageDiscardState,
  plan: BattleDamageDiscardPlan
): boolean {
  const source = locateBackrow(state.core, plan.sourceUid);
  return !!source && source.team === plan.controllerTeam &&
    source.card.id === plan.sourceId && source.card.faceUp === true;
}

function resolveForCardIds(
  input: BattleDamageDiscardState,
  plan: BattleDamageDiscardPlan,
  whiteMagicalHatId: string,
  robbinGoblinId: string,
  options: ResolveOptions = {}
): {
  status: PlanStatus;
  state: BattleDamageDiscardState;
  discardedUid?: string;
  discardedId?: string;
  discardedOwnerSeat?: number;
} {
  assertState(input);
  validatePlan(input, plan, whiteMagicalHatId, robbinGoblinId);
  if (typeof options.effectNegated !== 'undefined' && typeof options.effectNegated !== 'boolean') {
    throw new Error('Estado de negação inválido.');
  }
  if (typeof options.randomIndex !== 'undefined' && typeof options.randomIndex !== 'function') {
    throw new Error('Seletor aleatório de descarte inválido.');
  }
  const currentMemory = input.battleDamageDiscard;
  if (currentMemory?.resolvedActivationIds.includes(plan.activationId)) {
    return { status: 'duplicate', state: input };
  }

  const before = inventorySnapshot(input);
  const next = structuredClone(input) as BattleDamageDiscardState;
  const memory = next.battleDamageDiscard ?? { resolvedActivationIds: [] };
  memory.resolvedActivationIds.push(plan.activationId);
  let status: PlanStatus;
  let discardedUid: string | undefined;
  let discardedId: string | undefined;
  let discardedOwnerSeat: number | undefined;

  if (options.effectNegated === true) {
    status = 'negated';
  } else if (plan.turn !== next.core.turn ||
      next.core.current !== plan.controllerTeam ||
      next.core.resume !== 'battle' ||
      !['battle', 'response'].includes(next.core.phase) ||
      next.active[plan.opponentTeam] !== plan.opponentActiveSeat) {
    status = 'stale';
  } else if (plan.effect === 'robbin-goblin' && !sourceStillFaceUp(next, plan)) {
    status = 'source-left-field';
  } else {
    const hand = next.core.players[plan.opponentTeam].hand;
    if (hand.length === 0) {
      status = 'no-card';
    } else {
      const chooseIndex = options.randomIndex ?? ((length: number) => Math.floor(Math.random() * length));
      const index = chooseIndex(hand.length);
      if (!Number.isSafeInteger(index) || index < 0 || index >= hand.length) {
        throw new Error('Índice aleatório de descarte fora da mão privada.');
      }
      const discarded = hand.splice(index, 1)[0];
      if (!discarded) throw new Error('A carta aleatória não existe na mão.');
      discardedOwnerSeat = physicalSeat(discarded.uid);
      if (discardedOwnerSeat !== plan.opponentActiveSeat) {
        throw new Error('A mão da equipe adversária contém carta de outro assento físico.');
      }
      discardedUid = discarded.uid;
      discardedId = discarded.id;
      next.core.players[plan.opponentTeam].grave.push({ uid: discarded.uid, id: discarded.id });
      status = 'discarded';
    }
  }

  next.battleDamageDiscard = memory;
  assertState(next);
  assertConserved(before, next);
  return { status, state: next, discardedUid, discardedId, discardedOwnerSeat };
}

export function createBattleDamageDiscardAdapter(
  whiteMagicalHatId = WHITE_MAGICAL_HAT_ID,
  robbinGoblinId = ROBBIN_GOBLIN_ID,
  lookup: CardLookup = cardLookup
) {
  if (typeof whiteMagicalHatId !== 'string' || !whiteMagicalHatId.trim() ||
      typeof robbinGoblinId !== 'string' || !robbinGoblinId.trim() ||
      whiteMagicalHatId === robbinGoblinId) {
    throw new Error('IDs de White Magical Hat/Robbin\\' Goblin inválidos.');
  }
  return Object.freeze({
    planWhiteMagicalHat: (state: BattleDamageDiscardState, event: BattleDamageEvent) =>
      planWhiteMagicalHat(state, event, whiteMagicalHatId, lookup),
    planRobbinGoblin: (state: BattleDamageDiscardState, event: BattleDamageEvent, trapUid: string) =>
      planRobbinGoblin(state, event, trapUid, robbinGoblinId, lookup),
    resolve: (state: BattleDamageDiscardState, plan: BattleDamageDiscardPlan, options: ResolveOptions = {}) =>
      resolveForCardIds(state, plan, whiteMagicalHatId, robbinGoblinId, options),
  });
}

const productionAdapter = createBattleDamageDiscardAdapter();
export const planWhiteMagicalHatBattleDiscard = productionAdapter.planWhiteMagicalHat;
export const planRobbinGoblinBattleDiscard = productionAdapter.planRobbinGoblin;
export const resolveBattleDamageDiscard = productionAdapter.resolve;
