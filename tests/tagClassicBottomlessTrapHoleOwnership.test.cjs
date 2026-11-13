'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const BOTTOMLESS='29401950';
const bottomless=getPlayableCard(BOTTOMLESS);
assert.ok(bottomless&&bottomless.kind==='trap','Bottomless Trap Hole must be an enabled Trap');
assert.equal(getEffect(BOTTOMLESS)?.kind,'bottomlessTrapHole');
assert.equal(getActivationModel(getEffect(BOTTOMLESS))?.minimumSummonAtk,1500);
assert.deepEqual(getActivationModel(getEffect(BOTTOMLESS))?.summonKinds,['summon','flip','specialSummon']);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.level)&&entry.card.level<=4);
assert.ok(normal.length>=7,'the Bottomless fixture needs seven certified Normal Monsters');
const highEntry=normal.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const lowEntry=normal.filter(entry=>entry.card.atk<1500)
  .reduce((best,current)=>current.card.atk<best.card.atk?current:best);
assert.ok(highEntry.card.atk>=1500,'the high-ATK fixture must meet the activation threshold');
assert.ok(lowEntry.card.atk<1500,'the low-ATK fixture must remain below the activation threshold');
const deckIds=[...new Set([highEntry.id,lowEntry.id,...normal.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);

function member(seat){return 'm107-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
  assert.ok(ids.length>=7);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takeCard(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M107 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain the Normal Summon');
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique before the Summon');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Bottomless Trap Hole must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Bottomless Trap Hole must not duplicate physical UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function setup(summonedId,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M107 Seat '+seat,
    cards:deck(seat===3?[BOTTOMLESS]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed});
  const before=inventorySnapshot(state);
  const summoned=ensureInHand(state,0,summonedId);
  const trapCard=takeCard(state,3,BOTTOMLESS);
  const trap={...trapCard,setTurn:0,faceUp:false};
  state.core.players[1].backrow.push(trap);
  state.core.turn=3;
  assert.match(summoned.uid,/^m0:/,'the Normal Summon must retain active seat 0 ownership');
  assert.match(trap.uid,/^m3:/,'Bottomless Trap Hole must retain inactive seat 3 ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,summoned,trap};
}
function normalSummon(state,summoned){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='summon'&&candidate.card===summoned.uid&&candidate.position==='atk'
  );
  assert.ok(action,'the active physical seat must receive the legal Normal Summon');
  return tag.stepTagDuel(state,member(0),action);
}

test('inactive teammate-owned Bottomless Trap Hole banishes a qualifying Normal Summon for the shared team',()=>{
  const {state:initial,before,summoned,trap}=setup(highEntry.id,'m107-bottomless-high-atk');
  const publicBefore=tag.publicTagDuel(initial);
  assert.ok(!JSON.stringify(publicBefore).includes(BOTTOMLESS),
    'the opposing set Trap identity must remain hidden before activation');
  assert.ok(!JSON.stringify(publicBefore).includes(trap.uid),
    'the opposing set Trap UID must remain hidden before activation');

  let state=normalSummon(initial,summoned);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical defender owns response priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical owner of Bottomless must not receive response actions');
  const response=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===trap.uid&&action.target===summoned.uid
  );
  assert.ok(response,'the active teammate must activate the inactive partner set Trap');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),response),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'the inactive Trap owner must not mutate the response chain');

  state=settle(tag.stepTagDuel(state,member(1),response));
  assert.ok(state.core.players[0].banished.some(card=>card.uid===summoned.uid),
    'a qualifying 1500+ ATK summon must be destroyed and banished from the shared team field');
  assert.ok(!state.core.players[0].grave.some(card=>card.uid===summoned.uid),
    'Bottomless Trap Hole must use the banished destination, not the Graveyard');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===trap.uid),
    'the activated Trap must move to the shared defending-team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('Bottomless Trap Hole cannot answer a Normal Summon below 1500 ATK',()=>{
  const {state:initial,before,summoned,trap}=setup(lowEntry.id,'m107-bottomless-low-atk');
  const state=normalSummon(initial,summoned);
  assert.equal(state.core.phase,'main',
    'a below-threshold Normal Summon must not open a Bottomless Trap Hole response window');
  assert.equal(tag.tagDecisionMember(state).id,member(0),
    'the active summoning seat keeps the turn when no eligible response exists');
  assert.deepEqual(tag.tagActions(state,member(1)),[],
    'the defending team must not receive a response decision for an ineligible summon');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===summoned.uid),
    'the low-ATK Normal Summon must remain on the shared team field');
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===trap.uid&&!card.faceUp),
    'the ineligible set Trap must remain unused');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
