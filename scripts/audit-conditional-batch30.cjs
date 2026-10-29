const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const b=require('../dist/conditionalBatch30'),{definitionFingerprint}=require('../dist/cardRegistry'),{getEffectModel}=require('../dist/effectModels');
const {getCardStatus,enabledCardIds}=require('../dist/effectRegistry'),{cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const proof=require('../docs/evidence/mission30-conditional-review.json'),history=require('../catalog/historical/2004-10-01/cards.json');
const runs=JSON.parse(fs.readFileSync('artifacts/certification-executions-conditional30.json','utf8'));
const cards=b.conditionalBatch30;
assert.equal(cards.length,10);assert.equal(new Set(cards.map(c=>c.id)).size,10);assert.equal(runs.length,10);assert.equal(proof.cards.length,10);
for(const c of cards){
 const h=history.find(h=>h.konamiId===c.konamiId),p=proof.cards.find(p=>p.id===c.id),r=runs.find(r=>r.id===c.id);
 assert.ok(h&&p&&r,c.id);assert.ok(h.passwords.includes(c.id));assert.equal(h.names.en,c.englishName);assert.ok(h.firstObserved.world<='2004-09-30');
 assert.equal(p.englishName,c.englishName);assert.equal(p.firstObservedWorld,h.firstObserved.world);assert.equal(p.source,c.source);assert.equal(p.fullEffectReviewed,true);
 assert.equal(getCardStatus(c.id).stage,'certified');assert.equal(cardDistributionAllowed(c.id),true);
 assert.equal(r.fingerprint,definitionFingerprint(c,b.conditionalEffects30[c.id],{model:getEffectModel,monster:id=>b.conditionalMonsters30[id]}));
 assert.equal(r.publicEngine,true);assert.equal(r.resolverVersion,'engine-v9');assert.deepEqual(r.failed,[]);
 for(const label of ['identity','active-execution','restore','negation','activation-restrictions','illegal-action-preserves-input'])assert.ok(r.passed.includes(label),`${c.id}: ${label}`);
 assert.ok(require('../dist/cardText').cardRulesPT(c.id).length>65,c.englishName);
}
const pinned=require('../catalog/engine-v9/63098a704e70ebfde80e9bed3b961b1b5bf0c6bc7a4932f6a5ee4c78a3e1940f.json');
assert.equal(pinned.cards.length,903);assert.ok(enabledCardIds.length>=903);
for(const c of pinned.cards)assert.ok(enabledCardIds.includes(c.id),'Preserve every M30 certified card '+c.id);
const strip=require('./mission30-conditional-reviewed.cjs').strip;
for(const file of ['src/cardMetadata.ts','src/cardCertifications.ts','src/releasedCardIds.ts']){
 const bytes=fs.readFileSync(file);assert.ok(strip(file,bytes).length<bytes.length,file);
}
const manifest=require('../catalog/engine-v9/manifest.json');
const current=require('../catalog/engine-v9/'+manifest.current+'.json');
assert.equal(current.cards.length,enabledCardIds.length);
for(const c of pinned.cards){assert.deepEqual(current.cards.find(v=>v.id===c.id),c,'Preserve pinned M30 metadata '+c.id);for(const section of ['effects','monsters','certificates'])assert.deepEqual(current[section][c.id],pinned[section][c.id],'Preserve pinned M30 '+section+' '+c.id);}
for(const c of cards)assert.ok(current.cards.some(v=>v.id===c.id));
console.log({admitted:cards.length,total:enabledCardIds.length,remaining:1962-enabledCardIds.length,revision:manifest.current});
