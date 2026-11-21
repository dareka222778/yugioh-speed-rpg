import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';

/** Independently source-checked historical LP effects that count live game zones. */
export const economicCountBatch24:readonly Card[]=[
 {id:'99518961',konamiId:4871,name:'Revolução Restructer',englishName:'Restructer Revolution',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Cause 200 de dano por card na mão do oponente.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4871&request_locale=en'},
 {id:'27053506',konamiId:5620,name:'Barril Secreto',englishName:'Secret Barrel',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Cause 200 de dano por card na mão ou no campo do oponente.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5620&request_locale=pt'},
 {id:'51394546',konamiId:6148,name:'Bomba do Cemitério',englishName:'Cemetary Bomb',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Cause 100 de dano por card no Cemitério do oponente.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6148&request_locale=pt'},
 {id:'98299011',konamiId:4986,name:'Presente da Elfa Mística',englishName:'Gift of The Mystical Elf',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Ganhe 300 PV por monstro em ambos os campos.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4986&request_locale=pt'},
 {id:'44472639',konamiId:5991,name:'Raio Solar',englishName:'Solar Ray',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Cause 600 de dano por monstro de LUZ com a face para cima que você controla.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5991&request_locale=pt'}
];
const spell={speed:1 as const,window:'main' as const,damage:'never' as const};
const trap={speed:2 as const,window:'free' as const,damage:'never' as const};
export const economicCountEffects24:Record<string,Effect>={
 '99518961':{kind:'sequence',activation:spell,operations:[{kind:'scaledLP',direction:'damage',recipient:'opponent',amountPerCard:200,selectors:[{zone:'hand',player:'opponent'}]}]},
 '27053506':{kind:'sequence',activation:trap,operations:[{kind:'scaledLP',direction:'damage',recipient:'opponent',amountPerCard:200,selectors:[{zone:'hand',player:'opponent'},{zone:'monsters',player:'opponent'},{zone:'backrow',player:'opponent',includeField:true}]}]},
 '51394546':{kind:'sequence',activation:trap,operations:[{kind:'scaledLP',direction:'damage',recipient:'opponent',amountPerCard:100,selectors:[{zone:'grave',player:'opponent'}]}]},
 '98299011':{kind:'sequence',activation:trap,operations:[{kind:'scaledLP',direction:'gain',recipient:'self',amountPerCard:300,selectors:[{zone:'monsters',player:'both'}]}]},
 '44472639':{kind:'sequence',activation:trap,operations:[{kind:'scaledLP',direction:'damage',recipient:'opponent',amountPerCard:600,selectors:[{zone:'monsters',player:'self',faceUp:true,attribute:'LIGHT'}]}]}
};
