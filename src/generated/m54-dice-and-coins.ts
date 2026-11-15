import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "74137509",
    "konamiId": 4815,
    "name": "Dado Gracioso",
    "englishName": "Graceful Dice",
    "kind": "spell",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4815&request_locale=en",
    "summary": "Seus monstros com a face para cima ganham ATK e DEF iguais a um único resultado de dado × 100 até o fim do turno.",
    "level": null,
    "atk": null,
    "defense": null,
    "race": null,
    "attribute": null
  },
  {
    "id": "00126218",
    "konamiId": 4816,
    "name": "Dado Caveira",
    "englishName": "Skull Dice",
    "kind": "trap",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4816&request_locale=en",
    "summary": "Os monstros adversários com a face para cima perdem ATK e DEF iguais a um único resultado de dado × 100 até o fim do turno.",
    "level": null,
    "atk": null,
    "defense": null,
    "race": null,
    "attribute": null
  },
  {
    "id": "03549275",
    "konamiId": 5424,
    "name": "Jarro de Dados",
    "englishName": "Dice Jar",
    "kind": "monster",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5424&request_locale=en",
    "summary": "VIRE: ambos rolam um dado. Empates repetem os dois dados. Quem perder recebe o maior resultado × 500 de dano; se o maior for 6, recebe 6000.",
    "level": 3,
    "atk": 200,
    "defense": 300,
    "race": "Rock",
    "attribute": "LIGHT",
    "monsterType": "effect"
  },
  {
    "id": "50593156",
    "konamiId": 6031,
    "name": "Jogador de Areia",
    "englishName": "Sand Gambler",
    "kind": "monster",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6031&request_locale=en",
    "summary": "Uma vez por turno, na Fase Principal: lance três moedas. Três caras destroem todos os monstros do oponente; três coroas destroem todos os seus. Resultados mistos não destroem monstros.",
    "level": 3,
    "atk": 300,
    "defense": 1600,
    "race": "Spellcaster",
    "attribute": "LIGHT",
    "monsterType": "effect"
  }
];
export const effects:Record<string,Effect>={
  "50593156": {
    "kind": "monsterEffect"
  },
  "74137509": {
    "kind": "statDie",
    "side": "allies"
  },
  "00126218": {
    "kind": "statDie",
    "side": "enemies"
  },
  "03549275": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "50593156": {
    "effect": {
      "trigger": "ignition",
      "operation": {
        "kind": "threeCoins"
      },
      "oncePerTurn": true
    },
    "activation": {
      "policy": "manual",
      "window": "main"
    }
  },
  "03549275": {
    "effect": {
      "trigger": "flip",
      "operation": {
        "kind": "diceContest"
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "flip"
    }
  }
};
