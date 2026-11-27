import type { Card } from './cardCatalog';
import type { CardRef, DuelState, Monster } from './duelEngine';
import {
  bindTarget,
  synchronizeCardLifetimes,
  targetBindingValid,
  type TargetBinding,
} from './cardLifetime';
import { canAffectMonster, monsterEffectsNegated } from './continuousEffects';
import { cleanEquips, turnMonsterFaceDown } from './classicEffects';
import { getDuelCard, getPlayableCard } from './effectRegistry';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';
import { ownedPrivateZone } from './teamRotation';

export const TSUKUYOMI_ID = '34853266';
export const OTOHIME_ID = '39751093';

type Team = 0 | 1;
type SummonKind = 'normal' | 'flip' | 'effect-flip' | 'special';

export type SpiritSummonEvent = Readonly<{
  kind: 'monster-summoned' | 'monster-flipped-face-up';
  eventId: string;
  turn: number;
  controllerTeam: Team;
  sourceUid: string;
  sourceId: string;
  summonKind: SummonKind;
  sourceWasFaceUp: true;
  transitionSucceeded: true;
}>;

export type SpiritEndPhaseEvent = Readonly<{
  kind: 'end-phase';
  eventId: string;
  turn: number;
}>;

export type SpiritReturnMarker = Readonly<{
  eventId: string;
  turn: number;
  uid: string;
  cardId: string;
  ownerSeat: number;
  controllerTeam: Team;
  binding: TargetBinding;
}>;

export type PositionEffectPlan = Readonly<{
  kind: 'tsukuyomi-set' | 'otohime-toggle';
  activationId: string;
  turn: number;
  sourceUid: string;
  sourceId: string;
  sourceOwnerSeat: number;
  sourceBinding: TargetBinding;
  controllerTeam: Team;
  targetUid: string;
  targetId: string;
  targetBinding: TargetBinding;
}>;

export type SpiritPositionState = TagDuel & {
  spiritPosition?: {
    registeredSummonEventIds: string[];
    effectAttemptIds: string[];
    resolvedEffectIds: string[];
    resolvedEndPhaseIds: string[];
    pendingReturns: SpiritReturnMarker[];
    pendingEffects: PositionEffectPlan[];
  };
};

export type CardLookup = (id: string) => Pick<Card, 'kind' | 'monsterType'> | undefined;
export type RegisterResult = Readonly<{
  state: SpiritPositionState;
  status: 'registered' | 'already-pending' | 'duplicate';
}>;
export type PlanResult = Readonly<{
  state: SpiritPositionState;
  status: 'ready' | 'not-registered' | 'duplicate' | 'source-left-field' |
    'source-face-down' | 'negated' | 'no-target' | 'invalid-target' | 'protected';
  plan?: PositionEffectPlan;
}>;
export type PositionResult = Readonly<{
  state: SpiritPositionState;
  status: 'resolved' | 'duplicate' | 'stale-event' | 'stale-target' |
    'target-left-field' | 'target-face-down' | 'source-negated' | 'protected' | 'invalid-target';
}>;
export type ReturnResult = Readonly<{
  state: SpiritPositionState;
  status: 'resolved' | 'no-pending' | 'duplicate';
  results: readonly Readonly<{
    uid: string;
    status: 'returned' | 'left-field' | 'face-down' | 'negated' | 'stale-instance' | 'missed-end-phase';
    ownerSeat?: number;
  }>[];
}>;
export type ResolveOptions = Readonly<{ effectNegated?: boolean }>;

type LocatedMonster = { team: Team; monster: Monster };
type AdapterIds = Readonly<{ tsukuyomiId?: string; otohimeId?: string }>;

const cardLookup: CardLookup = id => getPlayableCard(id);
const validTeam = (team: number): team is Team => team === 0 || team === 1;
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 160;

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido.');
  return Number(match[1]);
}

function locateMonster(state: DuelState, uid: string): LocatedMonster | undefined {
  const matches: LocatedMonster[] = [];
  for (let team = 0; team < 2; team++) {
    const monster = state.players[team].monsters.find(item => item.uid === uid);
    if (monster) matches.push({ team: team as Team, monster });
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function assertPhysicalRules(state: SpiritPositionState): void {
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

function assertState(state: SpiritPositionState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para Tsukuyomi/Otohime.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);

  const record = state.spiritPosition;
  if (!record) return;
  const { registeredSummonEventIds, effectAttemptIds, resolvedEffectIds, resolvedEndPhaseIds, pendingReturns, pendingEffects } = record;
  const validReceipts = (values: unknown): values is string[] =>
    Array.isArray(values) && values.length <= 4096 &&
    values.every(id => validId(id)) && new Set(values).size === values.length;
  if (!validReceipts(registeredSummonEventIds) ||
      !validReceipts(effectAttemptIds) ||
      !validReceipts(resolvedEffectIds) ||
      !validReceipts(resolvedEndPhaseIds) ||
      !Array.isArray(pendingReturns) || pendingReturns.length > 256 ||
      !Array.isArray(pendingEffects) || pendingEffects.length > 256) {
    throw new Error('Recibos de Tsukuyomi/Otohime inválidos.');
  }

  const pendingKeys = new Set<string>();
  for (const marker of pendingReturns) {
    if (!marker || !validId(marker.eventId) || !Number.isSafeInteger(marker.turn) ||
        marker.turn < 1 || !validId(marker.uid) || !validId(marker.cardId) ||
        !Number.isSafeInteger(marker.ownerSeat) || marker.ownerSeat < 0 || marker.ownerSeat > 3 ||
        !validTeam(marker.controllerTeam) || !marker.binding ||
        marker.binding.uid !== marker.uid || marker.binding.zone !== 'monsters' ||
        !Number.isSafeInteger(marker.binding.epoch) || marker.binding.epoch < 0 ||
        physicalSeat(marker.uid) !== marker.ownerSeat ||
        state.members[marker.ownerSeat]?.team !== marker.ownerSeat % 2) {
      throw new Error('Marcador Spirit inválido.');
    }
    const key = marker.turn + ':' + marker.uid;
    if (pendingKeys.has(key)) throw new Error('Retorno Spirit duplicado.');
    pendingKeys.add(key);
  }

  const effectKeys = new Set<string>();
  for (const plan of pendingEffects) {
    if (!plan || !validId(plan.activationId) || !validId(plan.sourceUid) ||
        !validId(plan.sourceId) || !validId(plan.targetUid) || !validId(plan.targetId) ||
        !['tsukuyomi-set', 'otohime-toggle'].includes(plan.kind) ||
        !Number.isSafeInteger(plan.turn) || plan.turn < 1 ||
        !Number.isSafeInteger(plan.sourceOwnerSeat) || plan.sourceOwnerSeat < 0 || plan.sourceOwnerSeat > 3 ||
        !validTeam(plan.controllerTeam) || !plan.sourceBinding || !plan.targetBinding ||
        plan.sourceBinding.uid !== plan.sourceUid || plan.targetBinding.uid !== plan.targetUid ||
        plan.sourceBinding.zone !== 'monsters' || plan.targetBinding.zone !== 'monsters') {
      throw new Error('Plano de efeito Spirit inválido.');
    }
    if (effectKeys.has(plan.activationId)) throw new Error('Plano de efeito Spirit duplicado.');
    effectKeys.add(plan.activationId);
  }
}

function inventorySnapshot(state: SpiritPositionState): string {
  const cards = tagInventory(state);
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function assertConserved(before: string, after: SpiritPositionState): void {
  if (inventorySnapshot(after) !== before) {
    throw new Error('Tsukuyomi/Otohime alterou o inventário físico.');
  }
}

function emptyRecord() {
  return {
    registeredSummonEventIds: [] as string[],
    effectAttemptIds: [] as string[],
    resolvedEffectIds: [] as string[],
    resolvedEndPhaseIds: [] as string[],
    pendingReturns: [] as SpiritReturnMarker[],
    pendingEffects: [] as PositionEffectPlan[],
  };
}

function samePlan(a: PositionEffectPlan, b: PositionEffectPlan): boolean {
  return a.kind === b.kind && a.activationId === b.activationId &&
    a.turn === b.turn && a.sourceUid === b.sourceUid && a.sourceId === b.sourceId &&
    a.sourceOwnerSeat === b.sourceOwnerSeat && a.controllerTeam === b.controllerTeam &&
    a.targetUid === b.targetUid && a.targetId === b.targetId &&
    JSON.stringify(a.sourceBinding) === JSON.stringify(b.sourceBinding) &&
    JSON.stringify(a.targetBinding) === JSON.stringify(b.targetBinding);
}

function validateSummonEvent(
  state: SpiritPositionState,
  event: SpiritSummonEvent,
  cardId: string,
  lookup: CardLookup
): { ownerSeat: number; controllerTeam: Team } {
  if (!event || !validId(event.eventId) || event.eventId.length > 80 ||
      !Number.isSafeInteger(event.turn) || event.turn !== state.core.turn ||
      !validTeam(event.controllerTeam) || !validId(event.sourceUid) ||
      event.sourceId !== cardId || event.summonKind === 'special' ||
      !['normal', 'flip', 'effect-flip'].includes(event.summonKind) ||
      event.sourceWasFaceUp !== true || event.transitionSucceeded !== true ||
      (event.summonKind === 'effect-flip'
        ? event.kind !== 'monster-flipped-face-up'
        : event.kind !== 'monster-summoned')) {
    throw new Error('Spirit exige Invocação-Normal, Flip ou virada face-up bem-sucedida; Invocação-Especial é proibida.');
  }

  const ownerSeat = physicalSeat(event.sourceUid);
  const ownerTeam = (ownerSeat % 2) as Team;
  if (state.members[ownerSeat]?.team !== ownerTeam) {
    throw new Error('Proprietário físico Spirit incompatível com o UID.');
  }

  const source = locateMonster(state.core, event.sourceUid);
  if (!source || source.team !== event.controllerTeam ||
      source.monster.id !== cardId || source.monster.faceUp !== true ||
      (source.monster.owner !== undefined && source.monster.owner !== ownerTeam)) {
    throw new Error('A carta Spirit precisa estar face-up no campo da equipe controladora.');
  }

  const metadata = lookup(cardId);
  if (!metadata || metadata.kind !== 'monster' || metadata.monsterType !== 'effect') {
    throw new Error('A carta Spirit precisa ser um monstro de efeito admitido.');
  }
  return { ownerSeat, controllerTeam: source.team };
}

export function createTsukuyomiOtohimeTagAdapter(
  ids: AdapterIds = {},
  lookup: CardLookup = cardLookup
) {
  const tsukuyomiId = ids.tsukuyomiId ?? TSUKUYOMI_ID;
  const otohimeId = ids.otohimeId ?? OTOHIME_ID;
  if (!validId(tsukuyomiId) || !validId(otohimeId) || tsukuyomiId === otohimeId) {
    throw new Error('IDs Tsukuyomi/Otohime inválidos.');
  }

  function registerSummon(
    input: SpiritPositionState,
    event: SpiritSummonEvent
  ): RegisterResult {
    assertState(input);
    if (!event || !validId(event.eventId)) {
      throw new Error('Evento de Invocação/virada Spirit inválido.');
    }
    const cardId = event.sourceId;
    if (cardId !== tsukuyomiId && cardId !== otohimeId) {
      throw new Error('Carta fora do adapter Tsukuyomi/Otohime.');
    }

    const before = inventorySnapshot(input);
    const state = structuredClone(input);
    const record = state.spiritPosition ??= emptyRecord();

    if (record.registeredSummonEventIds.includes(event.eventId)) {
      assertConserved(before, state);
      return { state, status: 'duplicate' };
    }

    const { ownerSeat, controllerTeam } = validateSummonEvent(state, event, cardId, lookup);
    if (record.registeredSummonEventIds.length >= 4096) {
      throw new Error('Limite de recibos Spirit excedido.');
    }
    record.registeredSummonEventIds.push(event.eventId);

    const binding = bindTarget(state.core, event.sourceUid);
    if (!binding || binding.zone !== 'monsters') {
      throw new Error('Carta Spirit sem vínculo válido de Monster Zone.');
    }

    const existingIndex = record.pendingReturns.findIndex(marker =>
      marker.uid === event.sourceUid && marker.turn === event.turn
    );
    if (existingIndex >= 0) {
      const existing = record.pendingReturns[existingIndex];
      if (targetBindingValid(state.core, existing.binding)) {
        assertConserved(before, state);
        return { state, status: 'already-pending' };
      }
      record.pendingReturns.splice(existingIndex, 1);
    }

    record.pendingReturns.push({
      eventId: event.eventId,
      turn: event.turn,
      uid: event.sourceUid,
      cardId,
      ownerSeat,
      controllerTeam,
      binding: { ...binding },
    });
    assertConserved(before, state);
    return { state, status: 'registered' };
  }

  function preparePositionEffect(
    input: SpiritPositionState,
    eventId: string,
    targetUid: string | undefined
  ): PlanResult {
    assertState(input);
    if (!validId(eventId)) throw new Error('ID de ativação Spirit inválido.');
    const marker = input.spiritPosition?.pendingReturns.find(item => item.eventId === eventId);
    if (!marker) return { state: input, status: 'not-registered' };

    const before = inventorySnapshot(input);
    const state = structuredClone(input);
    const record = state.spiritPosition ??= emptyRecord();
    if (record.effectAttemptIds.includes(eventId)) {
      assertConserved(before, state);
      return { state, status: 'duplicate' };
    }
    if (record.effectAttemptIds.length >= 4096) {
      throw new Error('Limite de tentativas de efeito Spirit excedido.');
    }
    record.effectAttemptIds.push(eventId);

    const source = locateMonster(state.core, marker.uid);
    if (!source || source.monster.id !== marker.cardId) {
      assertConserved(before, state);
      return { state, status: 'source-left-field' };
    }
    if (!source.monster.faceUp) {
      assertConserved(before, state);
      return { state, status: 'source-face-down' };
    }
    if (monsterEffectsNegated(state.core, marker.uid)) {
      assertConserved(before, state);
      return { state, status: 'negated' };
    }
    if (!targetUid || !validId(targetUid)) {
      assertConserved(before, state);
      return { state, status: 'no-target' };
    }

    const target = locateMonster(state.core, targetUid);
    if (!target || !target.monster.faceUp) {
      assertConserved(before, state);
      return { state, status: 'no-target' };
    }
    const isTsukuyomi = marker.cardId === tsukuyomiId;
    const isOtohime = marker.cardId === otohimeId;
    if (!isTsukuyomi && !isOtohime) throw new Error('Marcador Spirit não pertence a este adapter.');
    if (isOtohime && target.team === source.team) {
      assertConserved(before, state);
      return { state, status: 'invalid-target' };
    }
    if (isTsukuyomi && target.monster.entityKind === 'token') {
      assertConserved(before, state);
      return { state, status: 'invalid-target' };
    }
    if (!canAffectMonster(state.core, targetUid, 'monster')) {
      assertConserved(before, state);
      return { state, status: 'protected' };
    }

    const sourceBinding = bindTarget(state.core, marker.uid);
    const targetBinding = bindTarget(state.core, targetUid);
    if (!sourceBinding || sourceBinding.zone !== 'monsters' ||
        !targetBinding || targetBinding.zone !== 'monsters') {
      assertConserved(before, state);
      return { state, status: 'no-target' };
    }

    const plan: PositionEffectPlan = {
      kind: isTsukuyomi ? 'tsukuyomi-set' : 'otohime-toggle',
      activationId: eventId,
      turn: marker.turn,
      sourceUid: marker.uid,
      sourceId: marker.cardId,
      sourceOwnerSeat: marker.ownerSeat,
      sourceBinding: { ...sourceBinding },
      controllerTeam: source.team,
      targetUid,
      targetId: target.monster.id,
      targetBinding: { ...targetBinding },
    };
    record.pendingEffects.push(plan);
    assertConserved(before, state);
    return { state, status: 'ready', plan };
  }

  function resolvePositionEffect(
    input: SpiritPositionState,
    plan: PositionEffectPlan,
    options: ResolveOptions = {}
  ): PositionResult {
    assertState(input);
    if (!plan || !validId(plan.activationId) || !validId(plan.sourceUid) ||
        !validId(plan.sourceId) || !validId(plan.targetUid) || !validId(plan.targetId) ||
        !plan.sourceBinding || !plan.targetBinding ||
        !['tsukuyomi-set', 'otohime-toggle'].includes(plan.kind)) {
      throw new Error('Plano de posição Spirit inválido.');
    }
    const before = inventorySnapshot(input);
    const state = structuredClone(input);
    const record = state.spiritPosition ??= emptyRecord();
    if (record.resolvedEffectIds.includes(plan.activationId)) {
      assertConserved(before, state);
      return { state, status: 'duplicate' };
    }
    const pendingIndex = record.pendingEffects.findIndex(item => item.activationId === plan.activationId);
    if (pendingIndex < 0 || !samePlan(record.pendingEffects[pendingIndex], plan)) {
      assertConserved(before, state);
      return { state, status: 'invalid-target' };
    }
    if (record.resolvedEffectIds.length >= 4096) {
      throw new Error('Limite de resoluções Spirit excedido.');
    }
    record.pendingEffects.splice(pendingIndex, 1);
    record.resolvedEffectIds.push(plan.activationId);

    if (plan.turn !== state.core.turn) {
      assertConserved(before, state);
      return { state, status: 'stale-event' };
    }
    const expectedKind = plan.sourceId === tsukuyomiId
      ? 'tsukuyomi-set'
      : plan.sourceId === otohimeId ? 'otohime-toggle' : undefined;
    if (!expectedKind || plan.kind !== expectedKind) {
      assertConserved(before, state);
      return { state, status: 'invalid-target' };
    }
    if (!targetBindingValid(state.core, plan.targetBinding)) {
      assertConserved(before, state);
      return { state, status: 'stale-target' };
    }

    const target = locateMonster(state.core, plan.targetUid);
    if (!target || target.monster.id !== plan.targetId) {
      assertConserved(before, state);
      return { state, status: 'target-left-field' };
    }
    if (!target.monster.faceUp) {
      assertConserved(before, state);
      return { state, status: 'target-face-down' };
    }
    if (options.effectNegated === true || monsterEffectsNegated(state.core, plan.sourceUid)) {
      assertConserved(before, state);
      return { state, status: 'source-negated' };
    }
    if (!canAffectMonster(state.core, plan.targetUid, 'monster')) {
      assertConserved(before, state);
      return { state, status: 'protected' };
    }

    if (plan.kind === 'tsukuyomi-set') {
      if (target.monster.entityKind === 'token') {
        assertConserved(before, state);
        return { state, status: 'invalid-target' };
      }
      turnMonsterFaceDown(target.monster);
      cleanEquips(state.core);
    } else {
      target.monster.position = target.monster.position === 'atk' ? 'def' : 'atk';
      target.monster.changed = state.core.turn;
    }

    assertTagDuel(state);
    assertPhysicalRules(state);
    assertConserved(before, state);
    return { state, status: 'resolved' };
  }

  function resolveEndPhase(
    input: SpiritPositionState,
    event: SpiritEndPhaseEvent,
    options: ResolveOptions = {}
  ): ReturnResult {
    assertState(input);
    if (!event || event.kind !== 'end-phase' || !validId(event.eventId) ||
        !Number.isSafeInteger(event.turn) || event.turn !== input.core.turn) {
      throw new Error('Tsukuyomi/Otohime exige um evento End Phase do turno atual.');
    }

    const before = inventorySnapshot(input);
    const state = structuredClone(input);
    const record = state.spiritPosition ??= emptyRecord();
    if (record.resolvedEndPhaseIds.includes(event.eventId)) {
      assertConserved(before, state);
      return { state, status: 'duplicate', results: [] };
    }
    if (record.resolvedEndPhaseIds.length >= 4096) {
      throw new Error('Limite de recibos End Phase Spirit excedido.');
    }
    record.resolvedEndPhaseIds.push(event.eventId);

    const results: Array<{
      uid: string;
      status: 'returned' | 'left-field' | 'face-down' | 'negated' | 'stale-instance' | 'missed-end-phase';
      ownerSeat?: number;
    }> = [];
    const keep: SpiritReturnMarker[] = [];

    for (const marker of record.pendingReturns) {
      if (marker.turn > event.turn) {
        keep.push(marker);
        continue;
      }
      if (marker.turn < event.turn) {
        results.push({ uid: marker.uid, status: 'missed-end-phase' });
        continue;
      }
      if (!targetBindingValid(state.core, marker.binding)) {
        results.push({ uid: marker.uid, status: 'stale-instance' });
        continue;
      }

      const located = locateMonster(state.core, marker.uid);
      if (!located || located.monster.id !== marker.cardId) {
        results.push({ uid: marker.uid, status: 'left-field' });
        continue;
      }
      if (!located.monster.faceUp) {
        results.push({ uid: marker.uid, status: 'face-down' });
        continue;
      }
      if (options.effectNegated === true || monsterEffectsNegated(state.core, marker.uid)) {
        results.push({ uid: marker.uid, status: 'negated' });
        continue;
      }

      const index = state.core.players[located.team].monsters.findIndex(monster => monster.uid === marker.uid);
      if (index < 0) {
        results.push({ uid: marker.uid, status: 'left-field' });
        continue;
      }
      const [monster] = state.core.players[located.team].monsters.splice(index, 1);
      const ref: CardRef = { uid: monster.uid, id: monster.id };
      const ownerTeam = (marker.ownerSeat % 2) as Team;
      const destination = ownedPrivateZone(state.core, ref, ownerTeam, 'hand');
      destination.push(ref);
      const rotation = state.core.teamRotation;
      if (!rotation) throw new Error('Rotação física 2v2 ausente durante o retorno.');
      state.reserves = rotation.reserves;
      synchronizeCardLifetimes(state.core);
      results.push({ uid: marker.uid, status: 'returned', ownerSeat: marker.ownerSeat });
    }

    record.pendingReturns = keep;
    assertTagDuel(state);
    assertPhysicalRules(state);
    assertConserved(before, state);
    return {
      state,
      status: results.length ? 'resolved' : 'no-pending',
      results,
    };
  }

  function canBeSpecialSummoned(cardId: string): boolean {
    return cardId !== tsukuyomiId && cardId !== otohimeId;
  }

  return {
    registerSummon,
    preparePositionEffect,
    resolvePositionEffect,
    resolveEndPhase,
    canBeSpecialSummoned,
  };
}
