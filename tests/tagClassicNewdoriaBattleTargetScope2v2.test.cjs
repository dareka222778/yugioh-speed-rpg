'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const NEWDORIA='04335645';
const DARK_MAGICIAN='46986414';
const SUMMONED_SKULL='70781052';
const CELTIC_GUARDIAN='91152256';

assert.equal(getMonsterEffect(NEWDORIA)?.trigger,'onBattleDestroyed');
assert.deepEqual(getMonsterEffect(NEWDORIA)?.operation,{
  kind:'singleCard',
  rule:{from:'monsters',controller:'both',action:'destroy',kind:'monster'}
});
assert.equal(getPlayableCard(NEWDORIA)?.atk,1200);
assert.equal(getPlayableCard(NEWDORIA)?.defense,800);
assert.equal(getPlayableCard(DARK_MAGICIAN)?.atk,2500);
assert.equal(getPlayableCard(SUMMONED_SKULL)?.atk,2500);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the 2v2 fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm175-seat-'+seat;}
function deck(){
  const ids=[...new Set([NEWDORIA,DARK_MAGICIAN,SUMMONED_SKULL,CELTIC_GUARDIAN,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M175 Seat '+seat,cards:deck()
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
  throw new Error('M175 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,faceUp=true,position='atk'){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,owner:seat%2,position,faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card Decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'physical UIDs must be unique before battle');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Newdoria must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Newdoria must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the battle/trigger response chain must terminate');
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
  assert.ok(action,'the active teammate must receive the partner-owned Newdoria attack action');
  return settle(tag.stepTagDuel(state,member(0),action));
}
function choose(state,targetUid){
  const actor=tag.tagDecisionMember(state).id;
  const action=tag.tagActions(state,actor).find(candidate=>
    candidate.kind==='choose'&&candidate.target===targetUid
  );
  assert.ok(action,'Newdoria must offer the selected monster UID to its mandatory trigger');
  return settle(tag.stepTagDuel(state,actor,action));
}
function battleFixture(seed){
  let state=game(seed);
  const before=inventorySnapshot(state);
  const ally=deploy(state,0,SUMMONED_SKULL);
  const opposing=deploy(state,1,CELTIC_GUARDIAN,false,'def');
  const source=deploy(state,2,NEWDORIA);
  const attacker=deploy(state,3,DARK_MAGICIAN);
  assert.match(source.uid,/^m2:/,'Newdoria must retain the inactive teammate physical UID');
  assert.match(attacker.uid,/^m3:/,'the battle target must retain the inactive opponent physical UID');
  assert.match(ally.uid,/^m0:/,'the allied candidate must retain seat 0 physical ownership');
  assert.match(opposing.uid,/^m1:/,'the opposing candidate must retain seat 1 physical ownership');
  state=startBattle(state);
  state=attack(state,source,attacker);
  return {state,before,source,attacker,ally,opposing};
}

for(const scenario of [
  {name:'Newdoria can destroy a monster controlled by its own teammate',target:'ally'},
  {name:'Newdoria can destroy a face-down monster controlled by the opposing teammate',target:'opposing'}
]){
  test(scenario.name+' after Newdoria is destroyed by battle in classic 2v2',()=>{
    const {state:afterBattle,before,source,attacker,ally,opposing}=battleFixture('m175-'+scenario.target);
    let state=afterBattle;
    assert.equal(state.core.phase,'choice','battle destruction must open Newdoria mandatory target selection');
    assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid&&card.id===NEWDORIA),
      'the source must already be in its shared team Graveyard when the trigger is offered');
    assert.equal(state.core.players[0].lp,2700,'Newdoria battle loss applies 1300 damage to its shared team');
    assert.equal(state.core.players[1].lp,4000,'the defending team takes no battle damage');
    assert.ok(state.core.players[1].monsters.some(card=>card.uid===attacker.uid),
      'the stronger battle attacker remains on the field');

    const actor=tag.tagDecisionMember(state).id;
    const choices=tag.tagActions(state,actor).filter(action=>action.kind==='choose');
    const choiceUids=new Set(choices.map(action=>action.target));
    assert.ok(choiceUids.has(ally.uid),'the trigger must offer the teammate-controlled monster');
    assert.ok(choiceUids.has(opposing.uid),'the trigger must offer the opposing teammate-controlled monster');
    assert.ok(!JSON.stringify(choices).includes(CELTIC_GUARDIAN),
      'a face-down candidate must be represented by UID only, without revealing its identity');

    const selected=scenario.target==='ally'?ally:opposing;
    const survivor=scenario.target==='ally'?opposing:ally;
    state=choose(state,selected.uid);

    const selectedTeam=selected===ally?0:1;
    const survivorTeam=survivor===ally?0:1;
    assert.ok(state.core.players[selectedTeam].grave.some(card=>card.uid===selected.uid&&card.id===selected.id),
      'the selected monster must be destroyed into its own team shared Graveyard');
    assert.ok(!state.core.players.some(team=>team.monsters.some(card=>card.uid===selected.uid)),
      'the selected monster must leave the field');
    assert.ok(state.core.players[survivorTeam].monsters.some(card=>card.uid===survivor.uid),
      'the unselected candidate must remain on the field');
    assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid&&card.id===NEWDORIA),
      'the source physical UID must remain in the attacking team Graveyard');
    tag.assertTagDuel(state);
    assertConserved(state,before);
  });
}
