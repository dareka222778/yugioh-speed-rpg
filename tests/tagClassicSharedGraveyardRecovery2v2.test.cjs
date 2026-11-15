'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {engineCatalog,getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const SALVAGE='96947648';
const DARK_FACTORY='90928333';
assert.equal(getPlayableCard(SALVAGE)?.englishName,'Salvage');
assert.equal(getPlayableCard(SALVAGE)?.kind,'spell');
assert.equal(getEffect(SALVAGE)?.kind,'recoverMultiple');
assert.deepEqual(getEffect(SALVAGE)?.rule,{count:2,filter:{attribute:'WATER',maxAtk:1500}});
assert.equal(getPlayableCard(DARK_FACTORY)?.englishName,'Dark Factory of Mass Production');
assert.equal(getPlayableCard(DARK_FACTORY)?.kind,'spell');
assert.equal(getEffect(DARK_FACTORY)?.kind,'recoverMultiple');
assert.deepEqual(getEffect(DARK_FACTORY)?.rule,{count:2,filter:{normal:true}});

const normal=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster'&&getPlayableCard(id)?.monsterType==='normal')
  .slice(0,8);
assert.equal(normal.length,8,'the fixture needs eight enabled Normal Monsters');
const waterEligible=engineCatalog
  .filter(card=>card.kind==='monster'&&card.attribute==='WATER'&&Number.isInteger(card.atk)&&card.atk<=1500)
  .filter(card=>getPlayableCard(card.id))
  .slice(0,2);
const waterHigh=engineCatalog.find(card=>card.kind==='monster'&&card.attribute==='WATER'&&Number.isInteger(card.atk)&&card.atk>1500&&getPlayableCard(card.id));
const nonWaterLow=engineCatalog.find(card=>card.kind==='monster'&&card.attribute&&card.attribute!=='WATER'&&Number.isInteger(card.atk)&&card.atk<=1500&&getPlayableCard(card.id));
const effectMonster=engineCatalog.find(card=>card.kind==='monster'&&card.monsterType==='effect'&&getPlayableCard(card.id));
assert.equal(waterEligible.length,2,'Salvage needs two distinct enabled WATER monsters at or below 1500 ATK');
assert.ok(waterHigh,'Salvage needs a WATER monster above 1500 ATK as a negative control');
assert.ok(nonWaterLow,'Salvage needs a non-WATER monster at or below 1500 ATK as a negative control');
assert.ok(effectMonster,'Dark Factory needs an Effect Monster as a negative control');

const fixtureIds=[...new Set([
  ...normal,
  ...waterEligible.map(card=>card.id),
  waterHigh.id,nonWaterLow.id,effectMonster.id,
  SALVAGE,DARK_FACTORY
])];
assert.ok(fixtureIds.length<=20,'all physical Deck fixtures must fit the 20-card minimum');

function member(seat){return 'm224-seat-'+seat;}
function deck(){
  return Array.from({length:20},(_,index)=>fixtureIds[index%fixtureIds.length]);
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
  throw new Error('M224 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const existing=physical.hand.find(card=>card.id===id);
  if(existing)return existing;
  const card=takePhysical(state,seat,id);
  physical.hand.push(card);
  return card;
}
function moveToGrave(state,seat,id){
  const card=takePhysical(state,seat,id);
  state.core.players[seat%2].grave.push(card);
  return card;
}
function createGame(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M224 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return state;
}
function endTurn(state){
  const actor=tag.tagDecisionMember(state).id;
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active physical participant must be able to end the turn');
  state=tag.stepTagDuel(state,actor,action);
  for(let guard=0;state.core.phase==='discard';guard++){
    assert.ok(guard<8,'End Phase hand-limit discard must terminate');
    const discardOwner=tag.tagDecisionMember(state).id;
    const discard=tag.tagActions(state,discardOwner).find(candidate=>candidate.kind==='discard');
    assert.ok(discard,'the physical participant with excess cards must receive a legal discard');
    state=tag.stepTagDuel(state,discardOwner,discard);
  }
  return state;
}
function rotateToSeat2(state){
  for(let guard=0;tag.tagDecisionMember(state).id!==member(2);guard++){
    assert.ok(guard<4,'turn rotation must reach allied partner seat 2');
    state=endTurn(state);
  }
  assert.equal(state.active[0],2);
  assert.equal(state.active[1],1);
  return state;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current responder must receive a legal pass');
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
  assert.equal(cards.length,before.size,'multi-target recovery must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical card identity changed');
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3]){
    for(const card of tag.tagMemberHand(state,member(seat))){
      assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat+': '+card.uid);
    }
  }
}
function activateAndRecoverTwo(state,seat,spell,first,second){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='spell'&&candidate.card===spell.uid);
  assert.ok(action,'active physical seat must be able to activate its own recovery Spell');
  state=tag.stepTagDuel(state,member(seat),action);
  if(state.core.phase==='response')state=settle(state);
  assert.equal(state.core.phase,'choice','recoverMultiple must open an explicit two-target selection');
  assert.equal(state.core.choice?.source,'multiTarget');
  const chooseFirst=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='choose'&&candidate.target===first.uid);
  const chooseSecond=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='choose'&&candidate.target===second.uid);
  assert.ok(chooseFirst&&chooseSecond,'both exact eligible physical UIDs must be selectable');
  state=tag.stepTagDuel(state,member(seat),chooseFirst);
  assert.ok(!tag.tagActions(state,member(seat)).some(candidate=>candidate.kind==='choose'&&candidate.target===first.uid),
    'the first physical UID cannot be selected twice');
  const secondAction=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='choose'&&candidate.target===second.uid);
  assert.ok(secondAction,'the second distinct physical UID remains selectable');
  state=tag.stepTagDuel(state,member(seat),secondAction);
  return settle(state);
}

test('Dark Factory of Mass Production recovers two Normal Monsters from the shared Graveyard to their physical owners',()=>{
  let state=createGame('m224-dark-factory-physical-owner-recovery');
  const spell=ensureInHand(state,2,DARK_FACTORY);
  const partnerNormal=moveToGrave(state,0,normal[0]);
  const activeNormal=moveToGrave(state,2,normal[1]);
  const wrongEffect=moveToGrave(state,0,effectMonster.id);
  const opponentNormal=moveToGrave(state,1,normal[2]);
  state=rotateToSeat2(state);
  const before=inventorySnapshot(state);
  const handsBefore=[0,1,2,3].map(seat=>tag.tagMemberHand(state,member(seat)).map(card=>card.uid));
  assertPrivateHands(state);
  const actions=tag.tagActions(state,member(2)).filter(candidate=>candidate.kind==='spell'&&candidate.card===spell.uid);
  assert.equal(actions.length,1,'Dark Factory activates once from the active physical hand');
  state=activateAndRecoverTwo(state,2,spell,partnerNormal,activeNormal);
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===partnerNormal.uid),
    'the Normal Monster owned by inactive partner seat 0 returns to seat 0 hand');
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===activeNormal.uid),
    'the Normal Monster owned by active seat 2 returns to seat 2 hand');
  assert.ok(!tag.tagMemberHand(state,member(2)).some(card=>card.uid===partnerNormal.uid),
    'the active player cannot appropriate the partner physical card');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===wrongEffect.uid),
    'Effect Monsters are excluded by Dark Factory');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opponentNormal.uid),
    'the opposing shared Graveyard is not selectable');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
  assert.equal(handsBefore.length,4);
});

test('Salvage filters WATER monsters at 1500 ATK or less and restores each card to its physical owner',()=>{
  let state=createGame('m224-salvage-water-physical-owner-recovery');
  const spell=ensureInHand(state,2,SALVAGE);
  const partnerWater=moveToGrave(state,0,waterEligible[0].id);
  const activeWater=moveToGrave(state,2,waterEligible[1].id);
  const tooStrong=moveToGrave(state,0,waterHigh.id);
  const wrongAttribute=moveToGrave(state,0,nonWaterLow.id);
  const opponentWater=moveToGrave(state,1,waterEligible[0].id);
  state=rotateToSeat2(state);
  const before=inventorySnapshot(state);
  assertPrivateHands(state);
  state=activateAndRecoverTwo(state,2,spell,partnerWater,activeWater);
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===partnerWater.uid),
    'the eligible WATER card owned by inactive partner seat 0 returns to that physical hand');
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===activeWater.uid),
    'the eligible WATER card owned by active seat 2 returns to that physical hand');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===tooStrong.uid),
    'WATER monsters above 1500 ATK are not eligible');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===wrongAttribute.uid),
    'non-WATER monsters are not eligible even when their ATK is low');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opponentWater.uid),
    'the opposing shared Graveyard is not selectable');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});
