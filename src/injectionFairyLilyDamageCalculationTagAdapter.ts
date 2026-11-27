import type { Card } from './cardCatalog';
import type { DuelState, Monster } from './duelEngine';
import { atk } from './duelEngine';
import { getDuelCard, getPlayableCard } from './effectRegistry';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const INJECTION_FAIRY_LILY_ID = '79575620';
export const INJECTION_FAIRY_LILY_LP_COST = 2000;
export const INJECTION_FAIRY_LILY_ATK_BONUS = 3000;
type Team = 0 | 1;

export type DamageCalculationEvent = Readonly<{
  kind: 'damage-calculation';
  eventId: string;
  battleId: string;
  turn: number;
  attackerUid: string;
  attackerTeam: Team;
  defenderUid: string;
  defenderTeam: Team;
  window: 'damage-calculation';
}>;

export type InjectionFairyLilyPlan = Readonly<{
  kind: 'injectionFairyLilyDamageCalculation';
  eventId: string;
  battleId: string;
  activationId: string;
  turn: number;
  sourceUid: string;
  sourceId: string;
  sourceOwnerSeat: number;
  sourcePosition: 'atk' | 'def';
  controllerTeam: Team;
  activeSeat: number;
  attackerUid: string;
  attackerTeam: Team;
  defenderUid: string;
  defenderTeam: Team;
  baseAtk: number;
  lpCost: 2000;
  atkBonus: 3000;
}>;

export type InjectionFairyLilyState = TagDuel & {
  injectionFairyLily?: {
    activatedBattleIds: string[];
    resolvedActivationIds: string[];
  };
};

export type CardLookup = (id: string) => Pick<Card, 'kind' | 'monsterType'> | undefined;
export type ResolveOptions = Readonly<{ effectNegated?: boolean }>;
type LocatedMonster = { team: Team; monster: Monster };
type ActivationStatus = 'activated' | 'insufficient-lp' | 'source-left-field' | 'stale' | 'duplicate';
type ResolutionStatus = 'boosted' | 'negated' | 'source-left-field' | 'stale' | 'duplicate';

const cardLookup: CardLookup = id => getPlayableCard(id);
const validTeam = (team: number): team is Team => team === 0 || team === 1;
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 160;

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido.');
  return Number(match[1]);
}

function assertPhysicalRules(state: InjectionFairyLilyState): void {
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

function assertState(state: InjectionFairyLilyState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para Injection Fairy Lily.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);
  const memory = state.injectionFairyLily;
  if (memory && (!Array.isArray(memory.activatedBattleIds) ||
      !Array.isArray(memory.resolvedActivationIds) ||
      memory.activatedBattleIds.some(id => !validId(id)) ||
      memory.resolvedActivationIds.some(id => !validId(id)) ||
      new Set(memory.activatedBattleIds).size !== memory.activatedBattleIds.length ||
      new Set(memory.resolvedActivationIds).size !== memory.resolvedActivationIds.length)) {
    throw new Error('Memória de Injection Fairy Lily inválida.');
  }
}

function inventorySnapshot(state: InjectionFairyLilyState): string {
  const cards = tagInventory(state);
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function assertConserved(before: string, after: InjectionFairyLilyState): void {
  if (inventorySnapshot(after) !== before) {
    throw new Error('Injection Fairy Lily alterou o inventário físico.');
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

function activationId(battleId: string, sourceUid: string): string {
  return battleId + ':' + sourceUid;
}

function validateEvent(
  state: InjectionFairyLilyState,
  event: DamageCalculationEvent,
  sourceUid: string,
  injectionId: string,
  lookup: CardLookup
): { source: LocatedMonster; ownerSeat: number } {
  assertState(state);
  if (!event || event.kind !== 'damage-calculation' ||
      !validId(event.eventId) || !validId(event.battleId) ||
      !Number.isSafeInteger(event.turn) || event.turn !== state.core.turn ||
      !validTeam(event.attackerTeam) || !validTeam(event.defenderTeam) ||
      event.attackerTeam !== state.core.current ||
      event.defenderTeam !== 1 - event.attackerTeam ||
      typeof event.attackerUid !== 'string' || !event.attackerUid ||
      typeof event.defenderUid !== 'string' || !event.defenderUid ||
      typeof sourceUid !== 'string' || !sourceUid ||
      ![event.attackerUid, event.defenderUid].includes(sourceUid) ||
      event.window !== 'damage-calculation' ||
      state.core.resume !== 'battle' ||
      !['battle', 'response'].includes(state.core.phase)) {
    throw new Error('Injection Fairy Lily só pode ativar durante o cálculo de dano de uma batalha real.');
  }

  const attacker = locateMonster(state.core, event.attackerUid);
  const defender = locateMonster(state.core, event.defenderUid);
  if (!attacker || attacker.team !== event.attackerTeam ||
      !defender || defender.team !== event.defenderTeam) {
    throw new Error('Participantes da batalha não correspondem ao evento.');
  }
  const source = locateMonster(state.core, sourceUid);
  if (!source || source.monster.id !== injectionId ||
      source.monster.faceUp !== true ||
      !['atk', 'def'].includes(source.monster.position)) {
    throw new Error('Injection Fairy Lily precisa estar face-up e participar desta batalha.');
  }
  const metadata = lookup(injectionId);
  if (!metadata || metadata.kind !== 'monster' || metadata.monsterType !== 'effect') {
    throw new Error('Injection Fairy Lily deve ser um monstro de efeito admitido.');
  }
  const ownerSeat = physicalSeat(sourceUid);
  const ownerTeam = (ownerSeat % 2) as Team;
  if (state.members[ownerSeat]?.team !== ownerTeam ||
      source.monster.owner !== undefined && source.monster.owner !== ownerTeam) {
    throw new Error('Proprietário físico de Injection Fairy Lily incompatível com o UID.');
  }
  return { source, ownerSeat };
}

function validatePlan(
  state: InjectionFairyLilyState,
  plan: InjectionFairyLilyPlan,
  injectionId: string
): void {
  if (!plan || plan.kind !== 'injectionFairyLilyDamageCalculation' ||
      !validId(plan.eventId) || !validId(plan.battleId) ||
      !validId(plan.activationId) ||
      typeof plan.sourceUid !== 'string' || !plan.sourceUid ||
      typeof plan.sourceId !== 'string' || !plan.sourceId ||
      typeof plan.attackerUid !== 'string' || !plan.attackerUid ||
      typeof plan.defenderUid !== 'string' || !plan.defenderUid ||
      plan.activationId !== activationId(plan.battleId, plan.sourceUid) ||
      plan.sourceId !== injectionId ||
      ![plan.attackerUid, plan.defenderUid].includes(plan.sourceUid) ||
      !validTeam(plan.attackerTeam) || !validTeam(plan.defenderTeam) ||
      plan.defenderTeam !== 1 - plan.attackerTeam ||
      !validTeam(plan.controllerTeam) ||
      plan.controllerTeam !== plan.attackerTeam && plan.controllerTeam !== plan.defenderTeam ||
      !Number.isSafeInteger(plan.sourceOwnerSeat) || plan.sourceOwnerSeat < 0 || plan.sourceOwnerSeat > 3 ||
      physicalSeat(plan.sourceUid) !== plan.sourceOwnerSeat ||
      state.members[plan.sourceOwnerSeat]?.team !== plan.sourceOwnerSeat % 2 ||
      !Number.isSafeInteger(plan.activeSeat) || plan.activeSeat < 0 || plan.activeSeat > 3 ||
      !['atk', 'def'].includes(plan.sourcePosition) ||
      !Number.isSafeInteger(plan.turn) || plan.turn < 1 ||
      !Number.isSafeInteger(plan.baseAtk) || plan.baseAtk < 0 ||
      plan.lpCost !== INJECTION_FAIRY_LILY_LP_COST ||
      plan.atkBonus !== INJECTION_FAIRY_LILY_ATK_BONUS) {
    throw new Error('Plano de Injection Fairy Lily inválido.');
  }
}

function planInjectionFairyLily(
  state: InjectionFairyLilyState,
  event: DamageCalculationEvent,
  sourceUid: string,
  injectionId: string,
  lookup: CardLookup
): InjectionFairyLilyPlan {
  const { source, ownerSeat } = validateEvent(state, event, sourceUid, injectionId, lookup);
  return Object.freeze({
    kind: 'injectionFairyLilyDamageCalculation',
    eventId: event.eventId,
    battleId: event.battleId,
    activationId: activationId(event.battleId, sourceUid),
    turn: event.turn,
    sourceUid,
    sourceId: injectionId,
    sourceOwnerSeat: ownerSeat,
    sourcePosition: source.monster.position,
    controllerTeam: source.team,
    activeSeat: state.active[source.team],
    attackerUid: event.attackerUid,
    attackerTeam: event.attackerTeam,
    defenderUid: event.defenderUid,
    defenderTeam: event.defenderTeam,
    baseAtk: atk(source.monster, state.core),
    lpCost: INJECTION_FAIRY_LILY_LP_COST,
    atkBonus: INJECTION_FAIRY_LILY_ATK_BONUS,
  });
}

function sourceStillFaceUp(state: InjectionFairyLilyState, plan: InjectionFairyLilyPlan): LocatedMonster | undefined {
  const source = locateMonster(state.core, plan.sourceUid);
  return source && source.team === plan.controllerTeam &&
    source.monster.id === plan.sourceId && source.monster.faceUp === true
    ? source
    : undefined;
}

function activateInjectionFairyLily(
  input: InjectionFairyLilyState,
  plan: InjectionFairyLilyPlan,
  injectionId: string
): {
  status: ActivationStatus;
  state: InjectionFairyLilyState;
  plan: InjectionFairyLilyPlan;
  lpPaid: number;
} {
  assertState(input);
  validatePlan(input, plan, injectionId);
  const current = input.injectionFairyLily;
  if (current?.activatedBattleIds.includes(plan.activationId)) {
    return { status: 'duplicate', state: input, plan, lpPaid: 0 };
  }
  if (plan.turn !== input.core.turn || input.core.current !== plan.attackerTeam ||
      input.core.resume !== 'battle' || !['battle', 'response'].includes(input.core.phase) ||
      input.active[plan.controllerTeam] !== plan.activeSeat) {
    return { status: 'stale', state: input, plan, lpPaid: 0 };
  }
  if (!sourceStillFaceUp(input, plan)) {
    return { status: 'source-left-field', state: input, plan, lpPaid: 0 };
  }
  if (input.core.players[plan.controllerTeam].lp <= plan.lpCost) {
    return { status: 'insufficient-lp', state: input, plan, lpPaid: 0 };
  }

  const before = inventorySnapshot(input);
  const next = structuredClone(input) as InjectionFairyLilyState;
  const memory = next.injectionFairyLily ?? { activatedBattleIds: [], resolvedActivationIds: [] };
  memory.activatedBattleIds.push(plan.activationId);
  next.injectionFairyLily = memory;
  next.core.players[plan.controllerTeam].lp -= plan.lpCost;
  assertState(next);
  assertConserved(before, next);
  return { status: 'activated', state: next, plan, lpPaid: plan.lpCost };
}

function resolveInjectionFairyLily(
  input: InjectionFairyLilyState,
  plan: InjectionFairyLilyPlan,
  injectionId: string,
  options: ResolveOptions = {}
): {
  status: ResolutionStatus;
  state: InjectionFairyLilyState;
  temporaryAtkBonus: number;
  effectiveAtk?: number;
  appliesTo: 'ATK-only';
  lpPaid: 0;
} {
  assertState(input);
  validatePlan(input, plan, injectionId);
  if (typeof options.effectNegated !== 'undefined' && typeof options.effectNegated !== 'boolean') {
    throw new Error('Estado de negação inválido.');
  }
  const current = input.injectionFairyLily;
  if (!current?.activatedBattleIds.includes(plan.activationId)) {
    throw new Error('Injection Fairy Lily precisa pagar o custo antes da resolução.');
  }
  if (current.resolvedActivationIds.includes(plan.activationId)) {
    return { status: 'duplicate', state: input, temporaryAtkBonus: 0, appliesTo: 'ATK-only', lpPaid: 0 };
  }

  const before = inventorySnapshot(input);
  const next = structuredClone(input) as InjectionFairyLilyState;
  const memory = next.injectionFairyLily!;
  memory.resolvedActivationIds.push(plan.activationId);
  let status: ResolutionStatus;
  let effectiveAtk: number | undefined;

  if (options.effectNegated === true) {
    status = 'negated';
  } else if (plan.turn !== next.core.turn ||
      next.core.current !== plan.attackerTeam ||
      next.core.resume !== 'battle' ||
      !['battle', 'response'].includes(next.core.phase) ||
      next.active[plan.controllerTeam] !== plan.activeSeat) {
    status = 'stale';
  } else {
    const source = sourceStillFaceUp(next, plan);
    if (!source) {
      status = 'source-left-field';
    } else {
      effectiveAtk = atk(source.monster, next.core) + plan.atkBonus;
      status = 'boosted';
    }
  }

  assertState(next);
  assertConserved(before, next);
  return {
    status,
    state: next,
    temporaryAtkBonus: status === 'boosted' ? plan.atkBonus : 0,
    effectiveAtk,
    appliesTo: 'ATK-only',
    lpPaid: 0,
  };
}

export function createInjectionFairyLilyAdapter(
  injectionId = INJECTION_FAIRY_LILY_ID,
  lookup: CardLookup = cardLookup
) {
  if (typeof injectionId !== 'string' || !injectionId.trim()) {
    throw new Error('Passcode de Injection Fairy Lily inválido.');
  }
  return Object.freeze({
    plan: (state: InjectionFairyLilyState, event: DamageCalculationEvent, sourceUid: string) =>
      planInjectionFairyLily(state, event, sourceUid, injectionId, lookup),
    activate: (state: InjectionFairyLilyState, plan: InjectionFairyLilyPlan) =>
      activateInjectionFairyLily(state, plan, injectionId),
    resolve: (state: InjectionFairyLilyState, plan: InjectionFairyLilyPlan, options: ResolveOptions = {}) =>
      resolveInjectionFairyLily(state, plan, injectionId, options),
  });
}

const productionAdapter = createInjectionFairyLilyAdapter();
export const planInjectionFairyLilyDamageCalculation = productionAdapter.plan;
export const activateInjectionFairyLilyDamageCalculation = productionAdapter.activate;
export const resolveInjectionFairyLilyDamageCalculation = productionAdapter.resolve;
