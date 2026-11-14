'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const HAYABUSA_KNIGHT='21015833';
const TWINHEADED_BEAST='82035781';
const BATTLE_WARRIOR='55550921';
const MYSTICAL_ELF='15025844';
const CELTIC_GUARDIAN='91152256';

for(const [id,name,atk] of [
  [HAYABUSA_KNIGHT,'Hayabusa Knight',1000],
  [TWINHEADED_BEAST,'Twinheaded Beast',1700]
]){
  assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getPlayableCard(id)?.atk,atk);
  assert.deepEqual(getMonsterEffect(id)?.operation,{
    kind:'continuous',
    rules:[{kind:'combat',filter:{selfOnly:true},rule:{kind:'attacks',maximum:2}}]
  });
}
assert.equal(getPlayableCard(BATTLE_WARRIOR)?.atk,700);
assert.equal(getPlayableCard(MYSTICAL_ELF)?.atk,800);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the multi-attack fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm179-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(sourceId,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M179 Seat '+seat,
    cards:deck([sourceId,BATTLE_WARRIOR,MYSTICAL_ELF,CELTIC_GUARDIAN])
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
  throw new Error('M179 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
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
  assert.equal(cards.length,before.size,'a second attack must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'a second attack must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function startBattle(state){
  const action=tag.tagActions(state,member(0)).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active teammate must be able to enter the Battle Phase');
  return settle(tag.stepTagDuel(state,member(0),action));
}
function attack(state,source,target){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===source.uid&&candidate.target===target.uid
  );
  assert.ok(action,'the active teammate must receive the partner-owned attack action');
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical owner cannot submit an attack during the partner turn');
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'a rejected inactive-partner action must not mutate the duel');
  return settle(tag.stepTagDuel(state,member(0),action));
}

for(const [sourceId,name,atk] of [
  [HAYABUSA_KNIGHT,'Hayabusa Knight',1000],
  [TWINHEADED_BEAST,'Twinheaded Beast',1700]
]){
  test(name+' can attack twice in one shared 2v2 Battle Phase, even when owned by the inactive teammate',()=>{
    let state=game(sourceId,'m179-double-attack-'+sourceId);
    const before=inventorySnapshot(state);
    const source=deploy(state,2,sourceId);
    const firstTarget=deploy(state,1,BATTLE_WARRIOR);
    const secondTarget=deploy(state,3,MYSTICAL_ELF);
    const thirdTarget=deploy(state,1,CELTIC_GUARDIAN);
    assert.match(source.uid,/^m2:/,'the attacker must retain inactive teammate seat 2 physical ownership');
    assert.match(firstTarget.uid,/^m1:/,'the first target must retain seat 1 physical ownership');
    assert.match(secondTarget.uid,/^m3:/,'the second target must retain seat 3 physical ownership');
    assert.match(thirdTarget.uid,/^m1:/,'the remaining target must retain seat 1 physical ownership');
    assert.equal(state.core.players[1].monsters.length,3,'the opposing shared field must respect its three-monster limit');
    state=startBattle(state);

    state=attack(state,source,firstTarget);
    assert.ok(state.core.players[1].grave.some(card=>card.uid===firstTarget.uid&&card.id===BATTLE_WARRIOR),
      'the first destroyed target must enter the shared team Graveyard with its physical UID');
    assert.equal(state.core.players[1].lp,4000-(atk-700),
      'the first battle damage must be applied to the opposing shared team');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid),
      'the multi-attack source must remain on the shared field after its first attack');

    state=attack(state,source,secondTarget);
    assert.ok(state.core.players[1].grave.some(card=>card.uid===secondTarget.uid&&card.id===MYSTICAL_ELF),
      'the second destroyed target must enter the shared team Graveyard with its physical UID');
    assert.equal(state.core.players[1].lp,4000-(atk-700)-(atk-800),
      'both attacks must apply their own battle damage to the shared opposing team');
    assert.ok(state.core.players[1].monsters.some(card=>card.uid===thirdTarget.uid),
      'the third opposing monster must remain as a control target after two attacks');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid),
      'the source must survive both winning attacks');

    const further=tag.tagActions(state,member(0)).filter(action=>
      action.kind==='attack'&&action.card===source.uid
    );
    assert.deepEqual(further,[],'the source cannot declare a third attack in the same Battle Phase');
    assert.equal(state.core.phase,'battle','the second attack must not prematurely end the shared Battle Phase');
    tag.assertTagDuel(state);
    assertConserved(state,before);
  });
}
