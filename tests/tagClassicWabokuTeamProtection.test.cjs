'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const WABOKU='12607053';
const waboku=getPlayableCard(WABOKU);
assert.ok(waboku&&waboku.kind==='trap','Waboku must be an enabled Trap');
assert.equal(getEffect(WABOKU)?.kind,'waboku');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk));
assert.ok(normal.length>=7,'the Waboku fixture needs seven certified Normal Monsters');
const attackerEntry=normal.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const defenderEntry=normal
  .filter(entry=>entry.id!==attackerEntry.id)
  .reduce((best,current)=>current.card.atk<best.card.atk?current:best);
assert.notEqual(attackerEntry.id,defenderEntry.id);
assert.ok(attackerEntry.card.atk>defenderEntry.card.atk,
  'the unprotected fixture must represent a battle that would destroy the defender');
const deckIds=[...new Set([attackerEntry.id,defenderEntry.id,...normal.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);

function member(seat){return 'm105-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
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
  throw new Error('M105 fixture card missing from physical seat '+seat+': '+id);
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique before battle');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Waboku must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Waboku must not duplicate physical UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function setup(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M105 Seat '+seat,
    cards:deck(seat===3?[WABOKU]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m105-waboku-team-protection'});
  const before=inventorySnapshot(state);
  const attackerCard=takeCard(state,0,attackerEntry.id);
  const attacker={...attackerCard,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  const defenderCard=takeCard(state,1,defenderEntry.id);
  const defender={...defenderCard,owner:1,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  const wabokuCard=takeCard(state,3,WABOKU);
  const trap={...wabokuCard,setTurn:0,faceUp:false};
  state.core.players[0].monsters.push(attacker);
  state.core.players[1].monsters.push(defender);
  state.core.players[1].backrow.push(trap);
  state.core.turn=3;
  assert.match(attacker.uid,/^m0:/,'attacker must retain seat 0 physical ownership');
  assert.match(defender.uid,/^m1:/,'defender must retain seat 1 physical ownership');
  assert.match(trap.uid,/^m3:/,'Waboku must retain inactive seat 3 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,attacker,defender,trap};
}
function declareAttack(state,attacker,defender){
  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle,'the active attacking seat must enter the Battle Phase');
  state=settle(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===defender.uid
  );
  assert.ok(attack,'the active teammate must be able to attack the opposing monster');
  return tag.stepTagDuel(state,member(0),attack);
}

test('inactive teammate-owned Waboku protects the shared team from battle damage and destruction',()=>{
  const {state:initial,before,attacker,defender,trap}=setup();
  const publicBefore=tag.publicTagDuel(initial);
  assert.ok(!JSON.stringify(publicBefore).includes(WABOKU),
    'the opposing set Trap identity must remain hidden before activation');
  assert.ok(!JSON.stringify(publicBefore).includes(trap.uid),
    'the opposing set Trap physical UID must remain hidden before activation');

  let state=declareAttack(initial,attacker,defender);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical defender receives response priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical owner of Waboku must not receive response actions');
  const response=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===trap.uid
  );
  assert.ok(response,'the active teammate must activate the inactive partner set Waboku');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),response),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'the inactive Trap owner must not mutate the response chain');

  state=settle(tag.stepTagDuel(state,member(1),response));
  assert.equal(state.core.players[1].battleProtectedUntil,state.core.turn,
    'Waboku protection must be recorded on the defending team, not the physical seat');
  assert.equal(state.core.players[0].lp,4000,
    'Waboku must prevent battle damage to the attacking monster controller only when appropriate; the defender team LP remains unchanged');
  assert.equal(state.core.players[1].lp,4000,
    'the defending team must take no battle damage');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===defender.uid),
    'the defending teammate monster must not be destroyed by battle');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid),
    'the attacking monster remains on the field');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===trap.uid),
    'the activated Waboku must move to the shared defending-team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
