'use strict';
const fs=require('node:fs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {auditCatalogIntegrationDelta,officialSource,safeSuitePath,safeBatchPath,realpathWithin,suiteRegistration}=require('../scripts/audit-catalog-integration-delta.cjs');

const root=path.resolve(__dirname,'..');
const report=auditCatalogIntegrationDelta({root});
const expectedSuites={
 'tests/generated-m46-discard-removal.test.cjs':6,
 'tests/generated-m47-summon-and-presence.test.cjs':3,
 'tests/generated-m48-thunder-dragon.test.cjs':2,
 'tests/generated-m49-standby-lp.test.cjs':6,
 'tests/generated-m50-battle-damage.test.cjs':6,
 'tests/generated-m51-scaled-standby.test.cjs':1,
 'tests/generated-m52-field-traps.test.cjs':5,
 'tests/generated-m53-name-and-summon.test.cjs':2,
 'tests/generated-m54-dice-and-coins.test.cjs':4,
 'tests/generated-m55-coin-targets.test.cjs':2,
 'tests/generated-m56-called-coins.test.cjs':2,
 'tests/generated-m57-skipped-draws.test.cjs':2,
 'tests/generated-m58-battle-recovery.test.cjs':2,
 'tests/generated-m59-control-lock.test.cjs':2
};

test('catalog integration audit identifies the exact 969-to-1014 append-only delta',()=>{
 assert.equal(report.summary.sharedCards,969);
 assert.equal(report.summary.sharedCertificates,969);
 assert.equal(report.summary.developmentCards,1014);
 assert.equal(report.summary.developmentCertificates,1014);
 assert.equal(report.summary.commonCards,969);
 assert.equal(report.summary.addedCards,45);
 assert.equal(report.summary.removedCards,0);
});

test('all 969 shared identities retain identical card, effect, monster and certificate definitions',()=>{
 assert.deepEqual(report.preservation,{changedCards:[],changedEffects:[],changedMonsters:[],changedCertificates:[]});
});

test('both snapshots have one-to-one card/certificate identities and no orphaned definitions',()=>{
 const clean={missingCertificates:[],orphanCertificates:[],orphanEffects:[],orphanMonsters:[]};
 assert.deepEqual(report.snapshotIntegrity,{shared:clean,development:clean});
 assert.equal(report.summary.sharedCertificates,report.summary.sharedCards);
 assert.equal(report.summary.developmentCertificates,report.summary.developmentCards);
});

test('all 45 additions have complete reviewed batch evidence behind their certificate and suite',()=>{
 assert.deepEqual(report.integrity,{
  missingCertificates:[],missingEffects:[],invalidCardMetadata:[],invalidSources:[],unsafeSuites:[],missingSuites:[],
  invalidSuites:[],unsafeBatches:[],missingBatches:[],invalidBatches:[],missingBatchEvidence:[],invalidBatchEvidence:[]
 });
 assert.equal(report.addedCards.length,45);
 for(const card of report.addedCards){
  assert.match(card.id,/^\d{8}$/);
  assert.ok(Number.isSafeInteger(card.konamiId)&&card.konamiId>0);
  assert.match(card.fingerprint,/^[a-f0-9]{64}$/);
  assert.ok(card.suites.length>0,card.id+' has no behavioral suite');
 }
 assert.equal(report.batchEvidence.referencedBatches.length,14);
 assert.equal(report.batchEvidence.matchedCandidates,45);
 assert.equal(report.batchEvidence.matchedReviews,45);
 assert.ok(report.batchEvidence.scenarioCases>45);
 assert.deepEqual(report.suiteCounts,expectedSuites);
});

test('suite and batch paths are normalized and confined to their repository directories',()=>{
 assert.equal(safeSuitePath('tests/example.test.cjs',root),true);
 for(const candidate of [
  '../outside.test.cjs','tests/../../outside.test.cjs','tests\\outside.test.cjs',
  '/tmp/outside.test.cjs','src/outside.test.cjs','tests/outside.js','tests//nested.test.cjs','tests/./nested.test.cjs'
 ])assert.equal(safeSuitePath(candidate,root),false,candidate);
 assert.equal(safeBatchPath('catalog/batches/m60.json',root),true);
 for(const candidate of [
  '../outside.json','catalog/batches/../../outside.json','catalog/batches\\outside.json',
  '/tmp/outside.json','docs/outside.json','catalog/batches/outside.txt','catalog/batches//nested.json'
 ])assert.equal(safeBatchPath(candidate,root),false,candidate);
});

test('realpath containment rejects suite and batch symlinks that escape approved roots',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-delta-'));
 try{
  const repo=path.join(temp,'repo'),testsRoot=path.join(repo,'tests'),batchesRoot=path.join(repo,'catalog','batches'),outside=path.join(temp,'outside');
  fs.mkdirSync(testsRoot,{recursive:true});fs.mkdirSync(batchesRoot,{recursive:true});fs.mkdirSync(outside,{recursive:true});
  const insideSuite=path.join(testsRoot,'inside.test.cjs'),outsideSuite=path.join(outside,'outside.test.cjs'),suiteLink=path.join(testsRoot,'escape.test.cjs');
  const insideBatch=path.join(batchesRoot,'inside.json'),outsideBatch=path.join(outside,'outside.json'),batchLink=path.join(batchesRoot,'escape.json');
  for(const file of [insideSuite,outsideSuite,insideBatch,outsideBatch])fs.writeFileSync(file,'{}');
  fs.symlinkSync(outsideSuite,suiteLink);fs.symlinkSync(outsideBatch,batchLink);
  assert.equal(realpathWithin(insideSuite,testsRoot),true);
  assert.equal(realpathWithin(suiteLink,testsRoot),false);
  assert.equal(realpathWithin(insideBatch,batchesRoot),true);
  assert.equal(realpathWithin(batchLink,batchesRoot),false);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('generated suite registration binds its exact suite path to a batch file',()=>{
 assert.deepEqual(suiteRegistration("require('../scripts/card-batch-scenarios.cjs').registerBatch('catalog/batches/m60.json', \"tests/m60.test.cjs\");"),{
  batchPath:'catalog/batches/m60.json',suite:'tests/m60.test.cjs'
 });
 assert.equal(suiteRegistration("console.log('not a suite')"),null);
});

test('suite registration ignores comments and string literals that merely imitate the wrapper',()=>{
 assert.equal(suiteRegistration("// require('../scripts/card-batch-scenarios.cjs').registerBatch('catalog/batches/m60.json','tests/m60.test.cjs');"),null);
 assert.equal(suiteRegistration("const note=\"require('../scripts/card-batch-scenarios.cjs').registerBatch('catalog/batches/m60.json','tests/m60.test.cjs')\";"),null);
 assert.equal(suiteRegistration("/* registerBatch('catalog/batches/m60.json','tests/m60.test.cjs') */ console.log('not a suite');"),null);
});

test('suite registration accepts only the exact loader, two literal arguments and a single statement',()=>{
 assert.equal(suiteRegistration("require('../scripts/other.cjs').registerBatch('catalog/batches/m60.json','tests/m60.test.cjs');"),null);
 assert.equal(suiteRegistration("require('../scripts/card-batch-scenarios.cjs').registerBatch('catalog/batches/m60.json','tests/m60.test.cjs','extra');"),null);
 assert.equal(suiteRegistration("require('../scripts/card-batch-scenarios.cjs').registerBatch(`catalog/batches/m60.json`,'tests/m60.test.cjs');"),null);
 assert.equal(suiteRegistration("require('../scripts/card-batch-scenarios.cjs').registerBatch('catalog/batches/m60.json','tests/m60.test.cjs'); console.log('extra');"),null);
});

test('official source validation pins the URL to the card-specific Konami ID',()=>{
 assert.equal(officialSource({konamiId:5418,source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5418&request_locale=en'}),true);
 assert.equal(officialSource({konamiId:5418,source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5419&request_locale=en'}),false);
 assert.equal(officialSource({konamiId:5418,source:'https://example.com/yugiohdb/card_search.action?ope=2&cid=5418'}),false);
 assert.equal(officialSource({konamiId:5418,source:'http://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5418'}),false);
 assert.equal(officialSource({konamiId:0,source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=0'}),false);
 assert.equal(officialSource({konamiId:5418,source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5418&cid=5418'}),false);
 assert.equal(officialSource({konamiId:5418,source:'https://www.db.yugioh-card.com:8443/yugiohdb/card_search.action?ope=2&cid=5418'}),false);
 assert.equal(officialSource({konamiId:5418,source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&ope=2&cid=5418'}),false);
});

test('legacy normal proposal is fully stale against both catalog snapshots',()=>{
 assert.equal(report.proposalTriage.cutoff,'2004-09-30');
 assert.equal(report.proposalTriage.candidates,20);
 assert.equal(report.proposalTriage.alreadyInShared,20);
 assert.equal(report.proposalTriage.alreadyCertifiedInShared,20);
 assert.equal(report.proposalTriage.alreadyInDevelopment,20);
 assert.equal(report.proposalTriage.alreadyCertifiedInDevelopment,20);
 assert.deepEqual(report.proposalTriage.notInShared,[]);
 assert.deepEqual(report.proposalTriage.notInDevelopment,[]);
 assert.deepEqual(report.proposalTriage.duplicateProposalIds,[]);
});

test('catalog data is reconcilable, but the audit does not authorize engine merge or deployment',()=>{
 assert.equal(report.catalogReconciliationReady,true);
 assert.equal(report.engineMergeReady,false);
 assert.equal(report.mergeAuthorized,false);
 assert.equal(report.deployAuthorized,false);
 assert.match(report.limitation,/does not execute the behavioral suites/);
 assert.match(report.limitation,/runtime compatibility/);
});

test('npm audit CLI emits the same read-only reconciliation report',()=>{
 const result=spawnSync(process.execPath,['scripts/audit-catalog-integration-delta.cjs'],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const cli=JSON.parse(result.stdout);
 assert.equal(cli.catalogReconciliationReady,true);
 assert.equal(cli.summary.addedCards,45);
 assert.equal(cli.batchEvidence.matchedCandidates,45);
 assert.equal(cli.proposalTriage.alreadyInShared,20);
 assert.equal(cli.proposalTriage.notInDevelopment.length,0);
 assert.equal(cli.snapshotIntegrity.development.orphanCertificates.length,0);
 assert.equal(cli.engineMergeReady,false);
});
