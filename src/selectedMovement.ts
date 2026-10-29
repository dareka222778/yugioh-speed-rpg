import type {Card} from './cardCatalog';
import type {DuelState,CardRef} from './duelEngine';
import type {TargetBinding} from './cardLifetime';
import {bindTarget,targetBindingValid} from './cardLifetime';
export type SelectedMovementRule={from:'grave'|'banished';scope:'self'|'opponent'|'both';destination:'hand'|'grave'|'banished'|'deckTop';minimum:number;maximum:number;minimumMonsters?:number;filter:{monster?:true;nonEffect?:true;maxAtk?:number;flip?:true}};
export type MovementSelection={actor:number;card:string;id:string;kind:'spell'|'trap';returnPhase:'main'|'battle'|'response';targets:string[];bindings:TargetBinding[]};
export function selectedMovementIssues(v:unknown):string[]{
 if(!v||typeof v!=='object')return ['invalid-selected-movement'];const r=v as SelectedMovementRule,f=r.filter;
 if(Object.keys(r).some(k=>!['from','scope','destination','minimum','maximum','minimumMonsters','filter'].includes(k))||!['grave','banished'].includes(r.from)||!['self','opponent','both'].includes(r.scope)||!['hand','grave','banished','deckTop'].includes(r.destination)||r.from===r.destination||!Number.isSafeInteger(r.minimum)||r.minimum<1||!Number.isSafeInteger(r.maximum)||r.maximum<r.minimum||r.maximum>5||r.minimumMonsters!==undefined&&(!Number.isSafeInteger(r.minimumMonsters)||r.minimumMonsters<1)||!f||typeof f!=='object'||Object.keys(f).some(k=>!['monster','nonEffect','maxAtk','flip'].includes(k)))return ['invalid-selected-movement'];
 if(['monster','nonEffect','flip'].some(k=>f[k as 'monster']!==undefined&&f[k as 'monster']!==true)||f.maxAtk!==undefined&&(!Number.isSafeInteger(f.maxAtk)||f.maxAtk<0))return ['invalid-movement-filter'];return [];
}
export function selectedMovementTargets(s:DuelState,actor:number,r:SelectedMovementRule,getCard:(id:string)=>Card|undefined,isFlip:(id:string)=>boolean,activation=false):CardRef[]{
 if(activation&&r.minimumMonsters!==undefined&&s.players[actor][r.from]!.filter(c=>getCard(c.id)?.kind==='monster').length<r.minimumMonsters)return [];
 return s.players.flatMap((p,index)=>r.scope==='self'&&index!==actor||r.scope==='opponent'&&index===actor?[]:p[r.from]??[]).filter(ref=>{const c=getCard(ref.id),f=r.filter;return !!c&&(!f.monster||c.kind==='monster')&&(!f.nonEffect||c.kind==='monster'&&c.monsterType!=='effect')&&(f.maxAtk===undefined||c.atk!==null&&c.atk<=f.maxAtk)&&(!f.flip||isFlip(ref.id));});
}
export function movementChoiceTargets(s:DuelState,f:MovementSelection,r:SelectedMovementRule,getCard:(id:string)=>Card|undefined,isFlip:(id:string)=>boolean):string[]{
 const candidates=selectedMovementTargets(s,f.actor,r,getCard,isFlip).filter(c=>!f.targets.includes(c.uid)).map(c=>c.uid);return [...candidates,...f.targets.length>=r.minimum?['__done__']:[]];
}
export function selectMovementTarget(s:DuelState,f:MovementSelection,r:SelectedMovementRule,uid:string):boolean{
 if(uid==='__done__'){if(f.targets.length<r.minimum)throw Error('Selecione a quantidade mínima.');return true;}
 const binding=bindTarget(s,uid);if(!binding||binding.zone!==r.from||f.targets.includes(uid))throw Error('Alvo de movimento inválido.');f.targets.push(uid);f.bindings.push(binding);return f.targets.length===r.maximum;
}
/** Public sources only. A move preserves the original instance and its owner. */
export function executeSelectedMovement(s:DuelState,actor:number,r:SelectedMovementRule,targets:readonly string[],bindings:readonly TargetBinding[],getCard:(id:string)=>Card|undefined,isFlip:(id:string)=>boolean):number{
 const legal=new Set(selectedMovementTargets(s,actor,r,getCard,isFlip).map(c=>c.uid));let moved=0;
 for(const uid of targets){const binding=bindings.find(b=>b.uid===uid);if(!binding||!targetBindingValid(s,binding)||!legal.has(uid))continue;
  const player=s.players.find(p=>p[r.from]?.some(c=>c.uid===uid));if(!player)continue;const pool=player[r.from]!,index=pool.findIndex(c=>c.uid===uid),[ref]=pool.splice(index,1);
  if(['hand','deckTop'].includes(r.destination)&&getCard(ref.id)?.monsterType==='fusion')(player.extra??=[]).push(ref);
  else if(r.destination==='deckTop')player.deck.unshift(ref);
  else (player[r.destination]??=[]).push(ref);moved++;
 }return moved;
}
