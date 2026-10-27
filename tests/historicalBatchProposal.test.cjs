const {test}=require('node:test'),assert=require('node:assert/strict'),{buildBatch}=require('../scripts/prepare-historical-batch.cjs'),{enabledCardIds}=require('../dist/effectRegistry');
test('pre-September-30 historical batch is factual staging, with explicit identities and no admission',()=>{
 const before=[...enabledCardIds],a=buildBatch(),b=buildBatch();assert.deepEqual(a,b);assert.equal(a.candidates.length,20);assert.equal(a.enablesCards,false);assert.equal(a.grantsInventory,false);assert.deepEqual(enabledCardIds,before);assert.equal(a.enabledBefore,130);assert.equal(a.enabledAfter,130);
 for(const card of a.candidates){assert.equal(card.namespace,'passcode');assert.match(card.id,/^\d{8}$/);assert.ok(!before.includes(card.id));assert.ok(card.firstObserved.world<='2004-09-30');assert.ok(card.requiredReview.includes('regression-evidence'));assert.equal(card.family,'normal-monster');}
});
