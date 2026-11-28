import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
import type {MonsterDefinition} from './monsterEffects';

/** One reviewed cohort; every admission is tested before distribution. */
export const conditionalBatch30:readonly Card[]=[
 {id:'13839120',konamiId:6156,name:'Dispositivo Amarelo',englishName:'Yellow Gadget',kind:'monster',monsterType:'effect',race:'Machine',attribute:'EARTH',level:4,atk:1200,defense:1200,summary:'Ao ser Invocado por Invocação-Normal ou Especial, você pode adicionar Dispositivo Verde do Deck à mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6156&request_locale=en'},
 {id:'41172955',konamiId:6151,name:'Dispositivo Verde',englishName:'Green Gadget',kind:'monster',monsterType:'effect',race:'Machine',attribute:'EARTH',level:4,atk:1400,defense:600,summary:'Ao ser Invocado por Invocação-Normal ou Especial, você pode adicionar Dispositivo Vermelho do Deck à mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6151&request_locale=en'},
 {id:'86445415',konamiId:6155,name:'Dispositivo Vermelho',englishName:'Red Gadget',kind:'monster',monsterType:'effect',race:'Machine',attribute:'EARTH',level:4,atk:1300,defense:1500,summary:'Ao ser Invocado por Invocação-Normal ou Especial, você pode adicionar Dispositivo Amarelo do Deck à mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6155&request_locale=en'},
 {id:'63391643',konamiId:5166,name:'Mil Facas',englishName:'Thousand Knives',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Controle Mago Negro para escolher e destruir 1 monstro do oponente.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5166&request_locale=en'},
 {id:'02314238',konamiId:6057,name:'Ataque da Magia Negra',englishName:'Dark Magic Attack',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Controle Mago Negro para destruir as Magias e Armadilhas do oponente.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6057&request_locale=en'},
 {id:'38411870',konamiId:5442,name:'Teto de Agulhas',englishName:'Needle Ceiling',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Com pelo menos 4 monstros em campo, destrua todos os monstros com a face para cima.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5442&request_locale=en'},
 {id:'28121403',konamiId:5741,name:'Descanso Realmente Eterno',englishName:'Really Eternal Rest',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Destrua todos os monstros equipados com Cartas de Equipamento.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5741&request_locale=en'},
 {id:'20727787',konamiId:5683,name:'Desarmamento',englishName:'Disarmament',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Destrua todas as Cartas de Equipamento no campo.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5683&request_locale=en'},
 {id:'61044390',konamiId:5841,name:'Fim do Caos',englishName:'Chaos End',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Com pelo menos 7 cartas suas banidas, destrua todos os monstros em campo.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5841&request_locale=en'},
 {id:'81510157',konamiId:5743,name:'Rouba Almas',englishName:'Soul Taker',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Destrua 1 monstro com a face para cima do oponente e, se for destruído, ele ganha 1000 PV.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5743&request_locale=en'}
];
const main={speed:1 as const,window:'main' as const,damage:'never' as const};
const trap={speed:2 as const,window:'free' as const,damage:'never' as const};
export const conditionalEffects30:Record<string,Effect>={
 '13839120':{kind:'monsterEffect'},'41172955':{kind:'monsterEffect'},'86445415':{kind:'monsterEffect'},
 '63391643':{kind:'conditionalDestruction',activation:main,zone:'monsters',scope:'selected',controller:'opponent',requiredName:'Dark Magician'},
 '02314238':{kind:'conditionalDestruction',activation:main,zone:'backrow',scope:'opponent',requiredName:'Dark Magician'},
 '38411870':{kind:'conditionalDestruction',activation:trap,zone:'monsters',scope:'all',faceUp:true,minFieldMonsters:4},
 '28121403':{kind:'conditionalDestruction',activation:trap,zone:'monsters',scope:'all',equipped:true},
 '20727787':{kind:'conditionalDestruction',activation:trap,zone:'equipSpells',scope:'all'},
 '61044390':{kind:'conditionalDestruction',activation:main,zone:'monsters',scope:'all',minBanished:7},
 '81510157':{kind:'conditionalDestruction',activation:main,zone:'monsters',scope:'selected',controller:'opponent',faceUp:true,opponentGainOnDestroy:1000}
};
export const conditionalMonsters30:Record<string,MonsterDefinition>={
 '13839120':{effect:{trigger:'onSummon',operation:{kind:'searchFiltered',rule:{from:'deck',filter:{name:'Green Gadget'}}},summons:['normal','special']},activation:{policy:'optional',window:'summon'}},
 '41172955':{effect:{trigger:'onSummon',operation:{kind:'searchFiltered',rule:{from:'deck',filter:{name:'Red Gadget'}}},summons:['normal','special']},activation:{policy:'optional',window:'summon'}},
 '86445415':{effect:{trigger:'onSummon',operation:{kind:'searchFiltered',rule:{from:'deck',filter:{name:'Yellow Gadget'}}},summons:['normal','special']},activation:{policy:'optional',window:'summon'}}
};
