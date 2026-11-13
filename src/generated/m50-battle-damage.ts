import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "71107816",
    "konamiId": 4529,
    "name": "O Carniceiro do Bar",
    "englishName": "The Bistro Butcher",
    "kind": "monster",
    "monsterType": "effect",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4529&request_locale=en",
    "summary": "Seu oponente compra 2 cartas.",
    "level": 4,
    "atk": 1800,
    "defense": 1000,
    "race": "Fiend",
    "attribute": "DARK"
  },
  {
    "id": "10189126",
    "konamiId": 4226,
    "name": "Feiticeiro Mascarado",
    "englishName": "Masked Sorcerer",
    "kind": "monster",
    "monsterType": "effect",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4226&request_locale=en",
    "summary": "Compre 1 carta.",
    "level": 4,
    "atk": 900,
    "defense": 1400,
    "race": "Spellcaster",
    "attribute": "DARK"
  },
  {
    "id": "15150365",
    "konamiId": 4120,
    "name": "Chapéu Mágico Branco",
    "englishName": "White Magical Hat",
    "kind": "monster",
    "monsterType": "effect",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4120&request_locale=en",
    "summary": "O oponente descarta 1 carta aleatória da mão.",
    "level": 3,
    "atk": 1000,
    "defense": 700,
    "race": "Spellcaster",
    "attribute": "LIGHT"
  },
  {
    "id": "18036057",
    "konamiId": 5023,
    "name": "Cavaleiro Celeste Parshath",
    "englishName": "Airknight Parshath",
    "kind": "monster",
    "monsterType": "effect",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5023&request_locale=en",
    "summary": "Ao atacar um monstro em Defesa, causa dano perfurante. Compre 1 carta.",
    "level": 5,
    "atk": 1900,
    "defense": 1400,
    "race": "Fairy",
    "attribute": "LIGHT"
  },
  {
    "id": "46820049",
    "konamiId": 5771,
    "name": "Mefist, o General Infernal",
    "englishName": "Mefist the Infernal General",
    "kind": "monster",
    "monsterType": "effect",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5771&request_locale=en",
    "summary": "Ao atacar um monstro em Defesa, causa dano perfurante. O oponente descarta 1 carta aleatória da mão.",
    "level": 5,
    "atk": 1800,
    "defense": 1700,
    "race": "Fiend",
    "attribute": "DARK"
  },
  {
    "id": "77379481",
    "konamiId": 5821,
    "name": "Samurai Sasuke nº 3",
    "englishName": "Sasuke Samurai #3",
    "kind": "monster",
    "monsterType": "effect",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5821&request_locale=en",
    "summary": "O oponente compra até ter 7 cartas na mão.",
    "level": 3,
    "atk": 1000,
    "defense": 1000,
    "race": "Warrior",
    "attribute": "LIGHT"
  }
];
export const effects:Record<string,Effect>={
  "10189126": {
    "kind": "monsterEffect"
  },
  "15150365": {
    "kind": "monsterEffect"
  },
  "18036057": {
    "kind": "monsterEffect"
  },
  "46820049": {
    "kind": "monsterEffect"
  },
  "71107816": {
    "kind": "monsterEffect"
  },
  "77379481": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "10189126": {
    "effect": {
      "trigger": "onBattleDamage",
      "operation": {
        "kind": "battleReward",
        "rule": {
          "result": "drawSelf",
          "count": 1
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "battleDamage"
    }
  },
  "15150365": {
    "effect": {
      "trigger": "onBattleDamage",
      "operation": {
        "kind": "battleReward",
        "rule": {
          "result": "discardOpponentRandom"
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "battleDamage"
    }
  },
  "18036057": {
    "effect": {
      "trigger": "onBattleDamage",
      "operation": {
        "kind": "battleReward",
        "rule": {
          "result": "drawSelf",
          "count": 1,
          "piercing": true
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "battleDamage"
    }
  },
  "46820049": {
    "effect": {
      "trigger": "onBattleDamage",
      "operation": {
        "kind": "battleReward",
        "rule": {
          "result": "discardOpponentRandom",
          "piercing": true
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "battleDamage"
    }
  },
  "71107816": {
    "effect": {
      "trigger": "onBattleDamage",
      "operation": {
        "kind": "battleReward",
        "rule": {
          "result": "drawOpponent",
          "count": 2
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "battleDamage"
    }
  },
  "77379481": {
    "effect": {
      "trigger": "onBattleDamage",
      "operation": {
        "kind": "battleReward",
        "rule": {
          "result": "drawOpponentToSeven"
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "battleDamage"
    }
  }
};
