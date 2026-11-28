const assert=require('node:assert/strict');
const fs=require('node:fs');
const evidence=JSON.parse(fs.readFileSync('docs/evidence/m656-battle-target-policies.json','utf8'));
const report=JSON.parse(fs.readFileSync('artifacts/m656-battle-target-policy-results.json','utf8'));
const {enabledCardIds,getPlayableCard}=require('../dist/effectRegistry');
assert.equal(evidence.mission,'M656');
assert.equal(evidence.cards.length,2);
assert.equal(evidence.scenarioCount,30);
assert.equal(report.scenarioCount,evidence.scenarioCount);
assert.equal(report.completed,evidence.scenarioCount);
assert.equal(report.failed,0);
assert.ok(report.inventoryConservationChecks>=4);
assert.equal(report.noInventoryGrants,true);
assert.equal(report.physicalInventoryConserved,true);
assert.equal(evidence.certification.status,'not-certified');
assert.equal(evidence.certification.newCertifications,0);
assert.equal(evidence.physicalIntegrity.inventoryGrants,0);
for(const card of evidence.cards){
 assert.equal(enabledCardIds.includes(card.id),false,card.name+' must remain outside the enabled registry');
 assert.equal(getPlayableCard(card.id),undefined,card.name+' must not be playable before certification');
 assert.ok(card.firstTcgRelease<'2004-10-01',card.name+' must be within the historical cutoff');
}
console.log('M656 evidence validated: 2 historical candidates, 30 behavior scenarios, 0 certifications, 0 inventory grants.');
