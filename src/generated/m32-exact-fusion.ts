import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "40173854",
    "konamiId": 4645,
    "name": "Bugroth Anfíbio",
    "englishName": "Amphibious Bugroth",
    "kind": "monster",
    "monsterType": "fusion",
    "race": "Aqua",
    "attribute": "WATER",
    "level": 5,
    "atk": 1850,
    "defense": 1300,
    "summary": "Fusão: Bugroth de Ataque Terrestre + Sentinela dos Mares; sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4645&request_locale=en",
    "fusion": [
      "58314394",
      "85448931"
    ]
  }
];
export const effects:Record<string,Effect>={
  "40173854": {
    "kind": "fusion"
  }
};
export const monsters:Record<string,MonsterDefinition>={};
