import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "88236094",
    "konamiId": 6026,
    "name": "Aparição de Aswan",
    "englishName": "Aswan Apparition",
    "kind": "monster",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6026&request_locale=en",
    "summary": "Ao causar dano de batalha ao oponente, você pode escolher 1 Armadilha no seu Cemitério e colocá-la no topo do Deck.",
    "level": 3,
    "atk": 500,
    "defense": 500,
    "race": "Fiend",
    "attribute": "DARK",
    "monsterType": "effect"
  },
  {
    "id": "51616747",
    "konamiId": 6028,
    "name": "Guardião Nubian",
    "englishName": "Nubian Guard",
    "kind": "monster",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6028&request_locale=en",
    "summary": "Ao causar dano de batalha ao oponente, você pode escolher 1 Magia Contínua no seu Cemitério e colocá-la no topo do Deck.",
    "level": 2,
    "atk": 500,
    "defense": 500,
    "race": "Warrior",
    "attribute": "FIRE",
    "monsterType": "effect"
  }
];
export const effects:Record<string,Effect>={
  "51616747": {
    "kind": "monsterEffect"
  },
  "88236094": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "51616747": {
    "effect": {
      "trigger": "onBattleDamage",
      "operation": {
        "kind": "battleRecovery",
        "category": "continuousSpell"
      }
    },
    "activation": {
      "policy": "optional",
      "window": "battleDamage"
    }
  },
  "88236094": {
    "effect": {
      "trigger": "onBattleDamage",
      "operation": {
        "kind": "battleRecovery",
        "category": "trap"
      }
    },
    "activation": {
      "policy": "optional",
      "window": "battleDamage"
    }
  }
};
