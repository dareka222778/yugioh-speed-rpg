import type {DuelState,Monster} from './duelEngine';
import {getEffect} from './effectRegistry';
import {getMonsterEffect} from './monsterEffects';
import {canAffectMonster} from './continuousEffects';
import {createDuelRandom,randomIndex} from './duelRandom';
export const coinCalls=['__heads__','__tails__'] as const;
export function canActivateGraveWager(s:DuelState,actor:number){
 const n=s.players[1-actor].grave.length;return n>0&&s.players[actor].deck.length>=n;
}
export function openCoinCall(s:DuelState,actor:number,card:string,id:string){
 s.pending={kind:'coinCall',actor,card,id};s.choice={actor,source:'coinCall',targets:[...coinCalls]};s.phase='choice';
}
export function verifyCoinCall(s:DuelState){
 const p=s.pending,c=s.choice;if(p.kind!=='coinCall'&&c?.source!=='coinCall')return;
 if(p.kind!=='coinCall'||s.phase!=='choice'||c?.source!=='coinCall'||c.actor!==p.actor||JSON.stringify(c.targets)!==JSON.stringify(coinCalls)||
 !(getMonsterEffect(p.id)?.operation.kind==='timeWager'&&!s.chainRoot&&s.current===p.actor||getEffect(p.id)?.kind==='graveWager'&&s.chainRoot))throw Error('Escolha de moeda inválida.');
}
export function resolveCalledCoin(s:DuelState,p:Extract<DuelState['pending'],{kind:'coinCall'}>,call:string,svc:{destroy:(s:DuelState,uid:string)=>boolean;attack:(m:Monster,s:DuelState)=>number;checkLP:(s:DuelState)=>void}){
 if(!coinCalls.some(v=>v===call))throw Error('Declare cara ou coroa.');
 const result=coinCalls[randomIndex(s.random??=createDuelRandom(),2)===1?0:1],correct=call===result;
 s.log=[...s.log,'Resultado: '+(result==='__heads__'?'cara':'coroa')+'; '+(correct?'acertou.':'errou.')].slice(-12);
 if(getEffect(p.id)?.kind==='graveWager'){
  const own=s.players[p.actor],other=s.players[1-p.actor];
  if(correct)(other.banished??=[]).push(...other.grave.splice(0));else own.grave.push(...own.deck.splice(0,other.grave.length));return;
 }
 const side=correct?1-p.actor:p.actor,targets=s.players[side].monsters.filter(m=>canAffectMonster(s,m.uid,'monster')).map(m=>({uid:m.uid,attack:m.faceUp?svc.attack(m,s):0}));
 let power=0;for(const t of targets)if(svc.destroy(s,t.uid))power+=t.attack;
 if(!correct&&power){const own=s.players[p.actor];own.lp=Math.max(0,own.lp-Math.ceil(power/2));svc.checkLP(s);}
}
