'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const UPSTART='70368879';
assert.ok(getPlayableCard(UPSTART),'Upstart Goblin must be certified and playable');
assert.equal(getEffect(UPSTART)?.kind,'sequence');
assert.deepEqual(getEffect(UPSTART)?.operations,[
  {kind:'draw',count:1},
  {kind:'gainLP',player:'opponent',amount:1000}
]);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm129-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
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
  assert.equal(cards.length,80,'the four physical 20-card decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique before resolution');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Upstart Goblin must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function setup(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M129 Seat '+seat,
    cards:deck(seat===0?[UPSTART]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m129-upstart-goblin-four-seats'});
  const spell=ensureInHand(state,0,UPSTART);
  for(const entry of normal.slice(0,6))ensureInHand(state,0,entry.id);
  state.core.turn=3;
  assert.match(spell.uid,/^m0:/,'Upstart Goblin must retain seat 0 physical ownership');
  assert.ok(tag.tagMemberHand(state,member(0)).length>=7,
    'the fixture intentionally begins above six cards during Main Phase');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const handsBefore=new Map([0,1,2,3].map(seat=>[
    seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)
  ]));
  const decksBefore=new Map([0,1,2,3].map(seat=>[
    seat,holder(state,seat).deck.map(card=>card.uid)
  ]));
  const topUid=holder(state,0).deck[0].uid;
  return {state,spell,before,handsBefore,decksBefore,topUid};
}

test('Upstart Goblin draws only for the active physical seat and grants 1000 LP to the opposing 2v2 team',()=>{
  const {state:initial,spell,before,handsBefore,decksBefore,topUid}=setup();
  const publicBefore=tag.publicTagDuel(initial);
  for(const uids of handsBefore.values())for(const uid of uids){
    assert.ok(!JSON.stringify(publicBefore).includes(uid),
      'private physical hand UIDs must not appear in the public duel projection: '+uid);
  }
  const action=tag.tagActions(initial,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid
  );
  assert.ok(action,'the active physical seat must receive the legal Upstart Goblin activation');
  assert.deepEqual(tag.tagActions(initial,member(2)),[],
    'the inactive physical teammate cannot execute the Main Phase action');

  const state=tag.stepTagDuel(initial,member(0),action);
  assert.equal(state.core.phase,'main','Upstart resolves immediately when no legal response exists');
  assert.equal(state.core.players[0].lp,4000,'the activating team must not gain LP');
  assert.equal(state.core.players[1].lp,5000,'the opposing team receives exactly 1000 LP');
  assert.deepEqual(tag.tagMemberHand(state,member(0)).map(card=>card.uid),
    handsBefore.get(0).filter(uid=>uid!==spell.uid).concat(topUid),
    'the active seat draws the top card of its own physical Deck');
  assert.equal(tag.tagMemberHand(state,member(0)).length,handsBefore.get(0).length,
    'the Main Phase may temporarily retain more than six cards; no premature discard occurs');
  assert.deepEqual(holder(state,0).deck.map(card=>card.uid),decksBefore.get(0).slice(1),
    'only the active physical Deck loses its top card');
  for(const seat of [1,2,3]){
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),handsBefore.get(seat),
      'Upstart Goblin must not mutate physical seat '+seat+' hand');
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),decksBefore.get(seat),
      'Upstart Goblin must not draw from physical seat '+seat+' Deck');
  }
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid),
    'Upstart Goblin must enter the activating team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('Upstart Goblin cannot borrow a teammate Deck when the active physical Deck is empty',()=>{
  const {state,before}=setup();
  const active=holder(state,0);
  state.core.players[0].grave.push(...active.deck.splice(0));
  assert.equal(active.deck.length,0,'the active physical seat Deck is intentionally exhausted');
  assert.ok(holder(state,2).deck.length>0,'the inactive teammate still has cards but cannot lend them');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const unchanged=JSON.stringify(state);
  assert.ok(!tag.tagActions(state,member(0)).some(candidate=>
    candidate.kind==='spell'&&candidate.card===state.core.players[0].hand.find(card=>card.id===UPSTART)?.uid
  ),'Upstart Goblin must not be legal when only the partner has cards to draw');
  assert.equal(JSON.stringify(state),unchanged,'an unavailable draw must not mutate any physical zone');
  assertConserved(state,before);
});
