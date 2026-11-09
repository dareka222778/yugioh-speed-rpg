import type {DuelState} from './duelEngine';
import {randomIndex,createDuelRandom} from './duelRandom';
import {canAffectMonster,addTemporaryModifier} from './continuousEffects';

function roll(s:DuelState,faces:number){return 1+randomIndex(s.random??=createDuelRandom(),faces);}
function record(s:DuelState,text:string){s.log=[...s.log,text].slice(-12);}
export function diceSide(s:DuelState,actor:number,side:'allies'|'enemies'){return s.players[side==='allies'?actor:1-actor].monsters.filter(m=>m.faceUp);}
export function resolveStatDie(s:DuelState,actor:number,side:'allies'|'enemies'){
 const face=roll(s,6),value=face*(side==='allies'?100:-100),kind=side==='allies'?'spell':'trap';
 record(s,'Resultado do dado: '+face+'.');
 const monsters=diceSide(s,actor,side).filter(m=>canAffectMonster(s,m.uid,kind));
 for(const m of monsters)addTemporaryModifier(s,m.uid,value,value);
}
export function resolveDiceContest(s:DuelState,actor:number,checkLP:(s:DuelState)=>void){
 let own:number,other:number;
 do{own=roll(s,6);other=roll(s,6);record(s,'Dados: '+own+' × '+other+'.');}while(own===other);
 const high=Math.max(own,other),loser=s.players[own>other?1-actor:actor];
 loser.lp=Math.max(0,loser.lp-(high===6?6000:high*500));checkLP(s);
}
function tossThree(s:DuelState){
 const coins=[roll(s,2),roll(s,2),roll(s,2)];record(s,'Moedas: '+coins.map(v=>v===2?'cara':'coroa').join(', ')+'.');
 return coins.filter(v=>v===2).length;
}
export function resolveThreeCoins(s:DuelState,actor:number,destroy:(s:DuelState,uid:string)=>unknown){
 const heads=tossThree(s);if(heads!==3&&heads!==0)return;
 const affected=s.players[heads===3?1-actor:actor].monsters.filter(m=>canAffectMonster(s,m.uid,'monster')).map(m=>m.uid);
 for(const uid of affected)destroy(s,uid);
}

export type CoinTargetZone='monster'|'fieldCard';
export function opposingCoinTargets(s:DuelState,actor:number,zone:CoinTargetZone){
 const p=s.players[1-actor];return [...p.monsters,...zone==='fieldCard'?[...p.backrow,...p.field?[p.field]:[]]:[]].map(c=>c.uid);
}
export function resolveCoinTarget(s:DuelState,actor:number,uid:string|undefined,zone:CoinTargetZone,destroy:(s:DuelState,uid:string)=>unknown,removeBack:(s:DuelState,uid:string)=>unknown){
 const heads=tossThree(s);
 if(heads<2||!uid)return;
 // The UID has already been checked against the activation-time zone lifetime.
 const all=s.players.flatMap(p=>p.monsters);if(all.some(m=>m.uid===uid)){
  if(canAffectMonster(s,uid,'monster'))destroy(s,uid);
 }else if(zone==='fieldCard'&&s.players.some(p=>p.backrow.some(c=>c.uid===uid)||p.field?.uid===uid))removeBack(s,uid);
}
