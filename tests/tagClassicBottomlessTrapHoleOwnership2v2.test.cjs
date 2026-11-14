'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel,getDestructionModel}=require('../dist/effectModels');

const BOTTOMLESS='29401950';
const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense)&&entry.card.level<=4);
const high=normal.filter(entry=>entry.card.atk>=1500).sort((a,b)=>b.card.atk-a.card.atk)[0];
const low=normal.filter(entry=>entry.card.atk<1500).sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(high,'Bottomless Trap Hole needs a summonable Normal Monster with at least 1500 ATK');
assert.ok(low,'the negative fixture needs a summonable Normal Monster below 1500 ATK');
const other=normal.find(entry=>entry.id!==high.id&&entry.id!==low.id);
assert.ok(other,'the 2v2 fixture needs an additional Normal Monster');
const deckIds=[...new Set([high.id,low.id,other.id,...normal.slice(0,8).map(entry=>entry.id)])];
function member(seat){return 'm163-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
  assert.ok(ids.length>=8);
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
  throw new Error('M163 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id,position='atk'){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function act(state,seat,kind,filter=()=>true){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind===kind&&filter(candidate));
  assert.ok(action,'seat '+seat+' needs '+kind+' in '+state.core.phase);
  return tag.stepTagDuel(state,member(seat),action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Bottomless Trap Hole response chain must terminate');
    const seat=tag.tagDecisionMember(state).id;
    const action=tag.tagActions(state,seat).find(candidate=>candidate.kind==='pass');
    assert.ok(action,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,seat,action);
  }
  return state;
}
function snapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Bottomless Trap Hole must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function setup(targetId,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M163 Seat '+seat,
    cards:deck(seat===3?[BOTTOMLESS]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  const physicalTrap=takeCard(state,3,BOTTOMLESS);
  const trap={...physicalTrap,faceUp:false,setTurn:0};
  state.core.players[1].backrow.push(trap);
  const ally=deploy(state,2,other.id,'atk');
  const defender=deploy(state,1,other.id,'def');
  const summon=ensureInHand(state,0,targetId);
  return {state,trap,ally,defender,summon};
}

test('Bottomless Trap Hole is a summon-response Trap with a 1500 ATK banishment threshold',()=>{
  const effect=getEffect(BOTTOMLESS);
  assert.equal(getPlayableCard(BOTTOMLESS)?.kind,'trap');
  assert.equal(effect?.kind,'bottomlessTrapHole');
  assert.deepEqual(getActivationModel(effect),{
    speed:2,window:'summoned',damage:'never',opponentOnly:true,
    summonKinds:['summon','flip','specialSummon'],minimumSummonAtk:1500
  });
  assert.deepEqual(getDestructionModel(effect),{
    operation:'destroyMonsters',scope:'selected',faceUp:true,minimumAtk:1500,destination:'banished'
  });
});

test('active defender activates inactive teammate-owned Bottomless and banishes only the eligible summoned monster',()=>{
  let {state,trap,ally,defender,summon}=setup(high.id,'m163-bottomless-positive');
  assert.ok(high.card.atk>=1500);
  const before=snapshot(state);
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicBefore.includes(BOTTOMLESS),'the set Trap identity must remain private');
  assert.ok(!publicBefore.includes(trap.uid),'the set Trap UID must remain private');

  const normalSummon=tag.tagActions(state,member(0)).find(action=>
    action.kind==='summon'&&action.card===summon.uid&&action.position==='atk'
  );
  assert.ok(normalSummon,'the physical owner must receive the legal Normal Summon');
  state=tag.stepTagDuel(state,member(0),normalSummon);
  assert.equal(state.core.phase,'response');
  const summoned=state.core.players[0].monsters.find(monster=>monster.uid===summon.uid);
  assert.ok(summoned,'the summoned monster must be on the shared team field');
  assert.equal(tag.tagDecisionMember(state).id,member(1),'the active defender receives response priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],'the inactive physical Trap owner cannot act');

  const response=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===trap.uid&&action.target===summon.uid
  );
  assert.ok(response,'the active defender can activate the inactive teammate set Trap');
  state=settle(tag.stepTagDuel(state,member(1),response));

  assert.ok(state.core.players[0].banished.some(card=>card.uid===summon.uid),
    'the eligible summoned monster must be banished');
  assert.ok(!state.core.players[0].grave.some(card=>card.uid===summon.uid),
    'the banished monster must not enter the Graveyard');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===ally.uid),
    'another monster from the same attacking team must survive');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===defender.uid),
    'the defending team field must remain intact');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===trap.uid),
    'the activated Trap must enter its shared owner-team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('Bottomless Trap Hole cannot activate against a Normal Summon below 1500 ATK',()=>{
  let {state,trap,summon}=setup(low.id,'m163-bottomless-negative');
  assert.ok(low.card.atk<1500);
  const before=snapshot(state);
  const normalSummon=tag.tagActions(state,member(0)).find(action=>
    action.kind==='summon'&&action.card===summon.uid&&action.position==='atk'
  );
  assert.ok(normalSummon);
  state=tag.stepTagDuel(state,member(0),normalSummon);
  assert.equal(state.core.phase,'main','an ineligible summon resolves without opening a response chain');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===summon.uid),
    'an ineligible summoned monster remains on the field');
  assert.ok(!state.core.players[0].banished.some(card=>card.uid===summon.uid));
  assert.ok(!state.core.players[0].grave.some(card=>card.uid===summon.uid));
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===trap.uid),
    'the unused Set Trap remains on the field');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
