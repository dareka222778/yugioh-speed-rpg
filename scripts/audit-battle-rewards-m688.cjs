#!/usr/bin/env node
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {getEnabledCardIds,getDuelCard,engineCatalog}=require('../dist/effectRegistry');
const enabled=getEnabledCardIds();
const evidence=JSON.parse(fs.readFileSync('docs/evidence/m688-battle-rewards.json','utf8'));
const certificates=fs.readFileSync('src/cardCertifications.ts','utf8');
const source=fs.readFileSync('src/battleRewardTagAdapter.ts','utf8');
const tests=fs.readFileSync('tests/battleRewardTagAdapter.test.cjs','utf8');
assert.equal(evidence.mission,'M688');
assert.equal(evidence.status,'isolated-adapter-only');
assert.equal(evidence.cards.length,3);
assert.equal(evidence.counts.newEngineCertifiedCards,0);
assert.equal(evidence.counts.automaticCertifications,0);
assert.equal(evidence.counts.inventoryGrants,0);
assert.equal(evidence.integration.centralFilesModified,false);
assert.equal(evidence.integration.catalogModified,false);
assert.equal(evidence.integration.certificationsModified,false);
assert.equal(evidence.integration.productionTouched,false);
assert.ok(source.includes('ownedPrivateZone'));
assert.ok(source.includes('active.deck.shift()'));
assert.ok(source.includes('.unshift(card)'));
assert.ok(source.includes('plan.lpGain'));
for(const card of evidence.cards){
 assert.ok(card.source.startsWith('https://www.db.yugioh-card.com/yugiohdb/card_search.action'));
 assert.ok(!enabled.includes(card.id),'candidate must not be silently admitted: '+card.id);
 assert.equal(getDuelCard(card.id),undefined,'candidate must remain unavailable until engine integration: '+card.id);
 assert.ok(!certificates.includes('"'+card.id+'"'),'candidate must not receive an unreviewed certificate: '+card.id);
}
const testCount=(tests.match(/\btest\(/g)||[]).length;
assert.ok(testCount>=12,'expected at least 12 executable behavior scenarios');
assert.equal(evidence.behaviorTests.suite,'tests/battleRewardTagAdapter.test.cjs');
assert.equal(evidence.behaviorTests.adapterBehaviorVerifiedCards,3);
assert.equal(evidence.behaviorTests.engineBehaviorCertifiedCards,0);
console.log(JSON.stringify({
 mission:evidence.mission,
 catalogMetadataCards:engineCatalog.length,
 engineCertifiedCards:enabled.length,
 baselineCertifiedCards:evidence.baseline.engineV9Certified,
 adapterCandidates:evidence.cards.length,
 adapterTestCases:testCount,
 newEngineCertificates:0,
 automaticCertifications:0,
 inventoryGrants:0,
 centralIntegration:'pending-handoff'
},null,2));
