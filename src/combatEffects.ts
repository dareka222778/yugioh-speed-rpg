import {getMonsterEffect} from './monsterEffects';
import {monsterEffectsNegated} from './continuousEffects';
import type {DuelState,Monster} from './duelEngine';
import {getDuelCard} from './effectRegistry';
import {continuousCombatRules,continuousModifier} from './continuousEffects';
/** The defender-only and high-ATK clauses inspect *every* opposing card, not
 * just monsters, and use public current ATK at declaration time. */
function opposingCardsMeetDirectCondition(s:DuelState,m:Monster,rule:Extract<import('./combatRules').CombatRule,{kind:'direct'}>):boolean{
 if(!rule.condition)return true;
 const controller=s.players.findIndex(p=>p.monsters.some(x=>x.uid===m.uid));if(controller<0)return false;
 const opponent=s.players[1-controller];
 if(opponent.backrow.length||opponent.field)return false;
 if(rule.condition==='defenseOnly')return opponent.monsters.every(x=>x.position==='def');
 return opponent.monsters.every(x=>{
  if(!x.faceUp)return false;
  const info=getDuelCard(x.id);if(!info)return false;
  const base=x.swappedUntil===s.turn?info.defense:info.atk;
  const attack=Math.max(0,(base??0)+x.atkBoost+continuousModifier(s,x,'atk'));
  return attack>=(rule.minimumAtk??Number.MAX_SAFE_INTEGER);
 });
}
export function canAttackDirectly(s:DuelState,m:Monster):boolean{return getMonsterEffect(m.id)?.operation.kind==='directAttack'&&!monsterEffectsNegated(s,m.uid)||continuousCombatRules(s,m).some(x=>x.rule.kind==='direct'&&opposingCardsMeetDirectCondition(s,m,x.rule));}
export function attackAllowance(s:DuelState,m:Monster):number{return Math.max(1,...continuousCombatRules(s,m).flatMap(x=>x.rule.kind==='attacks'?[x.rule.maximum]:[]));}
export function attacksDeclared(s:DuelState,m:Monster):number{return m.attacked===s.turn?(m.attackCount??1):0;}
export function attackLPCost(s:DuelState,m:Monster):number{return continuousCombatRules(s,m).reduce((n,x)=>n+(x.rule.kind==='attackLP'?x.rule.amount:0),0);}
export function combatStatValue(s:DuelState,m:Monster,stat:'atk'|'def',value:number):number{
 const p=s.pending;if(p.kind!=='attack'||!['damage','calculation'].includes(p.stage))return value;
 const attacking=m.uid===p.card,defending=m.uid===p.target;if(!attacking&&!defending)return value;
 const opponent=s.players.flatMap(p=>p.monsters).find(x=>x.uid===(attacking?p.target:p.card));if(!opponent)return value;
 const info=getDuelCard(opponent.id);let bonus=0,half=false;
 for(const {rule:r} of continuousCombatRules(s,m))if(r.kind==='stat'&&(!r.calculationOnly||p.stage==='calculation')&&(r.when==='battling'||attacking&&r.when==='attacking'||defending&&r.when==='defending')&&(!r.attribute||r.attribute===info?.attribute)&&(!r.race||r.race===info?.race)){
  bonus+=r[stat];if(stat==='def'&&r.halfDef)half=true;
 }
 return half?Math.ceil((value+bonus)/2):value+bonus;
}
export type CombatServices={attack:(m:Monster,s:DuelState)=>number;defense:(m:Monster,s:DuelState)=>number;protected:(s:DuelState,player:number,attacker:string)=>boolean};
/** Compute all destruction/damage before mutating field sources or equipment. */
export function combatOutcome(s:DuelState,actor:number,a:Monster,d:Monster|undefined,services:CombatServices):{destroy:string[];damage:[number,number];difference:number}{
 const context:DuelState={...s,pending:{kind:'attack',actor,card:a.uid,target:d?.uid,stage:'calculation'}},ar=continuousCombatRules(context,a),dr=d?continuousCombatRules(context,d):[];
 const attack=services.attack(a,context),defenderAttack=d?services.attack(d,context):0,defenderPower=d?(d.position==='atk'?defenderAttack:services.defense(d,context)):0,difference=attack-defenderPower,destroy:string[]=[],damage:[number,number]=[0,0];
 const protectedMonster=(m:Monster,owner:number,opposingAtk:number,rules:typeof ar)=>s.players[owner].battleProtectedUntil===s.turn||rules.some(x=>x.rule.kind==='indestructible'&&(x.rule.opponentAtkAtLeast===undefined||opposingAtk>=x.rule.opponentAtkAtLeast)&&(!x.rule.equalAtk||attack===defenderAttack));
 const protectA=protectedMonster(a,actor,defenderAttack,ar),protectD=d&&protectedMonster(d,1-actor,attack,dr);
 if(!d)damage[1-actor]=attack;
 else if(d.position==='atk'){
  if(difference>0){if(!protectD)destroy.push(d.uid);damage[1-actor]=difference;}
  else if(difference<0){if(!protectA)destroy.push(a.uid);damage[actor]=-difference;}
  else if(attack>0){if(!protectA)destroy.push(a.uid);if(!protectD)destroy.push(d.uid);}
 }else if(difference>0){
  if(!protectD)destroy.push(d.uid);
  if(ar.some(x=>x.rule.kind==='piercing'))damage[1-actor]=difference;
 }else if(difference<0)damage[actor]=-difference;
 const involved=[{monster:a,owner:actor,rules:ar},...d?[{monster:d,owner:1-actor,rules:dr}]:[]];
 for(let player=0;player<2;player++){
  if(services.protected(s,player,a.uid)){damage[player]=0;continue;}
  if(involved.some(x=>x.owner===player&&x.rules.some(v=>v.rule.kind==='damage'&&v.rule.mode==='zero'&&v.rule.when==='battle'))){damage[player]=0;continue;}
  const doubles=involved.some(x=>x.rules.some(v=>v.rule.kind==='damage'&&v.rule.mode==='double'&&(v.rule.when==='direct'&&!d&&player===1-actor||v.rule.when==='defending'&&x.monster===d&&player===actor)));
  if(doubles)damage[player]*=2;
 }
 return {destroy,damage,difference};
}
