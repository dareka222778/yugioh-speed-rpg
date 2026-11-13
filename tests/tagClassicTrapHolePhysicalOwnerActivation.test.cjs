'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const TRAP_HOLE='04206964';
assert.ok(getPlayableCard(TRAP_HOLE)?.kind==='trap','Trap Hole must be an enabled Trap');
assert.equal(getEffect(TRAP_HOLE)?.kind,'trapHole');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const targetCard=normal.find(entry=>entry.card.atk>=1000);
assert.ok(targetCard,'the Trap Hole fixture needs a Normal Monster with at least 1000 ATK');
const deckIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm124-seat-'+seat;}
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
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Trap Hole must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function endTurn(state,seat){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='end');
  assert.ok(action,'physical seat '+seat+' must be able to end its turn');
  return tag.stepTagDuel(state,member(seat),action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Trap Hole response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('Trap Hole set by seat 0 can be activated by seat 2 against a Normal Summon by seat 3',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M124 Seat '+seat,
    cards:deck(seat===0?[TRAP_HOLE]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m124-trap-hole-physical-owner'});
  const trap=ensureInHand(state,0,TRAP_HOLE);
  const target=ensureInHand(state,3,targetCard.id);
  state.core.turn=0;
  const before=inventorySnapshot(state);
  assert.match(trap.uid,/^m0:/,'Trap Hole must retain seat 0 physical ownership');
  assert.match(target.uid,/^m3:/,'the Normal Summon must retain seat 3 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const set=tag.tagActions(state,member(0)).find(action=>action.kind==='set'&&action.card===trap.uid);
  assert.ok(set,'seat 0 must be able to Set Trap Hole');
  state=tag.stepTagDuel(state,member(0),set);
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===trap.uid&&!card.faceUp));
  state=endTurn(state,0);
  state=endTurn(state,1);
  state=endTurn(state,2);
  assert.equal(state.cursor,3,'the turn rotation must reach physical seat 3');

  const summon=tag.tagActions(state,member(3)).find(action=>action.kind==='summon'&&action.card===target.uid);
  assert.ok(summon,'seat 3 must receive the legal Normal Summon action');
  state=tag.stepTagDuel(state,member(3),summon);
  assert.equal(state.core.phase,'response','the successful Normal Summon opens the Trap Hole response window');
  assert.equal(tag.tagDecisionMember(state).id,member(2),
    'the active teammate seat 2 represents team 0 during the response window');

  const activate=tag.tagActions(state,member(2)).find(action=>
    action.kind==='trap'&&action.card===trap.uid&&action.target===target.uid
  );
  assert.ok(activate,
    'seat 2 may activate the shared Trap Hole even though its physical owner is inactive seat 0');
  state=settle(tag.stepTagDuel(state,member(2),activate));
  assert.equal(state.core.phase,'main');
  assert.ok(!state.core.players[1].monsters.some(monster=>monster.uid===target.uid),
    'Trap Hole destroys the summoned monster controlled by the opposing team');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid),
    'the destroyed monster enters the opposing team Graveyard');
  assert.ok(!state.core.players[0].backrow.some(card=>card.uid===trap.uid),
    'the activated Trap leaves the shared backrow');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===trap.uid),
    'Trap Hole enters its physical owner team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
