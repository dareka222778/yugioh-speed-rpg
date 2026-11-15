'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const MAGICIAN_OF_FAITH='31560081';
const MASK_OF_DARKNESS='28933734';
const POT_OF_GREED='55144522';
const TRAP_HOLE='04206964';
const NORMALS=[...new Set(tag.tagNormalCardIds)].slice(0,6);
const POOL=[MAGICIAN_OF_FAITH,MASK_OF_DARKNESS,POT_OF_GREED,TRAP_HOLE,...NORMALS];
assert.equal(NORMALS.length,6);
assert.equal(POOL.length,10);
assert.equal(getPlayableCard(MAGICIAN_OF_FAITH)?.englishName,'Magician of Faith');
assert.equal(getPlayableCard(MASK_OF_DARKNESS)?.englishName,'Mask of Darkness');
assert.equal(getEffect(MAGICIAN_OF_FAITH)?.kind,'monsterEffect');
assert.equal(getEffect(MASK_OF_DARKNESS)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(MAGICIAN_OF_FAITH),{trigger:'flip',operation:{kind:'recover',cardKind:'spell'}});
assert.deepEqual(getMonsterEffect(MASK_OF_DARKNESS),{trigger:'flip',operation:{kind:'recover',cardKind:'trap'}});

function member(seat){return 'm242-seat-'+seat;}
function deck(){return Array.from({length:20},(_,index)=>POOL[index%POOL.length]);}
function game(seed){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M242 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);assert.equal(rules.monsterZones,3);assert.equal(rules.spellTrapZones,3);
  assert.equal(state.active[0],0);assert.equal(state.active[1],1);
  return state;
}
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
  throw new Error('M242 fixture card missing from physical seat '+seat+': '+id);
}
function placeSource(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'def',faceUp:false,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function putInGrave(state,seat,id){
  const card=takePhysical(state,seat,id);
  state.core.players[seat%2].grave.push(card);
  return card;
}
function flip(state,source){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='position'&&candidate.mode==='flip'&&candidate.card===source.uid);
  assert.ok(action,'active seat 0 must be able to Flip Summon the partner-owned source');
  return tag.stepTagDuel(state,member(0),action);
}
function choose(state,uid){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='choose'&&candidate.target===uid);
  assert.ok(action,'the selected team Graveyard card must be a legal recovery target');
  return tag.stepTagDuel(state,member(0),action);
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
function inventory(state){
  const cards=tag.tagInventory(state);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(cards.length,80);assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical UID changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(let seat=0;seat<4;seat++)for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
function assertReturnedToPhysicalOwner(state,target,owner,other){
  assert.ok(tag.tagMemberHand(state,member(owner)).some(card=>card.uid===target.uid),
    'recovered card must return to its physical owner hand (seat '+owner+')');
  assert.ok(!tag.tagMemberHand(state,member(other)).some(card=>card.uid===target.uid),
    'recovered card must not be placed in the active partner hand (seat '+other+')');
}

test('Magician of Faith recovers a Spell from the shared Graveyard to its inactive physical owner hand',()=>{
  let state=game('m242-faith-partner-owner');
  const before=inventory(state);
  const source=placeSource(state,2,MAGICIAN_OF_FAITH);
  const target=putInGrave(state,2,POT_OF_GREED);
  assert.match(source.uid,/^m2:/);assert.match(target.uid,/^m2:/);
  assertPrivateHands(state);assertRestorable(state);
  state=settle(flip(state,source));
  assert.equal(state.core.phase,'choice');
  assert.ok(state.core.choice.targets.includes(target.uid));
  state=settle(choose(state,target.uid));
  assertReturnedToPhysicalOwner(state,target,2,0);
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  assertConserved(state,before);assertPrivateHands(state);assertRestorable(state);
});

test('Mask of Darkness recovers a Trap from the shared Graveyard to its inactive physical owner hand',()=>{
  let state=game('m242-mask-partner-owner');
  const before=inventory(state);
  const source=placeSource(state,2,MASK_OF_DARKNESS);
  const target=putInGrave(state,2,TRAP_HOLE);
  assert.match(source.uid,/^m2:/);assert.match(target.uid,/^m2:/);
  assertPrivateHands(state);assertRestorable(state);
  state=settle(flip(state,source));
  assert.equal(state.core.phase,'choice');
  assert.ok(state.core.choice.targets.includes(target.uid));
  state=settle(choose(state,target.uid));
  assertReturnedToPhysicalOwner(state,target,2,0);
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  assertConserved(state,before);assertPrivateHands(state);assertRestorable(state);
});

test('recovery still returns a card owned by the active physical seat to that active hand',()=>{
  let state=game('m242-faith-active-owner');
  const before=inventory(state);
  const source=placeSource(state,2,MAGICIAN_OF_FAITH);
  const target=putInGrave(state,0,POT_OF_GREED);
  assert.match(target.uid,/^m0:/);
  state=settle(flip(state,source));
  assert.equal(state.core.phase,'choice');
  state=settle(choose(state,target.uid));
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===target.uid));
  assert.ok(!tag.tagMemberHand(state,member(2)).some(card=>card.uid===target.uid));
  assertConserved(state,before);assertPrivateHands(state);assertRestorable(state);
});

for(const [sourceId,wrongTarget,opponentTarget] of [
  [MAGICIAN_OF_FAITH,TRAP_HOLE,POT_OF_GREED],
  [MASK_OF_DARKNESS,POT_OF_GREED,TRAP_HOLE]
]){
  test((sourceId===MAGICIAN_OF_FAITH?'Magician of Faith':'Mask of Darkness')+' cannot recover the wrong card kind or the opponent Graveyard',()=>{
    let state=game('m242-negative-'+sourceId);
    const before=inventory(state);
    const source=placeSource(state,2,sourceId);
    const wrong=putInGrave(state,2,wrongTarget);
    const opponent=putInGrave(state,1,opponentTarget);
    state=settle(flip(state,source));
    assert.notEqual(state.core.phase,'choice','no valid card exists in the controller team Graveyard');
    assert.ok(!state.core.choice);
    assert.ok(state.core.players[0].grave.some(card=>card.uid===wrong.uid));
    assert.ok(state.core.players[1].grave.some(card=>card.uid===opponent.uid));
    assert.ok(!tag.tagMemberHand(state,member(0)).some(card=>card.uid===wrong.uid||card.uid===opponent.uid));
    assert.ok(!tag.tagMemberHand(state,member(2)).some(card=>card.uid===wrong.uid||card.uid===opponent.uid));
    assertConserved(state,before);assertPrivateHands(state);assertRestorable(state);
  });
}
