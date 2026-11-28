import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
export const ritualExtensions22:readonly Card[]=[
  {
    "id": "54351224",
    "konamiId": 6139,
    "name": "Arma de Ritual",
    "englishName": "Ritual Weapon",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Equipe apenas a um monstro de Ritual de Nível 6 ou menor: ele ganha 1500 ATK/DEF.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6139&request_locale=en"
  },
  {
    "id": "59820352",
    "konamiId": 5910,
    "name": "Cântico da Terra",
    "englishName": "Earth Chant",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Invoque por Ritual da mão um monstro de TERRA, usando Tributos da mão/campo com Níveis exatamente iguais.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5910&request_locale=en"
  },
  {
    "id": "69035382",
    "konamiId": 5784,
    "name": "Contrato com o Abismo",
    "englishName": "Contract with the Abyss",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Invoque por Ritual da mão um monstro de TREVAS, usando Tributos da mão/campo com Níveis exatamente iguais.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5784&request_locale=en"
  }
];
export const ritualExtensionEffects22:Record<string,Effect>={
  "54351224": {
    "kind": "equip",
    "monsterType": "ritual",
    "maxLevel": 6,
    "atk": 1500,
    "def": 1500
  },
  "59820352": {
    "kind": "ritualSummon",
    "ritual": {
      "attribute": "EARTH",
      "exact": true
    }
  },
  "69035382": {
    "kind": "ritualSummon",
    "ritual": {
      "attribute": "DARK",
      "exact": true
    }
  }
};
