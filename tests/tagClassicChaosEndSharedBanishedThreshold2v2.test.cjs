'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const CHAOS_END='61044390';
assert.equal(getPlayableCard(CHAOS_END)?.englishName,'Chaos End');
assert.equal(getEffect(CHAOS_END)?.kind,'conditionalDestruction');
assert.equal(getEffect(CHAOS_END)?.minBanished,7);
assert.equal(getEffect(CHAOS_END)?.zone,'monsters');
assert.equal(getEffect(CHAOS_END)?.scope,'all');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Chaos End fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm202-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M202 Seat '+seat,cards:deck([CHAOS_END])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  return state;
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
  throw new Error('M202 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const card=takeCard(state,seat,id);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function banishFromPhysicalSeats(state,counts){
  const moved=[];
  for(const [seat,count] of counts){
    for(let index=0;index<count;index++){
      const card=takeCard(state,seat,normalIds[index]);
      moved.push(card);
    }
  }
  state.core.players[0].banished.push(...moved);
  return moved;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Chaos End response chain must terminate');
    const seat=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,seat).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,seat,pass);
  }
  return state;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all physical UIDs must be unique');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Chaos End must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Chaos End must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Chaos End activates at seven team-banished cards contributed by both physical teammates and destroys all monsters',()=>{
  let state=game('m202-chaos-end-seven-shared');
  const source=ensureInHand(state,0,CHAOS_END);
  const banished=banishFromPhysicalSeats(state,[[0,3],[2,4]]);
  const monsters=[
    deploy(state,0,normalIds[4]),
    deploy(state,2,normalIds[5],{position:'def'}),
    deploy(state,1,normalIds[6],{faceUp:false,position:'def'}),
    deploy(state,3,normalIds[7])
  ];
  const before=inventorySnapshot(state);
  assert.equal(state.core.players[0].banished.length,7,
    'the shared team banished zone contains exactly seven cards from physical seats 0 and 2');
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===source.uid
  );
  assert.ok(action,'the active physical teammate can activate Chaos End at the exact seven-card threshold');
  state=settle(tag.stepTagDuel(state,member(0),action));
  assert.deepEqual(state.core.players[0].monsters,[],
    'Chaos End destroys both teammates monsters, including Defense Position monsters');
  assert.deepEqual(state.core.players[1].monsters,[],
    'Chaos End destroys both opposing teammates monsters, including face-down monsters');
  for(const card of monsters){
    assert.ok(state.core.players[Number(card.owner)].grave.some(entry=>entry.uid===card.uid),
      'every destroyed monster enters its shared team Graveyard: '+card.uid);
  }
  assert.deepEqual(state.core.players[0].banished.map(card=>card.uid),banished.map(card=>card.uid),
    'the seven pre-existing banished physical cards remain banished');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid&&card.id===CHAOS_END));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Chaos End is unavailable with six team-banished cards even when they are split between both physical teammates',()=>{
  let state=game('m202-chaos-end-six-shared');
  const source=ensureInHand(state,0,CHAOS_END);
  banishFromPhysicalSeats(state,[[0,3],[2,3]]);
  const own=deploy(state,0,normalIds[3]);
  const opponent=deploy(state,3,normalIds[4]);
  assert.equal(state.core.players[0].banished.length,6);
  assert.ok(!tag.tagActions(state,member(0)).some(action=>
    action.kind==='spell'&&action.card===source.uid
  ),'the shared team must have at least seven banished cards');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===own.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===opponent.uid));
  assert.ok(holder(state,0).hand.some(card=>card.uid===source.uid),
    'an ineligible Chaos End remains in the active physical hand');
  tag.assertTagDuel(state);
});
