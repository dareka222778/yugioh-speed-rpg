import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "17444133",
    "konamiId": 5409,
    "name": "Cavalo-marinho de Kaiser",
    "englishName": "Kaiser Sea Horse",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Sea Serpent",
    "attribute": "LIGHT",
    "level": 4,
    "atk": 1700,
    "defense": 1650,
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5409&request_locale=en",
    "summary": "Pode valer por dois Tributos para Invocar por Tributo ou baixar um monstro de atributo LIGHT."
  },
  {
    "id": "44436472",
    "konamiId": 6040,
    "name": "Coston em Dobro",
    "englishName": "Double Coston",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Zombie",
    "attribute": "DARK",
    "level": 4,
    "atk": 1700,
    "defense": 1650,
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6040&request_locale=en",
    "summary": "Pode valer por dois Tributos para Invocar por Tributo ou baixar um monstro de atributo DARK."
  },
  {
    "id": "92084010",
    "konamiId": 6120,
    "name": "Xarroco Barbudo",
    "englishName": "Unshaven Angler",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fish",
    "attribute": "WATER",
    "level": 4,
    "atk": 1500,
    "defense": 1600,
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6120&request_locale=en",
    "summary": "Pode valer por dois Tributos para Invocar por Tributo ou baixar um monstro de atributo WATER."
  },
  {
    "id": "38479725",
    "konamiId": 6121,
    "name": "O Cavalo de Troia",
    "englishName": "The Trojan Horse",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Beast",
    "attribute": "EARTH",
    "level": 4,
    "atk": 1600,
    "defense": 1200,
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6121&request_locale=en",
    "summary": "Pode valer por dois Tributos para Invocar por Tributo ou baixar um monstro de atributo EARTH."
  }
];
export const effects:Record<string,Effect>={
  "17444133": {
    "kind": "monsterEffect"
  },
  "38479725": {
    "kind": "monsterEffect"
  },
  "44436472": {
    "kind": "monsterEffect"
  },
  "92084010": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "17444133": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "doubleTribute",
        "attribute": "LIGHT"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "38479725": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "doubleTribute",
        "attribute": "EARTH"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "44436472": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "doubleTribute",
        "attribute": "DARK"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "92084010": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "doubleTribute",
        "attribute": "WATER"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  }
};
