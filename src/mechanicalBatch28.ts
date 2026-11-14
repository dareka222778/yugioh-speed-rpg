import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
export const mechanicalBatch28:readonly Card[]=[
  {
    "id": "38699854",
    "konamiId": 5431,
    "name": "Livro do Taiyou",
    "englishName": "Book of Taiyou",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Efeito executável com seleção, revalidação e processamento de gatilhos.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5431&request_locale=en"
  },
  {
    "id": "63102017",
    "konamiId": 4326,
    "name": "Impedir a Defesa",
    "englishName": "Stop Defense",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Efeito executável com seleção, revalidação e processamento de gatilhos.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4326&request_locale=en"
  },
  {
    "id": "93747864",
    "konamiId": 6068,
    "name": "Sol do Deserto",
    "englishName": "Desert Sunlight",
    "kind": "trap",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Efeito executável com seleção, revalidação e processamento de gatilhos.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6068&request_locale=en"
  },
  {
    "id": "45895206",
    "konamiId": 4356,
    "name": "Dark-Piercing Light",
    "englishName": "Dark-Piercing Light",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Efeito executável com seleção, revalidação e processamento de gatilhos.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4356&request_locale=en"
  },
  {
    "id": "96947648",
    "konamiId": 5908,
    "name": "Salvamento",
    "englishName": "Salvage",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Efeito executável com seleção, revalidação e processamento de gatilhos.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5908&request_locale=en"
  },
  {
    "id": "90928333",
    "konamiId": 6129,
    "name": "Fábrica Negra de Produção Maciça",
    "englishName": "Dark Factory of Mass Production",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Efeito executável com seleção, revalidação e processamento de gatilhos.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6129&request_locale=en"
  }
];
export const mechanicalEffects28:Record<string,Effect>={
  "38699854": {
    "kind": "positionChange",
    "activation": {
      "speed": 1,
      "window": "main",
      "damage": "never"
    },
    "rule": {
      "scope": "selected",
      "mode": "revealAtk"
    }
  },
  "45895206": {
    "kind": "positionChange",
    "activation": {
      "speed": 1,
      "window": "main",
      "damage": "never"
    },
    "rule": {
      "scope": "opponent",
      "mode": "reveal"
    }
  },
  "63102017": {
    "kind": "positionChange",
    "activation": {
      "speed": 1,
      "window": "main",
      "damage": "never"
    },
    "rule": {
      "scope": "selected",
      "mode": "revealAtk",
      "controller": "opponent"
    }
  },
  "90928333": {
    "kind": "recoverMultiple",
    "rule": {
      "count": 2,
      "filter": {
        "normal": true
      }
    }
  },
  "93747864": {
    "kind": "positionChange",
    "activation": {
      "speed": 2,
      "window": "free",
      "damage": "never"
    },
    "rule": {
      "scope": "self",
      "mode": "revealDef"
    }
  },
  "96947648": {
    "kind": "recoverMultiple",
    "rule": {
      "count": 2,
      "filter": {
        "attribute": "WATER",
        "maxAtk": 1500
      }
    }
  }
};
