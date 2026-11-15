'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const normalIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster')
  .slice(0,8);
assert.ok(normalIds.length>=8,'the four physical Decks need eight enabled Normal Monsters');

function member(seat){return 'm221-seat-'+seat;}
function deck(){
  return Array.from({length:20},(_,index)=>normalIds[index%normalIds.length]);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function physicalSeat(state,id){
  const seat=state.members.findIndex(member=>member.id===id);
  assert.ok(seat>=0,'active participant must have a physical seat');
  return seat;
}
function createGame(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M221 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  assert.equal(rulesFor(state.core).mainDeckMin,20);
  assert.equal(rulesFor(state.core).mainDeckMax,30);
  assert.equal(rulesFor(state.core).handLimit,6);
  assert.equal(rulesFor(state.core).handCheck,'end');
  assert.equal(rulesFor(state.core).extraDeckMax,5);
  assert.equal(rulesFor(state.core).monsterZones,3);
  assert.equal(rulesFor(state.core).spellTrapZones,3);
  return state;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all 80 physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'deck-out must not remove physical cards');
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
function endTurn(state){
  const actor=tag.tagDecisionMember(state).id;
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active physical participant must be able to end the turn');
  return tag.stepTagDuel(state,actor,action);
}
function emptyPhysicalDeck(state,seat){
  const physical=holder(state,seat);
  const startingHand=tag.tagMemberHand(state,member(seat)).length;
  assert.equal(physical.deck.length+startingHand,20,'the physical participant must begin with exactly twenty cards');
  const exhausted=physical.deck.splice(0);
  assert.equal(exhausted.length,20-startingHand,'only the physical participant remaining Deck is exhausted');
  state.core.players[seat%2].grave.push(...exhausted);
  assert.equal(holder(state,seat).deck.length,0);
  return exhausted;
}
function deckSnapshot(state){
  return new Map([0,1,2,3].map(seat=>[
    seat,holder(state,seat).deck.map(card=>card.uid)
  ]));
}
function handSnapshot(state){
  return new Map([0,1,2,3].map(seat=>[
    seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)
  ]));
}
function assertSnapshot(state,snapshot,label){
  for(const seat of [0,1,2,3]){
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),snapshot.decks.get(seat),
      label+' must not draw from physical seat '+seat+' Deck');
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),snapshot.hands.get(seat),
      label+' must not mutate physical seat '+seat+' hand');
  }
}
function runUntilDeckOut(targetSeat){
  let state=createGame('m221-deck-out-seat-'+targetSeat);
  const before=inventorySnapshot(state);
  const partnerSeat=targetSeat%2===0?targetSeat+2:targetSeat-2;
  emptyPhysicalDeck(state,targetSeat);
  assert.ok(holder(state,partnerSeat).deck.length>0,
    'the target physical participant must be exhausted while its teammate still has a usable Deck');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  let finalSnapshot=null;
  for(let guard=0;state.core.phase!=='finished';guard++){
    assert.ok(guard<5,'four-seat rotation must reach the exhausted physical participant');
    const outgoing=physicalSeat(state,tag.tagDecisionMember(state).id);
    const incoming=(outgoing+1)%4;
    if(incoming===targetSeat){
      finalSnapshot={decks:deckSnapshot(state),hands:handSnapshot(state)};
      assert.ok(finalSnapshot.decks.get(partnerSeat).length>0,
        'the partner still has cards immediately before the failed draw');
    }
    state=endTurn(state);
  }
  assert.ok(finalSnapshot,'the failed draw must occur at the target physical seat turn start');
  assert.equal(state.core.phase,'finished','an empty physical Deck causes an immediate deck-out');
  assert.equal(state.core.winner,1-(targetSeat%2),
    'deck-out awards the duel to the opposing team, not to the exhausted participant partner');
  assert.match(state.core.reason,/não conseguiu comprar uma carta/i);
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,4000],
    'deck-out does not fabricate LP changes');
  assertSnapshot(state,finalSnapshot,'the failed physical draw');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const restored=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(restored),'deck-out must survive JSON restoration');
  assertPrivateHands(restored);
  assertConserved(restored,before);
  return state;
}

for(const seat of [0,1,2,3]){
  test('classic 2v2 deck-out is charged to physical seat '+seat+' and never borrows its partner Deck',()=>{
    const state=runUntilDeckOut(seat);
    assert.equal(state.core.winner,1-(seat%2));
  });
}
