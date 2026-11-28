import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
export const attackBatch28:readonly Card[]=[
  {
    "id": "85742772",
    "konamiId": 5134,
    "name": "União Gravítica",
    "englishName": "Gravity Bind",
    "kind": "trap",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Restrição contínua de ataque, dependente da fonte no campo.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5134&request_locale=en"
  },
  {
    "id": "23615409",
    "konamiId": 4832,
    "name": "Barreira de Insetos",
    "englishName": "Insect Barrier",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Restrição contínua de ataque, dependente da fonte no campo.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4832&request_locale=en"
  },
  {
    "id": "95220856",
    "konamiId": 5281,
    "name": "O Vingativo Espírito do Pântano",
    "englishName": "Vengeful Bog Spirit",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Restrição contínua de ataque, dependente da fonte no campo.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5281&request_locale=en"
  }
];
export const attackEffects28:Record<string,Effect>={
  "23615409": {
    "kind": "continuous",
    "activation": {
      "speed": 1,
      "window": "main",
      "damage": "never"
    },
    "rules": [
      {
        "kind": "preventAttack",
        "filter": {
          "controller": "opponent",
          "races": [
            "Insect"
          ]
        },
        "declarationOnly": true
      }
    ]
  },
  "85742772": {
    "kind": "continuous",
    "activation": {
      "speed": 2,
      "window": "free",
      "damage": "never"
    },
    "rules": [
      {
        "kind": "preventAttack",
        "filter": {
          "minimumLevel": 4
        }
      }
    ]
  },
  "95220856": {
    "kind": "continuous",
    "activation": {
      "speed": 1,
      "window": "main",
      "damage": "never"
    },
    "rules": [
      {
        "kind": "preventAttack",
        "filter": {
          "summonedThisTurn": true
        }
      }
    ]
  }
};
