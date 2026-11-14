'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const GORA_TURTLE='80233946';
const BLUE_EYES='89631139';
const CELTIC_GUARDIAN='91152256';

assert.deepEqual(getMonsterEffect(GORA_TURTLE)?.operation,{
  kind:'continuous',
  rules:[{
    kind:'preventAttack',
    filter:{controller:'both',minimumCurrentAtk:1900},
    declarationOnly:true
  }]
});
assert.equal(getPlayableCard(GORA_TURTLE)?.atk,1100);
assert.equal(getPlayableCard(BLUE_EYES)?.atk,3000);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the 2v2 fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm177-seat-'+seat;}
function deck(){
  const ids=[...new Set([GORA_TURTLE,BLUE_EYES,CELTIC_GUARDIAN,...normalIds])];
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(first,seed){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M177 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first,seed});
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
  throw new Error('M177 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,faceUp=true,position='atk'){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function startBattle(state){
  const actor=tag.tagDecisionMember(state).id;
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active physical teammate must be able to enter the Battle Phase');
  return tag.stepTagDuel(state,actor,action);
}
function attackActions(state){
  const actor=tag.tagDecisionMember(state).id;
  return tag.tagActions(state,actor).filter(action=>action.kind==='attack');
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card Decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all physical UIDs must be unique');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'continuous attack restrictions must not alter inventory');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'continuous attack restrictions must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function fixture(first,faceUp,seed){
  const state=game(first,seed);
  const before=inventorySnapshot(state);
  const source=deploy(state,2,GORA_TURTLE,faceUp,faceUp?'atk':'def');
  const highSeat=first===0?0:3;
  const high=deploy(state,highSeat,BLUE_EYES);
  const low=deploy(state,1,CELTIC_GUARDIAN);
  assert.match(source.uid,/^m2:/,'Gora Turtle must retain inactive seat 2 physical ownership');
  assert.ok(high.uid.startsWith('m'+highSeat+':'),'the high-ATK monster must retain its physical owner UID');
  assert.match(low.uid,/^m1:/,'the below-threshold monster must retain seat 1 physical ownership');
  return {state:startBattle(state),before,source,high,low};
}

test('face-up Gora Turtle prevents a 3000 ATK monster on its own team from attacking in 2v2',()=>{
  const {state,before,source,high}=fixture(0,true,'m177-own-team');
  const actions=attackActions(state);
  assert.ok(!actions.some(action=>action.card===high.uid),
    'a face-up Gora Turtle on the shared field also suppresses its controller team high-ATK attacks');
  tag.assertTagDuel(state);
  assertConserved(state,before);
  assert.match(source.uid,/^m2:/);
});

test('face-up Gora Turtle prevents partner-owned 3000 ATK attacks on the opposing 2v2 team while 1400 ATK remains legal',()=>{
  const {state,before,source,high,low}=fixture(1,true,'m177-opposing-team');
  const actions=attackActions(state);
  assert.ok(!actions.some(action=>action.card===high.uid),
    'the global continuous lock must apply to the inactive opposing teammate physical monster');
  assert.ok(actions.some(action=>action.card===low.uid),
    'a 1400 ATK monster remains able to declare an attack below the 1900 threshold');
  tag.assertTagDuel(state);
  assertConserved(state,before);
  assert.match(source.uid,/^m2:/);
});

test('face-down Gora Turtle does not apply its continuous attack lock',()=>{
  const {state,before,source,high,low}=fixture(1,false,'m177-facedown-source');
  const actions=attackActions(state);
  assert.ok(actions.some(action=>action.card===high.uid),
    'a face-down continuous-effect source must not suppress a 3000 ATK attack');
  assert.ok(actions.some(action=>action.card===low.uid),
    'a 1400 ATK attack remains legal when the source is face-down');
  tag.assertTagDuel(state);
  assertConserved(state,before);
  assert.match(source.uid,/^m2:/);
});
