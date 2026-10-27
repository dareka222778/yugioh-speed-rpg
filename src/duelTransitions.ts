import {resolverVersionFor} from './resolverArchive';
import {transitionEvents as legacyTransitionEvents} from './resolvers/v1/duelTransitions';
import type {DuelState as LegacyDuelState} from './resolvers/v1/duelEngine';
/** Structured before/after transition notifications, independent of translated logs.
 * These summarize committed state changes; they are not an atomic effect trace
 * or a replay tape. Replay uses state + action + persisted private RNG instead.
 */
import {step,decisionPlayer,type DuelState,type Action,type CardRef} from './duelEngine';
import {cardMovementTrace} from './cardLifetime';
type Zone='deck'|'hand'|'monsters'|'backrow'|'grave'|'extra'|'banished'|'field';
type Audience={visibility:'public'}|{visibility:'private';player:string};
export type DuelTransitionEvent=(
 |{type:'tokenCreated';player:string;uid:string;cardId:string}
 |{type:'tokenRemoved';player:string;uid:string;cardId:string;cause:string}
 |{type:'lpChanged';player:string;before:number;after:number}
 |{type:'zoneCountChanged';player:string;zone:Zone;before:number;after:number}
 |{type:'cardMoved';player:string;uid:string;cardId:string;from:Zone;to:Zone}
 |{type:'cardRevealed';player:string;uid:string;cardId:string}
 |{type:'decisionChanged';player:string;phase:DuelState['phase']}
 |{type:'duelFinished';winner:string|null;reason:string}
)&Audience;
function inventory(s:DuelState){
 const cards=new Map<string,{card:CardRef;zone:Zone;player:string;public:boolean}>();
 for(const p of s.players)for(const zone of ['deck','hand','monsters','backrow','grave','extra','banished','field'] as const){
  const list=zone==='field'?p.field?[p.field]:[]:p[zone]??[];
  for(const card of list){const visible=['grave','banished'].includes(zone)||['monsters','backrow','field'].includes(zone)&&'faceUp' in card&&card.faceUp===true;cards.set(card.uid,{card,zone,player:p.id,public:visible});}
 }
 for(const [seat,held]of Object.entries(s.teamRotation?.reserves??{}))for(const zone of ['hand','deck','extra'] as const)for(const card of held[zone])cards.set(card.uid,{card,zone,player:s.players[Number(seat)%2].id,public:false});
 return cards;
}
export function transitionEvents(before:DuelState,after:DuelState):DuelTransitionEvent[]{
 if(resolverVersionFor(before)==='engine-v1')return legacyTransitionEvents(before as unknown as LegacyDuelState,after as unknown as LegacyDuelState);
 const trace=cardMovementTrace(before,after),moved=new Set(trace?.map(move=>move.uid));
 const events:DuelTransitionEvent[]=[],old=inventory(before),next=inventory(after);
 for(const [i,p]of after.players.entries()){
  const prev=before.players[i];if(prev.lp!==p.lp)events.push({type:'lpChanged',player:p.id,before:prev.lp,after:p.lp,visibility:'public'});
  for(const zone of ['deck','hand','monsters','backrow','grave','extra','banished','field'] as const){
   const count=(cards:ReturnType<typeof inventory>)=>[...cards.values()].filter(c=>c.player===p.id&&c.zone===zone).length;
   const a=count(old),b=count(next);if(a!==b)events.push({type:'zoneCountChanged',player:p.id,zone,before:a,after:b,visibility:'public'});
  }
 }
 if(trace)events.push(...trace);
 for(const event of (after.tokenLedger?.events??[]).slice(before.tokenLedger?.events.length??0)){
  const token=after.tokenLedger!.entries.find(t=>t.uid===event.uid)!;
  const player=after.players[token.owner].id;
  if(event.kind==='created')events.push({type:'tokenCreated',player,uid:token.uid,cardId:token.id,visibility:'public'});
  else events.push({type:'tokenRemoved',player,uid:token.uid,cardId:token.id,cause:event.cause!,visibility:'public'});
 }
 for(const [uid,c]of next){const previous=old.get(uid);if(!previous)continue;
  if(moved.has(uid))continue;
  if(previous.zone!==c.zone||previous.player!==c.player){
   const audience:Audience=c.public?{visibility:'public'}:{visibility:'private',player:c.player};
   events.push({type:'cardMoved',player:c.player,uid,cardId:c.card.id,from:previous.zone,to:c.zone,...audience});
  }else if(!previous.public&&c.public)events.push({type:'cardRevealed',player:c.player,uid,cardId:c.card.id,visibility:'public'});
 }
 if(before.phase!=='finished'&&after.phase==='finished')events.push({type:'duelFinished',winner:after.winner,reason:after.reason,visibility:'public'});
 else if(after.phase!=='finished'&&(before.phase!==after.phase||decisionPlayer(before)!==decisionPlayer(after)||before.turn!==after.turn))events.push({type:'decisionChanged',player:after.players[decisionPlayer(after)].id,phase:after.phase,visibility:'public'});
 return events;
}
export function projectTransitionEvents(events:readonly DuelTransitionEvent[],viewer?:string):DuelTransitionEvent[]{
 return events.filter(event=>event.visibility==='public'||!!viewer&&event.player===viewer).map(event=>({...event}));
}
export function applyDuelAction(state:DuelState,actor:string,action:Action){
 const next=step(state,actor,action);return {state:next,events:transitionEvents(state,next)};
}
