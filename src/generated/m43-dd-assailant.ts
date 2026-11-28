import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "70074904",
    "konamiId": 5932,
    "name": "Assaltante D.D.",
    "englishName": "D.D. Assailant",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 4,
    "atk": 1700,
    "defense": 1600,
    "summary": "Se esta carta for destruída em batalha após o cálculo de dano, bane a si mesma e ao monstro adversário que enfrentou.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=5932&ope=2&request_locale=ja"
  }
];
export const effects:Record<string,Effect>={
  "70074904": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "70074904": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "battleBanishBoth",
        "onlyIfDestroyedByBattle": true
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  }
};
