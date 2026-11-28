import {getDuelCard} from './effectRegistry';
/** Shared operations know zone semantics, never a printed card name or ID. */
import {canAffectMonster,type EffectKind} from './continuousEffects';
import type {DuelState,Monster} from './duelEngine';
import type {DestructionModel} from './effectModels';
export type DestructionServices={kind?:EffectKind;destroy:(s:DuelState,uid:string)=>void;banish?:(s:DuelState,uid:string)=>boolean;attack:(m:Monster,s:DuelState)=>number};
export function destructionTargets(s:DuelState,actor:number,model:DestructionModel,target?:string):string[]{
 return s.players.flatMap((p,index)=>{
  if((model.scope==='opponent'||model.controller==='opponent')&&index===actor)return [];
  return p.monsters.filter(m=>(model.scope!=='selected'||m.uid===target)&&(!model.faceUp||m.faceUp)&&(!model.position||m.position===model.position)&&(!model.races||model.races.includes(getDuelCard(m.id)?.race??''))&&(!model.equipped||s.players.some(owner=>owner.backrow.some(b=>b.faceUp&&b.resolved===true&&b.equippedTo===m.uid)))).map(m=>m.uid);
 });
}
export function executeDestruction(s:DuelState,actor:number,model:DestructionModel,target:string|undefined,services:DestructionServices):number{
 // Select the whole group before mutating zones/equips or collecting triggers.
 const targets=destructionTargets(s,actor,model,target).filter(uid=>{const m=s.players.flatMap(p=>p.monsters).find(m=>m.uid===uid);return !!m&&(!services.kind||canAffectMonster(s,uid,services.kind))&&(model.minimumAtk===undefined||services.attack(m,s)>=model.minimumAtk);});let affected=0;
 for(const uid of targets){
  const monster=s.players.flatMap(p=>p.monsters).find(m=>m.uid===uid);
  if(!monster)continue;
  if(model.destination==='banished'){
   if(!services.banish)throw new Error('Operação de banimento indisponível.');
   if(services.banish(s,uid))affected++;
  }else {services.destroy(s,uid);affected++;}
 }
 return affected;
}
