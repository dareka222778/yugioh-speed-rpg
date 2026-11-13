'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const TREMENDOUS_FIRE='46918794';
assert.ok(getPlayableCard(TREMENDOUS_FIRE),'Tremendous Fire must be certified and playable');
assert.equal(getEffect(TREMENDOUS_FIRE)?.kind,'sequence');
assert.deepEqual(getEffect(TREMENDOUS_FIRE)?.operations,[
  {kind:'damage',recipients:[
    {player:'opponent',amount:1000},
    {player:'self',amount:500}
  ]}
]);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm130-seat-'+seat;}
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
  assert.equal(cards.length,before.size,'Tremendous Fire must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function setup(lp=[4000,4000]){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M130 Seat '+seat,
    cards:deck(seat===0?[TREMENDOUS_FIRE]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m130-tremendous-fire-four-seats'});
  const spell=ensureInHand(state,0,TREMENDOUS_FIRE);
  state.core.turn=3;
  state.core.players[0].lp=lp[0];
  state.core.players[1].lp=lp[1];
  assert.match(spell.uid,/^m0:/,'Tremendous Fire must retain seat 0 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const handsBefore=new Map([0,1,2,3].map(seat=>[
    seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)
  ]));
  const decksBefore=new Map([0,1,2,3].map(seat=>[
    seat,holder(state,seat).deck.map(card=>card.uid)
  ]));
  return {state,spell,before,handsBefore,decksBefore};
}
function activate(initial,spell){
  const action=tag.tagActions(initial,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid
  );
  assert.ok(action,'the active physical seat must receive the legal Tremendous Fire activation');
  assert.deepEqual(tag.tagActions(initial,member(2)),[],
    'the inactive physical teammate cannot activate the Spell');
  return tag.stepTagDuel(initial,member(0),action);
}
function assertOtherSeatsUnchanged(state,handsBefore,decksBefore){
  for(const seat of [1,2,3]){
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),handsBefore.get(seat),
      'Tremendous Fire must not mutate physical seat '+seat+' hand');
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),decksBefore.get(seat),
      'Tremendous Fire must not mutate physical seat '+seat+' Deck');
  }
}

test('Tremendous Fire applies 1000 opponent-team damage and 500 self-team damage in 2v2',()=>{
  const {state:initial,spell,before,handsBefore,decksBefore}=setup();
  const state=activate(initial,spell);
  assert.equal(state.core.phase,'main','Tremendous Fire resolves immediately without a legal response');
  assert.equal(state.core.players[0].lp,3500,'the activating team loses exactly 500 LP');
  assert.equal(state.core.players[1].lp,3000,'the opposing team loses exactly 1000 LP');
  assert.deepEqual(tag.tagMemberHand(state,member(0)).map(card=>card.uid),
    handsBefore.get(0).filter(uid=>uid!==spell.uid),'only the resolving Spell leaves seat 0 hand');
  assert.deepEqual(holder(state,0).deck.map(card=>card.uid),decksBefore.get(0),
    'Tremendous Fire does not draw or mill the active physical Deck');
  assertOtherSeatsUnchanged(state,handsBefore,decksBefore);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid),
    'Tremendous Fire must enter the activating team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('Tremendous Fire checks both team LP totals after applying the complete damage group',()=>{
  const {state:initial,spell,before}=setup([500,1000]);
  const state=activate(initial,spell);
  assert.equal(state.core.phase,'finished','both teams reach zero in the same damage group');
  assert.equal(state.core.winner,null,'simultaneous team defeat must be a draw, not a sequential false winner');
  assert.deepEqual(state.core.players.map(player=>player.lp),[0,0]);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('Tremendous Fire awards victory to the surviving team after grouped damage',()=>{
  const {state:initial,spell,before}=setup([501,1000]);
  const state=activate(initial,spell);
  assert.equal(state.core.phase,'finished');
  assert.equal(state.core.winner,state.core.players[0].id,
    'the activating team survives at one LP after both damage values are applied');
  assert.deepEqual(state.core.players.map(player=>player.lp),[1,0]);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
