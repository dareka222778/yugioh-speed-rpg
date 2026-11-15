'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterDefinition,getMonsterEffect}=require('../dist/monsterEffects');
const {turnMonsterFaceDown}=require('../dist/classicEffects');

const GUARDIANS=[
  {id:'62340868',name:'Kazejin',atk:2400},
  {id:'98434877',name:'Suijin',atk:2500},
  {id:'25955164',name:'Sanga of the Thunder',atk:2600}
];
for(const guardian of GUARDIANS){
  const card=getPlayableCard(guardian.id);
  const effect=getMonsterEffect(guardian.id);
  assert.ok(card&&card.kind==='monster',guardian.name+' must be a certified playable Monster');
  assert.equal(card.atk,guardian.atk,guardian.name+' ATK metadata must match the official card');
  assert.equal(effect?.trigger,'quick',guardian.name+' must expose a Quick Effect');
  assert.equal(effect?.operation.kind,'guardianZeroAttack',guardian.name+' must use the guardian zero-ATK operation');
  assert.equal(getMonsterDefinition(guardian.id)?.activation.window,'opposingDamageCalculation',
    guardian.name+' must activate during opposing damage calculation');
}

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&entry.card.atk>2600&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>0,'the fixture needs a certified Normal Monster above 2600 ATK');
const attackerEntry=normal.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const fillerIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>id!==attackerEntry.id&&getPlayableCard(id)?.kind==='monster');
assert.ok(fillerIds.length>=20,'the four physical 20-card Decks need enough distinct certified Normal Monsters');

function member(seat){return 'm211-seat-'+seat;}
function deck(required=[]){
  const ids=[...required,...fillerIds.filter(id=>!required.includes(id))];
  assert.ok(ids.length>=20,'each physical seat must receive a complete 20-card Deck');
  return ids.slice(0,20);
}
function game(guardianId,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M211 Seat '+seat,
    cards:deck(seat===0?[attackerEntry.id,attackerEntry.id,attackerEntry.id]:seat===3?[guardianId]:[])
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
  throw new Error('M211 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position='atk'){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,owner:seat%2,position,faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card Decks must contribute exactly 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all 80 physical UIDs must be unique before battle');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'guardian effects must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'guardian effects must not duplicate physical UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical card identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<24,'the damage-calculation chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function startBattle(state){
  const action=tag.tagActions(state,member(0)).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active attacker must be able to enter the Battle Phase');
  return settle(tag.stepTagDuel(state,member(0),action));
}
function declareAttack(state,attacker,guardian){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===guardian.uid
  );
  assert.ok(action,'the active teammate must be able to attack the partner-owned Guardian on the shared field');
  return tag.stepTagDuel(state,member(0),action);
}
function reachGuardianWindow(state,guardianUid){
  const stages=[];
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<16,'the attack must reach or leave the damage-calculation window');
    const actor=tag.tagDecisionMember(state).id;
    const actions=tag.tagActions(state,actor);
    stages.push(state.core.pending.stage);
    const activation=actions.find(action=>action.kind==='monsterEffect'&&action.card===guardianUid);
    if(activation)return {state,activation,stages};
    const pass=actions.find(action=>action.kind==='pass');
    assert.ok(pass,'each response priority must offer pass when the Guardian effect is unavailable');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return {state,activation:undefined,stages};
}
function activateGuardian(state,guardian,attacker){
  const window=reachGuardianWindow(state,guardian.uid);
  state=window.state;
  assert.ok(window.activation,'the face-up Guardian must offer its Quick Effect during damage calculation');
  assert.ok(window.stages.includes('calculation'),'the effect must not be offered before damage calculation');
  assert.equal(state.core.pending.stage,'calculation');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical defender receives response priority for its shared field');
  assert.deepEqual(window.activation.discards,[],'Guardian Zero Attack has no discard cost');
  assert.equal(window.activation.target,attacker.uid,'the effect must target the current attacking monster');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical owner cannot activate the Guardian for the active teammate');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),window.activation),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'a rejected inactive-seat action must not mutate the battle chain');
  return settle(tag.stepTagDuel(state,member(1),window.activation));
}
function setup(guardianId,seed){
  let state=game(guardianId,seed);
  const before=inventorySnapshot(state);
  const firstAttacker=deploy(state,0,attackerEntry.id);
  const secondAttacker=deploy(state,0,attackerEntry.id);
  const guardian=deploy(state,3,guardianId);
  assert.match(firstAttacker.uid,/^m0:/,'the first attacker must retain seat 0 physical ownership');
  assert.match(secondAttacker.uid,/^m0:/,'the second attacker must retain seat 0 physical ownership');
  assert.match(guardian.uid,/^m3:/,'the Guardian must retain inactive partner seat 3 physical ownership');
  assert.equal(guardian.faceUp,true);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,firstAttacker,secondAttacker,guardian};
}

for(const guardianSpec of GUARDIANS){
  test(guardianSpec.name+' reduces a partner-owned attacker to zero for this damage calculation and can be used only once while face-up',()=>{
    const {state:initial,before,firstAttacker,secondAttacker,guardian}=setup(guardianSpec.id,'m211-once-'+guardianSpec.id);
    let state=startBattle(initial);
    state=declareAttack(state,firstAttacker,guardian);
    assert.equal(state.core.phase,'response','the attack must open its response sequence');
    assert.equal(state.core.pending.stage,'declare','the first response window is attack declaration');
    assert.ok(!tag.tagActions(state,member(1)).some(action=>action.kind==='monsterEffect'&&action.card===guardian.uid),
      'Guardian Zero Attack must not be offered at attack declaration');

    state=activateGuardian(state,guardian,firstAttacker);
    assert.equal(guardian.guardianUsed,true,'the face-up Guardian must record its one use');
    assert.equal(state.core.players[0].lp,4000-guardianSpec.atk,
      'the attacking team takes battle damage from the Guardian after the attacker is reduced to zero');
    assert.equal(state.core.players[1].lp,4000,'the defending team takes no battle damage');
    assert.ok(state.core.players[0].grave.some(card=>card.uid===firstAttacker.uid&&card.id===attackerEntry.id),
      'the zero-ATK attacker is destroyed by battle into its physical team Graveyard');
    assert.ok(state.core.players[1].monsters.some(card=>card.uid===guardian.uid&&card.id===guardianSpec.id),
      'the Guardian survives the first battle');
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));

    state=declareAttack(state,secondAttacker,guardian);
    const secondWindow=reachGuardianWindow(state,guardian.uid);
    assert.equal(secondWindow.activation,undefined,
      'the same face-up Guardian cannot activate a second time before being turned face-down');
    state=secondWindow.state;
    assert.equal(state.core.phase,'battle','without a second activation, the attack resolves normally');
    assert.equal(state.core.players[1].lp,4000-(attackerEntry.card.atk-guardianSpec.atk),
      'the second attacker defeats the Guardian and inflicts only the ordinary battle-damage difference');
    assert.equal(state.core.players[0].lp,4000-guardianSpec.atk,
      'the first battle damage remains the only damage to the attacking team');
    assert.ok(state.core.players[1].grave.some(card=>card.uid===guardian.uid&&card.id===guardianSpec.id),
      'the once-used Guardian is destroyed by the second battle');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===secondAttacker.uid),
      'the second attacker survives its stronger normal battle');
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    assertConserved(state,before);
  });

  test(guardianSpec.name+' regains its Quick Effect after the face-down transition resets its one-use state',()=>{
    const {state:initial,before,firstAttacker,secondAttacker,guardian}=setup(guardianSpec.id,'m211-reset-'+guardianSpec.id);
    let state=startBattle(initial);
    state=declareAttack(state,firstAttacker,guardian);
    state=activateGuardian(state,guardian,firstAttacker);
    assert.equal(guardian.guardianUsed,true,'the first activation must consume the face-up use');

    // This is the same runtime transition used when Book of Moon or a position effect Sets a monster.
    turnMonsterFaceDown(guardian);
    assert.equal(guardian.faceUp,false);
    assert.equal(guardian.position,'def');
    assert.equal(Object.hasOwn(guardian,'guardianUsed'),false,
      'turning the Guardian face-down must clear its once-while-face-up use');
    // Simulate a later legal flip-up; the effect is available again while the source is face-up.
    guardian.faceUp=true;
    assert.equal(guardian.position,'def','a flipped-up monster remains in Defense Position');
    assert.doesNotThrow(()=>tag.assertTagDuel(state));

    state=declareAttack(state,secondAttacker,guardian);
    state=activateGuardian(state,guardian,secondAttacker);
    assert.equal(guardian.guardianUsed,true,'the reset Guardian can activate again after being flipped face-up');
    assert.equal(state.core.players[1].monsters.some(card=>card.uid===guardian.uid),true,
      'the face-up Guardian remains on the shared field after the second protected battle');
    assert.equal(state.core.players[0].grave.some(card=>card.uid===secondAttacker.uid),true,
      'the second zero-ATK attacker is destroyed by battle');
    assert.equal(state.core.players[1].lp,4000,'the defending team takes no battle damage after the reset activation');
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    assertConserved(state,before);
  });
}
