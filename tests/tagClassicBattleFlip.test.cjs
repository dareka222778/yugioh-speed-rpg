'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getMonsterEffect}=require('../dist/effectRegistry');

const HANE_HANE='07089711';
const hane=getPlayableCard(HANE_HANE);
assert.ok(hane&&hane.kind==='monster','Hane-Hane must be an enabled monster');
assert.equal(getMonsterEffect(HANE_HANE)?.trigger,'flip','Hane-Hane must expose its executable FLIP trigger');

const normalCards=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.level<=4&&Number.isInteger(entry.card.atk));
const weak=normalCards
  .filter(entry=>entry.card.atk>0&&entry.card.atk<(hane.defense??0))
  .sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(weak,'the battle-reveal fixture needs a Normal Monster weaker than Hane-Hane DEF');
const deckIds=[...new Set([weak.id,...normalCards.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);
function normalDeck(){return Array.from({length:20},(_,index)=>deckIds[index%deckIds.length]);}
function member(seat){return 'm79-seat-'+seat;}
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
  throw new Error('M79 fixture card missing from physical seat '+seat+': '+id);
}
function settleResponses(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass);
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id);
}

test('a face-down inactive-partner FLIP monster resolves after battle and returns the target to its physical owner',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M79 Seat '+seat,
    cards:seat===3?[HANE_HANE,...normalDeck().slice(1)]:normalDeck()
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m79-battle-flip-trigger'});
  const before=inventorySnapshot(state);

  const attackerCard=takeCard(state,0,weak.id);
  const attacker={
    ...attackerCard,
    owner:0,
    position:'atk',
    faceUp:true,
    entered:0,
    changed:0,
    attacked:0,
    atkBoost:0,
    defBoost:0
  };
  state.core.players[0].monsters.push(attacker);

  const haneCard=takeCard(state,3,HANE_HANE);
  const defender={
    ...haneCard,
    owner:1,
    position:'def',
    faceUp:false,
    entered:0,
    changed:0,
    attacked:0,
    atkBoost:0,
    defBoost:0,
    setTurn:0
  };
  state.core.players[1].monsters.push(defender);
  state.core.turn=3;
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.match(attacker.uid,/^m0:/);
  assert.match(defender.uid,/^m3:/,'the face-down FLIP source must retain its inactive physical owner UID');

  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settleResponses(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===defender.uid
  );
  assert.ok(attack,'the active teammate must be able to attack the shared face-down monster');
  state=settleResponses(tag.stepTagDuel(state,member(0),attack));

  assert.equal(state.core.phase,'choice','the revealed Hane-Hane FLIP effect must open its target choice after damage calculation');
  assert.equal(tag.tagDecisionMember(state).id,member(1),'the active physical representative of the defending team resolves the inactive partner FLIP trigger');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===defender.uid&&card.faceUp),
    'Hane-Hane must be revealed before its FLIP effect is selected');
  const choose=tag.tagActions(state,member(1)).find(action=>action.kind==='choose'&&action.target===attacker.uid);
  assert.ok(choose,'the FLIP effect must be able to select the surviving attacker');
  assert.deepEqual(tag.tagActions(state,member(3)),[],'the inactive physical FLIP source owner must not receive the target-selection action');

  state=settleResponses(tag.stepTagDuel(state,member(1),choose));
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===attacker.uid&&card.id===weak.id),
    'the bounced monster must return to the physical owner hand, not the active partner hand');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===defender.uid&&card.faceUp&&card.position==='def'),
    'the surviving FLIP source must remain face-up in Defense Position');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
