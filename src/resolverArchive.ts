import * as v1 from './resolvers/v1/duelEngine';
import {getEffect as effectV1,getPlayableCard as cardV1} from './resolvers/v1/effectRegistry';
import {assertDuelState as validateV1} from './resolvers/v1/duelIntegrity';
export const CURRENT_RESOLVER_VERSION='engine-v2' as const;
export type ResolverVersion='engine-v1'|typeof CURRENT_RESOLVER_VERSION;
export function resolverVersionFor(state:{resolverVersion?:unknown}):ResolverVersion{
 const version=state.resolverVersion===undefined?'engine-v1':state.resolverVersion;
 if(version!=='engine-v1'&&version!==CURRENT_RESOLVER_VERSION)throw new Error('Versão de resolvedor incompatível. Estado original preservado.');
 return version;
}
const archived=Object.freeze({...v1,assertDuelState:validateV1,getEffect:(id:string)=>{const value=effectV1(id);return value?structuredClone(value):undefined;},getPlayableCard:(id:string)=>{const value=cardV1(id);return value?structuredClone(value):undefined;}});
export function getArchivedDefinitionResolver(version:'engine-v1'){if(version!=='engine-v1')throw new Error('Resolvedor histórico não recuperado.');return archived;}
/** Explicit, lossless pinning; the caller retains the original serialized save.
 * Missing versions always mean v1, never "whatever engine is current". */
export function pinLegacyResolver<T extends {resolverVersion?:ResolverVersion}>(input:T):T&{resolverVersion:ResolverVersion}{
 if(resolverVersionFor(input)!=='engine-v1')throw new Error('Não é permitido rebaixar um resolvedor.');validateV1(input);return {...structuredClone(input),resolverVersion:'engine-v1'};
}
