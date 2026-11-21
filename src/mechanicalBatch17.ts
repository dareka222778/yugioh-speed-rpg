/**
 * Mission 17: independently checked, complete effects expressed exclusively in
 * the existing v8 vocabulary. This admits cards, not distribution rights.
 * Do not amend an old resolver or a historical catalog snapshot.
 */
import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
import type {MonsterDefinition} from './monsterEffects';

const official=(cid:number)=>`https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${cid}&request_locale=en`;
export const mechanicalBatch17:readonly Card[]=[
 {id:'45311864',konamiId:5985,name:'Ladrão Goblin',englishName:'Goblin Thief',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Cause 500 de dano ao oponente e ganhe 500 LP.',source:official(5985)},
 {id:'46700124',konamiId:4413,name:'Rei Máquina',englishName:'Machine King',kind:'monster',monsterType:'effect',race:'Machine',attribute:'EARTH',level:6,atk:2200,defense:2000,summary:'Ganha 100 de ATK por cada monstro Máquina no campo, incluindo este.',source:official(4413)},
 {id:'82108372',konamiId:5356,name:'Mudora',englishName:'Mudora',kind:'monster',monsterType:'effect',race:'Fairy',attribute:'EARTH',level:4,atk:1500,defense:1800,summary:'Ganha 200 de ATK por cada monstro Fada no seu Cemitério.',source:official(5356)},
 {id:'18891691',konamiId:5804,name:'Rei das Máquinas Perfeitas',englishName:'Perfect Machine King',kind:'monster',monsterType:'effect',race:'Machine',attribute:'EARTH',level:8,atk:2700,defense:1500,summary:'Ganha 500 de ATK por cada outro monstro Máquina no campo.',source:official(5804)},
 {id:'42883273',konamiId:4241,name:'Wodan, o Habitante da Floresta',englishName:'Wodan the Resident of the Forest',kind:'monster',monsterType:'effect',race:'Warrior',attribute:'EARTH',level:3,atk:900,defense:1200,summary:'Ganha 100 de ATK para cada monstro Planta com a face para cima no campo.',source:official(4241)}
];

export const mechanicalEffects17:Readonly<Record<string,Effect>>={
 '45311864':{kind:'sequence',activation:{speed:1,window:'main',damage:'never'},operations:[
  {kind:'damage',recipients:[{player:'opponent',amount:500}]},
  {kind:'gainLP',player:'self',amount:500}
 ]},
 '46700124':{kind:'monsterEffect'},
 '82108372':{kind:'monsterEffect'},
 '18891691':{kind:'monsterEffect'},
 '42883273':{kind:'monsterEffect'}
};

const machineCount=(controller:'source'|'opponent',atk:number)=>({kind:'modifier' as const,filter:{selfOnly:true},atk:0,def:0,count:{zone:'monsters' as const,controller,races:['Machine'],faceUp:true,atk,def:0}});
const plantCount=(controller:'source'|'opponent')=>({kind:'modifier' as const,filter:{selfOnly:true},atk:0,def:0,count:{zone:'monsters' as const,controller,races:['Plant'],faceUp:true,atk:100,def:0}});
export const mechanicalMonsters17:Readonly<Record<string,MonsterDefinition>>={
 '46700124':{effect:{trigger:'continuous',operation:{kind:'continuous',rules:[machineCount('source',100),machineCount('opponent',100)]}},activation:{policy:'continuous',window:'continuous'}},
 '82108372':{effect:{trigger:'continuous',operation:{kind:'continuous',rules:[{kind:'modifier',filter:{selfOnly:true},atk:0,def:0,count:{zone:'grave',controller:'source',races:['Fairy'],cardKind:'monster',atk:200,def:0}}]}},activation:{policy:'continuous',window:'continuous'}},
 // The source itself is always an exposed Machine while this continuous effect applies.
 // Remove its one self-count once; never subtract another monster or the printed ATK.
 '18891691':{effect:{trigger:'continuous',operation:{kind:'continuous',rules:[
  {kind:'modifier',filter:{selfOnly:true},atk:-500,def:0},machineCount('source',500),machineCount('opponent',500)
 ]}},activation:{policy:'continuous',window:'continuous'}},
 '42883273':{effect:{trigger:'continuous',operation:{kind:'continuous',rules:[plantCount('source'),plantCount('opponent')]}},activation:{policy:'continuous',window:'continuous'}}
};
