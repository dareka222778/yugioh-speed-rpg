'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const REINFORCEMENTS='17814387';
const CASTLE_WALLS='44209392';
for(const [id,kind] of [[REINFORCEMENTS,'reinforcements'],[CASTLE_WALLS,'castleWalls']]){
  assert.equal(getPlayableCard(id)?.kind,'trap',id+' must be an enabled Trap');
  assert.equal(getEffect(id)?.kind,kind);
  const activation=getActivationModel(getEffect(id));
  assert.equal(activation?.speed,2);
  assert.equal(activation?.window,'free');
  assert.equal(activation?.damage,'beforeCalculation');
}

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the fixture needs seven certified Normal Monsters');
const attackerEntry=normal.reduce((best,current)=>current.card.atk<best.card.atk?current:best);
const reinforcementsTarget=normal
  .filter(entry=>entry.id!==attackerEntry.id)
  .reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const castleWallsTarget=normal
  .filter(entry=>entry.id!==attackerEntry.id)
  .reduce((best,current)=>current.card.defense>best.card.defense?current:best);
assert.ok(reinforcementsTarget.card.atk>attackerEntry.card.atk);
assert.ok(castleWallsTarget.card.defense>attackerEntry.card.atk);
const deckIds=[...new Set([
  attackerEntry.id,reinforcementsTarget.id,castleWallsTarget.id,...normal.map(entry=>entry.id)
])].slice(0,7);
assert.equal(deckIds.length,7);

function member(seat){return 'm153-seat-'+seat;}
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
  throw new Error('M153 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position='atk'){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique before the Trap resolves');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the attack/Trap response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function setup(trapId,monsterId,monsterPosition,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M153 Seat '+seat,
    cards:deck(seat===0?[trapId]:seat===1?[attackerEntry.id]:seat===2?[monsterId]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:1,seed});
  const before=inventorySnapshot(state);
  const trapCard=takeCard(state,0,trapId);
  const trap={...trapCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(trap);
  const attacker=deploy(state,1,attackerEntry.id,'atk');
  const target=deploy(state,2,monsterId,monsterPosition);
  state.core.turn=3;
  assert.match(trap.uid,/^m0:/,'the Set Trap must retain inactive partner seat 0 physical ownership');
  assert.match(attacker.uid,/^m1:/,'the attacking monster must retain seat 1 physical ownership');
  assert.match(target.uid,/^m2:/,'the shared-field target must retain seat 2 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const publicBefore=tag.publicTagDuel(state);
  assert.ok(!JSON.stringify(publicBefore).includes(trapId),'the Set Trap identity must remain hidden');
  assert.ok(!JSON.stringify(publicBefore).includes(trap.uid),'the Set Trap UID must remain hidden');
  return {state,before,trap,attacker,target};
}
function declareAttack(state,attacker,target){
  const battle=tag.tagActions(state,member(1)).find(action=>action.kind==='battle');
  assert.ok(battle,'the active attacking teammate must enter the Battle Phase');
  state=settle(tag.stepTagDuel(state,member(1),battle));
  const attack=tag.tagActions(state,member(1)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===target.uid
  );
  assert.ok(attack,'the active opposing teammate must attack the face-up shared-field target');
  state=tag.stepTagDuel(state,member(1),attack);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(2),
    'the active physical defender receives the Trap response priority');
  assert.deepEqual(tag.tagActions(state,member(0)),[],
    'the inactive physical owner of the Set Trap cannot submit the response');
  return state;
}
function trapTargets(state,trapUid){
  return tag.tagActions(state,member(2))
    .filter(action=>action.kind==='trap'&&action.card===trapUid)
    .map(action=>action.target)
    .sort();
}

for(const spec of [
  {id:REINFORCEMENTS,name:'Reinforcements',kind:'atk',target:reinforcementsTarget,position:'atk'},
  {id:CASTLE_WALLS,name:'Castle Walls',kind:'def',target:castleWallsTarget,position:'def'}
]){
  test(spec.name+' offers only face-up monsters controlled by the defending team in classic 2v2',()=>{
    const {state:initial,trap,attacker,target}=setup(
      spec.id,spec.target.id,spec.position,'m153-target-filter-'+spec.name
    );
    const state=declareAttack(initial,attacker,target);
    assert.deepEqual(trapTargets(state,trap.uid),[target.uid],
      spec.name+' must not offer the opposing attacker as a legal target');
    assert.ok(!trapTargets(state,trap.uid).includes(attacker.uid));
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
  });

  test(spec.name+' can be activated by the active teammate and modifies its shared-field monster',()=>{
    const {state:initial,before,trap,attacker,target}=setup(
      spec.id,spec.target.id,spec.position,'m153-resolution-'+spec.name
    );
    let state=declareAttack(initial,attacker,target);
    const action=tag.tagActions(state,member(2)).find(candidate=>
      candidate.kind==='trap'&&candidate.card===trap.uid&&candidate.target===target.uid
    );
    assert.ok(action,'the active teammate must activate the inactive partner Set Trap against its own shared-field monster');
    state=settle(tag.stepTagDuel(state,member(2),action));
    const resolved=state.core.players[0].monsters.find(monster=>monster.uid===target.uid);
    assert.ok(resolved,'the protected team monster remains on the shared field after battle');
    assert.equal(spec.kind==='atk'?resolved.atkBoost:resolved.defBoost,500,
      spec.name+' must apply its 500-point modifier to the selected teammate monster');
    assert.ok(state.core.players[0].grave.some(card=>card.uid===trap.uid),
      'the activated Trap enters the shared Graveyard without changing its physical UID');
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    state=JSON.parse(JSON.stringify(state));
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    assertConserved(state,before);
  });
}
