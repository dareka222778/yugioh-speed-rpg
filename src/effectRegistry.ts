// Only explicit, executable effects are admitted to the engine. No generic spell fallback.
import {cards as starterCards,type Card} from './cardCatalog';
import {archiveCards} from './classicDecks';
import {classicEngineCards} from './classicEngineCards';
export type Effect=
 |{kind:'monsterEffect'|'normal'|'fusion'|'fissure'|'polymerization'|'darkHole'|'cardDestruction'|'giantTrunade'|'shieldSword'|'monsterReborn'|'changeHeart'|'blockAttack'|'deSpell'|'removeTrap'|'reinforcements'|'castleWalls'|'waboku'|'trapHole'|'justDesserts'}
 |{kind:'heal'|'burn';amount:number}
 |{kind:'field';races:string[];atk:number;def:number;penaltyRaces?:string[]}
 |{kind:'equip';races?:string[];attribute?:string;atk:number;def:number};
const effects:Record<string,Effect>={
 '54652250':{kind:'monsterEffect'},
 '07089711':{kind:'monsterEffect'},
 '31560081':{kind:'monsterEffect'},
 '28933734':{kind:'monsterEffect'},
 '60694662':{kind:'monsterEffect'},
 '38199696':{kind:'heal',amount:500},'84257639':{kind:'heal',amount:1000},'19523799':{kind:'burn',amount:800},
 '66788016':{kind:'fissure'},'24094653':{kind:'polymerization'},
 '17814387':{kind:'reinforcements'},'44209392':{kind:'castleWalls'},
 '53129443':{kind:'darkHole'},'72892473':{kind:'cardDestruction'},'42703248':{kind:'giantTrunade'},'52097679':{kind:'shieldSword'},
 '83764718':{kind:'monsterReborn'},'04031928':{kind:'changeHeart'},'25880422':{kind:'blockAttack'},'19159413':{kind:'deSpell'},'51482758':{kind:'removeTrap'},
 '12607053':{kind:'waboku'},'04206964':{kind:'trapHole'},'24068492':{kind:'justDesserts'},
 '86318356':{kind:'field',races:['Warrior','Beast-Warrior'],atk:200,def:200},
 '50913601':{kind:'field',races:['Dragon','Winged Beast','Thunder'],atk:200,def:200},
 '59197169':{kind:'field',races:['Fiend','Spellcaster'],penaltyRaces:['Fairy'],atk:200,def:200},
 '37120512':{kind:'equip',attribute:'DARK',atk:400,def:-200},
 '91595718':{kind:'equip',races:['Spellcaster'],atk:300,def:300},
 '04614116':{kind:'equip',races:['Fiend'],atk:300,def:300},
 '98374133':{kind:'equip',attribute:'EARTH',atk:400,def:-200},
 '01435851':{kind:'equip',races:['Dragon'],atk:300,def:300}
};
/** Historical names/stats from official Konami DB; password IDs from printed cards. */
const supportedEffectMonsters:Card[]=[
 {id:'54652250',konamiId:4507,name:'Inseto Devorador de Homens',englishName:'Man-Eater Bug',kind:'monster',race:'Insect',attribute:'EARTH',level:2,atk:450,defense:600,summary:'VIRAR: escolha 1 monstro no campo; destrua-o.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4507&request_locale=en'},
 {id:'07089711',konamiId:4547,name:'Hane-Hane',englishName:'Hane-Hane',kind:'monster',race:'Beast',attribute:'EARTH',level:2,atk:450,defense:500,summary:'VIRAR: escolha 1 monstro no campo; devolva-o à mão do dono.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4547&request_locale=en'},
 {id:'31560081',konamiId:4434,name:'Mago da Fé',englishName:'Magician of Faith',kind:'monster',race:'Spellcaster',attribute:'LIGHT',level:1,atk:300,defense:400,summary:'VIRAR: escolha 1 Magia no seu Cemitério; adicione-a à sua mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4434&request_locale=en'},
 {id:'28933734',konamiId:4108,name:'Máscara das Trevas',englishName:'Mask of Darkness',kind:'monster',race:'Fiend',attribute:'DARK',level:2,atk:900,defense:400,summary:'VIRAR: escolha 1 Armadilha no seu Cemitério; adicione-a à sua mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4108&request_locale=en'},
 {id:'60694662',konamiId:4546,name:'Anjo Esquelético',englishName:'Skelengel',kind:'monster',race:'Fairy',attribute:'LIGHT',level:2,atk:900,defense:400,summary:'VIRAR: compre 1 carta.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4546&request_locale=en'}
];
export const engineCatalog:readonly Card[]=[...starterCards,...classicEngineCards.filter(c=>!starterCards.some(s=>s.id===c.id)),...supportedEffectMonsters];
const metadata=new Map(engineCatalog.map(c=>[c.id,c]));
for(const c of engineCatalog)if(!effects[c.id]){
 if(c.fusion)effects[c.id]={kind:'fusion'};
 else if(c.kind==='monster'&&(starterCards.some(s=>s.id===c.id)||archiveCards.get(c.id)?.type.includes('Normal')))effects[c.id]={kind:'normal'};
}
export function getEffect(id:string):Effect|undefined{return effects[id];}
export function engineCard(id:string){return metadata.get(id);}
export const enabledCardIds=Object.freeze(Object.keys(effects).filter(id=>metadata.has(id)));
export function classicCoverage(){return [...archiveCards.values()].map(c=>({id:c.id,name:c.englishName,enabled:enabledCardIds.includes(c.id),effect:effects[c.id]?.kind??null,status:enabledCardIds.includes(c.id)?'enabled':c.id==='73915051'?'format-incompatible':'pending',reason:c.id==='73915051'?'Requires four free monster zones; fixed format has three.':null}));}
export function equipEligible(effect:Extract<Effect,{kind:'equip'}>,monster:Card){return (!effect.races||effect.races.includes(monster.race??''))&&(!effect.attribute||effect.attribute===monster.attribute);}
