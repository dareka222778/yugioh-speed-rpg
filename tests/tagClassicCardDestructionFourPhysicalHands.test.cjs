'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const CARD_DESTRUCTION='72892473';
const cardDestruction=getPlayableCard(CARD_DESTRUCTION);
assert.ok(cardDestruction&&cardDestruction.kind==='spell','Card Destruction must be an enabled Normal Spell');
assert.equal(getEffect(CARD_DESTRUCTION)?.kind,'cardDestruction');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm120-seat-'+seat;}
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
  assert.equal(cards.length,before.size,'Card Destruction must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function setup(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M120 Seat '+seat,
    cards:deck(seat===0?[CARD_DESTRUCTION]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m120-card-destruction-four-hands'});
  const spell=ensureInHand(state,0,CARD_DESTRUCTION);
  const anchors=normal.slice(0,4);
  for(let seat=0;seat<4;seat++)ensureInHand(state,seat,anchors[seat].id);
  state.core.turn=3;
  assert.match(spell.uid,/^m0:/,'Card Destruction must retain seat 0 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const handsBefore=new Map([0,1,2,3].map(seat=>[
    seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)
  ]));
  const needed=[0,1,2,3].map(seat=>handsBefore.get(seat).length-(seat===0?1:0));
  const expectedDraws=new Map([0,1,2,3].map(seat=>[
    seat,holder(state,seat).deck.slice(0,needed[seat]).map(card=>card.uid)
  ]));
  return {state,before,spell,handsBefore,needed,expectedDraws};
}

test('Card Destruction discards and redraws all four physical 2v2 hands independently',()=>{
  const {state:initial,before,spell,handsBefore,needed,expectedDraws}=setup();
  const publicBefore=tag.publicTagDuel(initial);
  for(const uids of handsBefore.values())for(const uid of uids){
    assert.ok(!JSON.stringify(publicBefore).includes(uid),
      'a physical hand UID must never appear in the public duel projection: '+uid);
  }
  const action=tag.tagActions(initial,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid
  );
  assert.ok(action,'the active physical seat must receive the legal Card Destruction activation');
  assert.deepEqual(tag.tagActions(initial,member(2)),[],
    'the inactive physical teammate cannot execute the Main Phase action');
  const unchanged=JSON.stringify(initial);
  assert.throws(()=>tag.stepTagDuel(initial,member(2),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(initial),unchanged,
    'a rejected inactive-seat action must not mutate any physical hand');

  const state=tag.stepTagDuel(initial,member(0),action);
  assert.equal(state.core.phase,'main','Card Destruction resolves immediately when no legal response exists');
  for(let seat=0;seat<4;seat++){
    const hand=tag.tagMemberHand(state,member(seat));
    assert.equal(hand.length,needed[seat],
      'physical seat '+seat+' must draw exactly as many cards as it discarded');
    assert.deepEqual(hand.map(card=>card.uid),expectedDraws.get(seat),
      'physical seat '+seat+' must draw from its own Deck, not its teammate Deck');
    assert.ok(hand.every(card=>card.uid.startsWith('m'+seat+':')),
      'physical seat '+seat+' must never receive a teammate card');
    const team=seat%2;
    for(const uid of handsBefore.get(seat)){
      assert.ok(state.core.players[team].grave.some(card=>card.uid===uid),
        'the shared team Graveyard must receive the discarded physical hand card: '+uid);
    }
  }
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid),
    'Card Destruction itself must enter the activating team Graveyard');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});


test('Card Destruction awards the duel to the opposing team when one physical teammate cannot redraw',()=>{
  const {state:initial,spell,handsBefore}=setup();
  const exhaustedSeat=3;
  const exhausted=holder(initial,exhaustedSeat);
  const stranded=exhausted.deck.splice(0);
  initial.core.players[1].grave.push(...stranded);
  assert.equal(exhausted.deck.length,0,'the inactive physical seat 3 Deck is intentionally exhausted');
  assert.doesNotThrow(()=>tag.assertTagDuel(initial));
  const before=inventorySnapshot(initial);

  const action=tag.tagActions(initial,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid
  );
  assert.ok(action,'the active physical seat must still be able to activate Card Destruction');
  const state=tag.stepTagDuel(initial,member(0),action);
  assert.equal(state.core.phase,'finished','a failed redraw ends the duel immediately');
  assert.equal(state.core.winner,state.core.players[0].id,
    'the team whose physical seat 3 could not redraw must lose, even though seat 1 had enough cards');
  assert.equal(tag.tagMemberHand(state,member(3)).length,0,
    'the exhausted physical seat must not receive cards from its teammate Deck');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===spell.uid),
    'Card Destruction remains in the activating team Graveyard');
  for(const seat of [0,1,2,3]){
    const team=seat%2;
    for(const uid of handsBefore.get(seat)){
      assert.ok(state.core.players[team].grave.some(card=>card.uid===uid),
        'the discarded hand remains in the correct shared Graveyard: '+uid);
    }
  }
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
