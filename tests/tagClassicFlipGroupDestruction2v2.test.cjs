'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {engineCatalog,getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const LADYBUG='83994646';
const NOBLEMAN_EATER='65878864';
const normalCards=engineCatalog.filter(card=>tag.tagNormalCardIds.includes(card.id));
const LEVEL4=normalCards.find(card=>card.level===4);
const LEVEL4_ALT=normalCards.find(card=>card.level===4&&card.id!==LEVEL4?.id);
const LEVEL3=normalCards.find(card=>card.level===3);
const LEVEL8=normalCards.find(card=>card.level===8);
const FILLER=normalCards.filter(card=>![LEVEL4?.id,LEVEL4_ALT?.id,LEVEL3?.id,LEVEL8?.id].includes(card.id)).slice(0,4);
assert.ok(LEVEL4&&LEVEL4_ALT&&LEVEL3&&LEVEL8&&FILLER.length===4,'the fixture needs distinct Normal Monsters at Levels 3, 4 and 8');
assert.equal(getPlayableCard(LADYBUG)?.englishName,'4-Starred Ladybug of Doom');
assert.deepEqual(getMonsterEffect(LADYBUG),{
  trigger:'flip',operation:{kind:'destroyByLevel',level:4}
});
assert.equal(getPlayableCard(NOBLEMAN_EATER)?.englishName,'Nobleman-Eater Bug');
assert.deepEqual(getMonsterEffect(NOBLEMAN_EATER),{
  trigger:'flip',operation:{kind:'targetGroup',rule:{from:'monsters',action:'destroy',minimum:2,maximum:2}}
});
assert.equal(getEffect(LADYBUG)?.kind,'monsterEffect');
assert.equal(getEffect(NOBLEMAN_EATER)?.kind,'monsterEffect');

const POOL=[LADYBUG,NOBLEMAN_EATER,LEVEL4.id,LEVEL4_ALT.id,LEVEL3.id,LEVEL8.id,...FILLER.map(card=>card.id)];
assert.equal(POOL.length,10);
function member(seat){return 'm230-seat-'+seat;}
function deck(){return Array.from({length:20},(_,index)=>POOL[index%POOL.length]);}
function game(seed){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M230 Seat '+seat,cards:deck()}));
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
  assert.equal(state.active[0],0);
  assert.equal(state.active[1],1);
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
  throw new Error('M230 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id,faceUp=true){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:faceUp?'atk':'def',faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function flip(state,source){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='position'&&candidate.mode==='flip'&&candidate.card===source.uid
  );
  assert.ok(action,'the active participant must be able to Flip Summon the partner-owned source');
  return tag.stepTagDuel(state,member(0),action);
}
function choose(state,uid){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='choose'&&candidate.target===uid
  );
  assert.ok(action,'the selected physical monster must be a legal group target');
  return tag.stepTagDuel(state,member(0),action);
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
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
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

test('4-Starred Ladybug destroys face-up Level 4 monsters from both opposing physical seats only',()=>{
  let state=game('m230-ladybug-opposing-level-four');
  const before=inventorySnapshot(state);
  const source=placeMonster(state,2,LADYBUG,false);
  const alliedLevel4=placeMonster(state,0,LEVEL4.id,true);
  const activeEnemyLevel4=placeMonster(state,1,LEVEL4.id,true);
  const partnerEnemyLevel4=placeMonster(state,3,LEVEL4.id,true);
  const enemyLevel3=placeMonster(state,1,LEVEL3.id,true);
  assert.match(source.uid,/^m2:/);
  assert.equal(tag.tagActions(state,member(2)).length,0,'the inactive partner cannot execute the Flip Summon');
  state=settle(flip(state,source));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===activeEnemyLevel4.uid),
    'the active opposing seat Level 4 monster is destroyed');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===partnerEnemyLevel4.uid),
    'the inactive opposing partner Level 4 monster is destroyed from the shared field');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===alliedLevel4.uid),
    'the allied Level 4 monster is preserved');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===enemyLevel3.uid),
    'the opposing Level 3 monster is preserved');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('4-Starred Ladybug preserves a face-down Level 4 monster without revealing its identity',()=>{
  let state=game('m230-ladybug-hidden-level-four');
  const before=inventorySnapshot(state);
  const source=placeMonster(state,2,LADYBUG,false);
  const alliedLevel4=placeMonster(state,0,LEVEL4.id,true);
  const activeEnemyLevel4=placeMonster(state,1,LEVEL4.id,true);
  const partnerEnemyLevel4=placeMonster(state,3,LEVEL4.id,true);
  const hiddenEnemyLevel4=placeMonster(state,3,LEVEL4_ALT.id,false);
  state=settle(flip(state,source));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===activeEnemyLevel4.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===partnerEnemyLevel4.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===hiddenEnemyLevel4.uid),
    'the face-down Level 4 monster is not inspected or destroyed');
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicState.includes(hiddenEnemyLevel4.id),'the hidden monster identity remains private');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===alliedLevel4.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Nobleman-Eater Bug selects exactly two distinct monsters across both shared fields, including its own source',()=>{
  let state=game('m230-nobleman-global-two-targets');
  const before=inventorySnapshot(state);
  const source=placeMonster(state,2,NOBLEMAN_EATER,false);
  const alliedPartner=placeMonster(state,0,LEVEL4.id,true);
  const activeEnemy=placeMonster(state,1,LEVEL3.id,true);
  const partnerEnemy=placeMonster(state,3,LEVEL8.id,false);
  state=flip(state,source);
  assert.equal(state.core.phase,'choice');
  assert.equal(state.core.choice.source,'triggerGroup');
  for(const card of [source,alliedPartner,activeEnemy,partnerEnemy]){
    assert.ok(state.core.choice.targets.includes(card.uid),'the global group includes '+card.uid);
  }
  state=choose(state,source.uid);
  assert.ok(!tag.tagActions(state,member(0)).some(action=>action.kind==='choose'&&action.target===source.uid),
    'a selected UID cannot be selected twice');
  assert.throws(()=>tag.stepTagDuel(state,member(0),{kind:'choose',target:source.uid}),/Ação inválida|Alvo repetido ou inelegível/,
    'a forged duplicate target is rejected');
  state=settle(choose(state,partnerEnemy.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid),
    'the source may be one of the two targets and is destroyed');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===partnerEnemy.uid),
    'the second target from the opposing inactive partner is destroyed');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===alliedPartner.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===activeEnemy.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});
