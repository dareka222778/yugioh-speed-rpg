// Only explicit, executable effects are admitted to the engine. No generic spell fallback.
import {cards as starterCards,type Card} from './cardCatalog';
import {classicEngineCards} from './classicEngineCards';
export type Effect=
 |{kind:'monsterEffect'|'normal'|'fusion'|'fissure'|'polymerization'|'darkHole'|'cardDestruction'|'giantTrunade'|'shieldSword'|'monsterReborn'|'changeHeart'|'blockAttack'|'deSpell'|'removeTrap'|'reinforcements'|'castleWalls'|'waboku'|'trapHole'|'justDesserts'|'magicJammer'|'sevenTools'|'potOfGreed'|'raigeki'|'mysticalSpaceTyphoon'|'bookOfMoon'|'torrentialTribute'|'sakuretsuArmor'|'mirrorForce'}
 |{kind:'heal'|'burn';amount:number}
 |{kind:'field';races:string[];atk:number;def:number;penaltyRaces?:string[]}
 |{kind:'equip';races?:string[];attribute?:string;atk:number;def:number};
const effects:Record<string,Effect>={
 '54652250':{kind:'monsterEffect'},
 '07089711':{kind:'monsterEffect'},
 '31560081':{kind:'monsterEffect'},
 '28933734':{kind:'monsterEffect'},
 '60694662':{kind:'monsterEffect'},
 '11384280':{kind:'monsterEffect'},
 '26202165':{kind:'monsterEffect'},
 '78010363':{kind:'monsterEffect'},
 '77585513':{kind:'monsterEffect'},
 '54098121':{kind:'monsterEffect'},
 '83011277':{kind:'monsterEffect'},
 '77414722':{kind:'magicJammer'},
 '03819470':{kind:'sevenTools'},
 '55144522':{kind:'potOfGreed'},
 '12580477':{kind:'raigeki'},
 '05318639':{kind:'mysticalSpaceTyphoon'},
 '14087893':{kind:'bookOfMoon'},
 '53582587':{kind:'torrentialTribute'},
 '56120475':{kind:'sakuretsuArmor'},
 '44095762':{kind:'mirrorForce'},
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
/** Audited real-card metadata adapted to this RPG's supported effects. */
const supportedEffectMonsters:Card[]=[
 {id:'54652250',konamiId:4507,name:'Inseto Devorador de Homens',englishName:'Man-Eater Bug',kind:'monster',race:'Insect',attribute:'EARTH',level:2,atk:450,defense:600,summary:'VIRAR: escolha 1 monstro no campo; destrua-o.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4507&request_locale=en'},
 {id:'07089711',konamiId:4547,name:'Hane-Hane',englishName:'Hane-Hane',kind:'monster',race:'Beast',attribute:'EARTH',level:2,atk:450,defense:500,summary:'VIRAR: escolha 1 monstro no campo; devolva-o à mão do dono.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4547&request_locale=en'},
 {id:'31560081',konamiId:4434,name:'Mago da Fé',englishName:'Magician of Faith',kind:'monster',race:'Spellcaster',attribute:'LIGHT',level:1,atk:300,defense:400,summary:'VIRAR: escolha 1 Magia no seu Cemitério; adicione-a à sua mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4434&request_locale=en'},
 {id:'28933734',konamiId:4108,name:'Máscara das Trevas',englishName:'Mask of Darkness',kind:'monster',race:'Fiend',attribute:'DARK',level:2,atk:900,defense:400,summary:'VIRAR: escolha 1 Armadilha no seu Cemitério; adicione-a à sua mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4108&request_locale=en'},
 {id:'60694662',konamiId:4546,name:'Anjo Esquelético',englishName:'Skelengel',kind:'monster',race:'Fairy',attribute:'LIGHT',level:2,atk:900,defense:400,summary:'VIRAR: compre 1 carta.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4546&request_locale=en'},
 {id:'11384280',konamiId:4518,name:'Soldado Canhão',englishName:'Cannon Soldier',kind:'monster',race:'Machine',attribute:'DARK',level:4,atk:1400,defense:1300,summary:'Ofereça 1 monstro que você controla como Tributo; cause 500 de dano ao oponente.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4518&request_locale=pt'},
 {id:'26202165',konamiId:4054,name:'Sangan',englishName:'Sangan',kind:'monster',race:'Fiend',attribute:'DARK',level:3,atk:1000,defense:600,summary:'Se enviado do campo ao Cemitério: busque no Deck 1 monstro com até 1500 ATK. Uma vez por turno; não ative cards/efeitos de cards com esse nome neste turno.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4054&request_locale=pt'},
 {id:'78010363',konamiId:4580,name:'Bruxa da Floresta Negra',englishName:'Witch of the Black Forest',kind:'monster',race:'Spellcaster',attribute:'DARK',level:4,atk:1100,defense:1200,summary:'Se enviada do campo ao Cemitério: busque no Deck 1 monstro com até 1500 DEF. Uma vez por turno; não ative cards/efeitos de cards com esse nome neste turno.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4580&request_locale=pt'},
 {id:'77585513',konamiId:4758,name:'Jinzo',englishName:'Jinzo',kind:'monster',race:'Machine',attribute:'DARK',level:6,atk:2400,defense:1500,summary:'Enquanto estiver com a face para cima no campo, nenhum jogador pode ativar Armadilhas. Negue os efeitos de Armadilha no campo.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4758&request_locale=pt'},
 {id:'54098121',konamiId:4172,name:'Ventríloco Misterioso',englishName:'Mysterious Puppeteer',kind:'monster',race:'Warrior',attribute:'EARTH',level:4,atk:1000,defense:1500,summary:'Quando outro monstro é Invocado por Invocação-Normal ou Virar: ganhe 500 PV.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4172&request_locale=pt'},
 {id:'83011277',konamiId:4930,name:'Tomate Místico',englishName:'Mystic Tomato',kind:'monster',race:'Plant',attribute:'DARK',level:4,atk:1400,defense:1100,summary:'Se for destruído em batalha e enviado ao Cemitério: você pode Invocar por Invocação-Especial 1 monstro TREVAS com até 1500 ATK do Deck em Ataque.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4930&request_locale=pt'}
];
const supportedCounterTraps:Card[]=[
 {id:'77414722',konamiId:4862,name:'Bloqueador de Magia',englishName:'Magic Jammer',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Quando uma Magia é ativada: descarte 1 carta; negue a ativação e destrua a Magia.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4862&request_locale=pt'},
 {id:'03819470',konamiId:4863,name:'Sete Ferramentas do Bandido',englishName:'Seven Tools of the Bandit',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Quando uma Armadilha é ativada: pague 1000 PV; negue a ativação e destrua a Armadilha.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4863&request_locale=pt'},
 {id:'44095762',konamiId:4887,name:'Força do Espelho',englishName:'Mirror Force',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Quando um monstro do oponente declara um ataque: destrua todos os monstros em Posição de Ataque que o oponente controla.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4887&request_locale=pt'},
 {id:'53582587',konamiId:5114,name:'Tributo Torrencial',englishName:'Torrential Tribute',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Quando um ou mais monstros forem Invocados: destrua todos os monstros no campo.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5114&request_locale=pt'},
 {id:'56120475',konamiId:5799,name:'Armadura Sakuretsu',englishName:'Sakuretsu Armor',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Quando um monstro do oponente declarar um ataque: escolha o monstro atacante; destrua o alvo.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5799&request_locale=pt'}
];
const supportedClassicSpells:Card[]=[
 {id:'55144522',konamiId:4844,name:'Pote da Ganância',englishName:'Pot of Greed',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Compre 2 cartas.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4844&request_locale=pt'},
 {id:'12580477',konamiId:4343,name:'Raigeki',englishName:'Raigeki',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Destrua todos os monstros que seu oponente controla.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4343&request_locale=pt'},
 {id:'05318639',konamiId:4909,name:'Tufão Espacial Místico',englishName:'Mystical Space Typhoon',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Magia Rápida: escolha 1 Magia/Armadilha no campo; destrua-a. Destruir não significa negar a ativação.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4909&request_locale=pt'},
 {id:'14087893',konamiId:5432,name:'Livro da Lua',englishName:'Book of Moon',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Magia Rápida: escolha 1 monstro com a face para cima no campo; coloque-o com a face para baixo em Posição de Defesa.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5432&request_locale=pt'}
];
export const engineCatalog:readonly Card[]=[...starterCards,...classicEngineCards.filter(c=>!starterCards.some(s=>s.id===c.id)),...supportedEffectMonsters,...supportedCounterTraps,...supportedClassicSpells];
const metadata=new Map(engineCatalog.map(c=>[c.id,c]));
for(const c of engineCatalog)if(!effects[c.id]){
 if(c.fusion)effects[c.id]={kind:'fusion'};
 else if(c.kind==='monster'&&c.summary.startsWith('Monstro Normal:'))effects[c.id]={kind:'normal'};
}
export function getEffect(id:string):Effect|undefined{return effects[id];}
/** Only audited Spell Speed 2 Magias Rápidas may activate in a response window. */
export function isQuickPlaySpell(id:string):boolean{return ['mysticalSpaceTyphoon','bookOfMoon'].includes(getEffect(id)?.kind??'');}
export function engineCard(id:string){return metadata.get(id);}
export const enabledCardIds=Object.freeze(Object.keys(effects).filter(id=>metadata.has(id)));
export function equipEligible(effect:Extract<Effect,{kind:'equip'}>,monster:Card){return (!effect.races||effect.races.includes(monster.race??''))&&(!effect.attribute||effect.attribute===monster.attribute);}
