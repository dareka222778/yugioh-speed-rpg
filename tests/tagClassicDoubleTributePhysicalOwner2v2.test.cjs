'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const DOUBLE_TRIBUTES=[
  {id:'17444133',name:'Kaiser Sea Horse',attribute:'LIGHT'},
  {id:'44436472',name:'Double Coston',attribute:'DARK'},
  {id:'92084010',name:'Unshaven Angler',attribute:'WATER'},
  {id:'38479725',name:'The Trojan Horse',attribute:'EARTH'}
];
const TARGETS={
  LIGHT:{id:'89631139',name:'Blue-Eyes White Dragon',level:8},
  DARK:{id:'46986414',name:'Dark Magician',level:7},
  EARTH:{id:'06368038',name:'Gaia the Fierce Knight',level:7}
};

for(const source of DOUBLE_TRIBUTES){
  assert.deepEqual(getMonsterEffect(source.id)?.operation,{kind:'doubleTribute',attribute:source.attribute},
    source.name+' must expose only its printed double-Tribute attribute');
  assert.equal(getPlayableCard(source.id)?.kind,'monster');
}
for(const [attribute,target] of Object.entries(TARGETS)){
  const card=getPlayableCard(target.id);
  assert.equal(card?.attribute,attribute,target.name+' must match the fixture attribute');
  assert.ok(card?.level>=7,target.name+' must require two Tributes');
}

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the 2v2 fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);
function member(seat){return 'm176-seat-'+seat;}
function deck(required){
  const ids=[...new Set([...required,...normalIds])];
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(required,seed){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M176 Seat '+seat,cards:deck(required)}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  return state;
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
  throw new Error('M176 fixture card missing from physical seat '+seat+': '+id);
}
function deployPartnerTribute(state,id){
  const card=takeCard(state,2,id);
  const monster={...card,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[0].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all physical UIDs must be unique before Tribute Summon');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Tribute Summon must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Tribute Summon must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical card identity changed: '+card.uid);
}
function prepare(sourceId,targetId,seed){
  let state=game([sourceId,targetId],seed);
  const before=inventorySnapshot(state);
  const source=deployPartnerTribute(state,sourceId);
  const target=takeCard(state,0,targetId);
  holder(state,0).hand.push(target);
  const partnerHandBefore=tag.tagMemberHand(state,member(2)).map(card=>card.uid).sort();
  assert.match(source.uid,/^m2:/,'the double-Tribute source must retain seat 2 physical ownership');
  assert.match(target.uid,/^m0:/,'the high-Level monster must come from active seat 0 private hand');
  return {state,before,source,target,partnerHandBefore};
}
function tributeSummonAction(state,target,source){
  return tag.tagActions(state,member(0)).find(action=>
    action.kind==='summon'&&action.card===target.uid&&action.position==='atk'&&
    action.tributes.length===1&&action.tributes[0]===source.uid
  );
}
function assertSuccessfulDoubleTribute(sourceId,targetId,seed){
  const {state:initial,before,source,target,partnerHandBefore}=prepare(sourceId,targetId,seed);
  const action=tributeSummonAction(initial,target,source);
  assert.ok(action,'active seat 0 must be able to use the face-up partner-owned matching Double Tribute monster as one Tribute');
  const state=tag.stepTagDuel(initial,member(0),action);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid&&card.id===sourceId),
    'the partner-owned Double Tribute monster must enter the shared team Graveyard with its physical UID');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===target.uid&&card.id===targetId),
    'the high-Level monster must be summoned from the active physical member hand');
  assert.ok(!state.core.players.some(team=>team.monsters.some(card=>card.uid===source.uid)),
    'the single Double Tribute source must leave the shared field');
  assert.ok(!tag.tagMemberHand(state,member(0)).some(card=>card.uid===target.uid),
    'the active physical member must spend its own summoned card');
  assert.deepEqual(tag.tagMemberHand(state,member(2)).map(card=>card.uid).sort(),partnerHandBefore,
    'the inactive partner hand must remain private and unchanged');
  assert.equal(state.core.players[0].summoned,true,'the successful action consumes the team normal summon');
  tag.assertTagDuel(state);
  assertConserved(state,before);
}
function assertAttributeMismatchCannotDoubleTribute(sourceId,targetId,seed){
  const {state,before,source,target}=prepare(sourceId,targetId,seed);
  const action=tributeSummonAction(state,target,source);
  assert.equal(action,undefined,'a Double Tribute monster cannot replace two Tributes for a different Attribute');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid),
    'the mismatched source must remain on the shared field');
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===target.uid),
    'the rejected high-Level monster must remain in the active physical hand');
  tag.assertTagDuel(state);
  assertConserved(state,before);
}

test('Kaiser Sea Horse counts as two Tributes for a LIGHT monster using its inactive teammate physical card',()=>{
  assertSuccessfulDoubleTribute('17444133',TARGETS.LIGHT.id,'m176-kaiser-light');
});
test('Double Coston counts as two Tributes for a DARK monster using its inactive teammate physical card',()=>{
  assertSuccessfulDoubleTribute('44436472',TARGETS.DARK.id,'m176-coston-dark');
});
test('The Trojan Horse counts as two Tributes for an EARTH monster using its inactive teammate physical card',()=>{
  assertSuccessfulDoubleTribute('38479725',TARGETS.EARTH.id,'m176-trojan-earth');
});
test('Kaiser Sea Horse cannot count as two Tributes for a DARK monster',()=>{
  assertAttributeMismatchCannotDoubleTribute('17444133',TARGETS.DARK.id,'m176-kaiser-mismatch');
});
test('Double Coston cannot count as two Tributes for a LIGHT monster',()=>{
  assertAttributeMismatchCannotDoubleTribute('44436472',TARGETS.LIGHT.id,'m176-coston-mismatch');
});
test('Unshaven Angler cannot count as two Tributes for a DARK monster',()=>{
  assertAttributeMismatchCannotDoubleTribute('92084010',TARGETS.DARK.id,'m176-angler-mismatch');
});
test('The Trojan Horse cannot count as two Tributes for a DARK monster',()=>{
  assertAttributeMismatchCannotDoubleTribute('38479725',TARGETS.DARK.id,'m176-trojan-mismatch');
});
