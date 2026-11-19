export const DECK_INTERACTION_ACTIONS = [
  'rename','save-name','inspect','card','plus','minus','activate','initial','select','slot','view'
] as const;

export type DeckInteractionAction = typeof DECK_INTERACTION_ACTIONS[number];
export type DeckInteractionId = Readonly<{
  action: DeckInteractionAction;
  owner: string;
  slot: number;
  revision: number;
  page: number;
  cardId: string;
}>;

const MAX_CUSTOM_ID_LENGTH = 100;
const MAX_OWNER_LENGTH = 64;
const MAX_CARD_ID_LENGTH = 64;
const actions = new Set<string>(DECK_INTERACTION_ACTIONS);

function decimal(value: string): number | null {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validOwner(owner: unknown): owner is string {
  return typeof owner === 'string' && owner.length > 0 && owner.length <= MAX_OWNER_LENGTH && !owner.includes(':');
}

function validCardId(cardId: unknown): cardId is string {
  return typeof cardId === 'string' && cardId.length <= MAX_CARD_ID_LENGTH && !cardId.includes(':');
}

/** Build the one canonical custom-ID shape accepted by the Deck interaction router. */
export function buildDeckInteractionId(
  action: DeckInteractionAction,
  owner: string,
  slot: number,
  revision: number,
  page: number,
  cardId = ''
): string {
  if (!actions.has(action) || !validOwner(owner) ||
      !Number.isSafeInteger(slot) || slot < 1 || slot > 3 ||
      !Number.isSafeInteger(revision) || revision < 0 ||
      !Number.isSafeInteger(page) || page < 0 ||
      !validCardId(cardId)) {
    throw new Error('Identificador de interação do Deck inválido.');
  }
  const customId = `deck:${action}:${owner}:${slot}:${revision}:${page}:${cardId}`;
  if (customId.length > MAX_CUSTOM_ID_LENGTH) {
    throw new Error('Identificador de interação do Deck excede 100 caracteres.');
  }
  return customId;
}

/**
 * Parse untrusted Discord custom IDs before reading or mutating a player's Deck.
 * The parser is intentionally strict: exactly seven segments and canonical
 * non-negative decimal fields. Page zero is valid for disabled "previous"
 * controls and zero-based card navigation.
 */
export function parseDeckInteractionId(value: unknown): DeckInteractionId | null {
  if (typeof value !== 'string' || value.length > MAX_CUSTOM_ID_LENGTH) return null;
  const parts = value.split(':');
  if (parts.length !== 7 || parts[0] !== 'deck') return null;

  const [, action, owner, slotText, revisionText, pageText, cardId] = parts;
  if (!actions.has(action) || !validOwner(owner) || !validCardId(cardId)) return null;

  const slot = decimal(slotText);
  const revision = decimal(revisionText);
  const page = decimal(pageText);
  if (slot === null || slot < 1 || slot > 3 ||
      revision === null || page === null) return null;

  return { action: action as DeckInteractionAction, owner, slot, revision, page, cardId };
}
