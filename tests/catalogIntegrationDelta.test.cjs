'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {auditCatalogIntegrationDelta,officialSource,safeSuitePath}=require('../scripts/audit-catalog-integration-delta.cjs');

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

test('all 45 additions have card-specific Konami sources, certificate fingerprints and existing regression suites',()=>{
 assert.deepEqual(report.integrity,{missingCertificates:[],missingEffects:[],invalidCardMetadata:[],invalidSources:[],unsafeSuites:[],missingSuites:[]});
 assert.equal(report.addedCards.length,45);
 for(const card of report.addedCards){
  assert.match(card.id,/^\d{8}$/);
  assert.ok(Number.isSafeInteger(card.konamiId)&&card.konamiId>0);
  assert.match(card.fingerprint,/^[a-f0-9]{64}$/);
  assert.ok(card.suites.length>0,card.id+' has no behavioral suite');
 }
 assert.deepEqual(report.suiteCounts,expectedSuites);
});

test('suite references are restricted to normalized test files inside the repository tests directory',()=>{
 assert.equal(safeSuitePath('tests/example.test.cjs',root),true);
 for(const candidate of [
  '../outside.test.cjs',
  'tests/../../outside.test.cjs',
  'tests\\outside.test.cjs',
  '/tmp/outside.test.cjs',
  'src/outside.test.cjs',
  'tests/outside.js',
  'tests//nested.test.cjs',
  'tests/./nested.test.cjs'
 ])assert.equal(safeSuitePath(candidate,root),false,candidate);
});

test('official source validation pins the URL to the card-specific Konami ID',()=>{
 assert.equal(officialSource({konamiId:5418,source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5418&request_locale=en'}),true);
 assert.equal(officialSource({konamiId:5418,source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5419&request_locale=en'}),false);
 assert.equal(officialSource({konamiId:5418,source:'https://example.com/yugiohdb/card_search.action?ope=2&cid=5418'}),false);
 assert.equal(officialSource({konamiId:5418,source:'http://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5418'}),false);
 assert.equal(officialSource({konamiId:0,source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=0'}),false);
});

test('catalog data is reconcilable, but the audit does not authorize engine merge or deployment',()=>{
 assert.equal(report.catalogReconciliationReady,true);
 assert.equal(report.engineMergeReady,false);
 assert.equal(report.mergeAuthorized,false);
 assert.equal(report.deployAuthorized,false);
 assert.match(report.limitation,/does not parse assertion coverage/);
 assert.match(report.limitation,/runtime compatibility/);
});

test('npm audit CLI emits the same read-only reconciliation report',()=>{
 const result=spawnSync(process.execPath,['scripts/audit-catalog-integration-delta.cjs'],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const cli=JSON.parse(result.stdout);
 assert.equal(cli.catalogReconciliationReady,true);
 assert.equal(cli.summary.addedCards,45);
 assert.equal(cli.snapshotIntegrity.development.orphanCertificates.length,0);
 assert.equal(cli.engineMergeReady,false);
});
