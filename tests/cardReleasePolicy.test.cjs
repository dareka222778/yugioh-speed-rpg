const {test}=require('node:test'),assert=require('node:assert/strict');
const {enabledCardIds,engineCatalog,getCardStatus}=require('../dist/effectRegistry');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const {releasedCardIds}=require('../dist/releasedCardIds');
const proof=require('../docs/evidence/mission27-release.json');
const {buildCardRegistry,definitionFingerprint}=require('../dist/cardRegistry');
const {getEffectModel}=require('../dist/effectModels');
const {getEffect}=require('../dist/effectRegistry');
const {getMonsterDefinition}=require('../dist/monsterEffects');
test('M27 owner-authorized release remains a subset of certified identities',()=>{
 assert.equal(proof.certifiedCount,832);assert.equal(proof.newReleaseCount,696);
 assert.ok([...releasedCardIds].every(id=>enabledCardIds.includes(id)));
 assert.equal(releasedCardIds.size,enabledCardIds.filter(cardDistributionAllowed).length);
 for(const id of releasedCardIds){assert.equal(getCardStatus(id)?.stage,'certified');assert.equal(cardDistributionAllowed(id),true);}
});
test('M27 imported-only, unknown, malformed and token identities remain blocked',()=>{
 const history=require('../catalog/historical/2004-10-01/cards.json');
 const pending=history.flatMap(c=>c.passwords).filter(id=>!enabledCardIds.includes(id));assert.ok(pending.length>1000);
 for(const id of [...pending,'token:sheep','00000000','','71625222','82828051:1','82828051 '])assert.equal(cardDistributionAllowed(id),false,id);
 assert.equal(engineCatalog.filter(c=>getCardStatus(c.id)?.stage!=='certified').length,0);
});

test('a behavior-certified identity can remain withheld from distribution',()=>{
 const base=engineCatalog.find(c=>c.kind==='monster'&&c.monsterType==='effect'&&getEffect(c.id)&&getMonsterDefinition(c.id));
 assert.ok(base,'A certified effect-monster fixture is required');
 const id='00000001';assert.equal(releasedCardIds.has(id),false);
 const card={...base,id,konamiId:99999999,englishName:'Withheld synthetic fixture'};
 const effect=getEffect(base.id),monster=getMonsterDefinition(base.id),context={model:getEffectModel,monster:()=>monster};
 const fingerprint=definitionFingerprint(card,effect,context);
 const registry=buildCardRegistry([card],{[id]:effect},{[id]:{fingerprint,suites:['tests/cardReleasePolicy.test.cjs']}},context);
 assert.equal(registry.statuses.get(id)?.stage,'certified');
 assert.equal(cardDistributionAllowed(id),false);
});
