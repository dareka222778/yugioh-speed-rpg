'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const SAKURETSU_ARMOR='56120475';
assert.equal(getPlayableCard(SAKURETSU_ARMOR)?.kind,'trap','Sakuretsu Armor must be an enabled Trap');
assert.equal(getEffect(SAKURETSU_ARMOR)?.kind,'sakuretsuArmor','Sakuretsu Armor must have its executable battle-response effect');

const normalCards=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.level<=4&&Number.isInteger(entry.card.atk));
assert.ok(normalCards.length>=7,'the battle-response fixture needs seven certified Normal Monsters');
const attackerId=normalCards.reduce((best,current)=>current.card.atk>best.card.atk?current:best).id;
const deckIds=[...new Set([attackerId,...normalCards.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);
function normalDeck(){return Array.from({length:20},(_,index)=>deckIds[index%deckIds.length]);}
function member(seat){return 'm78-seat-'+seat;}
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
  throw new Error('M78 fixture card missing from physical seat '+seat+': '+id);
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
  for(const card of cards)assert.equal(before.get(card.uid),card.id);
}

test('an active teammate may answer an attack with the inactive partner hidden Sakuretsu Armor',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M78 Seat '+seat,
    cards:seat===3?[SAKURETSU_ARMOR,...normalDeck().slice(1)]:normalDeck()
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m78-shared-battle-response'});
  const before=inventorySnapshot(state);
  const attackerCard=takeCard(state,0,attackerId);
  const attacker={
    ...attackerCard,
    owner:0,
    position:'atk',
    faceUp:true,
    entered:0,
    changed:0,
    attacked:0,
    atkBoost:0,
    defBoost:0
  };
  state.core.players[0].monsters.push(attacker);

  const trapCard=takeCard(state,3,SAKURETSU_ARMOR);
  const trap={...trapCard,setTurn:0,faceUp:false};
  state.core.players[1].backrow.push(trap);
  state.core.turn=3;
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.match(attacker.uid,/^m0:/);
  assert.match(trap.uid,/^m3:/,'the Trap must preserve its inactive physical owner UID');

  const hidden=tag.publicTagDuel(state).teams[1].backrow;
  assert.deepEqual(hidden,[{id:null,faceUp:false}],'the public projection must hide the set Trap identity');
  assert.ok(!JSON.stringify(tag.publicTagDuel(state)).includes(SAKURETSU_ARMOR));
  assert.ok(!JSON.stringify(tag.publicTagDuel(state)).includes(trap.uid));

  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settle(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===undefined
  );
  assert.ok(attack);
  state=tag.stepTagDuel(state,member(0),attack);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1),'the response priority belongs to the active physical member of the defending team');

  const response=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===trap.uid&&action.target===attacker.uid
  );
  assert.ok(response,'the active teammate must be allowed to activate the inactive partner set Trap');
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(3)),[],'the inactive physical Trap owner must not receive response actions');
  assert.throws(()=>tag.stepTagDuel(state,member(3),response),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'an inactive partner response must not mutate the chain');

  state=settle(tag.stepTagDuel(state,member(1),response));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===attacker.uid&&card.id===attacker.id),
    'Sakuretsu Armor must destroy the attacking monster');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===trap.uid&&card.id===SAKURETSU_ARMOR),
    'the activated Trap must resolve to the shared team Graveyard while preserving physical UID');
  assert.ok(!state.core.players[0].monsters.some(card=>card.uid===attacker.uid));
  assert.equal(state.core.players[0].lp,4000,'negating the attack must prevent battle damage to the defending team');
  assert.equal(state.core.players[1].lp,4000,'the responding team LP must remain unchanged');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
