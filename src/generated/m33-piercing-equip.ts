import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "97687912",
    "konamiId": 5128,
    "name": "Queda do Meteoro Angelical",
    "englishName": "Fairy Meteor Crush",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Equipe a um monstro com a face para cima. Quando ele atacar um monstro em Defesa, cause ao oponente dano de batalha perfurante.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5128&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "97687912": {
    "kind": "equip",
    "atk": 0,
    "def": 0,
    "combat": [
      {
        "kind": "piercing"
      }
    ]
  }
};
export const monsters:Record<string,MonsterDefinition>={};
