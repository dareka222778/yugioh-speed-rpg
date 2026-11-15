'use strict';
const {test:nodeTest}=require('node:test');
const fs=require('node:fs');
function recordFailure(label,error){
  fs.mkdirSync('artifacts',{recursive:true});
  fs.appendFileSync('artifacts/engine-acceptance-failure.tap','\\n[M235] '+label+'\\n'+(error?.stack||String(error))+'\\n');
}
function test(name,fn){
  nodeTest(name,async t=>{
    try{return await fn(t);}
    catch(error){recordFailure(name,error);throw error;}
  });
}
process.on('uncaughtExceptionMonitor',error=>recordFailure('module initialization',error));
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect,getMonsterDefinition}=require('../dist/monsterEffects');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {cardCertifications}=require('../dist/cardCertifications');
const {getEffectModel}=require('../dist/effectModels');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const {rulesFor}=require('../dist/rulesProfile');

const DD_ASSAILANT='70074904';
const member=seat=>'m235-seat-'+seat;
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>getPlayableCard(id))
  .filter(card=>card&&card.kind==='monster'&&Number.isInteger(card.atk)&&card.atk>0&&Number.isInteger(card.defense));
const HIGH=NORMALS.find(card=>card.atk>1700);
const LOW=NORMALS.find(card=>card.atk>0&&card.atk<1700);
assert.ok(HIGH,'the fixture needs a Normal Monster stronger than D.D. Assailant');
assert.ok(LOW,'the fixture needs a weaker Normal Monster for the negative control');
const FILLERS=NORMALS.filter(card=>![HIGH.id,LOW.id].includes(card.id)).slice(0,6);
assert.equal(FILLERS.length,6,'the four physical Decks need six additional certified Normal Monsters');
const POOL=[DD_ASSAILANT,HIGH.id,LOW.id,...FILLERS.map(card=>card.id)];
assert.equal(getPlayableCard(DD_ASSAILANT)?.englishName,'D.D. Assailant');
assert.equal(getEffect(DD_ASSAILANT)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(DD_ASSAILANT),{
  trigger:'continuous',
  operation:{kind:'battleBanishBoth',onlyIfDestroyedByBattle:true}
});
assert.deepEqual(getMonsterDefinition(DD_ASSAILANT)?.activation,{policy:'continuous',window:'continuous'});
assert.equal(getCardStatus(DD_ASSAILANT)?.stage,'certified',
  'the 2v2 integration test must reference an already behavior-certified identity');
assert.ok(cardCertifications[DD_ASSAILANT]?.suites.includes('tests/generated-m43-dd-assailant.test.cjs'));
assert.equal(cardCertifications[DD_ASSAILANT].fingerprint,
  definitionFingerprint(getPlayableCard(DD_ASSAILANT),getEffect(DD_ASSAILANT),{
    monster:getMonsterDefinition,model:getEffectModel
  }));
assert.equal(cardDistributionAllowed(DD_ASSAILANT),false,
  '2v2 verification must not authorize inventory distribution');

function deck(){return Array.from({length:20},(_,index)=>POOL[index%POOL.length]);}
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
  throw new Error('M235 physical card missing from seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function rules(state){
  const value=rulesFor(state.core);
  assert.equal(value.mainDeckMin,20);
  assert.equal(value.mainDeckMax,30);
  assert.equal(value.handLimit,6);
  assert.equal(value.handCheck,'end');
  assert.equal(value.extraDeckMax,5);
  assert.equal(value.monsterZones,3);
  assert.equal(value.spellTrapZones,3);
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
  assert.equal(cards.length,before.size,'battle banishment must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const uid of tag.tagMemberHand(state,member(seat)).map(card=>card.uid)){
    assert.ok(!publicState.includes(uid),'private hand UID leaked for physical seat '+seat+': '+uid);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))),
    'the 2v2 banished state must survive JSON restoration');
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function createGame(attackerId,seed,sourceSeat=2,attackerSeat=3){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M235 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:1,seed});
  state.core.turn=3;
  state.core.players[0].lp=4000;
  state.core.players[1].lp=4000;
  const source=deploy(state,sourceSeat,DD_ASSAILANT);
  const attacker=deploy(state,attackerSeat,attackerId);
  assert.match(source.uid,new RegExp('^m'+sourceSeat+':'),
    'D.D. Assailant must retain its physical owner UID');
  assert.match(attacker.uid,new RegExp('^m'+attackerSeat+':'),
    'the attacking monster must retain its physical owner UID');
  assert.equal(source.owner,0);
  assert.equal(attacker.owner,1);
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'physical seat 1 must begin as the active opponent teammate');
  rules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,source,attacker};
}
function startBattle(state){
  const action=tag.tagActions(state,member(1)).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'active physical seat 1 must be able to enter the Battle Phase');
  return tag.stepTagDuel(state,member(1),action);
}
function attack(state,attacker,source){
  const action=tag.tagActions(state,member(1)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===source.uid
  );
  assert.ok(action,'active seat 1 must be able to attack with its inactive partner seat 3 monster');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'inactive physical seat 3 cannot submit the partner-owned attack');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'rejected inactive-seat attack must not mutate the duel');
  return settle(tag.stepTagDuel(state,member(1),action));
}

test('D.D. Assailant banishes itself and the partner-owned attacker into their respective team banished zones',()=>{
  const fixture=createGame(HIGH.id,'m235-dd-assailant-both-banished');
  const before=inventorySnapshot(fixture.state);
  const expectedDamage=engine.atk(fixture.attacker,fixture.state.core)-
    engine.atk(fixture.source,fixture.state.core);
  assert.ok(expectedDamage>0,'the opposing partner-owned attacker must destroy D.D. Assailant by battle');
  let state=attack(startBattle(fixture.state),fixture.attacker,fixture.source);
  assert.equal(state.core.players[0].lp,4000-expectedDamage,
    'battle damage is applied to the defending team before the banish replacement resolves');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(state.core.players[0].banished.some(card=>card.uid===fixture.source.uid&&card.id===DD_ASSAILANT),
    'D.D. Assailant is banished by its own battle-destruction effect');
  assert.ok(state.core.players[1].banished.some(card=>card.uid===fixture.attacker.uid),
    'the monster that destroyed D.D. Assailant is banished to its own team zone');
  assert.ok(!state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid));
  assert.ok(!state.core.players[1].monsters.some(card=>card.uid===fixture.attacker.uid));
  assert.ok(!state.core.players[0].grave.some(card=>card.uid===fixture.source.uid));
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===fixture.attacker.uid));
  rules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertPrivateHands(state);
  assertRestorable(state);
  assertConserved(state,before);
});

test('D.D. Assailant does not banish either monster when it survives battle against a weaker partner-owned attacker',()=>{
  const fixture=createGame(LOW.id,'m235-dd-assailant-survives',0,3);
  const before=inventorySnapshot(fixture.state);
  const expectedDamage=engine.atk(fixture.source,fixture.state.core)-
    engine.atk(fixture.attacker,fixture.state.core);
  assert.ok(expectedDamage>0,'D.D. Assailant must survive and destroy the weaker attacker');
  let state=attack(startBattle(fixture.state),fixture.attacker,fixture.source);
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000-expectedDamage,
    'battle damage belongs to the attacking team when its monster loses');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid),
    'D.D. Assailant remains on the shared allied field');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.attacker.uid),
    'the defeated attacker enters the opposing shared Graveyard');
  assert.ok(!state.core.players[0].banished.some(card=>card.uid===fixture.source.uid));
  assert.ok(!state.core.players[1].banished.some(card=>card.uid===fixture.attacker.uid));
  rules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertPrivateHands(state);
  assertRestorable(state);
  assertConserved(state,before);
});
