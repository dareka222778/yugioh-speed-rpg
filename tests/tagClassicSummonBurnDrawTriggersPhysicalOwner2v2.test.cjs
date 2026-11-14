'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const GRAVEKEEPERS_CURSE='50712728';
const SACRED_CRANE='30914564';
const MONSTER_REBORN='83764718';

assert.equal(getMonsterEffect(GRAVEKEEPERS_CURSE)?.trigger,'onSummon');
assert.equal(getMonsterEffect(GRAVEKEEPERS_CURSE)?.operation.kind,'burn');
assert.equal(getMonsterEffect(GRAVEKEEPERS_CURSE)?.operation.amount,500);
assert.deepEqual(getMonsterEffect(GRAVEKEEPERS_CURSE)?.summons,['normal','flip','special']);
assert.equal(getMonsterEffect(SACRED_CRANE)?.trigger,'onSummon');
assert.equal(getMonsterEffect(SACRED_CRANE)?.operation.kind,'draw');
assert.equal(getMonsterEffect(SACRED_CRANE)?.operation.count,1);
assert.deepEqual(getMonsterEffect(SACRED_CRANE)?.summons,['special']);
assert.equal(getEffect(MONSTER_REBORN)?.kind,'specialSummon');
assert.equal(getPlayableCard(GRAVEKEEPERS_CURSE)?.atk,800);
assert.equal(getPlayableCard(SACRED_CRANE)?.atk,1600);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the summon-trigger fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm198-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(required,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M198 Seat '+seat,cards:deck(required)
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
  throw new Error('M198 fixture card missing from physical seat '+seat+': '+id);
}
function deployFaceDown(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'def',faceUp:false,
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
  assert.equal(cards.length,before.size,'summon triggers must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'summon triggers must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the mandatory summon trigger response must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a pass action');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('Gravekeeper\\'s Curse inflicts 500 shared-team damage after Normal Summon',()=>{
  let state=game([GRAVEKEEPERS_CURSE],'m198-gravekeepers-curse-normal');
  const before=inventorySnapshot(state);
  const physical=holder(state,0);
  const source=takeCard(state,0,GRAVEKEEPERS_CURSE);
  physical.hand.push(source);
  const summon=tag.tagActions(state,member(0)).find(action=>
    action.kind==='summon'&&action.card===source.uid&&action.position==='atk'
  );
  assert.ok(summon,'the active physical owner can Normal Summon Gravekeeper\\'s Curse');
  state=settle(tag.stepTagDuel(state,member(0),summon));
  assert.equal(state.core.players[1].lp,3500,
    'the mandatory on-Summon effect inflicts exactly 500 damage to the opposing shared team');
  assert.equal(state.core.players[0].lp,4000);
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Gravekeeper\\'s Curse inflicts 500 shared-team damage when a partner-owned copy is Flip Summoned',()=>{
  let state=game([GRAVEKEEPERS_CURSE],'m198-gravekeepers-curse-flip');
  const before=inventorySnapshot(state);
  const source=deployFaceDown(state,2,GRAVEKEEPERS_CURSE);
  const flip=tag.tagActions(state,member(0)).find(action=>
    action.kind==='position'&&action.card===source.uid&&action.mode==='flip'
  );
  assert.ok(flip,'the active teammate can Flip Summon the partner-owned Gravekeeper\\'s Curse');
  state=settle(tag.stepTagDuel(state,member(0),flip));
  assert.equal(state.core.players[1].lp,3500,
    'the Flip Summon trigger inflicts exactly 500 damage to the opposing shared team');
  assert.equal(state.core.players[0].lp,4000);
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Sacred Crane draws from the active physical Deck when a partner-owned copy is Special Summoned',()=>{
  let state=game([SACRED_CRANE,MONSTER_REBORN],'m198-sacred-crane-special');
  const before=inventorySnapshot(state);
  const crane=takeCard(state,2,SACRED_CRANE);
  state.core.players[0].grave.push(crane);
  const reborn=takeCard(state,0,MONSTER_REBORN);
  holder(state,0).hand.push(reborn);
  const drawUid=state.core.players[0].deck[0].uid;
  const deckBefore=state.core.players[0].deck.length;
  const handBefore=holder(state,0).hand.length;

  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===reborn.uid&&candidate.target===crane.uid
  );
  assert.ok(action,'the active player can activate Monster Reborn on a partner-owned Sacred Crane in the shared Graveyard');
  state=settle(tag.stepTagDuel(state,member(0),action));

  assert.ok(state.core.players[0].monsters.some(card=>card.uid===crane.uid&&card.id===SACRED_CRANE),
    'the Special Summoned Sacred Crane retains its original partner physical UID');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===reborn.uid&&card.id===MONSTER_REBORN),
    'Monster Reborn enters the shared Graveyard after resolution');
  assert.equal(state.core.players[0].deck.length,deckBefore-1,
    'Sacred Crane draws exactly one card from the active physical Deck');
  assert.ok(holder(state,0).hand.some(card=>card.uid===drawUid),
    'the exact top card of the active physical Deck enters the active physical hand');
  assert.equal(holder(state,0).hand.length,handBefore,
    'one Spell is spent and one draw is gained');
  assert.ok(!holder(state,2).hand.some(card=>card.uid===drawUid),
    'the partner physical hand does not receive Sacred Crane draw');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
