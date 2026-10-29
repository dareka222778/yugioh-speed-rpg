/** Run after the referenced suite; this gate validates identities and admission, not test execution. */
const assert=require('node:assert/strict');
const {positionBatch26,positionEffects26}=require('../dist/positionBatch26');
const r=require('../dist/effectRegistry');
const {cardCertifications}=require('../dist/cardCertifications');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {getEffectModel}=require('../dist/effectModels');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const history=require('../catalog/historical/2004-10-01/cards.json');
const reviews=require('../docs/evidence/mission26-position-reviews.json');
assert.equal(positionBatch26.length,4);assert.equal(reviews.cards.length,4);
assert.equal(new Set(positionBatch26.map(c=>c.konamiId)).size,4);
for(const c of positionBatch26){
 const h=history.find(v=>v.konamiId===c.konamiId),review=reviews.cards.find(v=>v.id===c.id);
 assert.ok(h?.passwords.includes(c.id));assert.equal(h.names.en,c.englishName);assert.ok(h.firstObserved.world<='2004-09-30');
 assert.equal(review?.source,c.source);assert.equal(review?.fullEffectReviewed,true);
 assert.equal(r.getCardStatus(c.id).stage,'certified');assert.equal(cardDistributionAllowed(c.id),false);
 assert.equal(cardCertifications[c.id].fingerprint,definitionFingerprint(c,positionEffects26[c.id],{model:getEffectModel}));
 assert.deepEqual(cardCertifications[c.id].suites,['tests/positionBatch26.test.cjs']);
}
const total=r.enabledCardIds.length,newSinceBaseline=total-771;
console.log(JSON.stringify({batch:26,admitted:4,certified:total,newSinceMission21Baseline:newSinceBaseline,targetNew:500,remainingToTarget:Math.max(0,500-newSinceBaseline),historicalPending:1962-total,distribution:r.enabledCardIds.filter(cardDistributionAllowed).length,note:'Mechanical admission audit; run referenced tests separately.'}));
