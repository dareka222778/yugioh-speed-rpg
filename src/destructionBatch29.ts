import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';

/** Historical spell cards sharing the current-stat/position destruction engine. */
export const destructionBatch29:readonly Card[]=[
 {id:'26412047',konamiId:6130,name:'Tiro a Martelo',englishName:'Hammer Shot',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Destrua 1 monstro em Ataque com o maior ATK atual de ambos os campos. Em caso de empate, escolha na resolução.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6130&request_locale=en'},
 {id:'97169186',konamiId:5905,name:'Esmagando o Chão',englishName:'Smashing Ground',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Destrua 1 monstro com a face para cima do oponente com maior DEF atual. Em caso de empate, escolha na resolução.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5905&request_locale=en'},
 {id:'30683373',konamiId:6003,name:'Esmagar com o Escudo',englishName:'Shield Crush',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Escolha 1 monstro em Posição de Defesa em qualquer campo (inclusive com a face para baixo) e destrua-o.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6003&request_locale=en'}
];

export const destructionEffects29:Record<string,Effect>={
 '26412047':{kind:'destroyExtreme',scope:'all',stat:'atk',position:'atk'},
 '97169186':{kind:'destroyExtreme',scope:'opponent',stat:'defense',faceUp:true},
 '30683373':{kind:'destroyTargetPosition',position:'def'}
};
