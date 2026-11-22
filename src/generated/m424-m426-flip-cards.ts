import type {Card} from '../cardCatalog';

/**
 * M427 metadata delta for the two M426 cards not yet represented in cardMetadata.
 * The five M424/M425 identities already exist in m31-target-groups / mechanicalBatch7;
 * they are deliberately not duplicated here.
 */
export const cards:readonly Card[]=[
  {
    id:"15383415",
    konamiId:5418,
    name:"Swarm of Scarabs",
    englishName:"Swarm of Scarabs",
    kind:"monster",
    monsterType:"effect",
    race:"Insect",
    attribute:"DARK",
    level:3,
    atk:500,
    defense:1000,
    summary:"Uma vez por turno: você pode colocar esta carta em Posição de Defesa com a face para baixo. Se esta carta for Invocada por Virar: escolha 1 monstro que seu oponente controla; destrua-o.",
    source:"https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5418&request_locale=ja"
  },
  {
    id:"41872150",
    konamiId:5419,
    name:"Swarm of Locusts",
    englishName:"Swarm of Locusts",
    kind:"monster",
    monsterType:"effect",
    race:"Insect",
    attribute:"DARK",
    level:3,
    atk:1000,
    defense:500,
    summary:"Uma vez por turno: você pode colocar esta carta em Posição de Defesa com a face para baixo. Se esta carta for Invocada por Virar: escolha 1 Magia/Armadilha que seu oponente controla; destrua-a.",
    source:"https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5419&request_locale=ja"
  }
];
