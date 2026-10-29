import type {DuelState,Action} from './duelEngine';
import {getMonsterEffect} from './monsterEffects';
import {groupTargets} from './targetGroupOperation';
import {atk} from './duelEngine';
/** Choices use only public cards and the acting player's own information. */
export function chooseReviewedTarget(s:DuelState,id:string,actions:readonly Action[]):Action|undefined{
 if(s.phase!=='choice'||!['triggerOptional','triggerGroup','triggerTarget','monsterTarget'].includes(s.choice?.source??''))return;
 const source=s.triggerBuild?.selected??(s.pending.kind==='monsterEffect'?s.pending:undefined),op=source?getMonsterEffect(source.id)?.operation:undefined;if(!op||!['targetGroup','singleCard'].includes(op.kind))return;
 const actor=s.players.findIndex(p=>p.id===id),own=s.players[actor],enemy=s.players[1-actor];if(actor<0)return;
 function score(uid:string):number{
  const rival=enemy.monsters.find(c=>c.uid===uid);if(rival)return rival.faceUp?700+atk(rival,s)/10:800;
  const friend=own.monsters.find(c=>c.uid===uid);if(friend)return -700-(friend.faceUp?atk(friend,s)/10:0);
  if(enemy.backrow.some(c=>c.uid===uid)||enemy.field?.uid===uid)return 700;
  if(own.backrow.some(c=>c.uid===uid)||own.field?.uid===uid)return -700;
  if(enemy.grave.some(c=>c.uid===uid))return 600;
  if(own.grave.some(c=>c.uid===uid))return op?.kind==='singleCard'&&op.rule.action==='shuffleDeck'?400:-600;
  return Number.NEGATIVE_INFINITY;
 }
 if(s.choice?.source==='triggerOptional'&&op.kind==='targetGroup'){
  const candidates=groupTargets(s,op.rule),use=candidates.some(uid=>score(uid)>0);return actions.find(a=>a.kind==='choose'&&(use?a.target!=='__skip__':a.target==='__skip__'));
 }
 const choices=actions.filter((a):a is Extract<Action,{kind:'choose'}>=>a.kind==='choose'&&a.target!=='__done__').sort((a,b)=>score(b.target)-score(a.target));
 const best=choices[0],done=actions.find(a=>a.kind==='choose'&&a.target==='__done__');return best&&score(best.target)>0?best:done??best;
}
