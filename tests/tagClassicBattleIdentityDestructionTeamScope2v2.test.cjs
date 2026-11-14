'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const RYU_KOKKI='57281778';
const GETSU_FUHMA='21887179';
const KARAKURI_SPIDER='45688586';
const DARK_MAGICIAN='46986414';
const SUMMONED_SKULL='70781052';
const CELTIC_GUARDIAN='91152256';

assert.deepEqual(getMonsterEffect(RYU_KOKKI)?.operation,{kind:'battleDestroyByIdentity',races:['Warrior','Spellcaster']});
assert.deepEqual(getMonsterEffect(GETSU_FUHMA)?.operation,{kind:'battleDestroyByIdentity',races:['Fiend','Zombie']});
assert.deepEqual(getMonsterEffect(KARAKURI_SPIDER)?.operation,{kind:'battleDestroyByIdentity',attributes:['DARK'],attackingOnly:true});
assert.equal(getPlayableCard(RYU_KOKKI)?.atk,2400);
assert.equal(getPlayableCard(GETSU_FUHMA)?.atk,1700);
assert.equal(getPlayableCard(KARAKURI_SPIDER)?.atk,400);
assert.equal(getPlayableCard(DARK_MAGICIAN)?.atk,2500);
assert.equal(getPlayableCard(SUMMONED_SKULL)?.atk,2500);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the 2v2 identity-destruction fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm171-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(sourceId,targetId,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M171 Seat '+seat,
    cards:deck(seat===2?[sourceId]:seat===3?[targetId]:[])
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
  throw new Error('M171 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'physical UIDs must be unique before battle');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'identity destruction must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'identity destruction must not duplicate UIDs');
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
  assert.ok(action,'the active teammate must receive the shared attack action');
  return settle(tag.stepTagDuel(state,member(0),action));
}

const cases=[
  {source:RYU_KOKKI,target:DARK_MAGICIAN,match:true,name:'Ryu Kokki destroys a Spellcaster even when battle destroys Ryu Kokki'},
  {source:RYU_KOKKI,target:SUMMONED_SKULL,match:false,name:'Ryu Kokki does not destroy a Fiend outside its identity filter'},
  {source:GETSU_FUHMA,target:SUMMONED_SKULL,match:true,name:'Getsu Fuhma destroys a Fiend even when battle destroys Getsu Fuhma'},
  {source:GETSU_FUHMA,target:DARK_MAGICIAN,match:false,name:'Getsu Fuhma does not destroy a Spellcaster outside its identity filter'},
  {source:KARAKURI_SPIDER,target:SUMMONED_SKULL,match:true,name:'Karakuri Spider destroys a DARK monster when it attacks'},
  {source:KARAKURI_SPIDER,target:CELTIC_GUARDIAN,match:false,name:'Karakuri Spider does not destroy a non-DARK monster'}
];

for(const scenario of cases){
  test(scenario.name+' in classic 2v2',()=>{
    let state=game(scenario.source,scenario.target,'m171-identity-'+scenario.source+'-'+scenario.target);
    const before=inventorySnapshot(state);
    const source=deploy(state,2,scenario.source);
    const target=deploy(state,3,scenario.target);
    assert.match(source.uid,/^m2:/,'the source must retain the inactive partner physical UID');
    assert.match(target.uid,/^m3:/,'the target must retain the inactive opponent partner physical UID');
    const sourceCard=getPlayableCard(scenario.source);
    const targetCard=getPlayableCard(scenario.target);
    const expectedDamage=Math.max(0,targetCard.atk-sourceCard.atk);
    state=startBattle(state);
    state=attack(state,source,target);

    assert.equal(state.core.players[0].lp,4000-expectedDamage,
      'only ordinary battle damage is applied to the attacking shared team');
    assert.equal(state.core.players[1].lp,4000,
      'the defending shared team receives no battle damage');
    if(scenario.match){
      assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid&&card.id===scenario.source),
        'the battle-losing source must enter its team Graveyard with its physical UID');
      assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===scenario.target),
        'the identity-matched target must be destroyed into its team Graveyard');
      assert.ok(!state.core.players.some(team=>team.monsters.some(card=>card.uid===target.uid)));
    }else{
      assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid&&card.id===scenario.source));
      assert.ok(state.core.players[1].monsters.some(card=>card.uid===target.uid&&card.id===scenario.target),
        'a non-matching identity must survive after the source loses battle');
      assert.ok(!state.core.players[1].grave.some(card=>card.uid===target.uid));
    }
    tag.assertTagDuel(state);
    assertConserved(state,before);
  });
}
