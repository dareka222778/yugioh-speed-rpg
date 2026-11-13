'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect,equipEligible}=require('../dist/effectRegistry');

const RITUAL_WEAPON='54351224';
const HUNGRY_BURGER='30243636';
const BLACK_LUSTER_SOLDIER='05405694';
const effect=getEffect(RITUAL_WEAPON);
assert.equal(getPlayableCard(RITUAL_WEAPON)?.kind,'spell');
assert.equal(effect?.kind,'equip');
assert.equal(effect?.monsterType,'ritual');
assert.equal(effect?.maxLevel,6);
assert.equal(effect?.atk,1500);
assert.equal(effect?.def,1500);
assert.equal(getPlayableCard(HUNGRY_BURGER)?.monsterType,'ritual');
assert.equal(getPlayableCard(HUNGRY_BURGER)?.level,6);
assert.equal(getPlayableCard(BLACK_LUSTER_SOLDIER)?.monsterType,'ritual');
assert.equal(getPlayableCard(BLACK_LUSTER_SOLDIER)?.level,8);
assert.equal(equipEligible(effect,getPlayableCard(HUNGRY_BURGER)),true);
assert.equal(equipEligible(effect,getPlayableCard(BLACK_LUSTER_SOLDIER)),false);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7);
const normalIds=normal.slice(0,7).map(entry=>entry.id);
const normalTarget=normal[0];
assert.equal(equipEligible(effect,normalTarget.card),false);

function member(seat){return 'm155-seat-'+seat;}
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
  throw new Error('M155 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const info=getPlayableCard(id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,properlySummoned:info?.monsterType==='ritual',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
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
function setup({eligible,seed}){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M155 Seat '+seat,
    cards:deck(seat===0?[RITUAL_WEAPON,normalTarget.id]
      :seat===2?(eligible?[HUNGRY_BURGER,BLACK_LUSTER_SOLDIER]:[BLACK_LUSTER_SOLDIER,normalTarget.id])
      :seat===3?[HUNGRY_BURGER]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed});
  const equip=takeCard(state,0,RITUAL_WEAPON);
  holder(state,0).hand.push(equip);
  let eligibleTarget,highLevelTarget,normalFieldTarget,opponentEligibleTarget;
  if(eligible){
    eligibleTarget=deploy(state,2,HUNGRY_BURGER);
    highLevelTarget=deploy(state,2,BLACK_LUSTER_SOLDIER);
    normalFieldTarget=deploy(state,0,normalTarget.id);
    opponentEligibleTarget=deploy(state,3,HUNGRY_BURGER);
  }else{
    highLevelTarget=deploy(state,2,BLACK_LUSTER_SOLDIER);
    normalFieldTarget=deploy(state,0,normalTarget.id);
    opponentEligibleTarget=deploy(state,3,HUNGRY_BURGER);
  }
  state.core.turn=3;
  assert.match(equip.uid,/^m0:/);
  if(eligible)assert.match(eligibleTarget.uid,/^m2:/);
  assert.match(highLevelTarget.uid,/^m2:/);
  assert.match(normalFieldTarget.uid,/^m0:/);
  assert.match(opponentEligibleTarget.uid,/^m3:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,equip,eligibleTarget,highLevelTarget,normalFieldTarget,opponentEligibleTarget};
}

test('Ritual Weapon equips an inactive teammate Level 6 Ritual Monster on the shared 2v2 field',()=>{
  const {state:initial,equip,eligibleTarget,highLevelTarget,normalFieldTarget,opponentEligibleTarget}=setup({
    eligible:true,seed:'m155-ritual-weapon-positive'
  });
  const before=snapshot(initial);
  const base=getPlayableCard(HUNGRY_BURGER);
  const highBase=getPlayableCard(BLACK_LUSTER_SOLDIER);
  const normalBase=getPlayableCard(normalTarget.id);
  const opponentBase=getPlayableCard(HUNGRY_BURGER);
  const actions=tag.tagActions(initial,member(0)).filter(action=>
    action.kind==='spell'&&action.card===equip.uid
  );
  assert.deepEqual(actions.map(action=>action.target),[eligibleTarget.uid],
    'only the teammate Level 6 Ritual Monster is a legal target; Level 8, non-Ritual and opposing monsters are excluded');
  assert.deepEqual(tag.tagActions(initial,member(2)),[],
    'the inactive physical target owner cannot activate the Equip Spell');
  const action=actions[0];
  let state=tag.stepTagDuel(initial,member(0),action);
  assert.equal(state.core.phase,'main');
  const attached=state.core.players[0].backrow.find(card=>card.uid===equip.uid);
  assert.ok(attached);
  assert.equal(attached.faceUp,true);
  assert.equal(attached.equippedTo,eligibleTarget.uid);
  const find=(uid,team)=>state.core.players[team].monsters.find(card=>card.uid===uid);
  assert.equal(engine.atk(find(eligibleTarget.uid,0),state.core),base.atk+1500);
  assert.equal(engine.def(find(eligibleTarget.uid,0),state.core),base.defense+1500);
  assert.equal(engine.atk(find(highLevelTarget.uid,0),state.core),highBase.atk);
  assert.equal(engine.def(find(highLevelTarget.uid,0),state.core),highBase.defense);
  assert.equal(engine.atk(find(normalFieldTarget.uid,0),state.core),normalBase.atk);
  assert.equal(engine.def(find(normalFieldTarget.uid,0),state.core),normalBase.defense);
  assert.equal(engine.atk(find(opponentEligibleTarget.uid,1),state.core),opponentBase.atk);
  assert.equal(engine.def(find(opponentEligibleTarget.uid,1),state.core),opponentBase.defense);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.equal(engine.atk(find(eligibleTarget.uid,0),state.core),base.atk+1500);
  assert.equal(engine.def(find(eligibleTarget.uid,0),state.core),base.defense+1500);
  assertConserved(state,before);
});

test('Ritual Weapon is not offered when the only teammate Ritual Monster is above Level 6',()=>{
  const {state,equip,highLevelTarget,normalFieldTarget,opponentEligibleTarget}=setup({
    eligible:false,seed:'m155-ritual-weapon-no-valid-target'
  });
  const actions=tag.tagActions(state,member(0));
  assert.ok(!actions.some(action=>action.kind==='spell'&&action.card===equip.uid),
    'a Level 8 Black Luster Soldier, a Normal Monster and an opposing Level 6 Ritual Monster cannot satisfy the Equip restriction');
  assert.equal(equipEligible(effect,getPlayableCard(BLACK_LUSTER_SOLDIER)),false);
  assert.equal(equipEligible(effect,getPlayableCard(normalTarget.id)),false);
  assert.equal(equipEligible(effect,getPlayableCard(HUNGRY_BURGER)),true);
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===highLevelTarget.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===normalFieldTarget.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===opponentEligibleTarget.uid));
  const before=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(0),{kind:'spell',card:equip.uid,target:highLevelTarget.uid}));
  assert.equal(JSON.stringify(state),before,'invalid Ritual Weapon activation must not mutate the duel');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
});
