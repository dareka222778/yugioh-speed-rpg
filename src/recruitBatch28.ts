import type {Card} from './cardCatalog';
import type {MonsterDefinition} from './monsterEffects';
export const recruitBatch28:readonly Card[]=[
  {
    "id": "55013285",
    "konamiId": 5341,
    "name": "Dragão de Infantaria",
    "englishName": "Troop Dragon",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Dragon",
    "attribute": "WIND",
    "level": 2,
    "atk": 700,
    "defense": 800,
    "summary": "Ao ser destruído em batalha e enviado ao Cemitério, recruta do Deck um monstro conforme seu filtro.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5341&request_locale=en"
  },
  {
    "id": "93107608",
    "konamiId": 6117,
    "name": "Inseto Horrível",
    "englishName": "Howling Insect",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Insect",
    "attribute": "EARTH",
    "level": 3,
    "atk": 1200,
    "defense": 1300,
    "summary": "Ao ser destruído em batalha e enviado ao Cemitério, recruta do Deck um monstro conforme seu filtro.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6117&request_locale=en"
  },
  {
    "id": "77044671",
    "konamiId": 5423,
    "name": "Tartaruga Pirâmide",
    "englishName": "Pyramid Turtle",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Zombie",
    "attribute": "EARTH",
    "level": 4,
    "atk": 1200,
    "defense": 1400,
    "summary": "Ao ser destruído em batalha e enviado ao Cemitério, recruta do Deck um monstro conforme seu filtro.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5423&request_locale=en"
  },
  {
    "id": "39191307",
    "konamiId": 6118,
    "name": "Dragão Mascarado",
    "englishName": "Masked Dragon",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Dragon",
    "attribute": "FIRE",
    "level": 3,
    "atk": 1400,
    "defense": 1100,
    "summary": "Ao ser destruído em batalha e enviado ao Cemitério, recruta do Deck um monstro conforme seu filtro.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6118&request_locale=en"
  },
  {
    "id": "24317029",
    "konamiId": 5509,
    "name": "Espião do Coveiro",
    "englishName": "Gravekeeper's Spy",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Spellcaster",
    "attribute": "DARK",
    "level": 4,
    "atk": 1200,
    "defense": 2000,
    "summary": "VIRAR: Invoque do Deck 1 monstro Gravekeeper's com até 1500 ATK.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5509&request_locale=en"
  }
];
export const recruitMonsters28:Record<string,MonsterDefinition>={
  "24317029": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "recruit",
        "filter": {
          "archetype": "Gravekeeper's",
          "maximumAtk": 1500
        },
        "positions": [
          "atk",
          "def"
        ]
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "39191307": {
    "effect": {
      "trigger": "onBattleDestroyed",
      "operation": {
        "kind": "recruit",
        "filter": {
          "race": "Dragon",
          "maximumAtk": 1500
        },
        "positions": [
          "atk",
          "def"
        ]
      }
    },
    "activation": {
      "policy": "optional",
      "window": "battleDestroyed"
    }
  },
  "55013285": {
    "effect": {
      "trigger": "onBattleDestroyed",
      "operation": {
        "kind": "recruit",
        "filter": {
          "name": "Troop Dragon"
        },
        "positions": [
          "atk",
          "def"
        ]
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "battleDestroyed"
    }
  },
  "77044671": {
    "effect": {
      "trigger": "onBattleDestroyed",
      "operation": {
        "kind": "recruit",
        "filter": {
          "race": "Zombie",
          "maximumDef": 2000
        },
        "positions": [
          "atk",
          "def"
        ]
      }
    },
    "activation": {
      "policy": "optional",
      "window": "battleDestroyed"
    }
  },
  "93107608": {
    "effect": {
      "trigger": "onBattleDestroyed",
      "operation": {
        "kind": "recruit",
        "filter": {
          "race": "Insect",
          "maximumAtk": 1500
        },
        "positions": [
          "atk",
          "def"
        ]
      }
    },
    "activation": {
      "policy": "optional",
      "window": "battleDestroyed"
    }
  }
};
