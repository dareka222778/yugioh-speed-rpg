/** M20: canonical names, count-based continuous boosts and exact equip filters.
 * Review basis: official Neuron card texts. No release authorization. */
import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
import type {MonsterDefinition} from './monsterEffects';

type Identity={id:string;konamiId:number;name:string;englishName:string;kind:Card['kind'];race:Card['race'];attribute:Card['attribute'];level:Card['level'];atk:Card['atk'];defense:Card['defense'];summary:string;monsterType?:Card['monsterType'];field?:boolean;fusion?:string[];alwaysTreatedAs?:string;archetypes?:readonly string[]};
const sourced=(c:Identity):Card=>({...c,source:`https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${c.konamiId}&request_locale=en`});
const spell=(id:string,konamiId:number,name:string,englishName:string,summary:string,field=false):Card=>sourced({id,konamiId,name,englishName,summary,kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,...field?{field:true}:{}});
const monster=(id:string,konamiId:number,name:string,englishName:string,race:string,attribute:string,level:number,atk:number,defense:number,summary:string,extra:Partial<Identity>={}):Card=>sourced({id,konamiId,name,englishName,kind:'monster',monsterType:'effect',race,attribute,level,atk,defense,summary,...extra});

export const mechanicalBatch20:readonly Card[]=[
 monster('91932350',6186,'Lady Harpia 1','Harpie Lady 1','Winged Beast','WIND',4,1300,1400,'Nome sempre tratado como Lady Harpia. Todos os monstros de VENTO no campo ganham 300 ATK.',{alwaysTreatedAs:'Harpie Lady'}),
 monster('52040216',4392,'Dragão de Estimação da Harpia',"Harpie's Pet Dragon",'Dragon','WIND',7,2000,2500,'Ganha 300 ATK/DEF por cada Lady Harpia no campo.'),
 monster('40453765',4018,'Guarda de Batalha do Pântano','Swamp Battleguard','Warrior','EARTH',5,1800,1500,'Ganha 500 ATK por cada Guarda de Batalha da Lava que você controla.'),
 monster('20394040',4560,'Guarda de Batalha da Lava','Lava Battleguard','Warrior','EARTH',5,1550,1800,'Ganha 500 ATK por cada Guarda de Batalha do Pântano que você controla.'),
 monster('47480070',5645,'Paladino Amazoness','Amazoness Paladin','Warrior','EARTH',4,1700,300,'Ganha 100 ATK por cada monstro Amazoness que você controla.'),
 monster('38033121',4766,'Pequena Maga Negra','Dark Magician Girl','Spellcaster','DARK',6,2000,1700,'Ganha 300 ATK por cada Mago Negro ou Mago do Caos Negro nos Cemitérios.'),
 monster('11901678',4223,'Dragão Caveira Negro','Black Skull Dragon','Dragon','DARK',9,3200,2500,'Fusão de Caveira Convocada e Dragão Negro de Olhos Vermelhos; é tratado como card Arquidemônio.',{monsterType:'fusion',fusion:['70781052','74677422'],archetypes:['Archfiend']}),
 spell('63224564',4323,'Ciberescudo','Cyber Shield','Equipe apenas a Lady Harpia ou Irmãs Lady Harpia. O monstro equipado ganha 500 ATK.'),
 spell('27967615',6138,'Arma de Fusão','Fusion Weapon','Equipe apenas a um Monstro de Fusão de Nível 6 ou menor. Ele ganha 1500 ATK/DEF.'),
 spell('81380218',4899,'Coro do Santuário','Chorus of Sanctuary','Todos os monstros em Posição de Defesa ganham 500 DEF.',true),
 spell('10012614',5538,'Estandarte da Coragem','Banner of Courage','Durante a sua Fase de Batalha, todos os monstros que você controla ganham 200 ATK.')
];

const continuous=(filter:import('./continuousRules').MonsterFilter,atk:number,def:number,count?:import('./continuousRules').CountFormula):MonsterDefinition=>({effect:{trigger:'continuous',operation:{kind:'continuous',rules:[{kind:'modifier',filter,atk,def,...count?{count}:{}}]}},activation:{policy:'continuous',window:'continuous'}});
const self={selfOnly:true} as const;
export const mechanicalMonsters20:Readonly<Record<string,MonsterDefinition>>={
 '91932350':continuous({attributes:['WIND']},300,0),
 '52040216':continuous(self,0,0,{zone:'monsters',controller:'both',names:['Harpie Lady'],faceUp:true,atk:300,def:300}),
 '40453765':continuous(self,0,0,{zone:'monsters',controller:'source',names:['Lava Battleguard'],faceUp:true,atk:500,def:0}),
 '20394040':continuous(self,0,0,{zone:'monsters',controller:'source',names:['Swamp Battleguard'],faceUp:true,atk:500,def:0}),
 '47480070':continuous(self,0,0,{zone:'monsters',controller:'source',archetypes:['Amazoness'],faceUp:true,cardKind:'monster',atk:100,def:0}),
 '38033121':continuous(self,0,0,{zone:'grave',controller:'both',names:['Dark Magician','Magician of Black Chaos'],atk:300,def:0})
};
export const mechanicalEffects20:Readonly<Record<string,Effect>>={
 ...Object.fromEntries(Object.keys(mechanicalMonsters20).map(id=>[id,{kind:'monsterEffect' as const}])),
 '63224564':{kind:'equip',names:['Harpie Lady','Harpie Lady Sisters'],atk:500,def:0},
 '27967615':{kind:'equip',monsterType:'fusion',maxLevel:6,atk:1500,def:1500},
 '81380218':{kind:'field',races:[],defensePositionOnly:true,atk:0,def:500},
 '10012614':{kind:'continuous',activation:{speed:1,window:'main',damage:'never'},rules:[{kind:'modifier',filter:{controller:'source',phase:'battle',duringOwnTurn:true},atk:200,def:0}]}
};
