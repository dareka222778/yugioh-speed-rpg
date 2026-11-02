import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "80233946",
    "konamiId": 5411,
    "name": "Tartaruga Gora",
    "englishName": "Gora Turtle",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Aqua",
    "attribute": "WATER",
    "level": 3,
    "atk": 1100,
    "defense": 1100,
    "summary": "Enquanto esta carta estiver com a face para cima no campo, monstros com 1900 ou mais de ATK não podem declarar ataques.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5411&request_locale=en"
  },
  {
    "id": "03366982",
    "konamiId": 5003,
    "name": "Dragão Espada do Jacaré",
    "englishName": "Alligator's Sword Dragon",
    "kind": "monster",
    "monsterType": "fusion",
    "race": "Dragon",
    "attribute": "WIND",
    "level": 5,
    "atk": 1700,
    "defense": 1500,
    "summary": "Fusão de Baby Dragon e Alligator's Sword. Pode atacar diretamente se todos os monstros com a face para cima do oponente forem TERRA, ÁGUA ou FOGO.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5003&request_locale=en",
    "fusion": [
      "88819587",
      "64428736"
    ]
  }
];
export const effects:Record<string,Effect>={
  "80233946": {
    "kind": "monsterEffect"
  },
  "03366982": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "80233946": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "preventAttack",
            "filter": {
              "controller": "both",
              "minimumCurrentAtk": 1900
            },
            "declarationOnly": true
          }
        ]
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "03366982": {
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
              "kind": "direct",
              "condition": "faceUpAttributesOnly",
              "attributes": [
                "EARTH",
                "WATER",
                "FIRE"
              ]
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
