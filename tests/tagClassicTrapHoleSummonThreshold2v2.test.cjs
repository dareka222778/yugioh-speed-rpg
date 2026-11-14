'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel,getDestructionModel}=require('../dist/effectModels');

const TRAP_HOLE='04206964';
const MONSTER_REBORN='83764718';

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense)&&entry.card.level<=4);
const high=normal.filter(entry=>entry.card.atk>=1000).sort((a,b)=>a.card.atk-b.card.atk)[0];
const low=normal.filter(entry=>entry.card.atk<1000).sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(high,'Trap Hole needs a summonable Normal Monster with at least 1000 ATK');
assert.ok(low,'the negative fixture needs a summonable Normal Monster below 1000 ATK');
const deckIds=[...new Set([high.id,low.id,...normal.slice(0,8).map(entry=>entry.id)])];
assert.ok(deckIds.length>=8,'the 2v2 fixture needs eight certified Normal Monsters');

function member(seat){return 'm172-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
  assert.ok(ids.length>=8);
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
  throw new Error('M172 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function snapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Trap Hole must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function setup(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M172 Seat '+seat,
    cards:deck(seat===3?[TRAP_HOLE]:seat===0?[MONSTER_REBORN]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  const physicalTrap=takeCard(state,3,TRAP_HOLE);
  const trap={...physicalTrap,faceUp:false,setTurn:0};
  state.core.players[1].backrow.push(trap);
  assert.match(trap.uid,/^m3:/,'the Set Trap must retain inactive partner seat 3 physical ownership');
  tag.assertTagDuel(state);
  return {state,trap,before:snapshot(state)};
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Trap Hole response chain must terminate');
    const responder=tag.tagDecisionMember(state);
    const pass=tag.tagActions(state,responder.id).find(action=>action.kind==='pass');
    assert.ok(pass,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,responder.id,pass);
  }
  return state;
}
function normalSummon(state,entry){
  const monster=ensureInHand(state,0,entry.id);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='summon'&&candidate.card===monster.uid&&candidate.position==='atk'
  );
  assert.ok(action,'the physical owner must receive the legal Normal Summon');
  return {state:tag.stepTagDuel(state,member(0),action),monster};
}
function activateTrap(state,trap,monster){
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1),'the active defending teammate receives response priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],'the inactive physical Trap owner cannot submit the response');
  const action=tag.tagActions(state,member(1)).find(candidate=>
    candidate.kind==='trap'&&candidate.card===trap.uid&&candidate.target===monster.uid
  );
  assert.ok(action,'the active defender must activate the inactive partner Set Trap against the summoned monster');
  return settle(tag.stepTagDuel(state,member(1),action));
}
function assertDestroyedToTeamGrave(state,trap,monster,before){
  assert.ok(state.core.players[0].grave.some(card=>card.uid===monster.uid&&card.id===monster.id),
    'Trap Hole destroys the summoned monster into its own team Graveyard');
  assert.ok(!state.core.players[0].banished.some(card=>card.uid===monster.uid),
    'Trap Hole destroys; it does not banish');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===trap.uid&&card.id===TRAP_HOLE),
    'the activated Trap enters the defending team shared Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
}

test('Trap Hole is a 1000 ATK Normal/Flip Summon response that destroys instead of banishing',()=>{
  const effect=getEffect(TRAP_HOLE);
  assert.equal(getPlayableCard(TRAP_HOLE)?.kind,'trap');
  assert.equal(effect?.kind,'trapHole');
  assert.deepEqual(getActivationModel(effect),{
    speed:2,window:'summoned',damage:'never',opponentOnly:true,
    summonKinds:['summon','flip'],minimumSummonAtk:1000
  });
  assert.deepEqual(getDestructionModel(effect),{
    operation:'destroyMonsters',scope:'selected',destination:'grave',faceUp:true
  });
  assert.equal(getPlayableCard(MONSTER_REBORN)?.kind,'spell');
});

test('active defender uses inactive teammate-owned Trap Hole against an opposing Normal Summon',()=>{
  let {state,trap,before}=setup('m172-normal-summon-positive');
  const summoned=normalSummon(state,high);
  state=activateTrap(summoned.state,trap,summoned.monster);
  assertDestroyedToTeamGrave(state,trap,summoned.monster,before);
});

test('active defender uses inactive teammate-owned Trap Hole against an opposing Flip Summon',()=>{
  let {state,trap,before}=setup('m172-flip-summon-positive');
  const card=takeCard(state,0,high.id);
  const monster={...card,owner:0,position:'def',faceUp:false,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[0].monsters.push(monster);
  tag.assertTagDuel(state);
  const flip=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='position'&&candidate.card===monster.uid&&candidate.mode==='flip'
  );
  assert.ok(flip,'a face-down monster can be Flip Summoned by its physical active controller');
  state=tag.stepTagDuel(state,member(0),flip);
  assert.equal(state.core.phase,'response');
  state=activateTrap(state,trap,monster);
  assertDestroyedToTeamGrave(state,trap,monster,before);
});

test('Trap Hole does not activate against a Normal Summon below 1000 ATK',()=>{
  let {state,trap,before}=setup('m172-normal-summon-below-threshold');
  const summoned=normalSummon(state,low);
  state=summoned.state;
  assert.equal(state.core.phase,'main','an ineligible summon resolves without opening a response chain');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===summoned.monster.uid),
    'the below-threshold monster remains on the shared field');
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===trap.uid),
    'the unused Set Trap remains on the shared field');
  assert.deepEqual(tag.tagActions(state,member(1)),[]);
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Trap Hole does not respond to a Special Summon from Monster Reborn',()=>{
  let {state,trap,before}=setup('m172-special-summon-excluded');
  const graveMonster=takeCard(state,0,high.id);
  state.core.players[0].grave.push(graveMonster);
  const reborn=ensureInHand(state,0,MONSTER_REBORN);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===reborn.uid&&candidate.target===graveMonster.uid
  );
  assert.ok(action,'the active player must be able to activate Monster Reborn on its own Graveyard monster');
  state=tag.stepTagDuel(state,member(0),action);
  if(state.core.phase==='response'){
    assert.equal(tag.tagDecisionMember(state).id,member(1));
    assert.ok(!tag.tagActions(state,member(1)).some(candidate=>
      candidate.kind==='trap'&&candidate.card===trap.uid&&candidate.target===graveMonster.uid
    ),'Trap Hole must not offer a Special Summon target');
    state=settle(state);
  }
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===graveMonster.uid),
    'Monster Reborn successfully Special Summons the monster');
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===trap.uid),
    'Trap Hole remains Set after a Special Summon');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
