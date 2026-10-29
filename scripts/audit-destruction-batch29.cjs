const assert=require('node:assert/strict'),fs=require('node:fs');
const {destructionBatch29:cards,destructionEffects29:effects}=require('../dist/destructionBatch29');
const {definitionFingerprint}=require('../dist/cardRegistry'),{getEffectModel}=require('../dist/effectModels');
const {getCardStatus,enabledCardIds}=require('../dist/effectRegistry');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const proof=require('../docs/evidence/mission29-destruction-review.json');
const history=require('../catalog/historical/2004-10-01/cards.json');
const runs=JSON.parse(fs.readFileSync('artifacts/certification-executions-destruction29.json','utf8'));
assert.equal(cards.length,3);assert.equal(new Set(cards.map(c=>c.id)).size,3);
for(const c of cards){
 const h=history.find(h=>h.konamiId===c.konamiId),p=proof.cards.find(p=>p.id===c.id),r=runs.find(r=>r.id===c.id);
 assert.equal(h.names.en,c.englishName);assert.ok(h.passwords.includes(c.id));assert.ok(h.firstObserved.world<='2004-09-30');
 assert.equal(p.englishName,c.englishName);assert.equal(p.firstObservedWorld,h.firstObserved.world);assert.equal(p.source,c.source);assert.equal(p.fullEffectReviewed,true);
 assert.equal(getCardStatus(c.id).stage,'certified');assert.equal(cardDistributionAllowed(c.id),true);
 assert.equal(r.fingerprint,definitionFingerprint(c,effects[c.id],{model:getEffectModel}));assert.equal(r.publicEngine,true);assert.equal(r.resolverVersion,'engine-v9');assert.deepEqual(r.failed,[]);
 for(const required of ['identity','active-execution','restore','negation','activation-restrictions','illegal-action-preserves-input'])assert.ok(r.passed.includes(required),`${c.id} ${required}`);
}
console.log({admitted:cards.length,total:enabledCardIds.length,remaining:Math.max(0,1962-enabledCardIds.length)});
