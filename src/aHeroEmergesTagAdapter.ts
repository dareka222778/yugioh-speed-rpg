import type {DuelState} from './duelEngine';
import {cardActivationAllowed, continuousTrapsNegated} from './continuousEffects';

export const A_HERO_EMERGES_ID = '21597117';
export type AHeroTeam = 0 | 1;
export type AHeroCardKind = 'monster' | 'spell' | 'trap' | undefined;
export type AHeroCardKindLookup = (cardId: string) => AHeroCardKind;
export type AHeroCanSpecialSummon = (state: DuelState, team: AHeroTeam, cardId: string) => boolean;

export type AHeroActivation = Readonly<{
  sourceUid: string;
  sourceOwnerSeat: number;
  attackingTeam: AHeroTeam;
  defendingTeam: AHeroTeam;
  defenderSeat: number;
  chooserSeat: number;
  attackUid: string;
  turn: number;
}>;

export type AHeroHiddenChoice = Readonly<{
  token: string;
  label: 'Carta oculta';
  visibility: 'attacking-active-seat-only';
}>;

export type AHeroResolutionPlan = Readonly<{
  effect: 'aHeroEmerges';
  sourceUid: string;
  sourceOwnerSeat: number;
  attackingTeam: AHeroTeam;
  defendingTeam: AHeroTeam;
  defenderSeat: number;
  chooserSeat: number;
  attackUid: string;
  selectedUid: string;
  physicalOwnerSeat: number;
  cardId: string;
  destination: 'monsterZone' | 'grave';
  position: 'atk' | null;
  faceUp: boolean;
  revealScope: 'both-teams';
  otherHandCardsRemainPrivate: true;
}>;

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('Carta da mão sem proprietário físico válido.');
  return Number(match[1]);
}

function assertTeam(value: number): asserts value is AHeroTeam {
  if (!Number.isInteger(value) || value < 0 || value > 1) throw new Error('Equipe inválida para A Hero Emerges.');
}

function currentAttack(state: DuelState): {attackingTeam: AHeroTeam; attackUid: string} {
  const attackingTeam = state.current;
  assertTeam(attackingTeam);
  const pending = state.pending;
  if (pending.kind !== 'attack' || pending.stage !== 'declare' || pending.actor !== attackingTeam) {
    throw new Error('A Hero Emerges só responde à declaração de ataque de um monstro adversário.');
  }
  return {attackingTeam, attackUid: pending.card};
}

/**
 * Prepares the opponent's hidden-card choice for an already activated Trap.
 * The Trap may be physically owned by the inactive teammate, but the effect
 * reads only the defending team's active representative hand.
 */
export function prepareAHeroEmerges(
  state: DuelState,
  sourceUid: string,
  getCardKind: AHeroCardKindLookup
): AHeroActivation {
  if (!state.teamRotation) throw new Error('A Hero Emerges exige uma sessão TagDuel 2v2.');
  const {attackingTeam, attackUid} = currentAttack(state);
  const defendingTeam = (1 - attackingTeam) as AHeroTeam;
  const defenderSeat = state.teamRotation.active[defendingTeam];
  const chooserSeat = state.teamRotation.active[attackingTeam];
  const source = state.players[defendingTeam].backrow.find(card => card.uid === sourceUid);
  if (!source || source.id !== A_HERO_EMERGES_ID || !source.faceUp || source.resolved || source.setTurn >= state.turn) {
    throw new Error('A Hero Emerges precisa ser uma Armadilha Setada em turno anterior e ativada face-up.');
  }
  const sourceOwnerSeat = physicalSeat(source.uid);
  if (sourceOwnerSeat % 2 !== defendingTeam) throw new Error('A Armadilha não pertence fisicamente à equipe defensora.');
  if (!cardActivationAllowed(state, defendingTeam, 'trap') || continuousTrapsNegated(state)) {
    throw new Error('A ativação de Armadilhas está bloqueada ou negada.');
  }

  const hand = state.players[defendingTeam].hand;
  for (const card of hand) {
    if (physicalSeat(card.uid) !== defenderSeat) {
      throw new Error('A mão ativa contém uma carta de outro proprietário físico.');
    }
  }
  if (!hand.some(card => getCardKind(card.id) === 'monster')) {
    throw new Error('A Hero Emerges não pode ser ativada sem Monstro na mão do representante ativo.');
  }

  return Object.freeze({
    sourceUid,
    sourceOwnerSeat,
    attackingTeam,
    defendingTeam,
    defenderSeat,
    chooserSeat,
    attackUid,
    turn: state.turn
  });
}

function assertActivationCurrent(state: DuelState, activation: AHeroActivation): void {
  if (!activation || !state.teamRotation || !Number.isSafeInteger(activation.turn) || activation.turn < 1) {
    throw new Error('Ativação de A Hero Emerges inválida.');
  }
  const current = currentAttack(state);
  if (state.turn !== activation.turn || current.attackingTeam !== activation.attackingTeam || current.attackUid !== activation.attackUid) {
    throw new Error('A declaração de ataque mudou antes da resolução de A Hero Emerges.');
  }
  if (state.teamRotation.active[activation.defendingTeam] !== activation.defenderSeat ||
      state.teamRotation.active[activation.attackingTeam] !== activation.chooserSeat) {
    throw new Error('Um representante mudou; reabra a escolha oculta de A Hero Emerges.');
  }
}

/** Returns indistinguishable backs; card IDs/names and partner hand are never projected. */
export function aHeroEmergesHiddenChoices(
  state: DuelState,
  activation: AHeroActivation
): readonly AHeroHiddenChoice[] {
  assertActivationCurrent(state, activation);
  const hand = state.players[activation.defendingTeam].hand;
  return Object.freeze(hand.map(card => {
    if (physicalSeat(card.uid) !== activation.defenderSeat) {
      throw new Error('A mão ativa contém uma carta de outro proprietário físico.');
    }
    return Object.freeze({
      token: card.uid,
      label: 'Carta oculta' as const,
      visibility: 'attacking-active-seat-only' as const
    });
  }));
}

/**
 * Resolves the opponent's hidden choice into an immutable operation plan.
 * The central resolver performs the atomic hand-to-field/GY movement and any
 * attack replay. canSpecialSummon must include card-specific and current-zone
 * legality (including the three shared Monster Zones).
 */
export function resolveAHeroEmerges(
  state: DuelState,
  activation: AHeroActivation,
  selectedToken: string,
  getCardKind: AHeroCardKindLookup,
  canSpecialSummon: AHeroCanSpecialSummon
): AHeroResolutionPlan {
  assertActivationCurrent(state, activation);
  const selected = state.players[activation.defendingTeam].hand.find(card => card.uid === selectedToken);
  if (!selected || physicalSeat(selected.uid) !== activation.defenderSeat) {
    throw new Error('A carta escolhida não está na mão privada do representante defensor ativo.');
  }
  const cardKind = getCardKind(selected.id);
  const summon = cardKind === 'monster' && canSpecialSummon(state, activation.defendingTeam, selected.id);
  return Object.freeze({
    effect: 'aHeroEmerges',
    sourceUid: activation.sourceUid,
    sourceOwnerSeat: activation.sourceOwnerSeat,
    attackingTeam: activation.attackingTeam,
    defendingTeam: activation.defendingTeam,
    defenderSeat: activation.defenderSeat,
    chooserSeat: activation.chooserSeat,
    attackUid: activation.attackUid,
    selectedUid: selected.uid,
    physicalOwnerSeat: physicalSeat(selected.uid),
    cardId: selected.id,
    destination: summon ? 'monsterZone' : 'grave',
    position: summon ? 'atk' : null,
    faceUp: summon,
    revealScope: 'both-teams',
    otherHandCardsRemainPrivate: true
  });
}
