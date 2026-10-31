const {test}=require('node:test'),assert=require('node:assert/strict'),{buildBatch}=require('../scripts/prepare-historical-batch.cjs'),{enabledCardIds}=require('../dist/effectRegistry');
test('pre-September-30 historical batch is factual staging, with explicit identities and no admission',()=>{
 const before=[...enabledCardIds],a=buildBatch(),b=buildBatch();assert.deepEqual(a,b);assert.equal(a.candidates.length,20);assert.equal(a.enablesCards,false);assert.equal(a.grantsInventory,false);assert.deepEqual(enabledCardIds,before);assert.equal(a.enabledBefore,130);assert.equal(a.enabledAfter,130);
 for(const card of a.candidates){assert.equal(card.namespace,'passcode');assert.match(card.id,/^\d{8}$/);assert.ok(!require('../dist/resolvers/v2/effectRegistry').enabledCardIds.includes(card.id));assert.ok(card.firstObserved.world<='2004-09-30');assert.ok(card.requiredReview.includes('regression-evidence'));assert.equal(card.family,'normal-monster');}
});
test('next 20 candidates remain a reproducible proposal over the 150-card cohort',()=>{
 const next=buildBatch(true),saved=require('../catalog/proposed/normal-next-mission3.json');assert.deepEqual(next,saved);assert.equal(next.enabledBefore,150);assert.equal(next.enabledAfter,150);assert.equal(next.candidates.length,20);assert.equal(next.enablesCards,false);assert.equal(next.grantsInventory,false);for(const card of next.candidates)assert.ok(!require('../dist/resolvers/v3/effectRegistry').enabledCardIds.includes(card.id));
});
