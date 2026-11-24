import type { Card } from './cardCatalog';
import type { DuelState } from './duelEngine';
import { getDuelCard, getPlayableCard } from './effectRegistry';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const UNHAPPY_MAIDEN_ID = '51275027';
type Team = 0 | 1;

export type BattleDestroyedEvent = Readonly<{
  kind: 'battle-destroyed';
  activationId: string;
  sourceUid: string;
  sourceId: string;
  turn: number;
  triggerActorTeam: Team;
  battleTeam: Team;
  cause: 'battle';
  destination: 'grave';
  damageStepComplete: true;
}>;

export type UnhappyMaidenPlan = Readonly<{
  kind: 'unhappyMaidenEndBattlePhase';
  activationId: string;
  sourceUid: string;
  sourceId: string;
  ownerSeat: number;
  ownerTeam: Team;
  activeSeat: number;
  battleTeam: Team;
  turn: number;
}>;

type PendingEnd = Readonly<{ turn: number; activationIds: readonly string[] }>;
export type UnhappyMaidenState = TagDuel & {
  unhappyMaidenBattlePhaseEnd?: {
    resolvedActivationIds: string[];
    pending?: PendingEnd;
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

function assertPhysicalRules(state: UnhappyMaidenState): void {
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

function assertState(state: UnhappyMaidenState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para The Unhappy Maiden.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);

  const memory = state.unhappyMaidenBattlePhaseEnd;
  if (!memory) return;
  if (!Array.isArray(memory.resolvedActivationIds) ||
      memory.resolvedActivationIds.some(id => !validActivationId(id)) ||
      new Set(memory.resolvedActivationIds).size !== memory.resolvedActivationIds.length) {
    throw new Error('Recibos de ativação de The Unhappy Maiden inválidos.');
  }
  if (memory.pending) {
    const ids = memory.pending.activationIds;
    if (!Number.isSafeInteger(memory.pending.turn) || memory.pending.turn < 1 ||
        !Array.isArray(ids) || ids.length === 0 ||
        ids.some(id => !memory.resolvedActivationIds.includes(id)) ||
        new Set(ids).size !== ids.length) {
      throw new Error('Pedido pendente de fim da Battle Phase inválido.');
    }
  }
}

function validActivationId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
}

function inventorySnapshot(state: UnhappyMaidenState): string {
  const cards = tagInventory(state);
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function assertConserved(before: string, after: UnhappyMaidenState): void {
  if (inventorySnapshot(after) !== before) {
    throw new Error('The Unhappy Maiden alterou o inventário físico.');
  }
}

function sourceInOwnerGrave(
  state: UnhappyMaidenState,
  sourceUid: string,
  sourceId: string,
  ownerTeam: Team
): boolean {
  const matches = state.core.players.flatMap((player, team) =>
    player.grave.filter(card => card.uid === sourceUid && card.id === sourceId)
      .map(() => team)
  );
  return matches.length === 1 && matches[0] === ownerTeam;
}

/**
 * The trigger is mandatory only when the physical card was sent to its owner's
 * team Graveyard by battle after Damage Step. The owner team may differ from
 * the team whose Battle Phase is currently active.
 */
function planForCardId(
  state: UnhappyMaidenState,
  event: BattleDestroyedEvent,
  expectedCardId: string,
  lookup: CardLookup
): UnhappyMaidenPlan {
  assertState(state);
  if (!event || event.kind !== 'battle-destroyed' ||
      !validActivationId(event.activationId) ||
      typeof event.sourceUid !== 'string' ||
      event.sourceId !== expectedCardId ||
      event.turn !== state.core.turn ||
      !validTeam(event.triggerActorTeam) ||
      !validTeam(event.battleTeam) ||
      event.battleTeam !== state.core.current ||
      event.cause !== 'battle' ||
      event.destination !== 'grave' ||
      event.damageStepComplete !== true ||
      state.core.resume !== 'battle' ||
      !['battle', 'response'].includes(state.core.phase)) {
    throw new Error('O gatilho exige envio ao Cemitério por batalha após o Damage Step.');
  }

  const ownerSeat = physicalSeat(event.sourceUid);
  const ownerTeam = (ownerSeat % 2) as Team;
  if (state.members[ownerSeat]?.team !== ownerTeam ||
      event.triggerActorTeam !== ownerTeam ||
      !sourceInOwnerGrave(state, event.sourceUid, expectedCardId, ownerTeam)) {
    throw new Error('A fonte deve estar no Cemitério da equipe proprietária física.');
  }

  const metadata = lookup(expectedCardId);
  if (!metadata || metadata.kind !== 'monster' || metadata.monsterType !== 'effect') {
    throw new Error('Definição de monstro de efeito não admitida.');
  }

  const memory = state.unhappyMaidenBattlePhaseEnd;
  if (memory?.resolvedActivationIds.includes(event.activationId) ||
      memory?.pending?.activationIds.includes(event.activationId)) {
    throw new Error('Esta ativação de The Unhappy Maiden já foi registrada.');
  }

  return Object.freeze({
    kind: 'unhappyMaidenEndBattlePhase',
    activationId: event.activationId,
    sourceUid: event.sourceUid,
    sourceId: expectedCardId,
    ownerSeat,
    ownerTeam,
    activeSeat: state.active[ownerTeam],
    battleTeam: event.battleTeam,
    turn: event.turn,
  });
}

/**
 * Resolves the mandatory trigger without ending the phase inside the Chain.
 * A source removed from the Graveyard after activation still resolves.
 */
function resolveForCardId(
  input: UnhappyMaidenState,
  plan: UnhappyMaidenPlan,
  expectedCardId: string,
  effectNegated = false
): {
  status: 'resolved' | 'negated' | 'duplicate';
  state: UnhappyMaidenState;
  endBattlePending: boolean;
} {
  assertState(input);
  if (!plan || plan.kind !== 'unhappyMaidenEndBattlePhase' ||
      !validActivationId(plan.activationId) ||
      plan.sourceId !== expectedCardId ||
      physicalSeat(plan.sourceUid) !== plan.ownerSeat ||
      plan.ownerTeam !== plan.ownerSeat % 2 ||
      !validTeam(plan.ownerTeam) || !validTeam(plan.battleTeam) ||
      !Number.isInteger(plan.activeSeat) ||
      plan.turn !== input.core.turn ||
      plan.battleTeam !== input.core.current ||
      input.active[plan.ownerTeam] !== plan.activeSeat ||
      input.core.resume !== 'battle' ||
      !['battle', 'response'].includes(input.core.phase) ||
      typeof effectNegated !== 'boolean') {
    throw new Error('Plano de The Unhappy Maiden obsoleto ou inválido.');
  }

  const currentMemory = input.unhappyMaidenBattlePhaseEnd;
  if (currentMemory?.resolvedActivationIds.includes(plan.activationId)) {
    return {
      status: 'duplicate',
      state: input,
      endBattlePending: !!currentMemory.pending,
    };
  }

  const before = inventorySnapshot(input);
  const next = structuredClone(input) as UnhappyMaidenState;
  const memory = next.unhappyMaidenBattlePhaseEnd ?? { resolvedActivationIds: [] };
  memory.resolvedActivationIds.push(plan.activationId);

  if (!effectNegated) {
    if (memory.pending && memory.pending.turn !== plan.turn) {
      throw new Error('Existe pedido de Battle Phase pendente de outro turno.');
    }
    const activationIds = memory.pending ? [...memory.pending.activationIds] : [];
    if (!activationIds.includes(plan.activationId)) activationIds.push(plan.activationId);
    memory.pending = { turn: plan.turn, activationIds };
  }

  next.unhappyMaidenBattlePhaseEnd = memory;
  assertState(next);
  assertConserved(before, next);
  return {
    status: effectNegated ? 'negated' : 'resolved',
    state: next,
    endBattlePending: !!memory.pending,
  };
}

/**
 * Called by the host after the Chain/trigger queue has completely settled.
 * It reuses the engine's existing end-of-Battle-Phase response boundary so
 * End Phase cleanup and the six-card discard rule remain owned by the engine.
 */
function finalizeAfterChain(input: UnhappyMaidenState): {
  status: 'none' | 'waiting-for-chain' | 'battle-already-ended' | 'stale' | 'end-requested';
  state: UnhappyMaidenState;
  activationIds?: string[];
} {
  assertState(input);
  const pending = input.unhappyMaidenBattlePhaseEnd?.pending;
  if (!pending) return { status: 'none', state: input };

  const clearPending = (status: 'battle-already-ended' | 'stale') => {
    const next = structuredClone(input) as UnhappyMaidenState;
    if (next.unhappyMaidenBattlePhaseEnd) delete next.unhappyMaidenBattlePhaseEnd.pending;
    assertState(next);
    assertConserved(inventorySnapshot(input), next);
    return { status, state: next } as const;
  };

  if (pending.turn !== input.core.turn) return clearPending('stale');
  if (input.core.phase === 'finished' || input.core.phase === 'main' ||
      input.core.resume !== 'battle' || input.core.turnEnding ||
      input.core.phase === 'response' && input.core.pending.kind === 'end') {
    return clearPending('battle-already-ended');
  }

  const core = input.core;
  const waiting = core.phase !== 'battle' ||
    core.chain.length > 0 ||
    core.pending.kind !== 'none' ||
    !!core.choice ||
    !!core.triggerBuild ||
    !!core.handFlow ||
    !!core.damageStep ||
    !!core.graveTriggers?.length ||
    !!core.summonTriggers?.length ||
    !!core.effectFlips?.length ||
    !!core.afterEffectFlips ||
    !!core.afterMonsterEffect ||
    !!core.battleFlip;
  if (waiting) return { status: 'waiting-for-chain', state: input };

  const before = inventorySnapshot(input);
  const next = structuredClone(input) as UnhappyMaidenState;
  delete next.unhappyMaidenBattlePhaseEnd!.pending;
  next.core.pending = { kind: 'end' };
  next.core.pendingNegated = false;
  next.core.resume = 'battle';
  next.core.phase = 'response';
  next.core.priority = next.core.current;
  next.core.passes = 0;
  next.core.chain = [];
  next.core.log = [
    ...next.core.log,
    'A Donzela Infeliz encerrou a Fase de Batalha após a resolução da corrente.',
  ].slice(-12);

  assertState(next);
  assertConserved(before, next);
  return {
    status: 'end-requested',
    state: next,
    activationIds: [...pending.activationIds],
  };
}

export function createUnhappyMaidenAdapter(
  cardId = UNHAPPY_MAIDEN_ID,
  lookup: CardLookup = cardLookup
) {
  if (typeof cardId !== 'string' || !cardId.trim()) {
    throw new Error('ID de carta inválido para The Unhappy Maiden.');
  }
  return Object.freeze({
    plan: (state: UnhappyMaidenState, event: BattleDestroyedEvent) =>
      planForCardId(state, event, cardId, lookup),
    resolve: (state: UnhappyMaidenState, plan: UnhappyMaidenPlan, effectNegated = false) =>
      resolveForCardId(state, plan, cardId, effectNegated),
    finalizeAfterChain,
  });
}

const productionAdapter = createUnhappyMaidenAdapter();
export const planUnhappyMaidenBattlePhaseEnd = productionAdapter.plan;
export const resolveUnhappyMaidenBattlePhaseEnd = productionAdapter.resolve;
export const finalizeUnhappyMaidenBattlePhaseEnd = productionAdapter.finalizeAfterChain;
