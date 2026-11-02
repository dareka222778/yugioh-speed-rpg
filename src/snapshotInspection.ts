import {createHash} from 'node:crypto';
import {assertDuelState} from './duelIntegrity';
export function inspectSerializedSnapshot(raw:string|null){
 const sha256=createHash('sha256').update(raw??'').digest('hex'),bytes=Buffer.byteLength(raw??'');
 let state:unknown;try{if(raw===null)throw Error('Estado ausente');state=JSON.parse(raw);}catch{return {status:'quarantined' as const,reasonCode:'INVALID_JSON',reason:'JSON inválido ou estado ausente.',sha256,bytes};}
 try{assertDuelState(state);return {status:'valid' as const,resolverVersion:state.resolverVersion??'engine-v1',sha256,bytes};}
 catch(error){return {status:'quarantined' as const,reasonCode:'INVALID_STATE',reason:error instanceof Error?error.message:'Estado incompatível.',sha256,bytes};}
}
