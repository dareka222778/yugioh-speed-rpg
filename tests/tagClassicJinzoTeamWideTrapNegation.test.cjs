'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterDefinition,getMonsterEffect}=require('../dist/monsterEffects');
const {getActivationModel}=require('../dist/effectModels');

const JINZO='77585513';
const MIRROR_FORCE='44095762';
assert.ok(getPlayableCard(JINZO)?.kind==='monster');
assert.equal(getMonsterEffect(JINZO)?.trigger,'continuous');
assert.equal(getMonsterEffect(JINZO)?.operation.kind,'negateTraps');
assert.equal(getMonsterDefinition(JINZO)?.activation.policy,'continuous');
assert.ok(getPlayableCard(MIRROR_FORCE)?.kind==='trap');
assert.equal(getActivationModel(getEffect(MIRROR_FORCE))?.window,'attackDeclared');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7);
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm142-seat-'+seat;}
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
  throw new Error('M142 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
for(const scenario of [
  {first:0,attackerSeat:0,targetSeat:1,defenderSeat:1,trapOwnerSeat:3},
  {first:3,attackerSeat:3,targetSeat:0,defenderSeat:0,trapOwnerSeat:2}
])test('Jinzo blocks Spell Speed 2 Trap activation for the active defending team '+(scenario.defenderSeat%2),()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M142 Seat '+seat,
    cards:deck(seat===2?(scenario.trapOwnerSeat===2?[JINZO,MIRROR_FORCE]:[JINZO]):
      seat===3&&scenario.trapOwnerSeat===3?[MIRROR_FORCE]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:scenario.first,seed:'m142-jinzo-'+scenario.first});
  const jinzoCard=takeCard(state,2,JINZO);
  const jinzo={...jinzoCard,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[0].monsters.push(jinzo);
  const attacker=deploy(state,scenario.attackerSeat,normal[0].id);
  const target=deploy(state,scenario.targetSeat,normal[1].id);
  const trapCard=takeCard(state,scenario.trapOwnerSeat,MIRROR_FORCE);
  const trap={...trapCard,setTurn:0,faceUp:false};
  state.core.players[scenario.trapOwnerSeat%2].backrow.push(trap);
  state.core.turn=3;
  assert.match(jinzo.uid,/^m2:/,'Jinzo belongs physically to inactive teammate seat 2');
  assert.match(attacker.uid,new RegExp('^m'+scenario.attackerSeat+':'));
  assert.match(target.uid,new RegExp('^m'+scenario.targetSeat+':'));
  assert.match(trap.uid,new RegExp('^m'+scenario.trapOwnerSeat+':'));
  assert.equal(tag.tagDecisionMember(state).id,member(scenario.first));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const battle=tag.tagActions(state,member(scenario.attackerSeat)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=tag.stepTagDuel(state,member(scenario.attackerSeat),battle);
  const attack=tag.tagActions(state,member(scenario.attackerSeat)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===target.uid
  );
  assert.ok(attack);
  state=tag.stepTagDuel(state,member(scenario.attackerSeat),attack);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(scenario.defenderSeat),
    'the active physical defender receives response priority');
  assert.ok(!tag.tagActions(state,member(scenario.defenderSeat)).some(action=>
    action.kind==='trap'&&action.card===trap.uid
  ),'Jinzo suppresses Trap activation for the active opposing/own team, not only its controller');
  assert.deepEqual(tag.tagActions(state,member(scenario.trapOwnerSeat)),[],
    'inactive physical owner cannot submit the set Trap action');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===jinzo.uid&&card.faceUp),
    'Jinzo remains face-up and continuously negates Trap activations');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
