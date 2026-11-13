'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const CASES=[
  {id:'76103675',name:'Sparks',kind:'burn',amount:200,lp:[4000,4000],expected:[4000,3800]},
  {id:'46130346',name:'Hinotama',kind:'burn',amount:500,lp:[4000,4000],expected:[4000,3500]},
  {id:'20871001',name:'Blue Medicine',kind:'heal',amount:400,lp:[4500,4000],expected:[4900,4000]},
  {id:'47852924',name:'Soul of the Pure',kind:'heal',amount:800,lp:[4500,4000],expected:[5300,4000]}
];
for(const entry of CASES){
  assert.ok(getPlayableCard(entry.id)?.kind==='spell',entry.name+' must be certified and playable');
  assert.equal(getEffect(entry.id)?.kind,entry.kind,entry.name+' must use its registered economic effect');
  assert.equal(getEffect(entry.id)?.amount,entry.amount,entry.name+' must preserve its registered amount');
}

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm132-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
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
  throw new Error('M132 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'direct LP spells must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function setup(entry){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M132 Seat '+seat,
    cards:deck(seat===0?[entry.id]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m132-'+entry.id});
  const spell=takeCard(state,0,entry.id);
  holder(state,0).hand.push(spell);
  state.core.turn=3;
  state.core.players[0].lp=entry.lp[0];
  state.core.players[1].lp=entry.lp[1];
  assert.match(spell.uid,/^m0:/,entry.name+' must retain seat 0 physical ownership');
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
for(const entry of CASES)test(entry.name+' applies its exact LP change to the correct shared 2v2 team',()=>{
  const {state:initial,spell,before,handsBefore,decksBefore}=setup(entry);
  const action=tag.tagActions(initial,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid
  );
  assert.ok(action,'active physical seat 0 must receive the legal '+entry.name+' activation');
  assert.deepEqual(tag.tagActions(initial,member(2)),[],
    'inactive physical teammate cannot execute the Main Phase action');
  const state=tag.stepTagDuel(initial,member(0),action);
  assert.equal(state.core.phase,'main',entry.name+' resolves immediately without a legal response');
  assert.deepEqual(state.core.players.map(player=>player.lp),entry.expected,
    entry.name+' must mutate the shared team LP, not an individual physical player');
  assert.deepEqual(tag.tagMemberHand(state,member(0)).map(card=>card.uid),
    handsBefore.get(0).filter(uid=>uid!==spell.uid),
    entry.name+' must consume only its physical source card');
  assert.deepEqual(holder(state,0).deck.map(card=>card.uid),decksBefore.get(0),
    entry.name+' must not draw or mill the active physical Deck');
  for(const seat of [1,2,3]){
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),handsBefore.get(seat),
      entry.name+' must not mutate physical seat '+seat+' hand');
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),decksBefore.get(seat),
      entry.name+' must not mutate physical seat '+seat+' Deck');
  }
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid),
    entry.name+' must enter the activating team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
