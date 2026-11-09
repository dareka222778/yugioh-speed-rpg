import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "31786629",
    "konamiId": 4431,
    "name": "Dragão do Trovão",
    "englishName": "Thunder Dragon",
    "kind": "monster",
    "monsterType": "effect",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4431&request_locale=en",
    "level": 5,
    "atk": 1600,
    "defense": 1500,
    "race": "Thunder",
    "attribute": "LIGHT",
    "summary": "Descarte esta carta da mão. Na resolução, adicione à mão 1 ou 2 Dragões do Trovão do seu Deck e embaralhe."
  },
  {
    "id": "54752875",
    "konamiId": 4619,
    "name": "Dragão do Trovão de Duas Cabeças",
    "englishName": "Twin-Headed Thunder Dragon",
    "kind": "monster",
    "monsterType": "fusion",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4619&request_locale=en",
    "level": 7,
    "atk": 2800,
    "defense": 2100,
    "race": "Thunder",
    "attribute": "LIGHT",
    "fusion": [
      "31786629",
      "31786629"
    ],
    "summary": "Fusão de dois Dragões do Trovão. Não possui efeito."
  }
];
export const effects:Record<string,Effect>={
  "31786629": {
    "kind": "monsterEffect"
  },
  "54752875": {
    "kind": "fusion"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "31786629": {
    "effect": {
      "trigger": "ignition",
      "cost": {
        "kind": "discard",
        "count": 1
      },
      "operation": {
        "kind": "searchCopiesFromHand"
      }
    },
    "activation": {
      "policy": "manual",
      "window": "main"
    }
  }
};
