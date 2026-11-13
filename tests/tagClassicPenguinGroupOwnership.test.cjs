'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getMonsterEffect}=require('../dist/effectRegistry');

const PENGUIN_SOLDIER='93920745';
const penguin=getPlayableCard(PENGUIN_SOLDIER);
const penguinEffect=getMonsterEffect(PENGUIN_SOLDIER);
assert.ok(penguin&&penguin.kind==='monster');
assert.equal(penguinEffect?.trigger,'flip');
assert.deepEqual(penguinEffect?.operation,{kind:'targetGroup',rule:{from:'monsters',action:'returnHand',minimum:1,maximum:2}});

const normalCards=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.level<=4&&Number.isInteger(entry.card.atk));
const weak=normalCards
  .filter(entry=>entry.card.atk>0&&entry.card.atk<(penguin.defense??0))
  .sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(weak,'Penguin Soldier fixture needs an attacker below its Defense');
const partner=normalCards.find(entry=>entry.id!==weak.id);
assert.ok(partner,'Penguin Soldier fixture needs a second distinct monster');
const deckIds=[...new Set([weak.id,partner.id,...normalCards.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);
function normalDeck(){return Array.from({length:20},(_,index)=>deckIds[index%deckIds.length]);}
function member(seat){return 'm83-seat-'+seat;}
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
  throw new Error('M83 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position,faceUp=true){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,setTurn:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function settleResponses(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass);
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function act(state,seat,target){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='choose'&&candidate.target===target);
  assert.ok(action,'seat '+seat+' must have legal group choice '+target);
  return tag.stepTagDuel(state,member(seat),action);
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

test('Penguin Soldier returns two shared-field monsters to their separate physical owners in 2v2',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M83 Seat '+seat,
    cards:seat===3?[PENGUIN_SOLDIER,...normalDeck().slice(1)]:normalDeck()
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m83-penguin-target-group'});
  const before=inventorySnapshot(state);
  const attacker=deploy(state,0,weak.id,'atk');
  const partnerMonster=deploy(state,2,partner.id,'atk');
  const source=deploy(state,3,PENGUIN_SOLDIER,'def',false);
  state.core.turn=3;
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.match(partnerMonster.uid,/^m2:/);
  assert.match(source.uid,/^m3:/);

  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settleResponses(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===source.uid
  );
  assert.ok(attack);
  state=settleResponses(tag.stepTagDuel(state,member(0),attack));
  assert.equal(state.core.phase,'choice');
  assert.equal(tag.tagDecisionMember(state).id,member(1),'the active defending teammate controls the inactive partner FLIP trigger');

  const activate=tag.tagActions(state,member(1)).find(action=>action.kind==='choose'&&action.target===source.uid);
  assert.ok(activate,'the active teammate must be able to activate the optional Penguin Soldier FLIP effect');
  assert.deepEqual(tag.tagActions(state,member(3)),[],'the inactive physical source owner must not receive activation actions');
  state=tag.stepTagDuel(state,member(1),activate);

  const firstTarget=tag.tagActions(state,member(1)).find(action=>action.kind==='choose'&&action.target===attacker.uid);
  const secondTarget=tag.tagActions(state,member(1)).find(action=>action.kind==='choose'&&action.target===partnerMonster.uid);
  assert.ok(firstTarget&&secondTarget,'the target group must expose monsters from the active and inactive physical teammate');
  state=tag.stepTagDuel(state,member(1),firstTarget);
  state=act(state,1,partnerMonster.uid);
  state=act(state,1,'__done__');
  state=settleResponses(state);

  assert.ok(handUids(state,0).includes(attacker.uid),'the active teammate monster must return to that physical hand');
  assert.ok(handUids(state,2).includes(partnerMonster.uid),'the inactive teammate monster must return to its own physical hand');
  assert.ok(!state.core.players[0].monsters.some(card=>card.uid===attacker.uid||card.uid===partnerMonster.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===source.uid&&card.faceUp&&card.position==='def'));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
