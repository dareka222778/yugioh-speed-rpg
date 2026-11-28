#!/usr/bin/env node
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {getEnabledCardIds,engineCatalog,getDuelCard}=require('../dist/effectRegistry');
const enabledCardIds=getEnabledCardIds();
const evidence=JSON.parse(fs.readFileSync('docs/evidence/m687-amazoness-battle.json','utf8'));
const certificates=fs.readFileSync('src/cardCertifications.ts','utf8');
const adapter=fs.readFileSync('src/amazonessBattleTagAdapter.ts','utf8');
const tests=fs.readFileSync('tests/amazonessBattleTagAdapter.test.cjs','utf8');
assert.equal(evidence.mission,'M687');
assert.equal(evidence.status,'isolated-adapter-only');
assert.equal(evidence.cards.length,3);
assert.equal(evidence.counts.newEngineCertifiedCards,0);
assert.equal(evidence.counts.automaticCertifications,0);
assert.equal(evidence.counts.inventoryGrants,0);
assert.equal(evidence.integration.centralFilesModified,false);
assert.equal(evidence.integration.catalogModified,false);
assert.equal(evidence.integration.certificationsModified,false);
assert.equal(evidence.integration.productionTouched,false);
for(const card of evidence.cards){
 assert.ok(card.source.startsWith('https://www.db.yugioh-card.com/yugiohdb/card_search.action'));
 assert.ok(adapter.includes(card.id),'adapter must bind '+card.name+' identity');
 assert.ok(!enabledCardIds.includes(card.id),'candidate must not be silently admitted: '+card.id);
 assert.equal(getDuelCard(card.id),undefined,'candidate must remain unavailable until engine integration: '+card.id);
 assert.ok(!certificates.includes('"'+card.id+'"'),'candidate must not receive an unreviewed certificate: '+card.id);
}
assert.ok(evidence.deferred.some(card=>card.id==='29654737'));
const testCount=(tests.match(/\btest\(/g)||[]).length;
assert.ok(testCount>=20,'expected at least 20 executable behavior scenarios');
assert.equal(evidence.behaviorTests.suite,'tests/amazonessBattleTagAdapter.test.cjs');
assert.equal(evidence.behaviorTests.adapterBehaviorVerifiedCards,3);
assert.equal(evidence.behaviorTests.engineBehaviorCertifiedCards,0);
console.log(JSON.stringify({
 mission:evidence.mission,
 catalogMetadataCards:engineCatalog.length,
 engineCertifiedCards:enabledCardIds.length,
 baselineCertifiedCards:evidence.baseline.engineV9Certified,
 adapterCandidates:evidence.cards.length,
 adapterTestCases:testCount,
 newEngineCertificates:0,
 automaticCertifications:0,
 inventoryGrants:0,
 centralIntegration:'pending-handoff'
},null,2));
