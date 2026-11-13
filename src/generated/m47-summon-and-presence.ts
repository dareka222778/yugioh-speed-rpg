import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "15259703",
    "konamiId": 4798,
    "name": "Mundo Toon",
    "englishName": "Toon World",
    "kind": "spell",
    "summary": "Pague 1.000 PV para ativar esta Magia Contínua.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4798&request_locale=en",
    "level": null,
    "atk": null,
    "defense": null,
    "race": null,
    "attribute": null
  },
  {
    "id": "25236056",
    "konamiId": 6084,
    "name": "Dragão Metal Raro",
    "englishName": "Rare Metal Dragon",
    "kind": "monster",
    "summary": "Não pode ser Invocado por Invocação-Normal nem baixado da mão.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6084&request_locale=en",
    "level": 4,
    "atk": 2400,
    "defense": 1200,
    "race": "Dragon",
    "attribute": "DARK",
    "monsterType": "effect"
  },
  {
    "id": "16589042",
    "konamiId": 5243,
    "name": "Gaia, o Cavaleiro Impetuoso Célere",
    "englishName": "Swift Gaia the Fierce Knight",
    "kind": "monster",
    "summary": "Se for sua única carta na mão, pode Invocá-la normalmente em Ataque sem Tributos.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5243&request_locale=en",
    "level": 7,
    "atk": 2300,
    "defense": 2100,
    "race": "Warrior",
    "attribute": "DARK",
    "monsterType": "effect"
  }
];
export const effects:Record<string,Effect>={
  "15259703": {
    "kind": "continuous",
    "rules": [],
    "presenceOnly": true,
    "lpCost": 1000,
    "activation": {
      "speed": 1,
      "window": "main",
      "damage": "never"
    }
  },
  "16589042": {
    "kind": "monsterEffect"
  },
  "25236056": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "16589042": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "normalSummonPolicy",
        "mode": "lastHandFaceUp"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "25236056": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "normalSummonPolicy",
        "mode": "forbidden"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  }
};
