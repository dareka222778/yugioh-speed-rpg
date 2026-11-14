/** Data-only admission using the immutable v8 continuous vocabulary. No distribution authorization. */
import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
import type {MonsterDefinition} from './monsterEffects';
export const mechanicalBatch16:readonly Card[]=[
 {id:'01434352',konamiId:5827,name:'Necromante do Caos',englishName:'Chaos Necromancer',kind:'monster',monsterType:'effect',race:'Fiend',attribute:'DARK',level:1,atk:0,defense:0,summary:'O ATK deste card é igual ao número de Cards de Monstro no seu Cemitério x 300.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5827&request_locale=en'},
 {id:'04542651',konamiId:5161,name:'Escudo do Brilho Amarelo',englishName:'Yellow Luster Shield',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Aumente em 300 a DEF de todos os monstros no seu campo.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5161&request_locale=en'},
 {id:'78193831',konamiId:4983,name:'Blader Notável',englishName:'Buster Blader',kind:'monster',monsterType:'effect',race:'Warrior',attribute:'EARTH',level:7,atk:2600,defense:2300,summary:'Ganha 500 de ATK para cada monstro Dragão que seu oponente controla ou no Cemitério dele.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4983&request_locale=en'}
];
export const mechanicalEffects16:Readonly<Record<string,Effect>>={
 '01434352':{kind:'monsterEffect'},
 '04542651':{kind:'continuous',activation:{speed:1,window:'main',damage:'never'},rules:[{kind:'modifier',filter:{controller:'source'},atk:0,def:300}]},
 '78193831':{kind:'monsterEffect'}
};
export const mechanicalMonsters16:Readonly<Record<string,MonsterDefinition>>={
 '01434352':{effect:{trigger:'continuous',operation:{kind:'continuous',rules:[{kind:'modifier',filter:{selfOnly:true},atk:0,def:0,count:{zone:'grave',controller:'source',cardKind:'monster',atk:300,def:0}}]}},activation:{policy:'continuous',window:'continuous'}},
 '78193831':{effect:{trigger:'continuous',operation:{kind:'continuous',rules:[
  {kind:'modifier',filter:{selfOnly:true},atk:0,def:0,count:{zone:'monsters',controller:'opponent',races:['Dragon'],faceUp:true,atk:500,def:0}},
  {kind:'modifier',filter:{selfOnly:true},atk:0,def:0,count:{zone:'grave',controller:'opponent',races:['Dragon'],cardKind:'monster',atk:500,def:0}}
 ]}},activation:{policy:'continuous',window:'continuous'}}
};
