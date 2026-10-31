/** Persisted, server-private random stream. Rejection sampling avoids modulo bias.
 * A secret seed is generated once, never sent to public projections or logs.
 */
import {createHmac,randomBytes} from 'node:crypto';
export type DuelRandom={algorithm:'hmac-sha256-v1';seed:string;counter:number};
export function createDuelRandom(seed=randomBytes(32).toString('hex')):DuelRandom{
 if(!/^[a-f0-9]{64}$/.test(seed))throw new Error('Semente do duelo inválida.');
 return {algorithm:'hmac-sha256-v1',seed,counter:0};
}
export function assertDuelRandom(value:unknown):asserts value is DuelRandom{
 const r=value as DuelRandom;
 if(!r||r.algorithm!=='hmac-sha256-v1'||typeof r.seed!=='string'||!/^[a-f0-9]{64}$/.test(r.seed)||!Number.isSafeInteger(r.counter)||r.counter<0)throw new Error('Estado do duelo inválido: sorteio persistido. Nenhuma ação foi gravada.');
}
export function randomIndex(r:DuelRandom,upper:number):number{
 assertDuelRandom(r);
 if(!Number.isSafeInteger(upper)||upper<1||upper>0x100000000)throw new Error('Limite de sorteio inválido.');
 const ceiling=Math.floor(0x100000000/upper)*upper;
 for(;;){
  if(r.counter>=Number.MAX_SAFE_INTEGER)throw new Error('Fluxo de sorteio esgotado.');
  const value=createHmac('sha256',Buffer.from(r.seed,'hex')).update(String(r.counter++)).digest().readUInt32BE(0);
  if(value<ceiling)return value%upper;
 }
}
export function shuffleDuel<T>(values:T[],state:{random?:DuelRandom}):void{
 state.random??=createDuelRandom();
 for(let i=values.length-1;i>0;i--){const j=randomIndex(state.random,i+1);[values[i],values[j]]=[values[j],values[i]];}
}
