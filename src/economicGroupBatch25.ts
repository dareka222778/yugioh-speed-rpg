import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';

/** Atomic LP effects: every recipient is updated before the shared victory check. */
export const economicGroupBatch25:readonly Card[]=[
 {id:'45311864',konamiId:5985,name:'Ladrão Goblin',englishName:'Goblin Thief',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Cause 500 de dano aos PV do oponente e ganhe 500 PV simultaneamente.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5985&request_locale=en'}
];
const main={speed:1 as const,window:'main' as const,damage:'never' as const};
export const economicGroupEffects25:Record<string,Effect>={
 '45311864':{kind:'sequence',activation:main,operations:[{kind:'simultaneousLP',changes:[{player:'opponent',direction:'damage',amount:500},{player:'self',direction:'gain',amount:500}]}]}
};
