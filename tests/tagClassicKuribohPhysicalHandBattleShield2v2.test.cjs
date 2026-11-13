'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterDefinition,getMonsterEffect}=require('../dist/monsterEffects');

const KURIBOH='40640057';
const kuriboh=getPlayableCard(KURIBOH);
assert.ok(kuriboh&&kuriboh.kind==='monster','Kuriboh must be a certified playable Monster');
assert.equal(getMonsterEffect(KURIBOH)?.trigger,'quick');
assert.equal(getMonsterEffect(KURIBOH)?.operation.kind,'battleShield');
assert.equal(getMonsterDefinition(KURIBOH)?.activation.window,'opposingDamageCalculation');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the fixture needs seven certified Normal Monsters');
const attackerEntry=normal.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const defenderEntry=normal
  .filter(entry=>entry.id!==attackerEntry.id)
  .reduce((best,current)=>current.card.atk<best.card.atk?current:best);
assert.ok(attackerEntry.card.atk>defenderEntry.card.atk,
  'the attacker must win the battle so Kuriboh can prove damage prevention without preventing destruction');
const deckIds=[...new Set([attackerEntry.id,defenderEntry.id,...normal.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);

function member(seat){return 'm152-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
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
  throw new Error('M152 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique before battle');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Kuriboh must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'physical UIDs must remain unique');
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
function reachDamageCalculation(state,kuribohUid){
  const seen=[];
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<12,'the attack must reach or leave the damage-calculation response window');
    const actor=tag.tagDecisionMember(state).id;
    const actions=tag.tagActions(state,actor);
    seen.push(state.core.pending.stage);
    const activation=actions.find(action=>action.kind==='monsterEffect'&&action.card===kuribohUid);
    if(activation)return {state,activation,seen};
    const pass=actions.find(action=>action.kind==='pass');
    assert.ok(pass,'every response priority must offer pass when Kuriboh is unavailable');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return {state,activation:undefined,seen};
}
function setup(ownerSeat,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M152 Seat '+seat,
    cards:deck(seat===ownerSeat?[KURIBOH]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed});
  const before=inventorySnapshot(state);
  const attacker=deploy(state,0,attackerEntry.id);
  const defender=deploy(state,1,defenderEntry.id);
  const kuribohCard=takeCard(state,ownerSeat,KURIBOH);
  holder(state,ownerSeat).hand.push(kuribohCard);
  state.core.turn=3;
  assert.match(attacker.uid,/^m0:/,'the attacker must retain physical seat 0 ownership');
  assert.match(defender.uid,/^m1:/,'the defender must retain physical seat 1 ownership');
  assert.match(kuribohCard.uid,new RegExp('^m'+ownerSeat+':'),
    'Kuriboh must retain the physical hand owner UID');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,attacker,defender,kuribohCard};
}
function declareAttack(state,attacker,defender){
  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle,'the active attacker must be able to enter the Battle Phase');
  state=settle(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===defender.uid
  );
  assert.ok(attack,'the active attacker must be able to attack the opposing shared-field monster');
  state=tag.stepTagDuel(state,member(0),attack);
  if(state.core.phase==='response')assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical defender receives response priority when its private hand has a legal effect');
  else assert.equal(state.core.phase,'battle',
    'when the defender has no accessible response, the attack resolves without opening a dead response window');
  return state;
}

test('active physical defender uses Kuriboh at damage calculation: battle damage is prevented but the defender is still destroyed',()=>{
  const {state:initial,before,attacker,defender,kuribohCard}=setup(1,'m152-active-kuriboh');
  const publicBefore=tag.publicTagDuel(initial);
  assert.ok(!JSON.stringify(publicBefore).includes(KURIBOH),'the hand identity must not appear in the public duel view');
  assert.ok(!JSON.stringify(publicBefore).includes(kuribohCard.uid),'the physical hand UID must remain private');

  let state=declareAttack(initial,attacker,defender);
  assert.equal(state.core.phase,'response');
  assert.equal(state.core.pending.stage,'calculation',
    'the quick Monster effect is offered only in the damage-calculation response window');
  const window=reachDamageCalculation(state,kuribohCard.uid);
  state=window.state;
  const activate=window.activation;
  assert.ok(activate,'the active defender may activate its own Kuriboh from the physical hand');
  assert.equal(state.core.pending.stage,'calculation');
  assert.equal(tag.tagDecisionMember(state).id,member(1));
  assert.deepEqual(activate.discards,[kuribohCard.uid],'Kuriboh must pay its own discard cost');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive partner cannot submit the quick effect for the active defender');

  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),activate),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'the inactive partner must not mutate the battle chain');
  state=settle(tag.stepTagDuel(state,member(1),activate));

  assert.equal(state.core.players[1].lp,4000,'Kuriboh prevents battle damage to the defending team');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid),'the attacker remains on the field');
  assert.ok(!state.core.players[1].monsters.some(card=>card.uid===defender.uid),
    'Kuriboh does not prevent the defending monster from being destroyed by battle');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===defender.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===kuribohCard.uid),
    'the discarded Kuriboh enters the shared team Graveyard with its physical UID');
  assert.ok(!tag.tagMemberHand(state,member(1)).some(card=>card.uid===kuribohCard.uid));
  assert.ok(!tag.tagMemberHand(state,member(3)).some(card=>card.uid===kuribohCard.uid));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('Kuriboh in the inactive partner private hand is unavailable to the active defender',()=>{
  const {state:initial,before,attacker,defender,kuribohCard}=setup(3,'m152-inactive-partner-kuriboh');
  const publicBefore=tag.publicTagDuel(initial);
  assert.ok(!JSON.stringify(publicBefore).includes(KURIBOH),'the inactive partner hand identity must remain private');
  assert.ok(!JSON.stringify(publicBefore).includes(kuribohCard.uid),'the inactive partner UID must remain private');

  let state=declareAttack(initial,attacker,defender);
  const window=reachDamageCalculation(state,kuribohCard.uid);
  state=window.state;
  assert.equal(window.activation,undefined,
    'the active defender cannot borrow Kuriboh from the inactive partner private hand');
  assert.equal(state.core.phase,'battle',
    'with no accessible Kuriboh, the engine resolves the attack without opening a response window');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical hand owner cannot take a response action');
  const forged={kind:'monsterEffect',card:kuribohCard.uid,discards:[kuribohCard.uid]};
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),forged),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'a forged inactive-seat action must not mutate the duel');

  state=settle(state);
  const expectedDamage=attackerEntry.card.atk-defenderEntry.card.atk;
  assert.equal(state.core.players[1].lp,4000-expectedDamage,
    'without an accessible Kuriboh, normal battle damage applies to the defending team');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid));
  assert.ok(!state.core.players[1].monsters.some(card=>card.uid===defender.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===defender.uid));
  assert.ok(tag.tagMemberHand(state,member(3)).some(card=>card.uid===kuribohCard.uid),
    'the inactive partner retains the physical Kuriboh in its private hand');
  assert.ok(!tag.tagMemberHand(state,member(1)).some(card=>card.uid===kuribohCard.uid),
    'the active teammate must not acquire the partner card');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
