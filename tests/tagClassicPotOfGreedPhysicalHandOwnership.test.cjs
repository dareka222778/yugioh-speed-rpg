'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const POT_OF_GREED='55144522';
assert.ok(getPlayableCard(POT_OF_GREED)?.kind==='spell','Pot of Greed must be an enabled Spell');
assert.equal(getEffect(POT_OF_GREED)?.kind,'potOfGreed');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm121-seat-'+seat;}
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
  assert.ok(index>=0,'the physical seat Deck must contain Pot of Greed');
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
  assert.equal(cards.length,before.size,'Pot of Greed must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Pot of Greed draws from the active physical Deck and permits seven cards before End Phase',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M121 Seat '+seat,
    cards:deck(seat===0?[POT_OF_GREED]:[])
  }));
  const initial=tag.createTagDuel(players,{classic:true,first:0,seed:'m121-pot-of-greed-physical-draw'});
  const pot=ensureInHand(initial,0,POT_OF_GREED);
  const active=holder(initial,0);
  while(active.hand.length<6){
    const [card]=active.deck.splice(0,1);
    assert.ok(card,'the active physical Deck must have a card to complete the six-card setup');
    active.hand.push(card);
  }
  assert.equal(active.hand.length,6,'the active physical hand begins at six cards');
  const before=inventorySnapshot(initial);
  const handBefore=tag.tagMemberHand(initial,member(0)).map(card=>card.uid);
  const expectedDraws=active.deck.slice(0,2).map(card=>card.uid);
  assert.equal(expectedDraws.length,2,'the active physical Deck must have two cards to draw');
  const partnerHandBefore=tag.tagMemberHand(initial,member(2)).map(card=>card.uid);
  const partnerDeckBefore=holder(initial,2).deck.map(card=>card.uid);
  const otherHands=new Map([1,3].map(seat=>[
    seat,tag.tagMemberHand(initial,member(seat)).map(card=>card.uid)
  ]));
  const otherDecks=new Map([1,2,3].map(seat=>[
    seat,holder(initial,seat).deck.map(card=>card.uid)
  ]));
  initial.core.turn=3;
  assert.match(pot.uid,/^m0:/,'Pot of Greed must retain seat 0 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(initial));

  const action=tag.tagActions(initial,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===pot.uid
  );
  assert.ok(action,'the active physical seat must receive the legal Pot of Greed activation');
  assert.deepEqual(tag.tagActions(initial,member(2)),[],
    'the inactive physical teammate cannot execute the Main Phase action');

  const state=tag.stepTagDuel(initial,member(0),action);
  assert.equal(state.core.phase,'main','Pot of Greed resolves without forcing a mid-turn discard');
  assert.equal(state.core.handFlow,undefined,'the draw must not open an End Phase discard decision');
  const expectedActiveHand=[...handBefore.filter(uid=>uid!==pot.uid),...expectedDraws];
  assert.deepEqual(tag.tagMemberHand(state,member(0)).map(card=>card.uid),expectedActiveHand,
    'the active physical seat receives exactly two cards from its own Deck');
  assert.equal(tag.tagMemberHand(state,member(0)).length,7,
    'a seven-card hand is allowed during Main Phase; the six-card limit is checked at End Phase');
  assert.deepEqual(tag.tagMemberHand(state,member(2)).map(card=>card.uid),partnerHandBefore,
    'the inactive teammate hand remains private and unchanged');
  assert.deepEqual(holder(state,2).deck.map(card=>card.uid),partnerDeckBefore,
    'the inactive teammate Deck must not supply the active player draw');
  for(const seat of [1,3]){
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),otherHands.get(seat));
  }
  for(const seat of [1,2,3]){
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),otherDecks.get(seat));
  }
  assert.ok(state.core.players[0].grave.some(card=>card.uid===pot.uid),
    'Pot of Greed must enter the activating team Graveyard');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
