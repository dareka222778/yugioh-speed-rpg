'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterDefinition,getMonsterEffect}=require('../dist/monsterEffects');

const HANE_HANE='07089711';
const MAN_EATER_BUG='54652250';
for(const [id,operation] of [[HANE_HANE,'bounce'],[MAN_EATER_BUG,'destroy']]){
  assert.ok(getPlayableCard(id)?.kind==='monster','flip monster must be certified and playable: '+id);
  assert.equal(getMonsterEffect(id)?.trigger,'flip');
  assert.equal(getMonsterEffect(id)?.operation.kind,operation);
  assert.equal(getMonsterDefinition(id)?.activation.policy,'mandatory');
}
const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7);
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm140-seat-'+seat;}
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
  throw new Error('M140 fixture card missing from physical seat '+seat+': '+id);
}
function setFlipMonster(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'def',faceUp:false,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
function flipAndChoose(state,source,target,actor=0){
  const id=member(actor);
  const flip=tag.tagActions(state,id).find(action=>
    action.kind==='position'&&action.card===source.uid&&action.mode==='flip'
  );
  assert.ok(flip,'active seat must be able to Flip Summon its physical source monster');
  state=tag.stepTagDuel(state,id,flip);
  assert.equal(state.core.phase,'choice','mandatory targeted FLIP effect must request its target');
  assert.equal(tag.tagDecisionMember(state).id,id);
  const choose=tag.tagActions(state,id).find(action=>
    action.kind==='choose'&&action.target===target.uid
  );
  assert.ok(choose,'the physical target UID must be offered to the active FLIP controller');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(2),choose),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'inactive-seat target selection must not mutate the choice');
  return tag.stepTagDuel(state,id,choose);
}

for(const targetSeat of [2,3])test('Hane-Hane returns a monster to the physical hand of seat '+targetSeat,()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M140 Seat '+seat,
    cards:deck(seat===0?[HANE_HANE]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m140-hane-hane-'+targetSeat});
  const source=setFlipMonster(state,0,HANE_HANE);
  const target=deploy(state,targetSeat,normal[0].id);
  state.core.turn=3;
  assert.match(source.uid,/^m0:/);
  assert.match(target.uid,new RegExp('^m'+targetSeat+':'));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  state=flipAndChoose(state,source,target);
  assert.equal(state.core.phase,'main');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp),
    'Hane-Hane remains face-up after its FLIP effect');
  assert.ok(!state.core.players[targetSeat%2].monsters.some(card=>card.uid===target.uid),
    'the selected monster leaves the shared field');
  assert.ok(tag.tagMemberHand(state,member(targetSeat)).some(card=>card.uid===target.uid),
    'the selected monster returns to the hand of its original physical owner');
  for(const seat of [0,1,2,3])if(seat!==targetSeat){
    assert.ok(!tag.tagMemberHand(state,member(seat)).some(card=>card.uid===target.uid),
      'the returned monster must not leak into physical seat '+seat+' hand');
  }
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

for(const targetSeat of [2,3])test('Man-Eater Bug destroys a selected monster owned by physical seat '+targetSeat,()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M140 Seat '+seat,
    cards:deck(seat===0?[MAN_EATER_BUG]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m140-man-eater-bug-'+targetSeat});
  const source=setFlipMonster(state,0,MAN_EATER_BUG);
  const target=deploy(state,targetSeat,normal[1].id);
  state.core.turn=3;
  assert.match(source.uid,/^m0:/);
  assert.match(target.uid,new RegExp('^m'+targetSeat+':'));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  state=flipAndChoose(state,source,target);
  assert.equal(state.core.phase,'main');
  assert.ok(state.core.players[targetSeat%2].grave.some(card=>card.uid===target.uid),
    'the selected monster goes to its controlling team shared Graveyard');
  assert.ok(!tag.tagMemberHand(state,member(targetSeat)).some(card=>card.uid===target.uid),
    'destroyed monster is not incorrectly returned to a physical hand');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp),
    'Man-Eater Bug remains face-up after resolving');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
