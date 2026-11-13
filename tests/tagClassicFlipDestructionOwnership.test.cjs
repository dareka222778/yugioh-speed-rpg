'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getMonsterEffect}=require('../dist/effectRegistry');

const FLIPS=[
  {id:'54652250',name:'Man-Eater Bug',target:'anyMonster'},
  {id:'45141844',name:'Old Vindictive Magician',target:'opponentMonster'}
];
const flipCards=FLIPS.map(entry=>({...entry,card:getPlayableCard(entry.id),effect:getMonsterEffect(entry.id)}));
for(const entry of flipCards){
  assert.ok(entry.card&&entry.card.kind==='monster',entry.name+' must be enabled');
  assert.equal(entry.effect?.trigger,'flip');
  assert.equal(entry.effect?.operation.kind,'destroy');
  assert.equal(entry.effect?.operation.target,entry.target);
}
const normalCards=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.level<=4&&Number.isInteger(entry.card.atk));
const weakestDefense=Math.min(...flipCards.map(entry=>entry.card.defense));
const weak=normalCards
  .filter(entry=>entry.card.atk>0&&entry.card.atk<weakestDefense)
  .sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(weak,'the FLIP destruction fixture needs an attacker below both FLIP DEF values');
const deckIds=[...new Set([weak.id,...normalCards.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);
function normalDeck(){return Array.from({length:20},(_,index)=>deckIds[index%deckIds.length]);}
function member(seat){return 'm82-seat-'+seat;}
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
  throw new Error('M82 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position,faceUp=true){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,
    owner:seat%2,
    position,
    faceUp,
    entered:0,
    changed:0,
    attacked:0,
    atkBoost:0,
    defBoost:0,
    setTurn:0
  };
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

for(const flip of flipCards)test('2v2 '+flip.name+' FLIP destruction is controlled by the active teammate and preserves target ownership',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M82 Seat '+seat,
    cards:seat===3?[flip.id,...normalDeck().slice(1)]:normalDeck()
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m82-'+flip.id});
  const before=inventorySnapshot(state);
  const attacker=deploy(state,0,weak.id,'atk');
  const target=deploy(state,2,normalCards.find(entry=>entry.id!==weak.id).id,'atk');
  const own=deploy(state,1,normalCards.find(entry=>entry.id!==weak.id&&entry.id!==target.id).id,'atk');
  const source=deploy(state,3,flip.id,'def',false);
  state.core.turn=3;
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.match(target.uid,/^m2:/);
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
  assert.equal(tag.tagDecisionMember(state).id,member(1),'the active physical teammate resolves the inactive partner FLIP trigger');

  const chooseActions=tag.tagActions(state,member(1)).filter(action=>action.kind==='choose');
  const selectable=new Set(chooseActions.map(action=>action.target));
  assert.ok(selectable.has(target.uid),'the inactive partner monster on the shared field must be a legal target');
  if(flip.target==='opponentMonster'){
    assert.ok(!selectable.has(own.uid),'Old Vindictive Magician must exclude its own team monster');
    assert.ok(!selectable.has(source.uid),'Old Vindictive Magician must exclude its own FLIP source');
  }else{
    assert.ok(selectable.has(own.uid),'Man-Eater Bug may target a monster on either team');
  }
  assert.deepEqual(tag.tagActions(state,member(3)),[],'the inactive physical source owner must not receive target-selection actions');
  const choose=chooseActions.find(action=>action.target===target.uid);
  assert.ok(choose);
  state=settleResponses(tag.stepTagDuel(state,member(1),choose));

  assert.ok(state.core.players[0].grave.some(card=>card.uid===target.uid&&card.id===target.id),
    'the selected inactive partner monster must be destroyed into the shared team Graveyard');
  assert.ok(!state.core.players[0].monsters.some(card=>card.uid===target.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===own.uid));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
