import type {Card} from './cardCatalog';
import type {DuelState,CardRef} from './duelEngine';
import {targetBindingValid} from './cardLifetime';
export type RecoveryRule={count:number;filter:{attribute?:string;maxAtk?:number;normal?:true}};
export function recoveryIssues(r:unknown):string[]{
 if(!r||typeof r!=='object')return ['invalid-recovery'];const v=r as RecoveryRule,f=v.filter;
 if(Object.keys(v).some(k=>!['count','filter'].includes(k))||!Number.isSafeInteger(v.count)||v.count<1||v.count>3||!f||typeof f!=='object'||Object.keys(f).some(k=>!['attribute','maxAtk','normal'].includes(k)))return ['invalid-recovery'];
 if(f.attribute!==undefined&&!['DARK','LIGHT','EARTH','WATER','FIRE','WIND'].includes(f.attribute)||f.maxAtk!==undefined&&(!Number.isSafeInteger(f.maxAtk)||f.maxAtk<0)||f.normal!==undefined&&f.normal!==true)return ['invalid-recovery-filter'];return [];
}
export function recoveryMatches(c:Card|undefined,r:RecoveryRule):boolean{return !!c&&c.kind==='monster'&&(!r.filter.attribute||c.attribute===r.filter.attribute)&&(r.filter.maxAtk===undefined||c.atk!==null&&c.atk<=r.filter.maxAtk)&&(!r.filter.normal||c.monsterType==='normal');}
export function recoveryTargets(s:DuelState,actor:number,r:RecoveryRule,getDuelCard:(id:string)=>Card|undefined):CardRef[]{return s.players[actor].grave.filter(ref=>recoveryMatches(getDuelCard(ref.id),r));}
/** Targets are independently revalidated against their original zone epoch. */
export function executeRecovery(s:DuelState,p:Extract<DuelState['pending'],{kind:'spell'}>,r:RecoveryRule,getDuelCard:(id:string)=>Card|undefined):number{
 const player=s.players[p.actor];let count=0;
 for(const uid of p.targets??[]){const binding=p.targetBindings?.find(b=>b.uid===uid);if(!binding||!targetBindingValid(s,binding))continue;
  const i=player.grave.findIndex(c=>c.uid===uid&&recoveryMatches(getDuelCard(c.id),r));if(i>=0){const [ref]=player.grave.splice(i,1);if(getDuelCard(ref.id)?.monsterType==='fusion')(player.extra??=[]).push(ref);else player.hand.push(ref);count++;}
 }return count;
}
