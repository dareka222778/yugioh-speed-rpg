'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const CARD_DESTRUCTION='72892473';
assert.equal(getPlayableCard(CARD_DESTRUCTION)?.kind,'spell');
assert.equal(getEffect(CARD_DESTRUCTION)?.kind,'cardDestruction');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the 2v2 fixture needs eight certified Normal Monsters');
const deckIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm173-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
  assert.ok(ids.length>=8);
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
  assert.equal(cards.length,80,'the four physical 20-card Decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Card Destruction must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function setup(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M173 Seat '+seat,
    cards:deck(seat===0?[CARD_DESTRUCTION]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m173-card-destruction-double-team-deckout'});
  const spell=ensureInHand(state,0,CARD_DESTRUCTION);
  const anchors=normal.slice(0,4);
  for(let seat=0;seat<4;seat++)ensureInHand(state,seat,anchors[seat].id);
  state.core.turn=3;

  // Each team has one physical participant with no Deck cards. The other
  // teammate still has enough cards to redraw, so both teams must fail.
  const exhausted=new Map();
  for(const seat of [2,3]){
    const physical=holder(state,seat);
    const stranded=physical.deck.splice(0);
    state.core.players[seat%2].grave.push(...stranded);
    exhausted.set(seat,stranded.map(card=>card.uid));
    assert.equal(physical.deck.length,0);
  }
  tag.assertTagDuel(state);
  const before=inventorySnapshot(state);
  const handsBefore=new Map([0,1,2,3].map(seat=>[
    seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)
  ]));
  const expectedDraws=new Map([0,1].map(seat=>[
    seat,holder(state,seat).deck.slice(0,handsBefore.get(seat).length-(seat===0?1:0)).map(card=>card.uid)
  ]));
  assert.equal(expectedDraws.get(0).length,handsBefore.get(0).length-1,'the activating Spell leaves seat 0 hand before Card Destruction counts the remaining cards');
  assert.equal(expectedDraws.get(1).length,handsBefore.get(1).length);
  return {state,spell,before,handsBefore,expectedDraws,exhausted};
}

test('Card Destruction produces a draw when one physical participant on each team cannot redraw',()=>{
  const {state:initial,spell,before,handsBefore,expectedDraws,exhausted}=setup();
  assert.match(spell.uid,/^m0:/,'Card Destruction must retain seat 0 physical ownership');
  const publicBefore=JSON.stringify(tag.publicTagDuel(initial));
  for(const hand of handsBefore.values())for(const uid of hand){
    assert.ok(!publicBefore.includes(uid),'a physical hand UID must not leak into the public duel projection: '+uid);
  }

  const action=tag.tagActions(initial,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid
  );
  assert.ok(action,'the active physical seat must receive the legal Card Destruction activation');
  assert.deepEqual(tag.tagActions(initial,member(2)),[],
    'the inactive physical teammate cannot execute the Main Phase action');

  const state=tag.stepTagDuel(initial,member(0),action);
  assert.equal(state.core.phase,'finished','the failed redraws end the duel immediately');
  assert.equal(state.core.winner,null,'both teams failing to redraw must produce a draw, not an arbitrary winner');
  assert.match(state.core.reason,/ambos não conseguiram comprar/i);

  for(const seat of [0,1]){
    const hand=tag.tagMemberHand(state,member(seat));
    assert.deepEqual(hand.map(card=>card.uid),expectedDraws.get(seat),
      'physical seat '+seat+' draws only from its own Deck before the simultaneous draw result');
    assert.ok(hand.every(card=>card.uid.startsWith('m'+seat+':')),
      'physical seat '+seat+' must not receive a teammate card');
  }
  for(const seat of [2,3]){
    assert.deepEqual(tag.tagMemberHand(state,member(seat)),[],
      'exhausted physical seat '+seat+' cannot borrow from its teammate Deck');
    assert.equal(holder(state,seat).deck.length,0);
  }

  for(let seat=0;seat<4;seat++){
    const team=seat%2;
    for(const uid of handsBefore.get(seat)){
      assert.ok(state.core.players[team].grave.some(card=>card.uid===uid),
        'discarded physical hand must enter its shared team Graveyard: '+uid);
    }
  }
  for(const seat of [2,3]){
    const team=seat%2;
    for(const uid of exhausted.get(seat)){
      assert.ok(state.core.players[team].grave.some(card=>card.uid===uid),
        'pre-exhausted Deck cards remain in the correct team Graveyard: '+uid);
    }
  }
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid),
    'Card Destruction itself enters the activating team Graveyard');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const restored=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(restored));
  assertConserved(restored,before);
});
