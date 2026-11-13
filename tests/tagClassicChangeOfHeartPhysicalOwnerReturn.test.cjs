'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const CHANGE_OF_HEART='04031928';
assert.ok(getPlayableCard(CHANGE_OF_HEART)?.kind==='spell','Change of Heart must be an enabled Spell');
assert.equal(getEffect(CHANGE_OF_HEART)?.kind,'changeHeart');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm122-seat-'+seat;}
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
  assert.ok(index>=0,'the physical seat Deck must contain Change of Heart');
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
  throw new Error('M122 target card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Change of Heart must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Change of Heart temporarily controls an opponent teammate monster and returns it to its team',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M122 Seat '+seat,
    cards:deck(seat===0?[CHANGE_OF_HEART]:[])
  }));
  const initial=tag.createTagDuel(players,{classic:true,first:0,seed:'m122-change-of-heart-physical-owner'});
  const spell=ensureInHand(initial,0,CHANGE_OF_HEART);
  const physicalTarget=takeCard(initial,3,normal[0].id);
  const target={...physicalTarget,owner:1,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  initial.core.players[1].monsters.push(target);
  initial.core.turn=3;
  assert.match(spell.uid,/^m0:/,'Change of Heart must retain seat 0 physical ownership');
  assert.match(target.uid,/^m3:/,'the stolen monster must retain inactive seat 3 physical ownership');
  const before=inventorySnapshot(initial);
  assert.doesNotThrow(()=>tag.assertTagDuel(initial));

  const action=tag.tagActions(initial,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid&&candidate.target===target.uid
  );
  assert.ok(action,'the active seat must be able to target a monster controlled by either opponent teammate');
  assert.deepEqual(tag.tagActions(initial,member(2)),[],
    'the inactive physical teammate cannot execute the Main Phase action');
  const unchanged=JSON.stringify(initial);
  assert.throws(()=>tag.stepTagDuel(initial,member(2),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(initial),unchanged);

  let state=tag.stepTagDuel(initial,member(0),action);
  assert.equal(state.core.phase,'main','Change of Heart resolves without a legal response');
  assert.deepEqual(state.core.players[1].monsters,[],
    'the opponent shared field relinquishes the targeted monster');
  assert.equal(state.core.players[0].monsters.length,1,
    'the activating team temporarily controls the targeted monster');
  let controlled=state.core.players[0].monsters[0];
  assert.equal(controlled.uid,target.uid);
  assert.equal(controlled.id,target.id);
  assert.equal(controlled.owner,1,'control changes, but the physical owner team remains team 1');
  assert.equal(controlled.returnTo,1,'the original controller team is recorded for End Phase return');
  assert.equal(controlled.returnTurn,3);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid),
    'Change of Heart enters the activating team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const end=tag.tagActions(state,member(0)).find(candidate=>candidate.kind==='end');
  assert.ok(end,'the active physical seat must be able to end its turn');
  state=tag.stepTagDuel(state,member(0),end);
  assert.equal(state.core.phase,'main','the next team turn begins after End Phase cleanup');
  assert.deepEqual(state.core.players[0].monsters,[],
    'the borrowed monster must leave the activating team field at End Phase');
  assert.equal(state.core.players[1].monsters.length,1,
    'the borrowed monster returns to the original shared team field');
  controlled=state.core.players[1].monsters[0];
  assert.equal(controlled.uid,target.uid,'the same physical card returns; no replacement is created');
  assert.equal(controlled.owner,1);
  assert.equal(controlled.returnTo,undefined);
  assert.equal(controlled.returnTurn,undefined);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
