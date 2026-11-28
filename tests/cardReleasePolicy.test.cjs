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
 const pending=history.flatMap(c=>c.passwords).filter(id=>!enabledCardIds.includes(id));assert.ok(pending.length>1000);
 for(const id of [...pending,'token:sheep','00000000','','71625222','82828051:1','82828051 '])assert.equal(cardDistributionAllowed(id),false,id);
 assert.equal(engineCatalog.filter(c=>getCardStatus(c.id)?.stage!=='certified').length,0);
});
