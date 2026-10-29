import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
export const movementBatch28:readonly Card[]=[
  {
    "id": "24623598",
    "konamiId": 5397,
    "name": "Desaparecer",
    "englishName": "Disappear",
    "kind": "trap",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Seleção de cartas em zonas públicas, com conservação e revalidação de instâncias.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5397&request_locale=en"
  },
  {
    "id": "82542267",
    "konamiId": 4845,
    "name": "Carniçal Violador de Túmulos",
    "englishName": "Gravedigger Ghoul",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Seleção de cartas em zonas públicas, com conservação e revalidação de instâncias.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4845&request_locale=en"
  },
  {
    "id": "05758500",
    "konamiId": 4857,
    "name": "Libertar Almas",
    "englishName": "Soul Release",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Seleção de cartas em zonas públicas, com conservação e revalidação de instâncias.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4857&request_locale=en"
  },
  {
    "id": "06343408",
    "konamiId": 5278,
    "name": "Escavação Milagrosa",
    "englishName": "Miracle Dig",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Seleção de cartas em zonas públicas, com conservação e revalidação de instâncias.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5278&request_locale=en"
  },
  {
    "id": "78864369",
    "konamiId": 6050,
    "name": "Revertir Alma",
    "englishName": "Soul Reversal",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Seleção de cartas em zonas públicas, com conservação e revalidação de instâncias.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6050&request_locale=en"
  },
  {
    "id": "36280194",
    "konamiId": 4953,
    "name": "Soldado de Reforço",
    "englishName": "Backup Soldier",
    "kind": "trap",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Seleção de cartas em zonas públicas, com conservação e revalidação de instâncias.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4953&request_locale=en"
  }
];
export const movementEffects28:Record<string,Effect>={
  "24623598": {
    "kind": "moveSelected",
    "activation": {
      "speed": 2,
      "window": "free",
      "damage": "never"
    },
    "rule": {
      "from": "grave",
      "scope": "opponent",
      "destination": "banished",
      "minimum": 1,
      "maximum": 1,
      "filter": {}
    }
  },
  "36280194": {
    "kind": "moveSelected",
    "activation": {
      "speed": 2,
      "window": "free",
      "damage": "never"
    },
    "rule": {
      "from": "grave",
      "scope": "self",
      "destination": "hand",
      "minimum": 1,
      "maximum": 3,
      "minimumMonsters": 5,
      "filter": {
        "nonEffect": true,
        "maxAtk": 1500
      }
    }
  },
  "78864369": {
    "kind": "moveSelected",
    "activation": {
      "speed": 2,
      "window": "free",
      "damage": "never"
    },
    "rule": {
      "from": "grave",
      "scope": "self",
      "destination": "deckTop",
      "minimum": 1,
      "maximum": 1,
      "filter": {
        "flip": true
      }
    }
  },
  "82542267": {
    "kind": "moveSelected",
    "activation": {
      "speed": 1,
      "window": "main",
      "damage": "never"
    },
    "rule": {
      "from": "grave",
      "scope": "opponent",
      "destination": "banished",
      "minimum": 1,
      "maximum": 2,
      "filter": {
        "monster": true
      }
    }
  },
  "05758500": {
    "kind": "moveSelected",
    "activation": {
      "speed": 1,
      "window": "main",
      "damage": "never"
    },
    "rule": {
      "from": "grave",
      "scope": "both",
      "destination": "banished",
      "minimum": 1,
      "maximum": 5,
      "filter": {}
    }
  },
  "06343408": {
    "kind": "moveSelected",
    "activation": {
      "speed": 1,
      "window": "main",
      "damage": "never"
    },
    "rule": {
      "from": "banished",
      "scope": "self",
      "destination": "grave",
      "minimum": 3,
      "maximum": 3,
      "minimumMonsters": 5,
      "filter": {
        "monster": true
      }
    }
  }
};
