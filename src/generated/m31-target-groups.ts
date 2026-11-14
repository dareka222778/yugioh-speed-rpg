import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "93920745",
    "konamiId": 4608,
    "name": "Soldado Pinguim",
    "englishName": "Penguin Soldier",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Aqua",
    "attribute": "WATER",
    "level": 2,
    "atk": 750,
    "defense": 500,
    "summary": "Veja as regras completas em português e os alvos selecionados antes da corrente.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4608&request_locale=en"
  },
  {
    "id": "28357177",
    "konamiId": 6124,
    "name": "Hade-Hane",
    "englishName": "Hade-Hane",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Beast",
    "attribute": "EARTH",
    "level": 5,
    "atk": 900,
    "defense": 1000,
    "summary": "Veja as regras completas em português e os alvos selecionados antes da corrente.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6124&request_locale=en"
  },
  {
    "id": "65878864",
    "konamiId": 6122,
    "name": "Inseto Comedor de Nobres",
    "englishName": "Nobleman-Eater Bug",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Insect",
    "attribute": "EARTH",
    "level": 5,
    "atk": 900,
    "defense": 1200,
    "summary": "Veja as regras completas em português e os alvos selecionados antes da corrente.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6122&request_locale=en"
  },
  {
    "id": "61831093",
    "konamiId": 4592,
    "name": "Kappa Verde",
    "englishName": "Greenkappa",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Warrior",
    "attribute": "DARK",
    "level": 3,
    "atk": 650,
    "defense": 900,
    "summary": "Veja as regras completas em português e os alvos selecionados antes da corrente.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4592&request_locale=en"
  },
  {
    "id": "71283180",
    "konamiId": 5257,
    "name": "Pássaro Tornado",
    "englishName": "Tornado Bird",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Winged Beast",
    "attribute": "WIND",
    "level": 4,
    "atk": 1100,
    "defense": 1000,
    "summary": "Veja as regras completas em português e os alvos selecionados antes da corrente.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5257&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "28357177": {
    "kind": "monsterEffect"
  },
  "61831093": {
    "kind": "monsterEffect"
  },
  "65878864": {
    "kind": "monsterEffect"
  },
  "71283180": {
    "kind": "monsterEffect"
  },
  "93920745": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "28357177": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "targetGroup",
        "rule": {
          "from": "monsters",
          "action": "returnHand",
          "minimum": 1,
          "maximum": 3
        }
      }
    },
    "activation": {
      "policy": "optional",
      "window": "flip"
    }
  },
  "61831093": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "targetGroup",
        "rule": {
          "from": "backrow",
          "action": "destroy",
          "minimum": 2,
          "maximum": 2,
          "faceDownOnly": true
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "65878864": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "targetGroup",
        "rule": {
          "from": "monsters",
          "action": "destroy",
          "minimum": 2,
          "maximum": 2
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "71283180": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "targetGroup",
        "rule": {
          "from": "backrow",
          "action": "returnHand",
          "minimum": 2,
          "maximum": 2
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "93920745": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "targetGroup",
        "rule": {
          "from": "monsters",
          "action": "returnHand",
          "minimum": 1,
          "maximum": 2
        }
      }
    },
    "activation": {
      "policy": "optional",
      "window": "flip"
    }
  }
};
