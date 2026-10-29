/** Public operational identity follows the active executable catalog, never a
 * historical fixed count or a saved duel's older catalog context. No DB/login. */
import {CURRENT_RESOLVER_VERSION,getArchivedDefinitionResolver} from './resolverArchive';
import {currentCatalogRevision} from './catalogArchive';
import {releasedCardIds} from './releasedCardIds';
import {RULES_PROFILE,RULES_VERSION} from './rulesProfile';
export function runtimeStatus(){
 const engine=CURRENT_RESOLVER_VERSION;
 const ids=getArchivedDefinitionResolver(engine).IMPLEMENTED_DUEL_CARDS;
 return {release:String(require('../package.json').version),engine,catalog:currentCatalogRevision(engine),certified:ids.length,distributable:ids.filter(id=>releasedCardIds.has(id)).length};
}
export function runtimeStatusLine(){
 const s=runtimeStatus();
 return `Release ${s.release} | ${s.engine} | catálogo ${s.catalog.slice(0,12)} | ${s.certified} cartas habilitadas | ${s.distributable} autorizadas para distribuição | regras ${RULES_VERSION} | mão ${RULES_PROFILE.handLimit}, descarte na Fase Final | Adicional ${RULES_PROFILE.extraDeckMax} | 1v1 e 2v2`;
}
export function runtimePingText(){return `🏓 Pong! ${runtimeStatusLine()}`;}
