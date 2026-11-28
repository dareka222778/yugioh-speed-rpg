import {drawCards} from './handFlow';
/** Reusable, bounded LP/draw operations. Damage recipients in one group are
 * applied together before checking victory; sequences stop when a duel ends. */
import type {DuelState} from './duelEngine';
export type RelativePlayer='self'|'opponent';
export type EconomicCountSelector={zone:'hand'|'grave'|'monsters'|'backrow';player:RelativePlayer|'both';faceUp?:boolean;attribute?:string;includeField?:boolean};
export type EconomicOperation=
 |{kind:'draw';count:number}
 |{kind:'gainLP';player:RelativePlayer;amount:number}
 |{kind:'damage';recipients:readonly {player:RelativePlayer;amount:number}[]}
 |{kind:'scaledLP';direction:'gain'|'damage';recipient:RelativePlayer;amountPerCard:number;selectors:readonly EconomicCountSelector[]};
export type EconomicServices={finish:(s:DuelState,winner:number|null,reason:string)=>void;checkLP:(s:DuelState)=>void;cardAttribute?:(id:string)=>string|undefined};
const positive=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>0;
export function economicOperationIssues(value:unknown):string[]{
 if(!Array.isArray(value)||!value.length||value.length>8)return ['invalid-economic-sequence'];
 for(const op of value){
  if(!op||typeof op!=='object')return ['invalid-economic-operation'];
  if(op.kind==='draw'){if(!positive(op.count))return ['invalid-draw-count'];}
  else if(op.kind==='gainLP'){if(!['self','opponent'].includes(op.player)||!positive(op.amount))return ['invalid-lp-gain'];}
  else if(op.kind==='damage'){
   if(!Array.isArray(op.recipients)||!op.recipients.length||op.recipients.length>2||op.recipients.some((r:any)=>!r||!['self','opponent'].includes(r.player)||!positive(r.amount))||new Set(op.recipients.map((r:any)=>r.player)).size!==op.recipients.length)return ['invalid-damage-group'];
  }else if(op.kind==='scaledLP'){
   if(!['gain','damage'].includes(op.direction)||!['self','opponent'].includes(op.recipient)||!positive(op.amountPerCard)||!Array.isArray(op.selectors)||!op.selectors.length||op.selectors.length>4)return ['invalid-scaled-lp'];
   for(const selector of op.selectors){
    if(!selector||!['hand','grave','monsters','backrow'].includes(selector.zone)||!['self','opponent','both'].includes(selector.player)||selector.faceUp!==undefined&&(selector.zone!=='monsters'||typeof selector.faceUp!=='boolean')||selector.attribute!==undefined&&(selector.zone!=='monsters'||!['EARTH','WIND','DARK','LIGHT','FIRE','WATER','DIVINE'].includes(selector.attribute))||selector.includeField!==undefined&&(selector.zone!=='backrow'||typeof selector.includeField!=='boolean')||Object.keys(selector).some(k=>!['zone','player','faceUp','attribute','includeField'].includes(k)))return ['invalid-scaled-selector'];
   }
  }else return ['unsupported-economic-operation'];
 }
 return [];
}
export function canStartEconomicOperations(s:DuelState,actor:number,ops:readonly EconomicOperation[]):boolean{
 const needed=ops.reduce((n,op)=>n+(op.kind==='draw'?op.count:0),0);return s.players[actor].deck.length>=needed;
}
function countCards(s:DuelState,actor:number,selector:EconomicCountSelector,service:EconomicServices):number{
 const indices=selector.player==='both'?[0,1]:[selector.player==='self'?actor:1-actor];
 return indices.reduce((sum,index)=>{
  const p=s.players[index];
  if(selector.zone==='hand')return sum+p.hand.length;
  if(selector.zone==='grave')return sum+p.grave.length;
  if(selector.zone==='backrow')return sum+p.backrow.length+(selector.includeField&&p.field?1:0);
  return sum+p.monsters.filter(m=>(selector.faceUp===undefined||m.faceUp===selector.faceUp)&&(selector.attribute===undefined||m.faceUp&&service.cardAttribute?.(m.id)===selector.attribute)).length;
 },0);
}
export function executeEconomicOperations(s:DuelState,actor:number,ops:readonly EconomicOperation[],service:EconomicServices):boolean{
 for(const [index,op] of ops.entries()){
  if(s.phase==='finished')return false;
  if(op.kind==='draw'){
   if(!drawCards(s,actor,op.count,service)){if(s.handFlow)s.handFlow.after=ops.slice(index+1);return false;}
  }else if(op.kind==='gainLP')s.players[op.player==='self'?actor:1-actor].lp+=op.amount;
  else if(op.kind==='scaledLP'){
   const total=op.selectors.reduce((n,selector)=>n+countCards(s,actor,selector,service),0)*op.amountPerCard;
   const player=s.players[op.recipient==='self'?actor:1-actor];
   if(op.direction==='gain')player.lp+=total;
   else{player.lp=Math.max(0,player.lp-total);service.checkLP(s);}
  }
  else {
   for(const recipient of op.recipients){const p=s.players[recipient.player==='self'?actor:1-actor];p.lp=Math.max(0,p.lp-recipient.amount);}
   service.checkLP(s);
  }
 }
 return s.phase!=='finished';
}
