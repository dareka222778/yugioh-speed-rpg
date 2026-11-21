import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';

/** Historical economic spells composed from existing LP/draw operations. */
export const economicBatch23:readonly Card[]=[
 {id:'58074572',konamiId:4344,name:'Curry Mooyan',englishName:'Mooyan Curry',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Escolha um jogador; esse jogador ganha 200 PV.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4344&request_locale=en'},
 {id:'08842266',konamiId:5607,name:'Poção do Homem Velho',englishName:'Poison of the Old Man',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Magia Rápida: escolha ganhar 1200 PV ou causar 800 de dano ao oponente.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5607&request_locale=en'}
];
const main={speed:1 as const,window:'main' as const,damage:'never' as const};
export const economicEffects23:Record<string,Effect>={
 '58074572':{kind:'choiceSequence',activation:main,choices:[{operations:[{kind:'gainLP',player:'self',amount:200}]},{operations:[{kind:'gainLP',player:'opponent',amount:200}]}]},
 '08842266':{kind:'choiceSequence',activation:{speed:2,window:'free',damage:'never'},choices:[{operations:[{kind:'gainLP',player:'self',amount:1200}]},{operations:[{kind:'damage',recipients:[{player:'opponent',amount:800}]}]}]}
};
