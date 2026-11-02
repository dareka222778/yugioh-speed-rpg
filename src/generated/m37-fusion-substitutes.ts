import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "53493204",
    "konamiId": 4115,
    "name": "Deusa com o Terceiro Olho",
    "englishName": "Goddess with the Third Eye",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fairy",
    "attribute": "LIGHT",
    "level": 4,
    "atk": 1200,
    "defense": 1000,
    "summary": "Pode substituir 1 Material de Fusão nomeado; todos os outros Materiais de Fusão devem ser os corretos.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4115&request_locale=en"
  },
  {
    "id": "50259460",
    "konamiId": 4275,
    "name": "Versago, o Destruidor",
    "englishName": "Versago the Destroyer",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fiend",
    "attribute": "DARK",
    "level": 3,
    "atk": 1100,
    "defense": 900,
    "summary": "Pode substituir 1 Material de Fusão nomeado; todos os outros Materiais de Fusão devem ser os corretos.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4275&request_locale=en"
  },
  {
    "id": "99426834",
    "konamiId": 4264,
    "name": "Beastking of the Swamps",
    "englishName": "Beastking of the Swamps",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Aqua",
    "attribute": "WATER",
    "level": 4,
    "atk": 1000,
    "defense": 1100,
    "summary": "Pode substituir 1 Material de Fusão nomeado; todos os outros Materiais de Fusão devem ser os corretos.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4264&request_locale=en"
  },
  {
    "id": "30451366",
    "konamiId": 4648,
    "name": "Mystical Sheep #1",
    "englishName": "Mystical Sheep #1",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Beast",
    "attribute": "EARTH",
    "level": 3,
    "atk": 1150,
    "defense": 900,
    "summary": "Pode substituir 1 Material de Fusão nomeado; todos os outros Materiais de Fusão devem ser os corretos.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4648&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "30451366": {
    "kind": "monsterEffect"
  },
  "50259460": {
    "kind": "monsterEffect"
  },
  "53493204": {
    "kind": "monsterEffect"
  },
  "99426834": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "30451366": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "fusionSubstitute"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "50259460": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "fusionSubstitute"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "53493204": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "fusionSubstitute"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "99426834": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "fusionSubstitute"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  }
};
