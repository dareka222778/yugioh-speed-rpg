'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const MIRROR_FORCE='44095762';
assert.ok(getPlayableCard(MIRROR_FORCE)?.kind==='trap','Mirror Force must be certified and playable');
assert.equal(getEffect(MIRROR_FORCE)?.kind,'mirrorForce');
assert.equal(getActivationModel(getEffect(MIRROR_FORCE))?.speed,2);
assert.equal(getActivationModel(getEffect(MIRROR_FORCE))?.window,'attackDeclared');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm134-seat-'+seat;}
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
  throw new Error('M134 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position='atk'){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
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
  assert.equal(cards.length,before.size,'Mirror Force must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Mirror Force response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('active 2v2 defender Mirror Force destroys only opposing Attack Position monsters across both physical seats',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M134 Seat '+seat,
    cards:deck(seat===2?[MIRROR_FORCE]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:3,seed:'m134-mirror-force-shared-team-scope'});
  const friendlyTarget=deploy(state,0,normal[0].id);
  const friendlyAlly=deploy(state,2,normal[1].id);
  const attacker=deploy(state,1,normal[2].id);
  const opposingAlly=deploy(state,3,normal[3].id);
  const opposingDefense=deploy(state,1,normal[4].id,'def');
  const mirrorCard=takeCard(state,2,MIRROR_FORCE);
  const mirror={...mirrorCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(mirror);
  state.core.turn=3;
  assert.match(friendlyTarget.uid,/^m0:/);
  assert.match(friendlyAlly.uid,/^m2:/);
  assert.match(attacker.uid,/^m1:/);
  assert.match(opposingAlly.uid,/^m3:/);
  assert.match(opposingDefense.uid,/^m1:/);
  assert.match(mirror.uid,/^m2:/,'Mirror Force must retain inactive teammate seat 2 ownership');
  assert.equal(tag.tagDecisionMember(state).id,member(3),'team 1 seat 3 starts the turn');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const publicBefore=tag.publicTagDuel(state);
  assert.ok(!JSON.stringify(publicBefore).includes(MIRROR_FORCE),'the set Trap identity must remain private');
  assert.ok(!JSON.stringify(publicBefore).includes(mirror.uid),'the set Trap UID must remain private');

  const battle=tag.tagActions(state,member(3)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settle(tag.stepTagDuel(state,member(3),battle));
  const attack=tag.tagActions(state,member(3)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===friendlyTarget.uid
  );
  assert.ok(attack,'active seat 3 must attack with its inactive teammate seat 1 monster');
  state=tag.stepTagDuel(state,member(3),attack);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(0),
    'the active physical defender receives attack-response priority');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'inactive physical Mirror Force owner seat 2 cannot submit the response');
  const activate=tag.tagActions(state,member(0)).find(action=>
    action.kind==='trap'&&action.card===mirror.uid
  );
  assert.ok(activate,'active seat 0 may activate the inactive teammate Mirror Force');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(2),activate),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'rejected inactive-seat activation must not mutate the chain');

  state=settle(tag.stepTagDuel(state,member(0),activate));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===friendlyTarget.uid),
    'Mirror Force must not destroy the defending team target');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===friendlyAlly.uid),
    'Mirror Force must not destroy the defending inactive teammate monster');
  assert.deepEqual(state.core.players[1].monsters.map(card=>card.uid),[opposingDefense.uid],
    'all opposing Attack Position monsters are destroyed while the Defense Position monster survives');
  for(const card of [attacker,opposingAlly]){
    assert.ok(state.core.players[1].grave.some(entry=>entry.uid===card.uid),
      'the opposing shared Graveyard receives physical attacker '+card.uid);
  }
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===opposingDefense.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===mirror.uid),
    'the activated Mirror Force enters the defending shared Graveyard');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
