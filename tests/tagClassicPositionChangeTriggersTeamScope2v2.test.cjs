'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const BITE_SHOES='50122883';
const DESERTAPIR='13409151';
const RYU_KISHIN_CLOWN='42647539';
const AXE_RAIDER='48305365';
const CELTIC_GUARDIAN='91152256';

for(const id of [BITE_SHOES,DESERTAPIR]){
  assert.equal(getMonsterEffect(id)?.trigger,'flip');
  assert.equal(getMonsterEffect(id)?.activation?.policy,'mandatory');
  assert.equal(getMonsterEffect(id)?.operation.kind,'positionChange');
}
assert.equal(getMonsterEffect(RYU_KISHIN_CLOWN)?.trigger,'onSummon');
assert.equal(getMonsterEffect(RYU_KISHIN_CLOWN)?.activation?.policy,'mandatory');
assert.equal(getMonsterEffect(RYU_KISHIN_CLOWN)?.operation.kind,'positionChange');
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the position-change fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm197-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(required,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M197 Seat '+seat,cards:deck(required)
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
  throw new Error('M197 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position='atk',faceUp=true){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
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
  assert.equal(cards.length,before.size,'position-change effects must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'position-change effects must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function flip(state,source){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='position'&&candidate.card===source.uid&&candidate.mode==='flip'
  );
  assert.ok(action,'the active teammate can Flip Summon a partner-owned source');
  return tag.stepTagDuel(state,member(0),action);
}
function normalSummon(state,source){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='summon'&&candidate.card===source.uid&&candidate.position==='atk'
  );
  assert.ok(action,'the active physical owner can Normal Summon Ryu-Kishin Clown');
  return tag.stepTagDuel(state,member(0),action);
}
function resolvePositionChoice(state,source,target,{excludeSource=false}={}){
  const choices=tag.tagActions(state,member(0)).filter(action=>action.kind==='choose').map(action=>action.target);
  assert.ok(choices.includes(target.uid),'the mandatory position choice must include the opposing face-up target');
  if(excludeSource)assert.ok(!choices.includes(source.uid),'Desertapir cannot select itself');
  state=tag.stepTagDuel(state,member(0),{kind:'choose',target:target.uid});
  return state;
}

test('Bite Shoes switches a selected face-up opposing monster position after Flip Summon',()=>{
  let state=game([BITE_SHOES,AXE_RAIDER,CELTIC_GUARDIAN],'m197-bite-shoes');
  const before=inventorySnapshot(state);
  const source=deploy(state,2,BITE_SHOES,'def',false);
  const target=deploy(state,3,AXE_RAIDER,'atk',true);
  const faceDownControl=deploy(state,1,CELTIC_GUARDIAN,'def',false);
  state=flip(state,source);
  state=resolvePositionChoice(state,source,target);
  const liveTarget=state.core.players[1].monsters.find(card=>card.uid===target.uid);
  assert.ok(liveTarget&&liveTarget.faceUp&&liveTarget.position==='def',
    'Bite Shoes switches the selected face-up opposing monster from Attack to Defense');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===faceDownControl.uid&&!card.faceUp),
    'a face-down opposing monster is not selected or revealed');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Desertapir sets a selected face-up opposing monster face-down in Defense and cannot target itself',()=>{
  let state=game([DESERTAPIR,AXE_RAIDER,CELTIC_GUARDIAN],'m197-desertapir');
  const before=inventorySnapshot(state);
  const source=deploy(state,2,DESERTAPIR,'def',false);
  const target=deploy(state,3,AXE_RAIDER,'atk',true);
  const faceDownControl=deploy(state,1,CELTIC_GUARDIAN,'def',false);
  state=flip(state,source);
  state=resolvePositionChoice(state,source,target,{excludeSource:true});
  const liveTarget=state.core.players[1].monsters.find(card=>card.uid===target.uid);
  assert.ok(liveTarget&&!liveTarget.faceUp&&liveTarget.position==='def',
    'Desertapir turns the selected face-up opposing monster face-down in Defense');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp),
    'Desertapir itself remains face-up after resolving its Flip effect');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===faceDownControl.uid&&!card.faceUp),
    'the unrelated face-down monster remains unchanged');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Ryu-Kishin Clown switches a selected opposing monster position when Normal Summoned',()=>{
  let state=game([RYU_KISHIN_CLOWN,AXE_RAIDER,CELTIC_GUARDIAN],'m197-ryu-kishin-clown');
  const before=inventorySnapshot(state);
  const sourceCard=takeCard(state,0,RYU_KISHIN_CLOWN);
  holder(state,0).hand.push(sourceCard);
  const target=deploy(state,3,AXE_RAIDER,'atk',true);
  const faceDownControl=deploy(state,1,CELTIC_GUARDIAN,'def',false);
  state=normalSummon(state,sourceCard);
  state=resolvePositionChoice(state,sourceCard,target);
  const liveTarget=state.core.players[1].monsters.find(card=>card.uid===target.uid);
  assert.ok(liveTarget&&liveTarget.faceUp&&liveTarget.position==='def',
    'Ryu-Kishin Clown changes the selected opposing monster from Attack to Defense');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===faceDownControl.uid&&!card.faceUp),
    'the face-down control monster is not selected or revealed');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===sourceCard.uid&&card.faceUp));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
