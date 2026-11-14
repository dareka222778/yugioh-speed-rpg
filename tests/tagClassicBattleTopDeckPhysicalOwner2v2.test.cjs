'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const AXE_RAIDER='48305365';
const LEGENDARY_JUJITSU_MASTER='25773409';
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);
assert.equal(getPlayableCard(LEGENDARY_JUJITSU_MASTER)?.englishName,'Legendary Jujitsu Master');
assert.equal(getMonsterEffect(LEGENDARY_JUJITSU_MASTER)?.operation.kind,'battleTopDeckAttacker');
assert.equal(getPlayableCard(LEGENDARY_JUJITSU_MASTER)?.defense,1800);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the 2v2 top-deck fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm169-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(defensePosition,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M169 Seat '+seat,
    cards:deck(seat===2?[AXE_RAIDER]:seat===3?[LEGENDARY_JUJITSU_MASTER]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  return {state,defensePosition};
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
  throw new Error('M169 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'battle transition must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'battle transition must not duplicate UIDs');
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
function attack(state,attacker,defender){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===defender.uid
  );
  assert.ok(action,'the active teammate must receive the shared attack action');
  return settle(tag.stepTagDuel(state,member(0),action));
}

test('Legendary Jujitsu Master returns an inactive partner attacker to that physical owner Deck top when defending in Defense',()=>{
  let state=game(true,'m169-jutsu-defense-owner-deck').state;
  const before=inventorySnapshot(state);
  const attacker=deploy(state,2,AXE_RAIDER,'atk');
  const defender=deploy(state,3,LEGENDARY_JUJITSU_MASTER,'def');
  assert.match(attacker.uid,/^m2:/);
  assert.match(defender.uid,/^m3:/);
  const seat0DeckBefore=state.core.players[0].deck.map(card=>card.uid);
  const seat2DeckBefore=state.reserves[2].deck.map(card=>card.uid);
  state=startBattle(state);
  state=attack(state,attacker,defender);

  assert.equal(state.core.players[0].lp,3900,'the attacking team receives only 100 ordinary battle damage');
  assert.equal(state.core.players[1].lp,4000,'the defending team takes no battle damage');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===defender.uid&&card.position==='def'),
    'Legendary Jujitsu Master remains in the shared defending field');
  assert.equal(state.reserves[2].deck[0]?.uid,attacker.uid,
    'the attacker must be placed at the top of the inactive physical owner seat 2 Deck');
  assert.deepEqual(state.core.players[0].deck.map(card=>card.uid),seat0DeckBefore,
    'the active teammate Deck must not receive the partner-owned attacker');
  assert.deepEqual(state.reserves[2].deck.slice(1).map(card=>card.uid),seat2DeckBefore,
    'the original physical owner Deck order must otherwise remain unchanged');
  assert.ok(!state.core.players.some(team=>team.monsters.some(card=>card.uid===attacker.uid)));
  assert.ok(!state.core.players.some(team=>team.grave.some(card=>card.uid===attacker.uid)));
  assert.ok(!state.core.players.some(team=>team.banished.some(card=>card.uid===attacker.uid)));
  assert.ok(!JSON.stringify(tag.publicTagDuel(state)).includes(attacker.uid),
    'the returned private Deck card UID must not leak into the public projection');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Legendary Jujitsu Master does not return an attacker when it battles in Attack Position',()=>{
  let state=game(false,'m169-jutsu-wrong-position').state;
  const before=inventorySnapshot(state);
  const attacker=deploy(state,2,AXE_RAIDER,'atk');
  const defender=deploy(state,3,LEGENDARY_JUJITSU_MASTER,'atk');
  const seat2DeckBefore=state.reserves[2].deck.map(card=>card.uid);
  state=startBattle(state);
  state=attack(state,attacker,defender);

  assert.equal(state.core.players[1].lp,4000-400,
    'the defending team receives ordinary battle damage from Axe Raider');
  assert.equal(state.core.players[0].lp,4000);
  assert.ok(state.core.players[1].grave.some(card=>card.uid===defender.uid&&card.id===LEGENDARY_JUJITSU_MASTER),
    'the Attack Position Legendary Jujitsu Master is destroyed normally');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid),
    'the attacker remains on the field instead of being returned to the Deck');
  assert.ok(!state.reserves[2].deck.some(card=>card.uid===attacker.uid));
  assert.deepEqual(state.reserves[2].deck.map(card=>card.uid),seat2DeckBefore);
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
