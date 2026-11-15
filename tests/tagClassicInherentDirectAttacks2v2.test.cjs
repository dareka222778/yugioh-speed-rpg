'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const DIRECT_ATTACKERS=[
  {id:'12472242',name:'Leghul',atk:300},
  {id:'21347810',name:'Rainbow Flower',atk:400},
  {id:'58861941',name:'Ooguchi',atk:300},
  {id:'32809211',name:'Jinzo #7',atk:500},
  {id:'02792265',name:'Servant of Catabolism',atk:700},
  {id:'59290628',name:'Nightmare Horse',atk:500}
];
for(const entry of DIRECT_ATTACKERS){
  assert.equal(getPlayableCard(entry.id)?.englishName,entry.name,'direct attacker must be certified and playable: '+entry.name);
  assert.equal(getPlayableCard(entry.id)?.atk,entry.atk,'printed ATK must match the card record: '+entry.name);
  assert.deepEqual(getMonsterEffect(entry.id),{
    trigger:'continuous',operation:{kind:'directAttack'}
  },entry.name+' must use the audited unconditional direct-attack operation');
  assert.equal(getEffect(entry.id)?.kind,'monsterEffect');
}

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster')
  .slice(0,14);
assert.equal(NORMALS.length,14,'the fixture needs fourteen distinct certified Normal Monsters');
const POOL=[...DIRECT_ATTACKERS.map(card=>card.id),...NORMALS];
assert.equal(POOL.length,20);
assert.equal(new Set(POOL).size,20,'the 20-card fixture must not duplicate identities');

function member(seat){return 'm243-seat-'+seat;}
function deck(){return [...POOL];}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M243 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.deepEqual(state.active,[0,1]);
  return state;
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takePhysical(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M243 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function startBattle(state){
  const actor=tag.tagDecisionMember(state).id;
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active teammate must be allowed to enter the Battle Phase');
  return tag.stepTagDuel(state,actor,action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'the battle response windows must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'battle must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'battle must not duplicate physical UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
function setup(sourceId,seed){
  let state=game(seed);
  const before=inventorySnapshot(state);
  const source=placeMonster(state,2,sourceId);
  const enemyActive=placeMonster(state,1,NORMALS[0]);
  const enemyPartner=placeMonster(state,3,NORMALS[1]);
  assert.match(source.uid,/^m2:/,'the direct attacker must retain inactive partner seat 2 physical ownership');
  assert.match(enemyActive.uid,/^m1:/);
  assert.match(enemyPartner.uid,/^m3:/);
  assert.equal(tag.tagActions(state,member(2)).length,0,'inactive physical partner cannot act');
  state=startBattle(state);
  assert.equal(tag.tagDecisionMember(state).id,member(0),'the active teammate controls the shared field');
  return {state,before,source,enemyActive,enemyPartner};
}

for(const entry of DIRECT_ATTACKERS){
  test(entry.name+' can attack the opposing team directly while both physical opponents control monsters',()=>{
    const {state:initial,before,source,enemyActive,enemyPartner}=setup(entry.id,'m243-direct-'+entry.id);
    const action=tag.tagActions(initial,member(0)).find(candidate=>
      candidate.kind==='attack'&&candidate.card===source.uid&&candidate.target===undefined
    );
    assert.ok(action,entry.name+' must expose a direct-attack action despite monsters on both opposing seats');
    let state=tag.stepTagDuel(initial,member(0),action);
    state=settle(state);
    assert.equal(state.core.players[0].lp,8000,'the attacking team must not lose LP');
    assert.equal(state.core.players[1].lp,8000-entry.atk,'direct battle damage must be routed to the opposing shared team');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid),'the partner-owned attacker remains on its shared field');
    assert.ok(state.core.players[1].monsters.some(card=>card.uid===enemyActive.uid),'direct attack must not destroy the active opponent monster');
    assert.ok(state.core.players[1].monsters.some(card=>card.uid===enemyPartner.uid),'direct attack must not destroy the inactive opponent partner monster');
    assertConserved(state,before);
    assertPrivateHands(state);
    assertRestorable(state);
  });
}

test('an ordinary Normal Monster cannot attack directly while either opposing 2v2 seat controls a monster',()=>{
  let state=game('m243-normal-control');
  const before=inventorySnapshot(state);
  const source=placeMonster(state,2,NORMALS[2]);
  placeMonster(state,1,NORMALS[3]);
  placeMonster(state,3,NORMALS[4]);
  state=startBattle(state);
  const direct=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===source.uid&&action.target===undefined
  );
  assert.equal(direct,undefined,'only a registered direct-attack effect bypasses opposing monsters');
  assert.ok(tag.tagActions(state,member(0)).some(action=>
    action.kind==='attack'&&action.card===source.uid&&!!action.target
  ),'the normal attacker must still be able to select an opposing monster');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});
