import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "53693416",
    "konamiId": 6191,
    "name": "Olho de Águia",
    "englishName": "Eagle Eye",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Winged Beast",
    "attribute": "WIND",
    "level": 3,
    "atk": 1300,
    "defense": 1200,
    "summary": "Quando este monstro é Invocado por Invocação-Normal, nenhum jogador pode ativar Armadilhas em resposta a essa Invocação.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6191&request_locale=en"
  },
  {
    "id": "52571838",
    "konamiId": 6194,
    "name": "Arraia da Destruição",
    "englishName": "Creeping Doom Manta",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fish",
    "attribute": "WATER",
    "level": 3,
    "atk": 1300,
    "defense": 1200,
    "summary": "Quando este monstro é Invocado por Invocação-Normal, nenhum jogador pode ativar Armadilhas em resposta a essa Invocação.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6194&request_locale=en"
  },
  {
    "id": "26082229",
    "konamiId": 6193,
    "name": "Invasão das Chamas",
    "englishName": "Invasion of Flames",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Pyro",
    "attribute": "FIRE",
    "level": 3,
    "atk": 1300,
    "defense": 1200,
    "summary": "Quando este monstro é Invocado por Invocação-Normal, nenhum jogador pode ativar Armadilhas em resposta a essa Invocação.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6193&request_locale=en"
  },
  {
    "id": "89698120",
    "konamiId": 6192,
    "name": "Especialista em Espionagem Tática",
    "englishName": "Tactical Espionage Expert",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 3,
    "atk": 1300,
    "defense": 1200,
    "summary": "Quando este monstro é Invocado por Invocação-Normal, nenhum jogador pode ativar Armadilhas em resposta a essa Invocação.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6192&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "26082229": {
    "kind": "monsterEffect"
  },
  "52571838": {
    "kind": "monsterEffect"
  },
  "53693416": {
    "kind": "monsterEffect"
  },
  "89698120": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "26082229": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "preventActivation",
            "cardKind": "trap",
            "controller": "both",
            "window": "ownNormalSummon"
          }
        ]
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "52571838": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "preventActivation",
            "cardKind": "trap",
            "controller": "both",
            "window": "ownNormalSummon"
          }
        ]
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "53693416": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "preventActivation",
            "cardKind": "trap",
            "controller": "both",
            "window": "ownNormalSummon"
          }
        ]
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "89698120": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "continuous",
        "rules": [
          {
            "kind": "preventActivation",
            "cardKind": "trap",
            "controller": "both",
            "window": "ownNormalSummon"
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
