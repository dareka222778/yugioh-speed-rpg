'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const MAGIC_JAMMER='77414722';
const POT_OF_GREED='55144522';
for(const [id,kind] of [[MAGIC_JAMMER,'magicJammer'],[POT_OF_GREED,'potOfGreed']]){
  assert.ok(getPlayableCard(id),'expected an enabled card: '+id);
  assert.equal(getEffect(id)?.kind,kind);
}
assert.equal(getActivationModel(getEffect(MAGIC_JAMMER))?.speed,3);
assert.equal(getActivationModel(getEffect(MAGIC_JAMMER))?.window,'spellActivated');
assert.equal(getActivationModel(getEffect(MAGIC_JAMMER))?.damage,'counter');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);
function member(seat){return 'm111-seat-'+seat;}
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
  throw new Error('M111 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Magic Jammer must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Magic Jammer response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('inactive teammate-owned Magic Jammer negates Pot of Greed and pays discard from the active physical seat',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M111 Seat '+seat,
    cards:deck(seat===0?[POT_OF_GREED]:seat===3?[MAGIC_JAMMER]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m111-magic-jammer-physical-cost-owner'});
  const before=inventorySnapshot(state);
  const pot=ensureInHand(state,0,POT_OF_GREED);
  const jammerCard=takeCard(state,3,MAGIC_JAMMER);
  const jammer={...jammerCard,setTurn:0,faceUp:false};
  state.core.players[1].backrow.push(jammer);
  state.core.turn=3;
  const activeResponderHandBefore=tag.tagMemberHand(state,member(1));
  const inactiveTrapOwnerHandBefore=tag.tagMemberHand(state,member(3));
  const activeSpellHandBefore=tag.tagMemberHand(state,member(0)).length;
  const activeSpellDeckBefore=holder(state,0).deck.length;
  assert.equal(activeResponderHandBefore.length,4,'the active responder must have a discard available');
  assert.match(pot.uid,/^m0:/);
  assert.match(jammer.uid,/^m3:/,'Magic Jammer must retain inactive seat 3 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const publicBefore=tag.publicTagDuel(state);
  assert.ok(!JSON.stringify(publicBefore).includes(MAGIC_JAMMER),'the set Counter Trap identity must remain private');
  assert.ok(!JSON.stringify(publicBefore).includes(jammer.uid),'the set Counter Trap UID must remain private');

  const spell=tag.tagActions(state,member(0)).find(action=>
    action.kind==='spell'&&action.card===pot.uid
  );
  assert.ok(spell,'the active physical seat must be able to activate Pot of Greed');
  state=tag.stepTagDuel(state,member(0),spell);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical opponent receives Spell response priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical owner of Magic Jammer must not receive response actions');
  const response=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===jammer.uid
  );
  assert.ok(response,'active seat 1 must activate the inactive partner set Magic Jammer');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),response),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'the inactive Trap owner cannot mutate the chain');
  state=tag.stepTagDuel(state,member(1),response);

  const activeResponderHandAfter=tag.tagMemberHand(state,member(1));
  const inactiveTrapOwnerHandAfter=tag.tagMemberHand(state,member(3));
  assert.equal(activeResponderHandAfter.length,activeResponderHandBefore.length-1,
    'Magic Jammer discards exactly one card from the active physical responder hand');
  assert.deepEqual(inactiveTrapOwnerHandAfter.map(card=>card.uid),inactiveTrapOwnerHandBefore.map(card=>card.uid),
    'the inactive physical Trap owner hand must not pay the Counter Trap cost');
  const responderBeforeIds=new Set(activeResponderHandBefore.map(card=>card.uid));
  const paidCosts=state.core.players[1].grave.filter(card=>responderBeforeIds.has(card.uid));
  assert.equal(paidCosts.length,1,'exactly one card from active seat 1 must be discarded to the shared Graveyard');
  assert.match(paidCosts[0].uid,/^m1:/,'the discarded cost must preserve active seat 1 physical ownership');

  state=settle(state);
  assert.equal(state.core.phase,'main');
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assert.equal(tag.tagMemberHand(state,member(0)).length,activeSpellHandBefore-1,
    'the negated Pot of Greed must not draw two cards');
  assert.equal(holder(state,0).deck.length,activeSpellDeckBefore,
    'the negated Spell must not consume cards from the physical active Deck');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===pot.uid),
    'the negated Pot of Greed goes to the activating team Graveyard');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===jammer.uid),
    'the activated Magic Jammer goes to the defending team Graveyard');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
