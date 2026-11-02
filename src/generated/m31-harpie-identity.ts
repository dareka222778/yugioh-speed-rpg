import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "80316585",
    "konamiId": 5239,
    "name": "Cyber Lady Harpia",
    "englishName": "Cyber Harpie Lady",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Winged Beast",
    "attribute": "WIND",
    "level": 4,
    "atk": 1800,
    "defense": 1300,
    "alwaysTreatedAs": "Harpie Lady",
    "summary": "Sempre tratada como Dama Harpia, em todas as zonas, por regra de identidade.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5239&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "80316585": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "80316585": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "identityOnly"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  }
};
