import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "43250041",
    "konamiId": 5994,
    "name": "Escudo Drenador",
    "englishName": "Draining Shield",
    "kind": "trap",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5994&request_locale=en",
    "summary": "Negue o ataque declarado por um oponente e, se ele for negado, ganhe PV iguais ao ATK atual do atacante.",
    "level": null,
    "atk": null,
    "defense": null,
    "race": null,
    "attribute": null
  },
  {
    "id": "94192409",
    "konamiId": 5914,
    "name": "Aparelho de Evacuação Obrigatória",
    "englishName": "Compulsory Evacuation Device",
    "kind": "trap",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5914&request_locale=en",
    "summary": "Escolha um monstro de qualquer lado; devolva-o à mão do dono. Monstros do Deck Adicional voltam para lá.",
    "level": null,
    "atk": null,
    "defense": null,
    "race": null,
    "attribute": null
  },
  {
    "id": "00596051",
    "konamiId": 4912,
    "name": "Presa de Serpente",
    "englishName": "Snake Fang",
    "kind": "trap",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4912&request_locale=en",
    "summary": "Escolha um monstro com a face para cima; ele perde 500 DEF até o fim deste turno.",
    "level": null,
    "atk": null,
    "defense": null,
    "race": null,
    "attribute": null
  },
  {
    "id": "57882509",
    "konamiId": 5102,
    "name": "Máscara da Fraqueza",
    "englishName": "Mask of Weakness",
    "kind": "trap",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5102&request_locale=en",
    "summary": "Escolha um monstro que esteja atacando; ele perde 700 ATK até o fim deste turno.",
    "level": null,
    "atk": null,
    "defense": null,
    "race": null,
    "attribute": null
  },
  {
    "id": "56916805",
    "konamiId": 5859,
    "name": "Escoar Energia",
    "englishName": "Energy Drain",
    "kind": "trap",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5859&request_locale=en",
    "summary": "Escolha um monstro seu com a face para cima. Ele ganha 200 ATK e DEF por carta que o oponente tiver na mão na resolução, até o fim do turno.",
    "level": null,
    "atk": null,
    "defense": null,
    "race": null,
    "attribute": null
  }
];
export const effects:Record<string,Effect>={
  "43250041": {
    "kind": "attackResponse",
    "activation": {
      "speed": 2,
      "window": "attackDeclared",
      "damage": "never",
      "opponentOnly": true
    },
    "endBattle": false,
    "reflectAttack": false,
    "gainAttack": true
  },
  "56916805": {
    "kind": "fieldTrap",
    "mode": "handBoost"
  },
  "57882509": {
    "kind": "fieldTrap",
    "mode": "reduceAttacker"
  },
  "94192409": {
    "kind": "fieldTrap",
    "mode": "returnHand"
  },
  "00596051": {
    "kind": "fieldTrap",
    "mode": "reduceDefense"
  }
};
export const monsters:Record<string,MonsterDefinition>={};
