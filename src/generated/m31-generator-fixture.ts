import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "84257639",
    "konamiId": 4348,
    "name": "Dian Keto, Mestre da Cura",
    "englishName": "Dian Keto the Cure Master",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Consulte as regras oficiais e o relatório de suporte do motor.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4348&request_locale=pt"
  }
];
export const effects:Record<string,Effect>={
  "84257639": {
    "kind": "heal",
    "amount": 1000
  }
};
export const monsters:Record<string,MonsterDefinition>={};
