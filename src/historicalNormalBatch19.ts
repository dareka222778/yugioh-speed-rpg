/** Mission 19 / packet P001: the last two independently checked normal monsters.
 * Data-only; no changes to v8 mechanics or to distribution rights.
 */
import type {Card} from './cardCatalog';

export const historicalNormalBatch19:readonly Card[]=[
 {
  id:'68638985',konamiId:4555,name:'Rã Limo',englishName:'Slime Toad',
  kind:'monster',monsterType:'normal',race:'Aqua',attribute:'WATER',level:2,atk:700,defense:500,
  summary:'Monstro Normal: sem efeito. Nome atual: Rã Limo (antigo Frog the Jam).',
  source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4555&request_locale=pt'
 },
 {
  id:'14898066',konamiId:5004,name:'Ginete Vorse',englishName:'Vorse Raider',
  kind:'monster',monsterType:'normal',race:'Beast-Warrior',attribute:'DARK',level:4,atk:1900,defense:1200,
  summary:'Monstro Normal: sem efeito. A segunda senha histórica identifica a mesma carta, não uma carta adicional.',
  source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5004&request_locale=pt'
 }
];
