#!/usr/bin/env node
'use strict';
// Read-only audit of the 969 -> 1,014 engine-v9 snapshot delta.
// This does not alter the manifest, catalog, certificates, inventory or saves.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');

const DEFAULT_SHARED_REVISION='3af4ee461ba728be019de373b6c9652c3a7fd21b94fd475aac6af22b5127ca99';
const DEFAULT_DEVELOPMENT_REVISION='72ba4830f7e62ceaff795c1fa5b7b5b690ee5ef1f675eaedb9b7ed7da5675b52';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function readSnapshot(root,manifest,revision){
 const entry=manifest.revisions.find(item=>item.id===revision);
 if(!entry)throw new Error('Revision absent from manifest: '+revision);
 if(entry.file!==revision+'.json')throw new Error('Unexpected revision filename: '+entry.file);
 const filename=path.join(root,'catalog','engine-v9',entry.file);
 const bytes=fs.readFileSync(filename);
 if(sha256(bytes)!==entry.sha256)throw new Error('Revision file SHA-256 mismatch: '+revision);
 const data=JSON.parse(bytes.toString('utf8'));
 if(data.format!==manifest.format||data.engineVersion!==manifest.engineVersion)throw new Error('Revision schema mismatch: '+revision);
 if(!Array.isArray(data.cards)||!data.effects||!data.monsters||!data.certificates)throw new Error('Incomplete catalog snapshot: '+revision);
 return data;
}

function indexCards(cards,label){
 const index=new Map(),duplicates=[];
 for(const card of cards){
  if(!card||typeof card.id!=='string'){duplicates.push(String(card?.id??'<missing>'));continue;}
  if(index.has(card.id))duplicates.push(card.id);
  else index.set(card.id,card);
 }
 if(duplicates.length)throw new Error(label+' contains duplicate/invalid card identities: '+duplicates.join(','));
 return index;
}

function officialSource(card){
 try{
  const url=new URL(card.source);
  return url.protocol==='https:'&&url.hostname==='www.db.yugioh-card.com'&&url.pathname==='/yugiohdb/card_search.action'&&url.searchParams.get('ope')==='2'&&url.searchParams.get('cid')===String(card.konamiId);
 }catch{return false;}
}

function auditCatalogIntegrationDelta({
 root=path.resolve(__dirname,'..'),
 sharedRevision=DEFAULT_SHARED_REVISION,
 developmentRevision=DEFAULT_DEVELOPMENT_REVISION
}={}){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'catalog','engine-v9','manifest.json'),'utf8'));
 if(developmentRevision!==manifest.current)throw new Error('Development revision is no longer manifest.current; re-audit the requested refs.');
 const shared=readSnapshot(root,manifest,sharedRevision);
 const development=readSnapshot(root,manifest,developmentRevision);
 const before=indexCards(shared.cards,'shared snapshot'),after=indexCards(development.cards,'development snapshot');
 const sharedIds=[...before.keys()],developmentIds=[...after.keys()];
 const sharedSet=new Set(sharedIds),developmentSet=new Set(developmentIds);
 const common=sharedIds.filter(id=>developmentSet.has(id));
 const addedIds=developmentIds.filter(id=>!sharedSet.has(id)).sort();
 const removedIds=sharedIds.filter(id=>!developmentSet.has(id)).sort();
 const changed=(section,ids)=>{
  const changedIds=ids.filter(id=>{
   const a=section==='cards'?before.get(id):shared[section][id];
   const b=section==='cards'?after.get(id):development[section][id];
   return !same(a,b);
  });
  return changedIds.sort();
 };
 const changedCards=changed('cards',common);
 const changedEffects=changed('effects',common);
 const changedMonsters=changed('monsters',common);
 const changedCertificates=changed('certificates',common);
 const missingCertificates=[],missingEffects=[],invalidSources=[],missingSuites=[];
 const addedCards=addedIds.map(id=>{
  const card=after.get(id),certificate=development.certificates[id];
  if(!certificate||!/^([a-f0-9]{64})$/.test(certificate.fingerprint??'')||!Array.isArray(certificate.suites)||!certificate.suites.length)missingCertificates.push(id);
  if(!Object.hasOwn(development.effects,id))missingEffects.push(id);
  if(!officialSource(card))invalidSources.push(id);
  const suites=Array.isArray(certificate?.suites)?certificate.suites:[];
  for(const suite of suites)if(typeof suite!=='string'||!fs.existsSync(path.resolve(root,suite)))missingSuites.push({id,suite});
  return {id,name:card.name,englishName:card.englishName,kind:card.kind,fingerprint:certificate?.fingerprint??null,suites,source:card.source};
 });
 const suiteCounts={};
 for(const card of addedCards)for(const suite of card.suites)suiteCounts[suite]=(suiteCounts[suite]??0)+1;
 const result={
  engineVersion:manifest.engineVersion,
  sharedRevision,developmentRevision,
  summary:{
   sharedCards:shared.cards.length,
   sharedCertificates:Object.keys(shared.certificates).length,
   developmentCards:development.cards.length,
   developmentCertificates:Object.keys(development.certificates).length,
   commonCards:common.length,
   addedCards:addedIds.length,
   removedCards:removedIds.length
  },
  preservation:{changedCards,changedEffects,changedMonsters,changedCertificates},
  integrity:{missingCertificates,missingEffects,invalidSources,missingSuites},
  addedCards,
  suiteCounts:Object.fromEntries(Object.entries(suiteCounts).sort(([a],[b])=>a.localeCompare(b))),
  catalogReconciliationReady:addedIds.length>0&&removedIds.length===0&&changedCards.length===0&&changedEffects.length===0&&changedMonsters.length===0&&changedCertificates.length===0&&!missingCertificates.length&&!missingEffects.length&&!invalidSources.length&&!missingSuites.length,
  engineMergeReady:false,
  mergeAuthorized:false,
  deployAuthorized:false,
  limitation:'This audit proves snapshot identity, append-only preservation, certificate presence and referenced suite files. It does not prove runtime compatibility, PR mergeability, live Discord behavior or deployment readiness.'
 };
 return result;
}

if(require.main===module){
 const report=auditCatalogIntegrationDelta();
 console.log(JSON.stringify(report,null,2));
 if(!report.catalogReconciliationReady)process.exitCode=1;
}
module.exports={auditCatalogIntegrationDelta};
