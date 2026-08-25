export const starterDecks = {
  warrior: {
    name: 'Guerreiros',
    emoji: '⚔️',
    description: 'Deck direto e equilibrado, focado em monstros guerreiros e aumento de ATK.'
  },
  spellcaster: {
    name: 'Feiticeiros',
    emoji: '🔮',
    description: 'Deck de controle, com Magias e monstros com efeitos utilitários.'
  },
  dragon: {
    name: 'Dragões',
    emoji: '🐉',
    description: 'Deck mais lento, focado em preparar o campo para monstros fortes.'
  }
} as const;

export type StarterDeckKey = keyof typeof starterDecks;

export function isStarterDeck(value: string): value is StarterDeckKey {
  return value in starterDecks;
}
