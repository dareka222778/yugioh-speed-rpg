'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const evidence=require('../docs/evidence/m357-final-eleven-official-text-review.json');

const EXPECTED=[
  ['55001420',5971,'Arcane Archer of the Forest'],
  ['50287060',5091,'Archfiend of Gilfer'],
  ['18378582',5976,'Archlord Zerato'],
  ['00980973',6105,'Armed Dragon LV3'],
  ['46384672',6106,'Armed Dragon LV5'],
  ['73879377',6107,'Armed Dragon LV7'],
  ['07180418',5659,'Armor Exe'],
  ['42364374',5033,'Arsenal Bug'],
  ['02134346',5381,'Asura Priest'],
  ['88236094',6026,'Aswan Apparition'],
  ['87340664',5966,'Atomic Firefly']
];

test('M357 evidence completes worklist entries 21–31 with unique official identities',()=>{
  assert.equal(evidence.mission,'M357');
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

test('M357 groups the Armed Dragon chain and battle/field mechanics without automatic admission',()=>{
  const ids=new Set(evidence.cards.map(card=>card.id));
  assert.ok(evidence.reusableFamilies.length>=5);
  for(const family of evidence.reusableFamilies){
    assert.ok(family.cards.length>0);
    for(const id of family.cards)assert.ok(ids.has(id),'unknown card in family '+family.family);
  }
  const armed=evidence.cards.filter(card=>card.name.startsWith('Armed Dragon'));
  assert.deepEqual(armed.map(card=>card.id),['00980973','46384672','73879377']);
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

test('M357 keeps historical eligibility and behavioral certification as separate gates',()=>{
  assert.match(evidence.authority,/Konami official/);
  assert.match(evidence.sourcePolicy.cardText,/paraphrases/);
  assert.match(evidence.sourcePolicy.historicalCutoff,/not be used to infer/);
  assert.match(evidence.sourcePolicy.certification,/No card is certified/);
});
