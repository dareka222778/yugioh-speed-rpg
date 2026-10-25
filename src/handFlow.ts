import {normalizeTeamHands,prepareTeamOverflow} from './teamRotation';
/** Persisted hand decisions. No UI, hidden deck identities or DB side effects. */
import type {DuelState} from './duelEngine';
import type {EconomicOperation,EconomicServices} from './economicOperations';
export type HandFlow={actor:number;remaining:number;mode:'draw'|'overflow';returnPhase:'main'|'battle'|'response';after:EconomicOperation[];resumeChainRoot?:boolean};
export const usesSeven=(s:DuelState)=>s.rulesVersion==='speed-rpg-v2';
export function drawCards(s:DuelState,actor:number,count:number,service:EconomicServices):boolean{
 normalizeTeamHands(s);const p=s.players[actor];
 if(!usesSeven(s)){
  if(p.deck.length<count){service.finish(s,1-actor,count===1?'não conseguiu comprar uma carta':`não conseguiu comprar ${count} cartas`);return false;}
  p.hand.push(...p.deck.splice(0,count));return true;
 }
 for(let n=0;n<count;n++){
  if(!p.deck.length){service.finish(s,1-actor,'não conseguiu comprar uma carta');return false;}
  if(p.hand.length>=7){
   s.handFlow={actor,remaining:count-n,mode:'draw',returnPhase:s.phase as HandFlow['returnPhase'],after:[]};s.phase='discard';
   s.log=[...s.log,`${p.name} precisa abrir espaço na mão antes de comprar.`].slice(-12);return false;
  }
  p.hand.push(p.deck.shift()!);
 }
 return true;
}
export function pauseOverflow(s:DuelState):boolean{
 if(!usesSeven(s)||!['main','battle','response'].includes(s.phase)||s.handFlow)return false;
 prepareTeamOverflow(s);const actor=s.players.findIndex(p=>p.hand.length>7);if(actor<0)return false;
 s.handFlow={actor,remaining:0,mode:'overflow',returnPhase:s.phase as HandFlow['returnPhase'],after:[]};s.phase='discard';
 s.log=[...s.log,`${s.players[actor].name} deve descartar o excedente até ficar com sete cartas.`].slice(-12);return true;
}
