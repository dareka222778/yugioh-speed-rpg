'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const GOBLIN_ATTACK_FORCE='78658564';
const GIANT_ORC='73698349';
const MONSTERS=[GOBLIN_ATTACK_FORCE,GIANT_ORC];

for(const id of MONSTERS){
  const card=getPlayableCard(id);
  const effect=getMonsterEffect(id);
  assert.ok(card,'the forced-Defense monster must be enabled: '+id);
  assert.equal(effect?.trigger,'continuous');
  assert.equal(effect?.operation.kind,'endBattleDefense');
}
assert.equal(getPlayableCard(GOBLIN_ATTACK_FORCE)?.atk,2300);
assert.equal(getPlayableCard(GIANT_ORC)?.atk,2200);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the 2v2 fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm209-seat-'+seat;}
function deck(){
  const ids=[...new Set([...MONSTERS,...normalIds])];
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M209 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
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
  throw new Error('M209 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all physical UIDs must be unique');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'battle position changes must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'battle position changes must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function actor(state){return tag.tagDecisionMember(state).id;}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    const current=actor(state);
    const pass=tag.tagActions(state,current).find(action=>action.kind==='pass');
    assert.ok(pass,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,current,pass);
  }
  return state;
}
function enterBattle(state){
  const current=actor(state);
  const action=tag.tagActions(state,current).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active teammate must be able to enter the Battle Phase');
  return settle(tag.stepTagDuel(state,current,action));
}
function attackDirectly(state,source){
  const current=actor(state);
  const action=tag.tagActions(state,current).find(candidate=>
    candidate.kind==='attack'&&candidate.card===source.uid&&candidate.target===undefined
  );
  assert.ok(action,'the active teammate must be able to attack directly with its partner-owned shared-field monster');
  return settle(tag.stepTagDuel(state,current,action));
}
function endCurrentTurn(state){
  const current=actor(state);
  const action=tag.tagActions(state,current).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active teammate must have an End Phase action');
  return settle(tag.stepTagDuel(state,current,action));
}
function positionAction(state,source,mode){
  return tag.tagActions(state,actor(state)).find(candidate=>
    candidate.kind==='position'&&candidate.card===source.uid&&candidate.mode===mode
  );
}
function prepare(id,seed){
  const state=game(seed);
  const before=inventorySnapshot(state);
  const source=deploy(state,2,id);
  assert.match(source.uid,/^m2:/,'the source must retain inactive partner seat 2 physical ownership');
  assert.equal(source.owner,0,'the partner-owned monster must occupy its shared team field');
  tag.assertTagDuel(state);
  return {state,before,source};
}

for(const id of MONSTERS){
  const name=getPlayableCard(id).englishName;

  test(name+' changes to Defense at the end of the Battle Phase only after it attacked',()=>{
    let {state,before,source}=prepare(id,'m209-attacked-'+id);
    state=enterBattle(state);
    assert.ok(tag.tagActions(state,actor(state)).some(action=>
      action.kind==='attack'&&action.card===source.uid&&action.target===undefined
    ),'the active teammate must see the partner-owned direct attack');
    state=attackDirectly(state,source);
    assert.equal(state.core.phase,'battle','the Damage Step must finish without ending the Battle Phase');
    const attacked=state.core.players[0].monsters.find(card=>card.uid===source.uid);
    assert.ok(attacked,'the source must remain on the shared field after its direct attack');
    assert.equal(attacked.position,'atk','the forced position change waits until the Battle Phase ends');

    state=endCurrentTurn(state);
    const resolved=state.core.players[0].monsters.find(card=>card.uid===source.uid);
    assert.ok(resolved,'the partner-owned source must remain on its shared team field');
    assert.equal(resolved.position,'def','the source changes to Defense at the Battle Phase boundary');
    assert.equal(resolved.changed,3,'the automatic position change is recorded in the attack turn');
    assert.equal(resolved.positionLockedThrough,5,'manual position changes are locked through the controller team next turn');
    assert.equal(state.core.turn,4,'ending the Battle Phase also completes the current turn');
    tag.assertTagDuel(state);
    assertConserved(state,before);
  });

  test(name+' does not change position when it did not attack during the Battle Phase',()=>{
    let {state,before,source}=prepare(id,'m209-not-attacked-'+id);
    state=enterBattle(state);
    state=endCurrentTurn(state);
    const resolved=state.core.players[0].monsters.find(card=>card.uid===source.uid);
    assert.ok(resolved,'the source must remain on the shared field');
    assert.equal(resolved.position,'atk','the forced Defense effect requires this monster to have attacked');
    assert.equal(resolved.positionLockedThrough,undefined,'a non-attack must not create a position lock');
    tag.assertTagDuel(state);
    assertConserved(state,before);
  });
}

test('Goblin Attack Force and Giant Orc cannot manually change position through the end of their controller team next turn',()=>{
  let state=game('m209-next-controller-turn-lock');
  const before=inventorySnapshot(state);
  const source=deploy(state,2,GOBLIN_ATTACK_FORCE);
  state=enterBattle(state);
  state=attackDirectly(state,source);
  state=endCurrentTurn(state);
  assert.equal(state.core.turn,4);
  let live=state.core.players[0].monsters.find(card=>card.uid===source.uid);
  assert.equal(live.position,'def');
  assert.equal(live.positionLockedThrough,5);

  state=endCurrentTurn(state); // opposing team turn 4 -> controller team turn 5
  assert.equal(state.core.turn,5);
  assert.equal(state.core.current,0);
  assert.equal(positionAction(state,source,'atk'),undefined,
    'the active teammate must not manually change the forced-Defense monster during the controller team next turn');
  tag.assertTagDuel(state);

  state=endCurrentTurn(state); // controller team turn 5 -> opposing team turn 6
  assert.equal(state.core.turn,6);
  state=endCurrentTurn(state); // opposing team turn 6 -> controller team turn 7
  assert.equal(state.core.turn,7);
  const unlock=positionAction(state,source,'atk');
  assert.ok(unlock,'manual position change becomes legal only after the next controller-team turn has ended');
  assertConserved(state,before);
  tag.assertTagDuel(state);
});
