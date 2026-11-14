'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const DARK_ELF='21417692';
const TOLL='82003859';
const AXE_RAIDER='48305365';

assert.equal(getPlayableCard(DARK_ELF)?.atk,2000);
assert.equal(getMonsterEffect(DARK_ELF)?.operation.kind,'continuous');
assert.equal(getEffect(TOLL)?.kind,'continuous');
assert.equal(getEffect(TOLL)?.rules[0]?.kind,'combat');
assert.equal(getEffect(TOLL)?.rules[0]?.rule?.kind,'attackLP');
assert.equal(getEffect(TOLL)?.rules[0]?.rule?.amount,500);
assert.equal(getEffect(TOLL)?.rules[0]?.rule?.playerRule,true);
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the attack-cost fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm186-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(required,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M186 Seat '+seat,cards:deck(required)
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
  throw new Error('M186 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'attack LP costs must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'attack LP costs must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the attack response chain must terminate');
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
function directAttack(state,source){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===source.uid&&candidate.target===undefined
  );
  assert.ok(action,'the active teammate must receive the partner-owned direct attack action');
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical owner cannot submit the direct attack');
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo/);
  assert.equal(JSON.stringify(state),unchanged,'a rejected partner action must not mutate the duel');
  return settle(tag.stepTagDuel(state,member(0),action));
}

test('Dark Elf charges its shared team 1000 LP for each partner-owned attack declaration',()=>{
  let state=game([DARK_ELF],'m186-dark-elf-attack-cost');
  const before=inventorySnapshot(state);
  const elf=deploy(state,2,DARK_ELF);
  assert.match(elf.uid,/^m2:/);
  state=startBattle(state);
  state=directAttack(state,elf);
  assert.equal(state.core.players[0].lp,3000,
    'the shared team controlling Dark Elf pays 1000 LP when the active teammate declares its attack');
  assert.equal(state.core.players[1].lp,2000,
    'Dark Elf then deals its ordinary 2000 direct battle damage to the opposing shared team');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===elf.uid),
    'Dark Elf remains on the shared field after the paid attack');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Dark Elf cannot declare an attack when its shared team cannot pay 1000 LP',()=>{
  let state=game([DARK_ELF],'m186-dark-elf-insufficient-lp');
  const elf=deploy(state,2,DARK_ELF);
  state.core.players[0].lp=1000;
  state=startBattle(state);
  const actions=tag.tagActions(state,member(0)).filter(action=>
    action.kind==='attack'&&action.card===elf.uid
  );
  assert.deepEqual(actions,[],
    'the active teammate must not receive an attack action when the shared LP cannot pay Dark Elf cost');
  tag.assertTagDuel(state);
});

test('Toll charges 500 LP to the attacking shared team when an active teammate declares a partner-owned attack',()=>{
  let state=game([TOLL,AXE_RAIDER],'m186-toll-attack-cost');
  const before=inventorySnapshot(state);
  const toll=takeCard(state,0,TOLL);
  holder(state,0).hand.push(toll);
  const attacker=deploy(state,2,AXE_RAIDER);
  assert.match(toll.uid,/^m0:/,'Toll must retain active physical seat 0 ownership');
  assert.match(attacker.uid,/^m2:/);
  const activation=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===toll.uid
  );
  assert.ok(activation,'the active teammate must activate its own continuous Spell to tax partner-owned attacks');
  state=settle(tag.stepTagDuel(state,member(0),activation));
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===toll.uid&&card.faceUp===true),
    'Toll remains face-up in the shared team backrow');
  state=startBattle(state);
  state=directAttack(state,attacker);
  assert.equal(state.core.players[0].lp,3500,
    'Toll charges 500 LP to the attacking team before the direct battle damage');
  assert.equal(state.core.players[1].lp,2300,
    'Axe Raider deals 1700 direct damage to the opposing shared team');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
