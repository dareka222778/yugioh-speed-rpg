import type {DuelState,Monster,TriggerEvent} from './duelEngine';
import {getMonsterEffect} from './monsterEffects';
import {monsterEffectsNegated} from './continuousEffects';
import {drawCards} from './handFlow';
import {createDuelRandom,randomIndex} from './duelRandom';
import type {BattleReward} from './battleRewardRules';
export function piercingFromReward(s:DuelState,m:Monster){const op=getMonsterEffect(m.id)?.operation;return !!m.faceUp&&op?.kind==='battleReward'&&op.rule.piercing&&!monsterEffectsNegated(s,m.uid);}
export function damageTrigger(m:Monster|undefined,actor:number,damage:number):TriggerEvent[]{
 return m?.faceUp&&damage>0&&getMonsterEffect(m.id)?.trigger==='onBattleDamage'?[{actor,card:m.uid,id:m.id}]:[];
}
export function applyBattleReward(s:DuelState,actor:number,r:BattleReward,service:Parameters<typeof drawCards>[3]){
 const rival=1-actor,p=s.players[rival];
 if(r.result==='discardOpponentRandom'){
  if(p.hand.length){s.random??=createDuelRandom();const i=randomIndex(s.random,p.hand.length);p.grave.push(...p.hand.splice(i,1));}
  return;
 }
 const n=r.result==='drawOpponentToSeven'?Math.max(0,7-p.hand.length):('count' in r?r.count:0);
 if(n)drawCards(s,r.result==='drawSelf'?actor:rival,n,service);
}
