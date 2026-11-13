'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const WABOKU='12607053';
assert.ok(getPlayableCard(WABOKU)?.kind==='trap','Waboku must be an enabled Trap');
assert.equal(getEffect(WABOKU)?.kind,'waboku');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const ordered=[...normal].sort((a,b)=>a.card.atk-b.card.atk);
const low=ordered.find(entry=>ordered.some(other=>other.card.atk>entry.card.atk));
assert.ok(low,'the fixture needs a lower-ATK Normal Monster');
const high=ordered.find(entry=>entry.card.atk>low.card.atk);
assert.ok(high,'the fixture needs a higher-ATK Normal Monster');
const deckIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm126-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
  assert.ok(ids.length>=7);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain fixture card '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function takeCard(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M126 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Waboku must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Waboku response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('Waboku protects the shared team LP when the opposing teammate attacks an inactive teammate monster',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M126 Seat '+seat,
    cards:deck(seat===0?[WABOKU]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m126-waboku-team-damage-guard'});
  const trap=ensureInHand(state,0,WABOKU);
  const targetCard=takeCard(state,2,low.id);
  const attackerCard=takeCard(state,1,high.id);
  const target={...targetCard,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  const attacker={...attackerCard,owner:1,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[0].monsters.push(target);
  state.core.players[1].monsters.push(attacker);
  state.core.turn=0;
  const before=inventorySnapshot(state);
  assert.ok(high.card.atk>low.card.atk,'the attack would inflict battle damage without Waboku');
  assert.match(trap.uid,/^m0:/);
  assert.match(target.uid,/^m2:/,'the defending monster belongs physically to inactive seat 2');
  assert.match(attacker.uid,/^m1:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const set=tag.tagActions(state,member(0)).find(action=>action.kind==='set'&&action.card===trap.uid);
  assert.ok(set,'seat 0 must be able to Set Waboku');
  state=tag.stepTagDuel(state,member(0),set);
  assert.ok(!tag.tagActions(state,member(0)).some(action=>action.kind==='trap'&&action.card===trap.uid),
    'Waboku cannot be activated before an attack response window');
  const end=tag.tagActions(state,member(0)).find(action=>action.kind==='end');
  assert.ok(end);
  state=tag.stepTagDuel(state,member(0),end);
  assert.equal(state.cursor,1,'seat 1 becomes the active opponent');

  const battle=tag.tagActions(state,member(1)).find(action=>action.kind==='battle');
  assert.ok(battle,'seat 1 must be able to enter the Battle Phase');
  state=tag.stepTagDuel(state,member(1),battle);
  const attack=tag.tagActions(state,member(1)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===target.uid
  );
  assert.ok(attack,'seat 1 must be able to attack the weaker monster on the opposing shared field');
  state=tag.stepTagDuel(state,member(1),attack);
  assert.equal(state.core.phase,'response','the attack opens a response window for the defending team');
  assert.equal(tag.tagDecisionMember(state).id,member(0),
    'seat 0 is still the active physical representative for team 0');

  const activate=tag.tagActions(state,member(0)).find(action=>
    action.kind==='trap'&&action.card===trap.uid
  );
  assert.ok(activate,'seat 0 can activate its shared Waboku to protect the team');
  state=settle(tag.stepTagDuel(state,member(0),activate));
  assert.equal(state.core.players[0].lp,4000,
    'the shared defending team takes no battle damage even though the attacked monster belongs to seat 2');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===trap.uid),
    'Waboku enters the defending team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
