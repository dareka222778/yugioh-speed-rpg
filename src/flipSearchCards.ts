import type { Card } from './cardCatalog';
import type { DuelState, CardRef } from './duelEngine';
import {
  resolveSearchZoneSelection,
  searchZoneTargets,
  type SearchZoneResolution,
  type SearchZoneRule,
} from './searchZoneRules';

export type FlipSearchCardId = '24140059' | '23927567';
export type FlipSearchDestinationChoice = 'deck-top' | 'hand';

export type FlipSearchDefinition = {
  readonly cardId: FlipSearchCardId;
  readonly name: string;
  readonly trigger: 'flip';
  readonly activation: 'mandatory';
  readonly selectionTiming: 'resolution';
  readonly rule: SearchZoneRule;
};

const definitions: Readonly<Record<FlipSearchCardId, FlipSearchDefinition>> = Object.freeze({
  '24140059': {
    cardId: '24140059',
    name: 'A Cat of Ill Omen',
    trigger: 'flip',
    activation: 'mandatory',
    selectionTiming: 'resolution',
    rule: {
      from: 'deck',
      filter: { kind: 'trap' },
      destination: 'deck-top',
      necrovalleyHandOverride: true,
    },
  },
  '23927567': {
    cardId: '23927567',
    name: 'An Owl of Luck',
    trigger: 'flip',
    activation: 'mandatory',
    selectionTiming: 'resolution',
    rule: {
      from: 'deck',
      filter: { kind: 'spell', field: true },
      destination: 'deck-top',
      necrovalleyHandOverride: true,
    },
  },
});

export function getFlipSearchDefinition(cardId: string): FlipSearchDefinition | undefined {
  if (cardId !== '24140059' && cardId !== '23927567') return undefined;
  return definitions[cardId];
}

function assertActor(state: DuelState, actor: number): void {
  if (!Number.isInteger(actor) || actor < 0 || actor >= state.players.length) {
    throw new RangeError('Flip search actor is outside the physical player seats.');
  }
}

/** Candidate cards are enumerated only when the mandatory FLIP effect resolves.
 * The generic search primitive reads the active physical seat's own Deck. */
export function flipSearchTargets(
  state: DuelState,
  actor: number,
  cardId: string,
  getCard: (id: string) => Card | undefined,
  getEffect?: (id: string) => { kind: string } | undefined,
): CardRef[] {
  const definition = getFlipSearchDefinition(cardId);
  if (!definition) return [];
  assertActor(state, actor);
  return searchZoneTargets(state, actor, definition.rule, getCard, getEffect);
}

/** Resolve the card text's optional Necrovalley replacement choice.
 *
 * With no face-up Necrovalley, only deck-top is legal. With Necrovalley,
 * the player may still choose deck-top; choosing hand explicitly applies the
 * generic primitive's override. The boolean passed to resolveSearchZoneSelection
 * therefore means "the hand alternative was chosen", not merely "Necrovalley
 * exists". This prevents the generic helper from forcing the optional branch.
 */
export function resolveFlipSearchChoice(
  state: DuelState,
  actor: number,
  cardId: string,
  selectedUid: string,
  choice: FlipSearchDestinationChoice,
  necrovalleyFaceUpAtResolution: boolean,
  getCard: (id: string) => Card | undefined,
  getEffect?: (id: string) => { kind: string } | undefined,
): SearchZoneResolution | null {
  const definition = getFlipSearchDefinition(cardId);
  if (!definition) return null;
  assertActor(state, actor);

  if (choice !== 'deck-top' && choice !== 'hand') {
    throw new Error('Invalid FLIP search destination choice.');
  }
  if (choice === 'hand' && !necrovalleyFaceUpAtResolution) {
    throw new Error('The hand alternative requires face-up Necrovalley at resolution.');
  }

  const handAlternativeChosen = choice === 'hand' && necrovalleyFaceUpAtResolution;
  return resolveSearchZoneSelection(
    state,
    actor,
    selectedUid,
    definition.rule,
    getCard,
    getEffect,
    handAlternativeChosen,
  );
}
