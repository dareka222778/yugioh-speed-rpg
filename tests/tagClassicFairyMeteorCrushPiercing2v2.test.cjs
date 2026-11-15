'use strict';
const {test:nodeTest}=require('node:test');
const fs=require('node:fs');
function recordFailure(label,error){
  fs.mkdirSync('artifacts',{recursive:true});
  fs.appendFileSync('artifacts/engine-acceptance-failure.tap','\\n[M234] '+label+'\\n'+(error?.stack||String(error))+'\\n');
}
function test(name,fn){
  nodeTest(name,async t=>{
    try{return await fn(t);}
    catch(error){recordFailure(name,error);throw error;}
  });
}
process.on('uncaughtExceptionMonitor',error=>recordFailure('module initialization',error));
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {engineCatalog,getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {cardCertifications}=require('../dist/cardCertifications');
const {getEffectModel}=require('../dist/effectModels');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const {rulesFor}=require('../dist/rulesProfile');

const FAIRY_METEOR_CRUSH='97687912';
const member=seat=>'m234-seat-'+seat;
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>getPlayableCard(id))
  .filter(card=>card&&card.kind==='monster'&&Number.isInteger(card.atk)&&Number.isInteger(card.defense));
const ATTACKER=NORMALS.find(card=>card.atk>=1700&&card.defense<=1200);
assert.ok(ATTACKER,'the fixture needs a certified Normal Monster with a useful attack value');
const TARGET=NORMALS.find(card=>card.id!==ATTACKER.id&&card.defense>0&&
  card.defense<ATTACKER.atk&&card.atk<ATTACKER.atk);
assert.ok(TARGET,'the fixture needs a distinct Normal Monster whose DEF is below the attacker ATK');
const FILLERS=NORMALS.filter(card=>card.id!==ATTACKER.id&&card.id!==TARGET.id).slice(0,6);
assert.equal(FILLERS.length,6,'the four physical Decks need six additional certified Normal Monsters');
const POOL=[FAIRY_METEOR_CRUSH,ATTACKER.id,TARGET.id,...FILLERS.map(card=>card.id)];
assert.ok(POOL.length<=20);
assert.equal(getPlayableCard(FAIRY_METEOR_CRUSH)?.englishName,'Fairy Meteor Crush');
assert.deepEqual(getEffect(FAIRY_METEOR_CRUSH),{
  kind:'equip',atk:0,def:0,combat:[{kind:'piercing'}]
});
assert.equal(getCardStatus(FAIRY_METEOR_CRUSH)?.stage,'certified',
  'the 2v2 integration test must reference an already behavior-certified Equip Spell');
assert.ok(cardCertifications[FAIRY_METEOR_CRUSH]?.suites.includes('tests/generated-m33-piercing-equip.test.cjs'));
assert.equal(cardCertifications[FAIRY_METEOR_CRUSH].fingerprint,
  definitionFingerprint(getPlayableCard(FAIRY_METEOR_CRUSH),getEffect(FAIRY_METEOR_CRUSH),{
    model:getEffectModel
  }));
const distributionBefore=cardDistributionAllowed(FAIRY_METEOR_CRUSH);
// Existing release permission is independent of this 2v2 test; it must remain unchanged.

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
  throw new Error('M234 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const existing=physical.hand.find(card=>card.id===id);
  if(existing)return existing;
  const card=takePhysical(state,seat,id);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id,faceUp=true,position='atk'){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:faceUp?position:'def',faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function rules(state){
  const value=rulesFor(state.core);
  assert.equal(value.mainDeckMin,20);
  assert.equal(value.mainDeckMax,30);
  assert.equal(value.handLimit,6);
  assert.equal(value.handCheck,'end');
  assert.equal(value.extraDeckMax,5);
  assert.equal(value.monsterZones,3);
  assert.equal(value.spellTrapZones,3);
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
function createGame(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M234 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  rules(state);
  const attacker=deploy(state,0,ATTACKER.id,true,'atk');
  const target=deploy(state,3,TARGET.id,true,'def');
  const equip=ensureInHand(state,2,FAIRY_METEOR_CRUSH);
  assert.match(attacker.uid,/^m0:/,'the attacker must retain partner seat 0 physical ownership');
  assert.match(target.uid,/^m3:/,'the defender must retain opposing partner seat 3 physical ownership');
  assert.match(equip.uid,/^m2:/,'the Equip Spell must remain in active partner seat 2 physical hand');
  assert.equal(attacker.owner,0);
  assert.equal(target.owner,1);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,attacker,target,equip};
}
function snapshots(state){
  return {
    hands:new Map([0,1,2,3].map(seat=>[seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)])),
    decks:new Map([0,1,2,3].map(seat=>[seat,holder(state,seat).deck.map(card=>card.uid)]))
  };
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  assert.equal(cardDistributionAllowed(FAIRY_METEOR_CRUSH),distributionBefore,'2v2 verification must not change inventory release policy');
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Fairy Meteor Crush must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const uid of tag.tagMemberHand(state,member(seat)).map(card=>card.uid)){
    assert.ok(!publicState.includes(uid),'private hand UID leaked for physical seat '+seat+': '+uid);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
function equipAction(state,equip,target){
  return tag.tagActions(state,member(2)).find(action=>
    action.kind==='spell'&&action.card===equip.uid&&action.target===target.uid
  );
}
function activateEquip(state,equip,target){
  const action=equipAction(state,equip,target);
  assert.ok(action,'the active partner must receive the Equip Spell action for its teammate-owned monster');
  return settle(tag.stepTagDuel(state,member(2),action));
}

test('Fairy Meteor Crush equips the inactive partner-owned attacker and applies piercing damage to the opposing team',()=>{
  const fixture=createGame('m234-fairy-meteor-crush-partner-piercing');
  const before=inventorySnapshot(fixture.state);
  let state=rotateToSeat2(fixture.state);
  const zones=snapshots(state);
  assertPrivateHands(state);
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  assert.deepEqual(tag.tagActions(state,member(0)),[],
    'inactive partner seat 0 cannot activate an Equip Spell from seat 2 hand');
  const currentAttacker=state.core.players[0].monsters.find(card=>card.uid===fixture.attacker.uid);
  const currentTarget=state.core.players[1].monsters.find(card=>card.uid===fixture.target.uid);
  assert.ok(currentAttacker&&currentTarget);
  const expectedDamage=engine.atk(currentAttacker,state.core)-engine.def(currentTarget,state.core);
  assert.ok(expectedDamage>0,'the selected attacker must exceed the defender DEF');
  state=activateEquip(state,fixture.equip,currentAttacker);
  const equipped=state.core.players[0].backrow.find(card=>card.uid===fixture.equip.uid);
  assert.equal(equipped?.equippedTo,fixture.attacker.uid);
  assert.equal(equipped?.resolved,true);
  const attack=tag.tagActions(state,member(2)).find(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.target.uid
  );
  assert.ok(attack,'the active partner must be able to attack with the equipped teammate-owned monster');
  state=settle(tag.stepTagDuel(state,member(2),attack));
  assert.equal(state.core.players[1].lp,4000-expectedDamage,
    'Fairy Meteor Crush must inflict ATK minus DEF battle damage to the opposing shared LP');
  assert.equal(state.core.players[0].lp,4000,'piercing damage must not affect the attacking team LP');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.target.uid),
    'the defeated monster must enter the opposing shared Graveyard with its physical UID');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.attacker.uid),
    'the partner-owned attacker remains on the shared allied field');
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===fixture.equip.uid&&card.equippedTo===fixture.attacker.uid),
    'the Equip Spell remains attached after battle');
  for(const seat of [0,1,2,3]){
    const expectedHand=zones.hands.get(seat).filter(uid=>!(seat===2&&uid===fixture.equip.uid));
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),expectedHand,
      'only active physical seat 2 may lose the Equip Spell from hand');
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),zones.decks.get(seat),
      'the Equip Spell must not borrow physical seat '+seat+' Deck');
  }
  rules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertPrivateHands(state);
  assertRestorable(state);
  assertConserved(state,before);
});

test('Fairy Meteor Crush does not offer a face-down monster as an Equip target or reveal its identity',()=>{
  const fixture=createGame('m234-fairy-meteor-crush-hidden-target');
  const hidden=deploy(fixture.state,3,FILLERS[0].id,false,'def');
  const before=inventorySnapshot(fixture.state);
  let state=rotateToSeat2(fixture.state);
  const options=tag.tagActions(state,member(2)).filter(action=>
    action.kind==='spell'&&action.card===fixture.equip.uid
  );
  assert.ok(options.some(action=>action.target===fixture.attacker.uid),
    'the partner-owned face-up attacker remains an eligible Equip target');
  assert.ok(!options.some(action=>action.target===hidden.uid),
    'a face-down monster must not be offered as an Equip target');
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicState.includes(hidden.uid),'face-down monster UID must remain private');
  assert.ok(!publicState.includes(hidden.id),'face-down monster identity must remain private');
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertRestorable(state);
  assertConserved(state,before);
});


test('a normal partner-owned attack against Defense deals no piercing damage without Fairy Meteor Crush',()=>{
  const fixture=createGame('m234-no-equip-no-piercing-control');
  const before=inventorySnapshot(fixture.state);
  let state=rotateToSeat2(fixture.state);
  const zones=snapshots(state);
  const attacker=state.core.players[0].monsters.find(card=>card.uid===fixture.attacker.uid);
  const target=state.core.players[1].monsters.find(card=>card.uid===fixture.target.uid);
  assert.ok(attacker&&target);
  const attack=tag.tagActions(state,member(2)).find(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.target.uid
  );
  assert.ok(attack,'the active partner can attack the opposing Defense monster');
  state=settle(tag.stepTagDuel(state,member(2),attack));
  assert.equal(state.core.players[1].lp,4000,
    'without the Equip Spell, attacking Defense must not inflict piercing battle damage');
  assert.equal(state.core.players[0].lp,4000);
  assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.target.uid),
    'the stronger attacker still destroys the Defense monster without piercing');
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===fixture.equip.uid),
    'the unused Equip Spell remains in the active physical partner hand');
  for(const seat of [0,1,2,3]){
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),zones.hands.get(seat));
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),zones.decks.get(seat));
  }
  rules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertPrivateHands(state);
  assertRestorable(state);
  assertConserved(state,before);
});
