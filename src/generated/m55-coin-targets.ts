import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "81480460",
    "konamiId": 4749,
    "name": "Dragão Revólver",
    "englishName": "Barrel Dragon",
    "kind": "monster",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4749&request_locale=en",
    "summary": "Uma vez por turno: escolha 1 monstro que o oponente controla e lance 3 moedas. Se pelo menos 2 derem cara, destrua o alvo.",
    "level": 7,
    "atk": 2600,
    "defense": 2200,
    "race": "Machine",
    "attribute": "DARK",
    "monsterType": "effect"
  },
  {
    "id": "25551951",
    "konamiId": 5964,
    "name": "Dragão Solta Fogo",
    "englishName": "Blowback Dragon",
    "kind": "monster",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5964&request_locale=en",
    "summary": "Uma vez por turno: escolha 1 carta que o oponente controla e lance 3 moedas. Se pelo menos 2 derem cara, destrua o alvo.",
    "level": 6,
    "atk": 2300,
    "defense": 1200,
    "race": "Machine",
    "attribute": "DARK",
    "monsterType": "effect"
  }
];
export const effects:Record<string,Effect>={
  "25551951": {
    "kind": "monsterEffect"
  },
  "81480460": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "25551951": {
    "effect": {
      "trigger": "ignition",
      "oncePerTurn": true,
      "operation": {
        "kind": "coinTarget",
        "zone": "fieldCard"
      }
    },
    "activation": {
      "policy": "manual",
      "window": "main"
    }
  },
  "81480460": {
    "effect": {
      "trigger": "ignition",
      "oncePerTurn": true,
      "operation": {
        "kind": "coinTarget",
        "zone": "monster"
      }
    },
    "activation": {
      "policy": "manual",
      "window": "main"
    }
  }
};
