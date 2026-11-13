'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const JUST_DESSERTS='24068492';
assert.ok(getPlayableCard(JUST_DESSERTS)?.kind==='trap','Just Desserts must be an enabled Trap');
assert.equal(getEffect(JUST_DESSERTS)?.kind,'justDesserts');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm128-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
  assert.ok(ids.length>=7);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain fixture card '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function takeCard(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M128 fixture card missing from physical seat '+seat+': '+id);
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Just Desserts must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Just Desserts response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('Just Desserts counts monsters from both physical teammates on the shared opposing field',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M128 Seat '+seat,
    cards:deck(seat===0?[JUST_DESSERTS]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m128-just-desserts-team-burn'});
  const trap=ensureInHand(state,0,JUST_DESSERTS);
  const existingCard=takeCard(state,3,normal[0].id);
  const summonCard=ensureInHand(state,1,normal[1].id);
  const existing={...existingCard,owner:1,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[1].monsters.push(existing);
  state.core.turn=3;
  const before=inventorySnapshot(state);
  assert.match(trap.uid,/^m0:/);
  assert.match(existing.uid,/^m3:/,'the first opponent monster belongs physically to seat 3');
  assert.match(summonCard.uid,/^m1:/,'the second opponent monster belongs physically to seat 1');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const set=tag.tagActions(state,member(0)).find(action=>action.kind==='set'&&action.card===trap.uid);
  assert.ok(set,'seat 0 must be able to Set Just Desserts');
  state=tag.stepTagDuel(state,member(0),set);
  state=endTurn(state,0);
  assert.equal(state.cursor,1,'seat 1 becomes the active opponent');

  const summon=tag.tagActions(state,member(1)).find(action=>action.kind==='summon'&&action.card===summonCard.uid);
  assert.ok(summon,'seat 1 must receive the legal Normal Summon action');
  state=tag.stepTagDuel(state,member(1),summon);
  assert.equal(state.core.phase,'response','the Normal Summon opens the trap response window');
  assert.equal(state.core.players[1].monsters.length,2,
    'both physical teammates now contribute one monster to the shared opposing field');
  assert.equal(tag.tagDecisionMember(state).id,member(0),
    'the active seat 0 represents the defending team during the response');

  const activate=tag.tagActions(state,member(0)).find(action=>
    action.kind==='trap'&&action.card===trap.uid
  );
  assert.ok(activate,'seat 0 can activate its shared Just Desserts');
  state=settle(tag.stepTagDuel(state,member(0),activate));
  assert.equal(state.core.players[1].lp,3000,
    'Just Desserts inflicts 500 damage for each of the two monsters on the shared opposing field');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].monsters.length,2);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===trap.uid),
    'Just Desserts enters the activating team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
