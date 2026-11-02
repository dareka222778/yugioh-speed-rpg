import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "94230224",
    "konamiId": 4496,
    "name": "Bola de Agulhas",
    "englishName": "Needle Ball",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fiend",
    "attribute": "DARK",
    "level": 2,
    "atk": 750,
    "defense": 700,
    "summary": "VIRAR: você pode pagar 2000 PV; cause 1000 de dano ao oponente.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4496&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "94230224": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "94230224": {
    "effect": {
      "trigger": "flip",
      "cost": {
        "kind": "lp",
        "amount": 2000
      },
      "operation": {
        "kind": "burn",
        "amount": 1000
      }
    },
    "activation": {
      "policy": "optional",
      "window": "flip"
    }
  }
};
