import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';
export const cards:readonly Card[]=[
  {
    "id": "79759861",
    "konamiId": 4856,
    "name": "Tributo aos Condenados",
    "englishName": "Tribute to The Doomed",
    "kind": "spell",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4856&request_locale=en",
    "summary": "Descarte 1 carta; escolha 1 monstro no campo e destrua-o.",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null
  },
  {
    "id": "70231910",
    "konamiId": 5609,
    "name": "Núcleo Escuro",
    "englishName": "Dark Core",
    "kind": "spell",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5609&request_locale=en",
    "summary": "Descarte 1 carta; escolha 1 monstro com a face para cima e bana-o.",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null
  },
  {
    "id": "47453433",
    "konamiId": 6212,
    "name": "Regresso ao Início",
    "englishName": "Back to Square One",
    "kind": "spell",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6212&request_locale=en",
    "summary": "Descarte 1 carta; escolha 1 monstro e devolva-o ao topo do Deck do dono.",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null
  },
  {
    "id": "04178474",
    "konamiId": 5544,
    "name": "Fratura Raigeki",
    "englishName": "Raigeki Break",
    "kind": "trap",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5544&request_locale=en",
    "summary": "Descarte 1 carta; escolha 1 carta no campo e destrua-a.",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null
  },
  {
    "id": "13626450",
    "konamiId": 6216,
    "name": "Dispersão Maldosa",
    "englishName": "Malice Dispersion",
    "kind": "spell",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6216&request_locale=en",
    "summary": "Descarte 1 carta; destrua todas as Armadilhas Contínuas com a face para cima no campo.",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null
  },
  {
    "id": "01669772",
    "konamiId": 6225,
    "name": "Purificação de Magia",
    "englishName": "Spell Purification",
    "kind": "trap",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6225&request_locale=en",
    "summary": "Descarte 1 carta; destrua todas as Magias Contínuas com a face para cima no campo.",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null
  }
];
export const effects:Record<string,Effect>={
  "13626450": {
    "kind": "discardRemoval",
    "mode": "continuousTraps",
    "activation": {
      "speed": 2,
      "window": "free",
      "damage": "never"
    }
  },
  "47453433": {
    "kind": "discardRemoval",
    "mode": "deckTop",
    "activation": {
      "speed": 1,
      "window": "main",
      "damage": "never"
    }
  },
  "70231910": {
    "kind": "discardRemoval",
    "mode": "banishFaceUp",
    "activation": {
      "speed": 1,
      "window": "main",
      "damage": "never"
    }
  },
  "79759861": {
    "kind": "discardRemoval",
    "mode": "destroyMonster",
    "activation": {
      "speed": 1,
      "window": "main",
      "damage": "never"
    }
  },
  "04178474": {
    "kind": "discardRemoval",
    "mode": "destroyCard",
    "activation": {
      "speed": 2,
      "window": "free",
      "damage": "never"
    }
  },
  "01669772": {
    "kind": "discardRemoval",
    "mode": "continuousSpells",
    "activation": {
      "speed": 2,
      "window": "free",
      "damage": "never"
    }
  }
};
export const monsters:Record<string,MonsterDefinition>={};
