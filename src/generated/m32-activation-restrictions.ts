import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "88975532",
    "konamiId": 6195,
    "name": "Lobo de Guerra Negro como Azeviche",
    "englishName": "Pitch-Black Warwolf",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Beast-Warrior",
    "attribute": "DARK",
    "level": 4,
    "atk": 1600,
    "defense": 600,
    "summary": "O oponente não pode ativar Cards de Armadilha durante a Fase de Batalha de qualquer jogador.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6195&request_locale=en"
  },
  {
    "id": "15960641",
    "konamiId": 6196,
    "name": "Dragão Miragem",
    "englishName": "Mirage Dragon",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Dragon",
    "attribute": "LIGHT",
    "level": 4,
    "atk": 1600,
    "defense": 600,
    "summary": "O oponente não pode ativar Cards de Armadilha durante a Fase de Batalha de qualquer jogador.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6196&request_locale=en"
  },
  {
    "id": "56647086",
    "konamiId": 5922,
    "name": "Invasor das Trevas",
    "englishName": "Invader of Darkness",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fiend",
    "attribute": "DARK",
    "level": 8,
    "atk": 2900,
    "defense": 2500,
    "summary": "O oponente não pode ativar Cards de Magia Rápida.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5922&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "15960641": {
    "kind": "monsterEffect"
  },
  "56647086": {
    "kind": "monsterEffect"
  },
  "88975532": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "15960641": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "preventActivation",
            "cardKind": "trap",
            "controller": "opponent",
            "window": "battle"
          }
        ]
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "56647086": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "preventActivation",
            "cardKind": "quickplay",
            "controller": "opponent",
            "window": "all"
          }
        ]
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "88975532": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "preventActivation",
            "cardKind": "trap",
            "controller": "opponent",
            "window": "battle"
          }
        ]
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  }
};
