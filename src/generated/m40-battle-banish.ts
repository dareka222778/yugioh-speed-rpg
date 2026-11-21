import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "48148828",
    "konamiId": 5593,
    "name": "Fera Louca D.D.",
    "englishName": "D.D. Crazy Beast",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Beast",
    "attribute": "EARTH",
    "level": 3,
    "atk": 1400,
    "defense": 1400,
    "summary": "Efeito contínuo: qualquer monstro destruído em batalha com este card é banido em vez de enviado ao Cemitério. A carta banida vai para a zona do dono.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5593&request_locale=en"
  },
  {
    "id": "16475472",
    "konamiId": 5303,
    "name": "Lesser Fiend",
    "englishName": "Lesser Fiend",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fiend",
    "attribute": "DARK",
    "level": 5,
    "atk": 2100,
    "defense": 1000,
    "summary": "Efeito contínuo: qualquer monstro destruído em batalha com este card é banido em vez de enviado ao Cemitério. A carta banida vai para a zona do dono.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5303&request_locale=en",
    "archetypes": [
      "Archfiend"
    ]
  }
];
export const effects:Record<string,Effect>={
  "16475472": {
    "kind": "monsterEffect"
  },
  "48148828": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "16475472": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "battleBanishVictim"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "48148828": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "battleBanishVictim"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  }
};
