'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const ENRAGED_BATTLE_OX='76909279';
const GYAKU_GIRE_PANDA='09817927';
const GIANT_RAT='97017120';
const AXE_RAIDER='48305365';
const CELTIC_GUARDIAN='91152256';
const MYSTICAL_ELF='15025844';
const DARK_MAGICIAN='46986414';

assert.equal(getPlayableCard(ENRAGED_BATTLE_OX)?.englishName,'Enraged Battle Ox');
assert.equal(getMonsterEffect(ENRAGED_BATTLE_OX)?.operation.kind,'continuous');
assert.equal(getPlayableCard(GYAKU_GIRE_PANDA)?.atk,800);
assert.equal(getMonsterEffect(GYAKU_GIRE_PANDA)?.operation.kind,'continuous');
assert.equal(getPlayableCard(GIANT_RAT)?.kind,'monster');
assert.equal(getPlayableCard(GIANT_RAT)?.race,'Beast');
assert.equal(getPlayableCard(AXE_RAIDER)?.race,'Warrior');
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.defense,1200);
assert.equal(getPlayableCard(MYSTICAL_ELF)?.defense,2000);
assert.equal(getPlayableCard(DARK_MAGICIAN)?.atk,2500);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the team-piercing fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm183-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(required,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M183 Seat '+seat,cards:deck(required)
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
  throw new Error('M183 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'team combat modifiers must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'team combat modifiers must not duplicate UIDs');
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
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical attacker owner cannot submit the attack');
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo/);
  assert.equal(JSON.stringify(state),unchanged,'a rejected partner action must not mutate the duel');
  return settle(tag.stepTagDuel(state,member(0),action));
}

test('Enraged Battle Ox grants piercing to a Beast controlled by its active teammate on the shared field',()=>{
  let state=game([ENRAGED_BATTLE_OX,GIANT_RAT,CELTIC_GUARDIAN],'m183-battle-ox-partner-piercing');
  const before=inventorySnapshot(state);
  const source=deploy(state,2,ENRAGED_BATTLE_OX,'atk');
  const ally=deploy(state,0,GIANT_RAT,'atk');
  const target=deploy(state,3,MYSTICAL_ELF,'def');
  assert.match(source.uid,/^m2:/,'Enraged Battle Ox must retain inactive partner physical ownership');
  assert.match(ally.uid,/^m0:/,'the Beast ally must retain active teammate physical ownership');
  assert.match(target.uid,/^m3:/,'the defending monster must retain opposing partner physical ownership');
  state=startBattle(state);
  state=attack(state,ally,target);
  assert.equal(state.core.players[1].lp,4000-200,
    'the active teammate Beast receives piercing from the inactive partner-owned Enraged Battle Ox');
  assert.equal(state.core.players[0].lp,4000);
  assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===CELTIC_GUARDIAN),
    'the Defense Position target is destroyed by battle while piercing damage reaches the shared team LP');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Enraged Battle Ox does not grant piercing to a Warrior teammate',()=>{
  let state=game([ENRAGED_BATTLE_OX,AXE_RAIDER,MYSTICAL_ELF],'m183-battle-ox-warrior-control');
  const before=inventorySnapshot(state);
  const source=deploy(state,2,ENRAGED_BATTLE_OX,'atk');
  const ally=deploy(state,0,AXE_RAIDER,'atk');
  const target=deploy(state,3,CELTIC_GUARDIAN,'def');
  assert.match(source.uid,/^m2:/);
  assert.match(ally.uid,/^m0:/);
  state=startBattle(state);
  state=attack(state,ally,target);
  assert.equal(state.core.players[1].lp,4000,
    'a Warrior outside the Beast/Beast-Warrior/Winged Beast filter must not gain piercing');
  assert.equal(state.core.players[0].lp,4000-300,
    'Axe Raider takes ordinary 300 battle damage against the 2000 DEF Fairy without piercing');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===target.uid&&card.position==='def'),
    'the 2000 DEF target remains in Defense Position without piercing damage');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Gyaku-Gire Panda counts monsters from both opposing physical seats for its ATK gain and piercing',()=>{
  let state=game([GYAKU_GIRE_PANDA,CELTIC_GUARDIAN,DARK_MAGICIAN],'m183-gyaku-gire-both-opponents');
  const before=inventorySnapshot(state);
  const panda=deploy(state,2,GYAKU_GIRE_PANDA,'atk');
  const target=deploy(state,1,CELTIC_GUARDIAN,'def');
  const otherOpponent=deploy(state,3,DARK_MAGICIAN,'atk');
  assert.match(panda.uid,/^m2:/);
  assert.match(target.uid,/^m1:/);
  assert.match(otherOpponent.uid,/^m3:/);
  state=startBattle(state);
  state=attack(state,panda,target);
  assert.equal(state.core.players[1].lp,4000-600,
    'two opposing monsters across seats 1 and 3 give Panda 1800 ATK and 600 piercing damage over 1200 DEF');
  assert.equal(state.core.players[0].lp,4000);
  assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===CELTIC_GUARDIAN),
    'the Defense Position target is destroyed by battle while the shared team receives piercing damage');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===otherOpponent.uid),
    'the second opposing seat monster remains present and contributes to Panda ATK');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
