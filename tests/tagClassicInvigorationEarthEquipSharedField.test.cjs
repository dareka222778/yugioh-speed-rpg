'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect,equipEligible}=require('../dist/effectRegistry');

const INVIGORATION='98374133';
const GIANT_SOLDIER='13039848';
const BLUE_EYES='89631139';

assert.equal(getPlayableCard(INVIGORATION)?.kind,'spell');
assert.equal(getEffect(INVIGORATION)?.kind,'equip');
assert.equal(getEffect(INVIGORATION)?.attribute,'EARTH');
assert.equal(getEffect(INVIGORATION)?.atk,400);
assert.equal(getEffect(INVIGORATION)?.def,-200);
assert.equal(getPlayableCard(GIANT_SOLDIER)?.attribute,'EARTH');
assert.equal(getPlayableCard(GIANT_SOLDIER)?.race,'Rock');
assert.equal(getPlayableCard(BLUE_EYES)?.attribute,'LIGHT');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7);
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm148-seat-'+seat;}
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
  throw new Error('M148 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster.uid;
}
function findMonster(state,seat,uid){
  const monster=state.core.players[seat%2].monsters.find(card=>card.uid===uid);
  assert.ok(monster,'physical monster must remain on the shared field: '+uid);
  return monster;
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

test('Invigoration equips only an EARTH monster owned by the inactive teammate and applies +400/-200',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M148 Seat '+seat,
    cards:deck(seat===0?[INVIGORATION]:seat===2?[GIANT_SOLDIER]:seat===3?[BLUE_EYES]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m148-invigoration-earth-equip'});
  const equip=takeCard(state,0,INVIGORATION);
  holder(state,0).hand.push(equip);
  const eligibleUid=deploy(state,2,GIANT_SOLDIER);
  const ineligibleUid=deploy(state,3,BLUE_EYES);
  state.core.turn=3;

  assert.match(equip.uid,/^m0:/);
  assert.match(eligibleUid,/^m2:/);
  assert.match(ineligibleUid,/^m3:/);
  assert.equal(equipEligible(getEffect(INVIGORATION),getPlayableCard(GIANT_SOLDIER)),true);
  assert.equal(equipEligible(getEffect(INVIGORATION),getPlayableCard(BLUE_EYES)),false);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=snapshot(state);
  const eligibleBase=getPlayableCard(GIANT_SOLDIER);
  const ineligibleBase=getPlayableCard(BLUE_EYES);

  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===equip.uid&&candidate.target===eligibleUid
  );
  assert.ok(action,'active seat 0 must be able to equip the inactive teammate EARTH monster');
  assert.ok(!tag.tagActions(state,member(0)).some(candidate=>
    candidate.kind==='spell'&&candidate.card===equip.uid&&candidate.target===ineligibleUid
  ),'a non-EARTH opponent monster must not be offered as an equip target');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical target owner cannot execute the Equip Spell');

  state=tag.stepTagDuel(state,member(0),action);
  const attached=state.core.players[0].backrow.find(card=>card.uid===equip.uid);
  assert.ok(attached,'Invigoration remains in the shared team backrow');
  assert.equal(attached.faceUp,true);
  assert.equal(attached.equippedTo,eligibleUid);
  assert.equal(engine.atk(findMonster(state,2,eligibleUid),state.core),eligibleBase.atk+400);
  assert.equal(engine.def(findMonster(state,2,eligibleUid),state.core),eligibleBase.defense-200);
  assert.equal(engine.atk(findMonster(state,3,ineligibleUid),state.core),ineligibleBase.atk);
  assert.equal(engine.def(findMonster(state,3,ineligibleUid),state.core),ineligibleBase.defense);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.equal(engine.atk(findMonster(state,2,eligibleUid),state.core),eligibleBase.atk+400);
  assert.equal(engine.def(findMonster(state,2,eligibleUid),state.core),eligibleBase.defense-200);
  assertConserved(state,before);
});
