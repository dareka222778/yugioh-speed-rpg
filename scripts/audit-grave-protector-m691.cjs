#!/usr/bin/env node
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {getEnabledCardIds,getDuelCard,engineCatalog}=require('../dist/effectRegistry');
const evidence=JSON.parse(fs.readFileSync('docs/evidence/m691-grave-protector.json','utf8'));
const certificates=fs.readFileSync('src/cardCertifications.ts','utf8');
const source=fs.readFileSync('src/graveProtectorBattleReplacementTagAdapter.ts','utf8');
const tests=fs.readFileSync('tests/graveProtectorBattleReplacementTagAdapter.test.cjs','utf8');
assert.equal(evidence.mission,'M691');
assert.equal(evidence.status,'isolated-adapter-only');
assert.equal(evidence.card.id,'11448373');
assert.equal(evidence.card.konamiId,6039);
assert.ok(evidence.card.firstTCGRelease<'2004-10-01');
assert.ok(evidence.card.firstOCGRelease>='2004-10-01');
assert.equal(evidence.baseline.engineV9Certified,969);
assert.equal(evidence.counts.baselineEngineV9Certified,969);
assert.equal(evidence.counts.remainingTo1000,31);
assert.equal(evidence.counts.adapterBehaviorVerifiedCards,1);
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
assert.ok(source.includes('shuffleDuel'));
assert.ok(source.includes('ownedPrivateZone'));
assert.ok(source.includes('removeToken'));
assert.ok(source.includes('DuelRandom'));
assert.ok(source.includes("rules.handCheck!=='end'"));
assert.ok(source.includes('rules.handLimit!==6'));
assert.ok(source.includes('rules.monsterZones!==3'));
assert.ok(source.includes('rules.spellTrapZones!==3'));
assert.ok(source.includes('rules.extraDeckMax!==5'));
assert.ok(source.includes('rules.mainDeckMin!==20'));
assert.ok(source.includes('rules.mainDeckMax!==30'));
const enabled=getEnabledCardIds();
assert.equal(enabled.length,969,'baseline engine-v9 certificate count changed; reconcile before admission');
assert.ok(!enabled.includes(evidence.card.id),'candidate must remain unadmitted until central integration');
assert.equal(getDuelCard(evidence.card.id),undefined,'candidate must remain unavailable until engine integration');
assert.ok(!certificates.includes('"'+evidence.card.id+'"'),'candidate must not receive an unreviewed certificate');
const testCount=(tests.match(/\btest\(/g)||[]).length;
assert.ok(testCount>=16,'expected at least 16 executable behavior scenarios');
assert.equal(evidence.behaviorTests.suite,'tests/graveProtectorBattleReplacementTagAdapter.test.cjs');
assert.equal(evidence.behaviorTests.authoredCases,testCount);
assert.equal(evidence.behaviorTests.adapterBehaviorVerifiedCards,1);
assert.equal(evidence.behaviorTests.engineBehaviorCertifiedCards,0);
console.log(JSON.stringify({
 mission:evidence.mission,
 engineCatalogEntries:engineCatalog.length,
 engineCertifiedCards:enabled.length,
 adapterCandidates:1,
 adapterTestCases:testCount,
 newEngineCertificates:0,
 automaticCertifications:0,
 inventoryGrants:0,
 historicalDateDiscrepancy:evidence.historicalMetadataDiscrepancy.disposition,
 centralIntegration:'pending-handoff'
},null,2));
