'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const GIANT_TRUNADE='42703248';
const TORRENTIAL='53582587';
const TRAP_HOLE='04206964';
const BOTTOMLESS='29401950';
for(const [id,kind] of [[GIANT_TRUNADE,'giantTrunade'],[TORRENTIAL,'torrentialTribute'],[TRAP_HOLE,'trapHole'],[BOTTOMLESS,'bottomlessTrapHole']]){
  assert.ok(getPlayableCard(id),'expected an enabled card: '+id);
  assert.equal(getEffect(id)?.kind,kind);
}

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7);
const deckIds=normal.slice(0,7).map(entry=>entry.id);
function member(seat){return 'm118-seat-'+seat;}
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
  throw new Error('M118 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain Giant Trunade');
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
  assert.equal(cards.length,before.size,'Giant Trunade must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Giant Trunade response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass);
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function uids(cards){return cards.map(card=>card.uid).sort();}

test('Giant Trunade returns every team backrow card to its original physical owner hand',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M118 Seat '+seat,
    cards:deck(seat===0?[GIANT_TRUNADE]:seat===1?[TRAP_HOLE]:seat===2?[TORRENTIAL]:[BOTTOMLESS])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m118-giant-trunade-physical-hand-owners'});
  const before=inventorySnapshot(state);
  const giant=ensureInHand(state,0,GIANT_TRUNADE);
  const trapHoleCard=takeCard(state,1,TRAP_HOLE);
  const torrentialCard=takeCard(state,2,TORRENTIAL);
  const bottomlessCard=takeCard(state,3,BOTTOMLESS);
  const trapHole={...trapHoleCard,setTurn:0,faceUp:false};
  const torrential={...torrentialCard,setTurn:0,faceUp:false};
  const bottomless={...bottomlessCard,setTurn:0,faceUp:false};
  state.core.players[1].backrow.push(trapHole,bottomless);
  state.core.players[0].backrow.push(torrential);
  state.core.turn=3;
  const handsBefore=new Map([0,1,2,3].map(seat=>[seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)]));
  assert.match(giant.uid,/^m0:/);
  assert.match(trapHole.uid,/^m1:/);
  assert.match(torrential.uid,/^m2:/);
  assert.match(bottomless.uid,/^m3:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===giant.uid
  );
  assert.ok(action,'Giant Trunade must be activatable while either shared field has backrow cards');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical owner of a Set Trap cannot execute the Main Phase action');
  state=settle(tag.stepTagDuel(state,member(0),action));

  assert.equal(state.core.players[0].backrow.length,0);
  assert.equal(state.core.players[1].backrow.length,0);
  const expectedReturned=new Map([[1,trapHole.uid],[2,torrential.uid],[3,bottomless.uid]]);
  for(const seat of [0,1,2,3]){
    const hand=tag.tagMemberHand(state,member(seat));
    const expected=[...handsBefore.get(seat)];
    if(expectedReturned.has(seat))expected.push(expectedReturned.get(seat));
    if(seat===0)expected.splice(expected.indexOf(giant.uid),1);
    assert.deepEqual(uids(hand),expected.sort(),
      'physical seat '+seat+' must receive only its own returned cards');
  }
  assert.ok(tag.tagMemberHand(state,member(1)).some(card=>card.uid===trapHole.uid));
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===torrential.uid));
  assert.ok(tag.tagMemberHand(state,member(3)).some(card=>card.uid===bottomless.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===giant.uid));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  const endFirst=tag.tagActions(state,member(0)).find(action=>action.kind==='end');
  assert.ok(endFirst,'seat 0 must be able to end the first team turn');
  state=settle(tag.stepTagDuel(state,member(0),endFirst));
  assert.equal(tag.tagDecisionMember(state).id,member(1));
  const endSecond=tag.tagActions(state,member(1)).find(action=>action.kind==='end');
  assert.ok(endSecond,'seat 1 must be able to end the opposing team turn');
  state=settle(tag.stepTagDuel(state,member(1),endSecond));
  assert.equal(tag.tagDecisionMember(state).id,member(2),
    'the next turn rotates team 0 to physical seat 2');
  assert.equal(state.active[0],2);
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===torrential.uid),
    'the returned card follows physical seat 2 when that partner becomes active');
  const returnedUids=new Set([trapHole.uid,torrential.uid,bottomless.uid]);
  assert.ok(tag.tagMemberHand(state,member(0)).every(card=>!returnedUids.has(card.uid)),
    'seat 0 reserve hand does not acquire partner cards during rotation');
  assert.ok(tag.tagMemberHand(state,member(1)).some(card=>card.uid===trapHole.uid));
  assert.ok(tag.tagMemberHand(state,member(3)).some(card=>card.uid===bottomless.uid));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
