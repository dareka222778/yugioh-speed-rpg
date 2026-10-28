import {AsyncLocalStorage} from 'node:async_hooks';
import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
import type {MonsterDefinition} from './monsterEffects';
import type {CardCertificate,CardStatus} from './cardRegistry';
export type CatalogData={format:1;engineVersion:'engine-v7'|'engine-v8';cards:Card[];effects:Record<string,Effect>;monsters:Record<string,MonsterDefinition>;certificates:Record<string,CardCertificate>};
export type CatalogRuntime={id:string;data:CatalogData;metadata:ReadonlyMap<string,Card>;effects:ReadonlyMap<string,Effect>;statuses:ReadonlyMap<string,CardStatus>;enabled:readonly string[]};
const context=new AsyncLocalStorage<CatalogRuntime>();
/** Context belongs to one frozen implementation. Nested calls and async tests
 * restore their parent context; no mutable process-wide "active catalog". */
export function currentCatalog(){return context.getStore();}
export function withCatalog<T>(catalog:CatalogRuntime,work:()=>T):T{return context.run(catalog,work);}
