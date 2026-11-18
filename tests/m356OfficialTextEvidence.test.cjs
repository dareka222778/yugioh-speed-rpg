'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const evidence=require('../docs/evidence/m356-next-ten-official-text-review.json');

const EXPECTED=[
  ['29654737',5291,'Amazoness Chain Master'],
  ['94004268',5284,'Amazoness Swords Woman'],
  ['10979723',5647,'Amazoness Tiger'],
  ['95174353',4490,'Ameba'],
  ['23927567',5523,'An Owl of Luck'],
  ['54912977',5238,'Ancient Lamp'],
  ['15013468',6087,'Andro Sphinx'],
  ['65064143',5890,'Anti-Aircraft Flower'],
  ['09156135',5650,'Apprentice Magician'],
  ['40916023',5253,'Aqua Spirit']
];

test('M356 evidence matches worklist entries 11–20 with unique Konami identities',()=>{
  assert.equal(evidence.mission,'M356');
  assert.equal(evidence.worklist.workflowRunId,44288029483);
  assert.equal(evidence.worklist.artifactId,14419288363);
  assert.equal(evidence.worklist.certified,969);
  assert.equal(evidence.worklist.remainingToGoal,31);
  assert.equal(evidence.worklist.identityBlocked,27);
  assert.equal(evidence.cards.length,EXPECTED.length);
  assert.equal(new Set(evidence.cards.map(card=>card.id)).size,EXPECTED.length);
  for(let i=0;i<EXPECTED.length;i++){
    assert.deepEqual(
      [evidence.cards[i].id,evidence.cards[i].konamiId,evidence.cards[i].name],
      EXPECTED[i]
    );
  }
});

test('M356 groups reusable mechanics without certifying imported card records',()=>{
  const ids=new Set(evidence.cards.map(card=>card.id));
  assert.ok(evidence.reusableFamilies.length>=4);
  for(const family of evidence.reusableFamilies){
    assert.ok(family.cards.length>0);
    for(const id of family.cards)assert.ok(ids.has(id),'unknown card in family '+family.family);
  }
  for(const card of evidence.cards){
    assert.equal(card.sourceVerified,true,card.name);
    assert.equal(card.engineReviewStatus,'pending',card.name);
    assert.equal(card.behavioralTestStatus,'not-run',card.name);
    assert.equal(card.certificationStatus,'not-certified',card.name);
    assert.equal(card.automaticCertification,false,card.name);
    assert.equal(card.historicalEligibility,'pending OCG/TCG first-release audit',card.name);
    assert.ok(card.twoVTwoReviewQuestions.length>=2,card.name);
    assert.ok(card.effectSummary.length>=40,card.name);
    assert.match(card.officialSourceUrl,/^https:\/\/www\.db\.yugioh-card\.com\/yugiohdb\/card_search\.action\?/);
    assert.doesNotMatch(card.effectSummary,/^["“].*["”]$/,'effect summary must remain a paraphrase');
  }
});

test('M356 preserves the historical-cutoff and certification review gates',()=>{
  assert.match(evidence.authority,/Konami official/);
  assert.match(evidence.sourcePolicy.cardText,/paraphrases/);
  assert.match(evidence.sourcePolicy.historicalCutoff,/not be used to infer/);
  assert.match(evidence.sourcePolicy.certification,/not certified/);
});
