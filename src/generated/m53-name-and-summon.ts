import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "95132338",
    "konamiId": 5006,
    "name": "Aquarefrão",
    "englishName": "Aqua Chorus",
    "kind": "trap",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5006&request_locale=en",
    "summary": "Monstros com a face para cima que compartilham o mesmo nome no campo ganham 500 ATK e DEF.",
    "level": null,
    "atk": null,
    "defense": null,
    "race": null,
    "attribute": null
  },
  {
    "id": "42578427",
    "konamiId": 4688,
    "name": "Comergaboon",
    "englishName": "Eatgaboon",
    "kind": "trap",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4688&request_locale=en",
    "summary": "Quando o oponente Invoca por Invocação-Normal ou Virar um monstro com 500 ATK ou menos: escolha esse monstro e destrua-o.",
    "level": null,
    "atk": null,
    "defense": null,
    "race": null,
    "attribute": null
  }
];
export const effects:Record<string,Effect>={
  "42578427": {
    "kind": "summonCeiling",
    "maximumAtk": 500
  },
  "95132338": {
    "kind": "continuous",
    "activation": {
      "speed": 2,
      "window": "free",
      "damage": "never"
    },
    "rules": [
      {
        "kind": "modifier",
        "filter": {
          "sameFaceUpName": true
        },
        "atk": 500,
        "def": 500
      }
    ]
  }
};
export const monsters:Record<string,MonsterDefinition>={};
