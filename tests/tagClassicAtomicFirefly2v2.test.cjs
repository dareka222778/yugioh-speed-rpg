'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterDefinition}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const ATOMIC_FIREFLY='87340664';
const BLUE_EYES='89631139';
const DARK_MAGICIAN='46986414';
const THOUSAND_KNIVES='63391643';
const NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>![BLUE_EYES,DARK_MAGICIAN].includes(id)).slice(0,16);
assert.equal(NORMALS.length,16,'the fixture needs sixteen distinct Normal Monster fillers');
const POOL=[ATOMIC_FIREFLY,BLUE_EYES,DARK_MAGICIAN,THOUSAND_KNIVES,...NORMALS];
assert.equal(POOL.length,20,'each physical participant must use a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'the fixture must not duplicate card identities');
assert.equal(getPlayableCard(ATOMIC_FIREFLY)?.englishName,'Atomic Firefly');
assert.equal(getEffect(ATOMIC_FIREFLY)?.kind,'monsterEffect');
assert.deepEqual(getMonsterDefinition(ATOMIC_FIREFLY),{
  effect:{trigger:'onBattleDestroyed',operation:{kind:'burn',amount:1000}},
  activation:{policy:'mandatory',window:'battleDestroyed'}
});
assert.equal(getPlayableCard(THOUSAND_KNIVES)?.englishName,'Thousand Knives');

function member(seat){return 'm250-seat-'+seat;}
function deck(){return [...POOL];}
function game(seed,first){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M250 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first,seed});
  state.core.turn=3;
  state.core.players[0].lp=2700;
  state.core.players[1].lp=3300;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(state.active[first%2],first);
  assert.equal(tag.tagDecisionMember(state).id,member(first));
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
  throw new Error('M250 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,owner:seat%2,faceUp,position,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function putSpell(state,seat,id){
  const card=takePhysical(state,seat,id);
  holder(state,seat).hand.push(card);
  return card;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'Atomic Firefly trigger windows must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function battle(state,attackerSeat,attacker,target){
  const actor=member(attackerSeat);
  const enter=tag.tagActions(state,actor).find(action=>action.kind==='battle');
  assert.ok(enter,'the active team must be able to enter the Battle Phase');
  state=tag.stepTagDuel(state,actor,enter);
  const attack=tag.tagActions(state,actor).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===target.uid
  );
  assert.ok(attack,'the active teammate may attack with the shared-field monster');
  return settle(tag.stepTagDuel(state,actor,attack));
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
  assert.equal(cards.length,before.size,'battle triggers must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'battle triggers must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical card identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(let seat=0;seat<4;seat++)for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}

for(const attackerSeat of [0,1]){
  test('Atomic Firefly destroyed while being attacked burns the destroying team '+(attackerSeat%2)+' and preserves partner ownership',()=>{
    const fireflySeat=attackerSeat===0?3:0;
    let state=game('m250-firefly-defender-'+attackerSeat,attackerSeat);
    const before=inventorySnapshot(state);
    const firefly=placeMonster(state,fireflySeat,ATOMIC_FIREFLY);
    const attacker=placeMonster(state,attackerSeat,BLUE_EYES);
    assert.match(firefly.uid,new RegExp('^m'+fireflySeat+':'));
    assert.match(attacker.uid,new RegExp('^m'+attackerSeat+':'));
    state=battle(state,attackerSeat,attacker,firefly);
    const destroyerTeam=attackerSeat%2;
    const ownerTeam=fireflySeat%2;
    assert.ok(state.core.players[ownerTeam].grave.some(card=>card.uid===firefly.uid));
    assert.ok(state.core.players[destroyerTeam].monsters.some(card=>card.uid===attacker.uid));
    const expected=[2700,3300];
    expected[destroyerTeam]-=1000;
    assert.deepEqual(state.core.players.map(player=>player.lp),expected);
    assertConserved(state,before);
    assertPrivateHands(state);
    assertRestorable(state);
  });
}

test('Atomic Firefly destroyed while attacking also burns the opponent that destroyed it',()=>{
  let state=game('m250-firefly-attacker',0);
  const before=inventorySnapshot(state);
  const firefly=placeMonster(state,2,ATOMIC_FIREFLY);
  const defender=placeMonster(state,1,BLUE_EYES);
  assert.match(firefly.uid,/^m2:/);
  state=battle(state,0,firefly,defender);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===firefly.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===defender.uid));
  assert.deepEqual(state.core.players.map(player=>player.lp),[2700,2300]);
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Atomic Firefly destroyed by an effect does not trigger its battle burn',()=>{
  let state=game('m250-firefly-effect-destruction',0);
  const before=inventorySnapshot(state);
  const firefly=placeMonster(state,3,ATOMIC_FIREFLY);
  placeMonster(state,2,DARK_MAGICIAN);
  const source=putSpell(state,0,THOUSAND_KNIVES);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===source.uid&&candidate.target===firefly.uid
  );
  assert.ok(action,'Thousand Knives must be able to destroy the opposing partner-owned Firefly');
  state=settle(tag.stepTagDuel(state,member(0),action));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===firefly.uid));
  assert.deepEqual(state.core.players.map(player=>player.lp),[2700,3300],
    'an effect destruction must not be mistaken for battle destruction');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});
