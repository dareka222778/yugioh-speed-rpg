import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "57281778",
    "konamiId": 5902,
    "name": "Ryu Kokki",
    "englishName": "Ryu Kokki",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Zombie",
    "attribute": "DARK",
    "level": 6,
    "atk": 2400,
    "defense": 2000,
    "summary": "No fim da Etapa de Dano, destrói o monstro enfrentado se for do Tipo Warrior ou Spellcaster.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=5902&ope=2&request_locale=en"
  },
  {
    "id": "21887179",
    "konamiId": 5901,
    "name": "Getsu Fuhma",
    "englishName": "Getsu Fuhma",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Warrior",
    "attribute": "DARK",
    "level": 4,
    "atk": 1700,
    "defense": 1200,
    "summary": "No fim da Etapa de Dano, destrói o monstro enfrentado se for do Tipo Fiend ou Zombie.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=5901&ope=2&request_locale=en"
  },
  {
    "id": "45688586",
    "konamiId": 4416,
    "name": "Aranha Mecânica",
    "englishName": "Karakuri Spider",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Machine",
    "attribute": "EARTH",
    "level": 2,
    "atk": 400,
    "defense": 500,
    "summary": "Após o cálculo de dano, se atacar um monstro TREVAS, destrua o alvo do ataque.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4416&ope=2&request_locale=ja"
  }
];
export const effects:Record<string,Effect>={
  "21887179": {
    "kind": "monsterEffect"
  },
  "45688586": {
    "kind": "monsterEffect"
  },
  "57281778": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "21887179": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "battleDestroyByIdentity",
        "races": [
          "Fiend",
          "Zombie"
        ]
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "45688586": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "battleDestroyByIdentity",
        "attributes": [
          "DARK"
        ],
        "attackingOnly": true
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  },
  "57281778": {
    "effect": {
      "trigger": "continuous",
      "operation": {
        "kind": "battleDestroyByIdentity",
        "races": [
          "Warrior",
          "Spellcaster"
        ]
      }
    },
    "activation": {
      "policy": "continuous",
      "window": "continuous"
    }
  }
};
