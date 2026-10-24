// Factual metadata imported by scripts/import_catalog.py. See CARD_SOURCES.md.
export type Card = { id:string; konamiId:number; name:string; englishName:string; kind:'monster'|'spell'|'trap'; race:string|null; attribute:string|null; level:number|null; atk:number|null; defense:number|null; summary:string; source:string; field?:boolean; fusion?:string[] };
export type StarterItem = { id:string; quantity:number };
export const cards: Card[] = [
  {
    "id": "91152256",
    "konamiId": 4047,
    "name": "Guardião Celta",
    "englishName": "Celtic Guardian",
    "kind": "monster",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 4,
    "atk": 1400,
    "defense": 1200,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4047&request_locale=pt"
  },
  {
    "id": "48305365",
    "konamiId": 4084,
    "name": "Predador com Machado",
    "englishName": "Axe Raider",
    "kind": "monster",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 4,
    "atk": 1700,
    "defense": 1150,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4084&request_locale=pt"
  },
  {
    "id": "55550921",
    "konamiId": 4106,
    "name": "Guerreiro Batalhador",
    "englishName": "Battle Warrior",
    "kind": "monster",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 3,
    "atk": 700,
    "defense": 1000,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4106&request_locale=pt"
  },
  {
    "id": "44287299",
    "konamiId": 4299,
    "name": "Masaki, o Espadachim Lendário",
    "englishName": "Masaki the Legendary Swordsman",
    "kind": "monster",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 4,
    "atk": 1100,
    "defense": 1100,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4299&request_locale=pt"
  },
  {
    "id": "00756652",
    "konamiId": 4201,
    "name": "Doron",
    "englishName": "Doron",
    "kind": "monster",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 2,
    "atk": 900,
    "defense": 500,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4201&request_locale=pt"
  },
  {
    "id": "03573512",
    "konamiId": 4759,
    "name": "Espadachim de Landstar",
    "englishName": "Swordsman of Landstar",
    "kind": "monster",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 3,
    "atk": 500,
    "defense": 1200,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4759&request_locale=pt"
  },
  {
    "id": "05053103",
    "konamiId": 4032,
    "name": "Touro Guerreiro",
    "englishName": "Battle Ox",
    "kind": "monster",
    "race": "Beast-Warrior",
    "attribute": "EARTH",
    "level": 4,
    "atk": 1700,
    "defense": 1000,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4032&request_locale=pt"
  },
  {
    "id": "48365709",
    "konamiId": 4133,
    "name": "Ansatsu",
    "englishName": "Ansatsu",
    "kind": "monster",
    "race": "Warrior",
    "attribute": "EARTH",
    "level": 5,
    "atk": 1700,
    "defense": 1200,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4133&request_locale=pt"
  },
  {
    "id": "93221206",
    "konamiId": 4439,
    "name": "Elfo Ancião",
    "englishName": "Ancient Elf",
    "kind": "monster",
    "race": "Spellcaster",
    "attribute": "LIGHT",
    "level": 4,
    "atk": 1450,
    "defense": 1200,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4439&request_locale=pt"
  },
  {
    "id": "15025844",
    "konamiId": 4008,
    "name": "Elfa Mística",
    "englishName": "Mystical Elf",
    "kind": "monster",
    "race": "Spellcaster",
    "attribute": "LIGHT",
    "level": 4,
    "atk": 800,
    "defense": 2000,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4008&request_locale=pt"
  },
  {
    "id": "91939608",
    "konamiId": 4050,
    "name": "Boneca Marota",
    "englishName": "Rogue Doll",
    "kind": "monster",
    "race": "Spellcaster",
    "attribute": "LIGHT",
    "level": 4,
    "atk": 1600,
    "defense": 1000,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4050&request_locale=pt"
  },
  {
    "id": "50930991",
    "konamiId": 4881,
    "name": "Neo, o Espadachim Mágico",
    "englishName": "Neo the Magic Swordsman",
    "kind": "monster",
    "race": "Spellcaster",
    "attribute": "LIGHT",
    "level": 4,
    "atk": 1700,
    "defense": 1000,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4881&request_locale=pt"
  },
  {
    "id": "49218300",
    "konamiId": 4884,
    "name": "Feiticeiro dos Condenados",
    "englishName": "Sorcerer of the Doomed",
    "kind": "monster",
    "race": "Spellcaster",
    "attribute": "DARK",
    "level": 4,
    "atk": 1450,
    "defense": 1200,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4884&request_locale=pt"
  },
  {
    "id": "75850803",
    "konamiId": 4134,
    "name": "LaMoon",
    "englishName": "LaMoon",
    "kind": "monster",
    "race": "Spellcaster",
    "attribute": "LIGHT",
    "level": 5,
    "atk": 1200,
    "defense": 1700,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4134&request_locale=pt"
  },
  {
    "id": "17358176",
    "konamiId": 4618,
    "name": "Lady da Fé",
    "englishName": "Lady of Faith",
    "kind": "monster",
    "race": "Spellcaster",
    "attribute": "LIGHT",
    "level": 3,
    "atk": 1100,
    "defense": 800,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4618&request_locale=pt"
  },
  {
    "id": "28546905",
    "konamiId": 4048,
    "name": "Ilusionista Sem Rosto",
    "englishName": "Illusionist Faceless Mage",
    "kind": "monster",
    "race": "Spellcaster",
    "attribute": "DARK",
    "level": 5,
    "atk": 1200,
    "defense": 2200,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4048&request_locale=pt"
  },
  {
    "id": "88819587",
    "konamiId": 4010,
    "name": "Dragão Filhote",
    "englishName": "Baby Dragon",
    "kind": "monster",
    "race": "Dragon",
    "attribute": "WIND",
    "level": 3,
    "atk": 1200,
    "defense": 700,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4010&request_locale=pt"
  },
  {
    "id": "75356564",
    "konamiId": 4206,
    "name": "Pequeno Dragão",
    "englishName": "Petit Dragon",
    "kind": "monster",
    "race": "Dragon",
    "attribute": "WIND",
    "level": 2,
    "atk": 600,
    "defense": 700,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4206&request_locale=pt"
  },
  {
    "id": "87796900",
    "konamiId": 4013,
    "name": "Dragão Alado, Guardião da Fortaleza No1",
    "englishName": "Winged Dragon, Guardian of the Fortress #1",
    "kind": "monster",
    "race": "Dragon",
    "attribute": "WIND",
    "level": 4,
    "atk": 1400,
    "defense": 1200,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4013&request_locale=pt"
  },
  {
    "id": "55444629",
    "konamiId": 4567,
    "name": "Dragão Inferior",
    "englishName": "Lesser Dragon",
    "kind": "monster",
    "race": "Dragon",
    "attribute": "WIND",
    "level": 4,
    "atk": 1200,
    "defense": 1000,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4567&request_locale=pt"
  },
  {
    "id": "67494157",
    "konamiId": 4100,
    "name": "Dragão Rastejante",
    "englishName": "Crawling Dragon",
    "kind": "monster",
    "race": "Dragon",
    "attribute": "EARTH",
    "level": 5,
    "atk": 1600,
    "defense": 1400,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4100&request_locale=pt"
  },
  {
    "id": "28279543",
    "konamiId": 4045,
    "name": "Maldição do Dragão",
    "englishName": "Curse of Dragon",
    "kind": "monster",
    "race": "Dragon",
    "attribute": "DARK",
    "level": 5,
    "atk": 2000,
    "defense": 1500,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4045&request_locale=pt"
  },
  {
    "id": "67724379",
    "konamiId": 4037,
    "name": "Dragão Koumori",
    "englishName": "Koumori Dragon",
    "kind": "monster",
    "race": "Dragon",
    "attribute": "DARK",
    "level": 4,
    "atk": 1500,
    "defense": 1200,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4037&request_locale=pt"
  },
  {
    "id": "33064647",
    "konamiId": 4302,
    "name": "Dragão Escudo de Um Só Olho",
    "englishName": "One-Eyed Shield Dragon",
    "kind": "monster",
    "race": "Dragon",
    "attribute": "WIND",
    "level": 3,
    "atk": 700,
    "defense": 1300,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4302&request_locale=pt"
  },
  {
    "id": "38199696",
    "konamiId": 4345,
    "name": "Remédio Vermelho",
    "englishName": "Red Medicine",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Recuperação de pontos de vida.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4345&request_locale=pt"
  },
  {
    "id": "66788016",
    "konamiId": 4835,
    "name": "Fissura",
    "englishName": "Fissure",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Remoção de monstro do adversário.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4835&request_locale=pt"
  },
  {
    "id": "17814387",
    "konamiId": 4849,
    "name": "Reforços",
    "englishName": "Reinforcements",
    "kind": "trap",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Reforço temporário de ataque.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4849&request_locale=pt"
  },
  {
    "id": "44209392",
    "konamiId": 4850,
    "name": "Muralhas do Castelo",
    "englishName": "Castle Walls",
    "kind": "trap",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Reforço temporário de defesa.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4850&request_locale=pt"
  },
  {
    "id": "86318356",
    "konamiId": 4339,
    "name": "Sogen",
    "englishName": "Sogen",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Magia de Campo: Guerreiros e Bestas-Guerreiras ganham 200 ATK/DEF.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4339&request_locale=pt",
    "field": true
  },
  {
    "id": "45231177",
    "konamiId": 4021,
    "name": "Espadachim das Chamas",
    "englishName": "Flame Swordsman",
    "kind": "monster",
    "race": "Warrior",
    "attribute": "FIRE",
    "level": 5,
    "atk": 1800,
    "defense": 1600,
    "summary": "Fusão: Manipulador de Chamas + Masaki, o Espadachim Lendário.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4021&request_locale=pt",
    "fusion": [
      "34460851",
      "44287299"
    ]
  },
  {
    "id": "34460851",
    "konamiId": 4148,
    "name": "Manipulador de Chamas",
    "englishName": "Flame Manipulator",
    "kind": "monster",
    "race": "Spellcaster",
    "attribute": "FIRE",
    "level": 3,
    "atk": 900,
    "defense": 1000,
    "summary": "Monstro Normal: sem efeito.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4148&request_locale=pt"
  },
  {
    "id": "24094653",
    "konamiId": 4837,
    "name": "Polimerização",
    "englishName": "Polymerization",
    "kind": "spell",
    "race": null,
    "attribute": null,
    "level": null,
    "atk": null,
    "defense": null,
    "summary": "Fusão de monstros usando materiais da mão ou do campo.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4837&request_locale=pt"
  },
  {
    "id": "89631139",
    "konamiId": 4007,
    "name": "Dragão Branco de Olhos Azuis",
    "englishName": "Blue-Eyes White Dragon",
    "kind": "monster",
    "race": "Dragon",
    "attribute": "LIGHT",
    "level": 8,
    "atk": 3000,
    "defense": 2500,
    "summary": "Monstro Normal: sem efeito. Exige 2 tributos na Invocação-Normal.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4007&request_locale=pt"
  },
  {
    "id": "46986414",
    "konamiId": 4041,
    "name": "Mago Negro",
    "englishName": "Dark Magician",
    "kind": "monster",
    "race": "Spellcaster",
    "attribute": "DARK",
    "level": 7,
    "atk": 2500,
    "defense": 2100,
    "summary": "Monstro Normal: sem efeito. Exige 2 tributos na Invocação-Normal.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4041&request_locale=pt"
  },
  {
    "id": "74677422",
    "konamiId": 4088,
    "name": "Dragão Negro de Olhos Vermelhos",
    "englishName": "Red-Eyes Black Dragon",
    "kind": "monster",
    "race": "Dragon",
    "attribute": "DARK",
    "level": 7,
    "atk": 2400,
    "defense": 2000,
    "summary": "Monstro Normal: sem efeito. Exige 2 tributos na Invocação-Normal.",
    "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4088&request_locale=pt"
  }
];
export const starterContents: Record<string, StarterItem[]> = {
  "warrior": [
    {
      "id": "91152256",
      "quantity": 2
    },
    {
      "id": "48305365",
      "quantity": 2
    },
    {
      "id": "55550921",
      "quantity": 2
    },
    {
      "id": "44287299",
      "quantity": 2
    },
    {
      "id": "00756652",
      "quantity": 2
    },
    {
      "id": "03573512",
      "quantity": 2
    },
    {
      "id": "05053103",
      "quantity": 2
    },
    {
      "id": "48365709",
      "quantity": 2
    },
    {
      "id": "38199696",
      "quantity": 1
    },
    {
      "id": "66788016",
      "quantity": 1
    },
    {
      "id": "17814387",
      "quantity": 1
    },
    {
      "id": "44209392",
      "quantity": 1
    }
  ],
  "spellcaster": [
    {
      "id": "93221206",
      "quantity": 2
    },
    {
      "id": "15025844",
      "quantity": 2
    },
    {
      "id": "91939608",
      "quantity": 2
    },
    {
      "id": "50930991",
      "quantity": 2
    },
    {
      "id": "49218300",
      "quantity": 2
    },
    {
      "id": "75850803",
      "quantity": 2
    },
    {
      "id": "17358176",
      "quantity": 2
    },
    {
      "id": "28546905",
      "quantity": 2
    },
    {
      "id": "38199696",
      "quantity": 1
    },
    {
      "id": "66788016",
      "quantity": 1
    },
    {
      "id": "17814387",
      "quantity": 1
    },
    {
      "id": "44209392",
      "quantity": 1
    }
  ],
  "dragon": [
    {
      "id": "88819587",
      "quantity": 2
    },
    {
      "id": "75356564",
      "quantity": 2
    },
    {
      "id": "87796900",
      "quantity": 2
    },
    {
      "id": "55444629",
      "quantity": 2
    },
    {
      "id": "67494157",
      "quantity": 2
    },
    {
      "id": "28279543",
      "quantity": 2
    },
    {
      "id": "67724379",
      "quantity": 2
    },
    {
      "id": "33064647",
      "quantity": 2
    },
    {
      "id": "38199696",
      "quantity": 1
    },
    {
      "id": "66788016",
      "quantity": 1
    },
    {
      "id": "17814387",
      "quantity": 1
    },
    {
      "id": "44209392",
      "quantity": 1
    }
  ]
};
