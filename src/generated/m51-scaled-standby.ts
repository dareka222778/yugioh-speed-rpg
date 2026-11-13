import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "81383947",
    "konamiId": 5975,
    "name": "Mágico Branco Pikeru",
    "englishName": "White Magician Pikeru",
    "kind": "monster",
    "monsterType": "effect",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5975&request_locale=en",
    "level": 2,
    "atk": 1200,
    "defense": 0,
    "race": "Spellcaster",
    "attribute": "LIGHT",
    "summary": "Ganhe 400 PV para cada monstro que você controla, incluindo os que estiverem com a face para baixo."
  }
];
export const effects:Record<string,Effect>={
  "81383947": {
    "kind": "monsterEffect"
  }
};
export const monsters:Record<string,MonsterDefinition>={
  "81383947": {
    "effect": {
      "trigger": "ownStandby",
      "standby": {
        "zone": "monsters",
        "requireSourceAtResolution": false
      },
      "operation": {
        "kind": "healPerControlledMonster",
        "amount": 400
      }
    },
    "activation": {
      "policy": "mandatory",
      "window": "standby"
    }
  }
};
