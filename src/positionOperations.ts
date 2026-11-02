import type {DuelState,Monster} from './duelEngine';
import {getDuelCard} from './effectRegistry';
import {canAffectMonster,type EffectKind} from './continuousEffects';
import {bindTarget} from './cardLifetime';
import {getMonsterEffect} from './monsterEffects';
/** Group changes use a resolution-time snapshot; selected changes keep their UID. */
import {namedCard} from './cardIdentity';
import type {PositionRule} from './positionRules';
export function positionTargets(s:DuelState,actor:number,rule:PositionRule,target?:string):Monster[]{
 return s.players.flatMap((p,index)=>(rule.scope==='opponent'||rule.controller==='opponent')&&index===actor||rule.scope==='self'&&index!==actor?[]:p.monsters.filter(m=>
  (rule.mode==='reveal'||rule.mode==='revealAtk'&&rule.controller===undefined?!m.faceUp:rule.mode==='revealDef'?true:m.faceUp||rule.mode==='revealAtk')&&(rule.scope!=='selected'||target===undefined||m.uid===target)&&
  (rule.mode!=='revealAtk'||rule.controller===undefined||m.position==='def')&&
  (rule.mode!=='def'||m.position==='atk')&&(rule.mode!=='set'||m.entityKind!=='token')&&
  (!rule.races||rule.races.includes(getDuelCard(m.id)?.race??''))&&(!rule.excludeNames?.some(n=>namedCard(getDuelCard(m.id)!,n)))));
}
export function executePositionChange(s:DuelState,actor:number,rule:PositionRule,kind:EffectKind,target:string|undefined,setFaceDown:(m:Monster)=>void):number{
 if(rule.scope==='selected'&&!target)return 0;
 const group=positionTargets(s,actor,rule,target).filter(m=>canAffectMonster(s,m.uid,kind));
 for(const m of group){
  if(rule.mode==='set')setFaceDown(m);
  else if(rule.mode==='reveal'||rule.mode==='revealAtk'||rule.mode==='revealDef'){
   const wasHidden=!m.faceUp;m.faceUp=true;
   if(rule.mode!=='reveal')m.position=rule.mode==='revealAtk'?'atk':'def';
   if(wasHidden&&getMonsterEffect(m.id)?.trigger==='flip'){
    const owner=s.players.findIndex(p=>p.monsters.some(c=>c.uid===m.uid));
    (s.effectFlips??=[]).push({actor:owner,card:m.uid,id:m.id,binding:bindTarget(s,m.uid)!});
   }
  }else m.position=rule.mode==='def'?'def':m.position==='atk'?'def':'atk';
 }
 // Effect changes spend neither a manual position change nor a new attack.
 return group.length;
}
