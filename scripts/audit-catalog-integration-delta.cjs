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
  return url.protocol==='https:'&&url.hostname==='www.db.yugioh-card.com'&&url.pathname==='/yugiohdb/card_search.action'&&url.searchParams.get('ope')==='2'&&url.searchParams.getAll('ope').length===1&&url.searchParams.get('cid')===String(card.konamiId)&&url.searchParams.getAll('cid').length===1&&!url.username&&!url.password&&!url.hash;
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

function safeBatchPath(batchPath,root){
 if(typeof batchPath!=='string'||batchPath.includes('\\')||batchPath.startsWith('/')||!batchPath.startsWith('catalog/batches/')||!batchPath.endsWith('.json'))return false;
 const parts=batchPath.split('/');
 if(parts.some(part=>!part||part==='.'||part==='..'))return false;
 if(path.posix.normalize(batchPath)!==batchPath)return false;
 const batchesRoot=path.resolve(root,'catalog','batches')+path.sep;
 const resolved=path.resolve(root,batchPath);
 return resolved.startsWith(batchesRoot);
}

function suiteRegistration(source){
 const match=source.match(/registerBatch\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/);
 return match?{batchPath:match[2],suite:match[4]}:null;
}

function inspectSnapshot(data){
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
 const proposal=JSON.parse(fs.readFileSync(path.join(root,'catalog','proposed','normal-before-2004-09-30.json'),'utf8'));
 if(!Array.isArray(proposal.candidates))throw new Error('Historical normal proposal must contain a candidate array.');
 const before=indexCards(shared.cards,'shared snapshot'),after=indexCards(development.cards,'development snapshot');
 const proposalIds=proposal.candidates.map(candidate=>candidate.id);
 const proposalTriage={
  source:'catalog/proposed/normal-before-2004-09-30.json',cutoff:proposal.cutoff,candidates:proposal.candidates.length,
  alreadyInShared:proposal.candidates.filter(candidate=>before.has(candidate.id)).length,
  alreadyCertifiedInShared:proposal.candidates.filter(candidate=>Object.hasOwn(shared.certificates,candidate.id)).length,
  alreadyInDevelopment:proposal.candidates.filter(candidate=>after.has(candidate.id)).length,
  alreadyCertifiedInDevelopment:proposal.candidates.filter(candidate=>Object.hasOwn(development.certificates,candidate.id)).length,
  notInShared:proposal.candidates.filter(candidate=>!before.has(candidate.id)).map(candidate=>candidate.id).sort(),
  notInDevelopment:proposal.candidates.filter(candidate=>!after.has(candidate.id)).map(candidate=>candidate.id).sort(),
  duplicateProposalIds:proposalIds.filter((id,index)=>proposalIds.indexOf(id)!==index).sort()
 };
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
 const snapshotIntegrity={shared:inspectSnapshot(shared),development:inspectSnapshot(development)};
 const missingCertificates=[],missingEffects=[],invalidCardMetadata=[],invalidSources=[],unsafeSuites=[],missingSuites=[];
 const invalidSuites=[],unsafeBatches=[],missingBatches=[],invalidBatches=[],missingBatchEvidence=[],invalidBatchEvidence=[];
 const suiteCache=new Map(),batchCache=new Map(),referencedBatches=new Set();
 let matchedCandidates=0,matchedReviews=0,scenarioCases=0;
 const addedCards=addedIds.map(id=>{
  const card=after.get(id),certificate=development.certificates[id];
  if(!certificate||!/^([a-f0-9]{64})$/.test(certificate.fingerprint??'')||!Array.isArray(certificate.suites)||!certificate.suites.length||new Set(certificate.suites).size!==certificate.suites.length)missingCertificates.push(id);
  if(!Object.hasOwn(development.effects,id))missingEffects.push(id);
  if(!Number.isSafeInteger(card.konamiId)||card.konamiId<=0)invalidCardMetadata.push(id);
  if(!officialSource(card))invalidSources.push(id);
  const suites=Array.isArray(certificate?.suites)?certificate.suites:[];
  for(const suite of suites){
   if(!safeSuitePath(suite,root)){unsafeSuites.push({id,suite});continue;}
   const suiteFilename=path.resolve(root,suite);
   if(!fs.existsSync(suiteFilename)||!fs.statSync(suiteFilename).isFile()){missingSuites.push({id,suite});continue;}
   let source=suiteCache.get(suite);
   if(source===undefined){source=fs.readFileSync(suiteFilename,'utf8');suiteCache.set(suite,source);}
   const registration=suiteRegistration(source);
   if(!registration||registration.suite!==suite){invalidSuites.push({id,suite,reason:'wrapper-does-not-register-itself'});continue;}
   if(!safeBatchPath(registration.batchPath,root)){unsafeBatches.push({id,suite,batchPath:registration.batchPath});continue;}
   referencedBatches.add(registration.batchPath);
   const batchFilename=path.resolve(root,registration.batchPath);
   if(!fs.existsSync(batchFilename)||!fs.statSync(batchFilename).isFile()){missingBatches.push({id,suite,batchPath:registration.batchPath});continue;}
   let batch=batchCache.get(registration.batchPath);
   if(batch===undefined){
    try{batch=JSON.parse(fs.readFileSync(batchFilename,'utf8'));batchCache.set(registration.batchPath,batch);}
    catch{invalidBatches.push({batchPath:registration.batchPath,reason:'invalid-json'});continue;}
   }
   if(!isRecord(batch)||batch.format!==manifest.format||batch.engineVersion!==manifest.engineVersion||!manifest.revisions.some(item=>item.id===batch.baseRevision)||!Array.isArray(batch.candidates)||!Array.isArray(batch.reviews)){
    invalidBatches.push({batchPath:registration.batchPath,reason:'invalid-batch-schema-or-base-revision'});continue;
   }
   const candidates=batch.candidates.filter(candidate=>candidate.card?.id===id);
   const reviews=batch.reviews.filter(review=>review.id===id);
   if(candidates.length!==1||reviews.length!==1){missingBatchEvidence.push({id,suite,batchPath:registration.batchPath,candidates:candidates.length,reviews:reviews.length});continue;}
   matchedCandidates++;matchedReviews++;
   const candidate=candidates[0],review=reviews[0],reasons=[];
   if(candidate.fingerprint!==certificate.fingerprint||review.mechanicalFingerprint!==certificate.fingerprint)reasons.push('fingerprint-mismatch');
   if(candidate.card?.konamiId!==card.konamiId||candidate.card?.englishName!==card.englishName||candidate.card?.source!==card.source)reasons.push('candidate-card-mismatch');
   if(!isDeepStrictEqual(candidate.effect,development.effects[id]))reasons.push('effect-definition-mismatch');
   if(Object.hasOwn(development.monsters,id)&&!isDeepStrictEqual(candidate.monster,development.monsters[id]))reasons.push('monster-definition-mismatch');
   if(!Array.isArray(candidate.suites)||!candidate.suites.includes(suite))reasons.push('candidate-suite-mismatch');
   const evidence=candidate.textEvidence;
   if(!evidence||typeof evidence.text!=='string'||evidence.complete!==true||evidence.source!==card.source||evidence.sha256!==sha256(Buffer.from(evidence.text,'utf8'))||review.textSha256!==evidence.sha256)reasons.push('text-evidence-mismatch');
   if(review.konamiId!==card.konamiId||review.primarySource!==card.source||review.identityApproved!==true||review.mechanicsApproved!==true||review.fullTextReviewed!==true||review.secondaryEffectsReviewed!==true||review.exceptionsReviewed!==true||!isRecord(review.semanticCoverage)||!Object.values(review.semanticCoverage).some(value=>value==='represented')||Object.values(review.semanticCoverage).some(value=>!['represented','not-applicable'].includes(value)))reasons.push('review-incomplete-or-mismatched');
   if(!Array.isArray(candidate.scenarios)||!candidate.scenarios.length||!isRecord(candidate.cases)||candidate.scenarios.some(name=>!isRecord(candidate.cases[name])||!Array.isArray(candidate.cases[name].actions)||!Array.isArray(candidate.cases[name].assertions)||!candidate.cases[name].assertions.length))reasons.push('scenario-case-missing');
   else scenarioCases+=candidate.scenarios.length;
   if(reasons.length)invalidBatchEvidence.push({id,suite,batchPath:registration.batchPath,reasons});
  }
  return {id,name:card.name,englishName:card.englishName,kind:card.kind,konamiId:card.konamiId,fingerprint:certificate?.fingerprint??null,suites,source:card.source};
 });
 const suiteCounts={};
 for(const card of addedCards)for(const suite of card.suites)if(safeSuitePath(suite,root)&&fs.existsSync(path.resolve(root,suite)))suiteCounts[suite]=(suiteCounts[suite]??0)+1;
 const integrity={missingCertificates,missingEffects,invalidCardMetadata,invalidSources,unsafeSuites,missingSuites,invalidSuites,unsafeBatches,missingBatches,invalidBatches,missingBatchEvidence,invalidBatchEvidence};
 const noSnapshotIssues=Object.values(snapshotIntegrity).every(snapshot=>Object.values(snapshot).every(items=>items.length===0));
 const noIntegrityIssues=Object.values(integrity).every(items=>items.length===0);
 const batchEvidence={
  referencedBatches:[...referencedBatches].sort(),
  matchedCandidates,
  matchedReviews,
  scenarioCases
 };
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
  integrity,
  snapshotIntegrity,
  batchEvidence,
  proposalTriage,
  addedCards,
  suiteCounts:Object.fromEntries(Object.entries(suiteCounts).sort(([a],[b])=>a.localeCompare(b))),
  catalogReconciliationReady:addedIds.length>0&&removedIds.length===0&&changedCards.length===0&&changedEffects.length===0&&changedMonsters.length===0&&changedCertificates.length===0&&noSnapshotIssues&&noIntegrityIssues,
  engineMergeReady:false,
  mergeAuthorized:false,
  deployAuthorized:false,
  limitation:'This audit proves snapshot hashes, eight-digit identity uniqueness, one-to-one card/certificate maps, append-only preservation, card-specific official Konami URLs, safe suite wrappers, referenced batch files, matching candidate/review fingerprints, complete review flags, declared scenario fixtures/assertions and whether the legacy normal proposal is already catalogued. It does not execute the behavioral suites, recompute engine definition fingerprints, prove runtime compatibility, PR mergeability, live Discord behavior or deployment readiness.'
 };
 return result;
}

if(require.main===module){
 const report=auditCatalogIntegrationDelta();
 console.log(JSON.stringify(report,null,2));
 if(!report.catalogReconciliationReady)process.exitCode=1;
}
module.exports={auditCatalogIntegrationDelta,officialSource,safeSuitePath,safeBatchPath,suiteRegistration};
