'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const MAGIC_CYLINDER='62279055';
const magicCylinder=getPlayableCard(MAGIC_CYLINDER);
assert.ok(magicCylinder&&magicCylinder.kind==='trap','Magic Cylinder must be an enabled Trap');
const cylinderEffect=getEffect(MAGIC_CYLINDER);
assert.equal(cylinderEffect?.kind,'attackResponse');
assert.equal(cylinderEffect?.activation?.speed,2);
assert.equal(cylinderEffect?.activation?.window,'attackDeclared');
assert.equal(cylinderEffect?.activation?.opponentOnly,true);
assert.equal(cylinderEffect?.reflectAttack,true);
assert.equal(cylinderEffect?.endBattle,false);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk));
assert.ok(normal.length>=7,'the Magic Cylinder fixture needs seven certified Normal Monsters');
const attackerEntry=normal.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const deckIds=[...new Set([attackerEntry.id,...normal.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);

function member(seat){return 'm104-seat-'+seat;}
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
  throw new Error('M104 fixture card missing from physical seat '+seat+': '+id);
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique before the attack');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Magic Cylinder must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Magic Cylinder must not duplicate physical UIDs');
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
    name:'M104 Seat '+seat,
    cards:deck(seat===3?[MAGIC_CYLINDER]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m104-magic-cylinder-physical-owner'});
  const before=inventorySnapshot(state);
  const attackerCard=takeCard(state,0,attackerEntry.id);
  const attacker={
    ...attackerCard,owner:0,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[0].monsters.push(attacker);
  const cylinderCard=takeCard(state,3,MAGIC_CYLINDER);
  const cylinder={...cylinderCard,setTurn:0,faceUp:false};
  state.core.players[1].backrow.push(cylinder);
  state.core.turn=3;
  assert.match(attacker.uid,/^m0:/,'the attacker must retain seat 0 physical ownership');
  assert.match(cylinder.uid,/^m3:/,'the Trap must retain inactive seat 3 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,attacker,cylinder};
}
function declareDirectAttack(state,attacker){
  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle,'the active attacking seat must enter the Battle Phase');
  state=settle(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===undefined
  );
  assert.ok(attack,'the active teammate must be able to declare a direct attack');
  return tag.stepTagDuel(state,member(0),attack);
}

test('inactive teammate-owned Magic Cylinder reflects the attack for the team and preserves physical ownership',()=>{
  const {state:initial,before,attacker,cylinder}=setup();
  const publicBefore=tag.publicTagDuel(initial);
  assert.ok(!JSON.stringify(publicBefore).includes(MAGIC_CYLINDER),
    'the opposing set Trap identity must remain hidden before activation');
  assert.ok(!JSON.stringify(publicBefore).includes(cylinder.uid),
    'the opposing set Trap physical UID must remain hidden before activation');

  let state=declareDirectAttack(initial,attacker);
  assert.equal(state.core.phase,'response','Magic Cylinder must open an attack-response window');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical member of the defending team owns response priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical owner of Magic Cylinder must not receive response actions');
  const response=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===cylinder.uid&&action.target===attacker.uid
  );
  assert.ok(response,'the active teammate must be allowed to activate the inactive partner set Trap');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),response),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'the inactive Trap owner must not mutate the response chain');

  state=settle(tag.stepTagDuel(state,member(1),response));
  assert.equal(state.core.phase,'battle',
    'Magic Cylinder negates the attack without ending the Battle Phase');
  assert.equal(state.core.players[0].lp,4000-attackerEntry.card.atk,
    'reflected battle damage must be applied to the attacking team LP');
  assert.equal(state.core.players[1].lp,4000,
    'the defending team must not receive battle damage from the negated direct attack');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid),
    'Magic Cylinder negates the attack but does not destroy the attacker');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===cylinder.uid),
    'the activated Trap must move to the shared defending-team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
