import type {DuelState,Monster} from './duelEngine';
import {getDuelCard} from './effectRegistry';
import {canAffectMonster,type EffectKind} from './continuousEffects';
/** Group changes use a resolution-time snapshot; selected changes keep their UID. */
import type {PositionRule} from './positionRules';
export function positionTargets(s:DuelState,actor:number,rule:PositionRule,target?:string):Monster[]{
 return s.players.flatMap((p,index)=>rule.scope==='opponent'&&index===actor?[]:p.monsters.filter(m=>
  m.faceUp&&(rule.scope!=='selected'||target===undefined||m.uid===target)&&
  (rule.mode!=='def'||m.position==='atk')&&(rule.mode!=='set'||m.entityKind!=='token')&&
  (!rule.races||rule.races.includes(getDuelCard(m.id)?.race??''))));
}
export function executePositionChange(s:DuelState,actor:number,rule:PositionRule,kind:EffectKind,target:string|undefined,setFaceDown:(m:Monster)=>void):number{
 if(rule.scope==='selected'&&!target)return 0;
 const group=positionTargets(s,actor,rule,target).filter(m=>canAffectMonster(s,m.uid,kind));
 for(const m of group){if(rule.mode==='set')setFaceDown(m);else m.position=rule.mode==='def'?'def':m.position==='atk'?'def':'atk';}
 // Effect changes spend neither a manual position change nor a new attack.
 return group.length;
}
