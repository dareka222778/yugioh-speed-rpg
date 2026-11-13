'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getMonsterEffect}=require('../dist/effectRegistry');

const MASK_OF_DARKNESS='28933734';
const SPELL='38199696';
const TRAP='12607053';
const mask=getPlayableCard(MASK_OF_DARKNESS);
assert.ok(mask&&mask.kind==='monster');
assert.equal(getMonsterEffect(MASK_OF_DARKNESS)?.trigger,'flip');
assert.equal(getMonsterEffect(MASK_OF_DARKNESS)?.operation.kind,'recover');
assert.equal(getPlayableCard(SPELL)?.kind,'spell');
assert.equal(getPlayableCard(TRAP)?.kind,'trap');

const normalCards=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.level<=4&&Number.isInteger(entry.card.atk));
const weak=normalCards
  .filter(entry=>entry.card.atk>0&&entry.card.atk<(mask.defense??0))
  .sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(weak,'Mask of Darkness fixture needs an attacker below its Defense');
const deckIds=[...new Set([weak.id,...normalCards.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);
function normalDeck(){return Array.from({length:20},(_,index)=>deckIds[index%deckIds.length]);}
function member(seat){return 'm85-mask-seat-'+seat;}
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
  throw new Error('M85 Mask fixture card missing from physical seat '+seat+': '+id);
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
function handUids(state,seat){return tag.tagMemberHand(state,member(seat)).map(card=>card.uid);}
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

test('Mask of Darkness returns a shared-Graveyard Trap to its original inactive physical owner',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M85 Mask Seat '+seat,
    cards:seat===1?[SPELL,...normalDeck().slice(1)]
      :seat===3?[MASK_OF_DARKNESS,TRAP,...normalDeck().slice(2)]
      :normalDeck()
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m85-mask-of-darkness-owner'});
  const before=inventorySnapshot(state);

  const attackerCard=takeCard(state,0,weak.id);
  const attacker={...attackerCard,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[0].monsters.push(attacker);

  const sourceCard=takeCard(state,3,MASK_OF_DARKNESS);
  const source={...sourceCard,owner:1,position:'def',faceUp:false,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,setTurn:0};
  state.core.players[1].monsters.push(source);

  const trap=takeCard(state,3,TRAP);
  const spell=takeCard(state,1,SPELL);
  state.core.players[1].grave.push(trap,spell);
  state.core.turn=3;
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settleResponses(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===source.uid
  );
  assert.ok(attack);
  state=settleResponses(tag.stepTagDuel(state,member(0),attack));

  assert.equal(state.core.phase,'choice');
  assert.equal(tag.tagDecisionMember(state).id,member(1));
  const choices=tag.tagActions(state,member(1)).filter(action=>action.kind==='choose');
  assert.ok(choices.some(action=>action.target===trap.uid),'Mask of Darkness must offer a Trap from the shared Graveyard');
  assert.ok(!choices.some(action=>action.target===spell.uid),'Mask of Darkness must not offer a Spell');
  assert.deepEqual(tag.tagActions(state,member(3)),[]);
  const choose=choices.find(action=>action.target===trap.uid);
  state=settleResponses(tag.stepTagDuel(state,member(1),choose));

  assert.ok(handUids(state,3).includes(trap.uid),'the recovered Trap must return to its original physical owner hand');
  assert.ok(!handUids(state,1).includes(trap.uid),'the active teammate must not take the inactive partner Trap');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===spell.uid),'the unselected Spell must remain in the shared Graveyard');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===source.uid&&card.faceUp&&card.position==='def'));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
