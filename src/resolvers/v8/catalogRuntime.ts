import {createHash} from 'node:crypto';
import {buildCardRegistry} from './cardRegistry';
import {getEffectModel} from './effectModels';
import {withCatalog,type CatalogData,type CatalogRuntime} from './catalogContext';
const cache=new Map<string,CatalogRuntime>();
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
export function createCatalogRuntime(id:string,input:CatalogData):CatalogRuntime{
 const found=cache.get(id);if(found)return found;
 if(!/^[a-f0-9]{64}$/.test(id)||input?.format!==1||!['engine-v7','engine-v8'].includes(input.engineVersion)||!Array.isArray(input.cards)||input.cards.length>5000||createHash('sha256').update(JSON.stringify(input)).digest('hex')!==id)throw Error('Catálogo incompatível com esta semântica.');
 const data=freeze(structuredClone(input)),registry=buildCardRegistry(data.cards,data.effects,data.certificates,{monster:id=>data.monsters[id],model:getEffectModel});
 if(registry.enabled.length!==data.cards.length)throw Error('Catálogo contém carta sem certificação válida.');
 const runtime:CatalogRuntime={id,data,metadata:registry.metadata,effects:registry.effects,statuses:registry.statuses,enabled:Object.freeze([...registry.enabled])};Object.freeze(runtime);cache.set(id,runtime);return runtime;
}
export function runCatalog<T>(id:string,data:CatalogData,work:()=>T):T{return withCatalog(createCatalogRuntime(id,data),work);}
