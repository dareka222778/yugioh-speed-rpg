/** An attack must actually be negated before a dependent effect can apply. */
import type {DuelState,Monster} from './duelEngineCurrent';
import type {Effect} from './effectDefinitions';
export function resolveAttackResponse(s:DuelState,actor:number,target:string,effect:Extract<Effect,{kind:'attackResponse'}>,services:{attack:(m:Monster,s:DuelState)=>number;checkLP:(s:DuelState)=>void}):boolean{
 const pending=s.pending;
 if(pending.kind!=='attack'||pending.stage!=='declare'||pending.actor===actor||pending.cancelled||pending.card!==target)return false;
 const attacker=s.players[pending.actor].monsters.find(m=>m.uid===target);
 if(!attacker?.faceUp||attacker.position!=='atk')return false;
 pending.cancelled=true;pending.endBattle=effect.endBattle;
 if(effect.reflectAttack){const p=s.players[pending.actor];p.lp=Math.max(0,p.lp-services.attack(attacker,s));services.checkLP(s);}
 return true;
}
