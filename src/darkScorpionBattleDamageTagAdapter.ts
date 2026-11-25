import type { Card } from './cardCatalog';
import type { CardRef, DuelState, Backrow } from './duelEngine';
import {
  bindTarget,
  synchronizeCardLifetimes,
  targetBindingValid,
  type TargetBinding,
} from './cardLifetime';
import { discardBackrow } from './classicEffects';
import { getDuelCard, getPlayableCard } from './effectRegistry';
import { shuffleDuel } from './duelRandom';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';
import { monsterEffectsNegated } from './continuousEffects';

export const DARK_SCORPION_BURGLARS_ID = '40933924';
export const DARK_SCORPION_CLIFF_ID = '06967870';

type Team = 0 | 1;
type BattleChoice =
  | Readonly<{ kind: 'burglars-send-spell' }>
  | Readonly<{ kind: 'cliff-destroy'; targetUid: string }>
  | Readonly<{ kind: 'cliff-mill' }>;

export type BattleDamageEvent = Readonly<{
  kind: 'battle-damage-to-opponent';
  eventId: string;
  battleId: string;
  turn: number;
  attackerUid: string;
  attackerId: string;
  attackerTeam: Team;
  opponentTeam: Team;
  damage: number;
  opponentLpBefore: number;
  opponentLpAfter: number;
  damageApplied: true;
  sourceWasFaceUp: true;
}>;

export type BattleEffectPlan = Readonly<{
  kind: 'burglars-send-spell' | 'cliff-destroy' | 'cliff-mill';
  eventId: string;
  battleId: string;
  turn: number;
  attackerUid: string;
  attackerId: string;
  attackerBinding: TargetBinding;
  attackerTeam: Team;
  opponentTeam: Team;
  targetUid?: string;
  targetBinding?: TargetBinding;
  targetId?: string;
}>;

export type BattleDamageState = TagDuel & {
  darkScorpionBattle?: {
    registeredEventIds: string[];
    resolvedEventIds: string[];
    pendingPlans: BattleEffectPlan[];
  };
};

export type CardLookup = (id: string) => Pick<Card, 'kind' | 'monsterType'> | undefined;
export type PrepareResult = Readonly<{
  state: BattleDamageState;
  status: 'ready' | 'duplicate' | 'not-eligible' | 'negated' | 'invalid-choice' | 'invalid-target';
  plan?: BattleEffectPlan;
}>;
export type ResolveResult = Readonly<{
  state: BattleDamageState;
  status: 'resolved' | 'duplicate' | 'awaiting-opponent-selection' | 'invalid-selection' |
    'no-eligible-card' | 'stale-event' | 'stale-target' | 'target-left-field' | 'source-negated' | 'invalid-plan';
  sentUids: readonly string[];
}>;

type AdapterIds = Readonly<{ burglarsId?: string; cliffId?: string }>;
type LocatedBackrow = { team: Team; card: Backrow };

const cardLookup: CardLookup = id => getPlayableCard(id);
const validTeam = (team: number): team is Team => team === 0 || team === 1;
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 160;

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido.');
  return Number(match[1]);
}

function locateBackrow(state: DuelState, uid: string): LocatedBackrow | undefined {
  const matches: LocatedBackrow[] = [];
  for (let team = 0; team < 2; team++) {
    const player = state.players[team];
    const card = player.backrow.find(item => item.uid === uid) ??
      (player.field?.uid === uid ? player.field : undefined);
    if (card) matches.push({ team: team as Team, card });
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function emptyRecord() {
  return {
    registeredEventIds: [] as string[],
    resolvedEventIds: [] as string[],
    pendingPlans: [] as BattleEffectPlan[],
  };
}

function assertPhysicalRules(state: BattleDamageState): void {
  for (let team = 0; team < 2; team++) {
    const player = state.core.players[team];
    if (player.monsters.length > RULES_PROFILE.monsterZones ||
        player.backrow.length > RULES_PROFILE.spellTrapZones) {
      throw new Error('Limite de zonas 3+3 excedido.');
    }
  }
  const main = [0, 0, 0, 0];
  const extra = [0, 0, 0, 0];
  for (const card of tagInventory(state)) {
    if (card.entityKind === 'token') continue;
    const seat = physicalSeat(card.uid);
    if (state.members[seat]?.team !== seat % 2) throw new Error('Proprietário físico incompatível.');
    const info = getDuelCard(card.id);
    if (!info) throw new Error('Carta sem metadados admitidos.');
    if (info.fusion) extra[seat]++;
    else main[seat]++;
  }
  for (let seat = 0; seat < 4; seat++) {
    if (main[seat] < RULES_PROFILE.mainDeckMin || main[seat] > RULES_PROFILE.mainDeckMax) {
      throw new Error('Deck Principal físico fora de 20–30.');
    }
    if (extra[seat] > RULES_PROFILE.extraDeckMax) throw new Error('Deck Adicional excedeu cinco cartas.');
  }
}

function assertState(state: BattleDamageState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1) {
    throw new Error('Estado TagDuel inválido para Dark Scorpion.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);
  const record = state.darkScorpionBattle;
  if (!record) return;
  const validReceipts = (items: unknown): items is string[] =>
    Array.isArray(items) && items.length <= 4096 &&
    items.every(item => validId(item)) && new Set(items).size === items.length;
  if (!validReceipts(record.registeredEventIds) ||
      !validReceipts(record.resolvedEventIds) ||
      !Array.isArray(record.pendingPlans) || record.pendingPlans.length > 256) {
    throw new Error('Recibos de dano de batalha inválidos.');
  }
  const pending = new Set<string>();
  for (const plan of record.pendingPlans) {
    if (!plan || !validId(plan.eventId) || !validId(plan.battleId) ||
        !validId(plan.attackerUid) || !validId(plan.attackerId) ||
        !Number.isSafeInteger(plan.turn) || plan.turn < 1 ||
        !validTeam(plan.attackerTeam) || !validTeam(plan.opponentTeam) ||
        plan.attackerTeam === plan.opponentTeam || !plan.attackerBinding ||
        plan.attackerBinding.uid !== plan.attackerUid ||
        !['burglars-send-spell', 'cliff-destroy', 'cliff-mill'].includes(plan.kind)) {
      throw new Error('Plano Dark Scorpion inválido.');
    }
    if (plan.kind === 'cliff-destroy' &&
        (!validId(plan.targetUid) || !validId(plan.targetId) || !plan.targetBinding ||
         plan.targetBinding.uid !== plan.targetUid)) {
      throw new Error('Plano de destruição Cliff sem alvo vinculado.');
    }
    if (pending.has(plan.eventId)) throw new Error('Plano de batalha duplicado.');
    pending.add(plan.eventId);
  }
}

function inventorySnapshot(state: BattleDamageState): string {
  const cards = tagInventory(state);
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) throw new Error('UID físico duplicado.');
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function assertConserved(before: string, after: BattleDamageState): void {
  if (inventorySnapshot(after) !== before) {
    throw new Error('Dark Scorpion alterou ou concedeu inventário físico.');
  }
}

function validateBattleEvent(
  state: BattleDamageState,
  event: BattleDamageEvent,
  cardId: string,
  lookup: CardLookup
): void {
  if (!event || event.kind !== 'battle-damage-to-opponent' ||
      !validId(event.eventId) || event.eventId.length > 80 ||
      !validId(event.battleId) || !Number.isSafeInteger(event.turn) ||
      event.turn !== state.core.turn || !validId(event.attackerUid) ||
      event.attackerId !== cardId || !validTeam(event.attackerTeam) ||
      !validTeam(event.opponentTeam) || event.attackerTeam === event.opponentTeam ||
      event.opponentTeam !== 1 - event.attackerTeam ||
      !Number.isSafeInteger(event.damage) || event.damage <= 0 ||
      !Number.isSafeInteger(event.opponentLpBefore) ||
      !Number.isSafeInteger(event.opponentLpAfter) ||
      event.opponentLpBefore - event.opponentLpAfter !== event.damage ||
      state.core.players[event.opponentTeam].lp !== event.opponentLpAfter ||
      event.damageApplied !== true || event.sourceWasFaceUp !== true) {
    throw new Error('Gatilho exige dano de batalha real, aplicado e dirigido à equipe adversária.');
  }

  const seat = physicalSeat(event.attackerUid);
  if (state.members[seat]?.team !== seat % 2) throw new Error('Proprietário físico do atacante inválido.');
  const source = state.core.players[event.attackerTeam].monsters.find(monster => monster.uid === event.attackerUid);
  if (!source || source.id !== cardId || !source.faceUp) {
    throw new Error('Atacante precisa ser a instância face-up que causou o dano.');
  }
  const metadata = lookup(cardId);
  if (!metadata || metadata.kind !== 'monster' || metadata.monsterType !== 'effect') {
    throw new Error('Dark Scorpion precisa ser monstro de efeito admitido.');
  }
}

export function createDarkScorpionBattleDamageTagAdapter(
  ids: AdapterIds = {},
  lookup: CardLookup = cardLookup
) {
  const burglarsId = ids.burglarsId ?? DARK_SCORPION_BURGLARS_ID;
  const cliffId = ids.cliffId ?? DARK_SCORPION_CLIFF_ID;
  if (!validId(burglarsId) || !validId(cliffId) || burglarsId === cliffId) {
    throw new Error('IDs Dark Scorpion inválidos.');
  }

  function prepare(
    input: BattleDamageState,
    event: BattleDamageEvent,
    choice: BattleChoice
  ): PrepareResult {
    assertState(input);
    const cardId = event?.attackerId;
    if (cardId !== burglarsId && cardId !== cliffId) {
      throw new Error('Atacante fora do adapter Dark Scorpion.');
    }
    validateBattleEvent(input, event, cardId, lookup);
    const before = inventorySnapshot(input);
    const state = structuredClone(input);
    const record = state.darkScorpionBattle ??= emptyRecord();
    if (record.registeredEventIds.includes(event.eventId)) {
      assertConserved(before, state);
      return { state, status: 'duplicate' };
    }
    if (monsterEffectsNegated(state.core, event.attackerUid)) {
      record.registeredEventIds.push(event.eventId);
      assertConserved(before, state);
      return { state, status: 'negated' };
    }

    let kind: BattleEffectPlan['kind'];
    let target: LocatedBackrow | undefined;
    if (cardId === burglarsId) {
      if (choice?.kind !== 'burglars-send-spell') {
        return { state, status: 'invalid-choice' };
      }
      kind = 'burglars-send-spell';
    } else if (choice?.kind === 'cliff-mill') {
      kind = 'cliff-mill';
    } else if (choice?.kind === 'cliff-destroy' && validId(choice.targetUid)) {
      target = locateBackrow(state.core, choice.targetUid);
      if (!target) return { state, status: 'invalid-target' };
      const info = getDuelCard(target.card.id);
      if (!info || (info.kind !== 'spell' && info.kind !== 'trap')) {
        return { state, status: 'invalid-target' };
      }
      kind = 'cliff-destroy';
    } else {
      return { state, status: 'invalid-choice' };
    }

    const attackerBinding = bindTarget(state.core, event.attackerUid);
    if (!attackerBinding || attackerBinding.zone !== 'monsters') {
      return { state, status: 'not-eligible' };
    }
    const plan: BattleEffectPlan = {
      kind,
      eventId: event.eventId,
      battleId: event.battleId,
      turn: event.turn,
      attackerUid: event.attackerUid,
      attackerId: cardId,
      attackerBinding: { ...attackerBinding },
      attackerTeam: event.attackerTeam,
      opponentTeam: event.opponentTeam,
      ...(target ? {
        targetUid: target.card.uid,
        targetId: target.card.id,
        targetBinding: bindTarget(state.core, target.card.uid),
      } : {}),
    };
    if (kind === 'cliff-destroy' && !plan.targetBinding) {
      return { state, status: 'invalid-target' };
    }
    if (record.pendingPlans.length >= 256) throw new Error('Limite de planos de batalha excedido.');
    record.registeredEventIds.push(event.eventId);
    record.pendingPlans.push(plan);
    assertConserved(before, state);
    return { state, status: 'ready', plan };
  }

  function resolve(
    input: BattleDamageState,
    plan: BattleEffectPlan,
    selectedSpellUid?: string
  ): ResolveResult {
    assertState(input);
    if (!plan || !validId(plan.eventId) || !validId(plan.attackerUid) ||
        !validId(plan.attackerId) || !validTeam(plan.attackerTeam) ||
        !validTeam(plan.opponentTeam) || plan.attackerTeam === plan.opponentTeam) {
      throw new Error('Plano de resolução Dark Scorpion inválido.');
    }
    const before = inventorySnapshot(input);
    const state = structuredClone(input);
    const record = state.darkScorpionBattle ??= emptyRecord();
    if (record.resolvedEventIds.includes(plan.eventId)) {
      assertConserved(before, state);
      return { state, status: 'duplicate', sentUids: [] };
    }
    const index = record.pendingPlans.findIndex(item =>
      item.eventId === plan.eventId && JSON.stringify(item) === JSON.stringify(plan)
    );
    if (index < 0) {
      assertConserved(before, state);
      return { state, status: 'invalid-plan', sentUids: [] };
    }

    const stored = record.pendingPlans[index];
    if (stored.turn !== state.core.turn) {
      record.pendingPlans.splice(index, 1);
      record.resolvedEventIds.push(stored.eventId);
      assertConserved(before, state);
      return { state, status: 'stale-event', sentUids: [] };
    }
    if (monsterEffectsNegated(state.core, stored.attackerUid)) {
      record.pendingPlans.splice(index, 1);
      record.resolvedEventIds.push(stored.eventId);
      assertConserved(before, state);
      return { state, status: 'source-negated', sentUids: [] };
    }

    if (stored.kind === 'burglars-send-spell') {
      const opponentDeck = state.core.players[stored.opponentTeam].deck;
      const eligible = opponentDeck.filter(card => getDuelCard(card.id)?.kind === 'spell');
      if (!eligible.length) {
        record.pendingPlans.splice(index, 1);
        record.resolvedEventIds.push(stored.eventId);
        assertConserved(before, state);
        return { state, status: 'no-eligible-card', sentUids: [] };
      }
      if (!selectedSpellUid) {
        assertConserved(before, state);
        return { state, status: 'awaiting-opponent-selection', sentUids: [] };
      }
      const selectedIndex = opponentDeck.findIndex(card => card.uid === selectedSpellUid);
      if (selectedIndex < 0 || getDuelCard(opponentDeck[selectedIndex]?.id)?.kind !== 'spell') {
        assertConserved(before, state);
        return { state, status: 'invalid-selection', sentUids: [] };
      }
      const [selected] = opponentDeck.splice(selectedIndex, 1);
      state.core.players[stored.opponentTeam].grave.push(selected);
      shuffleDuel(opponentDeck, state.core);
      synchronizeCardLifetimes(state.core);
      record.pendingPlans.splice(index, 1);
      record.resolvedEventIds.push(stored.eventId);
      assertTagDuel(state);
      assertPhysicalRules(state);
      assertConserved(before, state);
      return { state, status: 'resolved', sentUids: [selected.uid] };
    }

    if (stored.kind === 'cliff-mill') {
      const deck = state.core.players[stored.opponentTeam].deck;
      if (!deck.length) {
        record.pendingPlans.splice(index, 1);
        record.resolvedEventIds.push(stored.eventId);
        assertConserved(before, state);
        return { state, status: 'no-eligible-card', sentUids: [] };
      }
      const sent = deck.splice(0, Math.min(2, deck.length));
      state.core.players[stored.opponentTeam].grave.push(...sent);
      synchronizeCardLifetimes(state.core);
      record.pendingPlans.splice(index, 1);
      record.resolvedEventIds.push(stored.eventId);
      assertTagDuel(state);
      assertPhysicalRules(state);
      assertConserved(before, state);
      return { state, status: 'resolved', sentUids: sent.map(card => card.uid) };
    }

    if (stored.kind === 'cliff-destroy') {
      if (!targetBindingValid(state.core, stored.targetBinding)) {
        record.pendingPlans.splice(index, 1);
        record.resolvedEventIds.push(stored.eventId);
        assertConserved(before, state);
        return { state, status: 'stale-target', sentUids: [] };
      }
      const target = locateBackrow(state.core, stored.targetUid!);
      if (!target || target.card.id !== stored.targetId) {
        record.pendingPlans.splice(index, 1);
        record.resolvedEventIds.push(stored.eventId);
        assertConserved(before, state);
        return { state, status: 'target-left-field', sentUids: [] };
      }
      discardBackrow(state.core, stored.targetUid!);
      synchronizeCardLifetimes(state.core);
      record.pendingPlans.splice(index, 1);
      record.resolvedEventIds.push(stored.eventId);
      assertTagDuel(state);
      assertPhysicalRules(state);
      assertConserved(before, state);
      return { state, status: 'resolved', sentUids: [stored.targetUid!] };
    }

    return { state, status: 'invalid-plan', sentUids: [] };
  }

  return { prepare, resolve };
}
