'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {auditCatalogIntegrationDelta}=require('../scripts/audit-catalog-integration-delta.cjs');

const report=auditCatalogIntegrationDelta({root:path.resolve(__dirname,'..')});
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

test('all 45 additions have Konami sources, certificate fingerprints and existing regression suites',()=>{
 assert.deepEqual(report.integrity,{missingCertificates:[],missingEffects:[],invalidSources:[],missingSuites:[]});
 assert.equal(report.addedCards.length,45);
 for(const card of report.addedCards){
  assert.match(card.id,/^\d{8}$/);
  assert.match(card.fingerprint,/^[a-f0-9]{64}$/);
  assert.ok(card.suites.length>0,card.id+' has no behavioral suite');
 }
 assert.deepEqual(report.suiteCounts,expectedSuites);
});

test('catalog data is reconcilable, but the audit does not authorize engine merge or deployment',()=>{
 assert.equal(report.catalogReconciliationReady,true);
 assert.equal(report.engineMergeReady,false);
 assert.equal(report.mergeAuthorized,false);
 assert.equal(report.deployAuthorized,false);
 assert.match(report.limitation,/runtime compatibility/);
});
