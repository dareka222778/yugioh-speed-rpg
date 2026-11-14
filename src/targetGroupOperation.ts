import type {DuelState,CardRef,Monster} from './duelEngine';
import type {TargetGroupRule} from './targetGroupRules';
import {getDuelCard} from './effectRegistry';
import {canAffectMonster} from './continuousEffects';
import {targetBindingValid,type TargetBinding} from './cardLifetime';
import {ownedPrivateZone} from './teamRotation';
import {removeToken} from './tokens';
function pool(s:DuelState,r:TargetGroupRule){return s.players.flatMap((p,controller)=>(r.from==='monsters'?p.monsters:[...p.backrow,...p.field?[p.field]:[]]).map(ref=>({ref,controller})));}
export function groupTargets(s:DuelState,r:TargetGroupRule):string[]{return pool(s,r).filter(x=>!r.faceDownOnly||!x.ref.faceUp).map(x=>x.ref.uid);}
export function groupChoices(s:DuelState,r:TargetGroupRule,selected:readonly string[]):string[]{return [...groupTargets(s,r).filter(uid=>!selected.includes(uid)),...selected.length>=r.minimum?['__done__']:[]];}
export type GroupServices={destroyMonster:(s:DuelState,uid:string)=>unknown;destroyBackrow:(s:DuelState,uid:string)=>unknown;cleanEquips:(s:DuelState)=>unknown};
/** Snapshot all eligible original targets before moving any of them. No target can be chosen again. */
export function executeTargetGroup(s:DuelState,r:TargetGroupRule,targets:readonly string[],bindings:readonly TargetBinding[],services:GroupServices):number{
 const eligible=new Set(groupTargets(s,r));const selected=pool(s,r).filter(x=>targets.includes(x.ref.uid)&&eligible.has(x.ref.uid)&&targetBindingValid(s,bindings.find(b=>b.uid===x.ref.uid))&&(r.from!=='monsters'||canAffectMonster(s,x.ref.uid,'monster')));let moved=0;
 for(const {ref,controller}of selected){
  if(r.action==='destroy'){if(r.from==='monsters')services.destroyMonster(s,ref.uid);else services.destroyBackrow(s,ref.uid);moved++;continue;}
  if(r.from==='monsters'&&(ref as Monster).entityKind==='token'){removeToken(s,ref.uid,'return');moved++;continue;}
  const player=s.players[controller];if(r.from==='monsters')player.monsters=player.monsters.filter(c=>c.uid!==ref.uid);else{player.backrow=player.backrow.filter(c=>c.uid!==ref.uid);if(player.field?.uid===ref.uid)player.field=null;}
  const destination=getDuelCard(ref.id)?.fusion?'extra':'hand';ownedPrivateZone(s,ref,(ref as Monster).owner??controller,destination).push({uid:ref.uid,id:ref.id} as CardRef);moved++;
 }
 services.cleanEquips(s);return moved;
}
