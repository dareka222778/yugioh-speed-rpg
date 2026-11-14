import type {DuelState} from './duelEngineCurrent';
export const lifetimeZones=['deck','hand','monsters','backrow','grave','extra','banished','field'] as const;
export type CardLifetime={zone:typeof lifetimeZones[number];epoch:number};
export type TargetBinding=CardLifetime&{uid:string};
export type PhysicalMovement={type:'cardMoved';player:string;uid:string;cardId:string;from:CardLifetime['zone'];to:CardLifetime['zone']} & ({visibility:'public'}|{visibility:'private';player:string});
// Transient execution evidence is converted to durable journal rows by the store.
// It is never a replay tape and is not attached to public/saved game state.
const traces=new WeakMap<DuelState,{origin:WeakRef<DuelState>;moves:PhysicalMovement[]}>();
export function beginCardMovementTrace(s:DuelState,origin:DuelState):void{traces.set(s,{origin:new WeakRef(origin),moves:[]});}
export function cardMovementTrace(before:DuelState,after:DuelState):readonly PhysicalMovement[]|undefined{
 const trace=traces.get(after);return trace?.origin.deref()===before?trace.moves.map(move=>({...move})):undefined;
}
/** Controller changes within a zone do not create a new game object. Leaving
 * and returning does. Metadata is optional for pre-existing saved duels. */
export function synchronizeCardLifetimes(s:DuelState):void{
 const lifetimes=s.cardLifetimes??={};
 const pools=s.players.flatMap(p=>lifetimeZones.map(zone=>({player:p.id,zone,cards:zone==='field'?(p.field?[p.field]:[]):p[zone]??[]})));
 for(const [seat,held]of Object.entries(s.teamRotation?.reserves??{}))for(const zone of ['hand','deck','extra'] as const)pools.push({player:s.players[Number(seat)%2].id,zone,cards:held[zone]});
 for(const {player,zone,cards}of pools){
  for(const card of cards){
   const previous=Object.hasOwn(lifetimes,card.uid)?lifetimes[card.uid]:undefined;
   if(!previous||previous.zone!==zone){
    const epoch=previous?previous.epoch+1:0;if(!Number.isSafeInteger(epoch))throw new Error('Limite de identidade de zona excedido.');
    if(previous){const visible=zone==='grave'||zone==='banished'||['monsters','backrow','field'].includes(zone)&&'faceUp' in card&&card.faceUp===true;
     traces.get(s)?.moves.push({type:'cardMoved',player,uid:card.uid,cardId:card.id,from:previous.zone,to:zone,...visible?{visibility:'public'}:{visibility:'private',player}});
    }
    Object.defineProperty(lifetimes,card.uid,{value:{zone,epoch},enumerable:true,writable:true,configurable:true});
   }
  }
 }
}
export function bindTarget(s:DuelState,uid:string|undefined):TargetBinding|undefined{
 if(!uid)return;synchronizeCardLifetimes(s);
 if(!s.players.some(p=>lifetimeZones.some(zone=>(zone==='field'?(p.field?[p.field]:[]):p[zone]??[]).some(c=>c.uid===uid)))&&!Object.values(s.teamRotation?.reserves??{}).some(h=>[...h.hand,...h.deck,...h.extra].some(c=>c.uid===uid)))return;
 const entry=Object.hasOwn(s.cardLifetimes!,uid)?s.cardLifetimes![uid]:undefined;
 return entry?{uid,...entry}:undefined;
}
export function targetBindingValid(s:DuelState,binding:TargetBinding|undefined):boolean{
 if(!binding)return true;const current=bindTarget(s,binding.uid);
 return !!current&&current.zone===binding.zone&&current.epoch===binding.epoch;
}
