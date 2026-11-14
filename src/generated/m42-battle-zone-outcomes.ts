import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "37043180",
    "konamiId": 4262,
    "name": "Guerreiro D.D.",
    "englishName": "D.D. Warrior",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 4,
    "atk": 1200,
    "defense": 1000,
    "summary": "Quando batalha outro monstro, após cálculo de dano, bane ambos para as zonas dos donos.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4262&ope=2&request_locale=ja"
  },
  {
    "id": "25773409",
    "konamiId": 5961,
    "name": "O Lendário Mestre de Jujitsu",
    "englishName": "Legendary Jujitsu Master",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Rock",
    "attribute": "EARTH",
    "level": 3,
    "atk": 1300,
    "defense": 1800,
    "summary": "Quando este monstro em Defesa batalha, devolve o monstro adversário ao topo do Deck de seu dono no fim da Etapa de Dano.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=5961&ope=2&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "25773409": {
    "kind": "monsterEffect"
  },
  "37043180": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "25773409": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "battleTopDeckAttacker"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "37043180": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "battleBanishBoth"
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  }
};
