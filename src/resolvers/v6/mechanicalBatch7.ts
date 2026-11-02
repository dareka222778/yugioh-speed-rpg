import type {Card} from './cardCatalog';
import type {MonsterDefinition} from './monsterEffects';
export const mechanicalBatch7:readonly Card[]=[
  {
    "id": "43716289",
    "konamiId": 5413,
    "name": "Poison Mummy",
    "englishName": "Poison Mummy",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Zombie",
    "attribute": "EARTH",
    "level": 4,
    "atk": 1000,
    "defense": 1800,
    "summary": "Descrição operacional gerada da definição individual auditada.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5413&request_locale=ja"
  },
  {
    "id": "45141844",
    "konamiId": 5651,
    "name": "Old Vindictive Magician",
    "englishName": "Old Vindictive Magician",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Spellcaster",
    "attribute": "DARK",
    "level": 2,
    "atk": 450,
    "defense": 600,
    "summary": "Descrição operacional gerada da definição individual auditada.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5651&request_locale=ja"
  },
  {
    "id": "77491079",
    "konamiId": 5818,
    "name": "Gale Lizard",
    "englishName": "Gale Lizard",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Reptile",
    "attribute": "WATER",
    "level": 4,
    "atk": 1400,
    "defense": 700,
    "summary": "Descrição operacional gerada da definição individual auditada.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5818&request_locale=ja"
  },
  {
    "id": "91869203",
    "konamiId": 5195,
    "name": "Amazoness Archer",
    "englishName": "Amazoness Archer",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 4,
    "atk": 1400,
    "defense": 1000,
    "summary": "Descrição operacional gerada da definição individual auditada.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5195&request_locale=ja"
  },
  {
    "id": "69579761",
    "konamiId": 5661,
    "name": "Des Koala",
    "englishName": "Des Koala",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Beast",
    "attribute": "DARK",
    "level": 3,
    "atk": 1100,
    "defense": 1800,
    "summary": "Descrição operacional gerada da definição individual auditada.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5661&request_locale=ja"
  },
  {
    "id": "83994646",
    "konamiId": 5139,
    "name": "4-Starred Ladybug of Doom",
    "englishName": "4-Starred Ladybug of Doom",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Insect",
    "attribute": "WIND",
    "level": 3,
    "atk": 800,
    "defense": 1200,
    "summary": "Descrição operacional gerada da definição individual auditada.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5139&request_locale=ja"
  }
];
export const mechanicalMonsters7:Readonly<Record<string,MonsterDefinition>>={
  "43716289": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "burn",
        "amount": 500
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "45141844": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "destroy",
        "target": "opponentMonster"
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "69579761": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "burnPerHand",
        "amount": 400
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "77491079": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "bounce",
        "target": "opponentMonster"
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "83994646": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "destroyByLevel",
        "level": 4
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "91869203": {
    "effect": {
      "trigger": "ignition",
      "cost": {
        "kind": "tribute",
        "count": 2
      },
      "operation": {
        "kind": "burn",
        "amount": 1200
      }
    },
    "activation": {
      "policy": "manual",
      "window": "main"
    }
  }
};
