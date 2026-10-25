const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildCardMatrix}=require('../scripts/audit-card-matrix.cjs');
const {enabledCardIds}=require('../dist/effectRegistry');

test('certified card matrix has one verifiable row per enabled card and separates evidence from coverage',()=>{
 const audit=buildCardMatrix();
 assert.equal(audit.totals.certified,enabledCardIds.length);
 assert.equal(new Set(audit.cards.map(c=>c.id)).size,audit.totals.certified);
 assert.equal(Object.values(audit.effectKinds).reduce((sum,n)=>sum+n,0),audit.totals.certified);
 assert.equal(audit.totals.requiresEffectReview,audit.cards.filter(c=>c.manualEffectReview).length);
 assert.equal(audit.totals.indirectTestReferences,audit.cards.filter(c=>c.manualEffectReview&&!c.directIdMention).length);
 for(const card of audit.cards){
  assert.ok(card.descriptionCharacters>0);
  assert.equal(card.descriptionPT.length,card.descriptionCharacters);
  assert.ok(card.suites.length>0);
  assert.ok(card.suites.every(s=>s.file.startsWith('tests/')&&typeof s.mentionsCardId==='boolean'));
  assert.equal(card.evidence,'mechanical-fingerprint-and-referenced-suite');
 }
});
