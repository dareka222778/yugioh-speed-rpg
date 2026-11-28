#!/usr/bin/env node
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {getEnabledCardIds,getDuelCard,engineCatalog}=require('../dist/effectRegistry');
const evidence=JSON.parse(fs.readFileSync('docs/evidence/m690-battle-topdeck.json','utf8'));
const certificates=fs.readFileSync('src/cardCertifications.ts','utf8');
const source=fs.readFileSync('src/battleTopdeckTagAdapter.ts','utf8');
const tests=fs.readFileSync('tests/battleTopdeckTagAdapter.test.cjs','utf8');
assert.equal(evidence.mission,'M690');
assert.equal(evidence.status,'isolated-adapter-only');
assert.equal(evidence.cards.length,3);
assert.equal(evidence.baseline.engineV9Certified,969);
assert.equal(evidence.counts.baselineEngineV9Certified,969);
assert.equal(evidence.counts.remainingTo1000,31);
assert.equal(evidence.counts.adapterBehaviorVerifiedCards,3);
assert.equal(evidence.counts.newEngineCertifiedCards,0);
assert.equal(evidence.counts.automaticCertifications,0);
assert.equal(evidence.counts.inventoryGrants,0);
assert.equal(evidence.integration.centralFilesModified,false);
assert.equal(evidence.integration.catalogModified,false);
assert.equal(evidence.integration.certificationsModified,false);
assert.equal(evidence.integration.discordCommandsModified,false);
assert.equal(evidence.integration.databaseModified,false);
assert.equal(evidence.integration.inventoryGranted,false);
assert.equal(evidence.integration.productionTouched,false);
assert.ok(source.includes('ownedPrivateZone'));
assert.ok(source.includes('active.deck.shift()'));
assert.ok(source.includes('active.hand.push(drawn)'));
assert.ok(source.includes('.unshift(card)'));
assert.ok(source.includes('.push(card)'));
assert.ok(source.includes("rules.handCheck!=='end'"));
assert.ok(source.includes('rules.handLimit!==6'));
assert.ok(source.includes('rules.monsterZones!==3'));
assert.ok(source.includes('rules.spellTrapZones!==3'));
assert.ok(source.includes('rules.extraDeckMax!==5'));
assert.ok(source.includes('rules.mainDeckMin!==20'));
assert.ok(source.includes('rules.mainDeckMax!==30'));
const enabled=getEnabledCardIds();
assert.equal(enabled.length,969,'baseline engine-v9 certificate count changed; reconcile before admission');
for(const card of evidence.cards){
 assert.ok(card.source.startsWith('https://www.db.yugioh-card.com/yugiohdb/card_search.action'));
 assert.ok(card.firstOCGRelease<'2004-10-01','candidate is outside the historical cutoff: '+card.name);
 assert.ok(!enabled.includes(card.id),'candidate must not be silently admitted: '+card.id);
 assert.equal(getDuelCard(card.id),undefined,'candidate must remain unavailable until engine integration: '+card.id);
 assert.ok(!certificates.includes('"'+card.id+'"'),'candidate must not receive an unreviewed certificate: '+card.id);
}
const testCount=(tests.match(/\btest\(/g)||[]).length;
assert.ok(testCount>=14,'expected at least 14 executable behavior scenarios');
assert.equal(evidence.behaviorTests.suite,'tests/battleTopdeckTagAdapter.test.cjs');
assert.equal(evidence.behaviorTests.authoredCases,testCount);
assert.equal(evidence.behaviorTests.adapterBehaviorVerifiedCards,3);
assert.equal(evidence.behaviorTests.engineBehaviorCertifiedCards,0);
console.log(JSON.stringify({
 mission:evidence.mission,
 engineCatalogEntries:engineCatalog.length,
 engineCertifiedCards:enabled.length,
 baselineCertifiedCards:evidence.baseline.engineV9Certified,
 adapterCandidates:evidence.cards.length,
 adapterTestCases:testCount,
 newEngineCertificates:0,
 automaticCertifications:0,
 inventoryGrants:0,
 centralIntegration:'pending-handoff'
},null,2));
