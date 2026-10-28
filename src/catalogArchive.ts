import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {CatalogData} from './catalogContext';
export type CatalogVersion='engine-v7'|'engine-v8'|'engine-v9';
type Manifest={format:1;engineVersion:CatalogVersion;current:string;revisions:{id:string;file:string;sha256:string}[]};
const manifests=new Map<CatalogVersion,Manifest>(),cache=new Map<string,CatalogData>();
const folder=(version:CatalogVersion)=>{if(!['engine-v7','engine-v8','engine-v9'].includes(version))throw Error('Incompatible catalog version');return path.resolve(typeof __dirname==='string'&&path.isAbsolute(__dirname)?__dirname:process.cwd()+'/src','../catalog',version);};
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const hash=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
function getManifest(version:CatalogVersion){let m=manifests.get(version);if(!m){m=JSON.parse(fs.readFileSync(path.join(folder(version),'manifest.json'),'utf8')) as Manifest;if(m.format!==1||m.engineVersion!==version||!Array.isArray(m.revisions)||new Set(m.revisions.map(r=>r.id)).size!==m.revisions.length||!m.revisions.some(r=>r.id===m!.current))throw Error('Incompatible catalog manifest');for(const r of m.revisions)if(!/^[a-f0-9]{64}$/.test(r.id)||r.file!==r.id+'.json'||!/^[a-f0-9]{64}$/.test(r.sha256))throw Error('Invalid catalog reference');manifests.set(version,m);}return m;}
/** Default v7 preserves audit API compatibility. Executable facades pin a version. */
export function currentCatalogRevision(version:CatalogVersion='engine-v7'){return getManifest(version).current;}
export function getCatalogData(id:string,version:CatalogVersion='engine-v7'):CatalogData{const key=version+':'+id,found=cache.get(key);if(found)return found;const entry=getManifest(version).revisions.find(r=>r.id===id);if(!entry)throw Error('Catalog revision not recovered; save preserved');const bytes=fs.readFileSync(path.join(folder(version),entry.file));if(hash(bytes)!==entry.sha256)throw Error('Catalog hash mismatch');const data=JSON.parse(bytes.toString('utf8')) as CatalogData;if(data.format!==1||data.engineVersion!==version||hash(JSON.stringify(data))!==id)throw Error('Catalog identity mismatch');freeze(data);cache.set(key,data);return data;}
