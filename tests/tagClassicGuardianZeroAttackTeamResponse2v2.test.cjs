'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const AXE_RAIDER='48305365';
const GUARDIANS=[
  ['25955164','Sanga of the Thunder',2600],
  ['98434877','Suijin',2500],
  ['62340868','Kazejin',2400]
];

for(const [id,name,atk] of GUARDIANS){
  assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getPlayableCard(id)?.atk,atk);
  assert.equal(getMonsterEffect(id)?.operation.kind,'guardianZeroAttack');
}
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the 2v2 guardian fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm168-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(guardianId){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M168 Seat '+seat,
    cards:deck(seat===0||seat===2?[AXE_RAIDER]:seat===3?[guardianId]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m168-guardian-'+guardianId});
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
  throw new Error('M168 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'guardian response must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'guardian response must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the damage-calculation response chain must terminate');
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
function attackAction(state,attacker,defender){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===defender.uid
  );
  assert.ok(action,'the active teammate must receive the shared attack action');
  return action;
}

for(const [guardianId,name,guardianAtk] of GUARDIANS){
  test(name+' quick effect can be activated by the active teammate for an inactive partner monster, once while face-up',()=>{
    let state=game(guardianId);
    const before=inventorySnapshot(state);
    const firstAttacker=deploy(state,2,AXE_RAIDER);
    const secondAttacker=deploy(state,0,AXE_RAIDER);
    const guardian=deploy(state,3,guardianId);
    assert.match(firstAttacker.uid,/^m2:/,'the first attacker must belong physically to the inactive teammate');
    assert.match(secondAttacker.uid,/^m0:/,'the second attacker must belong physically to the active teammate');
    assert.match(guardian.uid,/^m3:/,'the guardian must belong physically to the inactive defending teammate');
    state=startBattle(state);

    const firstAttack=attackAction(state,firstAttacker,guardian);
    state=tag.stepTagDuel(state,member(0),firstAttack);
    assert.equal(state.core.phase,'response','the guardian response must open during opposing damage calculation');
    assert.equal(tag.tagDecisionMember(state).id,member(1),'the active physical defender teammate owns response priority');

    const response=tag.tagActions(state,member(1)).find(candidate=>
      candidate.kind==='monsterEffect'&&candidate.card===guardian.uid&&candidate.target===firstAttacker.uid
    );
    assert.ok(response,'the active teammate must activate the inactive partner guardian effect');
    const unchanged=JSON.stringify(state);
    assert.deepEqual(tag.tagActions(state,member(3)),[],'the inactive physical guardian owner cannot submit the response');
    assert.throws(()=>tag.stepTagDuel(state,member(3),response),/Aguarde a vez do participante ativo\./);
    assert.equal(JSON.stringify(state),unchanged,'a rejected inactive-partner response must not mutate the duel');

    state=settle(tag.stepTagDuel(state,member(1),response));
    assert.equal(state.core.players[0].lp,4000-guardianAtk,'the first attacker is reduced to zero ATK for this damage calculation');
    assert.equal(state.core.players[1].lp,4000,'the defending team takes no damage');
    assert.ok(state.core.players[0].grave.some(card=>card.uid===firstAttacker.uid&&card.id===AXE_RAIDER),
      'the first inactive partner attacker is destroyed with its physical UID preserved');
    assert.ok(state.core.players[1].monsters.some(card=>card.uid===guardian.uid&&card.guardianUsed===true),
      'the guardian remains on the shared field and records its one use');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===secondAttacker.uid),
      'the second attacker remains available for the same Battle Phase');

    const secondAttack=attackAction(state,secondAttacker,guardian);
    state=tag.stepTagDuel(state,member(0),secondAttack);
    if(state.core.phase==='response'){
      assert.ok(!tag.tagActions(state,member(1)).some(candidate=>
        candidate.kind==='monsterEffect'&&candidate.card===guardian.uid
      ),'the guardian cannot activate a second time while it remains face-up');
    }
    state=settle(state);
    assert.equal(state.core.players[0].lp,4000-guardianAtk-(guardianAtk-1700),
      'the second attack resolves normally after the guardian one-use effect is spent');
    assert.equal(state.core.players[1].lp,4000);
    assert.ok(state.core.players[0].grave.some(card=>card.uid===secondAttacker.uid&&card.id===AXE_RAIDER));
    assert.ok(state.core.players[1].monsters.some(card=>card.uid===guardian.uid&&card.guardianUsed===true));
    tag.assertTagDuel(state);
    assertConserved(state,before);
  });
}
