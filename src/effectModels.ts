/** Small executable vocabulary. Adding metadata never enables a card by itself.
 * Legacy kind names remain identifiers for API/backwards compatibility only.
 */
import type {Effect} from './effectDefinitions';
export type DestructionModel={operation:'destroyMonsters';scope:'all'|'opponent'|'selected';position?:'atk';faceUp?:boolean;minimumAtk?:number;races?:readonly string[];equipped?:true;destination:'grave'|'banished'};
export type ActivationModel={speed:1|2|3;window:'main'|'free'|'attackDeclared'|'summoned'|'spellActivated'|'trapActivated';damage:'never'|'beforeCalculation'|'counter';opponentOnly?:boolean;summonKinds?:readonly ('summon'|'flip'|'specialSummon')[];minimumSummonAtk?:number};
export type SpellTrapModel={activation:ActivationModel;destruction?:DestructionModel};
const main:ActivationModel={speed:1,window:'main',damage:'never'};
const response=(window:ActivationModel['window']='free',damage:ActivationModel['damage']='never'):ActivationModel=>({speed:2,window,damage});
const destroy=(scope:DestructionModel['scope'],extra:Partial<DestructionModel>={}):DestructionModel=>({operation:'destroyMonsters',scope,destination:'grave',...extra});
const models:Partial<Record<Effect['kind'],SpellTrapModel>>={
 ritualSummon:{activation:main},destroyFiltered:{activation:main},
 temporaryModifier:{activation:response('free','beforeCalculation')},
 destroySpellTraps:{activation:main},
 darkHole:{activation:main,destruction:destroy('all')},
 raigeki:{activation:main,destruction:destroy('opponent')},
 torrentialTribute:{activation:{...response('summoned'),summonKinds:['summon','flip','specialSummon']},destruction:destroy('all')},
 mirrorForce:{activation:{...response('attackDeclared'),opponentOnly:true},destruction:destroy('opponent',{position:'atk'})},
 sakuretsuArmor:{activation:{...response('attackDeclared'),opponentOnly:true},destruction:destroy('selected',{faceUp:true,position:'atk'})},
 trapHole:{activation:{...response('summoned'),opponentOnly:true,summonKinds:['summon','flip'],minimumSummonAtk:1000},destruction:destroy('selected',{faceUp:true})},
 bottomlessTrapHole:{activation:{...response('summoned'),opponentOnly:true,summonKinds:['summon','flip','specialSummon'],minimumSummonAtk:1500},destruction:destroy('selected',{faceUp:true,minimumAtk:1500,destination:'banished'})},
 mysticalSpaceTyphoon:{activation:response()},bookOfMoon:{activation:response()},
 reinforcements:{activation:response('free','beforeCalculation')},castleWalls:{activation:response('free','beforeCalculation')},
 waboku:{activation:response()},justDesserts:{activation:response()},
 magicJammer:{activation:{speed:3,window:'spellActivated',damage:'counter'}},
 sevenTools:{activation:{speed:3,window:'trapActivated',damage:'counter'}}
};
export function getEffectModel(kind:Effect['kind']):SpellTrapModel|undefined{return models[kind];}
export function getDestructionModel(value:Effect|Effect['kind']):DestructionModel|undefined{if(typeof value!=='string'&&value.kind==='destroyFiltered')return destroy('all',{faceUp:true,...value.filter});return models[typeof value==='string'?value:value.kind]?.destruction;}

/** Definitions with variable parameters carry their own activation policy. */
export function getActivationModel(effect:Effect):ActivationModel|undefined{
 return effect.kind==='continuous'||effect.kind==='sequence'||effect.kind==='choiceSequence'||effect.kind==='attackResponse'?effect.activation:getEffectModel(effect.kind)?.activation;
}

export function economicOperations(effect:Effect):readonly import('./economicOperations').EconomicOperation[]|undefined{
 if(effect.kind==='sequence')return effect.operations;
 if(effect.kind==='heal')return [{kind:'gainLP',player:'self',amount:effect.amount}];
 if(effect.kind==='burn')return [{kind:'damage',recipients:[{player:'opponent',amount:effect.amount}]}];
 if(effect.kind==='potOfGreed')return [{kind:'draw',count:2}];
}
