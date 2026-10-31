import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "09076207",
    "konamiId": 4475,
    "name": "Ninja Armado",
    "englishName": "Armed Ninja",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 1,
    "atk": 300,
    "defense": 300,
    "summary": "Consulte a descrição completa em português do efeito implementado.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4475&request_locale=en"
  },
  {
    "id": "14618326",
    "konamiId": 5816,
    "name": "Ninja Carmesim",
    "englishName": "Crimson Ninja",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 1,
    "atk": 300,
    "defense": 300,
    "summary": "Consulte a descrição completa em português do efeito implementado.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5816&request_locale=en"
  },
  {
    "id": "33066139",
    "konamiId": 4090,
    "name": "Ceifador de Cards",
    "englishName": "Reaper of the Cards",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fiend",
    "attribute": "DARK",
    "level": 5,
    "atk": 1380,
    "defense": 1930,
    "summary": "Consulte a descrição completa em português do efeito implementado.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4090&request_locale=en"
  },
  {
    "id": "46461247",
    "konamiId": 4230,
    "name": "Mestre das Armadilhas",
    "englishName": "Trap Master",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 3,
    "atk": 500,
    "defense": 1100,
    "summary": "Consulte a descrição completa em português do efeito implementado.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4230&request_locale=en"
  },
  {
    "id": "81985784",
    "konamiId": 5359,
    "name": "Demônio Des Feral",
    "englishName": "Des Feral Imp",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Reptile",
    "attribute": "DARK",
    "level": 4,
    "atk": 1600,
    "defense": 1800,
    "summary": "Consulte a descrição completa em português do efeito implementado.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5359&request_locale=en"
  },
  {
    "id": "75946257",
    "konamiId": 5826,
    "name": "Médico Feiticeiro do Caos",
    "englishName": "Witch Doctor of Chaos",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Spellcaster",
    "attribute": "DARK",
    "level": 2,
    "atk": 500,
    "defense": 500,
    "summary": "Consulte a descrição completa em português do efeito implementado.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5826&request_locale=en"
  },
  {
    "id": "28563545",
    "konamiId": 4506,
    "name": "Dragon Seeker",
    "englishName": "Dragon Seeker",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fiend",
    "attribute": "DARK",
    "level": 6,
    "atk": 2000,
    "defense": 2100,
    "summary": "Consulte a descrição completa em português do efeito implementado.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4506&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "14618326": {
    "kind": "monsterEffect"
  },
  "28563545": {
    "kind": "monsterEffect"
  },
  "33066139": {
    "kind": "monsterEffect"
  },
  "46461247": {
    "kind": "monsterEffect"
  },
  "75946257": {
    "kind": "monsterEffect"
  },
  "81985784": {
    "kind": "monsterEffect"
  },
  "09076207": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "14618326": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "singleCard",
        "rule": {
          "from": "backrow",
          "controller": "both",
          "action": "destroy",
          "kind": "trap",
          "inspectSetAs": "trap"
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "28563545": {
    "effect": {
      "trigger": "onSummon",
      "operation": {
        "kind": "singleCard",
        "rule": {
          "from": "monsters",
          "controller": "both",
          "action": "destroy",
          "kind": "monster",
          "faceUpOnly": true,
          "race": "Dragon"
        }
      },
      "summons": [
        "normal",
        "flip"
      ]
    },
    "activation": {
      "policy": "mandatory",
      "window": "summon"
    }
  },
  "33066139": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "singleCard",
        "rule": {
          "from": "backrow",
          "controller": "both",
          "action": "destroy",
          "kind": "trap",
          "inspectSetAs": "trap"
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "46461247": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "singleCard",
        "rule": {
          "from": "backrow",
          "controller": "both",
          "action": "destroy",
          "kind": "trap",
          "inspectSetAs": "trap"
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "75946257": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "singleCard",
        "rule": {
          "from": "grave",
          "controller": "both",
          "action": "banish",
          "kind": "monster"
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "81985784": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "singleCard",
        "rule": {
          "from": "grave",
          "controller": "self",
          "action": "shuffleDeck"
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  },
  "09076207": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "singleCard",
        "rule": {
          "from": "backrow",
          "controller": "both",
          "action": "destroy",
          "kind": "spell",
          "inspectSetAs": "spell"
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  }
};
