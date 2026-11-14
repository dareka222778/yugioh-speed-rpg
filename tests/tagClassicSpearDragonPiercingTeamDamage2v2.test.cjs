'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const engine=require('../dist/duelEngine');

const SPEAR_DRAGON='31553716';
const CELTIC_GUARDIAN='91152256';
const MYSTICAL_ELF='15025844';

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.level<=4&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the piercing fixture needs eight certified Level 4-or-lower Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.defense,1200);
assert.equal(getPlayableCard(MYSTICAL_ELF)?.defense,2000);
assert.equal(getPlayableCard(SPEAR_DRAGON)?.atk,1900);

function member(seat){return 'm165-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M165 Seat '+seat,
    cards:deck(seat===2?[SPEAR_DRAGON]:seat===3?[CELTIC_GUARDIAN,MYSTICAL_ELF]:[])
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
  throw new Error('M165 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position){
  const physical=takeCard(state,seat,id);
  const monster={
    ...physical,owner:seat%2,position,faceUp:true,
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
  assert.equal(cards.length,before.size,'battle must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'battle must not duplicate physical UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'battle changed physical card identity: '+card.uid);
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
function startBattle(state,seat){
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active physical member must be able to enter the Battle Phase');
  return settle(tag.stepTagDuel(state,actor,action));
}
function attack(state,seat,attacker,target){
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===target.uid
  );
  assert.ok(action,'the active teammate must receive the shared Spear Dragon attack action');
  return settle(tag.stepTagDuel(state,actor,action));
}

test('Spear Dragon is a certified piercing monster with end-of-Damage-Step position change',()=>{
  const effect=getMonsterEffect(SPEAR_DRAGON);
  assert.equal(getPlayableCard(SPEAR_DRAGON)?.englishName,'Spear Dragon');
  assert.equal(effect?.trigger,'continuous');
  assert.equal(effect?.operation.kind,'endDamageDefensePiercing');
});

test('an active teammate attacks with an inactive partner Spear Dragon; piercing damage hits shared team LP',()=>{
  let state=game('m165-spear-dragon-piercing-shared-lp');
  const before=inventorySnapshot(state);
  const spear=deploy(state,2,SPEAR_DRAGON,'atk');
  const defender=deploy(state,3,CELTIC_GUARDIAN,'def');
  assert.match(spear.uid,/^m2:/,'the attacking monster must retain its inactive partner physical UID');
  assert.match(defender.uid,/^m3:/,'the defending monster must retain its inactive partner physical UID');
  assert.equal(spear.owner,0);
  assert.equal(defender.owner,1);
  tag.assertTagDuel(state);

  state=startBattle(state,0);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===spear.uid&&candidate.target===defender.uid
  );
  assert.ok(action,'the active teammate must be able to attack with the shared monster');
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(2)),[],'the inactive physical owner cannot submit the attack');
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'a rejected inactive-partner action must not mutate the duel');

  state=settle(tag.stepTagDuel(state,member(0),action));
  const expectedDamage=engine.atk(spear,state.core)-getPlayableCard(CELTIC_GUARDIAN).defense;
  assert.equal(expectedDamage,700);
  assert.equal(state.core.players[1].lp,4000-expectedDamage,'piercing damage must reduce the opposing shared team LP');
  assert.equal(state.core.players[0].lp,4000,'the attacking team LP must remain unchanged');
  assert.equal(tag.publicTagDuel(state).teams[1].lp,4000-expectedDamage,'the public projection must expose the same shared team LP');
  const liveSpear=state.core.players[0].monsters.find(card=>card.uid===spear.uid);
  assert.ok(liveSpear,'the Spear Dragon must survive a winning attack');
  assert.equal(liveSpear.position,'def','Spear Dragon changes position at the end of the Damage Step');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===defender.uid&&card.id===CELTIC_GUARDIAN),
    'the destroyed inactive partner monster must enter the shared team Graveyard with its physical UID');
  assert.equal(state.core.phase,'battle','the position change must not wait until or prematurely end the Battle Phase');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('Spear Dragon does not pierce when its ATK is lower than the attacked Defense monster DEF',()=>{
  let state=game('m165-spear-dragon-no-piercing-when-losing');
  const before=inventorySnapshot(state);
  const spear=deploy(state,2,SPEAR_DRAGON,'atk');
  const defender=deploy(state,3,MYSTICAL_ELF,'def');
  assert.match(spear.uid,/^m2:/);
  assert.match(defender.uid,/^m3:/);
  state=startBattle(state,0);
  state=attack(state,0,spear,defender);

  assert.equal(state.core.players[1].lp,4000,'a losing attack must not inflict piercing damage');
  assert.equal(state.core.players[0].lp,3900,'the attacking team receives only ordinary battle damage of 100');
  const survivingSpear=state.core.players[0].monsters.find(card=>card.uid===spear.uid&&card.id===SPEAR_DRAGON);
  assert.ok(survivingSpear,'the attacking monster is not destroyed by a stronger Defense Position monster');
  assert.equal(survivingSpear.position,'def','Spear Dragon still changes to Defense Position after the Damage Step');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===defender.uid&&card.id===MYSTICAL_ELF),
    'the stronger Defense Position monster survives');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
