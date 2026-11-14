'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const ALLIGATOR_SWORD_DRAGON='03366982';
const BABY_DRAGON='88819587';
const ALLIGATOR_SWORD='64428736';
const POLYMERIZATION='24094653';
const CELTIC_GUARDIAN='91152256';
const BLUE_EYES='89631139';

const fusionCard=getPlayableCard(ALLIGATOR_SWORD_DRAGON);
assert.equal(fusionCard?.englishName,"Alligator's Sword Dragon");
assert.equal(fusionCard?.monsterType,'fusion');
assert.deepEqual(fusionCard?.fusion,[BABY_DRAGON,ALLIGATOR_SWORD]);
assert.equal(getPlayableCard(BABY_DRAGON)?.kind,'monster');
assert.equal(getPlayableCard(ALLIGATOR_SWORD)?.kind,'monster');
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.attribute,'EARTH');
assert.equal(getPlayableCard(BLUE_EYES)?.attribute,'LIGHT');
assert.deepEqual(getMonsterEffect(ALLIGATOR_SWORD_DRAGON)?.operation,{
  kind:'continuous',
  rules:[{
    kind:'combat',
    filter:{selfOnly:true},
    rule:{kind:'direct',condition:'faceUpAttributesOnly',attributes:['EARTH','WATER','FIRE']}
  }]
});

const normalIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>![BABY_DRAGON,ALLIGATOR_SWORD].includes(id))
  .slice(0,8);
assert.equal(normalIds.length,8,'the Fusion fixture needs eight additional certified Normal Monsters');

function member(seat){return 'm210-seat-'+seat;}
function deck(){
  const ids=[...new Set([POLYMERIZATION,BABY_DRAGON,ALLIGATOR_SWORD,CELTIC_GUARDIAN,BLUE_EYES,...normalIds])];
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M210 Seat '+seat,cards:deck(),
    ...(seat===0?{extra:[ALLIGATOR_SWORD_DRAGON]}:{})
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  return state;
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takeCard(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M210 fixture card missing from physical seat '+seat+': '+id);
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,81,'four physical 20-card Decks plus one physical Extra Deck card must contribute 81 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,81,'all main-Deck and Extra-Deck UIDs must be unique');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'conditional direct attacks must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'conditional direct attacks must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function deploy(state,seat,id,faceUp=true,position='atk'){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:faceUp?position:'def',faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function actor(state){return tag.tagDecisionMember(state).id;}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Fusion/response chain must terminate');
    const current=actor(state);
    const pass=tag.tagActions(state,current).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,current,pass);
  }
  return state;
}
function fusionSummon(state){
  const poly=takeCard(state,0,POLYMERIZATION);
  holder(state,0).hand.push(poly);
  const baby=takeCard(state,0,BABY_DRAGON);
  holder(state,0).hand.push(baby);
  const sword=takeCard(state,0,ALLIGATOR_SWORD);
  holder(state,0).hand.push(sword);
  const extra=state.core.players[0].extra.find(card=>card.id===ALLIGATOR_SWORD_DRAGON);
  assert.ok(extra,'Alligator\'s Sword Dragon must remain in seat 0 physical Extra Deck');
  assert.match(extra.uid,/^m0:/,'the Fusion monster must retain its physical Extra Deck owner UID');
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='fusion'&&candidate.card===poly.uid&&candidate.extra===extra.uid&&
    candidate.materials.length===2&&candidate.materials.includes(baby.uid)&&candidate.materials.includes(sword.uid)
  );
  assert.ok(action,'the exact Baby Dragon + Alligator\'s Sword Fusion Summon must be available to seat 0');
  state=settle(tag.stepTagDuel(state,member(0),action));
  const live=state.core.players[0].monsters.find(card=>card.uid===extra.uid&&card.id===ALLIGATOR_SWORD_DRAGON);
  assert.ok(live,'Alligator\'s Sword Dragon must enter the shared team field after its Fusion Summon');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===poly.uid),'Polymerization must enter the activating team Graveyard');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===baby.uid),'Baby Dragon must enter the shared team Graveyard');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===sword.uid),'Alligator\'s Sword must enter the shared team Graveyard');
  tag.assertTagDuel(state);
  return {state,fusion:live};
}
function startBattle(state){
  const current=actor(state);
  const action=tag.tagActions(state,current).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active teammate must be able to enter the Battle Phase');
  return settle(tag.stepTagDuel(state,current,action));
}
function attackActions(state,fusion){
  return tag.tagActions(state,actor(state)).filter(action=>action.kind==='attack'&&action.card===fusion.uid);
}
function prepare(seed){
  let state=game(seed);
  const before=inventorySnapshot(state);
  const result=fusionSummon(state);
  return {...result,before};
}

test('Alligator\'s Sword Dragon can attack directly when every face-up monster across both opposing seats is EARTH, WATER or FIRE',()=>{
  let {state,before,fusion}=prepare('m210-alligator-sword-allowed-attributes');
  const first=deploy(state,1,CELTIC_GUARDIAN,true,'atk');
  const partner=deploy(state,3,CELTIC_GUARDIAN,true,'def');
  assert.match(first.uid,/^m1:/,'the first defender must retain seat 1 physical ownership');
  assert.match(partner.uid,/^m3:/,'the second defender must retain seat 3 physical ownership');
  state=startBattle(state);
  const actions=attackActions(state,fusion);
  assert.ok(actions.some(action=>action.target===undefined),
    'face-up EARTH monsters controlled by both opposing physical seats satisfy the shared attribute condition');
  assert.ok(actions.some(action=>action.target===first.uid),'ordinary targeted attacks remain available');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('a single face-up LIGHT monster controlled by either opposing teammate blocks Alligator\'s Sword Dragon direct attack',()=>{
  let {state,before,fusion}=prepare('m210-alligator-sword-reject-light');
  const earth=deploy(state,1,CELTIC_GUARDIAN,true,'atk');
  const light=deploy(state,3,BLUE_EYES,true,'atk');
  assert.match(earth.uid,/^m1:/);
  assert.match(light.uid,/^m3:/);
  state=startBattle(state);
  const actions=attackActions(state,fusion);
  assert.ok(!actions.some(action=>action.target===undefined),
    'one face-up LIGHT monster on either opposing seat invalidates the direct-attack condition');
  assert.ok(actions.some(action=>action.target===light.uid),
    'the Fusion monster can still declare an ordinary attack against the LIGHT monster');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('a face-down LIGHT monster is not revealed and does not invalidate the face-up attribute condition',()=>{
  let {state,before,fusion}=prepare('m210-alligator-sword-ignore-hidden-light');
  const earth=deploy(state,1,CELTIC_GUARDIAN,true,'atk');
  const hidden=deploy(state,3,BLUE_EYES,false,'def');
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicBefore.includes(BLUE_EYES),'the hidden LIGHT monster identity must not appear in the public projection');
  assert.ok(!publicBefore.includes(hidden.uid),'the hidden physical UID must not appear in the public projection');
  state=startBattle(state);
  const actions=attackActions(state,fusion);
  assert.ok(actions.some(action=>action.target===undefined),
    'the condition examines face-up opposing monsters only and ignores the hidden monster without revealing it');
  assert.ok(actions.some(action=>action.target===hidden.uid),
    'a face-down Defense monster remains a legal attack target; its identity stays hidden from the public projection');
  assert.ok(actions.some(action=>action.target===earth.uid));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
