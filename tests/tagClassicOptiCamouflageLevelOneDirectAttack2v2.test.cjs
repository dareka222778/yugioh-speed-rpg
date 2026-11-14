'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const OPTI_CAMOUFLAGE='95638658';
const KURIBOH='40640057';
const AXE_RAIDER='48305365';
const CELTIC_GUARDIAN='91152256';

assert.equal(getPlayableCard(OPTI_CAMOUFLAGE)?.kind,'spell');
assert.equal(getEffect(OPTI_CAMOUFLAGE)?.kind,'equip');
assert.equal(getEffect(OPTI_CAMOUFLAGE)?.maxLevel,1);
assert.equal(getEffect(OPTI_CAMOUFLAGE)?.atk,-1000);
assert.ok(getEffect(OPTI_CAMOUFLAGE)?.combat?.some(rule=>rule.kind==='direct'));
assert.equal(getPlayableCard(KURIBOH)?.level,1);
assert.equal(getPlayableCard(KURIBOH)?.atk,300);
assert.ok((getPlayableCard(AXE_RAIDER)?.level??0)>1);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Opti-Camouflage fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm193-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M193 Seat '+seat,
    cards:deck([OPTI_CAMOUFLAGE,KURIBOH,AXE_RAIDER,CELTIC_GUARDIAN])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m193-opti-camouflage-level1'});
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
  throw new Error('M193 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Opti-Camouflage must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Opti-Camouflage must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Equip Spell response chain must terminate');
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

test('Opti-Camouflage Armor equips only a Level 1 partner-owned monster and permits direct attack through an opposing monster',()=>{
  let state=game();
  const before=inventorySnapshot(state);
  const kuriboh=deploy(state,2,KURIBOH);
  const axeRaider=deploy(state,0,AXE_RAIDER);
  const blocker=deploy(state,3,CELTIC_GUARDIAN);
  assert.match(kuriboh.uid,/^m2:/,'Kuriboh retains inactive partner physical ownership');
  assert.match(axeRaider.uid,/^m0:/,'Axe Raider retains active physical ownership');
  assert.match(blocker.uid,/^m3:/,'the opposing blocker retains partner physical ownership');

  const equipCard=takeCard(state,0,OPTI_CAMOUFLAGE);
  holder(state,0).hand.push(equipCard);
  const actions=tag.tagActions(state,member(0)).filter(candidate=>
    candidate.kind==='spell'&&candidate.card===equipCard.uid
  );
  assert.ok(actions.some(action=>action.target===kuriboh.uid),
    'the active teammate can equip Opti-Camouflage Armor to a partner-owned Level 1 monster');
  assert.ok(!actions.some(action=>action.target===axeRaider.uid),
    'the equip restriction rejects a monster above Level 1');
  const activation=actions.find(action=>action.target===kuriboh.uid);
  state=settle(tag.stepTagDuel(state,member(0),activation));
  const equipped=state.core.players[0].backrow.find(card=>card.uid===equipCard.uid);
  assert.ok(equipped&&equipped.faceUp);
  assert.equal(equipped.equippedTo,kuriboh.uid);
  const liveKuriboh=state.core.players[0].monsters.find(card=>card.uid===kuriboh.uid);
  assert.ok(engine.atk(liveKuriboh,state.core)<=300,
    'Opti-Camouflage Armor applies its -1000 ATK modifier to the Level 1 monster');

  state=startBattle(state);
  const direct=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===kuriboh.uid&&action.target===undefined
  );
  assert.ok(direct,
    'the equipped Level 1 monster can declare a direct attack while the opposing team still controls a blocker');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===blocker.uid),
    'the direct attack bypasses but does not remove the opposing monster');
  state=settle(tag.stepTagDuel(state,member(0),direct));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
