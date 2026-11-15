'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const CHORUS='81380218';
const BANNER='10012614';
const HARPIE_LADY_1='91932350';
const CELTIC_GUARDIAN='91152256';
const BLUE_EYES='89631139';

assert.equal(getPlayableCard(CHORUS)?.englishName,'Chorus of Sanctuary');
assert.equal(getPlayableCard(CHORUS)?.field,true);
assert.equal(getEffect(CHORUS)?.kind,'field');
assert.equal(getEffect(CHORUS)?.defensePositionOnly,true);
assert.equal(getEffect(CHORUS)?.def,500);
assert.equal(getPlayableCard(BANNER)?.englishName,'Banner of Courage');
assert.equal(getEffect(BANNER)?.kind,'continuous');
assert.deepEqual(getEffect(BANNER)?.rules,[{
  kind:'modifier',
  filter:{controller:'source',phase:'battle',duringOwnTurn:true},
  atk:200,def:0
}]);
assert.equal(getPlayableCard(HARPIE_LADY_1)?.kind,'monster');
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.kind,'monster');
assert.equal(getPlayableCard(BLUE_EYES)?.kind,'monster');

const DECK_POOL=[CHORUS,BANNER,HARPIE_LADY_1,CELTIC_GUARDIAN,BLUE_EYES];
function member(seat){return 'm227-seat-'+seat;}
function deck(){return Array.from({length:20},(_,index)=>DECK_POOL[index%DECK_POOL.length]);}
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
  throw new Error('M227 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const existing=physical.hand.find(card=>card.id===id);
  if(existing)return existing;
  const card=takePhysical(state,seat,id);
  physical.hand.push(card);
  return card;
}
function createGame(seed){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M227 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(state.active[0],2,'seat 2 must be the active representative of the allied team');
  assert.equal(state.active[1],3,'seat 3 must be the active representative of the opposing team');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return state;
}
function deploy(state,seat,id,position='atk'){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function activateField(state,seat,card){
  const action=tag.tagActions(state,member(seat)).find(candidate=>
    (candidate.kind==='field'||candidate.kind==='setField')&&candidate.card===card.uid
  );
  assert.ok(action,'the active physical participant must be able to activate the Field Spell');
  return settle(tag.stepTagDuel(state,member(seat),action));
}
function activateContinuous(state,seat,card){
  const action=tag.tagActions(state,member(seat)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===card.uid
  );
  assert.ok(action,'the active physical participant must be able to activate the Continuous Spell');
  return settle(tag.stepTagDuel(state,member(seat),action));
}
function startBattle(state,seat){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active physical participant must be able to enter the Battle Phase');
  state=settle(tag.stepTagDuel(state,member(seat),action));
  assert.equal(state.core.phase,'battle');
  return state;
}
function endTurn(state,seat){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active physical participant must be able to end the turn');
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
  assert.equal(cards.length,before.size,'continuous and Field modifiers must not create or remove cards');
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

test('Chorus of Sanctuary grants 500 DEF to every Defense Position monster on both shared team fields',()=>{
  let state=createGame('m227-chorus-of-sanctuary-both-teams');
  const before=inventorySnapshot(state);
  const partnerDefense=deploy(state,0,HARPIE_LADY_1,'def');
  const activeDefense=deploy(state,2,CELTIC_GUARDIAN,'def');
  const enemyDefense=deploy(state,3,BLUE_EYES,'def');
  const enemyAttack=deploy(state,1,CELTIC_GUARDIAN,'atk');
  const field=ensureInHand(state,2,CHORUS);
  const beforeDef=[
    engine.def(state.core.players[0].monsters.find(card=>card.uid===partnerDefense.uid),state.core),
    engine.def(state.core.players[0].monsters.find(card=>card.uid===activeDefense.uid),state.core),
    engine.def(state.core.players[1].monsters.find(card=>card.uid===enemyDefense.uid),state.core),
    engine.def(state.core.players[1].monsters.find(card=>card.uid===enemyAttack.uid),state.core)
  ];
  assert.equal(tag.tagActions(state,member(0)).length,0,'inactive partner seat 0 cannot activate the Field Spell');
  state=activateField(state,2,field);
  assert.equal(state.core.players[0].field?.uid,field.uid);
  assert.equal(state.core.players[0].field?.resolved,true);
  const after=[
    engine.def(state.core.players[0].monsters.find(card=>card.uid===partnerDefense.uid),state.core),
    engine.def(state.core.players[0].monsters.find(card=>card.uid===activeDefense.uid),state.core),
    engine.def(state.core.players[1].monsters.find(card=>card.uid===enemyDefense.uid),state.core),
    engine.def(state.core.players[1].monsters.find(card=>card.uid===enemyAttack.uid),state.core)
  ];
  assert.deepEqual(after,[beforeDef[0]+500,beforeDef[1]+500,beforeDef[2]+500,beforeDef[3]],
    'the Field Spell affects both teams in Defense Position, but not Attack Position');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Banner of Courage boosts both physical teammates only during their own Battle Phase',()=>{
  let state=createGame('m227-banner-of-courage-own-team-battle-phase');
  const before=inventorySnapshot(state);
  const partnerMonster=deploy(state,0,HARPIE_LADY_1,'atk');
  const activeMonster=deploy(state,2,CELTIC_GUARDIAN,'atk');
  const enemyMonster=deploy(state,3,BLUE_EYES,'atk');
  const banner=ensureInHand(state,2,BANNER);
  const partnerBefore=engine.atk(state.core.players[0].monsters.find(card=>card.uid===partnerMonster.uid),state.core);
  const activeBefore=engine.atk(state.core.players[0].monsters.find(card=>card.uid===activeMonster.uid),state.core);
  const enemyBefore=engine.atk(state.core.players[1].monsters.find(card=>card.uid===enemyMonster.uid),state.core);

  state=activateContinuous(state,2,banner);
  const source=state.core.players[0].backrow.find(card=>card.uid===banner.uid);
  assert.equal(source?.resolved,true,'Banner of Courage must remain face-up and resolved');
  assert.equal(engine.atk(state.core.players[0].monsters.find(card=>card.uid===partnerMonster.uid),state.core),partnerBefore,
    'the Battle Phase modifier is inactive during Main Phase');
  assert.equal(engine.atk(state.core.players[0].monsters.find(card=>card.uid===activeMonster.uid),state.core),activeBefore);

  state=startBattle(state,2);
  assert.equal(engine.atk(state.core.players[0].monsters.find(card=>card.uid===partnerMonster.uid),state.core),partnerBefore+200,
    'the inactive physical partner shares the controller teams Battle Phase bonus');
  assert.equal(engine.atk(state.core.players[0].monsters.find(card=>card.uid===activeMonster.uid),state.core),activeBefore+200);
  assert.equal(engine.atk(state.core.players[1].monsters.find(card=>card.uid===enemyMonster.uid),state.core),enemyBefore,
    'the opposing teams monster receives no ATK bonus');

  state=endTurn(state,2);
  assert.notEqual(tag.tagDecisionMember(state).id,member(2),'turn control must pass to the opposing team');
  assert.equal(engine.atk(state.core.players[0].monsters.find(card=>card.uid===partnerMonster.uid),state.core),partnerBefore,
    'the source team no longer receives the bonus during the opponents turn');
  assert.equal(engine.atk(state.core.players[0].monsters.find(card=>card.uid===activeMonster.uid),state.core),activeBefore);
  assert.equal(engine.atk(state.core.players[1].monsters.find(card=>card.uid===enemyMonster.uid),state.core),enemyBefore);
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});
