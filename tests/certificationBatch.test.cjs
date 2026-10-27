const {test}=require('node:test'),assert=require('node:assert/strict');
const {planCertificationBatch}=require('../dist/certificationBatch'),registry=require('../dist/effectRegistry');
const {definitionFingerprint}=require('../dist/cardRegistry'),{getMonsterDefinition}=require('../dist/monsterEffects'),{getEffectModel}=require('../dist/effectModels');
const candidate=()=>{const id='91152256';return {namespace:'passcode',id,fingerprint:definitionFingerprint(registry.engineCard(id),registry.getEffect(id),{monster:getMonsterDefinition,model:getEffectModel}),suites:['tests/certificationBatch.test.cjs']};};
test('REA-D02: explicit identity namespace rejects ordinals even if they resemble a valid passcode',()=>{
 for(const namespace of ['seed-ordinal','internal','yugipedia'])assert.ok(planCertificationBatch([{...candidate(),namespace}])[0].issues.includes('unsupported-identity-namespace'));
 assert.ok(planCertificationBatch([{...candidate(),id:'164fa78'}])[0].issues.includes('invalid-passcode'));
});
test('historical batch review requires current mechanical fingerprints and regression references',()=>{
 const c=candidate();assert.equal(planCertificationBatch([c])[0].readyForReview,true);
 assert.equal(planCertificationBatch([{...c,fingerprint:'outdated'}])[0].readyForReview,false);
 assert.equal(planCertificationBatch([{...c,suites:[]}])[0].readyForReview,false);
 assert.equal(planCertificationBatch([c,c])[1].readyForReview,false);
});
test('REA-D03: read-only batch planning cannot enable cards or distribute inventory',()=>{
 const before=[...registry.enabledCardIds];planCertificationBatch([candidate(),{...candidate(),id:'00000000'}]);assert.deepEqual(registry.enabledCardIds,before);assert.equal(before.length,243);
});
test('REA-D01: translated presentation is excluded from mechanical certification identity',()=>{
 const id='91152256',card=registry.engineCard(id),effect=registry.getEffect(id),context={monster:getMonsterDefinition,model:getEffectModel};
 assert.equal(definitionFingerprint({...card,name:'Fallback name',summary:undefined},effect,context),definitionFingerprint(card,effect,context));
});
