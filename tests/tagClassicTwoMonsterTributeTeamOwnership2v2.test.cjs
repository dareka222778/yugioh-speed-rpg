'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const AMAZONESS_ARCHER='91869203';
const HYSTERIC_FAIRY='21297224';
const NORMALS=[...new Set(tag.tagNormalCardIds)].slice(0,8);
assert.equal(NORMALS.length,8,'the fixture needs eight distinct enabled Normal Monsters');
assert.equal(getPlayableCard(AMAZONESS_ARCHER)?.englishName,'Amazoness Archer');
assert.equal(getEffect(AMAZONESS_ARCHER)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(AMAZONESS_ARCHER),{
  trigger:'ignition',cost:{kind:'tribute',count:2},operation:{kind:'burn',amount:1200}
});
assert.equal(getPlayableCard(HYSTERIC_FAIRY)?.englishName,'Hysteric Fairy');
assert.equal(getEffect(HYSTERIC_FAIRY)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(HYSTERIC_FAIRY),{
  trigger:'ignition',cost:{kind:'tribute',count:2},operation:{kind:'heal',amount:1000}
});

const POOL=[AMAZONESS_ARCHER,HYSTERIC_FAIRY,...NORMALS];
assert.equal(POOL.length,10);
assert.ok(POOL.every(id=>POOL.filter(other=>other===id).length<=3),
  'each physical Deck must respect the three-copy limit');
function member(seat){return 'm228-seat-'+seat;}
function deck(){return Array.from({length:20},(_,index)=>POOL[index%POOL.length]);}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M228 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed});
  state.core.turn=3;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(state.active[0],2,'seat 2 is the active allied representative');
  assert.equal(state.active[1],3,'seat 3 is the active opposing representative');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
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
  throw new Error('M228 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id,faceUp=true){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:faceUp?'atk':'def',faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function tributeAction(state,actorSeat,source,tributes){
  const expected=tributes.map(card=>card.uid).sort();
  return tag.tagActions(state,member(actorSeat)).find(action=>
    action.kind==='monsterEffect'&&action.card===source.uid&&
    Array.isArray(action.tributes)&&action.tributes.length===2&&
    JSON.stringify([...action.tributes].sort())===JSON.stringify(expected)
  );
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
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Tribute effects must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat+': '+card.uid);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}

test('Amazoness Archer may Tribute one monster from each allied physical seat and damages the opposing team',()=>{
  let state=game('m228-amazoness-archer-shared-two-tributes');
  const before=inventorySnapshot(state);
  const source=placeMonster(state,2,AMAZONESS_ARCHER);
  const partnerCost=placeMonster(state,0,NORMALS[0]);
  const activeCost=placeMonster(state,2,NORMALS[1]);
  const partnerPrivate={
    hand:holder(state,0).hand.map(card=>card.uid),
    deck:holder(state,0).deck.map(card=>card.uid)
  };
  const action=tributeAction(state,2,source,[partnerCost,activeCost]);
  assert.ok(action,'the active teammate may Tribute monsters owned by both allied seats');
  state=settle(tag.stepTagDuel(state,member(2),action));
  assert.equal(state.core.players[1].lp,2800,'Amazoness Archer inflicts 1200 damage to the opposing shared LP');
  assert.equal(state.core.players[0].lp,4000,'the activating team receives no LP change');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid),'the Archer remains on the shared allied field');
  for(const cost of [partnerCost,activeCost])assert.ok(state.core.players[0].grave.some(card=>card.uid===cost.uid));
  assert.deepEqual(holder(state,0).hand.map(card=>card.uid),partnerPrivate.hand,'the partner private hand remains untouched');
  assert.deepEqual(holder(state,0).deck.map(card=>card.uid),partnerPrivate.deck,'the partner physical Deck remains untouched');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('the active teammate may activate partner-owned Hysteric Fairy and recover 1000 shared team LP',()=>{
  let state=game('m228-hysteric-fairy-partner-source');
  const before=inventorySnapshot(state);
  state.core.players[0].lp=3100;
  state.core.players[1].lp=3900;
  const source=placeMonster(state,0,HYSTERIC_FAIRY);
  const partnerCost=placeMonster(state,0,NORMALS[2]);
  const activeCost=placeMonster(state,2,NORMALS[3]);
  const partnerPrivate={
    hand:holder(state,0).hand.map(card=>card.uid),
    deck:holder(state,0).deck.map(card=>card.uid)
  };
  const action=tributeAction(state,2,source,[partnerCost,activeCost]);
  assert.ok(action,'the active seat may activate an ignition effect from its partner-owned shared-field source');
  state=settle(tag.stepTagDuel(state,member(2),action));
  assert.equal(state.core.players[0].lp,4100,'Hysteric Fairy restores 1000 LP to the allied team');
  assert.equal(state.core.players[1].lp,3900,'the opposing team LP is unchanged');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.id===HYSTERIC_FAIRY));
  for(const cost of [partnerCost,activeCost])assert.ok(state.core.players[0].grave.some(card=>card.uid===cost.uid));
  assert.deepEqual(holder(state,0).hand.map(card=>card.uid),partnerPrivate.hand);
  assert.deepEqual(holder(state,0).deck.map(card=>card.uid),partnerPrivate.deck);
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Amazoness Archer cannot Tribute an opposing monster and a face-down source cannot activate',()=>{
  let state=game('m228-opposing-tribute-rejected');
  const source=placeMonster(state,2,AMAZONESS_ARCHER);
  const alliedCost=placeMonster(state,0,NORMALS[4]);
  const enemyCost=placeMonster(state,3,NORMALS[5]);
  const actions=tag.tagActions(state,member(2)).filter(action=>
    action.kind==='monsterEffect'&&action.card===source.uid
  );
  assert.ok(actions.every(action=>!action.tributes?.includes(enemyCost.uid)),
    'an opposing monster is never a legal Tribute for the allied Archer');
  assert.ok(actions.some(action=>action.tributes?.includes(alliedCost.uid)),
    'the partner-owned allied monster remains eligible');
  assert.throws(()=>tag.stepTagDuel(state,member(2),{
    kind:'monsterEffect',card:source.uid,discards:[],tributes:[alliedCost.uid,enemyCost.uid]
  }));
  state=game('m228-facedown-source-rejected');
  const hidden=placeMonster(state,0,HYSTERIC_FAIRY,false);
  placeMonster(state,0,NORMALS[6]);
  placeMonster(state,2,NORMALS[7]);
  assert.ok(!tag.tagActions(state,member(2)).some(action=>
    action.kind==='monsterEffect'&&action.card===hidden.uid
  ),'a face-down partner-owned source cannot activate its ignition effect');
  tag.assertTagDuel(state);
});

test('Amazoness Archer resolves its already-activated burn when it Tributes itself with a partner monster',()=>{
  let state=game('m228-amazoness-self-tribute');
  const before=inventorySnapshot(state);
  const source=placeMonster(state,0,AMAZONESS_ARCHER);
  const partnerCost=placeMonster(state,2,NORMALS[0]);
  const action=tributeAction(state,2,source,[source,partnerCost]);
  assert.ok(action,'the partner-owned Archer itself is a legal first Tribute');
  state=settle(tag.stepTagDuel(state,member(2),action));
  assert.equal(state.core.players[1].lp,2800,'the activated 1200 damage resolves after its source leaves the field');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===partnerCost.uid));
  assert.ok(!state.core.players[0].monsters.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  assertRestorable(state);
});

test('a lone Hysteric Fairy cannot pay its two-monster Tribute cost',()=>{
  const state=game('m228-hysteric-fairy-insufficient-tributes');
  const source=placeMonster(state,0,HYSTERIC_FAIRY);
  assert.ok(!tag.tagActions(state,member(2)).some(action=>
    action.kind==='monsterEffect'&&action.card===source.uid
  ),'one source monster cannot satisfy a two-monster Tribute cost');
  tag.assertTagDuel(state);
});
