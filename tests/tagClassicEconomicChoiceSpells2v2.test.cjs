'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const RED_MEDICINE='38199696';
const MOOYAN_CURRY='58074572';
const POISON_OF_THE_OLD_MAN='08842266';

for(const [id,name,kind] of [
  [RED_MEDICINE,'Red Medicine','heal'],
  [MOOYAN_CURRY,'Mooyan Curry','choiceSequence'],
  [POISON_OF_THE_OLD_MAN,'Poison of the Old Man','choiceSequence']
]){
  assert.equal(getPlayableCard(id)?.kind,'spell',name+' must be certified and playable');
  assert.equal(getEffect(id)?.kind,kind,name+' must use its registered effect');
}
assert.equal(getEffect(RED_MEDICINE)?.amount,500);
assert.deepEqual(getEffect(MOOYAN_CURRY)?.choices,[
  {operations:[{kind:'gainLP',player:'self',amount:200}]},
  {operations:[{kind:'gainLP',player:'opponent',amount:200}]}
]);
assert.deepEqual(getEffect(POISON_OF_THE_OLD_MAN)?.choices,[
  {operations:[{kind:'gainLP',player:'self',amount:1200}]},
  {operations:[{kind:'damage',recipients:[{player:'opponent',amount:800}]}]}
]);
assert.equal(getActivationModel(getEffect(POISON_OF_THE_OLD_MAN))?.speed,2);
assert.equal(getActivationModel(getEffect(POISON_OF_THE_OLD_MAN))?.window,'free');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm158-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=7);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
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
  throw new Error('M158 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'physical seat '+seat+' Deck must contain '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card Decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique before resolution');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'economic Spells must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function handsSnapshot(state){
  return new Map([0,1,2,3].map(seat=>[
    seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)
  ]));
}
function decksSnapshot(state){
  return new Map([0,1,2,3].map(seat=>[
    seat,holder(state,seat).deck.map(card=>card.uid)
  ]));
}
function assertPrivateHands(state,hands){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const uids of hands.values())for(const uid of uids){
    assert.ok(!publicState.includes(uid),'private hand UID leaked to public duel: '+uid);
  }
}
function assertActiveSeat(state,action){
  assert.equal(tag.tagDecisionMember(state).id,member(0),'seat 0 must be the active physical player');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'inactive physical teammate seat 2 cannot execute the shared Main Phase action');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'rejected inactive-seat action must not mutate the duel');
}
function assertResolved(state,source,sourceId,expectedLP,before,hands,decks,sourceZone='hand'){
  assert.equal(state.core.phase,'main','economic Spell resolves immediately without a legal response');
  assert.deepEqual(state.core.players.map(player=>player.lp),expectedLP,
    'the selected operation must change the correct shared team LP');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid&&card.id===sourceId),
    'the resolved Spell must enter its team Graveyard with the original physical UID');
  for(const seat of [0,1,2,3]){
    const expected=hands.get(seat).filter(uid=>!(sourceZone==='hand'&&seat===0&&uid===source.uid));
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),expected,
      'economic Spell must not mutate physical seat '+seat+' hand beyond consuming its source');
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),decks.get(seat),
      'economic Spell must not borrow or mutate physical seat '+seat+' Deck');
  }
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
}
function setupHandSpell(id,lp=[4000,4100],seed='m158-hand'){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M158 Seat '+seat,
    cards:deck(seat===0?[id]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:seed+'-'+id});
  const spell=ensureInHand(state,0,id);
  state.core.turn=3;
  state.core.players[0].lp=lp[0];
  state.core.players[1].lp=lp[1];
  assert.match(spell.uid,/^m0:/,'the Spell must retain active physical seat 0 ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const hands=handsSnapshot(state);
  const decks=decksSnapshot(state);
  assertPrivateHands(state,hands);
  return {state,spell,before,hands,decks};
}
function activateHandSpell(id,target,lp,expectedLP){
  const {state:initial,spell,before,hands,decks}=setupHandSpell(id,lp,'m158-choice');
  const choices=tag.tagActions(initial,member(0)).filter(action=>
    action.kind==='spell'&&action.card===spell.uid
  );
  assert.ok(choices.some(action=>action.target===target),
    'active seat must receive the selected legal operation '+target);
  const action=choices.find(action=>action.target===target);
  assertActiveSeat(initial,action);
  const resolved=tag.stepTagDuel(initial,member(0),action);
  assertResolved(resolved,spell,id,expectedLP,before,hands,decks,'hand');
}

test('Red Medicine heals the activating 2v2 team by exactly 500 LP without a 4000 LP cap',()=>{
  const {state:initial,spell,before,hands,decks}=setupHandSpell(RED_MEDICINE,[4500,4100],'m158-red-medicine');
  const action=tag.tagActions(initial,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid
  );
  assert.ok(action,'active seat 0 must receive Red Medicine');
  assertActiveSeat(initial,action);
  const resolved=tag.stepTagDuel(initial,member(0),action);
  assertResolved(resolved,spell,RED_MEDICINE,[5000,4100],before,hands,decks,'hand');
});

test('Mooyan Curry can choose the activating team or the opposing team in classic 2v2',()=>{
  activateHandSpell(MOOYAN_CURRY,'__choice_0__',[3900,4100],[4100,4100]);
  activateHandSpell(MOOYAN_CURRY,'__choice_1__',[3900,4100],[3900,4300]);
});

function setupSetPoison(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M158 Seat '+seat,
    cards:deck(seat===2?[POISON_OF_THE_OLD_MAN]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m158-poison-set-quickplay'});
  const poisonCard=takeCard(state,2,POISON_OF_THE_OLD_MAN);
  const poison={...poisonCard,setTurn:3,faceUp:false};
  state.core.players[0].backrow.push(poison);
  state.core.turn=3;
  state.core.players[0].lp=3900;
  state.core.players[1].lp=4100;
  assert.match(poison.uid,/^m2:/,'the Set Quick-Play Spell must retain inactive partner seat 2 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const hands=handsSnapshot(state);
  const decks=decksSnapshot(state);
  assertPrivateHands(state,hands);
  const hidden=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!hidden.includes(POISON_OF_THE_OLD_MAN),'the Set Quick-Play Spell identity must remain hidden');
  assert.ok(!hidden.includes(poison.uid),'the Set Quick-Play Spell physical UID must remain hidden');
  return {state,poison,before,hands,decks};
}
function activateSetPoison(target,expectedLP){
  const {state,poison,before,hands,decks}=setupSetPoison();
  assert.deepEqual(tag.tagActions(state,member(0)).filter(action=>
    action.kind==='spell'&&action.card===poison.uid
  ),[],'a Quick-Play Spell Set this turn cannot be activated in the same turn');
  poison.setTurn=0;
  const choices=tag.tagActions(state,member(0)).filter(action=>
    action.kind==='spell'&&action.card===poison.uid
  );
  const action=choices.find(candidate=>candidate.target===target);
  assert.ok(action,'active seat 0 may activate its inactive teammate Set Quick-Play Spell');
  assertActiveSeat(state,action);
  const resolved=tag.stepTagDuel(state,member(0),action);
  assertResolved(resolved,poison,POISON_OF_THE_OLD_MAN,expectedLP,before,hands,decks,'backrow');
}

test('Poison of the Old Man resolves either Quick-Play choice from an inactive teammate-owned Set Spell',()=>{
  activateSetPoison('__choice_0__',[5100,4100]);
  activateSetPoison('__choice_1__',[3900,3300]);
});
