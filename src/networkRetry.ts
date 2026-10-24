import {setTimeout as delay} from 'node:timers/promises';
const retryable=new Set(['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET']);
export function transientNetworkCode(error:unknown):string|undefined{
 const visited=new Set<unknown>();const pending=[error];while(pending.length&&visited.size<20){const current=pending.shift();if(!current||typeof current!=='object'||visited.has(current))continue;visited.add(current);const e=current as {code?:unknown;status?:unknown;cause?:unknown;errors?:unknown[]};if(typeof e.code==='string'&&retryable.has(e.code))return e.code;if([502,503,504].includes(Number(e.status)))return `HTTP_${e.status}`;if(e.cause)pending.push(e.cause);if(Array.isArray(e.errors))pending.push(...e.errors);}return undefined;
}
// Wait inside the running process: a temporary DNS outage must not trigger a full rebuild loop.
export async function retryNetwork<T>(work:(attempt:number)=>Promise<T>,label:string,options:{sleep?:(ms:number)=>Promise<unknown>;log?:(line:string)=>void}={}):Promise<T>{
 const sleep=options.sleep??delay,log=options.log??console.warn;
 for(let attempt=1;;attempt++)try{return await work(attempt);}catch(error){const code=transientNetworkCode(error);if(!code)throw error;const ms=Math.min(30_000,5_000*2**Math.min(attempt-1,3));log(`[rede] ${label}: ${code}. Tentativa ${attempt} falhou; nova tentativa em ${ms/1000}s. Operação ainda não concluída.`);await sleep(ms);}
}
