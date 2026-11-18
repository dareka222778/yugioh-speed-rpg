'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const evidence=require('../docs/evidence/m355-first-ten-official-text-review.json');

const EXPECTED=[
  ['86988864',6032,'3-Hump Lacooda'],
  ['14261867',5421,'8-Claws Scorpion'],
  ['24140059',5520,'A Cat of Ill Omen'],
  ['51351302',5518,'A Man with Wdjat'],
  ['13026402',6202,'A-Team: Trap Disposal Unit'],
  ['49771608',6034,'Absorbing Kid from the Sky'],
  ['18318842',5927,'Abyss Soldier'],
  ['16135253',5366,'Agido'],
  ['18036057',5023,'Airknight Parshath'],
  ['73574678',5646,'Amazoness Blowpiper']
];

test('M355 evidence matches the latest milestone worklist and contains ten unique official identities',()=>{
  assert.equal(evidence.mission,'M355');
  assert.equal(evidence.worklist.workflowRunId,44288029483);
  assert.equal(evidence.worklist.artifactId,14419288363);
  assert.equal(evidence.worklist.target,1000);
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

test('M355 source review cannot silently promote a card to certification',()=>{
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

test('M355 source review keeps the official source authority and non-certifying policy explicit',()=>{
  assert.match(evidence.authority,/Konami official/);
  assert.match(evidence.sourcePolicy.cardText,/paraphrases/);
  assert.match(evidence.sourcePolicy.historicalCutoff,/not be used to infer/);
  assert.match(evidence.sourcePolicy.certification,/not certified/);
});
