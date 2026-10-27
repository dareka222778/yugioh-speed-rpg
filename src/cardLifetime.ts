import type {DuelState} from './duelEngine';
export const lifetimeZones=['deck','hand','monsters','backrow','grave','extra','banished','field'] as const;
export type CardLifetime={zone:typeof lifetimeZones[number];epoch:number};
export type TargetBinding=CardLifetime&{uid:string};
/** Controller changes within a zone do not create a new game object. Leaving
 * and returning does. Metadata is optional for pre-existing saved duels. */
export function synchronizeCardLifetimes(s:DuelState):void{
 const lifetimes=s.cardLifetimes??={};
 for(const p of s.players)for(const zone of lifetimeZones){
  const cards=zone==='field'?(p.field?[p.field]:[]):p[zone]??[];
  for(const card of cards){
   const previous=Object.hasOwn(lifetimes,card.uid)?lifetimes[card.uid]:undefined;
   if(!previous||previous.zone!==zone){const epoch=previous?previous.epoch+1:0;if(!Number.isSafeInteger(epoch))throw new Error('Limite de identidade de zona excedido.');Object.defineProperty(lifetimes,card.uid,{value:{zone,epoch},enumerable:true,writable:true,configurable:true});}
  }
 }
}
export function bindTarget(s:DuelState,uid:string|undefined):TargetBinding|undefined{
 if(!uid)return;synchronizeCardLifetimes(s);
 const entry=Object.hasOwn(s.cardLifetimes!,uid)?s.cardLifetimes![uid]:undefined;
 return entry?{uid,...entry}:undefined;
}
export function targetBindingValid(s:DuelState,binding:TargetBinding|undefined):boolean{
 if(!binding)return true;const current=bindTarget(s,binding.uid);
 return !!current&&current.zone===binding.zone&&current.epoch===binding.epoch;
}
