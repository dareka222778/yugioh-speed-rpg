'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const CANNON_SOLDIER='11384280';
const NORMAL_FODDER='91152256';

assert.equal(getPlayableCard(CANNON_SOLDIER)?.englishName,'Cannon Soldier');
assert.equal(getEffect(CANNON_SOLDIER)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(CANNON_SOLDIER),{
  trigger:'ignition',
  cost:{kind:'tribute',count:1},
  operation:{kind:'burn',amount:500}
});

const member=seat=>'m205-seat-'+seat;
const normalIds=[...new Set(tag.tagNormalCardIds)].slice(0,8);
assert.ok(normalIds.length>=4,'the fixture requires four enabled Normal Monsters');

function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=4);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M205 Seat '+seat,
    cards:deck([CANNON_SOLDIER,NORMAL_FODDER])
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
  throw new Error('M205 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id,name,faceUp=true){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:faceUp?'atk':'def',faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
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
  assert.equal(cards.length,before.size,'Cannon Soldier must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Cannon Soldier must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function cannonAction(state,source,tribute){
  return tag.tagActions(state,member(0)).find(action=>
    action.kind==='monsterEffect'&&action.card===source.uid&&
    Array.isArray(action.tributes)&&action.tributes.length===1&&action.tributes[0]===tribute.uid
  );
}
function settleResponses(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Cannon Soldier response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a pass action');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('Cannon Soldier may Tribute a partner-owned monster on the shared field and burns the opposing team',()=>{
  let state=game('m205-active-source-partner-cost');
  const before=inventorySnapshot(state);
  const source=placeMonster(state,0,CANNON_SOLDIER,'active-cannon');
  const partnerFodder=placeMonster(state,2,NORMAL_FODDER,'partner-fodder');
  assert.match(partnerFodder.uid,/^m2:/,'the Tribute must retain partner physical ownership');
  const partnerZones={
    hand:holder(state,2).hand.map(card=>card.uid),
    deck:holder(state,2).deck.map(card=>card.uid)
  };
  const action=cannonAction(state,source,partnerFodder);
  assert.ok(action,'the active teammate must be allowed to Tribute a partner-owned monster');
  state=settleResponses(tag.stepTagDuel(state,member(0),action));
  assert.equal(state.core.players[1].lp,3500,'500 damage is applied to the opposing shared LP');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid),'Cannon Soldier remains on the shared field');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===partnerFodder.uid),'the partner-owned Tribute enters the shared team Graveyard');
  assert.deepEqual(holder(state,2).hand.map(card=>card.uid),partnerZones.hand,'the partner private hand is untouched');
  assert.deepEqual(holder(state,2).deck.map(card=>card.uid),partnerZones.deck,'the partner private Deck is untouched');
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('a partner-owned Cannon Soldier can be activated by the active teammate without changing its physical UID',()=>{
  let state=game('m205-partner-source');
  const before=inventorySnapshot(state);
  const source=placeMonster(state,2,CANNON_SOLDIER,'partner-cannon');
  const fodder=placeMonster(state,0,NORMAL_FODDER,'active-fodder');
  assert.match(source.uid,/^m2:/,'the effect source must remain owned by physical seat 2');
  const action=cannonAction(state,source,fodder);
  assert.ok(action,'the active seat must be able to activate the teammate-owned source on its shared field');
  state=settleResponses(tag.stepTagDuel(state,member(0),action));
  assert.equal(state.core.players[1].lp,3500);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fodder.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.id===CANNON_SOLDIER));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Cannon Soldier may Tribute itself and its already-activated damage still resolves',()=>{
  let state=game('m205-self-tribute');
  const before=inventorySnapshot(state);
  const source=placeMonster(state,0,CANNON_SOLDIER,'self-tribute-cannon');
  const action=cannonAction(state,source,source);
  assert.ok(action,'the source itself is a legal one-monster Tribute');
  state=settleResponses(tag.stepTagDuel(state,member(0),action));
  assert.equal(state.core.players[1].lp,3500);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid),'the Cannon Soldier itself enters the Graveyard as cost');
  assert.ok(!state.core.players[0].monsters.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Cannon Soldier can activate repeatedly while a face-up source and legal Tributes remain',()=>{
  let state=game('m205-repeated-activation');
  const before=inventorySnapshot(state);
  const source=placeMonster(state,0,CANNON_SOLDIER,'repeat-cannon');
  const partnerFodder=placeMonster(state,2,NORMAL_FODDER,'repeat-partner-fodder');
  const activeFodder=placeMonster(state,0,NORMAL_FODDER,'repeat-active-fodder');
  let action=cannonAction(state,source,partnerFodder);
  assert.ok(action,'the first partner-owned Tribute must be legal');
  state=settleResponses(tag.stepTagDuel(state,member(0),action));
  action=cannonAction(state,source,activeFodder);
  assert.ok(action,'the second activation must be legal; Cannon Soldier has no once-per-turn limit');
  state=settleResponses(tag.stepTagDuel(state,member(0),action));
  assert.equal(state.core.players[1].lp,3000,'two resolved activations inflict 1,000 shared team damage');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===partnerFodder.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===activeFodder.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Cannon Soldier cannot Tribute an opposing monster and a face-down source cannot activate',()=>{
  let state=game('m205-opposing-target');
  const source=placeMonster(state,0,CANNON_SOLDIER,'target-filter-cannon');
  const friendly=placeMonster(state,2,NORMAL_FODDER,'friendly-fodder');
  const enemy=placeMonster(state,1,NORMAL_FODDER,'enemy-fodder');
  const actions=tag.tagActions(state,member(0)).filter(action=>action.kind==='monsterEffect'&&action.card===source.uid);
  assert.ok(actions.some(action=>action.tributes?.includes(friendly.uid)),'a teammate monster is a legal Tribute');
  assert.ok(!actions.some(action=>action.tributes?.includes(enemy.uid)),'an opposing monster is never a legal Tribute');
  assert.throws(()=>tag.stepTagDuel(state,member(0),{
    kind:'monsterEffect',card:source.uid,discards:[],tributes:[enemy.uid]
  }));
  state=game('m205-face-down-source');
  const hidden=placeMonster(state,0,CANNON_SOLDIER,'hidden-cannon',false);
  placeMonster(state,2,NORMAL_FODDER,'hidden-source-fodder');
  assert.ok(!tag.tagActions(state,member(0)).some(action=>action.kind==='monsterEffect'&&action.card===hidden.uid),
    'an ignition effect cannot be activated from a face-down monster');
  tag.assertTagDuel(state);
});
