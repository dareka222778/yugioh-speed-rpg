import {economicCountBatch24} from './economicCountBatch24';
import {economicBatch23} from './economicBatch23';
import {ritualExtensions22} from './ritualExtensions22';
import {ritualBatch22} from './ritualBatch22';
import {worldNormalBatch16} from './worldNormalBatch16';
import {mechanicalBatch20} from './mechanicalBatch20';
import {mechanicalBatch16} from './mechanicalBatch16';
import {mechanicalBatch17} from './mechanicalBatch17';
import {mechanicalBatch18} from './mechanicalBatch18';
import {historicalNormalBatch19} from './historicalNormalBatch19';
import {mechanicalBatch15} from './mechanicalBatch15';
import {fusionBatch8} from './fusionBatch8';
import {mechanicalBatch11} from './mechanicalBatch11';
import {mechanicalBatch14} from './mechanicalBatch14';
import {historicalFusionBatch10} from './historicalFusionBatch10';
import {historicalNormalBatch9} from './historicalNormalBatch9';
import {mechanicalBatch8} from './mechanicalBatch8';
import {mechanicalBatch7} from './mechanicalBatch7';
import {mechanicalBatch5} from './mechanicalBatch5';
import {historicalNormalBatch4} from './historicalNormalBatch4';
import {historicalNormalBatch} from './historicalNormalBatch';
// Bundled factual data; importing this module never imports Discord or the database.
import {cards as starterCards,type Card} from './cardCatalog';
import {classicExpansionCards} from './classicExpansion';
import {classicEngineCards} from './classicEngineCards';
/** Audited real-card metadata adapted to this RPG's supported effects. */
const supportedEffectMonsters:Card[]=[
 {id:'40640057',konamiId:4064,name:'Kuriboh',englishName:'Kuriboh',kind:'monster',monsterType:'effect',race:'Fiend',attribute:'DARK',level:1,atk:300,defense:200,summary:'Durante o cálculo de dano de um ataque do oponente: descarte esta carta da mão; você não recebe dano de batalha desse combate. Não impede a destruição do monstro.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4064&request_locale=en'},
 {id:'54652250',konamiId:4507,name:'Inseto Devorador de Homens',englishName:'Man-Eater Bug',kind:'monster',monsterType:'effect',race:'Insect',attribute:'EARTH',level:2,atk:450,defense:600,summary:'VIRAR: escolha 1 monstro no campo; destrua-o.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4507&request_locale=en'},
 {id:'07089711',konamiId:4547,name:'Hane-Hane',englishName:'Hane-Hane',kind:'monster',monsterType:'effect',race:'Beast',attribute:'EARTH',level:2,atk:450,defense:500,summary:'VIRAR: escolha 1 monstro no campo; devolva-o à mão do dono.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4547&request_locale=en'},
 {id:'31560081',konamiId:4434,name:'Mago da Fé',englishName:'Magician of Faith',kind:'monster',monsterType:'effect',race:'Spellcaster',attribute:'LIGHT',level:1,atk:300,defense:400,summary:'VIRAR: escolha 1 Magia no seu Cemitério; adicione-a à sua mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4434&request_locale=en'},
 {id:'28933734',konamiId:4108,name:'Máscara das Trevas',englishName:'Mask of Darkness',kind:'monster',monsterType:'effect',race:'Fiend',attribute:'DARK',level:2,atk:900,defense:400,summary:'VIRAR: escolha 1 Armadilha no seu Cemitério; adicione-a à sua mão.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4108&request_locale=en'},
 {id:'60694662',konamiId:4546,name:'Anjo Esquelético',englishName:'Skelengel',kind:'monster',monsterType:'effect',race:'Fairy',attribute:'LIGHT',level:2,atk:900,defense:400,summary:'VIRAR: compre 1 carta.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4546&request_locale=en'},
 {id:'11384280',konamiId:4518,name:'Soldado Canhão',englishName:'Cannon Soldier',kind:'monster',monsterType:'effect',race:'Machine',attribute:'DARK',level:4,atk:1400,defense:1300,summary:'Ofereça 1 monstro que você controla como Tributo; cause 500 de dano ao oponente.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4518&request_locale=pt'},
 {id:'26202165',konamiId:4054,name:'Sangan',englishName:'Sangan',kind:'monster',monsterType:'effect',race:'Fiend',attribute:'DARK',level:3,atk:1000,defense:600,summary:'Se enviado do campo ao Cemitério: busque no Deck 1 monstro com até 1500 ATK. Uma vez por turno; não ative cards/efeitos de cards com esse nome neste turno.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4054&request_locale=pt'},
 {id:'78010363',konamiId:4580,name:'Bruxa da Floresta Negra',englishName:'Witch of the Black Forest',kind:'monster',monsterType:'effect',race:'Spellcaster',attribute:'DARK',level:4,atk:1100,defense:1200,summary:'Se enviada do campo ao Cemitério: busque no Deck 1 monstro com até 1500 DEF. Uma vez por turno; não ative cards/efeitos de cards com esse nome neste turno.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4580&request_locale=pt'},
 {id:'77585513',konamiId:4758,name:'Jinzo',englishName:'Jinzo',kind:'monster',monsterType:'effect',race:'Machine',attribute:'DARK',level:6,atk:2400,defense:1500,summary:'Enquanto estiver com a face para cima no campo, nenhum jogador pode ativar Armadilhas. Negue os efeitos de Armadilha no campo.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4758&request_locale=pt'},
 {id:'54098121',konamiId:4172,name:'Ventríloco Misterioso',englishName:'Mysterious Puppeteer',kind:'monster',monsterType:'effect',race:'Warrior',attribute:'EARTH',level:4,atk:1000,defense:1500,summary:'Quando outro monstro é Invocado por Invocação-Normal ou Virar: ganhe 500 PV.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4172&request_locale=pt'},
 {id:'83011277',konamiId:4930,name:'Tomate Místico',englishName:'Mystic Tomato',kind:'monster',monsterType:'effect',race:'Plant',attribute:'DARK',level:4,atk:1400,defense:1100,summary:'Se for destruído em batalha e enviado ao Cemitério: você pode Invocar por Invocação-Especial 1 monstro TREVAS com até 1500 ATK do Deck em Ataque.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4930&request_locale=pt'}
];
const supportedCounterTraps:Card[]=[
 {id:'77414722',konamiId:4862,name:'Bloqueador de Magia',englishName:'Magic Jammer',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Quando uma Magia é ativada: descarte 1 carta; negue a ativação e destrua a Magia.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4862&request_locale=pt'},
 {id:'03819470',konamiId:4863,name:'Sete Ferramentas do Bandido',englishName:'Seven Tools of the Bandit',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Quando uma Armadilha é ativada: pague 1000 PV; negue a ativação e destrua a Armadilha.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4863&request_locale=pt'},
 {id:'44095762',konamiId:4887,name:'Força do Espelho',englishName:'Mirror Force',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Quando um monstro do oponente declara um ataque: destrua todos os monstros em Posição de Ataque que o oponente controla.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4887&request_locale=pt'},
 {id:'53582587',konamiId:5114,name:'Tributo Torrencial',englishName:'Torrential Tribute',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Quando um ou mais monstros forem Invocados: destrua todos os monstros no campo.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5114&request_locale=pt'},
 {id:'29401950',konamiId:5400,name:'Buraco Armadilha Sem Fundo',englishName:'Bottomless Trap Hole',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Quando seu oponente Invocar um ou mais monstros com 1500 ou mais de ATK: destrua esses monstros e, se isso acontecer, bana-os.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5400&request_locale=pt'},
 {id:'56120475',konamiId:5799,name:'Armadura Sakuretsu',englishName:'Sakuretsu Armor',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Quando um monstro do oponente declarar um ataque: escolha o monstro atacante; destrua o alvo.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5799&request_locale=pt'}
];
const supportedClassicSpells:Card[]=[
 {id:'55144522',konamiId:4844,name:'Pote da Ganância',englishName:'Pot of Greed',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Compre 2 cartas.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4844&request_locale=pt'},
 {id:'12580477',konamiId:4343,name:'Raigeki',englishName:'Raigeki',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Destrua todos os monstros que seu oponente controla.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4343&request_locale=pt'},
 {id:'05318639',konamiId:4909,name:'Tufão Espacial Místico',englishName:'Mystical Space Typhoon',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Magia Rápida: escolha 1 Magia/Armadilha no campo; destrua-a. Destruir não significa negar a ativação.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4909&request_locale=pt'},
 {id:'14087893',konamiId:5432,name:'Livro da Lua',englishName:'Book of Moon',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Magia Rápida: escolha 1 monstro com a face para cima no campo; coloque-o com a face para baixo em Posição de Defesa.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5432&request_locale=pt'}
];
export const cardMetadata:readonly Card[]=[...starterCards,...classicEngineCards.filter(c=>!starterCards.some(s=>s.id===c.id)),...supportedEffectMonsters,...supportedCounterTraps,...supportedClassicSpells,...classicExpansionCards,...historicalNormalBatch,...historicalNormalBatch4,...mechanicalBatch5,...mechanicalBatch7,...mechanicalBatch8,...fusionBatch8,...historicalNormalBatch9,...historicalFusionBatch10,...mechanicalBatch11,...mechanicalBatch14,...mechanicalBatch15,...mechanicalBatch16,...mechanicalBatch17,...mechanicalBatch18,...worldNormalBatch16,...historicalNormalBatch19,...mechanicalBatch20,...ritualBatch22,...ritualExtensions22,...economicBatch23,...economicCountBatch24];
