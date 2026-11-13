'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const FISSURE='66788016';
assert.ok(getPlayableCard(FISSURE)?.kind==='spell');
assert.equal(getEffect(FISSURE)?.kind,'fissure');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const low=normal.reduce((best,current)=>current.card.atk<best.card.atk?current:best);
const high=normal.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const ally=normal.find(entry=>entry.id!==low.id&&entry.id!==high.id);
assert.ok(low.card.atk<high.card.atk,'the Fissure fixture needs distinct lowest and highest ATK');
assert.ok(ally,'the Fissure fixture needs a distinct allied monster');
const deckIds=[...new Set([low.id,high.id,ally.id,...normal.map(entry=>entry.id)])].slice(0,7);
function member(seat){return 'm116-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
  assert.ok(ids.length>=3);
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
  throw new Error('M116 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain Fissure');
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
  assert.equal(cards.length,before.size,'Fissure must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Fissure response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('Fissure selects the lowest face-up ATK monster across both opposing physical seats only',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M116 Seat '+seat,
    cards:deck(seat===0?[FISSURE]:seat===1?[high.id]:seat===2?[ally.id]:[low.id])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m116-fissure-opponent-team-minimum'});
  const before=inventorySnapshot(state);
  const fissure=ensureInHand(state,0,FISSURE);
  const allied=deploy(state,2,ally.id);
  const opposingHigh=deploy(state,1,high.id);
  const opposingLow=deploy(state,3,low.id);
  const opposingHidden=deploy(state,3,low.id,{faceUp:false,position:'def'});
  state.core.turn=3;
  assert.match(fissure.uid,/^m0:/);
  assert.match(allied.uid,/^m2:/);
  assert.match(opposingHigh.uid,/^m1:/);
  assert.match(opposingLow.uid,/^m3:/);
  assert.match(opposingHidden.uid,/^m3:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===fissure.uid
  );
  assert.ok(action,'the active physical seat must receive the legal Fissure activation');
  state=tag.stepTagDuel(state,member(0),action);
  state=settle(state);
  assert.equal(state.core.phase,'main');
  assert.deepEqual(state.core.players[0].monsters.map(card=>card.uid),[allied.uid],
    'Fissure must not destroy a monster controlled by the activating team');
  assert.deepEqual(state.core.players[1].monsters.map(card=>card.uid),[opposingHigh.uid,opposingHidden.uid],
    'Fissure must destroy only the lowest face-up ATK monster across both opposing seats');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opposingLow.uid),
    'the destroyed physical seat 3 monster must enter the opposing shared Graveyard');
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===opposingHidden.uid),
    'a face-down monster is not eligible for Fissure');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fissure.uid));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
