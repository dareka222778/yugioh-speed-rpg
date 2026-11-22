import type {DuelState} from './duelEngine';
import {monsterEffectsNegated} from './continuousEffects';

export const A_CAT_OF_ILL_OMEN_ID = '24140059';
export const NECROVALLEY_ID = '47355498';

export type ACatDestination = 'topDeck' | 'hand';
export type ACatCardKind = 'monster' | 'spell' | 'trap' | undefined;
export type ACatCardKindLookup = (cardId: string) => ACatCardKind;
export type ACatNegationCheck = (state: DuelState, sourceUid: string) => boolean;

export type ACatActivation = Readonly<{
  sourceUid: string;
  team: 0 | 1;
  activeSeat: number;
  turn: number;
  triggerKind: 'flip';
  necrovalleyAtActivation: boolean;
  allowedDestinations: readonly ACatDestination[];
}>;

export type ACatTrapCandidate = Readonly<{
  uid: string;
  id: string;
  visibility: 'active-seat-only';
}>;

export type ACatResolutionPlan = Readonly<{
  effect: 'aCatOfIllOmen';
  sourceUid: string;
  team: 0 | 1;
  activeSeat: number;
  targetUid: string;
  cardId: string;
  destination: ACatDestination;
  revealScope: 'opponent-team';
  keepPrivateFromPartner: true;
  shuffleDeck: false;
}>;

function assertTeam(team: number): asserts team is 0 | 1 {
  if (!Number.isInteger(team) || team < 0 || team > 1) {
    throw new Error('Equipe inválida para A Cat of Ill Omen.');
  }
}

function assertActiveRepresentative(state: DuelState, team: number, activeSeat: number): asserts team is 0 | 1 {
  assertTeam(team);
  if (!Number.isInteger(activeSeat) || activeSeat < 0 || activeSeat > 3 || activeSeat % 2 !== team) {
    throw new Error('Assento físico inválido para A Cat of Ill Omen.');
  }
  if (!state.teamRotation || state.teamRotation.active[team] !== activeSeat || state.current !== team) {
    throw new Error('O representante ativo mudou; reabra a resolução de A Cat of Ill Omen.');
  }
}

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('Carta do Deck sem proprietário físico válido.');
  return Number(match[1]);
}

function hasFaceUpNecrovalley(state: DuelState): boolean {
  return state.players.some(player => player.field?.faceUp === true && player.field.id === NECROVALLEY_ID);
}

/**
 * Captures the FLIP trigger and the destination modes that were legal when it
 * activated. The card can be controlled by the team while physically owned by
 * its inactive partner; the resolving representative's Deck remains the source.
 */
export function prepareACatOfIllOmen(
  state: DuelState,
  team: 0 | 1,
  activeSeat: number,
  sourceUid: string,
  triggerKind: 'flip',
  isNegated: ACatNegationCheck = monsterEffectsNegated
): ACatActivation {
  assertActiveRepresentative(state, team, activeSeat);
  if (triggerKind !== 'flip') throw new Error('A Cat of Ill Omen exige seu gatilho FLIP.');
  const source = state.players[team].monsters.find(monster => monster.uid === sourceUid);
  if (!source || source.id !== A_CAT_OF_ILL_OMEN_ID || !source.faceUp) {
    throw new Error('A Cat of Ill Omen precisa estar face-up no campo da equipe.');
  }
  if (isNegated(state, sourceUid)) throw new Error('O efeito de A Cat of Ill Omen está negado.');

  const necrovalleyAtActivation = hasFaceUpNecrovalley(state);
  const allowedDestinations: readonly ACatDestination[] = Object.freeze(
    necrovalleyAtActivation ? ['topDeck', 'hand'] : ['topDeck']
  );
  return Object.freeze({
    sourceUid,
    team,
    activeSeat,
    turn: state.turn,
    triggerKind,
    necrovalleyAtActivation,
    allowedDestinations
  });
}

function assertActivationCurrent(state: DuelState, activation: ACatActivation): void {
  if (!activation || activation.triggerKind !== 'flip' || !Number.isSafeInteger(activation.turn) || activation.turn < 1) {
    throw new Error('Ativação de A Cat of Ill Omen inválida.');
  }
  assertActiveRepresentative(state, activation.team, activation.activeSeat);
  if (state.turn !== activation.turn) throw new Error('O turno mudou antes da resolução de A Cat of Ill Omen.');
  if (!Array.isArray(activation.allowedDestinations) ||
      activation.allowedDestinations.length < 1 ||
      activation.allowedDestinations.some(value => value !== 'topDeck' && value !== 'hand') ||
      activation.allowedDestinations.includes('hand') !== activation.necrovalleyAtActivation) {
    throw new Error('Modos de resolução de A Cat of Ill Omen inválidos.');
  }
}

/** Only the active physical representative's private Deck is inspected. */
export function aCatOfIllOmenTrapCandidates(
  state: DuelState,
  activation: ACatActivation,
  getCardKind: ACatCardKindLookup
): readonly ACatTrapCandidate[] {
  assertActivationCurrent(state, activation);
  const candidates: ACatTrapCandidate[] = [];
  for (const card of state.players[activation.team].deck) {
    if (physicalSeat(card.uid) !== activation.activeSeat) {
      throw new Error('O Deck do representante ativo contém uma carta de outro proprietário físico.');
    }
    if (getCardKind(card.id) === 'trap') {
      candidates.push(Object.freeze({uid: card.uid, id: card.id, visibility: 'active-seat-only' as const}));
    }
  }
  return Object.freeze(candidates);
}

/**
 * Emits an immutable operation plan; the central resolver owns the atomic move.
 * If Necrovalley leaves after activation, a chosen hand destination falls back
 * to the mandatory top-of-Deck destination. A later Necrovalley cannot unlock
 * a hand destination that was unavailable when the effect activated.
 */
export function resolveACatOfIllOmen(
  state: DuelState,
  activation: ACatActivation,
  targetUid: string,
  destination: ACatDestination,
  getCardKind: ACatCardKindLookup
): ACatResolutionPlan {
  const candidates = aCatOfIllOmenTrapCandidates(state, activation, getCardKind);
  const target = candidates.find(candidate => candidate.uid === targetUid);
  if (!target) throw new Error('Escolha uma Armadilha do Deck do representante ativo.');
  if (!activation.allowedDestinations.includes(destination)) {
    throw new Error('Esse destino não estava disponível quando A Cat of Ill Omen ativou.');
  }
  const resolvedDestination: ACatDestination =
    destination === 'hand' && !hasFaceUpNecrovalley(state) ? 'topDeck' : destination;
  return Object.freeze({
    effect: 'aCatOfIllOmen',
    sourceUid: activation.sourceUid,
    team: activation.team,
    activeSeat: activation.activeSeat,
    targetUid: target.uid,
    cardId: target.id,
    destination: resolvedDestination,
    revealScope: 'opponent-team',
    keepPrivateFromPartner: true,
    shuffleDeck: false
  });
}
