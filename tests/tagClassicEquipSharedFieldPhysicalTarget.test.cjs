'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect,equipEligible}=require('../dist/effectRegistry');

const DARK_EQUIP='37120512';
const SPELLCASTER_EQUIP='91595718';
const DARK_MAGICIAN='46986414';
const BLUE_EYES='89631139';
for(const [id,kind] of [[DARK_EQUIP,'spell'],[SPELLCASTER_EQUIP,'spell'],[DARK_MAGICIAN,'monster'],[BLUE_EYES,'monster']]){
  assert.equal(getPlayableCard(id)?.kind,kind,'expected certified card '+id);
}
assert.equal(getEffect(DARK_EQUIP)?.kind,'equip');
assert.equal(getEffect(DARK_EQUIP)?.attribute,'DARK');
assert.equal(getEffect(DARK_EQUIP)?.atk,400);
assert.equal(getEffect(DARK_EQUIP)?.def,-200);
assert.equal(getEffect(SPELLCASTER_EQUIP)?.kind,'equip');
assert.equal(getEffect(SPELLCASTER_EQUIP)?.races[0],'Spellcaster');
assert.equal(getEffect(SPELLCASTER_EQUIP)?.atk,300);
assert.equal(getEffect(SPELLCASTER_EQUIP)?.def,300);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7);
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm144-seat-'+seat;}
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
  throw new Error('M144 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
for(const entry of [
  {equip:DARK_EQUIP,name:'Sword of Dark Destruction',eligible:card=>card.attribute==='DARK'},
  {equip:SPELLCASTER_EQUIP,name:'Book of Secret Arts',eligible:card=>card.race==='Spellcaster'}
])test(entry.name+' can equip an eligible monster physically owned by the inactive teammate',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M144 Seat '+seat,
    cards:deck(seat===0?[entry.equip]:seat===2?[DARK_MAGICIAN]:seat===3?[BLUE_EYES]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m144-'+entry.equip});
  const equip=takeCard(state,0,entry.equip);
  holder(state,0).hand.push(equip);
  const eligible=deploy(state,2,DARK_MAGICIAN);
  const ineligible=deploy(state,3,BLUE_EYES);
  state.core.turn=3;
  assert.match(equip.uid,/^m0:/);
  assert.match(eligible.uid,/^m2:/);
  assert.match(ineligible.uid,/^m3:/);
  assert.equal(entry.eligible(getPlayableCard(DARK_MAGICIAN)),true);
  assert.equal(entry.eligible(getPlayableCard(BLUE_EYES)),false);
  assert.equal(equipEligible(getEffect(entry.equip),getPlayableCard(DARK_MAGICIAN)),true);
  assert.equal(equipEligible(getEffect(entry.equip),getPlayableCard(BLUE_EYES)),false);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===equip.uid&&candidate.target===eligible.uid
  );
  assert.ok(action,'active seat 0 must be able to equip its partner monster');
  assert.ok(!tag.tagActions(state,member(0)).some(candidate=>
    candidate.kind==='spell'&&candidate.card===equip.uid&&candidate.target===ineligible.uid
  ),'an ineligible opponent monster must not be offered as an equip target');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'inactive physical target owner cannot execute the equip activation');
  state=tag.stepTagDuel(state,member(0),action);
  assert.equal(state.core.phase,'main');
  const attached=state.core.players[0].backrow.find(card=>card.uid===equip.uid);
  assert.ok(attached,'Equip Spell remains on the shared field');
  assert.equal(attached.faceUp,true);
  assert.equal(attached.equippedTo,eligible.uid,'Equip Spell attaches to the physical teammate target UID');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===eligible.uid),
    'equipped monster remains on the shared team field');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===ineligible.uid),
    'ineligible opposing monster remains untouched');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
