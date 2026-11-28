import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "89112729",
    "konamiId": 4514,
    "name": "Ciber Saurus",
    "englishName": "Cyber Saurus",
    "kind": "monster",
    "monsterType": "fusion",
    "race": "Machine",
    "attribute": "EARTH",
    "level": 5,
    "atk": 1800,
    "defense": 1400,
    "summary": "Fusão de Blast Juggler + Two-Headed King Rex. Monstro de Fusão sem efeito; exige os materiais nomeados ou um único substituto legal.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4514&request_locale=en",
    "fusion": [
      "70138455",
      "94119974"
    ],
    "excludedArchetypes": [
      "Cyber"
    ]
  },
  {
    "id": "02504891",
    "konamiId": 4713,
    "name": "Cavaleiro Caveira",
    "englishName": "Skull Knight",
    "kind": "monster",
    "monsterType": "fusion",
    "race": "Spellcaster",
    "attribute": "DARK",
    "level": 7,
    "atk": 2650,
    "defense": 2250,
    "summary": "Fusão de Tainted Wisdom + Ancient Brain. Monstro de Fusão sem efeito; exige os materiais nomeados ou um único substituto legal.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4713&request_locale=en",
    "fusion": [
      "28725004",
      "42431843"
    ]
  },
  {
    "id": "27134689",
    "konamiId": 6127,
    "name": "Mestre de Oz",
    "englishName": "Master of Oz",
    "kind": "monster",
    "monsterType": "fusion",
    "race": "Beast",
    "attribute": "EARTH",
    "level": 9,
    "atk": 4200,
    "defense": 3700,
    "summary": "Fusão de Big Koala + Des Kangaroo. Monstro de Fusão sem efeito; exige os materiais nomeados ou um único substituto legal.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6127&request_locale=en",
    "fusion": [
      "42129512",
      "78613627"
    ]
  },
  {
    "id": "86164529",
    "konamiId": 4448,
    "name": "Aqua Dragon",
    "englishName": "Aqua Dragon",
    "kind": "monster",
    "monsterType": "fusion",
    "race": "Sea Serpent",
    "attribute": "WATER",
    "level": 6,
    "atk": 2250,
    "defense": 1900,
    "summary": "Fusão de Fairy Dragon + Amazon of the Seas + Zone Eater. Monstro de Fusão sem efeito; exige os materiais nomeados ou um único substituto legal.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4448&request_locale=en",
    "fusion": [
      "20315854",
      "17968114",
      "86100785"
    ]
  },
  {
    "id": "41462083",
    "konamiId": 4075,
    "name": "Dragão Milenar",
    "englishName": "Thousand Dragon",
    "kind": "monster",
    "monsterType": "fusion",
    "race": "Dragon",
    "attribute": "WIND",
    "level": 7,
    "atk": 2400,
    "defense": 2000,
    "summary": "Fusão de Time Wizard + Baby Dragon. Monstro de Fusão sem efeito; exige os materiais nomeados ou um único substituto legal.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4075&request_locale=en",
    "fusion": [
      "71625222",
      "88819587"
    ]
  }
];
export const effects:Record<string,Effect>={
  "27134689": {
    "kind": "fusion"
  },
  "41462083": {
    "kind": "fusion"
  },
  "86164529": {
    "kind": "fusion"
  },
  "89112729": {
    "kind": "fusion"
  },
  "02504891": {
    "kind": "fusion"
  }
};
export const monsters:Record<string,MonsterDefinition>={};
