import {conditionalMonsters30} from './conditionalBatch30';
import {triggerMonsters29} from './triggerBatch29';
import {positionRuleIssues,type PositionRule} from './positionRules';
import {searchZoneIssues,type SearchZoneRule} from './searchZoneRules';
import {combatMonsters29} from './combatBatch29';
import {recruitMonsters28} from './recruitBatch28';
import {monsterSelectorIssues,type MonsterSelector} from './cardSelectors';
import {mechanicalMonsters16} from './mechanicalBatch16';
import {mechanicalMonsters20} from './mechanicalBatch20';
import {mechanicalMonsters17} from './mechanicalBatch17';
import {mechanicalMonsters18} from './mechanicalBatch18';
import {mechanicalMonsters8} from './mechanicalBatch8';
import {mechanicalMonsters11} from './mechanicalBatch11';
import {mechanicalMonsters14} from './mechanicalBatch14';
import {continuousRuleIssues,type ContinuousRule} from './continuousRules';
import {currentCatalog} from './catalogContext';
import {mechanicalMonsters7} from './mechanicalBatch7';
import {mechanicalMonsters5} from './mechanicalBatch5';
/** Audited, declarative classic monster effects.
 * Each registered effect must have a matching card in effectRegistry.ts.
 * Effects with targets choose them on activation, before the response window.
 */
export type MonsterTrigger='quick'|'ignition'|'flip'|'onSummon'|'onOtherSummon'|'onDestroy'|'onBattleDestroyed'|'onSentToGrave'|'continuous';
export type MonsterCost={kind:'lp';amount:number}|{kind:'discard'|'tribute';count:number};
export type MonsterOperation=
 |{kind:'positionChange';rule:PositionRule}
 |{kind:'searchFiltered';rule:SearchZoneRule}
 |{kind:'mill';count:number;player:'opponent'|'self'}
 |{kind:'recruit';filter:MonsterSelector;positions:readonly ('atk'|'def')[]}
 |{kind:'continuous';rules:readonly ContinuousRule[]}
 |{kind:'heal'|'burn'|'burnPerSpellTrap'|'burnPerHand';amount:number}
 |{kind:'destroyByLevel';level:number}
 |{kind:'draw';count:number}
 |{kind:'destroy'|'bounce';target:'opponentMonster'|'anyMonster'}
 |{kind:'recover';cardKind:'spell'|'trap'}
 |{kind:'search';stat:'atk'|'defense';maximum:number}
 |{kind:'specialSummon';attribute:string;maximumAtk:number}
 |{kind:'negateTraps'|'battleShield'|'directAttack'};
export type MonsterEffect={trigger:MonsterTrigger;summons?:readonly ('normal'|'flip'|'special')[];oncePerTurn?:boolean;cost?:MonsterCost;operation:MonsterOperation};
export type MonsterEffectContext={lp:number;handSize:number;deckSize:number;usedThisTurn:boolean;fieldMonsterCount?:number};

export function canActivateMonsterEffect(effect:MonsterEffect,ctx:MonsterEffectContext):boolean{
 if(effect.oncePerTurn&&ctx.usedThisTurn)return false;
 if(effect.cost?.kind==='lp'&&ctx.lp<=effect.cost.amount)return false;
 if(effect.cost?.kind==='discard'&&ctx.handSize<effect.cost.count)return false;
 if(effect.cost?.kind==='tribute'&&(ctx.fieldMonsterCount??0)<effect.cost.count)return false;
 // Voluntary draw effects need available cards. Mandatory FLIP draws are
 // handled by the duel engine and can lose by deck-out on resolution.
 if(effect.operation.kind==='draw'&&ctx.deckSize<effect.operation.count)return false;
 return true;
}
export function payMonsterEffectCost(effect:MonsterEffect,ctx:MonsterEffectContext):{lpPaid:number;cardsDiscarded:number}{
 if(!canActivateMonsterEffect(effect,ctx))throw new Error('Monster effect activation conditions not met.');
 return {lpPaid:effect.cost?.kind==='lp'?effect.cost.amount:0,cardsDiscarded:effect.cost?.kind==='discard'?effect.cost.count:0};
}
export function monsterEffectOperation(effect:MonsterEffect):MonsterOperation{return effect.operation;}

/** Official card texts: Konami card database (CIDs 4507, 4547, 4434, 4108, 4546, 4518). */
export type MonsterActivation={policy:'mandatory'|'optional'|'manual'|'continuous';window:'main'|'flip'|'summon'|'grave'|'battleDestroyed'|'opposingDamageCalculation'|'continuous'};
export type MonsterDefinition={effect:MonsterEffect;activation:MonsterActivation};
const monsterDefinitions:Readonly<Record<string,MonsterDefinition>>=Object.freeze({
 ...conditionalMonsters30,
 ...triggerMonsters29,
 ...combatMonsters29,
 ...recruitMonsters28,
 ...mechanicalMonsters20,
 ...mechanicalMonsters16,
 ...mechanicalMonsters17,
 ...mechanicalMonsters18,
 ...mechanicalMonsters14,
 ...mechanicalMonsters11,
 ...mechanicalMonsters8,
 ...mechanicalMonsters5,...mechanicalMonsters7,
 '40640057':{effect:{trigger:'quick',cost:{kind:'discard',count:1},operation:{kind:'battleShield'}},activation:{policy:'manual',window:'opposingDamageCalculation'}}, // Kuriboh, self-discard during opposing damage calculation
 '54652250':{effect:{trigger:'flip',operation:{kind:'destroy',target:'anyMonster'}},activation:{policy:'mandatory',window:'flip'}}, // Man-Eater Bug
 '07089711':{effect:{trigger:'flip',operation:{kind:'bounce',target:'anyMonster'}},activation:{policy:'mandatory',window:'flip'}}, // Hane-Hane
 '31560081':{effect:{trigger:'flip',operation:{kind:'recover',cardKind:'spell'}},activation:{policy:'mandatory',window:'flip'}}, // Magician of Faith
 '28933734':{effect:{trigger:'flip',operation:{kind:'recover',cardKind:'trap'}},activation:{policy:'mandatory',window:'flip'}}, // Mask of Darkness
 '60694662':{effect:{trigger:'flip',operation:{kind:'draw',count:1}},activation:{policy:'mandatory',window:'flip'}}, // Skelengel
 '11384280':{effect:{trigger:'ignition',cost:{kind:'tribute',count:1},operation:{kind:'burn',amount:500}},activation:{policy:'manual',window:'main'}}, // Cannon Soldier
 '26202165':{effect:{trigger:'onSentToGrave',oncePerTurn:true,operation:{kind:'search',stat:'atk',maximum:1500}},activation:{policy:'mandatory',window:'grave'}}, // Sangan
 '78010363':{effect:{trigger:'onSentToGrave',oncePerTurn:true,operation:{kind:'search',stat:'defense',maximum:1500}},activation:{policy:'mandatory',window:'grave'}}, // Witch of the Black Forest
 '77585513':{effect:{trigger:'continuous',operation:{kind:'negateTraps'}},activation:{policy:'continuous',window:'continuous'}}, // Jinzo
 '54098121':{effect:{trigger:'onOtherSummon',operation:{kind:'heal',amount:500}},activation:{policy:'mandatory',window:'summon'}}, // Mysterious Puppeteer
 '83011277':{effect:{trigger:'onBattleDestroyed',operation:{kind:'specialSummon',attribute:'DARK',maximumAtk:1500}},activation:{policy:'optional',window:'battleDestroyed'}} // Mystic Tomato
});
export function getMonsterDefinition(cardId:string):MonsterDefinition|undefined{return currentCatalog()?currentCatalog()!.data.monsters[cardId]:monsterDefinitions[cardId];}
export function getMonsterEffect(cardId:string):MonsterEffect|undefined{return getMonsterDefinition(cardId)?.effect;}

/** Validate a selected monster instance against the offered legal target UIDs. */
export function monsterDestructionTarget(effect:MonsterEffect,eligibleMonsterUids:readonly string[],targetUid:string):string{
 if(effect.operation.kind!=='destroy')throw new Error('Effect does not destroy an opponent monster.');
 if(!targetUid||!eligibleMonsterUids.includes(targetUid))throw new Error('Invalid opponent monster target.');
 return targetUid;
}
export function monsterDefinitionIssues(value:MonsterDefinition|undefined):string[]{
 if(!value||!value.effect||!value.activation)return ['missing-monster-definition'];
 const {effect:e,activation:a}=value;
 if(!['mandatory','optional','manual','continuous'].includes(a.policy)||!['main','flip','summon','grave','battleDestroyed','opposingDamageCalculation','continuous'].includes(a.window))return ['invalid-monster-activation'];
 if(!['quick','ignition','flip','onSummon','onOtherSummon','onBattleDestroyed','onSentToGrave','continuous'].includes(e.trigger))return ['unsupported-monster-trigger'];
 if(!e.operation||!['positionChange','searchFiltered','mill','heal','burn','burnPerSpellTrap','burnPerHand','destroyByLevel','draw','destroy','bounce','recover','search','recruit','specialSummon','negateTraps','battleShield','directAttack','continuous'].includes(e.operation.kind))return ['unsupported-monster-operation'];
 if((e.trigger==='quick'||e.trigger==='ignition')&&a.policy!=='manual'||e.trigger==='continuous'&&a.policy!=='continuous')return ['inconsistent-monster-policy'];
 if(!['quick','ignition','continuous'].includes(e.trigger)&&!['mandatory','optional'].includes(a.policy))return ['inconsistent-monster-policy'];
 const windows:Partial<Record<MonsterTrigger,MonsterActivation['window']>>={quick:'opposingDamageCalculation',ignition:'main',flip:'flip',onSummon:'summon',onOtherSummon:'summon',onSentToGrave:'grave',onBattleDestroyed:'battleDestroyed',continuous:'continuous'};
 if(windows[e.trigger]!==a.window)return ['inconsistent-monster-window'];
 const op=e.operation;
 if(e.summons!==undefined&&(e.trigger!=='onSummon'||!Array.isArray(e.summons)||!e.summons.length||new Set(e.summons).size!==e.summons.length||e.summons.some(t=>!['normal','flip','special'].includes(t))))return ['invalid-summon-event-filter'];
 if(op.kind==='positionChange')return e.cost!==undefined||!['flip','onSummon'].includes(e.trigger)||Object.keys(op).some(k=>!['kind','rule'].includes(k))||op.rule?.scope!=='selected'||positionRuleIssues(op.rule).length?['invalid-monster-position']:[];
 if(op.kind==='searchFiltered')return e.cost!==undefined||!['flip','onSummon'].includes(e.trigger)||Object.keys(op).some(k=>!['kind','rule'].includes(k))||op.rule?.from!=='deck'||searchZoneIssues(op.rule).length?['invalid-filtered-monster-search']:[];
 if(op.kind==='mill')return e.cost!==undefined||e.trigger!=='flip'||Object.keys(op).some(k=>!['kind','count','player'].includes(k))||!Number.isSafeInteger(op.count)||op.count<1||op.count>30||!['opponent','self'].includes(op.player)?['invalid-monster-mill']:[];
 if(op.kind==='recruit')return e.cost!==undefined||Object.keys(op).some(k=>!['kind','filter','positions'].includes(k))||!['flip','onBattleDestroyed'].includes(e.trigger)||monsterSelectorIssues(op.filter).length||!Array.isArray(op.positions)||!op.positions.length||new Set(op.positions).size!==op.positions.length||op.positions.some(p=>!['atk','def'].includes(p))?['invalid-recruit-operation']:[];
 // Admission constraints only: frozen executables never implement paid/pass-
 // limited continuous activations or passive operations as ignition commands.
 if(e.trigger==='continuous'&&(e.cost||e.oncePerTurn))return ['unsupported-continuous-activation'];
 if(['directAttack','negateTraps'].includes(op.kind)&&e.trigger!=='continuous')return ['unsupported-monster-mechanic'];
 if(op.kind==='continuous')return e.trigger==='continuous'?continuousRuleIssues(op.rules):['invalid-continuous-trigger'];
 if(op.kind==='destroyByLevel'&&(!Number.isSafeInteger(op.level)||op.level<1||op.level>12))return ['invalid-monster-level'];
 if((op.kind==='destroy'||op.kind==='bounce')&&!['opponentMonster','anyMonster'].includes(op.target)||op.kind==='recover'&&!['spell','trap'].includes(op.cardKind))return ['invalid-monster-selector'];
 if(op.kind==='search'&&(!['atk','defense'].includes(op.stat)||!Number.isSafeInteger(op.maximum)||op.maximum<0)||op.kind==='specialSummon'&&(!Number.isSafeInteger(op.maximumAtk)||op.maximumAtk<0||!['DARK','LIGHT','EARTH','WIND','WATER','FIRE','DIVINE'].includes(op.attribute)))return ['invalid-deck-filter'];
 if(e.trigger==='quick'&&(op.kind!=='battleShield'||e.cost?.kind!=='discard'||e.cost.count!==1)||e.trigger==='continuous'&&!['negateTraps','directAttack','continuous'].includes(op.kind))return ['unsupported-monster-mechanic'];
 if((a.policy==='mandatory'||a.policy==='optional')&&e.cost)return ['unsupported-trigger-cost'];
 if((op.kind==='heal'||op.kind==='burn'||op.kind==='burnPerSpellTrap'||op.kind==='burnPerHand')&&(!Number.isSafeInteger(op.amount)||op.amount<=0)||op.kind==='draw'&&(!Number.isSafeInteger(op.count)||op.count<=0))return ['invalid-monster-amount'];
 if(e.cost&&(e.cost.kind==='lp'?(!Number.isSafeInteger(e.cost.amount)||e.cost.amount<=0):!['tribute','discard'].includes(e.cost.kind)||!Number.isSafeInteger(e.cost.count)||e.cost.count<1))return ['invalid-monster-cost'];
 return [];
}
