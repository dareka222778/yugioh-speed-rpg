'use strict';
const {test}=require('node:test');
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

const DD_CRAZY_BEAST='48148828';
const LESSER_FIEND='16475472';
const member=seat=>'m236-seat-'+seat;
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>getPlayableCard(id))
  .filter(card=>card&&card.kind==='monster'&&Number.isInteger(card.atk)&&card.atk>0);
const HIGH=NORMALS.find(card=>card.atk>2100);
const MID=NORMALS.find(card=>card.atk>1400&&card.atk<2100);
const LOW=NORMALS.find(card=>card.atk>0&&card.atk<1400);
assert.ok(HIGH,'the negative control needs a Normal Monster stronger than D.D. Crazy Beast');
assert.ok(MID,'the defending case needs a Normal Monster weaker than Lesser Fiend');
assert.ok(LOW,'the attacking case needs a Normal Monster weaker than D.D. Crazy Beast');
const FILLERS=NORMALS.filter(card=>![HIGH.id,MID.id,LOW.id].includes(card.id)).slice(0,6);
assert.equal(FILLERS.length,6,'the four physical Decks need six additional certified Normal Monsters');
const POOL=[DD_CRAZY_BEAST,LESSER_FIEND,HIGH.id,MID.id,LOW.id,...FILLERS.map(card=>card.id)];
for(const [id,name] of [[DD_CRAZY_BEAST,'D.D. Crazy Beast'],[LESSER_FIEND,'Lesser Fiend']]){
  assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getEffect(id)?.kind,'monsterEffect');
  assert.deepEqual(getMonsterEffect(id),{
    trigger:'continuous',operation:{kind:'battleBanishVictim'}
  });
  assert.deepEqual(getMonsterDefinition(id)?.activation,{policy:'continuous',window:'continuous'});
  assert.equal(getCardStatus(id)?.stage,'certified',
    'the 2v2 integration test must reference an already behavior-certified identity');
  assert.ok(cardCertifications[id]?.suites.includes('tests/generated-m40-battle-banish.test.cjs'));
  assert.equal(cardCertifications[id].fingerprint,
    definitionFingerprint(getPlayableCard(id),getEffect(id),{
      monster:getMonsterDefinition,model:getEffectModel
    }));
  assert.equal(cardDistributionAllowed(id),false,
    '2v2 verification must not authorize inventory distribution');
}

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
  throw new Error('M236 physical card missing from seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'battle replacement must conserve every physical card');
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
    'the 2v2 battle-banished state must survive JSON restoration');
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
function createGame(sourceId,attackerId,first,seed,sourceSeat=2,attackerSeat=3){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M236 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first,seed});
  state.core.turn=3;
  state.core.players[0].lp=4000;
  state.core.players[1].lp=4000;
  const source=deploy(state,sourceSeat,sourceId);
  const attacker=deploy(state,attackerSeat,attackerId);
  assert.match(source.uid,new RegExp('^m'+sourceSeat+':'));
  assert.match(attacker.uid,new RegExp('^m'+attackerSeat+':'));
  assert.equal(source.owner,sourceSeat%2);
  assert.equal(attacker.owner,attackerSeat%2);
  assert.equal(tag.tagDecisionMember(state).id,member(first));
  rules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,source,attacker};
}
function startBattle(state,activeSeat){
  const action=tag.tagActions(state,member(activeSeat)).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active physical participant must be able to enter the Battle Phase');
  return tag.stepTagDuel(state,member(activeSeat),action);
}
function attack(state,activeSeat,attacker,source){
  const action=tag.tagActions(state,member(activeSeat)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===source.uid
  );
  assert.ok(action,'the active partner must be able to attack with the shared-field monster');
  const inactivePartner=activeSeat===0?2:3;
  assert.deepEqual(tag.tagActions(state,member(inactivePartner)),[],
    'the inactive physical partner cannot submit the shared-field attack');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(inactivePartner),action),
    /Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'rejected inactive-seat action must not mutate the duel');
  return settle(tag.stepTagDuel(state,member(activeSeat),action));
}

test('D.D. Crazy Beast banishes an opponent monster destroyed while attacking with a partner-owned source',()=>{
  const fixture=createGame(DD_CRAZY_BEAST,LOW.id,0,'m236-crazy-beast-attacks',2,3);
  const before=inventorySnapshot(fixture.state);
  const expectedDamage=engine.atk(fixture.source,fixture.state.core)-
    engine.atk(fixture.attacker,fixture.state.core);
  assert.ok(expectedDamage>0,'D.D. Crazy Beast must destroy the weaker opposing monster');
  let state=attack(startBattle(fixture.state,0),0,fixture.source,fixture.attacker);
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000-expectedDamage,
    'battle damage belongs to the opposing team');
  assert.ok(state.core.players[1].banished.some(card=>card.uid===fixture.attacker.uid),
    'the destroyed victim is banished to its physical owner team zone');
  assert.ok(!state.core.players[0].banished.some(card=>card.uid===fixture.attacker.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid),
    'D.D. Crazy Beast remains on the shared allied field');
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===fixture.attacker.uid));
  rules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertPrivateHands(state);
  assertRestorable(state);
  assertConserved(state,before);
});

test('Lesser Fiend banishes the partner-owned attacker destroyed while defending the shared field',()=>{
  const fixture=createGame(LESSER_FIEND,MID.id,1,'m236-lesser-fiend-defends',2,3);
  const before=inventorySnapshot(fixture.state);
  const expectedDamage=engine.atk(fixture.source,fixture.state.core)-
    engine.atk(fixture.attacker,fixture.state.core);
  assert.ok(expectedDamage>0,'Lesser Fiend must defeat the weaker attacking monster');
  let state=attack(startBattle(fixture.state,1),1,fixture.attacker,fixture.source);
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000-expectedDamage,
    'the attacking team receives battle damage');
  assert.ok(state.core.players[1].banished.some(card=>card.uid===fixture.attacker.uid),
    'the destroyed attacking monster is banished to its physical owner team zone');
  assert.ok(!state.core.players[0].banished.some(card=>card.uid===fixture.attacker.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid),
    'Lesser Fiend remains on the shared allied field');
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===fixture.attacker.uid));
  rules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertPrivateHands(state);
  assertRestorable(state);
  assertConserved(state,before);
});

test('D.D. Crazy Beast is sent to its own Graveyard and does not banish itself when it loses battle',()=>{
  const fixture=createGame(DD_CRAZY_BEAST,HIGH.id,1,'m236-crazy-beast-loses',2,3);
  const before=inventorySnapshot(fixture.state);
  const expectedDamage=engine.atk(fixture.attacker,fixture.state.core)-
    engine.atk(fixture.source,fixture.state.core);
  assert.ok(expectedDamage>0,'the opposing attacker must destroy D.D. Crazy Beast');
  let state=attack(startBattle(fixture.state,1),1,fixture.attacker,fixture.source);
  assert.equal(state.core.players[0].lp,4000-expectedDamage,
    'battle damage belongs to the team controlling the defeated D.D. Crazy Beast');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.source.uid),
    'the continuous effect does not banish its own source when it is destroyed');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===fixture.attacker.uid),
    'the stronger attacker survives on the opposing shared field');
  assert.ok(!state.core.players[0].banished.some(card=>card.uid===fixture.source.uid));
  assert.ok(!state.core.players[1].banished.some(card=>card.uid===fixture.attacker.uid));
  rules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertPrivateHands(state);
  assertRestorable(state);
  assertConserved(state,before);
});
