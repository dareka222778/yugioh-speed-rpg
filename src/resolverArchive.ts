import * as v3 from './resolvers/v3/duelEngineCurrent';
import {getEffect as effectV3,getPlayableCard as cardV3} from './resolvers/v3/effectRegistry';
import {assertDuelState as validateV3} from './resolvers/v3/duelIntegrity';
import * as v2 from './resolvers/v2/duelEngineCurrent';
import {getEffect as effectV2,getPlayableCard as cardV2} from './resolvers/v2/effectRegistry';
import {assertDuelState as validateV2} from './resolvers/v2/duelIntegrity';
import * as v1 from './resolvers/v1/duelEngine';
import {getEffect as effectV1,getPlayableCard as cardV1} from './resolvers/v1/effectRegistry';
import {assertDuelState as validateV1} from './resolvers/v1/duelIntegrity';
export const CURRENT_RESOLVER_VERSION='engine-v3' as const;
export type ResolverVersion='engine-v1'|'engine-v2'|typeof CURRENT_RESOLVER_VERSION;
export function resolverVersionFor(state:{resolverVersion?:unknown}):ResolverVersion{
 const version=state.resolverVersion===undefined?'engine-v1':state.resolverVersion;
 if(version!=='engine-v1'&&version!=='engine-v2'&&version!==CURRENT_RESOLVER_VERSION)throw new Error('Versão de resolvedor incompatível. Estado original preservado.');
 return version;
}
const archived=Object.freeze({...v1,assertDuelState:validateV1,getEffect:(id:string)=>{const value=effectV1(id);return value?structuredClone(value):undefined;},getPlayableCard:(id:string)=>{const value=cardV1(id);return value?structuredClone(value):undefined;}});
const archivedV2=Object.freeze({...v2,assertDuelState:validateV2,getEffect:(id:string)=>{const value=effectV2(id);return value?structuredClone(value):undefined;},getPlayableCard:(id:string)=>{const value=cardV2(id);return value?structuredClone(value):undefined;}});
const archivedV3=Object.freeze({...v3,assertDuelState:validateV3,getEffect:(id:string)=>{const value=effectV3(id);return value?structuredClone(value):undefined;},getPlayableCard:(id:string)=>{const value=cardV3(id);return value?structuredClone(value):undefined;}});
export function getArchivedDefinitionResolver(version:'engine-v3'):typeof archivedV3;
export function getArchivedDefinitionResolver(version:'engine-v1'):typeof archived;
export function getArchivedDefinitionResolver(version:'engine-v2'):typeof archivedV2;
export function getArchivedDefinitionResolver(version:ResolverVersion):typeof archived|typeof archivedV2|typeof archivedV3;
export function getArchivedDefinitionResolver(version:ResolverVersion){if(version==='engine-v3')return archivedV3;if(version==='engine-v1')return archived;if(version==='engine-v2')return archivedV2;throw new Error('Resolvedor histórico não recuperado.');}
/** Explicit, lossless pinning; the caller retains the original serialized save.
 * Missing versions always mean v1, never "whatever engine is current". */
export function pinLegacyResolver<T extends {resolverVersion?:ResolverVersion}>(input:T):T&{resolverVersion:ResolverVersion}{
 if(resolverVersionFor(input)!=='engine-v1')throw new Error('Não é permitido rebaixar um resolvedor.');validateV1(input);return {...structuredClone(input),resolverVersion:'engine-v1'};
}
