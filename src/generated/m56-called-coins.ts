import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "71625222",
    "konamiId": 4022,
    "name": "Mago do Tempo",
    "englishName": "Time Wizard",
    "kind": "monster",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4022&request_locale=en",
    "summary": "Uma vez por turno: declare cara ou coroa. Se acertar, destrua os monstros do oponente. Se errar, destrua os seus e receba metade da soma do ATK em campo dos seus monstros destruídos com a face para cima como dano.",
    "level": 2,
    "atk": 500,
    "defense": 400,
    "race": "Spellcaster",
    "attribute": "LIGHT",
    "monsterType": "effect"
  },
  {
    "id": "81172176",
    "konamiId": 5405,
    "name": "Fiend Comedian",
    "englishName": "Fiend Comedian",
    "kind": "trap",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5405&request_locale=en",
    "summary": "Declare cara ou coroa. Se acertar, bana todo o Cemitério adversário. Se errar, envie do topo do seu Deck ao Cemitério tantas cartas quantas estiverem no Cemitério adversário.",
    "level": null,
    "atk": null,
    "defense": null,
    "race": null,
    "attribute": null
  }
];
export const effects:Record<string,Effect>={
  "71625222": {
    "kind": "monsterEffect"
  },
  "81172176": {
    "kind": "graveWager"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "71625222": {
    "effect": {
      "trigger": "ignition",
      "oncePerTurn": true,
      "operation": {
        "kind": "timeWager"
      }
    },
    "activation": {
      "policy": "manual",
      "window": "main"
    }
  }
};
