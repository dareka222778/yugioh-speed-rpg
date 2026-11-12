#!/usr/bin/env node
'use strict';
// Read-only audit of the 969 -> 1,014 engine-v9 snapshot delta.
// This does not alter the manifest, catalog, certificates, inventory or saves.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');

const DEFAULT_SHARED_REVISION='3af4ee461ba728be019de373b6c9652c3a7fd21b94fd475aac6af22b5127ca99';
const DEFAULT_DEVELOPMENT_REVISION='72ba4830f7e62ceaff795c1fa5b7b5b690ee5ef1f675eaedb9b7ed7da5675b52';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function readSnapshot(root,manifest,revision){
 if(typeof revision!=='string'||!/^[a-f0-9]{64}$/.test(revision))throw new Error('Invalid catalog revision: '+revision);
 const entry=manifest.revisions.find(item=>item.id===revision);
 if(!entry)throw new Error('Revision absent from manifest: '+revision);
 if(entry.file!==revision+'.json')throw new Error('Unexpected revision filename: '+entry.file);
 const filename=path.resolve(root,'catalog','engine-v9',entry.file);
 const catalogRoot=path.resolve(root,'catalog','engine-v9')+path.sep;
 if(!filename.startsWith(catalogRoot))throw new Error('Catalog revision path escapes catalog root: '+entry.file);
 const bytes=fs.readFileSync(filename);
 if(sha256(bytes)!==entry.sha256)throw new Error('Revision file SHA-256 mismatch: '+revision);
 const data=JSON.parse(bytes.toString('utf8'));
 if(data.format!==manifest.format||data.engineVersion!==manifest.engineVersion)throw new Error('Revision schema mismatch: '+revision);
 if(!Array.isArray(data.cards)||!isRecord(data.effects)||!isRecord(data.monsters)||!isRecord(data.certificates))throw new Error('Incomplete catalog snapshot: '+revision);
 return data;
}

function indexCards(cards,label){
 const index=new Map(),duplicates=[],invalid=[];
 for(const card of cards){
  if(!card||typeof card.id!=='string'||!/^\d{8}$/.test(card.id)){invalid.push(String(card?.id??'<missing>'));continue;}
  if(index.has(card.id))duplicates.push(card.id);
  else index.set(card.id,card);
 }
 if(invalid.length)throw new Error(label+' contains invalid eight-digit card identities: '+invalid.join(','));
 if(duplicates.length)throw new Error(label+' contains duplicate card identities: '+duplicates.join(','));
 return index;
}

function officialSource(card){
 if(!card||!Number.isSafeInteger(card.konamiId)||card.konamiId<=0||typeof card.source!=='string')return false;
 try{
  const url=new URL(card.source);
  return url.protocol==='https:'&&url.hostname==='www.db.yugioh-card.com'&&url.pathname==='/yugiohdb/card_search.action'&&url.searchParams.get('ope')==='2'&&url.searchParams.get('cid')===String(card.konamiId);
 }catch{return false;}
}

function safeSuitePath(suite,root){
 if(typeof suite!=='string'||suite.includes('\\')||suite.startsWith('/')||!suite.startsWith('tests/')||!suite.endsWith('.test.cjs'))return false;
 const parts=suite.split('/');
 if(parts.some(part=>!part||part==='.'||part==='..'))return false;
 if(path.posix.normalize(suite)!==suite)return false;
 const testsRoot=path.resolve(root,'tests')+path.sep;
 const resolved=path.resolve(root,suite);
 return resolved.startsWith(testsRoot);
}

function inspectSnapshot(data,label){
 const cardIds=new Set(data.cards.map(card=>card.id));
 const certificateIds=Object.keys(data.certificates);
 return {
  missingCertificates:data.cards.filter(card=>!Object.hasOwn(data.certificates,card.id)).map(card=>card.id).sort(),
  orphanCertificates:certificateIds.filter(id=>!cardIds.has(id)).sort(),
  orphanEffects:Object.keys(data.effects).filter(id=>!cardIds.has(id)).sort(),
  orphanMonsters:Object.keys(data.monsters).filter(id=>!cardIds.has(id)).sort()
 };
}

function auditCatalogIntegrationDelta({
 root=path.resolve(__dirname,'..'),
 sharedRevision=DEFAULT_SHARED_REVISION,
 developmentRevision=DEFAULT_DEVELOPMENT_REVISION
}={}){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'catalog','engine-v9','manifest.json'),'utf8'));
 if(!Array.isArray(manifest.revisions))throw new Error('Catalog manifest revisions must be an array.');
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
   return !isDeepStrictEqual(a,b);
  });
  return changedIds.sort();
 };
 const changedCards=changed('cards',common);
 const changedEffects=changed('effects',common);
 const changedMonsters=changed('monsters',common);
 const changedCertificates=changed('certificates',common);
 const snapshotIntegrity={
  shared:inspectSnapshot(shared,'shared'),
  development:inspectSnapshot(development,'development')
 };
 const missingCertificates=[],missingEffects=[],invalidCardMetadata=[],invalidSources=[],unsafeSuites=[],missingSuites=[];
 const addedCards=addedIds.map(id=>{
  const card=after.get(id),certificate=development.certificates[id];
  if(!certificate||!/^([a-f0-9]{64})$/.test(certificate.fingerprint??'')||!Array.isArray(certificate.suites)||!certificate.suites.length||new Set(certificate.suites).size!==certificate.suites.length)missingCertificates.push(id);
  if(!Object.hasOwn(development.effects,id))missingEffects.push(id);
  if(!Number.isSafeInteger(card.konamiId)||card.konamiId<=0)invalidCardMetadata.push(id);
  if(!officialSource(card))invalidSources.push(id);
  const suites=Array.isArray(certificate?.suites)?certificate.suites:[];
  for(const suite of suites){
   if(!safeSuitePath(suite,root)){unsafeSuites.push({id,suite});continue;}
   const filename=path.resolve(root,suite);
   if(!fs.existsSync(filename)||!fs.statSync(filename).isFile())missingSuites.push({id,suite});
  }
  return {id,name:card.name,englishName:card.englishName,kind:card.kind,konamiId:card.konamiId,fingerprint:certificate?.fingerprint??null,suites,source:card.source};
 });
 const suiteCounts={};
 for(const card of addedCards)for(const suite of card.suites)if(safeSuitePath(suite,root)&&fs.existsSync(path.resolve(root,suite)))suiteCounts[suite]=(suiteCounts[suite]??0)+1;
 const integrity={snapshotIntegrity,missingCertificates,missingEffects,invalidCardMetadata,invalidSources,unsafeSuites,missingSuites};
 const noIntegrityIssues=Object.values(snapshotIntegrity).every(snapshot=>Object.values(snapshot).every(items=>items.length===0))&&Object.entries(integrity).filter(([key])=>key!=='snapshotIntegrity').every(([,items])=>items.length===0);
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
  integrity:{missingCertificates,missingEffects,invalidCardMetadata,invalidSources,unsafeSuites,missingSuites},
  snapshotIntegrity,
  addedCards,
  suiteCounts:Object.fromEntries(Object.entries(suiteCounts).sort(([a],[b])=>a.localeCompare(b))),
  catalogReconciliationReady:addedIds.length>0&&removedIds.length===0&&changedCards.length===0&&changedEffects.length===0&&changedMonsters.length===0&&changedCertificates.length===0&&noIntegrityIssues,
  engineMergeReady:false,
  mergeAuthorized:false,
  deployAuthorized:false,
  limitation:'This audit proves snapshot hashes, eight-digit identity uniqueness, one-to-one card/certificate maps, append-only preservation, card-specific official Konami URLs, safe existing regression-suite paths and certificate metadata shape. It does not parse assertion coverage, recompute engine fingerprints, prove runtime compatibility, PR mergeability, live Discord behavior or deployment readiness.'
 };
 return result;
}

if(require.main===module){
 const report=auditCatalogIntegrationDelta();
 console.log(JSON.stringify(report,null,2));
 if(!report.catalogReconciliationReady)process.exitCode=1;
}
module.exports={auditCatalogIntegrationDelta,officialSource,safeSuitePath};
