import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {CatalogData} from './catalogContext';
const folder=path.resolve(typeof __dirname==='string'?__dirname:process.cwd()+'/src','../catalog/engine-v7');
type Manifest={format:1;engineVersion:'engine-v7';current:string;revisions:{id:string;file:string;sha256:string}[]};
let manifest:Manifest|undefined;const cache=new Map<string,CatalogData>();
const hash=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
function getManifest(){if(!manifest){const m=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8')) as Manifest;if(m.format!==1||m.engineVersion!=='engine-v7'||!Array.isArray(m.revisions)||new Set(m.revisions.map(r=>r.id)).size!==m.revisions.length||!m.revisions.some(r=>r.id===m.current))throw Error('Manifesto de catálogo incompatível.');for(const r of m.revisions)if(!/^[a-f0-9]{64}$/.test(r.id)||r.file!==r.id+'.json'||!/^[a-f0-9]{64}$/.test(r.sha256))throw Error('Referência de catálogo inválida.');manifest=m;}return manifest;}
export function currentCatalogRevision(){return getManifest().current;}
export function getCatalogData(id:string):CatalogData{const found=cache.get(id);if(found)return found;const entry=getManifest().revisions.find(r=>r.id===id);if(!entry)throw Error('Revisão de catálogo não recuperada. Save preservado.');const bytes=fs.readFileSync(path.join(folder,entry.file));if(hash(bytes)!==entry.sha256)throw Error('Hash de catálogo divergente.');const data=JSON.parse(bytes.toString('utf8')) as CatalogData;if(data.format!==1||data.engineVersion!=='engine-v7'||hash(JSON.stringify(data))!==id)throw Error('Identidade de catálogo divergente.');cache.set(id,data);return data;}
