'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect,equipEligible}=require('../dist/effectRegistry');

const BLUE_EYES='89631139';
const SUMMONED_SKULL='70781052';
const DARK_MAGICIAN='46986414';
const DRAGON_TREASURE='01435851';
const DARK_ENERGY='04614116';

const entries=[
  {equip:DRAGON_TREASURE,name:'Dragon Treasure',target:BLUE_EYES,wrongTarget:DARK_MAGICIAN,race:'Dragon',bonus:300},
  {equip:DARK_ENERGY,name:'Dark Energy',target:SUMMONED_SKULL,wrongTarget:BLUE_EYES,race:'Fiend',bonus:300}
];
for(const entry of entries){
  assert.equal(getPlayableCard(entry.equip)?.kind,'spell',entry.name+' must be certified');
  assert.equal(getEffect(entry.equip)?.kind,'equip',entry.name+' must use the equip model');
  assert.deepEqual(getEffect(entry.equip)?.races,[entry.race]);
  assert.equal(getEffect(entry.equip)?.atk,entry.bonus);
  assert.equal(getEffect(entry.equip)?.def,entry.bonus);
  assert.equal(getPlayableCard(entry.target)?.race,entry.race);
  assert.notEqual(getPlayableCard(entry.wrongTarget)?.race,entry.race);
}
assert.equal(getPlayableCard(BLUE_EYES)?.race,'Dragon');
assert.equal(getPlayableCard(SUMMONED_SKULL)?.race,'Fiend');
assert.equal(getPlayableCard(DARK_MAGICIAN)?.race,'Spellcaster');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7);
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm147-seat-'+seat;}
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
  throw new Error('M147 fixture card missing from physical seat '+seat+': '+id);
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

for(const entry of entries)test(entry.name+' equips only its eligible monster on the shared 2v2 field',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M147 Seat '+seat,
    cards:deck(seat===0?[entry.equip]:seat===2?[entry.target]:seat===3?[entry.wrongTarget]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m147-'+entry.equip});
  const equip=takeCard(state,0,entry.equip);
  holder(state,0).hand.push(equip);
  const eligibleUid=deploy(state,2,entry.target);
  const ineligibleUid=deploy(state,3,entry.wrongTarget);
  state.core.turn=3;

  assert.match(equip.uid,/^m0:/);
  assert.match(eligibleUid,/^m2:/);
  assert.match(ineligibleUid,/^m3:/);
  assert.equal(equipEligible(getEffect(entry.equip),getPlayableCard(entry.target)),true);
  assert.equal(equipEligible(getEffect(entry.equip),getPlayableCard(entry.wrongTarget)),false);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=snapshot(state);
  const eligibleBase=getPlayableCard(entry.target);
  const ineligibleBase=getPlayableCard(entry.wrongTarget);

  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===equip.uid&&candidate.target===eligibleUid
  );
  assert.ok(action,'active seat 0 must be able to equip its inactive teammate target');
  assert.ok(!tag.tagActions(state,member(0)).some(candidate=>
    candidate.kind==='spell'&&candidate.card===equip.uid&&candidate.target===ineligibleUid
  ),'a monster with the wrong race must not be offered as an equip target');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical target owner cannot execute the Equip Spell');

  state=tag.stepTagDuel(state,member(0),action);
  assert.equal(state.core.phase,'main');
  const attached=state.core.players[0].backrow.find(card=>card.uid===equip.uid);
  assert.ok(attached,'Equip Spell remains in the shared team backrow');
  assert.equal(attached.faceUp,true);
  assert.equal(attached.equippedTo,eligibleUid,'Equip Spell stores the physical target UID');
  assert.equal(engine.atk(findMonster(state,2,eligibleUid),state.core),eligibleBase.atk+entry.bonus);
  assert.equal(engine.def(findMonster(state,2,eligibleUid),state.core),eligibleBase.defense+entry.bonus);
  assert.equal(engine.atk(findMonster(state,3,ineligibleUid),state.core),ineligibleBase.atk);
  assert.equal(engine.def(findMonster(state,3,ineligibleUid),state.core),ineligibleBase.defense);
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===eligibleUid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===ineligibleUid));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.equal(engine.atk(findMonster(state,2,eligibleUid),state.core),eligibleBase.atk+entry.bonus);
  assert.equal(engine.def(findMonster(state,2,eligibleUid),state.core),eligibleBase.defense+entry.bonus);
  assertConserved(state,before);
});
