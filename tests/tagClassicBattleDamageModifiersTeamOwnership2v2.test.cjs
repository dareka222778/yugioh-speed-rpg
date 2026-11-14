'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const PIRANHA_ARMY='50823978';
const STONE_STATUE='31812496';
const AMAZONESS_FIGHTER='55821894';
const AXE_RAIDER='48305365';

assert.equal(getPlayableCard(PIRANHA_ARMY)?.atk,800);
assert.equal(getMonsterEffect(PIRANHA_ARMY)?.operation.kind,'continuous');
assert.equal(getPlayableCard(STONE_STATUE)?.defense,2000);
assert.equal(getMonsterEffect(STONE_STATUE)?.operation.kind,'continuous');
assert.equal(getPlayableCard(AMAZONESS_FIGHTER)?.atk,1500);
assert.equal(getMonsterEffect(AMAZONESS_FIGHTER)?.operation.kind,'continuous');
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the battle-damage fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm180-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M180 Seat '+seat,
    cards:deck([PIRANHA_ARMY,STONE_STATUE,AMAZONESS_FIGHTER,AXE_RAIDER])
  }));
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
  throw new Error('M180 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position='atk'){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,
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
  assert.equal(cards.length,before.size,'battle damage modifiers must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'battle damage modifiers must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function startBattle(state){
  const action=tag.tagActions(state,member(0)).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active teammate must be able to enter the Battle Phase');
  return settle(tag.stepTagDuel(state,member(0),action));
}
function attack(state,attacker,target){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===target.uid
  );
  assert.ok(action,'the active teammate must receive the partner-aware shared attack action');
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical attacker owner cannot submit the attack');
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'a rejected partner action must not mutate the duel');
  return settle(tag.stepTagDuel(state,member(0),action));
}

test('Piranha Army doubles direct battle damage to the opposing shared team',()=>{
  let state=game('m180-piranha-direct-damage');
  const before=inventorySnapshot(state);
  const piranha=deploy(state,2,PIRANHA_ARMY);
  assert.match(piranha.uid,/^m2:/,'Piranha Army must retain inactive teammate physical ownership');
  state=startBattle(state);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===piranha.uid&&candidate.target===undefined
  );
  assert.ok(action,'the active teammate must be able to declare a direct attack with partner-owned Piranha Army');
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical owner cannot declare the direct attack');
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo/);
  assert.equal(JSON.stringify(state),unchanged,'a rejected inactive-partner action must not mutate the duel');
  state=settle(tag.stepTagDuel(state,member(0),action));
  assert.equal(state.core.players[1].lp,4000-1600,
    'Piranha Army deals twice its 800 ATK as direct battle damage');
  assert.equal(state.core.players[0].lp,4000,'the attacking shared team takes no damage');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===piranha.uid),
    'Piranha Army remains on the shared field after its direct attack');
  assert.equal(tag.publicTagDuel(state).teams[1].lp,2400,
    'the public team projection must expose the same doubled damage');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Stone Statue of the Aztecs doubles battle damage received by the attacking team when attacked in Defense',()=>{
  let state=game('m180-stone-statue-double-defense-damage');
  const before=inventorySnapshot(state);
  const attacker=deploy(state,2,AXE_RAIDER,'atk');
  const statue=deploy(state,3,STONE_STATUE,'def');
  assert.match(attacker.uid,/^m2:/);
  assert.match(statue.uid,/^m3:/);
  state=startBattle(state);
  state=attack(state,attacker,statue);
  assert.equal(state.core.players[0].lp,4000-600,
    'the attacking team takes twice the ordinary 300 damage from 2000 DEF versus 1700 ATK');
  assert.equal(state.core.players[1].lp,4000,'the defending shared team takes no damage');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===statue.uid&&card.id===STONE_STATUE),
    'Stone Statue survives in Defense Position');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid),
    'Axe Raider survives the failed attack');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Amazoness Fighter prevents its controller shared team from taking battle damage involving it',()=>{
  let state=game('m180-amazoness-fighter-zero-damage');
  const before=inventorySnapshot(state);
  const attacker=deploy(state,2,AXE_RAIDER,'atk');
  const fighter=deploy(state,3,AMAZONESS_FIGHTER,'atk');
  assert.match(attacker.uid,/^m2:/);
  assert.match(fighter.uid,/^m3:/);
  state=startBattle(state);
  state=attack(state,attacker,fighter);
  assert.equal(state.core.players[1].lp,4000,
    'Amazoness Fighter prevents the defending shared team from receiving the ordinary 200 battle damage');
  assert.equal(state.core.players[0].lp,4000,'the attacking team takes no damage when its monster wins');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===fighter.uid&&card.id===AMAZONESS_FIGHTER),
    'Amazoness Fighter is still destroyed by battle; only battle damage is prevented');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid),
    'the winning attacker remains on the shared field');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
