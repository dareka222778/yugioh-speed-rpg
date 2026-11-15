'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {combatRuleIssues}=require('../dist/combatRules');
const {rulesFor}=require('../dist/rulesProfile');

const SWORD='94004268';
const BLUE_EYES='89631139';
const CELTIC_GUARDIAN='91152256';

assert.equal(getPlayableCard(SWORD)?.englishName,'Amazoness Swords Woman');
assert.equal(getCardStatus(SWORD)?.stage,'certified');
assert.equal(getEffect(SWORD)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(SWORD),{
  trigger:'continuous',
  operation:{
    kind:'continuous',
    rules:[{
      kind:'combat',
      filter:{selfOnly:true},
      rule:{kind:'damage',mode:'reflect',when:'battle'}
    }]
  }
});

const CORE_IDS=[SWORD,BLUE_EYES,CELTIC_GUARDIAN];
const FILLER_IDS=[...new Set(tag.tagNormalCardIds)].filter(id=>!CORE_IDS.includes(id)).slice(0,17);
const DECK=[...CORE_IDS,...FILLER_IDS];
assert.equal(DECK.length,20,'each physical participant must use a legal 20-card Deck');

function member(seat){return 'm238-seat-'+seat;}
function createGame(seed,first=2){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M238 Seat '+seat,cards:[...DECK]}));
  const state=tag.createTagDuel(players,{classic:true,first,seed});
  state.core.turn=3;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
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
  throw new Error('M238 physical card missing from seat '+seat+': '+id);
}
function deploy(state,seat,id,position='atk',faceUp=true){
  const physical=takePhysical(state,seat,id);
  const monster={...physical,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<40,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function startBattle(state,seat){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active physical participant must be able to enter the Battle Phase');
  state=settle(tag.stepTagDuel(state,member(seat),action));
  assert.equal(state.core.phase,'battle');
  return state;
}
function attack(state,seat,attacker,target){
  const action=tag.tagActions(state,member(seat)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===target.uid
  );
  assert.ok(action,'the active teammate must be able to attack with the shared-field monster');
  return settle(tag.stepTagDuel(state,member(seat),action));
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
  assert.equal(cards.length,before.size,'battle damage replacement must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat+': '+card.uid);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
function inGrave(state,team,uid){
  return state.core.players[team].grave.some(card=>card.uid===uid);
}

test('Amazoness Swords Woman redirects damage when she attacks a stronger opposing monster',()=>{
  let state=createGame('m238-attacking-stronger-monster');
  const before=inventorySnapshot(state);
  const sword=deploy(state,0,SWORD,'atk');
  const blueEyes=deploy(state,3,BLUE_EYES,'atk');

  assert.ok(sword.uid.startsWith('m0:'),'the source belongs physically to the inactive allied partner');
  assert.equal(tag.tagActions(state,member(0)).length,0,'the inactive partner cannot declare the attack');
  state=startBattle(state,2);
  state=attack(state,2,sword,blueEyes);

  assert.equal(state.core.players[0].lp,4000,'the Swords Woman controller team takes no battle damage');
  assert.equal(state.core.players[1].lp,2500,'the opposing team receives the 1500 damage instead');
  assert.ok(inGrave(state,0,sword.uid),'the defeated Swords Woman is still destroyed by battle');
  assert.ok(state.core.players[1].monsters.some(m=>m.uid===blueEyes.uid),'the stronger defender survives');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Amazoness Swords Woman also redirects damage when defending for the inactive physical partner',()=>{
  let state=createGame('m238-defending-from-stronger-monster',3);
  const before=inventorySnapshot(state);
  const sword=deploy(state,2,SWORD,'atk');
  const blueEyes=deploy(state,3,BLUE_EYES,'atk');

  assert.ok(sword.uid.startsWith('m2:'),'the source belongs physically to the inactive allied partner');
  assert.equal(state.active[1],3,'the attacking opponent is the active physical member');
  state=startBattle(state,3);
  state=attack(state,3,blueEyes,sword);

  assert.equal(state.core.players[0].lp,4000,'the Swords Woman controller team is protected from the battle damage');
  assert.equal(state.core.players[1].lp,2500,'the attacking team receives the redirected 1500 damage');
  assert.ok(inGrave(state,0,sword.uid),'the defending Swords Woman is destroyed by battle');
  assert.ok(state.core.players[1].monsters.some(m=>m.uid===blueEyes.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('damage dealt to the opponent normally is not redirected by Amazoness Swords Woman',()=>{
  let state=createGame('m238-normal-damage-to-opponent');
  const before=inventorySnapshot(state);
  const sword=deploy(state,0,SWORD,'atk');
  const celtic=deploy(state,3,CELTIC_GUARDIAN,'atk');
  state=startBattle(state,2);
  state=attack(state,2,sword,celtic);

  assert.equal(state.core.players[0].lp,4000,'the Swords Woman team receives no damage');
  assert.equal(state.core.players[1].lp,3900,'the opposing team still takes the normal 100 battle damage');
  assert.ok(state.core.players[0].monsters.some(m=>m.uid===sword.uid));
  assert.ok(inGrave(state,1,celtic.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('battle-damage reflection is accepted only for battle damage',()=>{
  assert.deepEqual(combatRuleIssues({kind:'damage',mode:'reflect',when:'battle'}),[]);
  assert.ok(combatRuleIssues({kind:'damage',mode:'reflect',when:'direct'}).includes('invalid-battle-damage-rule'));
  assert.ok(combatRuleIssues({kind:'damage',mode:'reflect',when:'defending'}).includes('invalid-battle-damage-rule'));
});
