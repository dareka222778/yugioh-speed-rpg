'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const OBNOXIOUS_CELTIC_GUARD='52077741';
const SPEAR_DRAGON='31553716';
const AXE_RAIDER='48305365';

assert.equal(getPlayableCard(OBNOXIOUS_CELTIC_GUARD)?.atk,1400);
assert.equal(getMonsterEffect(OBNOXIOUS_CELTIC_GUARD)?.operation.kind,'continuous');
assert.equal(getPlayableCard(SPEAR_DRAGON)?.atk,1900);
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the battle-survival fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm181-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(attackerId,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M181 Seat '+seat,
    cards:deck([OBNOXIOUS_CELTIC_GUARD,SPEAR_DRAGON,AXE_RAIDER])
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
  throw new Error('M181 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'battle survival must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'battle survival must not duplicate UIDs');
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
function attack(state,attacker,guard){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===guard.uid
  );
  assert.ok(action,'the active teammate must receive the shared attack action');
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical attacker owner cannot submit the attack');
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo\\./);
  assert.equal(JSON.stringify(state),unchanged,'a rejected partner action must not mutate the duel');
  return settle(tag.stepTagDuel(state,member(0),action));
}

for(const [attackerId,name,atk,difference] of [
  [SPEAR_DRAGON,'Spear Dragon at the exact 1900 ATK threshold',1900,500],
  [AXE_RAIDER,'Axe Raider below the 1900 ATK threshold',1700,300]
]){
  test('Obnoxious Celtic Guard respects '+name+' in a shared 2v2 battle',()=>{
    let state=game(attackerId,'m181-obnoxious-threshold-'+attackerId);
    const before=inventorySnapshot(state);
    const attacker=deploy(state,2,attackerId);
    const guard=deploy(state,3,OBNOXIOUS_CELTIC_GUARD);
    assert.match(attacker.uid,/^m2:/,'the attacker must retain inactive teammate physical ownership');
    assert.match(guard.uid,/^m3:/,'the protected monster must retain inactive opponent teammate ownership');
    state=startBattle(state);
    state=attack(state,attacker,guard);

    assert.equal(state.core.players[1].lp,4000-difference,
      'ordinary battle damage is still applied to the defending shared team');
    assert.equal(state.core.players[0].lp,4000,'the attacking team takes no damage');
    const remains=state.core.players[1].monsters.some(card=>card.uid===guard.uid&&card.id===OBNOXIOUS_CELTIC_GUARD);
    const destroyed=state.core.players[1].grave.some(card=>card.uid===guard.uid&&card.id===OBNOXIOUS_CELTIC_GUARD);
    if(attackerId===SPEAR_DRAGON){
      assert.ok(remains,'a monster with exactly 1900 ATK cannot destroy Obnoxious Celtic Guard by battle');
      assert.ok(!destroyed,'the protected physical card must not enter the shared Graveyard');
    }else{
      assert.ok(destroyed,'a 1700 ATK monster below the threshold destroys Obnoxious Celtic Guard normally');
      assert.ok(!remains,'the below-threshold battle must remove the guard from the field');
    }
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid),
      'the attacking partner-owned monster must remain on the shared field');
    tag.assertTagDuel(state);
    assertConserved(state,before);
  });
}
