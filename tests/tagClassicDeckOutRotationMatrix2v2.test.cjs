'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');

const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const deck=tag.tagNormalCardIds
  .filter(id=>(getPlayableCard(id).level??0)<=4)
  .slice(0,10)
  .flatMap(id=>[id,id]);
assert.equal(deck.length,20,'each physical seat must start with a legal 20-card Main Deck');

const member=seat=>'m497-seat-'+seat;
function game(first){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M497 Seat '+seat,cards:[...deck]}));
  const state=tag.createTagDuel(players,{seed:'m497-rotation-'+first,first,classic:true});
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(rules.extraDeckMax,5);
  return state;
}
function physical(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertInventoryConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('all four 2v2 rotations check the incoming physical Deck, never the teammate Deck',()=>{
  for(let first=0;first<4;first++){
    let state=game(first);
    const incoming=(first+1)%4;
    const partner=(incoming+2)%4;
    assert.equal(state.cursor,first);
    assert.equal(tag.tagDecisionMember(state).id,member(first));
    assert.equal(physical(state,incoming).deck.length,16);
    assert.equal(physical(state,partner).deck.length,16);

    // Exhaust only the incoming physical seat. Keep every UID in the shared
    // Graveyard so the conservation invariant remains testable.
    const exhausted=physical(state,incoming).deck.splice(0);
    assert.equal(exhausted.length,16);
    state.core.players[incoming%2].grave.push(...exhausted);
    assert.equal(physical(state,incoming).deck.length,0);
    assert.equal(physical(state,partner).deck.length,16);
    tag.assertTagDuel(state);
    const before=inventorySnapshot(state);

    const actor=tag.tagDecisionMember(state).id;
    const end=tag.tagActions(state,actor).find(action=>action.kind==='end');
    assert.ok(end,'seat '+first+' must have a legal End action');
    state=tag.stepTagDuel(state,actor,end);

    assert.equal(state.core.phase,'finished','incoming seat '+incoming+' must lose immediately on the mandatory draw');
    assert.equal(state.core.winner,'tag-team-'+(1-incoming%2),'wrong team won after incoming seat '+incoming+' decked out');
    assert.match(state.core.reason,/comprar/i);
    assert.equal(state.cursor,incoming);
    assert.equal(state.active[incoming%2],incoming);
    assert.equal(physical(state,incoming).deck.length,0);
    assert.equal(physical(state,partner).deck.length,16,'partner '+partner+' must not donate or lose their physical Deck');
    assert.equal(tag.tagMemberHand(state,member(incoming)).length,4);
    assert.equal(tag.tagMemberHand(state,member(partner)).length,4);
    assertInventoryConserved(state,before);
    tag.assertTagDuel(JSON.parse(JSON.stringify(state)));
  }
});
