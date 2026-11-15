'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const TRAP_MASTER='46461247';
const TRAP_HOLE='04206964';
const MYSTICAL_SPACE_TYPHOON='05318639';
const MOUNTAIN='50913601';
const CORE_IDS=[TRAP_MASTER,TRAP_HOLE,MYSTICAL_SPACE_TYPHOON,MOUNTAIN];
const FILLER_IDS=[...new Set(tag.tagNormalCardIds)].filter(id=>!CORE_IDS.includes(id)).slice(0,16);
const DECK=[...CORE_IDS,...FILLER_IDS];
assert.equal(DECK.length,20,'each physical participant must use a legal 20-card Deck');
assert.equal(getPlayableCard(TRAP_MASTER)?.englishName,'Trap Master');
assert.equal(getEffect(TRAP_MASTER)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(TRAP_MASTER),{
  trigger:'flip',
  operation:{
    kind:'singleCard',
    rule:{from:'backrow',controller:'both',action:'destroy',kind:'trap',inspectSetAs:'trap'}
  }
});

function member(seat){return 'm239-seat-'+seat;}
function game(seed){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M239 Seat '+seat,cards:[...DECK]}));
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
  throw new Error('M239 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id,faceUp=false){
  const physical=takePhysical(state,seat,id);
  const monster={...physical,owner:seat%2,position:faceUp?'atk':'def',faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function setBackrow(state,seat,id){
  const physical=takePhysical(state,seat,id);
  const card={...physical,faceUp:false,setTurn:state.core.turn};
  state.core.players[seat%2].backrow.push(card);
  return card;
}
function setField(state,seat,id){
  const physical=takePhysical(state,seat,id);
  const card={...physical,faceUp:false,setTurn:state.core.turn};
  state.core.players[seat%2].field=card;
  return card;
}
function flip(state,source){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='position'&&candidate.mode==='flip'&&candidate.card===source.uid
  );
  assert.ok(action,'the active teammate must Flip Summon its partner-owned Trap Master');
  return tag.stepTagDuel(state,member(0),action);
}
function choose(state,uid){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='choose'&&candidate.target===uid
  );
  assert.ok(action,'the selected face-down backrow card must be offered for inspection');
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
  assert.equal(cards.length,80);
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
function setup(seed){
  let state=game(seed);
  const before=inventorySnapshot(state);
  const source=placeMonster(state,2,TRAP_MASTER,false);
  const trap=setBackrow(state,3,TRAP_HOLE);
  const spell=setBackrow(state,1,MYSTICAL_SPACE_TYPHOON);
  const field=setField(state,3,MOUNTAIN);
  assert.ok(source.uid.startsWith('m2:'));
  assert.ok(trap.uid.startsWith('m3:'));
  assert.ok(spell.uid.startsWith('m1:'));
  assert.ok(field.uid.startsWith('m3:'));
  assert.equal(state.core.players[1].backrow.length,2,'only two of the three Spell/Trap zones are occupied');
  assert.equal(state.core.players[1].field.uid,field.uid,'the Field Zone is separate from the three Spell/Trap zones');
  return {state,before,source,trap,spell,field};
}

test('Trap Master can inspect a hidden Trap on either field and destroys the correct physical card',()=>{
  let {state,before,source,trap,spell,field}=setup('m239-set-trap-target');
  assert.equal(tag.tagActions(state,member(2)).length,0,'the inactive source owner cannot execute the Flip Summon');
  const beforePublic=JSON.stringify(tag.publicTagDuel(state));
  for(const hidden of [trap,spell,field]){
    assert.ok(!beforePublic.includes(hidden.id),'a Set card identity must remain hidden before selection');
    const info=getPlayableCard(hidden.id);
    assert.ok(!beforePublic.includes(info.name)&&!beforePublic.includes(info.englishName),
      'a Set card name must not leak before selection');
  }

  state=flip(state,source);
  assert.equal(state.core.phase,'choice');
  assert.equal(state.core.choice.source,'triggerTarget');
  assert.ok(state.core.choice.targets.includes(trap.uid));
  assert.ok(state.core.choice.targets.includes(spell.uid),'a Set backrow card can be inspected before its type is known');
  assert.ok(!state.core.choice.targets.includes(field.uid),'Trap Master cannot select the Field Zone for a Trap inspection');
  const pendingPublic=JSON.stringify(tag.publicTagDuel(state));
  for(const hidden of [trap,spell,field]){
    assert.ok(!pendingPublic.includes(hidden.id),'the pending choice must not reveal hidden card identities');
    const info=getPlayableCard(hidden.id);
    assert.ok(!pendingPublic.includes(info.name)&&!pendingPublic.includes(info.englishName),
      'a pending inspection must not publish the hidden card name');
  }

  state=settle(choose(state,trap.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp),
    'the partner-owned source remains face-up on the shared allied field');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===trap.uid),
    'the selected Trap is destroyed into the opposing shared Graveyard');
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===spell.uid&&!card.faceUp),
    'the unselected Set Spell remains in its original zone');
  assert.equal(state.core.players[1].field.uid,field.uid,'the Set Field Spell remains in the Field Zone');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Trap Master leaves a selected Set Spell untouched and keeps its identity private',()=>{
  let {state,before,source,trap,spell,field}=setup('m239-set-wrong-type');
  state=flip(state,source);
  assert.equal(state.core.phase,'choice');
  assert.ok(state.core.choice.targets.includes(spell.uid));
  state=settle(choose(state,spell.uid));

  assert.ok(state.core.players[1].backrow.some(card=>card.uid===spell.uid&&!card.faceUp),
    'a Set Spell is inspected but not destroyed by Trap Master');
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===trap.uid&&!card.faceUp),
    'the unselected Set Trap remains untouched');
  assert.equal(state.core.players[1].field.uid,field.uid);
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicState.includes(spell.id),'the inspected non-Trap identity must not leak publicly');
  assert.ok(!publicState.includes(getPlayableCard(spell.id).name)&&!publicState.includes(getPlayableCard(spell.id).englishName),
    'the inspected non-Trap name must remain private to the inspecting player');
  assert.ok(!publicState.includes(trap.id),'the unselected Set Trap identity remains hidden');
  assert.ok(!publicState.includes(field.id),'the Set Field Spell identity remains hidden');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});
