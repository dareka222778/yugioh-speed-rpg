const {fusionBatch8}=require('../dist/fusionBatch8');
const {historicalFusionBatch10}=require('../dist/historicalFusionBatch10');
const {historicalNormalBatch9}=require('../dist/historicalNormalBatch9');
const {mechanicalBatch8}=require('../dist/mechanicalBatch8');
const {mechanicalBatch7}=require('../dist/mechanicalBatch7');
const {mechanicalBatch5}=require('../dist/mechanicalBatch5');
const {test}=require('node:test'),assert=require('node:assert/strict'),{enabledCardIds}=require('../dist/effectRegistry'),{cardDistributionAllowed}=require('../dist/cardReleasePolicy'),{historicalNormalBatch}=require('../dist/historicalNormalBatch'),{historicalNormalBatch4}=require('../dist/historicalNormalBatch4');
test('distribution policy blocks all new certificates, unknown cards and synthetic tokens while preserving the original cohort',()=>{
 const blocked=enabledCardIds.filter(id=>!cardDistributionAllowed(id));assert.deepEqual([...blocked].sort(),[...historicalNormalBatch,...historicalNormalBatch4,...mechanicalBatch5,...mechanicalBatch7,...mechanicalBatch8,...fusionBatch8,...historicalNormalBatch9,...historicalFusionBatch10,...require('../dist/mechanicalBatch11').mechanicalBatch11,...require('../dist/mechanicalBatch14').mechanicalBatch14,...require('../dist/mechanicalBatch15').mechanicalBatch15,...require('../dist/mechanicalBatch16').mechanicalBatch16,...require('../dist/worldNormalBatch16').worldNormalBatch16,...require('../dist/mechanicalBatch17').mechanicalBatch17,...require('../dist/mechanicalBatch18').mechanicalBatch18].map(c=>c.id).sort());assert.equal(blocked.length,639);assert.equal(enabledCardIds.filter(cardDistributionAllowed).length,130);
 for(const id of ['token:sheep','00000000','', '71625222'])assert.equal(cardDistributionAllowed(id),false);assert.equal(cardDistributionAllowed('91152256'),true);
});
