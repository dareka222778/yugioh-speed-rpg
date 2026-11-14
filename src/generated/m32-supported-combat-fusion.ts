import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "79853073",
    "konamiId": 5034,
    "name": "Soldado Críptico",
    "englishName": "Cipher Soldier",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Machine",
    "attribute": "EARTH",
    "level": 3,
    "atk": 1350,
    "defense": 1800,
    "summary": "Ao batalhar com Guerreiro, ganha 2000 ATK/DEF apenas durante o cálculo de dano.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5034&request_locale=en"
  },
  {
    "id": "40173854",
    "konamiId": 4645,
    "name": "Bugroth Anfíbio",
    "englishName": "Amphibious Bugroth",
    "kind": "monster",
    "monsterType": "fusion",
    "race": "Aqua",
    "attribute": "WATER",
    "level": 5,
    "atk": 1850,
    "defense": 1300,
    "summary": "Fusão: Bugroth de Ataque Terrestre + Sentinela dos Mares; sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4645&request_locale=en",
    "fusion": [
      "58314394",
      "85448931"
    ]
  }
];
export const effects:Record<string,Effect>={
  "40173854": {
    "kind": "fusion"
  },
  "79853073": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "79853073": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "combat",
            "filter": {
              "selfOnly": true
            },
            "rule": {
              "kind": "stat",
              "when": "battling",
              "race": "Warrior",
              "calculationOnly": true,
              "atk": 2000,
              "def": 2000
            }
          }
        ]
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  }
};
