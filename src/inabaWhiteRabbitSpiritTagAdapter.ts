import type { Card } from './cardCatalog';
import type { CardRef, DuelState, Monster } from './duelEngine';
import {
  bindTarget,
  synchronizeCardLifetimes,
  targetBindingValid,
  type TargetBinding,
} from './cardLifetime';
import { monsterEffectsNegated } from './continuousEffects';
import { getDuelCard, getPlayableCard } from './effectRegistry';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';
import { ownedPrivateZone } from './teamRotation';

export const INABA_WHITE_RABBIT_ID = '77084837';

type Team = 0 | 1;
type SummonKind = 'normal' | 'flip' | 'effect-flip' | 'special';

export type InabaSummonEvent = Readonly<{
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

export type InabaEndPhaseEvent = Readonly<{
  kind: 'end-phase';
  eventId: string;
  turn: number;
}>;

export type InabaReturnMarker = Readonly<{
  eventId: string;
  turn: number;
  uid: string;
  cardId: string;
  ownerSeat: number;
  controllerTeam: Team;
  binding: TargetBinding;
}>;

export type InabaWhiteRabbitState = TagDuel & {
  inabaWhiteRabbit?: {
    registeredSummonEventIds: string[];
    resolvedEndPhaseIds: string[];
    pendingReturns: InabaReturnMarker[];
  };
};

export type CardLookup = (id: string) => Pick<Card, 'kind' | 'monsterType'> | undefined;
export type RegisterResult = Readonly<{
  state: InabaWhiteRabbitState;
  status: 'registered' | 'already-pending' | 'duplicate';
}>;
export type ReturnResult = Readonly<{
  state: InabaWhiteRabbitState;
  status: 'resolved' | 'no-pending' | 'duplicate';
  results: readonly Readonly<{
    uid: string;
    status: 'returned' | 'left-field' | 'face-down' | 'negated' | 'stale-instance' | 'missed-end-phase';
    ownerSeat?: number;
  }>[];
}>;
export type ReturnOptions = Readonly<{ effectNegated?: boolean }>;
export type DirectAttackOptions = Readonly<{ effectNegated?: boolean }>;

type LocatedMonster = { team: Team; monster: Monster };

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

function assertPhysicalRules(state: InabaWhiteRabbitState): void {
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

function assertState(state: InabaWhiteRabbitState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para Inaba White Rabbit.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);

  const record = state.inabaWhiteRabbit;
  if (!record) return;
  const { registeredSummonEventIds, resolvedEndPhaseIds, pendingReturns } = record;
  if (!Array.isArray(registeredSummonEventIds) ||
      registeredSummonEventIds.length > 4096 ||
      registeredSummonEventIds.some(id => !validId(id)) ||
      new Set(registeredSummonEventIds).size !== registeredSummonEventIds.length ||
      !Array.isArray(resolvedEndPhaseIds) ||
      resolvedEndPhaseIds.length > 4096 ||
      resolvedEndPhaseIds.some(id => !validId(id)) ||
      new Set(resolvedEndPhaseIds).size !== resolvedEndPhaseIds.length ||
      !Array.isArray(pendingReturns)) {
    throw new Error('Recibos de Inaba White Rabbit inválidos.');
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
      throw new Error('Marcador de retorno de Inaba White Rabbit inválido.');
    }
    const key = marker.turn + ':' + marker.uid;
    if (pendingKeys.has(key)) throw new Error('Retorno de Inaba White Rabbit duplicado.');
    pendingKeys.add(key);
  }
}

function inventorySnapshot(state: InabaWhiteRabbitState): string {
  const cards = tagInventory(state);
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function assertConserved(before: string, after: InabaWhiteRabbitState): void {
  if (inventorySnapshot(after) !== before) {
    throw new Error('Inaba White Rabbit alterou o inventário físico.');
  }
}

function validateSummonEvent(
  state: InabaWhiteRabbitState,
  event: InabaSummonEvent,
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
    throw new Error('Inaba White Rabbit exige Invocação-Normal ou transição face-up bem-sucedida; Invocação-Especial é proibida.');
  }

  const ownerSeat = physicalSeat(event.sourceUid);
  const ownerTeam = (ownerSeat % 2) as Team;
  if (state.members[ownerSeat]?.team !== ownerTeam) {
    throw new Error('Proprietário físico de Inaba White Rabbit incompatível com o UID.');
  }

  const source = locateMonster(state.core, event.sourceUid);
  if (!source || source.team !== event.controllerTeam ||
      source.monster.id !== cardId || source.monster.faceUp !== true ||
      (source.monster.owner !== undefined && source.monster.owner !== ownerTeam)) {
    throw new Error('Inaba White Rabbit precisa estar face-up no campo da equipe controladora.');
  }

  const metadata = lookup(cardId);
  if (!metadata || metadata.kind !== 'monster' || metadata.monsterType !== 'effect') {
    throw new Error('Inaba White Rabbit precisa ser um monstro de efeito admitido.');
  }
  return { ownerSeat, controllerTeam: source.team };
}

export function createInabaWhiteRabbitSpiritAdapter(
  inabaId = INABA_WHITE_RABBIT_ID,
  lookup: CardLookup = cardLookup
) {
  function registerSummon(
    input: InabaWhiteRabbitState,
    event: InabaSummonEvent
  ): RegisterResult {
    assertState(input);
    if (!event || !validId(event.eventId)) {
      throw new Error('Evento de Invocação/virada de Inaba White Rabbit inválido.');
    }
    const before = inventorySnapshot(input);
    const state = structuredClone(input);
    const record = state.inabaWhiteRabbit ??= {
      registeredSummonEventIds: [],
      resolvedEndPhaseIds: [],
      pendingReturns: [],
    };

    if (record.registeredSummonEventIds.includes(event.eventId)) {
      assertConserved(before, state);
      return { state, status: 'duplicate' };
    }

    const { ownerSeat, controllerTeam } = validateSummonEvent(state, event, inabaId, lookup);
    if (record.registeredSummonEventIds.length >= 4096) {
      throw new Error('Limite de recibos de Inaba White Rabbit excedido.');
    }
    record.registeredSummonEventIds.push(event.eventId);

    const binding = bindTarget(state.core, event.sourceUid);
    if (!binding || binding.zone !== 'monsters') {
      throw new Error('Inaba White Rabbit não possui vínculo de Monster Zone válido.');
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
      cardId: inabaId,
      ownerSeat,
      controllerTeam,
      binding: { ...binding },
    });
    assertConserved(before, state);
    return { state, status: 'registered' };
  }

  function resolveEndPhase(
    input: InabaWhiteRabbitState,
    event: InabaEndPhaseEvent,
    options: ReturnOptions = {}
  ): ReturnResult {
    assertState(input);
    if (!event || event.kind !== 'end-phase' || !validId(event.eventId) ||
        !Number.isSafeInteger(event.turn) || event.turn !== input.core.turn) {
      throw new Error('Inaba White Rabbit exige um evento End Phase do turno atual.');
    }

    const before = inventorySnapshot(input);
    const state = structuredClone(input);
    const record = state.inabaWhiteRabbit ??= {
      registeredSummonEventIds: [],
      resolvedEndPhaseIds: [],
      pendingReturns: [],
    };
    if (record.resolvedEndPhaseIds.includes(event.eventId)) {
      assertConserved(before, state);
      return { state, status: 'duplicate', results: [] };
    }
    if (record.resolvedEndPhaseIds.length >= 4096) {
      throw new Error('Limite de recibos End Phase de Inaba White Rabbit excedido.');
    }
    record.resolvedEndPhaseIds.push(event.eventId);

    const results: Array<{
      uid: string;
      status: 'returned' | 'left-field' | 'face-down' | 'negated' | 'stale-instance' | 'missed-end-phase';
      ownerSeat?: number;
    }> = [];
    const keep: InabaReturnMarker[] = [];

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

  function canAttackDirectly(
    state: InabaWhiteRabbitState,
    uid: string,
    options: DirectAttackOptions = {}
  ): boolean {
    assertState(state);
    const located = locateMonster(state.core, uid);
    if (!located || located.monster.id !== inabaId || !located.monster.faceUp) return false;
    const negated = options.effectNegated ?? monsterEffectsNegated(state.core, uid);
    return !negated;
  }

  return {
    registerSummon,
    resolveEndPhase,
    canAttackDirectly,
    canBeSpecialSummoned: () => false as const,
  };
}
