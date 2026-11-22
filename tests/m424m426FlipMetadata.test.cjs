const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cardMetadata}=require('../dist/cardMetadata');
const {cardCertifications}=require('../dist/cardCertifications');
const {releasedCardIds}=require('../dist/releasedCardIds');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const {getCardStatus,getPlayableCard}=require('../dist/effectRegistry');

const expected=[
  {id:'93920745',konamiId:4608,englishName:'Penguin Soldier',race:'Aqua',attribute:'WATER',level:2,atk:750,defense:500},
  {id:'28357177',konamiId:6124,englishName:'Hade-Hane',race:'Beast',attribute:'EARTH',level:5,atk:900,defense:1000},
  {id:'45141844',konamiId:5651,englishName:'Old Vindictive Magician',race:'Spellcaster',attribute:'DARK',level:2,atk:450,defense:600},
  {id:'83994646',konamiId:5139,englishName:'4-Starred Ladybug of Doom',race:'Insect',attribute:'WIND',level:3,atk:800,defense:1200},
  {id:'65878864',konamiId:6122,englishName:'Nobleman-Eater Bug',race:'Insect',attribute:'EARTH',level:5,atk:900,defense:1200},
  {id:'15383415',konamiId:5418,englishName:'Swarm of Scarabs',race:'Insect',attribute:'DARK',level:3,atk:500,defense:1000},
  {id:'41872150',konamiId:5419,englishName:'Swarm of Locusts',race:'Insect',attribute:'DARK',level:3,atk:1000,defense:500}
];

test('M427 exposes each of the seven M424-M426 identities exactly once in factual metadata',()=>{
  for(const card of expected){
    const matches=cardMetadata.filter(candidate=>candidate.id===card.id);
    assert.equal(matches.length,1,card.id+' must occur exactly once');
    const actual=matches[0];
    for(const key of ['konamiId','englishName','race','attribute','level','atk','defense']){
      assert.equal(actual[key],card[key],card.id+' '+key);
    }
    assert.equal(actual.kind,'monster');
    assert.equal(actual.monsterType,'effect');
  }
});

test('M427 adds only the two missing Swarm metadata records and does not certify or release them',()=>{
  for(const id of ['15383415','41872150']){
    assert.equal(cardCertifications[id],undefined,id+' must not gain a certificate from metadata');
    assert.equal(releasedCardIds.has(id),false,id+' must remain outside the distribution allowlist');
    assert.equal(getCardStatus(id)?.stage,'registered');
    assert.equal(getPlayableCard(id),undefined);
    assert.equal(cardDistributionAllowed(id),false);
  }
});

test('the other five FLIP identities remain their pre-existing certified and released records',()=>{
  for(const id of ['93920745','28357177','45141844','83994646','65878864']){
    assert.ok(cardCertifications[id],id+' keeps its existing certificate');
    assert.equal(releasedCardIds.has(id),true,id+' keeps its existing allowlist membership');
    assert.equal(getCardStatus(id)?.stage,'certified');
    assert.ok(getPlayableCard(id));
    assert.equal(cardDistributionAllowed(id),true);
  }
});

test('the two newly added metadata entries use the official Konami OCG records',()=>{
  for(const [id,cid] of [['15383415',5418],['41872150',5419]]){
    const card=cardMetadata.find(candidate=>candidate.id===id);
    assert.equal(card.konamiId,cid);
    assert.match(card.source,/db\.yugioh-card\.com\/yugiohdb\/card_search\.action/);
    assert.match(card.source,/request_locale=ja/);
  }
});
