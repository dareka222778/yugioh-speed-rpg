'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard}=require('../dist/effectRegistry');

function testM76(name,run){
  test(name,(...args)=>{
    try{return run(...args);}
    catch(error){console.error('[M76 diagnostic]',name,error?.stack??error);throw error;}
  });
}

const normalCards=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.level<=4&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normalCards.length>=7,'the shared-battle fixture needs seven certified Level 4-or-lower Normal Monsters');

const attacker=normalCards.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const defender=normalCards
  .filter(entry=>entry.id!==attacker.id&&entry.card.defense<attacker.card.atk&&entry.card.atk<attacker.card.atk)
  .sort((a,b)=>a.card.defense-b.card.defense)[0];
assert.ok(defender,'the battle-destruction fixture needs a Normal Monster whose DEF is below the attacker ATK');

const deckIds=[...new Set([attacker.id,defender.id,...normalCards.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);
function deck(){return Array.from({length:20},(_,index)=>deckIds[index%deckIds.length]);}
function game(seed){
  return tag.createTagDuel(
    [0,1,2,3].map(seat=>({id:'m76-seat-'+seat,name:'M76 Seat '+seat,cards:deck()})),
    {classic:true,first:0,seed}
  );
}
function member(seat){return 'm76-seat-'+seat;}
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
  throw new Error('M76 fixture card not found in physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position){
  const physicalCard=takeCard(state,seat,id);
  const monster={
    ...physicalCard,
    owner:seat%2,
    position,
    faceUp:true,
    entered:0,
    changed:0,
    attacked:0,
    atkBoost:0,
    defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'physical UIDs must be unique before battle');
  return snapshot;
}
function assertInventoryConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'battle must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'battle must not duplicate physical UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'battle changed physical card identity '+card.uid);
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
function attack(state,seat,uid,target){
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>
    candidate.kind==='attack'&&candidate.card===uid&&candidate.target===target
  );
  assert.ok(action,'the active physical member must receive the expected attack action');
  return settle(tag.stepTagDuel(state,actor,action));
}
function endTurn(state,seat){
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active physical member must be able to end the turn');
  return settle(tag.stepTagDuel(state,actor,action));
}
function handUids(state,seat){
  return tag.tagMemberHand(state,member(seat)).map(card=>card.uid).sort();
}

testM76('classic 2v2 shares team LP while the same inactive-partner monster can attack on both teammates turns',()=>{
  let state=game('m76-shared-team-life-points');
  const before=inventorySnapshot(state);
  const monster=deploy(state,2,attacker.id,'atk');
  const initialHands=[0,1,2,3].map(seat=>handUids(state,seat));
  assert.match(monster.uid,/^m2:/,'the monster must retain the inactive teammate physical UID');
  state.core.turn=3;
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  state=startBattle(state,0);
  const legalAttack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===monster.uid&&action.target===undefined
  );
  assert.ok(legalAttack,'the shared team field must expose the inactive partner monster to the active teammate');
  const unchanged=JSON.stringify(state);
  for(const seat of [1,2,3]){
    assert.deepEqual(tag.tagActions(state,member(seat)),[],'inactive seat '+seat+' must not receive combat actions');
    assert.throws(()=>tag.stepTagDuel(state,member(seat),legalAttack),/Aguarde a vez do participante ativo\./);
    assert.equal(JSON.stringify(state),unchanged,'rejected teammate attack must not mutate the duel');
  }
  assert.deepEqual(tag.tagActions(state,'m76-stranger'),[]);
  assert.throws(()=>tag.stepTagDuel(state,'m76-stranger',legalAttack),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'rejected outsider attack must not mutate the duel');

  const liveMonster=state.core.players[0].monsters.find(card=>card.uid===monster.uid);
  const damage=engine.atk(liveMonster,state.core);
  state=attack(state,0,monster.uid,undefined);
  assert.equal(state.core.players[1].lp,4000-damage,'direct battle damage must reduce the opposing shared team LP');
  assert.equal(state.core.players[0].lp,4000,'the attacking team LP must remain unchanged');
  assert.equal(tag.publicTagDuel(state).teams[1].lp,4000-damage,'the public duel projection must expose the same team LP');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===monster.uid),'the shared monster must remain on the team field');
  assertInventoryConserved(state,before);

  state=endTurn(state,0);
  assert.equal(tag.tagDecisionMember(state).id,member(1));
  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2),'the original inactive physical owner must receive the next team turn');
  assert.deepEqual(handUids(state,0),initialHands[0],'the outgoing teammate private hand must remain separate');
  assert.equal(handUids(state,1).length,initialHands[1].length+1,'only the newly active opponent member draws');
  assert.equal(handUids(state,2).length,initialHands[2].length+1,'the incoming teammate draws from their own deck');
  assert.deepEqual(handUids(state,3),initialHands[3],'the other inactive teammate hand must remain private');

  state=startBattle(state,2);
  state=attack(state,2,monster.uid,undefined);
  assert.equal(state.core.players[1].lp,4000-2*damage,'the same shared monster may attack again on the next physical teammate turn');
  assert.equal(state.core.players[0].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertInventoryConserved(state,before);
});

testM76('classic 2v2 battle destruction sends an inactive partner physical card to the shared team Graveyard',()=>{
  let state=game('m76-shared-team-graveyard');
  const before=inventorySnapshot(state);
  const attacking=deploy(state,0,attacker.id,'atk');
  const defending=deploy(state,3,defender.id,'def');
  assert.match(attacking.uid,/^m0:/);
  assert.match(defending.uid,/^m3:/,'the defender must retain the inactive teammate physical UID');
  state.core.turn=3;
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  state=startBattle(state,0);
  state=attack(state,0,attacking.uid,defending.uid);
  assert.ok(state.core.players[1].grave.some(card=>card.uid===defending.uid&&card.id===defender.id),
    'a destroyed monster from the inactive partner must enter its team shared Graveyard without losing its physical UID');
  assert.ok(!state.core.players[1].monsters.some(card=>card.uid===defending.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacking.uid));
  assert.equal(state.core.players[1].lp,4000,'attacking a Defense Position monster must not inflict battle damage when its DEF is lower than ATK');
  assertInventoryConserved(state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
});
