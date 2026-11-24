import type { Card } from './cardCatalog';
import type { DuelState, Monster } from './duelEngine';
import {
  bindTarget,
  targetBindingValid,
  type TargetBinding,
} from './cardLifetime';
import { monsterEffectsNegated } from './continuousEffects';
import { getDuelCard, getPlayableCard } from './effectRegistry';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const UNHAPPY_GIRL_ID = '27618634';
type Team = 0 | 1;

export type UnhappyGirlBattleEvent = Readonly<{
  kind: 'battle-completed';
  battleId: string;
  sourceUid: string;
  sourceId: string;
  targetUid: string;
  turn: number;
  sourceControllerTeam: Team;
  targetControllerTeam: Team;
  sourceFaceUpAttack: true;
  targetSurvived: true;
  damageStepComplete: true;
}>;

export type UnhappyGirlBattleLock = Readonly<{
  battleId: string;
  sourceUid: string;
  targetUid: string;
  sourceBinding: TargetBinding;
  targetBinding: TargetBinding;
  turn: number;
}>;

export type UnhappyGirlState = TagDuel & {
  unhappyGirlBattleLocks?: {
    resolvedBattleIds: string[];
    entries: UnhappyGirlBattleLock[];
  };
};
export type CardLookup = (id: string) => Pick<Card, 'kind' | 'monsterType'> | undefined;

const cardLookup: CardLookup = id => getPlayableCard(id);
const validTeam = (team: number): team is Team => team === 0 || team === 1;

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido.');
  return Number(match[1]);
}

function validBattleId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
}

function locateMonster(state: DuelState, uid: string): { team: Team; monster: Monster } | undefined {
  const matches: { team: Team; monster: Monster }[] = [];
  for (let team = 0; team < 2; team++) {
    const monster = state.players[team].monsters.find(item => item.uid === uid);
    if (monster) matches.push({ team: team as Team, monster });
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function assertPhysicalRules(state: UnhappyGirlState): void {
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

function assertState(state: UnhappyGirlState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para The Unhappy Girl.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);

  const memory = state.unhappyGirlBattleLocks;
  if (!memory) return;
  if (!Array.isArray(memory.resolvedBattleIds) ||
      memory.resolvedBattleIds.some(id => !validBattleId(id)) ||
      new Set(memory.resolvedBattleIds).size !== memory.resolvedBattleIds.length ||
      !Array.isArray(memory.entries) || memory.entries.length > 128) {
    throw new Error('Memória de batalhas de The Unhappy Girl inválida.');
  }
  const battleIds = new Set<string>();
  for (const entry of memory.entries) {
    if (!entry || !validBattleId(entry.battleId) ||
        battleIds.has(entry.battleId) ||
        !memory.resolvedBattleIds.includes(entry.battleId) ||
        typeof entry.sourceUid !== 'string' || typeof entry.targetUid !== 'string' ||
        entry.sourceUid === entry.targetUid ||
        !Number.isSafeInteger(entry.turn) || entry.turn < 1 ||
        !entry.sourceBinding || entry.sourceBinding.uid !== entry.sourceUid ||
        entry.sourceBinding.zone !== 'monsters' ||
        !entry.targetBinding || entry.targetBinding.uid !== entry.targetUid ||
        entry.targetBinding.zone !== 'monsters') {
      throw new Error('Vínculo de batalha de The Unhappy Girl inválido.');
    }
    battleIds.add(entry.battleId);
  }
}

function inventorySnapshot(state: UnhappyGirlState): string {
  const cards = tagInventory(state).filter(card => card.entityKind !== 'token');
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function assertConserved(before: string, after: UnhappyGirlState): void {
  if (inventorySnapshot(after) !== before) {
    throw new Error('The Unhappy Girl alterou o inventário físico.');
  }
}

function activeLocks(
  state: UnhappyGirlState,
  cardId: string,
  targetUid?: string
): UnhappyGirlBattleLock[] {
  const entries = state.unhappyGirlBattleLocks?.entries ?? [];
  const core = structuredClone(state.core) as DuelState;
  return entries.filter(entry => {
    if (targetUid && entry.targetUid !== targetUid) return false;
    if (!targetBindingValid(core, entry.sourceBinding) ||
        !targetBindingValid(core, entry.targetBinding)) return false;
    const source = locateMonster(state.core, entry.sourceUid);
    const target = locateMonster(state.core, entry.targetUid);
    return !!source && !!target &&
      source.monster.id === cardId &&
      source.monster.faceUp === true &&
      source.monster.position === 'atk' &&
      !monsterEffectsNegated(state.core, entry.sourceUid);
  });
}

function isBattleProtectedForCard(
  state: UnhappyGirlState,
  sourceUid: string,
  cardId: string
): boolean {
  assertState(state);
  const source = locateMonster(state.core, sourceUid);
  return !!source &&
    source.monster.id === cardId &&
    source.monster.faceUp === true &&
    source.monster.position === 'atk' &&
    !monsterEffectsNegated(state.core, sourceUid);
}

function recordBattleForCard(
  input: UnhappyGirlState,
  event: UnhappyGirlBattleEvent,
  cardId: string,
  lookup: CardLookup
): { status: 'locked' | 'negated' | 'duplicate'; state: UnhappyGirlState; lockCount: number } {
  assertState(input);
  if (!event || event.kind !== 'battle-completed' ||
      !validBattleId(event.battleId) ||
      typeof event.sourceUid !== 'string' ||
      typeof event.targetUid !== 'string' ||
      event.sourceUid === event.targetUid ||
      event.sourceId !== cardId ||
      event.turn !== input.core.turn ||
      !validTeam(event.sourceControllerTeam) ||
      !validTeam(event.targetControllerTeam) ||
      event.sourceControllerTeam === event.targetControllerTeam ||
      event.sourceFaceUpAttack !== true ||
      event.targetSurvived !== true ||
      event.damageStepComplete !== true ||
      input.core.resume !== 'battle' ||
      !['battle', 'response'].includes(input.core.phase)) {
    throw new Error('Evento de batalha inválido para The Unhappy Girl.');
  }

  const sourceOwnerSeat = physicalSeat(event.sourceUid);
  const targetOwnerSeat = physicalSeat(event.targetUid);
  if (input.members[sourceOwnerSeat]?.team !== sourceOwnerSeat % 2 ||
      input.members[targetOwnerSeat]?.team !== targetOwnerSeat % 2) {
    throw new Error('Proprietário físico inválido no evento de batalha.');
  }

  const source = locateMonster(input.core, event.sourceUid);
  const target = locateMonster(input.core, event.targetUid);
  if (!source || !target ||
      source.team !== event.sourceControllerTeam ||
      target.team !== event.targetControllerTeam ||
      source.monster.id !== cardId ||
      source.monster.faceUp !== true ||
      source.monster.position !== 'atk') {
    throw new Error('A fonte deve permanecer face-up em Ataque e o alvo no campo adversário.');
  }

  const metadata = lookup(cardId);
  if (!metadata || metadata.kind !== 'monster' || metadata.monsterType !== 'effect') {
    throw new Error('The Unhappy Girl não está admitida como monstro de efeito.');
  }

  const currentMemory = input.unhappyGirlBattleLocks;
  if (currentMemory?.resolvedBattleIds.includes(event.battleId)) {
    return { status: 'duplicate', state: input, lockCount: currentMemory.entries.length };
  }

  const before = inventorySnapshot(input);
  const next = structuredClone(input) as UnhappyGirlState;
  const memory = next.unhappyGirlBattleLocks ?? { resolvedBattleIds: [], entries: [] };
  memory.resolvedBattleIds.push(event.battleId);

  let status: 'locked' | 'negated' = 'locked';
  if (monsterEffectsNegated(next.core, event.sourceUid)) {
    status = 'negated';
  } else {
    const sourceBinding = bindTarget(next.core, event.sourceUid);
    const targetBinding = bindTarget(next.core, event.targetUid);
    if (!sourceBinding || !targetBinding ||
        sourceBinding.zone !== 'monsters' || targetBinding.zone !== 'monsters') {
      throw new Error('Não foi possível vincular a identidade da batalha.');
    }
    memory.entries = memory.entries.filter(entry =>
      targetBindingValid(next.core, entry.sourceBinding) &&
      targetBindingValid(next.core, entry.targetBinding)
    );
    const alreadyLocked = memory.entries.some(entry =>
      entry.sourceUid === event.sourceUid && entry.targetUid === event.targetUid &&
      entry.sourceBinding.epoch === sourceBinding.epoch &&
      entry.targetBinding.epoch === targetBinding.epoch
    );
    if (!alreadyLocked) {
      memory.entries.push({
        battleId: event.battleId,
        sourceUid: event.sourceUid,
        targetUid: event.targetUid,
        sourceBinding,
        targetBinding,
        turn: event.turn,
      });
    }
    if (memory.entries.length > 128) memory.entries.shift();
  }

  next.unhappyGirlBattleLocks = memory;
  assertState(next);
  assertConserved(before, next);
  return { status, state: next, lockCount: memory.entries.length };
}

export function createUnhappyGirlAdapter(
  cardId = UNHAPPY_GIRL_ID,
  lookup: CardLookup = cardLookup
) {
  if (typeof cardId !== 'string' || !cardId.trim()) {
    throw new Error('ID inválido para The Unhappy Girl.');
  }
  return Object.freeze({
    recordBattle: (state: UnhappyGirlState, event: UnhappyGirlBattleEvent) =>
      recordBattleForCard(state, event, cardId, lookup),
    isBattleProtected: (state: UnhappyGirlState, sourceUid: string) =>
      isBattleProtectedForCard(state, sourceUid, cardId),
    isAttackBlocked: (state: UnhappyGirlState, targetUid: string) => {
      assertState(state);
      return activeLocks(state, cardId, targetUid).length > 0;
    },
    isManualPositionChangeBlocked: (
      state: UnhappyGirlState,
      targetUid: string,
      cause: 'manual' | 'effect' = 'manual'
    ) => {
      assertState(state);
      return cause !== 'effect' && activeLocks(state, cardId, targetUid).length > 0;
    },
    activeLocks: (state: UnhappyGirlState, targetUid?: string) => {
      assertState(state);
      return activeLocks(state, cardId, targetUid);
    },
  });
}

const productionAdapter = createUnhappyGirlAdapter();
export const recordUnhappyGirlBattle = productionAdapter.recordBattle;
export const isUnhappyGirlBattleProtected = productionAdapter.isBattleProtected;
export const isUnhappyGirlAttackBlocked = productionAdapter.isAttackBlocked;
export const isUnhappyGirlManualPositionChangeBlocked = productionAdapter.isManualPositionChangeBlocked;
export const activeUnhappyGirlBattleLocks = productionAdapter.activeLocks;
