'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const AXE_RAIDER='48305365';
const WALL_OF_ILLUSION='13945283';
const KELBEK='54878498';

assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);
for(const id of [WALL_OF_ILLUSION,KELBEK]){
  assert.equal(getMonsterEffect(id)?.operation.kind,'battleBounceAttacker');
  assert.equal(getPlayableCard(id)?.kind,'monster');
}

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the 2v2 bounce fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm167-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(defenderId,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M167 Seat '+seat,
    cards:deck(seat===2?[AXE_RAIDER]:seat===3?[defenderId]:[])
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
  throw new Error('M167 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'battle bounce must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'battle bounce must not duplicate UIDs');
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
function handUids(state,seat){
  return tag.tagMemberHand(state,member(seat)).map(card=>card.uid).sort();
}

for(const [defenderId,name] of [
  [WALL_OF_ILLUSION,'Wall of Illusion'],
  [KELBEK,'Kelbek']
]){
  test(name+' returns an attacking inactive partner monster to its physical owner hand after battle damage calculation',()=>{
    let state=game(defenderId,'m167-physical-owner-bounce-'+defenderId);
    const before=inventorySnapshot(state);
    const attacker=deploy(state,2,AXE_RAIDER);
    const defender=deploy(state,3,defenderId);
    assert.match(attacker.uid,/^m2:/,'the attacker must retain the inactive partner physical UID');
    assert.match(defender.uid,/^m3:/,'the defender must retain the inactive opponent partner physical UID');
    const hand0Before=handUids(state,0);
    const hand2Before=handUids(state,2);
    const expectedDamage=getPlayableCard(AXE_RAIDER).atk-getPlayableCard(defenderId).atk;
    assert.ok(expectedDamage>0,'Axe Raider must win this Attack Position battle');

    state=startBattle(state);
    const action=tag.tagActions(state,member(0)).find(candidate=>
      candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===defender.uid
    );
    assert.ok(action,'the active teammate must be able to attack with the shared Axe Raider');
    const unchanged=JSON.stringify(state);
    assert.deepEqual(tag.tagActions(state,member(2)),[],'the inactive physical attacker owner cannot submit the attack');
    assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo\./);
    assert.equal(JSON.stringify(state),unchanged,'a rejected partner action must not mutate the duel');

    state=settle(tag.stepTagDuel(state,member(0),action));
    assert.equal(state.core.players[1].lp,4000-expectedDamage,'normal battle damage is applied to the opposing shared team LP');
    assert.equal(state.core.players[0].lp,4000,'the attacking team LP remains unchanged');
    assert.ok(state.core.players[1].grave.some(card=>card.uid===defender.uid&&card.id===defenderId),
      'the defending inactive partner monster is destroyed into the shared team Graveyard');
    assert.ok(!state.core.players.some(team=>team.monsters.some(card=>card.uid===attacker.uid)),
      'the bounced attacker must leave the shared field');
    assert.ok(!state.core.players.some(team=>team.grave.some(card=>card.uid===attacker.uid)),
      'the bounced attacker must not enter either Graveyard');
    assert.ok(handUids(state,2).includes(attacker.uid),
      'the attacker must return to the inactive physical owner private hand');
    assert.deepEqual(handUids(state,0),hand0Before,
      'the active teammate hand must not receive the partner-owned attacker');
    assert.deepEqual(handUids(state,2).filter(uid=>uid!==attacker.uid),hand2Before,
      'the physical owner private hand must otherwise remain unchanged');
    assert.ok(!JSON.stringify(tag.publicTagDuel(state)).includes(attacker.uid),
      'the private hand UID must not leak into the public projection');
    tag.assertTagDuel(state);
    assertConserved(state,before);
  });
}
