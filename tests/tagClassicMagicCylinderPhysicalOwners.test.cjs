'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const MAGIC_CYLINDER='62279055';
assert.ok(getPlayableCard(MAGIC_CYLINDER)?.kind==='trap','Magic Cylinder must be certified and playable');
assert.equal(getEffect(MAGIC_CYLINDER)?.kind,'attackResponse');
assert.equal(getActivationModel(getEffect(MAGIC_CYLINDER))?.speed,2);
assert.equal(getActivationModel(getEffect(MAGIC_CYLINDER))?.window,'attackDeclared');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const attackerEntry=normal.find(entry=>entry.card.atk>=1000);
assert.ok(attackerEntry,'the fixture needs a Normal Monster with positive ATK');
const normalIds=normal.slice(0,7).map(entry=>entry.id);
if(!normalIds.includes(attackerEntry.id))normalIds[0]=attackerEntry.id;

function member(seat){return 'm133-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
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
  throw new Error('M133 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
  assert.equal(cards.length,before.size,'Magic Cylinder must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Magic Cylinder response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('active 2v2 defender activates an inactive teammate Magic Cylinder against the shared attacker',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M133 Seat '+seat,
    cards:deck(seat===3?[MAGIC_CYLINDER]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m133-magic-cylinder-physical-owners'});
  const attacker=deploy(state,2,attackerEntry.id);
  const cylinderCard=takeCard(state,3,MAGIC_CYLINDER);
  const cylinder={...cylinderCard,setTurn:0,faceUp:false};
  state.core.players[1].backrow.push(cylinder);
  state.core.turn=3;
  state.core.phase='battle';
  assert.match(attacker.uid,/^m2:/,'the attacking monster belongs physically to inactive seat 2');
  assert.match(cylinder.uid,/^m3:/,'Magic Cylinder belongs physically to inactive seat 3');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const publicBefore=tag.publicTagDuel(state);
  assert.ok(!JSON.stringify(publicBefore).includes(MAGIC_CYLINDER),'the set Trap identity must remain private');
  assert.ok(!JSON.stringify(publicBefore).includes(cylinder.uid),'the set Trap UID must remain private');

  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid
  );
  assert.ok(attack,'active seat 0 may attack with a monster physically owned by its teammate');
  state=tag.stepTagDuel(state,member(0),attack);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical defender receives the attack response window');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'inactive physical Trap owner seat 3 cannot submit the response');
  const activate=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===cylinder.uid
  );
  assert.ok(activate,'active seat 1 may activate the inactive teammate Magic Cylinder');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),activate),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'rejected inactive-seat response must not mutate the chain');

  state=tag.stepTagDuel(state,member(1),activate);
  state=settle(state);
  assert.equal(state.core.phase,'battle','Magic Cylinder negates the attack without ending the Battle Phase');
  assert.equal(state.core.players[0].lp,4000-attackerEntry.card.atk,
    'the attacking shared team receives damage equal to the current attacker ATK');
  assert.equal(state.core.players[1].lp,4000,'the defending team does not pay LP');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid),
    'the attacker remains on the shared field after its attack is negated');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===cylinder.uid),
    'the Trap enters the defending shared Graveyard with its physical seat 3 UID');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
