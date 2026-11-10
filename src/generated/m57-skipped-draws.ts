import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "35316708",
    "konamiId": 4984,
    "name": "Selo Temporal",
    "englishName": "Time Seal",
    "kind": "trap",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4984&request_locale=en",
    "summary": "O oponente pula a próxima Fase de Compra dele.",
    "level": null,
    "atk": null,
    "defense": null,
    "race": null,
    "attribute": null
  },
  {
    "id": "37576645",
    "konamiId": 5448,
    "name": "Ganância Descuidada",
    "englishName": "Reckless Greed",
    "kind": "trap",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5448&request_locale=en",
    "summary": "Compre duas cartas e pule suas próximas duas Fases de Compra.",
    "level": null,
    "atk": null,
    "defense": null,
    "race": null,
    "attribute": null
  }
];
export const effects:Record<string,Effect>={
  "35316708": {
    "kind": "drawSkip",
    "mode": "opponent"
  },
  "37576645": {
    "kind": "drawSkip",
    "mode": "reckless"
  }
};
export const monsters:Record<string,MonsterDefinition>={};
