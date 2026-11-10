import type {DuelState} from './duelEngine';
/** Overlapping skips cover the same upcoming phase, not consecutive extra turns. */
export function skipDraws(s:DuelState,actor:number,count:1|2){
 const p=s.players[actor];p.skipDrawPhases=Math.max(p.skipDrawPhases??0,count);
}
export function consumeDrawSkip(s:DuelState,actor:number):boolean{
 const p=s.players[actor];if(!p.skipDrawPhases)return false;
 if(--p.skipDrawPhases===0)delete p.skipDrawPhases;
 return true;
}
