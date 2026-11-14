/** Mission 18: strictly complete, historical cards using the existing v8 resolver. */
import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
import type {MonsterDefinition} from './monsterEffects';

const official=(cid:number)=>`https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${cid}&request_locale=en`;
export const mechanicalBatch18:readonly Card[]=[
 {id:'23995348',konamiId:4386,name:'Dragão Definitivo de Olhos Azuis',englishName:'Blue-Eyes Ultimate Dragon',kind:'monster',monsterType:'fusion',race:'Dragon',attribute:'LIGHT',level:12,atk:4500,defense:3800,fusion:['89631139','89631139','89631139'],summary:'Fusão de três Dragões Brancos de Olhos Azuis; sem efeitos adicionais.',source:official(4386)},
 {id:'37101832',konamiId:5511,name:'Guarda do Coveiro',englishName:"Gravekeeper's Guard",kind:'monster',monsterType:'effect',race:'Spellcaster',attribute:'DARK',level:4,atk:1000,defense:1900,summary:'VIRE: escolha um monstro controlado pelo oponente e devolva-o à mão do dono.',source:official(5511)}
];
export const mechanicalEffects18:Readonly<Record<string,Effect>>={
 '23995348':{kind:'fusion'},
 '37101832':{kind:'monsterEffect'}
};
export const mechanicalMonsters18:Readonly<Record<string,MonsterDefinition>>={
 '37101832':{effect:{trigger:'flip',operation:{kind:'bounce',target:'opponentMonster'}},activation:{policy:'mandatory',window:'flip'}}
};
