import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "13945283",
    "konamiId": 4880,
    "name": "Barreira Ilusória",
    "englishName": "Wall of Illusion",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fiend",
    "attribute": "DARK",
    "level": 4,
    "atk": 1000,
    "defense": 1850,
    "summary": "When attacked by another monster, after damage calculation return that attacking monster to its physical owner hand, even if this defender was destroyed by that battle.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4880&ope=2&request_locale=en"
  },
  {
    "id": "54878498",
    "konamiId": 5361,
    "name": "Kelbek",
    "englishName": "Kelbek",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fairy",
    "attribute": "EARTH",
    "level": 4,
    "atk": 1500,
    "defense": 1800,
    "summary": "When attacked by another monster, after damage calculation return that attacking monster to its physical owner hand, even if this defender was destroyed by that battle.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=5361&ope=2&request_locale=en"
  },
  {
    "id": "98162242",
    "konamiId": 5963,
    "name": "Enterrador de Agulhas",
    "englishName": "Needle Burrower",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Machine",
    "attribute": "DARK",
    "level": 5,
    "atk": 1700,
    "defense": 1700,
    "summary": "If this monster destroys another monster by battle and sends it to the Graveyard, deal its controller opponent damage equal to 500 times the destroyed monster original Level. No damage from other causes of destruction.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=5963&ope=2&request_locale=en"
  },
  {
    "id": "52768103",
    "konamiId": 5962,
    "name": "KA-2 Des Tesouras",
    "englishName": "KA-2 Des Scissors",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Machine",
    "attribute": "DARK",
    "level": 4,
    "atk": 1000,
    "defense": 1000,
    "summary": "If this monster destroys another monster by battle and sends it to the Graveyard, deal its controller opponent damage equal to 500 times the destroyed monster original Level. No damage from other causes of destruction.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=5962&ope=2&request_locale=en"
  },
  {
    "id": "78658564",
    "konamiId": 5145,
    "name": "Força de Ataque dos Goblins",
    "englishName": "Goblin Attack Force",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 4,
    "atk": 2300,
    "defense": 0,
    "summary": "After this monster attacks, at the end of that Battle Phase put it in Defense Position; it cannot manually change its battle position through the End Phase of its controller next turn.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=5145&ope=2&request_locale=en"
  },
  {
    "id": "73698349",
    "konamiId": 5586,
    "name": "Orc Gigante",
    "englishName": "Giant Orc",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fiend",
    "attribute": "DARK",
    "level": 4,
    "atk": 2200,
    "defense": 0,
    "summary": "After this monster attacks, at the end of that Battle Phase put it in Defense Position; it cannot manually change its battle position through the end of its controller next turn.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=5586&ope=2&request_locale=en"
  },
  {
    "id": "31553716",
    "konamiId": 5334,
    "name": "Dragão Lanceiro",
    "englishName": "Spear Dragon",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Dragon",
    "attribute": "WIND",
    "level": 4,
    "atk": 1900,
    "defense": 0,
    "summary": "Inflicts piercing battle damage when it attacks a Defense Position monster with less DEF than its ATK, and changes itself to Defense Position at the end of the Damage Step, not at the end of the Battle Phase.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=5334&ope=2&request_locale=en"
  },
  {
    "id": "62340868",
    "konamiId": 4378,
    "name": "Kazejin",
    "englishName": "Kazejin",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Spellcaster",
    "attribute": "WIND",
    "level": 7,
    "atk": 2400,
    "defense": 2200,
    "summary": "Once while this card remains face-up on the field, during damage calculation on the opponent turn when this card is attacked, its controller may activate a Quick Effect targeting the attacking monster to make that attacker ATK zero for this damage calculation only. The opportunity and one-use state reset if the source is set face-down then flipped face-up.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4378&ope=2&request_locale=en"
  },
  {
    "id": "98434877",
    "konamiId": 4379,
    "name": "Suijin",
    "englishName": "Suijin",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Aqua",
    "attribute": "WATER",
    "level": 7,
    "atk": 2500,
    "defense": 2400,
    "summary": "Once while this card remains face-up on the field, during damage calculation on the opponent turn when this card is attacked, its controller may activate a Quick Effect targeting the attacking monster to make that attacker ATK zero for this damage calculation only. The opportunity and one-use state reset if the source is set face-down then flipped face-up.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4379&ope=2&request_locale=en"
  },
  {
    "id": "25955164",
    "konamiId": 4377,
    "name": "Sanga do Trovão",
    "englishName": "Sanga of the Thunder",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Thunder",
    "attribute": "LIGHT",
    "level": 7,
    "atk": 2600,
    "defense": 2200,
    "summary": "Once while this card remains face-up on the field, during damage calculation on the opponent turn when this card is attacked, its controller may activate a Quick Effect targeting the attacking monster to make that attacker ATK zero for this damage calculation only. The opportunity and one-use state reset if the source is set face-down then flipped face-up.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4377&ope=2&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "13945283": {
    "kind": "monsterEffect"
  },
  "25955164": {
    "kind": "monsterEffect"
  },
  "31553716": {
    "kind": "monsterEffect"
  },
  "52768103": {
    "kind": "monsterEffect"
  },
  "54878498": {
    "kind": "monsterEffect"
  },
  "62340868": {
    "kind": "monsterEffect"
  },
  "73698349": {
    "kind": "monsterEffect"
  },
  "78658564": {
    "kind": "monsterEffect"
  },
  "98162242": {
    "kind": "monsterEffect"
  },
  "98434877": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "13945283": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "battleBounceAttacker"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "25955164": {
    "effect": {
      "trigger": "quick",
      "operation": {
        "kind": "guardianZeroAttack"
      }
    },
    "activation": {
      "policy": "manual",
      "window": "opposingDamageCalculation"
    }
  },
  "31553716": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "endDamageDefensePiercing"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "52768103": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "battleLevelBurn"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "54878498": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "battleBounceAttacker"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "62340868": {
    "effect": {
      "trigger": "quick",
      "operation": {
        "kind": "guardianZeroAttack"
      }
    },
    "activation": {
      "policy": "manual",
      "window": "opposingDamageCalculation"
    }
  },
  "73698349": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "endBattleDefense"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "78658564": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "endBattleDefense"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "98162242": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "battleLevelBurn"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "98434877": {
    "effect": {
      "trigger": "quick",
      "operation": {
        "kind": "guardianZeroAttack"
      }
    },
    "activation": {
      "policy": "manual",
      "window": "opposingDamageCalculation"
    }
  }
};
