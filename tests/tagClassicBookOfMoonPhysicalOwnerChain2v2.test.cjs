'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const BOOK_OF_MOON='14087893';
const SAKURETSU='56120475';
assert.equal(getPlayableCard(BOOK_OF_MOON)?.kind,'spell');
assert.equal(getEffect(BOOK_OF_MOON)?.kind,'bookOfMoon');
assert.equal(getActivationModel(getEffect(BOOK_OF_MOON))?.speed,2);
assert.equal(getActivationModel(getEffect(BOOK_OF_MOON))?.window,'free');
assert.equal(getEffect(SAKURETSU)?.kind,'sakuretsuArmor');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm157-seat-'+seat;}
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
  throw new Error('M157 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
  assert.equal(cards.length,before.size,'Book of Moon must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Book of Moon response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('Book of Moon protects an inactive teammate-owned attacker by invalidating Sakuretsu Armor in the 2v2 chain',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M157 Seat '+seat,
    cards:deck(seat===2?[SAKURETSU]:seat===3?[BOOK_OF_MOON]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:3,seed:'m157-book-of-moon-chain-protection'});
  const friendlyTarget=deploy(state,0,normal[0].id);
  const friendlyAlly=deploy(state,2,normal[1].id);
  const attacker=deploy(state,1,normal[2].id);
  const opposingAlly=deploy(state,3,normal[3].id);
  const opposingDefense=deploy(state,1,normal[4].id,'def');
  const armorCard=takeCard(state,2,SAKURETSU);
  const armor={...armorCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(armor);
  const book=takeCard(state,3,BOOK_OF_MOON);
  holder(state,3).hand.push(book);
  state.core.turn=3;

  assert.match(attacker.uid,/^m1:/,'the attacking monster belongs physically to inactive teammate seat 1');
  assert.match(armor.uid,/^m2:/,'the Set Trap belongs physically to inactive teammate seat 2');
  assert.match(book.uid,/^m3:/,'Book of Moon belongs physically to active attacker seat 3');
  assert.equal(tag.tagDecisionMember(state).id,member(3));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const publicBefore=tag.publicTagDuel(state);
  for(const hidden of [BOOK_OF_MOON,SAKURETSU,book.uid,armor.uid]){
    assert.ok(!JSON.stringify(publicBefore).includes(hidden),'private card identity must not leak: '+hidden);
  }

  const battle=tag.tagActions(state,member(3)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settle(tag.stepTagDuel(state,member(3),battle));
  const attack=tag.tagActions(state,member(3)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===friendlyTarget.uid
  );
  assert.ok(attack,'active seat 3 must attack with the shared-field monster physically owned by seat 1');
  state=tag.stepTagDuel(state,member(3),attack);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  const trap=tag.tagActions(state,member(0)).find(action=>
    action.kind==='trap'&&action.card===armor.uid&&action.target===attacker.uid
  );
  assert.ok(trap,'active defending seat 0 must be able to target the exact attacker with its teammate Set Trap');
  state=tag.stepTagDuel(state,member(0),trap);
  assert.equal(tag.tagDecisionMember(state).id,member(3),
    'the attacking team active seat receives priority to respond to Sakuretsu Armor');
  assert.deepEqual(tag.tagActions(state,member(1)),[],
    'inactive physical attacker owner seat 1 cannot submit the chain response');
  const protect=tag.tagActions(state,member(3)).find(action=>
    action.kind==='spell'&&action.card===book.uid&&action.target===attacker.uid
  );
  assert.ok(protect,'active seat 3 may chain Book of Moon to its teammate-owned attacking monster');
  state=settle(tag.stepTagDuel(state,member(3),protect));

  const protectedAttacker=state.core.players[1].monsters.find(card=>card.uid===attacker.uid);
  assert.ok(protectedAttacker,'the original physical attacker must remain on the shared field');
  assert.equal(protectedAttacker.faceUp,false,'Book of Moon turns the attacker face-down');
  assert.equal(protectedAttacker.position,'def','Book of Moon changes the attacker to Defense Position');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===armor.uid),
    'Sakuretsu Armor resolves without destroying its now-invalid face-up target');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===book.uid),
    'Book of Moon enters the attacking team shared Graveyard');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===friendlyTarget.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===friendlyAlly.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===opposingAlly.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===opposingDefense.uid));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
