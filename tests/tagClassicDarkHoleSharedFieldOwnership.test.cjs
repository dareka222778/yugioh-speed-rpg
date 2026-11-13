'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getDestructionModel}=require('../dist/effectModels');

const DARK_HOLE='53129443';
const TRAP_HOLE='04206964';
const BOTTOMLESS='29401950';

const darkHole=getPlayableCard(DARK_HOLE);
assert.ok(darkHole&&darkHole.kind==='spell','Dark Hole must be an enabled Normal Spell');
const darkHoleEffect=getEffect(DARK_HOLE);
assert.equal(darkHoleEffect?.kind,'darkHole');
assert.deepEqual(getDestructionModel(darkHoleEffect),{
  operation:'destroyMonsters',scope:'all',destination:'grave'
});
for(const [id,kind] of [[TRAP_HOLE,'trapHole'],[BOTTOMLESS,'bottomlessTrapHole']]){
  assert.ok(getPlayableCard(id),'expected an enabled set Trap: '+id);
  assert.equal(getEffect(id)?.kind,kind);
}

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm119-seat-'+seat;}
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
  throw new Error('M119 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain Dark Hole');
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
  assert.equal(cards.length,before.size,'Dark Hole must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'all physical UIDs must remain unique');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Dark Hole response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function setup(withMonsters=true){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M119 Seat '+seat,
    cards:deck(seat===0?[DARK_HOLE]:seat===1?[TRAP_HOLE]:seat===2?[BOTTOMLESS]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m119-dark-hole-shared-field'});
  const before=inventorySnapshot(state);
  const darkHoleCard=ensureInHand(state,0,DARK_HOLE);
  const trapHoleCard=takeCard(state,1,TRAP_HOLE);
  const bottomlessCard=takeCard(state,2,BOTTOMLESS);
  const trapHole={...trapHoleCard,setTurn:0,faceUp:false};
  const bottomless={...bottomlessCard,setTurn:0,faceUp:false};
  state.core.players[1].backrow.push(trapHole);
  state.core.players[0].backrow.push(bottomless);
  state.core.turn=3;
  const monsters=withMonsters?[
    deploy(state,0,normal[0].id),
    deploy(state,1,normal[1].id),
    deploy(state,2,normal[2].id),
    deploy(state,3,normal[3].id,{faceUp:false,position:'def'})
  ]:[];
  assert.match(darkHoleCard.uid,/^m0:/,'Dark Hole must retain seat 0 physical ownership');
  assert.match(trapHole.uid,/^m1:/,'Trap Hole must retain seat 1 physical ownership');
  assert.match(bottomless.uid,/^m2:/,'Bottomless Trap Hole must retain seat 2 physical ownership');
  if(withMonsters){
    assert.deepEqual(monsters.map(card=>card.uid.slice(0,3)),['m0:','m1:','m2:','m3:']);
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
  }else assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,darkHoleCard,trapHole,bottomless,monsters};
}

test('Dark Hole destroys every monster on both shared 2v2 fields, including Set monsters, without touching backrow',()=>{
  const {state:initial,before,darkHoleCard,trapHole,bottomless,monsters}=setup(true);
  const publicBefore=tag.publicTagDuel(initial);
  const hidden=monsters[3];
  assert.ok(!JSON.stringify(publicBefore).includes(hidden.id),
    'a Set monster identity must remain private before Dark Hole resolves');
  assert.ok(!JSON.stringify(publicBefore).includes(hidden.uid),
    'a Set monster physical UID must remain private before Dark Hole resolves');
  for(const card of [trapHole,bottomless]){
    assert.ok(!JSON.stringify(publicBefore).includes(card.id),
      'a Set Trap identity must remain private: '+card.id);
    assert.ok(!JSON.stringify(publicBefore).includes(card.uid),
      'a Set Trap physical UID must remain private: '+card.uid);
  }

  const action=tag.tagActions(initial,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===darkHoleCard.uid
  );
  assert.ok(action,'the active physical seat must receive the legal Dark Hole activation');
  assert.deepEqual(tag.tagActions(initial,member(2)),[],
    'the inactive physical teammate cannot execute the Main Phase action');
  const unchanged=JSON.stringify(initial);
  assert.throws(()=>tag.stepTagDuel(initial,member(2),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(initial),unchanged,
    'a rejected inactive-seat action must not mutate the duel');

  const state=settle(tag.stepTagDuel(initial,member(0),action));
  assert.equal(state.core.phase,'main','Dark Hole resolves immediately when no legal response exists');
  assert.deepEqual(state.core.players[0].monsters,[],
    'Dark Hole destroys monsters controlled by both physical teammates on team 0');
  assert.deepEqual(state.core.players[1].monsters,[],
    'Dark Hole destroys monsters controlled by both physical teammates on team 1');
  for(const card of [monsters[0],monsters[2]]){
    assert.ok(state.core.players[0].grave.some(entry=>entry.uid===card.uid),
      'team 0 Graveyard must receive its physical members: '+card.uid);
  }
  for(const card of [monsters[1],monsters[3]]){
    assert.ok(state.core.players[1].grave.some(entry=>entry.uid===card.uid),
      'team 1 Graveyard must receive its physical members, including the Set monster: '+card.uid);
  }
  assert.ok(state.core.players[0].grave.some(entry=>entry.uid===darkHoleCard.uid),
    'Dark Hole must resolve to the activating team Graveyard');
  assert.deepEqual(state.core.players[0].backrow.map(card=>card.uid),[bottomless.uid],
    'Dark Hole must not destroy the activating team backrow');
  assert.deepEqual(state.core.players[1].backrow.map(card=>card.uid),[trapHole.uid],
    'Dark Hole must not destroy the opposing team backrow');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('Dark Hole is not offered when both shared fields contain no monsters',()=>{
  const {state,before,darkHoleCard}=setup(false);
  assert.deepEqual(state.core.players.map(player=>player.monsters.length),[0,0]);
  const snapshot=JSON.stringify(state);
  const actions=tag.tagActions(state,member(0));
  assert.ok(!actions.some(action=>action.kind==='spell'&&action.card===darkHoleCard.uid),
    'a global destruction Spell with no monster targets must not be activatable');
  assert.equal(JSON.stringify(state),snapshot,'checking legal actions must not mutate the duel');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
