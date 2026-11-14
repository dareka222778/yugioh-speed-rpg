import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "51452091",
    "konamiId": 4866,
    "name": "Decreto Real",
    "englishName": "Royal Decree",
    "kind": "trap",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Enquanto esta Armadilha Contínua estiver com a face para cima, negue os efeitos de todas as outras Armadilhas no campo.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4866&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "51452091": {
    "kind": "continuous",
    "activation": {
      "speed": 2,
      "window": "free",
      "damage": "never"
    },
    "rules": [
      {
        "kind": "negateTraps"
      }
    ]
  }
};
export const monsters:Record<string,MonsterDefinition>={};
