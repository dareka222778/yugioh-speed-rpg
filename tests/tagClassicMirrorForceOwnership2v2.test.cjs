'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel,getDestructionModel}=require('../dist/effectModels');

const MIRROR_FORCE='44095762';
const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);
function member(seat){return 'm161-seat-'+seat;}
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
  throw new Error('M161 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function act(state,seat,kind,filter=()=>true){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind===kind&&filter(candidate));
  assert.ok(action,'seat '+seat+' needs '+kind+' in '+state.core.phase);
  return tag.stepTagDuel(state,member(seat),action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Mirror Force response chain must terminate');
    const seat=tag.tagDecisionMember(state).id;
    const action=tag.tagActions(state,seat).find(candidate=>candidate.kind==='pass');
    assert.ok(action,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,seat,action);
  }
  return state;
}
function snapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'all four physical 20-card decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Mirror Force must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function setup(first=0,seed='m161-mirror-force'){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M161 Seat '+seat,cards:deck(seat===3?[MIRROR_FORCE]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  const physicalTrap=takeCard(state,3,MIRROR_FORCE);
  const trap={...physicalTrap,faceUp:false,setTurn:0};
  state.core.players[1].backrow.push(trap);
  return {state,trap};
}

test('Mirror Force is a playable attack-declaration Trap with opponent-only destruction across the shared 2v2 field',()=>{
  const effect=getEffect(MIRROR_FORCE);
  assert.equal(getPlayableCard(MIRROR_FORCE)?.kind,'trap');
  assert.equal(effect?.kind,'mirrorForce');
  assert.deepEqual(getActivationModel(effect),{
    speed:2,window:'attackDeclared',damage:'never',opponentOnly:true
  });
  assert.deepEqual(getDestructionModel(effect),{
    operation:'destroyMonsters',scope:'opponent',position:'atk',destination:'grave'
  });
});

test('active defender can activate inactive teammate-owned Mirror Force; only opposing Attack Position monsters are destroyed',()=>{
  let {state,trap}=setup(0);
  const attacker=deploy(state,0,normal[0].id,{position:'atk'});
  const allyAttacker=deploy(state,2,normal[1].id,{position:'atk'});
  const alliedDefense=deploy(state,0,normal[2].id,{position:'def'});
  const defendingTarget=deploy(state,1,normal[4].id,{position:'def'});
  const defendingAttacker=deploy(state,3,normal[5].id,{position:'atk'});
  const before=snapshot(state);
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicBefore.includes(MIRROR_FORCE),'the set Trap identity must remain private');
  assert.ok(!publicBefore.includes(trap.uid),'the set Trap physical UID must remain private');

  state=act(state,0,'battle');
  state=act(state,0,'attack',action=>action.card===attacker.uid&&action.target===defendingTarget.uid);
  assert.equal(state.core.phase,'response','an attack declaration opens the Mirror Force response window');
  assert.equal(tag.tagDecisionMember(state).id,member(1),'the active defending teammate receives priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],'the inactive physical Trap owner cannot act');
  assert.deepEqual(tag.tagActions(state,member(2)),[],'the inactive attacking teammate cannot act');

  const response=tag.tagActions(state,member(1)).find(action=>action.kind==='trap'&&action.card===trap.uid);
  assert.ok(response,'the active defender must be able to activate their inactive teammate set Trap');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),response),/Aguarde a vez do participante ativo/);
  assert.equal(JSON.stringify(state),unchanged,'the inactive physical Trap owner cannot mutate the chain');

  state=settle(tag.stepTagDuel(state,member(1),response));
  assert.deepEqual(state.core.players[0].monsters.map(card=>card.uid),[alliedDefense.uid],
    'both opposing Attack Position monsters are destroyed; the allied Defense monster survives');
  assert.deepEqual(state.core.players[1].monsters.map(card=>card.uid),[defendingTarget.uid,defendingAttacker.uid],
    'Mirror Force must not destroy monsters controlled by the Trap owner team');
  for(const card of [attacker,allyAttacker])
    assert.ok(state.core.players[0].grave.some(entry=>entry.uid===card.uid),'opposing team Graveyard must receive '+card.uid);
  assert.ok(state.core.players[1].grave.some(entry=>entry.uid===trap.uid),'the activated Trap must reach its shared team Graveyard');
  assert.ok(!state.core.players[1].grave.some(entry=>entry.uid===attacker.uid),'destroyed monsters cannot be routed to the Trap owner Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('a teammate cannot activate their own team Mirror Force in response to that team attacking',()=>{
  let {state,trap}=setup(1,'m161-own-team-attack');
  const attacker=deploy(state,1,normal[0].id,{position:'atk'});
  const target=deploy(state,0,normal[1].id,{position:'def'});
  state=act(state,1,'battle');
  state=act(state,1,'attack',action=>action.card===attacker.uid&&action.target===target.uid);
  assert.equal(state.core.phase,'battle','without a defending response, the attack resolves without opening a Trap chain');
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===trap.uid),
    'Mirror Force set by the attacking team remains unused during its own attack');
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===trap.uid),
    'the attacking team cannot activate its own Mirror Force');
  assert.deepEqual(tag.tagActions(state,member(3)),[],'the inactive physical Trap owner cannot act');
});
