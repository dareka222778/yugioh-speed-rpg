'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const DD_WARRIOR='37043180';
const DD_ASSAILANT='70074904';
const BATTLE_WARRIOR='55550921';
const CELTIC_GUARDIAN='91152256';
const SUMMONED_SKULL='70781052';

assert.equal(getPlayableCard(DD_WARRIOR)?.atk,1200);
assert.equal(getPlayableCard(DD_ASSAILANT)?.atk,1700);
assert.equal(getMonsterEffect(DD_WARRIOR)?.operation.kind,'battleBanishBoth');
assert.deepEqual(getMonsterEffect(DD_ASSAILANT)?.operation,{kind:'battleBanishBoth',onlyIfDestroyedByBattle:true});
assert.equal(getPlayableCard(BATTLE_WARRIOR)?.atk,700);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);
assert.equal(getPlayableCard(SUMMONED_SKULL)?.atk,2500);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the 2v2 banish fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm170-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(attackerId,targetId,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M170 Seat '+seat,
    cards:deck(seat===2?[attackerId]:seat===3?[targetId]:[])
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
  throw new Error('M170 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'physical UIDs must be unique before battle');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'battle banishment must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'battle banishment must not duplicate UIDs');
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
  assert.ok(action,'the active teammate must receive the shared attack action');
  return settle(tag.stepTagDuel(state,member(0),action));
}

test('D.D. Warrior banishes both physical monsters after battle, routing each to its team shared banished zone',()=>{
  let state=game(DD_WARRIOR,BATTLE_WARRIOR,'m170-dd-warrior-shared-banish');
  const before=inventorySnapshot(state);
  const attacker=deploy(state,2,DD_WARRIOR);
  const target=deploy(state,3,BATTLE_WARRIOR);
  assert.match(attacker.uid,/^m2:/);
  assert.match(target.uid,/^m3:/);
  state=startBattle(state);
  state=attack(state,attacker,target);

  assert.equal(state.core.players[1].lp,3500,'the defending team receives ordinary battle damage of 500');
  assert.equal(state.core.players[0].lp,4000);
  assert.ok(state.core.players[0].banished.some(card=>card.uid===attacker.uid&&card.id===DD_WARRIOR),
    'D.D. Warrior must be banished to its attacking team shared zone');
  assert.ok(state.core.players[1].banished.some(card=>card.uid===target.uid&&card.id===BATTLE_WARRIOR),
    'the target must be banished to its own team shared zone');
  assert.ok(!state.core.players.some(team=>team.grave.some(card=>card.uid===attacker.uid||card.uid===target.uid)),
    'neither battled monster should enter a Graveyard');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('D.D. Assailant banishes itself and the opponent when it is destroyed by battle',()=>{
  let state=game(DD_ASSAILANT,SUMMONED_SKULL,'m170-dd-assailant-destroyed');
  const before=inventorySnapshot(state);
  const attacker=deploy(state,2,DD_ASSAILANT);
  const target=deploy(state,3,SUMMONED_SKULL);
  assert.match(attacker.uid,/^m2:/);
  assert.match(target.uid,/^m3:/);
  state=startBattle(state);
  state=attack(state,attacker,target);

  assert.equal(state.core.players[0].lp,3200,'the attacking team receives only ordinary battle damage of 800');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(state.core.players[0].banished.some(card=>card.uid===attacker.uid&&card.id===DD_ASSAILANT));
  assert.ok(state.core.players[1].banished.some(card=>card.uid===target.uid&&card.id===SUMMONED_SKULL));
  assert.ok(!state.core.players.some(team=>team.grave.some(card=>card.uid===attacker.uid||card.uid===target.uid)));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('D.D. Assailant does not banish either card when it survives battle',()=>{
  let state=game(DD_ASSAILANT,CELTIC_GUARDIAN,'m170-dd-assailant-survives');
  const before=inventorySnapshot(state);
  const attacker=deploy(state,2,DD_ASSAILANT);
  const target=deploy(state,3,CELTIC_GUARDIAN);
  state=startBattle(state);
  state=attack(state,attacker,target);

  assert.equal(state.core.players[1].lp,3700,'the defending team receives only ordinary battle damage of 300');
  assert.equal(state.core.players[0].lp,4000);
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid&&card.id===DD_ASSAILANT));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===CELTIC_GUARDIAN));
  assert.deepEqual(state.core.players.map(team=>team.banished),[[],[]],
    'the conditional banish must not activate while D.D. Assailant survives');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
