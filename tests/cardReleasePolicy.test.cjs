const {test}=require('node:test'),assert=require('node:assert/strict');
const {enabledCardIds,engineCatalog,getCardStatus}=require('../dist/effectRegistry');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const {releasedCardIds}=require('../dist/releasedCardIds');
const proof=require('../docs/evidence/mission27-release.json');
test('M27 owner-authorized release contains every certified card and no extras',()=>{
 assert.equal(proof.certifiedCount,832);assert.equal(proof.newReleaseCount,696);
 assert.equal(releasedCardIds.size,enabledCardIds.length);assert.deepEqual(new Set(enabledCardIds),releasedCardIds);
 assert.equal(enabledCardIds.filter(cardDistributionAllowed).length,enabledCardIds.length);
 for(const id of releasedCardIds){assert.equal(getCardStatus(id)?.stage,'certified');assert.equal(cardDistributionAllowed(id),true);}
});
test('M27 imported-only, unknown, malformed and token identities remain blocked',()=>{
 const history=require('../catalog/historical/2004-10-01/cards.json');
 // Verify the entire frozen historical corpus, including aliases. Its pending
 // count shrinks with every admission; no pending passcode is a permanent fixture.
 assert.equal(new Set(history.map(c=>c.id)).size,1962);
 const certified=new Set(enabledCardIds),historical=new Set(history.flatMap(c=>c.passwords));
 for(const id of certified)assert.ok(historical.has(id),'Certified ID missing from historical corpus: '+id);
 for(const id of historical)assert.equal(cardDistributionAllowed(id),certified.has(id),id);
 for(const id of ['token:sheep','00000000','','82828051:1','82828051 '])assert.equal(cardDistributionAllowed(id),false,id);
 assert.equal(engineCatalog.filter(c=>getCardStatus(c.id)?.stage!=='certified').length,0);
});
