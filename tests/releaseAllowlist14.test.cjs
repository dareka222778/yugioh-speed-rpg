const {test}=require('node:test');
const assert=require('node:assert/strict');
const {releasedCardIds}=require('../dist/releasedCardIds');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const registry=require('../dist/effectRegistry');

test('pre-beta release policy grants only 130 explicit historically allowed cards',()=>{
 assert.equal(releasedCardIds.size,130);
 assert.ok(registry.enabledCardIds.length>=769);
 const grants=registry.enabledCardIds.filter(cardDistributionAllowed);
 assert.deepEqual(new Set(grants),releasedCardIds);
 assert.equal(grants.length,130);
});
test('certification alone, unknown IDs and staging cards never imply distribution',()=>{
 assert.equal(registry.getCardStatus('96890582').stage,'certified');
 assert.equal(cardDistributionAllowed('96890582'),false);
 assert.equal(cardDistributionAllowed('00000000'),false);
 for(const id of registry.enabledCardIds.filter(id=>!releasedCardIds.has(id)))assert.equal(cardDistributionAllowed(id),false,id);
});
test('old 740-card catalog keeps precisely the same inherited 130 release IDs',()=>{
 const manifest=require('../catalog/engine-v7/manifest.json');
 const old=require('../catalog/engine-v7/'+manifest.revisions.at(-2).id+'.json');
 assert.equal(old.cards.length,740);
 const oldIds=new Set(old.cards.map(c=>c.id));
 assert.ok([...releasedCardIds].every(id=>oldIds.has(id)));
 assert.equal([...oldIds].filter(cardDistributionAllowed).length,130);
});
