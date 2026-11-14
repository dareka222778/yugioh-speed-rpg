'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const MACHINE_KING='46700124';
const PERFECT_MACHINE_KING='18891691';
const NON_MACHINE='91152256';

assert.equal(getPlayableCard(MACHINE_KING)?.englishName,'Machine King');
assert.equal(getPlayableCard(MACHINE_KING)?.atk,2200);
assert.equal(getPlayableCard(PERFECT_MACHINE_KING)?.englishName,'Perfect Machine King');
assert.equal(getPlayableCard(PERFECT_MACHINE_KING)?.atk,2700);
assert.equal(getEffect(MACHINE_KING)?.kind,'monsterEffect');
assert.equal(getEffect(PERFECT_MACHINE_KING)?.kind,'monsterEffect');
for(const id of [MACHINE_KING,PERFECT_MACHINE_KING]){
  assert.equal(getMonsterEffect(id)?.trigger,'continuous');
  assert.equal(getMonsterEffect(id)?.operation.kind,'continuous');
}

const member=seat=>'m207-seat-'+seat;
const normalIds=[...new Set(tag.tagNormalCardIds)].slice(0,8);
assert.ok(normalIds.length>=8,'the fixture requires eight enabled Normal Monsters');

function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M207 Seat '+seat,
    cards:deck([MACHINE_KING,PERFECT_MACHINE_KING,NON_MACHINE])
  }));
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
  throw new Error('M207 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,faceUp=true){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:faceUp?'atk':'def',faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
  assert.equal(cards.length,before.size,'continuous modifiers must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'continuous modifiers must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Machine King counts face-up Machine monsters across both teams, including itself exactly once',()=>{
  let state=game('m207-machine-king-both-teams');
  const before=inventorySnapshot(state);
  const source=deploy(state,0,MACHINE_KING);
  const partnerMachine=deploy(state,2,MACHINE_KING);
  const opposingMachine=deploy(state,1,PERFECT_MACHINE_KING);
  const nonMachine=deploy(state,3,NON_MACHINE);
  const hiddenMachine=deploy(state,3,MACHINE_KING,false);

  assert.match(partnerMachine.uid,/^m2:/,'the allied Machine King retains inactive partner ownership');
  assert.match(opposingMachine.uid,/^m1:/,'the opposing Machine belongs to physical seat 1');
  assert.equal(engine.atk(source,state.core),2500,
    'Machine King gains +100 for itself and two other face-up Machines across both teams');
  assert.equal(engine.atk(partnerMachine,state.core),2500,
    'a partner-owned Machine King receives the same global count');
  assert.equal(engine.atk(opposingMachine,state.core),2500,
    'an opposing Machine King also counts both shared fields');
  assert.equal(engine.atk(nonMachine,state.core),1400,
    'a non-Machine monster receives no Machine King modifier');
  assert.equal(engine.atk(hiddenMachine,state.core),2200,
    'a face-down Machine does not gain or contribute a continuous bonus');

  opposingMachine.faceUp=false;
  opposingMachine.position='def';
  assert.equal(engine.atk(source,state.core),2400,'turning one Machine face-down removes exactly 100 ATK');
  partnerMachine.faceUp=false;
  partnerMachine.position='def';
  assert.equal(engine.atk(source,state.core),2300,'only the source Machine King remains counted');
  source.faceUp=false;
  source.position='def';
  assert.equal(engine.atk(source,state.core),2200,'a face-down source does not apply its continuous effect');

  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Perfect Machine King excludes itself and counts every other face-up Machine on both shared fields',()=>{
  let state=game('m207-perfect-machine-king-other-machines');
  const before=inventorySnapshot(state);
  const source=deploy(state,2,PERFECT_MACHINE_KING);
  assert.match(source.uid,/^m2:/,'the continuous source belongs physically to inactive partner seat 2');
  assert.equal(engine.atk(source,state.core),2700,
    'the source itself is excluded; a lone Perfect Machine King stays at printed ATK');

  const alliedMachine=deploy(state,0,MACHINE_KING);
  const opposingMachine=deploy(state,1,MACHINE_KING);
  const opposingPartnerMachine=deploy(state,3,PERFECT_MACHINE_KING);
  const hiddenMachine=deploy(state,3,MACHINE_KING,false);
  assert.equal(engine.atk(source,state.core),4200,
    'three other face-up Machines on both teams grant exactly +1500 ATK');
  assert.equal(engine.atk(hiddenMachine,state.core),2200,
    'a face-down Machine receives no continuous modifier');
  hiddenMachine.faceUp=true;
  hiddenMachine.position='atk';
  assert.equal(engine.atk(source,state.core),4700,
    'turning a fourth other Machine face-up adds exactly 500 ATK');

  alliedMachine.faceUp=false;
  alliedMachine.position='def';
  assert.equal(engine.atk(source,state.core),4200,
    'a face-down allied Machine no longer contributes');
  const index=state.core.players[1].monsters.findIndex(card=>card.uid===opposingMachine.uid);
  assert.notEqual(index,-1);
  const [removed]=state.core.players[1].monsters.splice(index,1);
  state.core.players[1].grave.push(removed);
  assert.equal(engine.atk(source,state.core),3700,
    'a Machine moved to the opposing Graveyard stops contributing to field count');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opposingMachine.uid));

  tag.assertTagDuel(state);
  assertConserved(state,before);
});
