'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const BLACK_TYRANNO='38670435';
const ROCKET_JUMPER='53890795';
const DRILLAGO='99050989';
const DARK_MAGICIAN='46986414';
const BLUE_EYES='89631139';
const CELTIC_GUARDIAN='91152256';

for(const id of [BLACK_TYRANNO,ROCKET_JUMPER,DRILLAGO]){
  assert.equal(getPlayableCard(id)?.kind,'monster');
  assert.equal(getMonsterEffect(id)?.trigger,'continuous');
}
assert.equal(getPlayableCard(BLACK_TYRANNO)?.atk,2600);
assert.equal(getPlayableCard(ROCKET_JUMPER)?.atk,1000);
assert.equal(getPlayableCard(DRILLAGO)?.atk,1600);
assert.equal(getPlayableCard(DARK_MAGICIAN)?.atk,2500);
assert.equal(getPlayableCard(BLUE_EYES)?.atk,3000);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the 2v2 fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);
function member(seat){return 'm178-seat-'+seat;}
function deck(){
  const ids=[...new Set([BLACK_TYRANNO,ROCKET_JUMPER,DRILLAGO,DARK_MAGICIAN,BLUE_EYES,CELTIC_GUARDIAN,...normalIds])];
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M178 Seat '+seat,cards:deck()}));
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
  throw new Error('M178 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,faceUp=true,position='atk'){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function startBattle(state){
  const actor=tag.tagDecisionMember(state).id;
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active teammate must be able to enter the Battle Phase');
  return tag.stepTagDuel(state,actor,action);
}
function hasDirectAttack(state,uid){
  const actor=tag.tagDecisionMember(state).id;
  return tag.tagActions(state,actor).some(action=>action.kind==='attack'&&action.card===uid&&action.target===undefined);
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all physical UIDs must be unique');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'direct-attack conditions must not alter inventory');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'direct-attack conditions must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function setup(sourceId,opponents,seed){
  let state=game(seed);
  const before=inventorySnapshot(state);
  const source=deploy(state,2,sourceId);
  const targets=opponents.map((entry,index)=>deploy(state,index===0?1:3,entry.id,entry.faceUp??true,entry.position??'atk'));
  assert.match(source.uid,/^m2:/,'the direct attacker must retain inactive teammate seat 2 physical ownership');
  assert.ok(targets[0].uid.startsWith('m1:'));
  if(targets[1])assert.ok(targets[1].uid.startsWith('m3:'));
  state=startBattle(state);
  return {state,before,source,targets};
}

for(const source of [BLACK_TYRANNO,ROCKET_JUMPER]){
  test((source===BLACK_TYRANNO?'Black Tyranno':'Rocket Jumper')+' can attack directly when both opposing 2v2 seats control only Defense Position monsters',()=>{
    const {state,before,source:attacker}=setup(source,[
      {id:DARK_MAGICIAN,faceUp:true,position:'def'},
      {id:BLUE_EYES,faceUp:false,position:'def'}
    ],'m178-defense-only-'+source);
    assert.ok(hasDirectAttack(state,attacker.uid),
      'the defense-only condition must inspect both opposing physical teammates and permit a facedown Defense Position monster');
    tag.assertTagDuel(state);
    assertConserved(state,before);
  });
  test((source===BLACK_TYRANNO?'Black Tyranno':'Rocket Jumper')+' cannot attack directly if either opposing 2v2 seat has an Attack Position monster',()=>{
    const {state,before,source:attacker}=setup(source,[
      {id:DARK_MAGICIAN,faceUp:true,position:'def'},
      {id:BLUE_EYES,faceUp:true,position:'atk'}
    ],'m178-defense-fails-'+source);
    assert.ok(!hasDirectAttack(state,attacker.uid),
      'one Attack Position monster on the partner field must invalidate the shared defense-only condition');
    tag.assertTagDuel(state);
    assertConserved(state,before);
  });
}

test('Drillago can attack directly when every face-up monster on the opposing shared field has at least 1600 ATK',()=>{
  const {state,before,source}=setup(DRILLAGO,[
    {id:DARK_MAGICIAN,faceUp:true,position:'atk'},
    {id:BLUE_EYES,faceUp:true,position:'atk'}
  ],'m178-drillago-positive');
  assert.ok(hasDirectAttack(state,source.uid),
    'the minimum-ATK condition must aggregate monsters from both opposing physical seats');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Drillago cannot attack directly when either opposing physical teammate controls a monster below 1600 ATK',()=>{
  const {state,before,source}=setup(DRILLAGO,[
    {id:DARK_MAGICIAN,faceUp:true,position:'atk'},
    {id:CELTIC_GUARDIAN,faceUp:true,position:'atk'}
  ],'m178-drillago-low-atk');
  assert.ok(!hasDirectAttack(state,source.uid),
    'one 1400 ATK monster on the partner field must invalidate the shared minimum-ATK condition');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Drillago cannot attack directly when an opposing physical teammate has a face-down monster',()=>{
  const {state,before,source}=setup(DRILLAGO,[
    {id:DARK_MAGICIAN,faceUp:true,position:'atk'},
    {id:BLUE_EYES,faceUp:false,position:'def'}
  ],'m178-drillago-facedown');
  assert.ok(!hasDirectAttack(state,source.uid),
    'a face-down opposing monster cannot be assumed to meet Drillago face-up ATK condition');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
