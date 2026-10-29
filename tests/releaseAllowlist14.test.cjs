const {test}=require('node:test'),assert=require('node:assert/strict');
const {releasedCardIds}=require('../dist/releasedCardIds');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const registry=require('../dist/effectRegistry');
const proof=require('../docs/evidence/mission27-release.json');
test('M27 explicit release preserves the original cohort and adds exactly the approved 696 cards',()=>{
 const previous=JSON.parse(require('node:fs').readFileSync('catalog/engine-v9/'+proof.catalogRevision+'.json','utf8'));
 assert.equal(previous.cards.length,832);assert.equal(releasedCardIds.size,832);
 assert.equal(proof.addedIds.length,696);assert.equal(new Set(proof.addedIds).size,696);
 const inherited=[...releasedCardIds].filter(id=>!proof.addedIds.includes(id));assert.equal(inherited.length,136);
 const historical=[...previous.cards].filter(c=>!proof.addedIds.includes(c.id));assert.equal(historical.length,136);
 assert.deepEqual(new Set(registry.enabledCardIds.filter(cardDistributionAllowed)),releasedCardIds);
});
test('M27 release neither invents cards nor changes archived catalog definitions',()=>{
 for(const id of ['00000000','71625222','token:sheep'])assert.equal(cardDistributionAllowed(id),false);
 const manifest=require('../catalog/engine-v7/manifest.json');const old=require('../catalog/engine-v7/'+manifest.revisions.at(-2).id+'.json');
 assert.equal(old.cards.length,740);const legacyIds=new Set(old.cards.map(c=>c.id));
 assert.equal([...legacyIds].filter(id=>!proof.addedIds.includes(id)).length,130);
 assert.equal([...legacyIds].filter(cardDistributionAllowed).length,740);
});
