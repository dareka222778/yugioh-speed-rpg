'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const MAD_SWORD_BEAST='79870141';
const DARK_DRICERATOPS='65287621';
const GRAVEKEEPERS_SPEAR_SOLDIER='63695531';
const CELTIC_GUARDIAN='91152256';
const MYSTICAL_ELF='15025844';

for(const [id,name,atk] of [
  [MAD_SWORD_BEAST,'Mad Sword Beast',1400],
  [DARK_DRICERATOPS,'Dark Driceratops',2400],
  [GRAVEKEEPERS_SPEAR_SOLDIER,"Gravekeeper's Spear Soldier",1500]
]){
  assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getPlayableCard(id)?.atk,atk);
  assert.equal(getMonsterEffect(id)?.trigger,'continuous');
  assert.deepEqual(getMonsterEffect(id)?.operation,{
    kind:'continuous',
    rules:[{kind:'combat',filter:{selfOnly:true},rule:{kind:'piercing'}}]
  });
}
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.defense,1200);
assert.equal(getPlayableCard(MYSTICAL_ELF)?.defense,2000);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the piercing fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm184-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(required,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M184 Seat '+seat,cards:deck(required)
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
  throw new Error('M184 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'piercing battle must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'piercing battle must not duplicate UIDs');
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
function attack(state,attacker,target){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===target.uid
  );
  assert.ok(action,'the active teammate must receive the partner-owned piercing attack');
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical attacker owner cannot submit the attack');
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo/);
  assert.equal(JSON.stringify(state),unchanged,'a rejected partner action must not mutate the duel');
  return settle(tag.stepTagDuel(state,member(0),action));
}

for(const [sourceId,name,atk,targetId,targetName,targetDef] of [
  [MAD_SWORD_BEAST,'Mad Sword Beast',1400,CELTIC_GUARDIAN,'Celtic Guardian',1200],
  [DARK_DRICERATOPS,'Dark Driceratops',2400,MYSTICAL_ELF,'Mystical Elf',2000],
  [GRAVEKEEPERS_SPEAR_SOLDIER,"Gravekeeper's Spear Soldier",1500,CELTIC_GUARDIAN,'Celtic Guardian',1200]
]){
  test(name+' inflicts piercing damage to the shared opposing team in classic 2v2',()=>{
    let state=game([sourceId,targetId],'m184-piercing-'+sourceId);
    const before=inventorySnapshot(state);
    const source=deploy(state,2,sourceId);
    const target=deploy(state,3,targetId);
    assert.match(source.uid,/^m2:/,'the piercing monster must retain inactive teammate physical ownership');
    assert.match(target.uid,/^m3:/,'the Defense Position target must retain opposing partner physical ownership');
    state.core.players[1].monsters[state.core.players[1].monsters.indexOf(target)].position='def';
    state=startBattle(state);
    state=attack(state,source,target);

    assert.equal(state.core.players[1].lp,4000-(atk-targetDef),
      'piercing damage equals ATK minus DEF and reduces the shared opposing team LP');
    assert.equal(state.core.players[0].lp,4000,'the attacking team takes no battle damage');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid),
      'the piercing source survives its winning battle');
    assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===targetId),
      'a Defense Position target is destroyed when the piercing attacker has greater ATK; only battle damage differs');
    assert.equal(tag.publicTagDuel(state).teams[1].lp,4000-(atk-targetDef),
      'the public projection must expose the same shared team LP');
    tag.assertTagDuel(state);
    assertConserved(state,before);
  });
}
