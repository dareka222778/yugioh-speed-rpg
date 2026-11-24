'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const member=seat=>'m240-seat-'+seat;
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster')
  .slice(0,10);
assert.equal(NORMALS.length,10,'the four physical Decks need ten certified Normal Monsters');
function deck(){return Array.from({length:20},(_,index)=>NORMALS[index%NORMALS.length]);}
function players(){
  return [0,1,2,3].map(seat=>({id:member(seat),name:'M240 Seat '+seat,cards:deck()}));
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function moveDeckCardsToHand(state,seat,count){
  const physical=holder(state,seat);
  for(let i=0;i<count;i++){
    const card=physical.deck.shift();
    assert.ok(card,'physical Deck must have a card to move into its own hand');
    physical.hand.push(card);
  }
}
function rules(state){
  const value=rulesFor(state.core);
  assert.equal(value.mainDeckMin,20);
  assert.equal(value.mainDeckMax,30);
  assert.equal(value.handLimit,6);
  assert.equal(value.handCheck,'end');
  assert.equal(value.extraDeckMax,5);
  assert.equal(value.monsterZones,3);
  assert.equal(value.spellTrapZones,3);
}
function inventory(state){
  const cards=tag.tagInventory(state);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(cards.length,80,'four physical 20-card Decks must remain represented');
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'End Phase discard must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(let seat=0;seat<4;seat++){
    for(const card of tag.tagMemberHand(state,member(seat))){
      assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
    }
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))),
    'the persisted 2v2 discard decision must survive JSON restoration');
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function endTurn(state,seat){
  assert.equal(tag.tagDecisionMember(state).id,member(seat));
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active physical participant must be able to end the turn');
  return settle(tag.stepTagDuel(state,member(seat),action));
}
function discardOne(state,seat){
  assert.equal(state.core.phase,'discard','the End Phase must pause for an excess hand');
  assert.equal(tag.tagDecisionMember(state).id,member(seat),
    'the physical owner of the excess hand must decide the discard');
  const actions=tag.tagActions(state,member(seat)).filter(action=>action.kind==='discard');
  assert.equal(actions.length,tag.tagMemberHand(state,member(seat)).length,
    'only the active physical owner hand is exposed as discard choices');
  assert.ok(actions.length>0);
  const action=actions[0];
  const unchanged=JSON.stringify(state);
  const partner=seat===0?2:0;
  assert.deepEqual(tag.tagActions(state,member(partner)),[],
    'the inactive teammate cannot discard the active physical owner hand');
  assert.throws(()=>tag.stepTagDuel(state,member(partner),action),
    /Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'rejected partner action must not mutate the duel');
  return settle(tag.stepTagDuel(state,member(seat),action));
}
function setup(){
  const state=tag.createTagDuel(players(),{classic:true,first:0,seed:'m240-end-phase-hand-limit'});
  moveDeckCardsToHand(state,0,3); // seat 0 starts the turn with seven.
  moveDeckCardsToHand(state,2,2); // inactive partner starts with six.
  rules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  assertPrivateHands(state);
  assertRestorable(state);
  return {state,before};
}

test('End Phase discards only the active physical member excess, not the partner hand',()=>{
  const fixture=setup();
  let state=endTurn(fixture.state,0);
  assert.equal(state.core.phase,'discard');
  assert.equal(tag.tagMemberHand(state,member(0)).length,7);
  assert.equal(tag.tagMemberHand(state,member(2)).length,6,
    'the inactive partner hand remains untouched while seat 0 discards');
  const partnerHandBefore=tag.tagMemberHand(state,member(2)).map(card=>card.uid);
  state=discardOne(state,0);
  assert.equal(tag.tagMemberHand(state,member(0)).length,6);
  assert.deepEqual(tag.tagMemberHand(state,member(2)).map(card=>card.uid),partnerHandBefore);
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the next opposing physical seat receives the turn after the discard');
  assert.equal(state.core.turn,2);
  rules(state);assertConserved(state,fixture.before);assertPrivateHands(state);assertRestorable(state);
});

test('incoming partner draws from its own Deck and discards its own excess at its End Phase',()=>{
  const fixture=setup();
  let state=endTurn(fixture.state,0);
  state=discardOne(state,0);
  const seat2DeckBefore=holder(state,2).deck.map(card=>card.uid);
  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2),
    'the allied partner becomes the active physical seat after the opponent turn');
  assert.equal(tag.tagMemberHand(state,member(2)).length,7,
    'the incoming partner draws one card from its own Deck before End Phase');
  assert.equal(holder(state,2).deck.length,seat2DeckBefore.length-1);
  assert.equal(state.core.phase,'main');
  const ownHand=tag.tagMemberHand(state,member(2)).map(card=>card.uid);
  const inactivePartnerHand=tag.tagMemberHand(state,member(0)).map(card=>card.uid);
  state=endTurn(state,2);
  assert.equal(state.core.phase,'discard');
  assert.equal(tag.tagMemberHand(state,member(2)).length,7);
  assert.deepEqual(tag.tagMemberHand(state,member(0)).map(card=>card.uid),inactivePartnerHand);
  state=discardOne(state,2);
  assert.equal(tag.tagMemberHand(state,member(2)).length,6);
  assert.equal(tag.tagMemberHand(state,member(0)).length,6);
  assert.equal(tag.tagDecisionMember(state).id,member(3));
  assert.ok(ownHand.every(uid=>tag.tagInventory(state).some(card=>card.uid===uid)),
    'the incoming partner physical cards remain conserved after its discard');
  rules(state);assertConserved(state,fixture.before);assertPrivateHands(state);assertRestorable(state);
});

test('classic 2v2 enforces the 20–30 Main Deck boundary and rejects a sixth Extra Deck card',()=>{
  const base=players();
  assert.throws(()=>tag.createTagDuel(base.map((player,index)=>index===0?{...player,cards:player.cards.slice(1)}:player),{classic:true,first:0}),
    /deck de 20 a 30 cartas/i);
  assert.throws(()=>tag.createTagDuel(base.map((player,index)=>index===0?{...player,cards:[...player.cards,...Array(11).fill(NORMALS[0])]}:player),{classic:true,first:0}),
    /deck de 20 a 30 cartas/i);
  assert.throws(()=>tag.createTagDuel(base.map((player,index)=>index===0?{...player,extra:Array(6).fill(NORMALS[0])}:player),{classic:true,first:0}),
    /Deck Adicional: máximo de 5 cartas/i);
});
