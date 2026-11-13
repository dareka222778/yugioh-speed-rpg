'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getMonsterEffect}=require('../dist/effectRegistry');

const SKELENGEL='60694662';
const skelengel=getPlayableCard(SKELENGEL);
assert.ok(skelengel&&skelengel.kind==='monster');
assert.equal(getMonsterEffect(SKELENGEL)?.trigger,'flip');
assert.equal(getMonsterEffect(SKELENGEL)?.operation.kind,'draw');

const normalCards=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.level<=4&&Number.isInteger(entry.card.atk));
const weak=normalCards
  .filter(entry=>entry.card.atk>0&&entry.card.atk<(skelengel.defense??0))
  .sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(weak,'Skelengel fixture needs a Normal Monster below its Defense');
const deckIds=[...new Set([weak.id,...normalCards.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);
function normalDeck(){return Array.from({length:20},(_,index)=>deckIds[index%deckIds.length]);}
function member(seat){return 'm84-seat-'+seat;}
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
  throw new Error('M84 fixture card missing from physical seat '+seat+': '+id);
}
function settleResponses(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass);
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function handUids(state,seat){return tag.tagMemberHand(state,member(seat)).map(card=>card.uid).sort();}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id);
}

test('Skelengel FLIP draws for the active teammate without changing the inactive source owner hand',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M84 Seat '+seat,
    cards:seat===3?[SKELENGEL,...normalDeck().slice(1)]:normalDeck()
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m84-skelengel-active-draw'});
  const before=inventorySnapshot(state);
  const attackerCard=takeCard(state,0,weak.id);
  const attacker={...attackerCard,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[0].monsters.push(attacker);
  const sourceCard=takeCard(state,3,SKELENGEL);
  const source={...sourceCard,owner:1,position:'def',faceUp:false,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,setTurn:0};
  state.core.players[1].monsters.push(source);
  state.core.turn=3;
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const activeHandBefore=handUids(state,1);
  const inactiveHandBefore=handUids(state,3);
  const activeDeckBefore=state.core.players[1].deck.length;
  const inactiveDeckBefore=state.reserves[3].deck.length;
  const drawnUid=state.core.players[1].deck[0]?.uid;
  assert.ok(drawnUid,'the active teammate must have a card to draw');

  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settleResponses(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===source.uid
  );
  assert.ok(attack);
  state=settleResponses(tag.stepTagDuel(state,member(0),attack));

  assert.ok(tag.tagMemberHand(state,member(1)).some(card=>card.uid===drawnUid),
    'the active physical representative of the controlling team must draw from its own Deck');
  assert.equal(handUids(state,1).length,activeHandBefore.length+1);
  assert.deepEqual(handUids(state,3),inactiveHandBefore,'the inactive physical source owner hand must remain unchanged');
  assert.equal(state.core.players[1].deck.length,activeDeckBefore-1);
  assert.equal(state.reserves[3].deck.length,inactiveDeckBefore,'the inactive partner Deck must not supply the draw');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===source.uid&&card.faceUp&&card.position==='def'));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
