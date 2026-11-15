'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const OLD_VINDICTIVE='45141844';
const GALE_LIZARD='77491079';
const NORMALS=[...new Set(tag.tagNormalCardIds)].slice(0,8);
assert.equal(NORMALS.length,8);
assert.equal(getPlayableCard(OLD_VINDICTIVE)?.englishName,'Old Vindictive Magician');
assert.deepEqual(getMonsterEffect(OLD_VINDICTIVE),{
  trigger:'flip',operation:{kind:'destroy',target:'opponentMonster'}
});
assert.equal(getPlayableCard(GALE_LIZARD)?.englishName,'Gale Lizard');
assert.deepEqual(getMonsterEffect(GALE_LIZARD),{
  trigger:'flip',operation:{kind:'bounce',target:'opponentMonster'}
});
assert.equal(getEffect(OLD_VINDICTIVE)?.kind,'monsterEffect');
assert.equal(getEffect(GALE_LIZARD)?.kind,'monsterEffect');

const POOL=[OLD_VINDICTIVE,GALE_LIZARD,...NORMALS];
assert.equal(POOL.length,10);
function member(seat){return 'm229-seat-'+seat;}
function deck(){return Array.from({length:20},(_,index)=>POOL[index%POOL.length]);}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M229 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
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
  throw new Error('M229 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id,faceUp=true){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:faceUp?'atk':'def',faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function flip(state,source){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='position'&&candidate.mode==='flip'&&candidate.card===source.uid
  );
  assert.ok(action,'the active teammate must be allowed to Flip Summon its partner-owned source');
  return tag.stepTagDuel(state,member(0),action);
}
function choose(state,uid){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='choose'&&candidate.target===uid
  );
  assert.ok(action,'the selected opposing physical monster must be a legal target');
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

for(const [label,cardId,targetSeat,targetFaceUp] of [
  ['Old Vindictive Magician destroys the active opponent target',OLD_VINDICTIVE,1,true],
  ['Old Vindictive Magician destroys the inactive opponent partner target',OLD_VINDICTIVE,3,false],
  ['Gale Lizard returns the active opponent target to its hand',GALE_LIZARD,1,true],
  ['Gale Lizard returns the inactive opponent partner target to its physical hand',GALE_LIZARD,3,false]
]){
  test(label+' without exposing allied targets or changing the source UID',()=>{
    let state=game('m229-'+cardId+'-'+targetSeat);
    const before=inventorySnapshot(state);
    const source=placeMonster(state,2,cardId,false);
    const ally=placeMonster(state,0,NORMALS[0],true);
    const target=placeMonster(state,targetSeat,NORMALS[1],targetFaceUp);
    assert.match(source.uid,/^m2:/,'the effect source must retain partner physical ownership');
    assert.match(target.uid,new RegExp('^m'+targetSeat+':'),'the target must retain its physical owner UID');
    assert.equal(tag.tagActions(state,member(2)).length,0,'inactive partner seat 2 cannot execute the action');
    assertPrivateHands(state);
    state=flip(state,source);
    assert.equal(state.core.phase,'choice');
    assert.ok(state.core.choice.targets.includes(target.uid),'the opposing target must be offered');
    assert.ok(!state.core.choice.targets.includes(ally.uid),'the allied partner monster must never be offered');
    if(!targetFaceUp){
      const publicState=JSON.stringify(tag.publicTagDuel(state));
      assert.ok(!publicState.includes(target.id),'the face-down target identity must remain hidden before selection');
    }
    state=settle(choose(state,target.uid));
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp),
      'the partner-owned flip source remains on the shared allied field');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===ally.uid),
      'the allied target candidate remains untouched');
    assert.ok(!state.core.players[1].monsters.some(card=>card.uid===target.uid),
      'the selected opponent target leaves the shared field');
    if(cardId===OLD_VINDICTIVE){
      assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid),
        'Old Vindictive Magician destroys into the opposing shared Graveyard');
      assert.ok(!tag.tagMemberHand(state,member(targetSeat)).some(card=>card.uid===target.uid));
    }else{
      assert.ok(tag.tagMemberHand(state,member(targetSeat)).some(card=>card.uid===target.uid),
        'Gale Lizard returns the monster to its physical owner hand');
      for(const seat of [0,1,2,3])if(seat!==targetSeat){
        assert.ok(!tag.tagMemberHand(state,member(seat)).some(card=>card.uid===target.uid),
          'returned monster leaked into another participant hand');
      }
    }
    assertConserved(state,before);
    assertPrivateHands(state);
    assertRestorable(state);
  });
}

for(const cardId of [OLD_VINDICTIVE,GALE_LIZARD]){
  test('a '+(cardId===OLD_VINDICTIVE?'Old Vindictive Magician':'Gale Lizard')+' flip effect cannot select an allied monster when no opponent monster exists',()=>{
    let state=game('m229-no-opponent-'+cardId);
    const before=inventorySnapshot(state);
    const source=placeMonster(state,2,cardId,false);
    const ally=placeMonster(state,0,NORMALS[2],true);
    state=flip(state,source);
    assert.notEqual(state.core.phase,'choice','no opposing monster means no target-selection window');
    assert.ok(!state.core.choice,'no target choice may be created for an allied-only field');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp));
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===ally.uid));
    assert.ok(!tag.tagActions(state,member(0)).some(action=>action.kind==='choose'&&action.target===ally.uid));
    assert.throws(()=>tag.stepTagDuel(state,member(0),{kind:'choose',target:ally.uid}));
    assertConserved(state,before);
    assertRestorable(state);
  });
}
