import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "85802526",
    "konamiId": 5204,
    "name": "Cure Mermaid",
    "englishName": "Cure Mermaid",
    "kind": "monster",
    "monsterType": "effect",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5204&request_locale=en",
    "level": 4,
    "atk": 1500,
    "defense": 800,
    "race": "Fish",
    "attribute": "WATER",
    "summary": "Com a face para cima, ganhe 800 PV."
  },
  {
    "id": "90925163",
    "konamiId": 5201,
    "name": "Dancing Fairy",
    "englishName": "Dancing Fairy",
    "kind": "monster",
    "monsterType": "effect",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5201&request_locale=en",
    "level": 4,
    "atk": 1700,
    "defense": 1000,
    "race": "Fairy",
    "attribute": "WIND",
    "summary": "Com a face para cima em Defesa, ganhe 1000 PV."
  },
  {
    "id": "53530069",
    "konamiId": 5200,
    "name": "Spirit of the Breeze",
    "englishName": "Spirit of the Breeze",
    "kind": "monster",
    "monsterType": "effect",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5200&request_locale=en",
    "level": 3,
    "atk": 0,
    "defense": 1800,
    "race": "Fairy",
    "attribute": "WIND",
    "summary": "Com a face para cima em Ataque, ganhe 1000 PV."
  },
  {
    "id": "52090844",
    "konamiId": 5687,
    "name": "Bowganian",
    "englishName": "Bowganian",
    "kind": "monster",
    "monsterType": "effect",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5687&request_locale=en",
    "level": 3,
    "atk": 1300,
    "defense": 1000,
    "race": "Machine",
    "attribute": "DARK",
    "summary": "Com a face para cima, cause 600 PV de dano ao oponente."
  },
  {
    "id": "57579381",
    "konamiId": 5209,
    "name": "Senhora Obscura Maria",
    "englishName": "Darklord Marie",
    "kind": "monster",
    "monsterType": "effect",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5209&request_locale=en",
    "level": 5,
    "atk": 1700,
    "defense": 1200,
    "race": "Fiend",
    "attribute": "DARK",
    "summary": "No seu Cemitério, ganhe 200 PV."
  },
  {
    "id": "21175632",
    "konamiId": 5208,
    "name": "St. Joan",
    "englishName": "St. Joan",
    "kind": "monster",
    "monsterType": "fusion",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5208&request_locale=en",
    "level": 7,
    "atk": 2800,
    "defense": 2000,
    "race": "Fairy",
    "attribute": "LIGHT",
    "fusion": [
      "84080938",
      "57579381"
    ],
    "summary": "Fusão de The Forgiving Maiden e Darklord Marie. Sem efeito."
  }
];
export const effects:Record<string,Effect>={
  "21175632": {
    "kind": "fusion"
  },
  "52090844": {
    "kind": "monsterEffect"
  },
  "53530069": {
    "kind": "monsterEffect"
  },
  "57579381": {
    "kind": "monsterEffect"
  },
  "85802526": {
    "kind": "monsterEffect"
  },
  "90925163": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "52090844": {
    "effect": {
      "trigger": "ownStandby",
      "standby": {
        "zone": "monsters",
        "requireSourceAtResolution": false
      },
      "operation": {
        "kind": "burn",
        "amount": 600
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "standby"
    }
  },
  "53530069": {
    "effect": {
      "trigger": "ownStandby",
      "standby": {
        "zone": "monsters",
        "requireSourceAtResolution": true,
        "position": "atk"
      },
      "operation": {
        "kind": "heal",
        "amount": 1000
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "standby"
    }
  },
  "57579381": {
    "effect": {
      "trigger": "ownStandby",
      "standby": {
        "zone": "grave",
        "requireSourceAtResolution": true
      },
      "operation": {
        "kind": "heal",
        "amount": 200
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "standby"
    }
  },
  "85802526": {
    "effect": {
      "trigger": "ownStandby",
      "standby": {
        "zone": "monsters",
        "requireSourceAtResolution": true
      },
      "operation": {
        "kind": "heal",
        "amount": 800
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "standby"
    }
  },
  "90925163": {
    "effect": {
      "trigger": "ownStandby",
      "standby": {
        "zone": "monsters",
        "requireSourceAtResolution": true,
        "position": "def"
      },
      "operation": {
        "kind": "heal",
        "amount": 1000
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "standby"
    }
  }
};
