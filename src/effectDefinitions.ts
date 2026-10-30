import {effects as m31_single_targetsEffects} from './generated/m31-single-targets';
import {effects as m31_harpie_identityEffects} from './generated/m31-harpie-identity';
import {effects as m31_target_groupsEffects} from './generated/m31-target-groups';
import {effects as m32_exact_fusionEffects} from './generated/m32-exact-fusion';
import {effects as m32_umi_verifiedEffects} from './generated/m32-umi-verified';
import {effects as m32_activation_restrictionsEffects} from './generated/m32-activation-restrictions';
import {effects as m32_optional_trigger_lpEffects} from './generated/m32-optional-trigger-lp';
import {effects as m33_piercing_equipEffects} from './generated/m33-piercing-equip';
import {effects as m33_royal_decreeEffects} from './generated/m33-royal-decree';
import {conditionalEffects30} from './conditionalBatch30';
import {destructionEffects29} from './destructionBatch29';
import {triggerEffects29} from './triggerBatch29';
import {combatEffects29} from './combatBatch29';
import {combatRuleIssues,type CombatRule} from './combatRules';
import {attackEffects28} from './attackBatch28';
import {movementEffects28} from './movementBatch28';
import {mechanicalEffects28} from './mechanicalBatch28';
import {positionEffects26} from './positionBatch26';
import {positionRuleIssues,type PositionRule} from './positionRules';
import {searchSpellEffects25} from './searchSpellBatch25';
import {searchZoneIssues,type SearchZoneRule} from './searchZoneRules';
import {economicCountEffects24} from './economicCountBatch24';
import {economicEffects23} from './economicBatch23';
import {ritualExtensionEffects22} from './ritualExtensions22';
import {ritualEffects22} from './ritualBatch22';
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
import {ritualRuleIssues,type RitualRule} from './ritualRules';
import {recoveryIssues,type RecoveryRule} from './recoveryRules';
import {selectedMovementIssues,type SelectedMovementRule} from './selectedMovement';
export type Effect=
 |{kind:'conditionalDestruction';activation:ActivationModel;zone:'monsters'|'backrow'|'equipSpells';scope:'all'|'opponent'|'selected';controller?:'opponent';requiredName?:string;minFieldMonsters?:number;minBanished?:number;faceUp?:true;equipped?:true;opponentGainOnDestroy?:number}
 |{kind:'destroyExtreme';scope:'all'|'opponent';stat:'atk'|'defense';position?:'atk'|'def';faceUp?:true}
 |{kind:'destroyTargetPosition';position:'atk'|'def'}
 |{kind:'moveSelected';activation:ActivationModel;rule:SelectedMovementRule}
 |{kind:'recoverMultiple';rule:RecoveryRule}
 |{kind:'positionChange';activation:ActivationModel;rule:PositionRule}
 |{kind:'searchZone';rule:SearchZoneRule}
 |{kind:'ritualMonster'}
 |{kind:'choiceSequence';activation:ActivationModel;choices:readonly {operations:readonly EconomicOperation[]}[]}
 |{kind:'ritualSummon';ritual:RitualRule}
 |{kind:'destroyFiltered';filter:DestructionFilter}
 |{kind:'continuous';rules:readonly ContinuousRule[];activation:ActivationModel;lpCost?:number}
 |{kind:'temporaryModifier';atk:number;def:number}
 |{kind:'destroySpellTraps';scope:'all'|'opponent'}
 |{kind:'sequence';activation:ActivationModel;operations:readonly EconomicOperation[]}
 |{kind:'attackResponse';activation:ActivationModel;endBattle:boolean;reflectAttack:boolean}
 |{kind:'monsterEffect'|'normal'|'fusion'|'fissure'|'polymerization'|'darkHole'|'cardDestruction'|'giantTrunade'|'shieldSword'|'monsterReborn'|'changeHeart'|'blockAttack'|'deSpell'|'removeTrap'|'reinforcements'|'castleWalls'|'waboku'|'trapHole'|'justDesserts'|'magicJammer'|'sevenTools'|'potOfGreed'|'raigeki'|'mysticalSpaceTyphoon'|'bookOfMoon'|'torrentialTribute'|'bottomlessTrapHole'|'sakuretsuArmor'|'mirrorForce'}
 |{kind:'heal'|'burn';amount:number}
 |{kind:'field';races:string[];attributes?:string[];atk:number;def:number;penaltyRaces?:string[];defensePositionOnly?:boolean;rules?:readonly ContinuousRule[]}
 |{kind:'equip';races?:string[];attribute?:string;names?:string[];monsterType?:'fusion'|'ritual';maxLevel?:number;atk:number;def:number;count?:CountFormula;combat?:readonly CombatRule[]};
export const effectDefinitions:Record<string,Effect>={
 ...m33_royal_decreeEffects,
 ...m33_piercing_equipEffects,
 ...m32_optional_trigger_lpEffects,
 ...m32_activation_restrictionsEffects,
 ...m32_umi_verifiedEffects,
 ...m32_exact_fusionEffects,
 ...m31_target_groupsEffects,
 ...m31_harpie_identityEffects,
 ...m31_single_targetsEffects,
 ...conditionalEffects30,
 ...destructionEffects29,
 ...triggerEffects29,
 ...combatEffects29,
 ...positionEffects26,
 ...mechanicalEffects28,
 ...movementEffects28,
 ...attackEffects28,
 '55013285':{kind:'monsterEffect'},'93107608':{kind:'monsterEffect'},'77044671':{kind:'monsterEffect'},'39191307':{kind:'monsterEffect'},'24317029':{kind:'monsterEffect'},
 ...searchSpellEffects25,
 ...economicCountEffects24,
 ...economicEffects23,
 ...ritualExtensionEffects22,
 ...ritualEffects22,
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
 if(e?.kind==='conditionalDestruction'){
  if(Object.keys(e).some(k=>!['kind','activation','zone','scope','controller','requiredName','minFieldMonsters','minBanished','faceUp','equipped','opponentGainOnDestroy'].includes(k))||!['monsters','backrow','equipSpells'].includes(e.zone)||!['all','opponent','selected'].includes(e.scope)||e.scope==='selected'&&e.zone!=='monsters'||e.controller!==undefined&&(e.controller!=='opponent'||e.scope!=='selected')||e.requiredName!==undefined&&(typeof e.requiredName!=='string'||!e.requiredName)||e.minFieldMonsters!==undefined&&(!Number.isSafeInteger(e.minFieldMonsters)||e.minFieldMonsters<1)||e.minBanished!==undefined&&(!Number.isSafeInteger(e.minBanished)||e.minBanished<1)||e.faceUp!==undefined&&(e.faceUp!==true||e.zone!=='monsters')||e.equipped!==undefined&&(e.equipped!==true||e.zone!=='monsters')||e.opponentGainOnDestroy!==undefined&&(!Number.isSafeInteger(e.opponentGainOnDestroy)||e.opponentGainOnDestroy<1||e.zone!=='monsters')||!e.activation||![1,2,3].includes(e.activation.speed)||!['main','free','attackDeclared','summoned','spellActivated','trapActivated'].includes(e.activation.window))return ['invalid-conditional-destruction'];
  return [];
 }
 if(e?.kind==='destroyExtreme')return Object.keys(e).some(k=>!['kind','scope','stat','position','faceUp'].includes(k))||!['all','opponent'].includes(e.scope)||!['atk','defense'].includes(e.stat)||e.position!==undefined&&!['atk','def'].includes(e.position)||e.faceUp!==undefined&&e.faceUp!==true?['invalid-extreme-destruction']:[];
 if(e?.kind==='destroyTargetPosition')return Object.keys(e).some(k=>!['kind','position'].includes(k))||!['atk','def'].includes(e.position)?['invalid-position-destruction']:[];
 if(e?.kind==='positionChange')return Object.keys(e).some(k=>!['kind','activation','rule'].includes(k))?['unsupported-position-field']:positionRuleIssues(e.rule);
 if(e?.kind==='moveSelected')return Object.keys(e).some(k=>!['kind','activation','rule'].includes(k))?['unsupported-movement-field']:selectedMovementIssues(e.rule);
 if(e?.kind==='recoverMultiple')return Object.keys(e).some(k=>!['kind','rule'].includes(k))?['unsupported-recovery-field']:recoveryIssues(e.rule);
 if(e?.kind==='searchZone')return Object.keys(e).some(k=>!['kind','rule'].includes(k))?['unsupported-search-field']:searchZoneIssues(e.rule);
 if(e?.kind==='choiceSequence'){
  if(Object.keys(e).some(k=>!['kind','activation','choices'].includes(k))||!Array.isArray(e.choices)||e.choices.length<2||e.choices.length>4||e.choices.some(c=>!c||Object.keys(c).some(k=>k!=='operations')||economicOperationIssues(c.operations).length))return ['invalid-economic-choice'];
  return [];
 }
 if(e?.kind==='ritualMonster')return Object.keys(e).length===1?[]:['invalid-ritual-monster'];
 if(e?.kind==='ritualSummon')return Object.keys(e).some(k=>!['kind','ritual'].includes(k))?['unknown-ritual-field']:ritualRuleIssues(e.ritual);
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
  if(e.kind==='equip'&&e.monsterType!==undefined&&!['fusion','ritual'].includes(e.monsterType))return ['invalid-monster-category-filter'];
  if(e.kind==='equip'&&e.maxLevel!==undefined&&(!Number.isSafeInteger(e.maxLevel)||e.maxLevel<1||e.maxLevel>12))return ['invalid-level-filter'];
  if(e.kind==='field'&&e.penaltyRaces!==undefined&&(!Array.isArray(e.penaltyRaces)||e.penaltyRaces.some(x=>typeof x!=='string'||!x)))return ['invalid-penalty-filter'];
  if(e.kind==='equip'&&e.combat&&(!Array.isArray(e.combat)||!e.combat.length||e.combat.length>8||e.combat.some(r=>combatRuleIssues(r).length)))return ['invalid-equip-combat'];
  if(e.kind==='equip'&&e.count&&countFormulaIssues(e.count).length)return ['invalid-count-formula'];
  if(e.kind==='field'&&e.attributes!==undefined&&(!Array.isArray(e.attributes)||e.attributes.some(x=>!['EARTH','WIND','FIRE','WATER','DARK','LIGHT','DIVINE'].includes(x))))return ['invalid-attribute-filter'];
  if(e.kind==='field'&&e.defensePositionOnly!==undefined&&typeof e.defensePositionOnly!=='boolean')return ['invalid-position-filter'];
  if(e.kind==='field'&&e.rules&&continuousRuleIssues(e.rules).length)return ['invalid-field-rules'];
  if(e.kind==='field'&&!e.rules?.length&&!e.races?.length&&!e.attributes?.length&&!e.defensePositionOnly)return ['missing-field-filter'];
 }
 return [];
}
