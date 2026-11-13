'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const MONSTER_REBORN='83764718';
const RAIGEKI='12580477';
assert.ok(getPlayableCard(MONSTER_REBORN)?.kind==='spell');
assert.equal(getEffect(MONSTER_REBORN)?.kind,'monsterReborn');
assert.ok(getPlayableCard(RAIGEKI)?.kind==='spell');
assert.equal(getEffect(RAIGEKI)?.kind,'raigeki');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const targetEntry=normal.reduce((best,current)=>current.card.atk<best.card.atk?current:best);
const deckIds=normal.slice(0,7).map(entry=>entry.id);
function member(seat){return 'm113-seat-'+seat;}
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
  throw new Error('M113 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain the Spell');
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
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
  assert.equal(cards.length,before.size,'Monster Reborn/Raigeki must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the 2v2 Spell response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('Monster Reborn borrows an opposing physical card but Raigeki returns it to its original team Graveyard',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M113 Seat '+seat,
    cards:deck(seat===0?[MONSTER_REBORN]:seat===1?[RAIGEKI]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m113-monster-reborn-original-team-owner'});
  const before=inventorySnapshot(state);
  const reborn=ensureInHand(state,0,MONSTER_REBORN);
  const raigeki=ensureInHand(state,1,RAIGEKI);
  const target=takeCard(state,3,targetEntry.id);
  state.core.players[1].grave.push(target);
  state.core.turn=3;
  assert.match(reborn.uid,/^m0:/);
  assert.match(raigeki.uid,/^m1:/);
  assert.match(target.uid,/^m3:/,'the revived monster must retain seat 3 physical identity');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const revive=tag.tagActions(state,member(0)).find(action=>
    action.kind==='spell'&&action.card===reborn.uid&&action.target===target.uid&&action.position==='atk'
  );
  assert.ok(revive,'the active team must be able to target a monster in the opposing shared Graveyard');
  state=tag.stepTagDuel(state,member(0),revive);
  state=settle(state);
  assert.equal(state.core.phase,'main',
    'with no legal response, Monster Reborn resolves immediately in the activating Main Phase');

  const borrowed=state.core.players[0].monsters.find(card=>card.uid===target.uid);
  assert.ok(borrowed,'Monster Reborn must place the opposing Graveyard monster on the activating team field');
  assert.equal(borrowed.owner,1,'the revived monster must retain its original team owner');
  assert.equal(borrowed.uid,target.uid,'the revived monster must retain its original physical UID');
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===target.uid),
    'the card leaves its original Graveyard while controlled by the other team');

  const end=tag.tagActions(state,member(0)).find(action=>action.kind==='end');
  assert.ok(end,'the active physical seat must be able to end its turn');
  state=tag.stepTagDuel(state,member(0),end);
  state=settle(state);
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the next physical seat of the opposing team receives the turn');

  const destroy=tag.tagActions(state,member(1)).find(action=>
    action.kind==='spell'&&action.card===raigeki.uid
  );
  assert.ok(destroy,'the original team can use Raigeki to destroy the borrowed monster');
  state=tag.stepTagDuel(state,member(1),destroy);
  state=settle(state);
  assert.equal(state.core.phase,'main',
    'with no legal response, Raigeki resolves immediately in the activating Main Phase');

  assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid),
    'after destruction, the borrowed monster must return to its original team Graveyard');
  assert.ok(!state.core.players[0].grave.some(card=>card.uid===target.uid),
    'the temporary controller must not become the physical owner on destruction');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===raigeki.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===reborn.uid));
  assert.equal(state.core.players[0].monsters.some(card=>card.uid===target.uid),false);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
