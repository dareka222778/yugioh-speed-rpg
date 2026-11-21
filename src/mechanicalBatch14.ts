/** One independently checked classic modifier expressible in the frozen v7
 * vocabulary; every other proposed family remains unadmitted until a new
 * resolver version can express the *entire* printed effect. */
import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
import type {MonsterDefinition} from './monsterEffects';

export const mechanicalBatch14:readonly Card[]=[
 {id:'96890582',konamiId:4918,name:'Assaltante Veloz',englishName:'Flash Assailant',
  kind:'monster',monsterType:'effect',race:'Fiend',attribute:'DARK',level:4,atk:2000,defense:2000,
  summary:'Decrease the ATK and DEF of this card by 400 points for each card in your hand.',
  source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4918&request_locale=en'}
];
export const mechanicalEffects14:Readonly<Record<string,Effect>>={'96890582':{kind:'monsterEffect'}};
export const mechanicalMonsters14:Readonly<Record<string,MonsterDefinition>>={
 '96890582':{
  effect:{trigger:'continuous',operation:{kind:'continuous',rules:[
   {kind:'modifier',filter:{selfOnly:true},atk:0,def:0,
    count:{zone:'hand',controller:'source',atk:-400,def:-400}}
  ]}},
  activation:{policy:'continuous',window:'continuous'}
 }
};
