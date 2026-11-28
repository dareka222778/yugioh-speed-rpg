import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';

/** Source-reviewed singleton searches, with all choices limited to owned zones. */
export const searchSpellBatch25:readonly Card[]=[
 {id:'73628505',konamiId:5537,name:'Terraformação',englishName:'Terraforming',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Adicione 1 Magia de Campo do seu Deck à mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5537&request_locale=en'},
 {id:'32807846',konamiId:5328,name:'Reforço do Exército',englishName:'Reinforcement of the Army',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Adicione 1 monstro Guerreiro de Nível 4 ou menos do Deck à mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5328&request_locale=en'},
 {id:'26902560',konamiId:4872,name:'Sábio da Fusão',englishName:'Fusion Sage',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Adicione 1 Polimerização do Deck à mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4872&request_locale=en'},
 {id:'95281259',konamiId:5330,name:'O Regresso do Guerreiro Vivo',englishName:'The Warrior Returning Alive',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Escolha 1 Guerreiro no seu Cemitério e adicione-o à mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5330&request_locale=en'},
 {id:'89997728',konamiId:5474,name:'Índice Toon',englishName:'Toon Table of Contents',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Adicione 1 carta Toon do seu Deck à mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5474&request_locale=en'},
 {id:'06390406',konamiId:5673,name:'Emblema do Destruidor de Dragões',englishName:'Emblem of Dragon Destroyer',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Adicione 1 Buster Blader do Deck ou Cemitério à mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5673&request_locale=en'}
];
export const searchSpellEffects25:Record<string,Effect>={
 '73628505':{kind:'searchZone',rule:{from:'deck',filter:{kind:'spell',field:true}}},
 '32807846':{kind:'searchZone',rule:{from:'deck',filter:{kind:'monster',race:'Warrior',maxLevel:4}}},
 '26902560':{kind:'searchZone',rule:{from:'deck',filter:{name:'Polymerization'}}},
 '95281259':{kind:'searchZone',rule:{from:'grave',filter:{kind:'monster',race:'Warrior'}}},
 '89997728':{kind:'searchZone',rule:{from:'deck',filter:{archetype:'Toon'}}},
 '06390406':{kind:'searchZone',rule:{from:'either',filter:{name:'Buster Blader'}}}
};
