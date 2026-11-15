'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const FIELD_SPELLS=[
  {id:'18161786',name:'Mystic Plasma Zone',attribute:'DARK',monster:'46986414',atk:2500,def:2100},
  {id:'19384334',name:'Molten Destruction',attribute:'FIRE',monster:'82035781',atk:1700,def:1900},
  {id:'45778932',name:'Rising Air Current',attribute:'WIND',monster:'57617178',atk:1400,def:1000}
];
const BLUE_EYES='89631139';
const DIRECT_ATTACK_FILLERS=[
  '12472242','21347810','58861941','32809211','02792265','59290628'
];
for(const field of FIELD_SPELLS){
  const card=getPlayableCard(field.id);
  assert.equal(card?.englishName,field.name);
  assert.equal(card?.kind,'spell');
  assert.equal(card?.field,true);
  assert.deepEqual(getEffect(field.id),{
    kind:'field',races:[],attributes:[field.attribute],atk:500,def:-400
  },field.name+' must have its exact attribute-only global modifier');
  const monster=getPlayableCard(field.monster);
  assert.equal(monster?.kind,'monster');
  assert.equal(monster?.attribute,field.attribute);
  assert.equal(monster?.atk,field.atk);
  assert.equal(monster?.defense,field.def);
}
assert.equal(getPlayableCard(BLUE_EYES)?.attribute,'LIGHT');
assert.equal(getPlayableCard(BLUE_EYES)?.atk,3000);
const FILLERS=[...new Set(tag.tagNormalCardIds)].filter(id=>
  !FIELD_SPELLS.some(card=>card.id===id)&&!FIELD_SPELLS.some(card=>card.monster===id)&&id!==BLUE_EYES
).slice(0,7);
assert.equal(FILLERS.length,7,'the fixture needs seven distinct certified Normal Monsters');
const POOL=[...FIELD_SPELLS.map(card=>card.id),...FIELD_SPELLS.map(card=>card.monster),BLUE_EYES,...DIRECT_ATTACK_FILLERS,...FILLERS];
assert.equal(POOL.length,20,'each physical participant needs a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'the fixture must use distinct card identities');

function member(seat){return 'm244-seat-'+seat;}
function deck(){return [...POOL];}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M244 Seat '+seat,cards:deck()
  }));
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
  throw new Error('M244 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'the Field Spell response windows must terminate');
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
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Field Spell activation must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Field Spell activation must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}

for(const field of FIELD_SPELLS){
  test(field.name+' boosts matching monsters on both shared team fields and leaves other attributes unchanged',()=>{
    let state=game('m244-field-'+field.id);
    const before=inventorySnapshot(state);
    const ally=placeMonster(state,2,field.monster);
    const opponent=placeMonster(state,1,field.monster);
    const control=placeMonster(state,3,BLUE_EYES);
    assert.match(ally.uid,/^m2:/,'the allied monster must retain inactive partner physical ownership');
    assert.match(opponent.uid,/^m1:/);
    assert.match(control.uid,/^m3:/,'the control monster must retain inactive opponent partner ownership');

    const fieldCard=takePhysical(state,0,field.id);
    holder(state,0).hand.push(fieldCard);
    assert.match(fieldCard.uid,/^m0:/,'the Field Spell must retain active participant physical ownership');
    const activation=tag.tagActions(state,member(0)).find(action=>
      action.kind==='field'&&action.card===fieldCard.uid
    );
    assert.ok(activation,'the active participant must be able to activate the Field Spell from their own hand');
    state=settle(tag.stepTagDuel(state,member(0),activation));

    const liveAlly=state.core.players[0].monsters.find(card=>card.uid===ally.uid);
    const liveOpponent=state.core.players[1].monsters.find(card=>card.uid===opponent.uid);
    const liveControl=state.core.players[1].monsters.find(card=>card.uid===control.uid);
    assert.ok(state.core.players[0].field?.faceUp);
    assert.equal(state.core.players[0].field.id,field.id);
    assert.equal(engine.atk(liveAlly,state.core),field.atk+500);
    assert.equal(engine.def(liveAlly,state.core),field.def-400);
    assert.equal(engine.atk(liveOpponent,state.core),field.atk+500,
      'the Field Spell must affect a matching monster on the opposing shared team');
    assert.equal(engine.def(liveOpponent,state.core),field.def-400);
    assert.equal(engine.atk(liveControl,state.core),3000,
      'a monster of another attribute must not receive the ATK modifier');
    assert.equal(engine.def(liveControl,state.core),2500,
      'a monster of another attribute must not receive the DEF modifier');
    const publicState=tag.publicTagDuel(state);
    assert.equal(publicState.teams[0].field.id,field.id);
    assertConserved(state,before);
    assertPrivateHands(state);
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    assertRestorable(state);
  });
}
