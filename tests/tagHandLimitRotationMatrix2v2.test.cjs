'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');

const tag=require('../dist/tagDuel');
const {tagNormalCardIds}=tag;
const {rulesFor}=require('../dist/rulesProfile');

const deck=tagNormalCardIds.slice(0,10).flatMap(id=>[id,id]);
assert.equal(deck.length,20,'each physical participant starts with a legal 20-card Main Deck');

const member=seat=>'m512-seat-'+seat;
function game(first){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M512 Seat '+seat,cards:[...deck]}));
  const state=tag.createTagDuel(players,{classic:true,seed:'m512-hand-limit-'+first,first});
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
function handSnapshot(state){
  return Object.fromEntries([0,1,2,3].map(seat=>[member(seat),tag.tagMemberHand(state,member(seat)).map(card=>card.uid)]));
}
function deckSnapshot(state){
  return Object.fromEntries([0,1,2,3].map(seat=>[member(seat),physical(state,seat).deck.map(card=>card.uid)]));
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertInventoryConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

for(let first=0;first<4;first++){
  test(`M512 six-card End Phase limit belongs to physical seat ${first} across the next-seat rotation`,()=>{
    let state=game(first);
    const active=tag.tagDecisionMember(state);
    const incoming=(first+1)%4;
    const partner=(first+2)%4;
    assert.equal(active.id,member(first));
    assert.equal(rulesFor(state.core).handLimit,6);

    // Move three existing physical cards from this seat's Deck into its hand.
    const activePhysical=physical(state,first);
    activePhysical.hand.push(...activePhysical.deck.splice(0,3));
    tag.assertTagDuel(state);
    assert.equal(tag.tagMemberHand(state,active.id).length,7);

    const before=inventorySnapshot(state);
    const beforeHands=handSnapshot(state);
    const beforeDecks=deckSnapshot(state);
    const incomingTop=physical(state,incoming).deck[0].uid;
    const incomingDeckLength=physical(state,incoming).deck.length;
    const partnerHand=beforeHands[member(partner)];

    const end=tag.tagActions(state,active.id).find(action=>action.kind==='end');
    assert.ok(end,'the active physical owner must be able to enter End Phase');
    state=tag.stepTagDuel(state,active.id,end);
    assert.equal(state.core.phase,'discard');
    assert.equal(tag.tagDecisionMember(state).id,active.id,'the outgoing owner retains the discard decision');
    assert.equal(tag.tagMemberHand(state,active.id).length,7);
    assert.equal(tag.tagMemberHand(state,member(partner)).length,partnerHand.length);
    assert.equal(physical(state,incoming).deck[0].uid,incomingTop,'incoming Deck must not draw before discard');

    // Simulate a process restart while the outgoing physical owner still owes a discard.
    state=JSON.parse(JSON.stringify(state));
    tag.assertTagDuel(state);
    assert.equal(tag.tagDecisionMember(state).id,active.id);
    assert.deepEqual(tag.tagMemberHand(state,member(partner)).map(card=>card.uid),partnerHand);
    assert.deepEqual(tag.tagActions(state,member(partner)),[],'inactive partner must not inherit the discard action');
    const discard=tag.tagActions(state,active.id).find(action=>action.kind==='discard');
    assert.ok(discard,'only the physical owner receives a discard action');
    assert.throws(
      ()=>tag.stepTagDuel(state,member(partner),discard),
      /Aguarde a vez do participante ativo/
    );

    state=tag.stepTagDuel(state,active.id,discard);
    assert.equal(state.core.phase,'main');
    assert.equal(state.core.turn,2);
    assert.equal(tag.tagDecisionMember(state).id,member(incoming));
    assert.equal(tag.tagMemberHand(state,active.id).length,6);
    assert.equal(tag.tagMemberHand(state,member(incoming)).length,beforeHands[member(incoming)].length+1);
    assert.equal(physical(state,incoming).deck.length,incomingDeckLength-1);
    assert.ok(tag.tagMemberHand(state,member(incoming)).some(card=>card.uid===incomingTop),'incoming physical owner draws exactly once');
    assert.deepEqual(tag.tagMemberHand(state,member(partner)).map(card=>card.uid),partnerHand);

    const afterHands=handSnapshot(state);
    const afterDecks=deckSnapshot(state);
    for(const seat of [0,1,2,3]){
      if(seat===first)assert.equal(afterHands[member(seat)].length,6);
      else if(seat===incoming)assert.equal(afterHands[member(seat)].length,beforeHands[member(seat)].length+1);
      else assert.deepEqual(afterHands[member(seat)],beforeHands[member(seat)],'non-acting physical hand changed: '+seat);
      if(seat===incoming)assert.equal(afterDecks[member(seat)].length,beforeDecks[member(seat)].length-1);
      else if(seat===first)assert.equal(afterDecks[member(seat)].length,beforeDecks[member(seat)].length,
        'outgoing owner used only its own three cards to create the overflow');
      else assert.deepEqual(afterDecks[member(seat)],beforeDecks[member(seat)],'non-acting physical Deck changed: '+seat);
    }

    for(const team of state.core.players){
      assert.ok(team.monsters.length<=3);
      assert.ok(team.backrow.length<=3);
      assert.ok((team.extra??[]).length<=5);
    }
    assertInventoryConserved(state,before);
  });
}

test('M512 a seven-card Main Phase hand does not expose an early discard for any starting seat',()=>{
  for(let first=0;first<4;first++){
    const state=game(first);
    const active=tag.tagDecisionMember(state);
    const activePhysical=physical(state,first);
    activePhysical.hand.push(...activePhysical.deck.splice(0,3));
    tag.assertTagDuel(state);
    assert.equal(state.core.phase,'main');
    assert.equal(tag.tagMemberHand(state,active.id).length,7);
    assert.ok(tag.tagActions(state,active.id).some(action=>action.kind==='end'));
    assert.equal(tag.tagActions(state,active.id).some(action=>action.kind==='discard'),false,
      'the six-card check must happen in End Phase, not during Main Phase (seat '+first+')');
  }
});
