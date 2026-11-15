'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {getEffectModel}=require('../dist/effectModels');
const {cardCertifications}=require('../dist/cardCertifications');
const {economicOperationIssues}=require('../dist/economicOperations');
const {mechanicalBatch17,mechanicalEffects17}=require('../dist/mechanicalBatch17');
const history=require('../catalog/historical/2004-10-01/cards.json');

const GOBLIN_THIEF='45311864';
const SOURCE='https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5985&request_locale=en';
const EFFECT={
  kind:'sequence',
  activation:{speed:1,window:'main',damage:'never'},
  operations:[{kind:'simultaneousLP',changes:[
    {player:'opponent',direction:'damage',amount:500},
    {player:'self',direction:'gain',amount:500}
  ]}]
};

test('Goblin Thief keeps its canonical historical identity and atomic LP certificate',()=>{
  const card=mechanicalBatch17.find(entry=>entry.id===GOBLIN_THIEF);
  assert.ok(card,'Goblin Thief must remain in the existing M17 canonical batch');
  assert.equal(mechanicalBatch17.filter(entry=>entry.id===GOBLIN_THIEF).length,1,
    'the canonical identity must not be duplicated in a second batch');
  assert.equal(card.konamiId,5985);
  assert.equal(card.englishName,'Goblin Thief');
  assert.equal(card.name,'Ladrão Goblin');
  assert.equal(card.source,SOURCE);
  const historical=history.find(entry=>entry.passwords.includes(GOBLIN_THIEF));
  assert.ok(historical,'Goblin Thief must exist in the frozen historical identity set');
  assert.equal(historical.konamiId,5985);
  assert.equal(historical.names.en,'Goblin Thief');
  assert.ok(historical.firstObserved.tcg<='2004-09-30'||historical.firstObserved.ocg<='2004-09-30',
    'Goblin Thief must satisfy the 2004-09-30 historical cutoff');
  assert.deepEqual(mechanicalEffects17[GOBLIN_THIEF],EFFECT);
  assert.deepEqual(getEffect(GOBLIN_THIEF),EFFECT);
  assert.equal(getPlayableCard(GOBLIN_THIEF)?.englishName,'Goblin Thief');
  assert.equal(getCardStatus(GOBLIN_THIEF)?.stage,'certified');
  assert.equal(cardCertifications[GOBLIN_THIEF].fingerprint,
    definitionFingerprint(card,getEffect(GOBLIN_THIEF),{model:getEffectModel}));
  assert.deepEqual(economicOperationIssues(EFFECT.operations),[]);
  assert.deepEqual(economicOperationIssues([{kind:'simultaneousLP',changes:[
    {player:'self',direction:'gain',amount:500},
    {player:'self',direction:'damage',amount:500}
  ]}]),['invalid-simultaneous-lp'],'a simultaneous group cannot mutate one team twice');
});

const normalIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster')
  .slice(0,8);
assert.ok(normalIds.length>=8,'the four physical seats require eight certified Normal Monsters');

function member(seat){return 'm217-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8&&ids.length<=20,'fixture Deck must contain a valid 20-card pool');
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
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
  throw new Error('M217 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const card=takePhysical(state,seat,id);
  physical.hand.push(card);
  return card;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all 80 physical UIDs must be unique');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Goblin Thief must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3]){
    for(const card of tag.tagMemberHand(state,member(seat))){
      assert.ok(!publicState.includes(card.uid),'private hand UID leaked: '+card.uid);
    }
  }
}
function snapshots(state){
  return {
    hands:new Map([0,1,2,3].map(seat=>[seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)])),
    decks:new Map([0,1,2,3].map(seat=>[seat,holder(state,seat).deck.map(card=>card.uid)]))
  };
}
function endTurn(state){
  const actor=tag.tagDecisionMember(state).id;
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active physical participant must be able to end the turn');
  state=tag.stepTagDuel(state,actor,action);
  for(let guard=0;state.core.phase==='discard';guard++){
    assert.ok(guard<12,'End Phase discard must terminate');
    const owner=tag.tagDecisionMember(state).id;
    const discard=tag.tagActions(state,owner).find(candidate=>candidate.kind==='discard');
    assert.ok(discard,'the physical owner of an excess hand must discard');
    state=tag.stepTagDuel(state,owner,discard);
  }
  return state;
}
function rotateToSeat2(state){
  for(let guard=0;tag.tagDecisionMember(state).id!==member(2);guard++){
    assert.ok(guard<4,'turn rotation must reach physical partner seat 2');
    state=endTurn(state);
  }
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  return state;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Spell response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(candidate=>candidate.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function createGame(lp=[4000,4000],seed='m217-goblin-thief'){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M217 Seat '+seat,
    cards:deck(seat===0||seat===2?[GOBLIN_THIEF]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  state.core.players[0].lp=lp[0];
  state.core.players[1].lp=lp[1];
  const source0=ensureInHand(state,0,GOBLIN_THIEF);
  const source2=ensureInHand(state,2,GOBLIN_THIEF);
  assert.match(source0.uid,/^m0:/,'seat 0 keeps its own physical Goblin Thief');
  assert.match(source2.uid,/^m2:/,'seat 2 keeps its own physical Goblin Thief');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,source0,source2,before:inventorySnapshot(state)};
}
function activate(state,seat,spell){
  assert.equal(tag.tagDecisionMember(state).id,member(seat),'only the active physical seat may act');
  const action=tag.tagActions(state,member(seat)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid
  );
  assert.ok(action,'the active physical hand must offer Goblin Thief');
  const partner=seat===0?2:0;
  assert.deepEqual(tag.tagActions(state,member(partner)),[],
    'the inactive physical teammate cannot activate a card from the partner hand');
  return settle(tag.stepTagDuel(state,member(seat),action));
}
function assertResolved(state,seat,spell,before,hands,decks,expected,finished=false){
  assert.deepEqual(state.core.players.map(player=>player.lp),expected,
    'Goblin Thief must apply both 500-point changes to shared team LP');
  assert.equal(state.core.phase,finished?'finished':'main',
    'the LP victory check must happen after both simultaneous changes');
  assert.ok(state.core.players[seat%2].grave.some(card=>card.uid===spell.uid&&card.id===GOBLIN_THIEF),
    'the Spell must enter the activating team Graveyard with its physical UID');
  for(const physicalSeat of [0,1,2,3]){
    const expectedHand=hands.get(physicalSeat).filter(uid=>!(physicalSeat===seat&&uid===spell.uid));
    assert.deepEqual(tag.tagMemberHand(state,member(physicalSeat)).map(card=>card.uid),expectedHand,
      'only the activating physical hand may lose its source card');
    assert.deepEqual(holder(state,physicalSeat).deck.map(card=>card.uid),decks.get(physicalSeat),
      'Goblin Thief must not draw from or mutate another physical Deck');
  }
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const restored=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(restored),'resolved LP state must survive JSON restoration');
  assertPrivateHands(restored);
  assertConserved(restored,before);
}

test('Goblin Thief damages the opposing team and gains LP for the activating team from seat 0',()=>{
  const fixture=createGame([3000,4000],'m217-seat0');
  const hands=snapshots(fixture.state).hands;
  const decks=snapshots(fixture.state).decks;
  const state=activate(fixture.state,0,fixture.source0);
  assertResolved(state,0,fixture.source0,fixture.before,hands,decks,[3500,3500]);
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===fixture.source2.uid),
    'the inactive partner duplicate remains in its own private hand');
});

test('Goblin Thief can be activated by the rotated partner from seat 2 physical hand',()=>{
  const fixture=createGame([3000,4000],'m217-seat2');
  const stateAtSeat2=rotateToSeat2(fixture.state);
  const hands=snapshots(stateAtSeat2).hands;
  const decks=snapshots(stateAtSeat2).decks;
  const state=activate(stateAtSeat2,2,fixture.source2);
  assertResolved(state,2,fixture.source2,fixture.before,hands,decks,[3500,3500]);
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===fixture.source0.uid),
    'the original physical partner hand remains untouched after rotation');
});

test('Goblin Thief applies its LP gain before checking a lethal 500-point opponent loss',()=>{
  const fixture=createGame([1000,500],'m217-simultaneous-lethal');
  const hands=snapshots(fixture.state).hands;
  const decks=snapshots(fixture.state).decks;
  const state=activate(fixture.state,0,fixture.source0);
  assertResolved(state,0,fixture.source0,fixture.before,hands,decks,[1500,0],true);
});
