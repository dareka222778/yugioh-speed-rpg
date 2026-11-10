import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "35215622",
    "konamiId": 5714,
    "name": "Goblin Cegamente Leal",
    "englishName": "Blindly Loyal Goblin",
    "kind": "monster",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5714&request_locale=en",
    "summary": "O controle deste monstro com a face para cima não pode mudar.",
    "level": 4,
    "atk": 1800,
    "defense": 1500,
    "race": "Warrior",
    "attribute": "EARTH",
    "monsterType": "effect"
  },
  {
    "id": "22609617",
    "konamiId": 5898,
    "name": "Mataza, o Surpreendente",
    "englishName": "Mataza the Zapper",
    "kind": "monster",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5898&request_locale=en",
    "summary": "O controle deste monstro com a face para cima não pode mudar. Pode atacar duas vezes em cada Fase de Batalha.",
    "level": 3,
    "atk": 1300,
    "defense": 800,
    "race": "Warrior",
    "attribute": "DARK",
    "monsterType": "effect"
  }
];
export const effects:Record<string,Effect>={
  "22609617": {
    "kind": "monsterEffect"
  },
  "35215622": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "22609617": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "controlLock",
            "filter": {
              "selfOnly": true
            }
          },
          {
            "kind": "combat",
            "filter": {
              "selfOnly": true
            },
            "rule": {
              "kind": "attacks",
              "maximum": 2
            }
          }
        ]
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "35215622": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "controlLock",
            "filter": {
              "selfOnly": true
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
