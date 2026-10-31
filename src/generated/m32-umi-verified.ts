import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "24435369",
    "konamiId": 5967,
    "name": "Cavaleira Sereia",
    "englishName": "Mermaid Knight",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Aqua",
    "attribute": "WATER",
    "level": 4,
    "atk": 1500,
    "defense": 700,
    "summary": "Enquanto Umi estiver com a face para cima, pode atacar duas vezes em cada Fase de Batalha.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5967&request_locale=en"
  },
  {
    "id": "64342551",
    "konamiId": 5893,
    "name": "Bugroth Anfíbio MK-3",
    "englishName": "Amphibious Bugroth MK-3",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Machine",
    "attribute": "WATER",
    "level": 4,
    "atk": 1500,
    "defense": 1300,
    "summary": "Enquanto Umi estiver com a face para cima, pode atacar diretamente.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5893&request_locale=en"
  },
  {
    "id": "95614612",
    "konamiId": 5897,
    "name": "Projétil Molusco-Lança",
    "englishName": "Cannonball Spear Shellfish",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Aqua",
    "attribute": "WATER",
    "level": 2,
    "atk": 1000,
    "defense": 1000,
    "summary": "Enquanto Umi estiver com a face para cima, não é afetado por efeitos de Magias.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5897&request_locale=ja"
  },
  {
    "id": "90337190",
    "konamiId": 5894,
    "name": "Peixe Torpedo",
    "englishName": "Torpedo Fish",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fish",
    "attribute": "WATER",
    "level": 3,
    "atk": 1000,
    "defense": 1000,
    "summary": "Enquanto Umi estiver com a face para cima, não é afetado por efeitos de Magias.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5894&request_locale=en"
  },
  {
    "id": "24128274",
    "konamiId": 4776,
    "name": "Guerreiro das Profundezas do Mar",
    "englishName": "Deepsea Warrior",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Warrior",
    "attribute": "WATER",
    "level": 5,
    "atk": 1600,
    "defense": 1800,
    "summary": "Enquanto Umi estiver com a face para cima, não é afetado por efeitos de Magias.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4776&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "24128274": {
    "kind": "monsterEffect"
  },
  "24435369": {
    "kind": "monsterEffect"
  },
  "64342551": {
    "kind": "monsterEffect"
  },
  "90337190": {
    "kind": "monsterEffect"
  },
  "95614612": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "24128274": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "immune",
            "filter": {
              "selfOnly": true,
              "faceUpNames": [
                "Umi"
              ]
            },
            "from": [
              "spell"
            ]
          }
        ]
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "24435369": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "combat",
            "filter": {
              "selfOnly": true,
              "faceUpNames": [
                "Umi"
              ]
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
  "64342551": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "combat",
            "filter": {
              "selfOnly": true,
              "faceUpNames": [
                "Umi"
              ]
            },
            "rule": {
              "kind": "direct"
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
  "90337190": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "immune",
            "filter": {
              "selfOnly": true,
              "faceUpNames": [
                "Umi"
              ]
            },
            "from": [
              "spell"
            ]
          }
        ]
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "95614612": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "immune",
            "filter": {
              "selfOnly": true,
              "faceUpNames": [
                "Umi"
              ]
            },
            "from": [
              "spell"
            ]
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
