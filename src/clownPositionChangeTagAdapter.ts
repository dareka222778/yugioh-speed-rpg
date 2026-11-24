import type { Card } from './cardCatalog';
import type { DuelState, Monster } from './duelEngine';
import {
  bindTarget,
  synchronizeCardLifetimes,
  targetBindingValid,
  type TargetBinding,
} from './cardLifetime';
import { cleanEquips } from './classicEffects';
import { canAffectMonster } from './continuousEffects';
import { getDuelCard, getPlayableCard } from './effectRegistry';
import { sendMonsterToGrave } from './monsterExit';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';
import { ownedPrivateZone } from './teamRotation';
import { removeToken } from './tokens';

export const DREAM_CLOWN_ID = '13215230';
export const CRASS_CLOWN_ID = '93889755';
type Team = 0 | 1;
type ClownEffect = 'dream-clown-destroy' | 'crass-clown-bounce';
type Position = 'atk' | 'def';

export type PositionChangeEvent = Readonly<{
  kind: 'position-changed';
  activationId: string;
  sourceUid: string;
  sourceId: string;
  turn: number;
  controllerTeam: Team;
  previousPosition: Position;
  previousFaceUp: boolean;
  newPosition: Position;
  newFaceUp: true;
  cause: 'manual' | 'effect' | 'flip-summon';
  sourceLeftFieldAfterChange: boolean;
}>;

export type ClownPositionPlan = Readonly<{
  kind: 'clownPositionChange';
  effect: ClownEffect;
  activationId: string;
  sourceUid: string;
  sourceId: string;
  sourceOwnerSeat: number;
  controllerTeam: Team;
  activeSeat: number;
  targetUid: string;
  targetId: string;
  targetOwnerSeat: number;
  targetBinding: TargetBinding;
  turn: number;
}>;

export type ClownState = TagDuel & {
  clownPositionChange?: { resolvedActivationIds: string[] };
};
export type CardLookup = (id: string) => Pick<Card, 'kind' | 'monsterType'> | undefined;

const cardLookup: CardLookup = id => getPlayableCard(id);
const validTeam = (team: number): team is Team => team === 0 || team === 1;

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido.');
  return Number(match[1]);
}

function assertPhysicalRules(state: ClownState): void {
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

function assertState(state: ClownState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para os Palhaços.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);

  const ids = state.clownPositionChange?.resolvedActivationIds;
  if (ids && (!Array.isArray(ids) ||
      ids.some(id => !validActivationId(id)) ||
      new Set(ids).size !== ids.length)) {
    throw new Error('Recibos de mudança de posição inválidos.');
  }
}

function validActivationId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
}

function inventorySnapshot(state: ClownState): string {
  const cards = tagInventory(state).filter(card => card.entityKind !== 'token');
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function assertConserved(before: string, after: ClownState): void {
  if (inventorySnapshot(after) !== before) {
    throw new Error('O efeito de mudança de posição alterou o inventário físico.');
  }
}

function locateMonster(state: DuelState, uid: string): { team: Team; monster: Monster } | undefined {
  const matches: { team: Team; monster: Monster }[] = [];
  for (let team = 0; team < 2; team++) {
    const monster = state.players[team].monsters.find(item => item.uid === uid);
    if (monster) matches.push({ team: team as Team, monster });
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function effectFor(sourceId: string, dreamId: string, crassId: string): ClownEffect | undefined {
  if (sourceId === dreamId) return 'dream-clown-destroy';
  if (sourceId === crassId) return 'crass-clown-bounce';
  return undefined;
}

function validateEvent(
  state: ClownState,
  event: PositionChangeEvent,
  dreamId: string,
  crassId: string,
  lookup: CardLookup
): { effect: ClownEffect; sourceOwnerSeat: number } {
  assertState(state);
  const effect = event && effectFor(event.sourceId, dreamId, crassId);
  if (!event || event.kind !== 'position-changed' ||
      !validActivationId(event.activationId) ||
      typeof event.sourceUid !== 'string' ||
      !effect ||
      !Number.isSafeInteger(event.turn) || event.turn !== state.core.turn ||
      !validTeam(event.controllerTeam) ||
      !['atk', 'def'].includes(event.previousPosition) ||
      !['atk', 'def'].includes(event.newPosition) ||
      typeof event.previousFaceUp !== 'boolean' ||
      event.newPosition !== (effect === 'dream-clown-destroy' ? 'def' : 'atk') ||
      event.newFaceUp !== true ||
      !['manual', 'effect', 'flip-summon'].includes(event.cause) ||
      typeof event.sourceLeftFieldAfterChange !== 'boolean' ||
      ['finished', 'discard'].includes(state.core.phase)) {
    throw new Error('Evento de mudança de posição inválido para os Palhaços.');
  }

  if (effect === 'dream-clown-destroy' &&
      !(event.previousPosition === 'atk' && event.previousFaceUp &&
        event.newPosition === 'def' && event.newFaceUp)) {
    throw new Error('Dream Clown exige Ataque face-up para Defesa face-up.');
  }
  if (effect === 'crass-clown-bounce' &&
      !(event.previousPosition === 'def' && event.newPosition === 'atk' && event.newFaceUp)) {
    throw new Error('Crass Clown exige mudança de Defesa para Ataque.');
  }

  const sourceOwnerSeat = physicalSeat(event.sourceUid);
  const ownerTeam = (sourceOwnerSeat % 2) as Team;
  if (state.members[sourceOwnerSeat]?.team !== ownerTeam) {
    throw new Error('Dono físico da fonte inválido.');
  }

  const fieldMatches: { team: Team; monster: Monster }[] = [];
  const graveMatches: Team[] = [];
  for (let team = 0; team < 2; team++) {
    const monster = state.core.players[team].monsters.find(item => item.uid === event.sourceUid);
    if (monster) fieldMatches.push({ team: team as Team, monster });
    if (state.core.players[team].grave.some(card => card.uid === event.sourceUid && card.id === event.sourceId)) {
      graveMatches.push(team as Team);
    }
  }

  if (fieldMatches.length === 1 && graveMatches.length === 0) {
    const source = fieldMatches[0];
    if (event.sourceLeftFieldAfterChange ||
        source.team !== event.controllerTeam ||
        source.monster.id !== event.sourceId ||
        source.monster.faceUp !== true ||
        source.monster.position !== event.newPosition) {
      throw new Error('Fonte no campo não corresponde à transição registrada.');
    }
  } else if (fieldMatches.length === 0 && graveMatches.length === 1) {
    if (!event.sourceLeftFieldAfterChange || graveMatches[0] !== ownerTeam) {
      throw new Error('Fonte removida deve estar no Cemitério do dono físico.');
    }
  } else {
    throw new Error('Fonte da mudança de posição não está em uma zona válida.');
  }

  const metadata = lookup(event.sourceId);
  if (!metadata || metadata.kind !== 'monster' || metadata.monsterType !== 'effect') {
    throw new Error('Fonte não é um monstro de efeito admitido.');
  }

  const resolved = state.clownPositionChange?.resolvedActivationIds ?? [];
  if (resolved.includes(event.activationId)) {
    throw new Error('Esta ativação de mudança de posição já foi resolvida.');
  }
  return { effect, sourceOwnerSeat };
}

function listTargetsForCardIds(
  state: ClownState,
  event: PositionChangeEvent,
  dreamId: string,
  crassId: string,
  lookup: CardLookup
): string[] {
  const context = validateEvent(state, event, dreamId, crassId, lookup);
  const opponentTeam = (1 - event.controllerTeam) as Team;
  return state.core.players[opponentTeam].monsters
    .filter(monster => canAffectMonster(state.core, monster.uid, 'monster'))
    .map(monster => monster.uid);
}

function planForCardIds(
  state: ClownState,
  event: PositionChangeEvent,
  targetUid: string,
  dreamId: string,
  crassId: string,
  lookup: CardLookup
): ClownPositionPlan | null {
  const targets = listTargetsForCardIds(state, event, dreamId, crassId, lookup);
  if (targets.length === 0) return null;
  if (typeof targetUid !== 'string' || !targets.includes(targetUid)) {
    throw new Error('Alvo precisa ser um monstro afetável da equipe adversária.');
  }
  const context = validateEvent(state, event, dreamId, crassId, lookup);
  const target = locateMonster(state.core, targetUid);
  if (!target) throw new Error('Alvo deixou o campo antes da seleção.');
  const targetOwnerSeat = physicalSeat(target.monster.uid);
  const targetBinding = bindTarget(structuredClone(state.core) as DuelState, targetUid);
  if (!targetBinding) throw new Error('Identidade do alvo não pôde ser vinculada.');

  return Object.freeze({
    kind: 'clownPositionChange',
    effect: context.effect,
    activationId: event.activationId,
    sourceUid: event.sourceUid,
    sourceId: event.sourceId,
    sourceOwnerSeat: context.sourceOwnerSeat,
    controllerTeam: event.controllerTeam,
    activeSeat: state.active[event.controllerTeam],
    targetUid,
    targetId: target.monster.id,
    targetOwnerSeat,
    targetBinding,
    turn: event.turn,
  });
}

function resolveForCardIds(
  input: ClownState,
  plan: ClownPositionPlan,
  dreamId: string,
  crassId: string,
  effectNegated = false
): {
  status: 'destroyed' | 'returned-to-hand' | 'returned-to-extra' | 'token-removed' |
    'negated' | 'target-left-field' | 'target-no-longer-opponent' |
    'target-changed' | 'target-immune' | 'duplicate';
  state: ClownState;
  destination: 'grave' | 'hand' | 'extra' | 'none';
  handLimitDeferred: boolean;
} {
  assertState(input);
  const expectedId = plan?.effect === 'dream-clown-destroy' ? dreamId :
    plan?.effect === 'crass-clown-bounce' ? crassId : undefined;
  if (!plan || plan.kind !== 'clownPositionChange' ||
      !validActivationId(plan.activationId) ||
      !expectedId || plan.sourceId !== expectedId ||
      physicalSeat(plan.sourceUid) !== plan.sourceOwnerSeat ||
      plan.sourceOwnerSeat % 2 !== input.members[plan.sourceOwnerSeat]?.team ||
      !validTeam(plan.controllerTeam) ||
      !Number.isSafeInteger(plan.activeSeat) ||
      input.active[plan.controllerTeam] !== plan.activeSeat ||
      input.core.turn !== plan.turn ||
      physicalSeat(plan.targetUid) !== plan.targetOwnerSeat ||
      typeof effectNegated !== 'boolean') {
    throw new Error('Plano de mudança de posição obsoleto ou inválido.');
  }

  const currentIds = input.clownPositionChange?.resolvedActivationIds ?? [];
  if (currentIds.includes(plan.activationId)) {
    return {
      status: 'duplicate',
      state: input,
      destination: 'none',
      handLimitDeferred: false,
    };
  }

  const before = inventorySnapshot(input);
  const next = structuredClone(input) as ClownState;
  const memory = next.clownPositionChange ?? { resolvedActivationIds: [] };
  memory.resolvedActivationIds.push(plan.activationId);
  let status: ReturnType<typeof resolveForCardIds>['status'] = 'target-left-field';
  let destination: 'grave' | 'hand' | 'extra' | 'none' = 'none';
  let handLimitDeferred = false;

  if (effectNegated) {
    status = 'negated';
  } else if (!targetBindingValid(next.core, plan.targetBinding)) {
    status = 'target-left-field';
  } else {
    const target = locateMonster(next.core, plan.targetUid);
    if (!target) {
      status = 'target-left-field';
    } else if (target.team !== 1 - plan.controllerTeam) {
      status = 'target-no-longer-opponent';
    } else if (target.monster.id !== plan.targetId) {
      status = 'target-changed';
    } else if (!canAffectMonster(next.core, plan.targetUid, 'monster')) {
      status = 'target-immune';
    } else if (plan.effect === 'dream-clown-destroy') {
      const ownerTeam = (plan.targetOwnerSeat % 2) as Team;
      target.monster.owner = ownerTeam;
      if (sendMonsterToGrave(next.core, plan.targetUid, false)) {
        cleanEquips(next.core);
        synchronizeCardLifetimes(next.core);
        status = 'destroyed';
        destination = 'grave';
      } else {
        status = 'target-left-field';
      }
    } else if (target.monster.entityKind === 'token') {
      if (removeToken(next.core, plan.targetUid, 'return')) {
        cleanEquips(next.core);
        synchronizeCardLifetimes(next.core);
        status = 'token-removed';
      } else {
        status = 'target-left-field';
      }
    } else {
      const ownerSeat = plan.targetOwnerSeat;
      const ownerTeam = (ownerSeat % 2) as Team;
      const ref = { uid: target.monster.uid, id: target.monster.id };
      next.core.players[target.team].monsters =
        next.core.players[target.team].monsters.filter(monster => monster.uid !== plan.targetUid);
      const isFusion = !!getDuelCard(target.monster.id)?.fusion;
      const destinationZone = isFusion ? 'extra' : 'hand';
      const privateZone = ownedPrivateZone(next.core, ref, ownerTeam, destinationZone);
      privateZone.push(ref);
      cleanEquips(next.core);
      synchronizeCardLifetimes(next.core);
      destination = destinationZone;
      status = isFusion ? 'returned-to-extra' : 'returned-to-hand';
      handLimitDeferred = !isFusion && privateZone.length > RULES_PROFILE.handLimit;
    }
  }

  next.clownPositionChange = memory;
  assertState(next);
  assertConserved(before, next);
  return { status, state: next, destination, handLimitDeferred };
}

export function createClownPositionChangeAdapter(
  dreamClownId = DREAM_CLOWN_ID,
  crassClownId = CRASS_CLOWN_ID,
  lookup: CardLookup = cardLookup
) {
  if (typeof dreamClownId !== 'string' || !dreamClownId.trim() ||
      typeof crassClownId !== 'string' || !crassClownId.trim() ||
      dreamClownId === crassClownId) {
    throw new Error('IDs de Palhaços inválidos.');
  }
  return Object.freeze({
    listTargets: (state: ClownState, event: PositionChangeEvent) =>
      listTargetsForCardIds(state, event, dreamClownId, crassClownId, lookup),
    plan: (state: ClownState, event: PositionChangeEvent, targetUid: string) =>
      planForCardIds(state, event, targetUid, dreamClownId, crassClownId, lookup),
    resolve: (state: ClownState, plan: ClownPositionPlan, effectNegated = false) =>
      resolveForCardIds(state, plan, dreamClownId, crassClownId, effectNegated),
  });
}

const productionAdapter = createClownPositionChangeAdapter();
export const listClownPositionChangeTargets = productionAdapter.listTargets;
export const planClownPositionChange = productionAdapter.plan;
export const resolveClownPositionChange = productionAdapter.resolve;
