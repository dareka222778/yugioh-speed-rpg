'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect,getMonsterDefinition}=require('../dist/monsterEffects');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {cardCertifications}=require('../dist/cardCertifications');
const {getEffectModel}=require('../dist/effectModels');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const {rulesFor}=require('../dist/rulesProfile');

const NEEDLE_BALL='94230224';
const member=seat=>'m233-seat-'+seat;
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster')
  .slice(0,8);
assert.equal(NORMALS.length,8,'the four physical Decks need eight certified Normal Monsters');
const POOL=[NEEDLE_BALL,...NORMALS];
assert.equal(getPlayableCard(NEEDLE_BALL)?.englishName,'Needle Ball');
assert.equal(getEffect(NEEDLE_BALL)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(NEEDLE_BALL),{
  trigger:'flip',
  cost:{kind:'lp',amount:2000},
  operation:{kind:'burn',amount:1000}
});
assert.deepEqual(getMonsterDefinition(NEEDLE_BALL)?.activation,{policy:'optional',window:'flip'});
assert.equal(getCardStatus(NEEDLE_BALL)?.stage,'certified',
  'the 2v2 integration test must reference an already behavior-certified identity');
assert.ok(cardCertifications[NEEDLE_BALL]?.suites.includes('tests/generated-m32-optional-trigger-lp.test.cjs'));
assert.equal(cardCertifications[NEEDLE_BALL].fingerprint,
  definitionFingerprint(getPlayableCard(NEEDLE_BALL),getEffect(NEEDLE_BALL),{
    monster:getMonsterDefinition,model:getEffectModel
  }));
assert.equal(cardDistributionAllowed(NEEDLE_BALL),false,
  '2v2 verification must not authorize inventory distribution');

function deck(){return Array.from({length:20},(_,index)=>POOL[index%POOL.length]);}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takePhysical(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M233 physical card missing from seat '+seat+': '+id);
}
function placeNeedleBall(state,seat){
  const card=takePhysical(state,seat,NEEDLE_BALL);
  const monster={...card,owner:seat%2,position:'def',faceUp:false,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique before activation');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Needle Ball must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function snapshots(state){
  return {
    hands:new Map([0,1,2,3].map(seat=>[seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)])),
    decks:new Map([0,1,2,3].map(seat=>[seat,holder(state,seat).deck.map(card=>card.uid)]))
  };
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const uid of tag.tagMemberHand(state,member(seat)).map(card=>card.uid)){
    assert.ok(!publicState.includes(uid),'private hand UID leaked for physical seat '+seat+': '+uid);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))),
    'resolved 2v2 state must survive JSON restoration');
}
function assertRules(state){
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function endTurn(state){
  const actor=tag.tagDecisionMember(state).id;
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active physical participant must be able to end the turn');
  state=settle(tag.stepTagDuel(state,actor,action));
  for(let guard=0;state.core.phase==='discard';guard++){
    assert.ok(guard<8,'End Phase discard must terminate');
    const owner=tag.tagDecisionMember(state).id;
    const discard=tag.tagActions(state,owner).find(candidate=>candidate.kind==='discard');
    assert.ok(discard,'the physical owner of an excess hand must discard');
    state=tag.stepTagDuel(state,owner,discard);
  }
  return state;
}
function rotateToSeat2(state){
  for(let guard=0;tag.tagDecisionMember(state).id!==member(2);guard++){
    assert.ok(guard<4,'turn rotation must reach allied partner seat 2');
    state=endTurn(state);
  }
  assert.equal(state.active[0],2);
  return state;
}
function setup(sourceSeat,lp=[4000,4000],seed='m233-needle-ball'){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M233 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  state.core.players[0].lp=lp[0];
  state.core.players[1].lp=lp[1];
  const source=placeNeedleBall(state,sourceSeat);
  assert.match(source.uid,new RegExp('^m'+sourceSeat+':'),
    'the FLIP source must retain its physical seat UID');
  assert.equal(source.owner,0,'both allied physical seats share team 0 field and LP');
  assertRules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const zones=snapshots(state);
  assertPrivateHands(state);
  return {state,source,before,zones};
}
function assertOnlyActiveSeatCanFlip(state,activeSeat,source){
  assert.equal(tag.tagDecisionMember(state).id,member(activeSeat));
  const action=tag.tagActions(state,member(activeSeat)).find(candidate=>
    candidate.kind==='position'&&candidate.mode==='flip'&&candidate.card===source.uid
  );
  assert.ok(action,'the active teammate may Flip Summon the partner-owned Needle Ball');
  const inactivePartner=activeSeat===0?2:0;
  assert.deepEqual(tag.tagActions(state,member(inactivePartner)),[],
    'the inactive physical partner cannot execute the shared-field action');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(inactivePartner),action),
    /Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'rejected partner action must not mutate the duel');
  return tag.stepTagDuel(state,member(activeSeat),action);
}
function choose(state,activeSeat,target){
  const action=tag.tagActions(state,member(activeSeat)).find(candidate=>
    candidate.kind==='choose'&&candidate.target===target
  );
  assert.ok(action,'the optional FLIP trigger must expose the exact accept/decline choice');
  return settle(tag.stepTagDuel(state,member(activeSeat),action));
}
function assertResolved(state,activeSeat,source,before,zones,expectedLP){
  assert.deepEqual(state.core.players.map(player=>player.lp),expectedLP,
    'the 2000 LP cost and 1000 effect damage must be applied to shared team LP');
  assert.equal(state.core.phase,'main','the optional FLIP effect resolves without a response');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp),
    'Needle Ball remains face-up on the shared allied field');
  assert.ok(!state.core.players[0].grave.some(card=>card.uid===source.uid),
    'Needle Ball is not sent to the Graveyard by its own effect');
  for(const seat of [0,1,2,3]){
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),zones.hands.get(seat),
      'the FLIP effect must not mutate physical seat '+seat+' hand');
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),zones.decks.get(seat),
      'the FLIP effect must not borrow physical seat '+seat+' Deck');
  }
  assertRules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertPrivateHands(state);
  assertRestorable(state);
  assertConserved(state,before);
}

test('Needle Ball pays 2000 shared team LP and burns the opposing team when active seat 0 flips partner seat 2 source',()=>{
  const fixture=setup(2,[4000,4000],'m233-seat0-flips-seat2');
  let state=assertOnlyActiveSeatCanFlip(fixture.state,0,fixture.source);
  assert.equal(state.core.phase,'choice');
  state=choose(state,0,fixture.source.uid);
  assertResolved(state,0,fixture.source,fixture.before,fixture.zones,[2000,3000]);
});

test('Needle Ball can be activated by partner seat 2 after turn rotation while physical seat 0 owns the source',()=>{
  const fixture=setup(0,[4000,4000],'m233-seat2-flips-seat0');
  let state=rotateToSeat2(fixture.state);
  const zones=snapshots(state);
  assertPrivateHands(state);
  const before=fixture.before;
  state=assertOnlyActiveSeatCanFlip(state,2,fixture.source);
  assert.equal(state.core.phase,'choice');
  state=choose(state,2,fixture.source.uid);
  assertResolved(state,2,fixture.source,before,zones,[2000,3000]);
});

test('Needle Ball optional FLIP trigger can be declined without paying LP or damaging the opposing team',()=>{
  const fixture=setup(2,[4000,4000],'m233-decline');
  let state=assertOnlyActiveSeatCanFlip(fixture.state,0,fixture.source);
  assert.equal(state.core.phase,'choice');
  state=choose(state,0,'__skip__');
  assertResolved(state,0,fixture.source,fixture.before,fixture.zones,[4000,4000]);
});

test('Needle Ball cannot offer its optional effect when the shared team has exactly 2000 LP',()=>{
  const fixture=setup(2,[2000,4000],'m233-insufficient-lp');
  let state=assertOnlyActiveSeatCanFlip(fixture.state,0,fixture.source);
  assert.equal(state.core.phase,'main',
    'the controller must have more than 2000 shared LP available to pay the optional cost');
  assert.ok(!state.core.choice,'an unaffordable optional effect must not create a choice');
  assertResolved(state,0,fixture.source,fixture.before,fixture.zones,[2000,4000]);
});

test('Needle Ball accepts the strict 2001 LP threshold and retains only 1 LP after its cost',()=>{
  const fixture=setup(2,[2001,4000],'m233-exact-threshold');
  let state=assertOnlyActiveSeatCanFlip(fixture.state,0,fixture.source);
  assert.equal(state.core.phase,'choice');
  state=choose(state,0,fixture.source.uid);
  assertResolved(state,0,fixture.source,fixture.before,fixture.zones,[1,3000]);
});
