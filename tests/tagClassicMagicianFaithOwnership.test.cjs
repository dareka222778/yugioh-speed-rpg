'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getMonsterEffect}=require('../dist/effectRegistry');

const MAGICIAN_OF_FAITH='31560081';
const INACTIVE_SPELL='38199696';
const ACTIVE_SPELL='38199696';
const TRAP='12607053';
const faith=getPlayableCard(MAGICIAN_OF_FAITH);
assert.ok(faith&&faith.kind==='monster');
assert.equal(getMonsterEffect(MAGICIAN_OF_FAITH)?.trigger,'flip');
assert.equal(getMonsterEffect(MAGICIAN_OF_FAITH)?.operation.kind,'recover');
assert.equal(getPlayableCard(INACTIVE_SPELL)?.kind,'spell');
assert.equal(getPlayableCard(TRAP)?.kind,'trap');

const normalCards=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.level<=4&&Number.isInteger(entry.card.atk));
const weak=normalCards
  .filter(entry=>entry.card.atk>0&&entry.card.atk<(faith.defense??0))
  .sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(weak,'Magician of Faith fixture needs an attacker below its Defense');
const deckIds=[...new Set([weak.id,...normalCards.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);
function normalDeck(){return Array.from({length:20},(_,index)=>deckIds[index%deckIds.length]);}
function member(seat){return 'm85-seat-'+seat;}
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
  throw new Error('M85 fixture card missing from physical seat '+seat+': '+id);
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

test('Magician of Faith returns a shared-Graveyard Spell to its original inactive physical owner',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M85 Seat '+seat,
    cards:seat===1?[ACTIVE_SPELL,...normalDeck().slice(1)]
      :seat===3?[MAGICIAN_OF_FAITH,INACTIVE_SPELL,TRAP,...normalDeck().slice(3)]
      :normalDeck()
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m85-magician-of-faith-owner'});
  const before=inventorySnapshot(state);

  const attackerCard=takeCard(state,0,weak.id);
  const attacker={...attackerCard,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[0].monsters.push(attacker);

  const sourceCard=takeCard(state,3,MAGICIAN_OF_FAITH);
  const source={...sourceCard,owner:1,position:'def',faceUp:false,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,setTurn:0};
  state.core.players[1].monsters.push(source);

  const inactiveSpell=takeCard(state,3,INACTIVE_SPELL);
  const activeSpell=takeCard(state,1,ACTIVE_SPELL);
  const trap=takeCard(state,3,TRAP);
  state.core.players[1].grave.push(inactiveSpell,activeSpell,trap);
  state.core.turn=3;
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.match(inactiveSpell.uid,/^m3:/);
  assert.match(activeSpell.uid,/^m1:/);

  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settleResponses(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===source.uid
  );
  assert.ok(attack);
  state=settleResponses(tag.stepTagDuel(state,member(0),attack));

  assert.equal(state.core.phase,'choice');
  assert.equal(tag.tagDecisionMember(state).id,member(1),'the active teammate controls the inactive partner FLIP trigger');
  const choices=tag.tagActions(state,member(1)).filter(action=>action.kind==='choose');
  assert.ok(choices.some(action=>action.target===inactiveSpell.uid),'the shared Graveyard Spell from the inactive physical partner must be retrievable');
  assert.ok(!choices.some(action=>action.target===trap.uid),'Magician of Faith must not retrieve a Trap');
  assert.deepEqual(tag.tagActions(state,member(3)),[],'the inactive physical source owner must not receive the target action');
  const choose=choices.find(action=>action.target===inactiveSpell.uid);
  state=settleResponses(tag.stepTagDuel(state,member(1),choose));

  assert.ok(handUids(state,3).includes(inactiveSpell.uid),'the recovered Spell must return to its original physical owner hand');
  assert.ok(!handUids(state,1).includes(inactiveSpell.uid),'the active teammate must not take the inactive partner card');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===activeSpell.uid),'the unselected active-owner Spell must remain in the shared Graveyard');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===trap.uid),'the Trap must remain in the shared Graveyard');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===source.uid&&card.faceUp&&card.position==='def'));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
