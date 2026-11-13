'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const MST='05318639';
const DRAGON_TREASURE='01435851';
const MOUNTAIN='50913601';
const BLUE_EYES='89631139';

for(const [id,kind] of [[MST,'spell'],[DRAGON_TREASURE,'spell'],[MOUNTAIN,'spell'],[BLUE_EYES,'monster']]){
  assert.equal(getPlayableCard(id)?.kind,kind,'expected a certified card: '+id);
}
assert.equal(getEffect(MST)?.kind,'mysticalSpaceTyphoon');
assert.equal(getEffect(DRAGON_TREASURE)?.kind,'equip');
assert.equal(getEffect(MOUNTAIN)?.kind,'field');
assert.equal(getEffect(DRAGON_TREASURE)?.atk,300);
assert.equal(getEffect(MOUNTAIN)?.atk,200);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7);
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm150-seat-'+seat;}
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
  throw new Error('M150 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster.uid;
}
function findMonster(state,seat,uid){
  const monster=state.core.players[seat%2].monsters.find(card=>card.uid===uid);
  assert.ok(monster,'physical monster must remain on its shared team field: '+uid);
  return monster;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the MST response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current response priority must have a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function endTurn(state,seat){
  assert.equal(tag.tagDecisionMember(state).id,member(seat));
  return tag.stepTagDuel(state,member(seat),{kind:'end'});
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
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Mystical Space Typhoon destroys a teammate-owned Equip Spell and removes its continuous ATK/DEF bonus',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M150 Equip Seat '+seat,
    cards:deck(seat===0?[DRAGON_TREASURE]:seat===2?[BLUE_EYES,MST]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m150-mst-destroys-equip'});
  const before=snapshot(state);
  const dragonUid=deploy(state,2,BLUE_EYES);
  const equip=takeCard(state,0,DRAGON_TREASURE);
  holder(state,0).hand.push(equip);
  const mst=takeCard(state,2,MST);
  holder(state,2).hand.push(mst);
  state.core.turn=3;

  assert.match(dragonUid,/^m2:/);
  assert.match(equip.uid,/^m0:/);
  assert.match(mst.uid,/^m2:/);
  const base=getPlayableCard(BLUE_EYES);
  const equipAction=tag.tagActions(state,member(0)).find(action=>
    action.kind==='spell'&&action.card===equip.uid&&action.target===dragonUid
  );
  assert.ok(equipAction,'seat 0 must be able to equip its partner-owned Blue-Eyes');
  state=tag.stepTagDuel(state,member(0),equipAction);
  const attached=state.core.players[0].backrow.find(card=>card.uid===equip.uid);
  assert.ok(attached);
  assert.equal(attached.equippedTo,dragonUid);
  assert.equal(engine.atk(findMonster(state,2,dragonUid),state.core),base.atk+300);
  assert.equal(engine.def(findMonster(state,2,dragonUid),state.core),base.defense+300);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  state=endTurn(state,0);
  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  assert.deepEqual(tag.tagActions(state,member(0)),[],
    'the inactive physical Equip Spell owner cannot activate MST for the team');
  const destroy=tag.tagActions(state,member(2)).find(action=>
    action.kind==='spell'&&action.card===mst.uid&&action.target===equip.uid
  );
  assert.ok(destroy,'the active teammate must be able to destroy the shared Equip Spell');
  state=settle(tag.stepTagDuel(state,member(2),destroy));

  assert.ok(state.core.players[0].grave.some(card=>card.uid===equip.uid&&card.id===DRAGON_TREASURE),
    'destroyed Equip Spell goes to the shared team Graveyard with its original UID');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===mst.uid&&card.id===MST));
  assert.ok(!state.core.players[0].backrow.some(card=>card.uid===equip.uid));
  assert.equal(engine.atk(findMonster(state,2,dragonUid),state.core),base.atk,
    'destroying the Equip Spell removes its ATK modifier immediately');
  assert.equal(engine.def(findMonster(state,2,dragonUid),state.core),base.defense,
    'destroying the Equip Spell removes its DEF modifier immediately');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.equal(engine.atk(findMonster(state,2,dragonUid),state.core),base.atk);
  assert.equal(engine.def(findMonster(state,2,dragonUid),state.core),base.defense);
  assertConserved(state,before);
});

test('Mystical Space Typhoon destroys a teammate-owned Field Spell and clears its global modifiers',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M150 Field Seat '+seat,
    cards:deck(seat===0?[MOUNTAIN]:seat===2?[BLUE_EYES,MST]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m150-mst-destroys-field'});
  const before=snapshot(state);
  const dragonUid=deploy(state,2,BLUE_EYES);
  const mountain=takeCard(state,0,MOUNTAIN);
  holder(state,0).hand.push(mountain);
  const mst=takeCard(state,2,MST);
  holder(state,2).hand.push(mst);
  state.core.turn=3;

  assert.match(dragonUid,/^m2:/);
  assert.match(mountain.uid,/^m0:/);
  assert.match(mst.uid,/^m2:/);
  const base=getPlayableCard(BLUE_EYES);
  const activate=tag.tagActions(state,member(0)).find(action=>
    action.kind==='field'&&action.card===mountain.uid
  );
  assert.ok(activate,'seat 0 must be able to activate Mountain');
  state=settle(tag.stepTagDuel(state,member(0),activate));
  assert.equal(state.core.players[0].field?.uid,mountain.uid);
  assert.equal(state.core.players[0].field?.faceUp,true);
  assert.equal(engine.atk(findMonster(state,2,dragonUid),state.core),base.atk+200);
  assert.equal(engine.def(findMonster(state,2,dragonUid),state.core),base.defense+200);

  state=endTurn(state,0);
  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  const destroy=tag.tagActions(state,member(2)).find(action=>
    action.kind==='spell'&&action.card===mst.uid&&action.target===mountain.uid
  );
  assert.ok(destroy,'MST must be able to target the active shared Field Spell');
  state=settle(tag.stepTagDuel(state,member(2),destroy));

  assert.equal(state.core.players[0].field,null);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===mountain.uid&&card.id===MOUNTAIN),
    'destroyed Field Spell goes to the shared team Graveyard with its original UID');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===mst.uid&&card.id===MST));
  assert.equal(engine.atk(findMonster(state,2,dragonUid),state.core),base.atk,
    'destroying Mountain removes its global ATK modifier immediately');
  assert.equal(engine.def(findMonster(state,2,dragonUid),state.core),base.defense,
    'destroying Mountain removes its global DEF modifier immediately');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.equal(engine.atk(findMonster(state,2,dragonUid),state.core),base.atk);
  assert.equal(engine.def(findMonster(state,2,dragonUid),state.core),base.defense);
  assertConserved(state,before);
});
