'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const JUST_DESSERTS='24068492';
const justDesserts=getPlayableCard(JUST_DESSERTS);
assert.ok(justDesserts&&justDesserts.kind==='trap','Just Desserts must be an enabled Trap');
assert.equal(getEffect(JUST_DESSERTS)?.kind,'justDesserts');

const normal=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster');
assert.ok(normal.length>=7,'the Just Desserts fixture needs seven certified Normal Monsters');
const teammateMonsterId=normal[0];
const summonedMonsterId=normal.find(id=>id!==teammateMonsterId);
assert.ok(summonedMonsterId);
const deckIds=[...new Set([teammateMonsterId,summonedMonsterId,...normal])].slice(0,7);
assert.equal(deckIds.length,7);

function member(seat){return 'm106-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
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
  throw new Error('M106 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain the Normal Summon');
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique before the Summon');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Just Desserts must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Just Desserts must not duplicate physical UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function setup(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M106 Seat '+seat,
    cards:deck(seat===3?[JUST_DESSERTS]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m106-just-desserts-team-count'});
  const before=inventorySnapshot(state);
  const teammateCard=takeCard(state,2,teammateMonsterId);
  const teammateMonster={...teammateCard,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[0].monsters.push(teammateMonster);
  const summoned=ensureInHand(state,0,summonedMonsterId);
  const trapCard=takeCard(state,3,JUST_DESSERTS);
  const trap={...trapCard,setTurn:0,faceUp:false};
  state.core.players[1].backrow.push(trap);
  state.core.turn=3;
  assert.match(teammateMonster.uid,/^m2:/,'the first opposing monster must retain inactive teammate seat 2 ownership');
  assert.match(summoned.uid,/^m0:/,'the Normal Summon must retain active seat 0 ownership');
  assert.match(trap.uid,/^m3:/,'Just Desserts must retain inactive teammate seat 3 ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,teammateMonster,summoned,trap};
}

test('inactive teammate-owned Just Desserts counts monsters from both opposing 2v2 seats',()=>{
  const {state:initial,before,teammateMonster,summoned,trap}=setup();
  const publicBefore=tag.publicTagDuel(initial);
  assert.ok(!JSON.stringify(publicBefore).includes(JUST_DESSERTS),
    'the opposing set Trap identity must remain hidden before activation');
  assert.ok(!JSON.stringify(publicBefore).includes(trap.uid),
    'the opposing set Trap physical UID must remain hidden before activation');

  const summon=tag.tagActions(initial,member(0)).find(action=>
    action.kind==='summon'&&action.card===summoned.uid&&action.position==='atk'
  );
  assert.ok(summon,'the active physical seat must receive its legal Normal Summon');
  let state=tag.stepTagDuel(initial,member(0),summon);
  assert.equal(state.core.phase,'response','the Normal Summon must open a Trap response window');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical member of the defending team owns response priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical owner of Just Desserts must not receive response actions');
  const response=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===trap.uid
  );
  assert.ok(response,'the active teammate must activate the inactive partner set Trap');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),response),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'the inactive Trap owner must not mutate the response chain');

  state=settle(tag.stepTagDuel(state,member(1),response));
  assert.equal(state.core.players[0].monsters.length,2,
    'the shared opposing field must include one monster from seat 2 and the summon from seat 0');
  assert.equal(state.core.players[0].lp,3000,
    'Just Desserts must count both physical teammates and inflict 1000 LP damage, not 500');
  assert.equal(state.core.players[1].lp,4000,
    'the Trap controller team must not take its own effect damage');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===teammateMonster.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===summoned.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===trap.uid),
    'the activated Trap must move to the shared defending-team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
