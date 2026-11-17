'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const CHOICE_SPELLS=[
  {id:'58074572',name:'Mooyan Curry',effect:{kind:'choiceSequence',activation:{speed:1,window:'main',damage:'never'},choices:[{operations:[{kind:'gainLP',player:'self',amount:200}]},{operations:[{kind:'gainLP',player:'opponent',amount:200}]}]}},
  {id:'08842266',name:'Poison of the Old Man',effect:{kind:'choiceSequence',activation:{speed:2,window:'free',damage:'never'},choices:[{operations:[{kind:'gainLP',player:'self',amount:1200}]},{operations:[{kind:'damage',recipients:[{player:'opponent',amount:800}]}]}]}}
];
for(const entry of CHOICE_SPELLS){
  assert.equal(getPlayableCard(entry.id)?.englishName,entry.name);
  assert.deepEqual(getEffect(entry.id),entry.effect,entry.name+' must preserve its exact selectable team-LP operations');
}
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!CHOICE_SPELLS.some(card=>card.id===id))
  .slice(0,18);
assert.equal(NORMALS.length,18,'the fixture needs eighteen distinct Normal Monster fillers');
const POOL=[...CHOICE_SPELLS.map(card=>card.id),...NORMALS];
assert.equal(POOL.length,20,'each physical participant must use a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'the fixture must not duplicate card identities');

function member(seat){return 'm248-seat-'+seat;}
function deck(){return [...POOL];}
function game(seed,first=0){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M248 Seat '+seat,cards:deck()
  }));
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
  throw new Error('M248 fixture card missing from physical seat '+seat+': '+id);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'economic choice response windows must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function putInActiveHand(state,seat,id){
  const card=takePhysical(state,seat,id);
  holder(state,seat).hand.push(card);
  return card;
}
function activateChoice(state,seat,id,choice){
  const source=putInActiveHand(state,seat,id);
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>
    candidate.kind==='spell'&&candidate.card===source.uid&&candidate.target===choice
  );
  assert.ok(action,id+' must offer choice '+choice+' to the active physical owner');
  const before=JSON.stringify(state);
  const next=settle(tag.stepTagDuel(state,actor,action));
  assert.equal(JSON.stringify(state),before,'choice resolution must not mutate the caller state');
  assert.ok(next.core.players[seat%2].grave.some(card=>card.uid===source.uid),
    id+' must be sent to the activating team Graveyard');
  return {state:next,source};
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
  assert.equal(cards.length,before.size,'LP choices must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'LP choices must not duplicate UIDs');
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

test('M248 metadata and legal format: both choice spells retain exact LP operations',()=>{
  for(const entry of CHOICE_SPELLS){
    assert.equal(getPlayableCard(entry.id)?.kind,'spell');
    assert.deepEqual(getEffect(entry.id),entry.effect);
  }
  const state=game('m248-format');
  assert.equal(tag.tagInventory(state).length,80);
  assertRestorable(state);
});

for(const seat of [0,1]){
  for(const choice of [0,1]){
    test('Mooyan Curry routes choice '+choice+' to the correct shared team LP when seat '+seat+' activates it',()=>{
      let state=game('m248-mooyan-'+seat+'-'+choice,seat);
      const before=inventorySnapshot(state);
      const initial=state.core.players.map(player=>player.lp);
      const {state:next,source}=activateChoice(state,seat,'58074572','__choice_'+choice+'__');
      state=next;
      const recipient=choice===0?seat%2:1-seat%2;
      const expected=[...initial];
      expected[recipient]+=200;
      assert.deepEqual(state.core.players.map(player=>player.lp),expected);
      assert.match(source.uid,new RegExp('^m'+seat+':'),'the Spell retains its physical seat UID');
      assertConserved(state,before);
      assertPrivateHands(state);
      assertRestorable(state);
    });
  }
}

for(const seat of [0,1]){
  for(const choice of [0,1]){
    test('Poison of the Old Man routes choice '+choice+' to the correct shared team LP when seat '+seat+' activates it',()=>{
      let state=game('m248-poison-'+seat+'-'+choice,seat);
      const before=inventorySnapshot(state);
      const initial=state.core.players.map(player=>player.lp);
      const {state:next,source}=activateChoice(state,seat,'08842266','__choice_'+choice+'__');
      state=next;
      const expected=[...initial];
      if(choice===0)expected[seat%2]+=1200;
      else expected[1-seat%2]=Math.max(0,expected[1-seat%2]-800);
      assert.deepEqual(state.core.players.map(player=>player.lp),expected);
      assert.match(source.uid,new RegExp('^m'+seat+':'),'the Quick-Play Spell retains its physical seat UID');
      assertConserved(state,before);
      assertPrivateHands(state);
      assertRestorable(state);
    });
  }
}

test('Poison of the Old Man keeps Quick-Play speed and cannot be activated in the turn it was Set',()=>{
  const state=game('m248-poison-set-turn');
  const source=takePhysical(state,0,'08842266');
  state.core.players[0].backrow.push({...source,faceUp:false,setTurn:state.core.turn});
  assert.ok(!tag.tagActions(state,member(0)).some(action=>action.kind==='spell'&&action.card===source.uid));
  state.core.players[0].backrow[0].setTurn=state.core.turn-1;
  assert.ok(tag.tagActions(state,member(0)).some(action=>
    action.kind==='spell'&&action.card===source.uid&&action.target==='__choice_0__'
  ));
});

test('an inactive partner cannot expose a Quick-Play Spell from their private physical hand',()=>{
  const state=game('m248-private-partner-hand');
  const source=takePhysical(state,2,'08842266');
  holder(state,2).hand.push(source);
  assert.ok(!tag.tagActions(state,member(0)).some(action=>action.card===source.uid));
  assert.equal(tag.tagActions(state,member(2)).length,0);
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===source.uid));
  assert.ok(!JSON.stringify(tag.publicTagDuel(state)).includes(source.uid));
  assertRestorable(state);
});

test('fabricated economic choice indices are rejected without changing the duel',()=>{
  const state=game('m248-invalid-choice');
  const source=putInActiveHand(state,0,'08842266');
  const before=JSON.stringify(state);
  assert.ok(!tag.tagActions(state,member(0)).some(action=>action.card===source.uid&&action.target==='__choice_99__'));
  assert.throws(()=>tag.stepTagDuel(state,member(0),{
    kind:'spell',card:source.uid,target:'__choice_99__'
  }));
  assert.equal(JSON.stringify(state),before);
});
