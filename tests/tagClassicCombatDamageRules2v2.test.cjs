'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const AMAZONESS_FIGHTER='55821894';
const SANCTUARY='56433456';
const PIRANHA_ARMY='50823978';
const STONE_STATUE='31812496';
const OBNOXIOUS_CELTIC='52077741';
const BLUE_EYES='89631139';
const DARK_MAGICIAN='46986414';
const CELTIC_GUARDIAN='91152256';
const MYSTICAL_ELF='15025844';

const FIXED=[
  AMAZONESS_FIGHTER,SANCTUARY,PIRANHA_ARMY,STONE_STATUE,OBNOXIOUS_CELTIC,
  BLUE_EYES,DARK_MAGICIAN,CELTIC_GUARDIAN,MYSTICAL_ELF
];
for(const id of FIXED)assert.ok(getPlayableCard(id),'M252 card must already be certified and playable: '+id);
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster'&&!FIXED.includes(id));
const FILLERS=NORMALS.slice(0,11);
assert.equal(FILLERS.length,11,'the fixture needs eleven additional distinct certified Normal Monsters');
const POOL=[...FIXED,...FILLERS];
assert.equal(POOL.length,20,'each physical participant must use a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'the fixture must not duplicate card identities');

function member(seat){return 'm252-seat-'+seat;}
function deck(){return [...POOL];}
function game(seed,first=0){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M252 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first,seed});
  state.core.turn=3;
  state.core.players[0].lp=4000;
  state.core.players[1].lp=4000;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
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
  throw new Error('M252 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id,options={}){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,
    owner:seat%2,
    faceUp:options.faceUp!==false,
    position:options.position??'atk',
    entered:0,
    changed:0,
    attacked:0,
    atkBoost:0,
    defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function putInHand(state,seat,id){
  const card=takePhysical(state,seat,id);
  holder(state,seat).hand.push(card);
  return card;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'M252 battle response windows must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function startBattle(state,seat){
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'active physical seat '+seat+' must be able to enter the Battle Phase');
  return tag.stepTagDuel(state,actor,action);
}
function attack(state,seat,attacker,target){
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&
    (target===undefined?candidate.target===undefined:candidate.target===target.uid)
  );
  assert.ok(action,'active physical seat '+seat+' must receive the intended shared-field attack');
  const inactivePartner=seat+2;
  assert.deepEqual(tag.tagActions(state,member(inactivePartner)),[],
    'the inactive physical partner cannot submit a shared-field attack');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(inactivePartner),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'rejected inactive-seat attack must not mutate the duel');
  return settle(tag.stepTagDuel(state,actor,action));
}
function activateSanctuary(state){
  const source=putInHand(state,0,SANCTUARY);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='field'&&candidate.card===source.uid
  );
  assert.ok(action,'The Sanctuary in the Sky must be activatable by the active teammate');
  state=settle(tag.stepTagDuel(state,member(0),action));
  assert.equal(state.core.players[0].field?.uid,source.uid);
  assert.equal(state.core.players[0].field?.faceUp,true);
  assert.match(source.uid,/^m0:/,'the Field Spell must retain the physical UID of its owner');
  return {state,source};
}
function endTurn(state,seat){
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active teammate must be able to end the Main Phase');
  state=tag.stepTagDuel(state,actor,action);
  return state;
}
function monster(state,team,uid){
  return state.core.players[team].monsters.find(card=>card.uid===uid);
}
function inGrave(state,team,uid){
  return state.core.players[team].grave.some(card=>card.uid===uid);
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
  assert.equal(cards.length,before.size,'combat resolution must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'combat must not duplicate UIDs');
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

test('M252 metadata and format: five combat rules retain their audited certified identities',()=>{
  const expected=[
    [AMAZONESS_FIGHTER,'Amazoness Fighter'],
    [SANCTUARY,'The Sanctuary in the Sky'],
    [PIRANHA_ARMY,'Piranha Army'],
    [STONE_STATUE,'Stone Statue of the Aztecs'],
    [OBNOXIOUS_CELTIC,'Obnoxious Celtic Guard']
  ];
  for(const [id,name] of expected)assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getEffect(AMAZONESS_FIGHTER)?.kind,'monsterEffect');
  assert.equal(getEffect(SANCTUARY)?.kind,'field');
  assert.equal(getEffect(PIRANHA_ARMY)?.kind,'monsterEffect');
  assert.equal(getEffect(STONE_STATUE)?.kind,'monsterEffect');
  assert.equal(getEffect(OBNOXIOUS_CELTIC)?.kind,'monsterEffect');
  assert.deepEqual(getMonsterEffect(AMAZONESS_FIGHTER)?.operation,{
    kind:'continuous',rules:[{kind:'combat',filter:{selfOnly:true},rule:{kind:'damage',mode:'zero',when:'battle'}}]
  });
  assert.deepEqual(getMonsterEffect(PIRANHA_ARMY)?.operation,{
    kind:'continuous',rules:[{kind:'combat',filter:{selfOnly:true},rule:{kind:'damage',mode:'double',when:'direct'}}]
  });
  assert.deepEqual(getMonsterEffect(STONE_STATUE)?.operation,{
    kind:'continuous',rules:[{kind:'combat',filter:{selfOnly:true},rule:{kind:'damage',mode:'double',when:'defending'}}]
  });
  assert.deepEqual(getMonsterEffect(OBNOXIOUS_CELTIC)?.operation,{
    kind:'continuous',rules:[{kind:'combat',filter:{selfOnly:true},rule:{kind:'indestructible',opponentAtkAtLeast:1900}}]
  });
  const state=game('m252-format');
  assert.equal(tag.tagInventory(state).length,80);
  assertRestorable(state);
});

test('Amazoness Fighter prevents battle damage to its team when the partner-owned Fighter attacks a stronger monster',()=>{
  let state=game('m252-amazoness-attacks',0);
  const before=inventorySnapshot(state);
  const fighter=placeMonster(state,2,AMAZONESS_FIGHTER);
  const enemy=placeMonster(state,3,BLUE_EYES);
  assert.match(fighter.uid,/^m2:/);
  state=startBattle(state,0);
  state=attack(state,0,fighter,enemy);
  assert.equal(state.core.players[0].lp,4000,'the Fighter controller must take zero battle damage');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(inGrave(state,0,fighter.uid),'damage prevention must not prevent the Fighter from being destroyed by battle');
  assert.equal(monster(state,0,fighter.uid),undefined);
  assert.ok(monster(state,1,enemy.uid),'the stronger opposing monster must survive');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Amazoness Fighter prevents battle damage when the opponent attacks a partner-owned Fighter',()=>{
  let state=game('m252-amazoness-defends',1);
  const before=inventorySnapshot(state);
  const fighter=placeMonster(state,2,AMAZONESS_FIGHTER);
  const enemy=placeMonster(state,3,BLUE_EYES);
  state=startBattle(state,1);
  state=attack(state,1,enemy,fighter);
  assert.equal(state.core.players[0].lp,4000,'the Fighter controller must take zero battle damage while defending');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(inGrave(state,0,fighter.uid));
  assert.equal(monster(state,0,fighter.uid),undefined);
  assert.ok(monster(state,1,enemy.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('The Sanctuary in the Sky protects an allied Fairy controlled by the inactive partner',()=>{
  let state=game('m252-sanctuary-allied-fairy',0);
  const before=inventorySnapshot(state);
  const fairy=placeMonster(state,2,MYSTICAL_ELF);
  const enemy=placeMonster(state,3,BLUE_EYES);
  const activated=activateSanctuary(state);
  state=activated.state;
  state=endTurn(state,0);
  assert.equal(tag.tagDecisionMember(state).id,member(1));
  state=startBattle(state,1);
  state=attack(state,1,enemy,fairy);
  assert.equal(state.core.players[0].lp,4000,'the allied Fairy controller must take zero battle damage');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(inGrave(state,0,fairy.uid),'the Field Spell protects LP, not the Fairy from battle destruction');
  assert.ok(monster(state,1,enemy.uid));
  assert.ok(state.core.players[0].field?.uid===activated.source.uid);
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('The Sanctuary in the Sky also protects an opposing Fairy; its rule is not restricted to the Field Spell controller',()=>{
  let state=game('m252-sanctuary-opposing-fairy',0);
  const before=inventorySnapshot(state);
  const enemyFairy=placeMonster(state,3,MYSTICAL_ELF);
  const attacker=placeMonster(state,2,BLUE_EYES);
  const activated=activateSanctuary(state);
  state=activated.state;
  state=startBattle(state,0);
  state=attack(state,0,attacker,enemyFairy);
  assert.equal(state.core.players[1].lp,4000,'the opposing Fairy controller must also take zero battle damage');
  assert.equal(state.core.players[0].lp,4000);
  assert.ok(inGrave(state,1,enemyFairy.uid));
  assert.ok(monster(state,0,attacker.uid));
  assert.ok(state.core.players[0].field?.uid===activated.source.uid);
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('The Sanctuary in the Sky does not protect a non-Fairy partner-owned monster',()=>{
  let state=game('m252-sanctuary-non-fairy-control',0);
  const before=inventorySnapshot(state);
  const ally=placeMonster(state,2,CELTIC_GUARDIAN);
  const enemy=placeMonster(state,3,BLUE_EYES);
  activateSanctuary(state).state;
  const field=state.core.players[0].field;
  assert.ok(field?.faceUp);
  state=endTurn(state,0);
  state=startBattle(state,1);
  state=attack(state,1,enemy,ally);
  assert.equal(state.core.players[0].lp,2400,'a non-Fairy controller must take ordinary 1600 battle damage');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(inGrave(state,0,ally.uid));
  assert.ok(monster(state,1,enemy.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Piranha Army doubles direct battle damage to the opposing shared team',()=>{
  let state=game('m252-piranha-direct',0);
  const before=inventorySnapshot(state);
  const piranha=placeMonster(state,2,PIRANHA_ARMY);
  state=startBattle(state,0);
  const actor=member(0);
  const direct=tag.tagActions(state,actor).find(action=>
    action.kind==='attack'&&action.card===piranha.uid&&action.target===undefined
  );
  assert.ok(direct,'Piranha Army must be able to attack the opposing team directly when its field is empty');
  state=settle(tag.stepTagDuel(state,actor,direct));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,2400,'800 printed ATK must inflict 1600 direct battle damage');
  assert.ok(monster(state,0,piranha.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Stone Statue of the Aztecs doubles battle damage to the team attacking the partner-owned Defense monster',()=>{
  let state=game('m252-stone-statue-defends',1);
  const before=inventorySnapshot(state);
  const statue=placeMonster(state,2,STONE_STATUE,{position:'def'});
  const attacker=placeMonster(state,3,CELTIC_GUARDIAN);
  state=startBattle(state,1);
  state=attack(state,1,attacker,statue);
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,2800,'600 battle damage from 2000 DEF versus 1400 ATK must be doubled to 1200');
  assert.ok(monster(state,0,statue.uid),'the Defense monster must survive');
  assert.ok(monster(state,1,attacker.uid),'the weaker attacker must survive the battle');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Obnoxious Celtic Guard survives battle against a monster with at least 1900 ATK but its team still takes battle damage',()=>{
  let state=game('m252-obnoxious-high-atk',1);
  const before=inventorySnapshot(state);
  const guard=placeMonster(state,2,OBNOXIOUS_CELTIC);
  const attacker=placeMonster(state,3,BLUE_EYES);
  state=startBattle(state,1);
  state=attack(state,1,attacker,guard);
  assert.equal(state.core.players[0].lp,2400,'battle indestructibility must not prevent 1600 battle damage');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(monster(state,0,guard.uid),'the 1900+ ATK threshold must prevent battle destruction');
  assert.ok(monster(state,1,attacker.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Obnoxious Celtic Guard is not indestructible against a monster below 1900 ATK',()=>{
  let state=game('m252-obnoxious-low-atk',1);
  const before=inventorySnapshot(state);
  const guard=placeMonster(state,2,OBNOXIOUS_CELTIC);
  const attacker=placeMonster(state,3,CELTIC_GUARDIAN);
  state=startBattle(state,1);
  state=attack(state,1,attacker,guard);
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(inGrave(state,0,guard.uid));
  assert.ok(inGrave(state,1,attacker.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});
