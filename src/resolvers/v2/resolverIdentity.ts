export const CURRENT_RESOLVER_VERSION='engine-v2' as const;
export type ResolverVersion=typeof CURRENT_RESOLVER_VERSION;
export function resolverVersionFor(s:{resolverVersion?:unknown}):ResolverVersion{if(s.resolverVersion!==CURRENT_RESOLVER_VERSION)throw new Error('Resolvedor v2 incompatível.');return CURRENT_RESOLVER_VERSION;}
