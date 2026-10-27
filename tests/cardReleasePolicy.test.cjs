const {mechanicalBatch8}=require('../dist/mechanicalBatch8');
const {mechanicalBatch7}=require('../dist/mechanicalBatch7');
const {mechanicalBatch5}=require('../dist/mechanicalBatch5');
const {test}=require('node:test'),assert=require('node:assert/strict'),{enabledCardIds}=require('../dist/effectRegistry'),{cardDistributionAllowed}=require('../dist/cardReleasePolicy'),{historicalNormalBatch}=require('../dist/historicalNormalBatch'),{historicalNormalBatch4}=require('../dist/historicalNormalBatch4');
test('distribution policy blocks all new certificates, unknown cards and synthetic tokens while preserving the original cohort',()=>{
 const blocked=enabledCardIds.filter(id=>!cardDistributionAllowed(id));assert.deepEqual([...blocked].sort(),[...historicalNormalBatch,...historicalNormalBatch4,...mechanicalBatch5,...mechanicalBatch7,...mechanicalBatch8].map(c=>c.id).sort());assert.equal(blocked.length,95);assert.equal(enabledCardIds.filter(cardDistributionAllowed).length,130);
 for(const id of ['token:sheep','00000000','', '71625222'])assert.equal(cardDistributionAllowed(id),false);assert.equal(cardDistributionAllowed('91152256'),true);
});
