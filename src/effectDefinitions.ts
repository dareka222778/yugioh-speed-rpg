import {worldNormalEffects16} from './worldNormalBatch16';
import {mechanicalEffects20} from './mechanicalBatch20';
import {mechanicalEffects16} from './mechanicalBatch16';
import {mechanicalEffects17} from './mechanicalBatch17';
import {mechanicalEffects18} from './mechanicalBatch18';
import {mechanicalEffects15} from './mechanicalBatch15';
import {destructionFilterIssues,type DestructionFilter} from './destructionRules';
import {mechanicalEffects8} from './mechanicalBatch8';
import {mechanicalEffects11} from './mechanicalBatch11';
import {mechanicalEffects14} from './mechanicalBatch14';
import {continuousRuleIssues,countFormulaIssues,type ContinuousRule,type CountFormula} from './continuousRules';
import {mechanicalBatch7} from './mechanicalBatch7';
import {mechanicalEffects5} from './mechanicalBatch5';
// Explicit executable definitions, independent from card admission.
import type {ActivationModel} from './effectModels';
import type {EconomicOperation} from './economicOperations';
import {economicOperationIssues} from './economicOperations';
export type Effect=
 |{kind:'destroyFiltered';filter:DestructionFilter}
 |{kind:'continuous';rules:readonly ContinuousRule[];activation:ActivationModel;lpCost?:number}
 |{kind:'temporaryModifier';atk:number;def:number}
 |{kind:'destroySpellTraps';scope:'all'|'opponent'}
 |{kind:'sequence';activation:ActivationModel;operations:readonly EconomicOperation[]}
 |{kind:'attackResponse';activation:ActivationModel;endBattle:boolean;reflectAttack:boolean}
 |{kind:'monsterEffect'|'normal'|'fusion'|'fissure'|'polymerization'|'darkHole'|'cardDestruction'|'giantTrunade'|'shieldSword'|'monsterReborn'|'changeHeart'|'blockAttack'|'deSpell'|'removeTrap'|'reinforcements'|'castleWalls'|'waboku'|'trapHole'|'justDesserts'|'magicJammer'|'sevenTools'|'potOfGreed'|'raigeki'|'mysticalSpaceTyphoon'|'bookOfMoon'|'torrentialTribute'|'bottomlessTrapHole'|'sakuretsuArmor'|'mirrorForce'}
 |{kind:'heal'|'burn';amount:number}
 |{kind:'field';races:string[];attributes?:string[];atk:number;def:number;penaltyRaces?:string[];defensePositionOnly?:boolean}
 |{kind:'equip';races?:string[];attribute?:string;names?:string[];monsterType?:'fusion';maxLevel?:number;atk:number;def:number;count?:CountFormula};
export const effectDefinitions:Record<string,Effect>={
 ...mechanicalEffects20,
 ...mechanicalEffects14,
 ...worldNormalEffects16,
 ...mechanicalEffects16,
 ...mechanicalEffects17,
 ...mechanicalEffects18,
 ...mechanicalEffects15,
 ...mechanicalEffects11,
 ...mechanicalEffects8,
 ...mechanicalEffects5,...Object.fromEntries(mechanicalBatch7.map(c=>[c.id,{kind:'monsterEffect' as const}])),
 '76103675':{kind:'burn',amount:200},
 '46130346':{kind:'burn',amount:500},
 '20871001':{kind:'heal',amount:400},
 '47852924':{kind:'heal',amount:800},
 '46918794':{kind:'sequence',activation:{speed:1,window:'main',damage:'never'},operations:[{kind:'damage',recipients:[{player:'opponent',amount:1000},{player:'self',amount:500}]}]},
 '70368879':{kind:'sequence',activation:{speed:1,window:'main',damage:'never'},operations:[{kind:'draw',count:1},{kind:'gainLP',player:'opponent',amount:1000}]},
 '83968380':{kind:'sequence',activation:{speed:2,window:'free',damage:'never'},operations:[{kind:'draw',count:1}]},
 '14315573':{kind:'attackResponse',activation:{speed:3,window:'attackDeclared',damage:'never',opponentOnly:true},endBattle:true,reflectAttack:false},
 '62279055':{kind:'attackResponse',activation:{speed:2,window:'attackDeclared',damage:'never',opponentOnly:true},endBattle:false,reflectAttack:true},

 '40640057':{kind:'monsterEffect'},
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
 '29401950':{kind:'bottomlessTrapHole'},
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
/** Runtime boundary for imported/staged data, in addition to TypeScript. */
const executableKinds=new Set<Effect['kind']>(['sequence','attackResponse','monsterEffect','normal','fusion','fissure','polymerization','darkHole','cardDestruction','giantTrunade','shieldSword','monsterReborn','changeHeart','blockAttack','deSpell','removeTrap','reinforcements','castleWalls','waboku','trapHole','justDesserts','magicJammer','sevenTools','potOfGreed','raigeki','mysticalSpaceTyphoon','bookOfMoon','torrentialTribute','bottomlessTrapHole','sakuretsuArmor','mirrorForce','heal','burn','field','equip']);
export function effectDefinitionIssues(value:unknown):string[]{
 const e=value as Effect;
 if(e?.kind==='destroyFiltered')return Object.keys(e).some(k=>!['kind','filter'].includes(k))?['unsupported-destruction-field']:destructionFilterIssues(e.filter);
 if(e?.kind==='continuous')return [...continuousRuleIssues(e.rules),...e.lpCost!==undefined&&(!Number.isSafeInteger(e.lpCost)||e.lpCost<1)?['invalid-continuous-cost']:[]];
 if(e?.kind==='temporaryModifier')return Number.isSafeInteger(e.atk)&&Number.isSafeInteger(e.def)?[]:['invalid-temporary-modifier'];
 if(e?.kind==='destroySpellTraps')return ['all','opponent'].includes(e.scope)?[]:['invalid-spell-trap-scope'];
 if(!e||typeof e!=='object'||!executableKinds.has(e.kind))return ['unknown-effect-operation'];
 if(e.kind==='sequence')return economicOperationIssues(e.operations);
 if(e.kind==='attackResponse'&&(typeof e.endBattle!=='boolean'||typeof e.reflectAttack!=='boolean'||!e.endBattle&&!e.reflectAttack))return ['invalid-attack-response'];
 if((e.kind==='heal'||e.kind==='burn')&&(!Number.isSafeInteger(e.amount)||e.amount<=0))return ['invalid-effect-amount'];
 if(e.kind==='field'||e.kind==='equip'){
  if(!Number.isSafeInteger(e.atk)||!Number.isSafeInteger(e.def))return ['invalid-modifier'];
  if(e.races!==undefined&&(!Array.isArray(e.races)||e.races.some(x=>typeof x!=='string'||!x)))return ['invalid-race-filter'];
  if(e.kind==='equip'&&e.attribute!==undefined&&(typeof e.attribute!=='string'||!e.attribute))return ['invalid-attribute-filter'];
  if(e.kind==='equip'&&e.names!==undefined&&(!Array.isArray(e.names)||!e.names.length||e.names.some(x=>typeof x!=='string'||!x)))return ['invalid-name-filter'];
  if(e.kind==='equip'&&e.monsterType!==undefined&&e.monsterType!=='fusion')return ['invalid-monster-category-filter'];
  if(e.kind==='equip'&&e.maxLevel!==undefined&&(!Number.isSafeInteger(e.maxLevel)||e.maxLevel<1||e.maxLevel>12))return ['invalid-level-filter'];
  if(e.kind==='field'&&e.penaltyRaces!==undefined&&(!Array.isArray(e.penaltyRaces)||e.penaltyRaces.some(x=>typeof x!=='string'||!x)))return ['invalid-penalty-filter'];
  if(e.kind==='equip'&&e.count&&countFormulaIssues(e.count).length)return ['invalid-count-formula'];
  if(e.kind==='field'&&e.attributes!==undefined&&(!Array.isArray(e.attributes)||e.attributes.some(x=>!['EARTH','WIND','FIRE','WATER','DARK','LIGHT','DIVINE'].includes(x))))return ['invalid-attribute-filter'];
  if(e.kind==='field'&&e.defensePositionOnly!==undefined&&typeof e.defensePositionOnly!=='boolean')return ['invalid-position-filter'];
  if(e.kind==='field'&&!e.races?.length&&!e.attributes?.length&&!e.defensePositionOnly)return ['missing-field-filter'];
 }
 return [];
}
