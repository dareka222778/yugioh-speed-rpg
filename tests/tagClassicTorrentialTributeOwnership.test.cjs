'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel,getDestructionModel}=require('../dist/effectModels');

const TORRENTIAL='53582587';
const torrent=getPlayableCard(TORRENTIAL);
assert.ok(torrent&&torrent.kind==='trap','Torrential Tribute must be an enabled Trap');
const torrentEffect=getEffect(TORRENTIAL);
assert.equal(torrentEffect?.kind,'torrentialTribute');
assert.equal(getActivationModel(torrentEffect)?.window,'summoned');
assert.deepEqual(getActivationModel(torrentEffect)?.summonKinds,['summon','flip','specialSummon']);
assert.deepEqual(getDestructionModel(torrentEffect),{
  operation:'destroyMonsters',scope:'all',destination:'grave'
});

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);
function member(seat){return 'm109-seat-'+seat;}
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
  throw new Error('M109 fixture card missing from physical seat '+seat+': '+id);
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
function deploy(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique before resolution');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Torrential Tribute must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'physical UIDs must remain unique');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Torrential response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function setup(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M109 Seat '+seat,cards:deck(seat===3?[TORRENTIAL]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m109-torrential-tribute-physical-owners'});
  const before=inventorySnapshot(state);
  const summoned=ensureInHand(state,0,normal[0].id);
  const trapCard=takeCard(state,3,TORRENTIAL);
  const trap={...trapCard,setTurn:0,faceUp:false};
  state.core.players[1].backrow.push(trap);
  const ally=deploy(state,2,normal[1].id);
  const enemy=deploy(state,1,normal[2].id);
  const enemyHidden=deploy(state,3,normal[3].id,{faceUp:false,position:'def'});
  state.core.turn=3;
  assert.match(summoned.uid,/^m0:/,'the Normal Summon must retain seat 0 physical ownership');
  assert.match(ally.uid,/^m2:/,'the ally must retain seat 2 physical ownership');
  assert.match(enemy.uid,/^m1:/,'the opposing monster must retain seat 1 physical ownership');
  assert.match(enemyHidden.uid,/^m3:/,'the Set opposing monster must retain seat 3 physical ownership');
  assert.match(trap.uid,/^m3:/,'Torrential Tribute must retain inactive seat 3 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,summoned,ally,enemy,enemyHidden,trap};
}
function normalSummon(state,summoned){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='summon'&&candidate.card===summoned.uid&&candidate.position==='atk'
  );
  assert.ok(action,'the active physical seat must receive the legal Normal Summon');
  return tag.stepTagDuel(state,member(0),action);
}

test('inactive teammate-owned Torrential Tribute destroys all monsters on both shared 2v2 fields',()=>{
  const {state:initial,before,summoned,ally,enemy,enemyHidden,trap}=setup();
  const publicBefore=tag.publicTagDuel(initial);
  assert.ok(!JSON.stringify(publicBefore).includes(TORRENTIAL),
    'the set Trap identity must remain private');
  assert.ok(!JSON.stringify(publicBefore).includes(trap.uid),
    'the set Trap physical UID must remain private');

  let state=normalSummon(initial,summoned);
  assert.equal(state.core.phase,'response','a successful Normal Summon opens the Torrential response window');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical defender receives response priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical owner of Torrential Tribute must not receive response actions');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive attacking teammate must not receive response actions');

  const response=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===trap.uid
  );
  assert.ok(response,'the active defender must activate the inactive partner set Torrential Tribute');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),response),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'the inactive physical Trap owner cannot mutate the chain');

  state=settle(tag.stepTagDuel(state,member(1),response));
  assert.equal(state.core.phase,'main');
  assert.deepEqual(state.core.players[0].monsters,[],
    'Torrential Tribute destroys the summoned monster and the other physical teammate monster');
  assert.deepEqual(state.core.players[1].monsters,[],
    'Torrential Tribute also destroys both opposing physical owners, including a Set monster');
  for(const card of [summoned,ally])
    assert.ok(state.core.players[0].grave.some(entry=>entry.uid===card.uid),
      'team 0 Graveyard must receive its physical members: '+card.uid);
  for(const card of [enemy,enemyHidden,trap])
    assert.ok(state.core.players[1].grave.some(entry=>entry.uid===card.uid),
      'team 1 Graveyard must receive its physical members and the activated Trap: '+card.uid);
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
