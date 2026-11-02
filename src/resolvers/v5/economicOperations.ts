import {drawCards} from './handFlow';
/** Reusable, bounded LP/draw operations. Damage recipients in one group are
 * applied together before checking victory; sequences stop when a duel ends. */
import type {DuelState} from './duelEngineCurrent';
export type RelativePlayer='self'|'opponent';
export type EconomicOperation=
 |{kind:'draw';count:number}
 |{kind:'gainLP';player:RelativePlayer;amount:number}
 |{kind:'damage';recipients:readonly {player:RelativePlayer;amount:number}[]};
export type EconomicServices={finish:(s:DuelState,winner:number|null,reason:string)=>void;checkLP:(s:DuelState)=>void};
const positive=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>0;
export function economicOperationIssues(value:unknown):string[]{
 if(!Array.isArray(value)||!value.length||value.length>8)return ['invalid-economic-sequence'];
 for(const op of value){
  if(!op||typeof op!=='object')return ['invalid-economic-operation'];
  if(op.kind==='draw'){if(!positive(op.count))return ['invalid-draw-count'];}
  else if(op.kind==='gainLP'){if(!['self','opponent'].includes(op.player)||!positive(op.amount))return ['invalid-lp-gain'];}
  else if(op.kind==='damage'){
   if(!Array.isArray(op.recipients)||!op.recipients.length||op.recipients.length>2||op.recipients.some((r:any)=>!r||!['self','opponent'].includes(r.player)||!positive(r.amount))||new Set(op.recipients.map((r:any)=>r.player)).size!==op.recipients.length)return ['invalid-damage-group'];
  }else return ['unsupported-economic-operation'];
 }
 return [];
}
export function canStartEconomicOperations(s:DuelState,actor:number,ops:readonly EconomicOperation[]):boolean{
 const needed=ops.reduce((n,op)=>n+(op.kind==='draw'?op.count:0),0);return s.players[actor].deck.length>=needed;
}
export function executeEconomicOperations(s:DuelState,actor:number,ops:readonly EconomicOperation[],service:EconomicServices):boolean{
 for(const [index,op] of ops.entries()){
  if(s.phase==='finished')return false;
  if(op.kind==='draw'){
   if(!drawCards(s,actor,op.count,service)){if(s.handFlow)s.handFlow.after=ops.slice(index+1);return false;}
  }else if(op.kind==='gainLP')s.players[op.player==='self'?actor:1-actor].lp+=op.amount;
  else {
   for(const recipient of op.recipients){const p=s.players[recipient.player==='self'?actor:1-actor];p.lp=Math.max(0,p.lp-recipient.amount);}
   service.checkLP(s);
  }
 }
 return s.phase!=='finished';
}
