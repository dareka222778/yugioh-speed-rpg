import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "38670435",
    "konamiId": 5889,
    "name": "Tiranossauro Negro",
    "englishName": "Black Tyranno",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Dinosaur",
    "attribute": "EARTH",
    "level": 7,
    "atk": 2600,
    "defense": 1800,
    "summary": "Pode atacar diretamente se o oponente controlar somente monstros em Defesa e nenhuma outra carta.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5889&request_locale=en"
  },
  {
    "id": "53890795",
    "konamiId": 5959,
    "name": "Saltador de Foguete",
    "englishName": "Rocket Jumper",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Rock",
    "attribute": "EARTH",
    "level": 3,
    "atk": 1000,
    "defense": 800,
    "summary": "Pode atacar diretamente se o oponente controlar somente monstros em Defesa e nenhuma outra carta.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5959&request_locale=en"
  },
  {
    "id": "99050989",
    "konamiId": 5562,
    "name": "Drillago",
    "englishName": "Drillago",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Machine",
    "attribute": "DARK",
    "level": 4,
    "atk": 1600,
    "defense": 1100,
    "summary": "Pode atacar diretamente se o oponente controlar somente monstros com a face para cima e pelo menos 1600 ATK, sem outra carta no campo.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5562&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "38670435": {
    "kind": "monsterEffect"
  },
  "53890795": {
    "kind": "monsterEffect"
  },
  "99050989": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "38670435": {
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
              "condition": "defenseOnly"
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
  "53890795": {
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
              "condition": "defenseOnly"
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
  "99050989": {
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
              "condition": "faceUpMinAtk",
              "minimumAtk": 1600
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
