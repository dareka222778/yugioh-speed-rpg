'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const NEEDLE_BURROWER='98162242';
const KA2_DES_SCISSORS='52768103';
const CELTIC_GUARDIAN='91152256';
const BATTLE_WARRIOR='55550921';
const SUMMONED_SKULL='70781052';

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.level));
assert.ok(normal.length>=8,'the 2v2 battle fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

for(const id of [NEEDLE_BURROWER,KA2_DES_SCISSORS]){
  assert.equal(getMonsterEffect(id)?.operation.kind,'battleLevelBurn');
  assert.equal(getPlayableCard(id)?.kind,'monster');
}
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);
assert.equal(getPlayableCard(BATTLE_WARRIOR)?.atk,700);
assert.equal(getPlayableCard(SUMMONED_SKULL)?.atk,2500);

function member(seat){return 'm166-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(attackerId,targetId,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M166 Seat '+seat,
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
  throw new Error('M166 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,owner:seat%2,position,faceUp:true,
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
  assert.equal(cards.length,before.size,'battle effects must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'battle effects must not duplicate UIDs');
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

for(const [attackerId,targetId] of [
  [NEEDLE_BURROWER,CELTIC_GUARDIAN],
  [KA2_DES_SCISSORS,BATTLE_WARRIOR]
]){
  const attackerCard=getPlayableCard(attackerId);
  const targetCard=getPlayableCard(targetId);
  const battleDamage=attackerCard.atk-targetCard.atk;
  const effectDamage=500*targetCard.level;
  test(attackerCard.englishName+' applies 500 × original Level to the opposing shared team after battle destruction',()=>{
    let state=game(attackerId,targetId,'m166-level-burn-'+attackerId);
    const before=inventorySnapshot(state);
    const attacker=deploy(state,2,attackerId,'atk');
    const target=deploy(state,3,targetId,'atk');
    assert.match(attacker.uid,/^m2:/,'the attacker must retain its inactive partner physical UID');
    assert.match(target.uid,/^m3:/,'the target must retain its inactive partner physical UID');
    state=startBattle(state);
    const action=tag.tagActions(state,member(0)).find(candidate=>
      candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===target.uid
    );
    assert.ok(action,'the active teammate must be able to use the inactive partner attacker');
    const unchanged=JSON.stringify(state);
    assert.deepEqual(tag.tagActions(state,member(2)),[],'the inactive physical owner cannot submit the attack');
    assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo\./);
    assert.equal(JSON.stringify(state),unchanged,'a rejected partner action must not mutate the duel');

    state=settle(tag.stepTagDuel(state,member(0),action));
    assert.equal(state.core.players[1].lp,4000-battleDamage-effectDamage,
      'battle damage and the original-Level burn must reduce the opposing shared team LP');
    assert.equal(state.core.players[0].lp,4000,'the attacking team LP must remain unchanged');
    assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===targetId),
      'the destroyed inactive partner monster must enter the shared team Graveyard with its UID');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid&&card.id===attackerId),
      'the battle-damage source must survive its winning battle');
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    assertConserved(state,before);
  });
}

test('Needle Burrower burns by original Level when it destroys a Defense Position monster without battle damage',()=>{
  let state=game(NEEDLE_BURROWER,CELTIC_GUARDIAN,'m166-defense-level-burn');
  const before=inventorySnapshot(state);
  const attacker=deploy(state,2,NEEDLE_BURROWER,'atk');
  const target=deploy(state,3,CELTIC_GUARDIAN,'def');
  state=startBattle(state);
  state=attack(state,attacker,target);

  assert.equal(state.core.players[1].lp,2000,'only the 500 × Level 4 effect damage is applied');
  assert.equal(state.core.players[0].lp,4000,'attacking a Defense Position monster causes no battle damage here');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===CELTIC_GUARDIAN));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid&&card.id===NEEDLE_BURROWER));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Needle Burrower does not burn when the opposing monster wins the battle',()=>{
  let state=game(NEEDLE_BURROWER,SUMMONED_SKULL,'m166-losing-battle-no-level-burn');
  const before=inventorySnapshot(state);
  const attacker=deploy(state,2,NEEDLE_BURROWER,'atk');
  const target=deploy(state,3,SUMMONED_SKULL,'atk');
  state=startBattle(state);
  state=attack(state,attacker,target);

  assert.equal(state.core.players[1].lp,4000,'the surviving opponent must not receive a battle-level burn');
  assert.equal(state.core.players[0].lp,4000-(target.atk-attacker.atk),'the attacking team receives only ordinary battle damage');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===attacker.uid&&card.id===NEEDLE_BURROWER));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===target.uid&&card.id===SUMMONED_SKULL));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
