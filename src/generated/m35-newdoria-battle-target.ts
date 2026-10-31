import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "04335645",
    "konamiId": 5484,
    "name": "Newdoria",
    "englishName": "Newdoria",
    "kind": "monster",
    "monsterType": "effect",
    "race": "Fiend",
    "attribute": "DARK",
    "level": 4,
    "atk": 1200,
    "defense": 800,
    "summary": "Se for destruído por batalha e enviado ao Cemitério: escolha 1 monstro no campo como alvo; destrua-o.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5484&request_locale=en"
  }
];
export const effects:Record<string,Effect>={
  "04335645": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "04335645": {
    "effect": {
      "trigger": "onBattleDestroyed",
      "operation": {
        "kind": "singleCard",
        "rule": {
          "from": "monsters",
          "controller": "both",
          "action": "destroy",
          "kind": "monster"
        }
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "battleDestroyed"
    }
  }
};
