'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const KISHIDO_SPIRIT='60519422';
const AXE_RAIDER='48305365';
const DARK_MAGICIAN='46986414';

assert.equal(getPlayableCard(KISHIDO_SPIRIT)?.kind,'spell');
assert.equal(getEffect(KISHIDO_SPIRIT)?.kind,'continuous');
assert.equal(getEffect(KISHIDO_SPIRIT)?.rules[0]?.kind,'combat');
assert.equal(getEffect(KISHIDO_SPIRIT)?.rules[0]?.rule?.kind,'indestructible');
assert.equal(getEffect(KISHIDO_SPIRIT)?.rules[0]?.rule?.equalAtk,true);
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);
assert.equal(getPlayableCard(DARK_MAGICIAN)?.atk,2500);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Kishido Spirit fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm185-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(opponentId,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M185 Seat '+seat,
    cards:deck([KISHIDO_SPIRIT,AXE_RAIDER,DARK_MAGICIAN,opponentId])
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
  throw new Error('M185 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Kishido Spirit must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Kishido Spirit must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the continuous Spell response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function activateKishido(state){
  const spell=takeCard(state,0,KISHIDO_SPIRIT);
  holder(state,0).hand.push(spell);
  assert.match(spell.uid,/^m0:/,'Kishido Spirit must retain active physical owner seat 0 identity');
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid
  );
  assert.ok(action,'the active teammate must activate its own continuous Spell to protect the partner-owned monster');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical owner cannot execute the Spell activation');
  state=settle(tag.stepTagDuel(state,member(0),action));
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===spell.uid&&card.faceUp===true),
    'Kishido Spirit must remain face-up in the shared team backrow');
  return {state,spell};
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
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical attacker owner cannot submit the attack');
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo/);
  assert.equal(JSON.stringify(state),unchanged,'a rejected partner action must not mutate the duel');
  return settle(tag.stepTagDuel(state,member(0),action));
}

test('Kishido Spirit protects a partner-owned monster in an equal-ATK battle on the shared field',()=>{
  let state=game(AXE_RAIDER,'m185-kishido-equal-atk');
  const before=inventorySnapshot(state);
  const protectedMonster=deploy(state,2,AXE_RAIDER);
  const opponent=deploy(state,3,AXE_RAIDER);
  assert.match(protectedMonster.uid,/^m2:/);
  assert.match(opponent.uid,/^m3:/);
  ({state}=activateKishido(state));
  state=startBattle(state);
  state=attack(state,protectedMonster,opponent);

  assert.equal(state.core.players[0].lp,4000,'equal ATK battle causes no battle damage to the protected team');
  assert.equal(state.core.players[1].lp,4000,'equal ATK battle causes no battle damage to the opposing team');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===protectedMonster.uid),
    'Kishido Spirit prevents the active team partner monster from being destroyed');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opponent.uid&&card.id===AXE_RAIDER),
    'the unprotected opposing monster is destroyed normally');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Kishido Spirit does not protect a partner-owned monster when the opposing ATK is higher',()=>{
  let state=game(DARK_MAGICIAN,'m185-kishido-higher-atk');
  const before=inventorySnapshot(state);
  const protectedMonster=deploy(state,2,AXE_RAIDER);
  const opponent=deploy(state,3,DARK_MAGICIAN);
  ({state}=activateKishido(state));
  state=startBattle(state);
  state=attack(state,protectedMonster,opponent);

  assert.equal(state.core.players[0].lp,4000-800,
    'the protected team still receives ordinary battle damage when the ATK values are not equal');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===protectedMonster.uid&&card.id===AXE_RAIDER),
    'Kishido Spirit does not prevent destruction against a stronger monster');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===opponent.uid),
    'the stronger opposing monster survives');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
