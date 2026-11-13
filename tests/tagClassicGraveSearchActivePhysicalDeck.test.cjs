'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterDefinition,getMonsterEffect}=require('../dist/monsterEffects');

const SANGAN='26202165';
const WITCH='78010363';
for(const [id,stat] of [[SANGAN,'atk'],[WITCH,'defense']]){
  assert.ok(getPlayableCard(id)?.kind==='monster');
  assert.equal(getMonsterEffect(id)?.trigger,'onSentToGrave');
  assert.equal(getMonsterEffect(id)?.operation.kind,'search');
  assert.equal(getMonsterEffect(id)?.operation.stat,stat);
  assert.equal(getMonsterEffect(id)?.operation.maximum,1500);
  assert.equal(getMonsterDefinition(id)?.activation.policy,'mandatory');
}
const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7);
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm143-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
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
  throw new Error('M143 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInDeck(state,seat,id){
  const physical=holder(state,seat);
  const existing=physical.deck.find(card=>card.id===id);
  if(existing)return existing;
  const index=physical.hand.findIndex(card=>card.id===id);
  assert.ok(index>=0,'candidate must exist in the requested physical Deck or opening hand');
  const [card]=physical.hand.splice(index,1);
  physical.deck.push(card);
  return card;
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
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settleUntilSearchChoice(state){
  for(let guard=0;guard<20;guard++){
    if(state.core.phase==='choice'&&state.core.choice?.source==='monsterSearch')return state;
    if(state.core.phase!=='response')throw new Error('Expected Sangan/Witch search choice; got '+state.core.phase+'/'+state.core.choice?.source);
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the active responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  throw new Error('Sangan/Witch trigger did not reach its search choice');
}

for(const entry of [
  {id:SANGAN,name:'Sangan',stat:'atk',sourceAtk:1000,candidate:normal.find(x=>x.card.atk<=1500),partnerCandidate:normal.find(x=>x.card.atk<=1500&&x.id!==normal.find(y=>y.card.atk<=1500)?.id)},
  {id:WITCH,name:'Witch of the Black Forest',stat:'defense',sourceAtk:1100,candidate:normal.find(x=>x.card.defense<=1500),partnerCandidate:normal.find(x=>x.card.defense<=1500&&x.id!==normal.find(y=>y.card.defense<=1500)?.id)}
])test(entry.name+' searches the active physical seat Deck after the inactive teammate source is destroyed',()=>{
  assert.ok(entry.candidate&&entry.partnerCandidate,'fixture needs two distinct eligible physical card identities');
  const attackerEntry=normal.find(x=>x.card.atk>entry.sourceAtk);
  assert.ok(attackerEntry,'fixture needs an attacker stronger than '+entry.name);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M143 Seat '+seat,
    cards:deck(seat===2?[entry.id,entry.partnerCandidate.id]:seat===3?[attackerEntry.id]:seat===0?[entry.candidate.id]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:3,seed:'m143-'+entry.id});
  const sourceCard=takeCard(state,2,entry.id);
  const source={...sourceCard,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[0].monsters.push(source);
  const attackerCard=takeCard(state,3,attackerEntry.id);
  const attacker={...attackerCard,owner:1,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[1].monsters.push(attacker);
  const activeCandidate=ensureInDeck(state,0,entry.candidate.id);
  const partnerCandidate=ensureInDeck(state,2,entry.partnerCandidate.id);
  state.core.turn=3;
  assert.match(source.uid,/^m2:/,'the trigger source belongs physically to inactive seat 2');
  assert.match(attacker.uid,/^m3:/,'the attacking teammate is active seat 3');
  assert.match(activeCandidate.uid,/^m0:/,'the active seat search candidate belongs to physical Deck 0');
  assert.match(partnerCandidate.uid,/^m2:/,'the partner Deck has a separate eligible card UID');
  assert.equal(tag.tagDecisionMember(state).id,member(3));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const partnerDeckBefore=holder(state,2).deck.map(card=>card.uid);
  const attack=tag.tagActions(state,member(3)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===source.uid
  );
  const battle=tag.tagActions(state,member(3)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=tag.stepTagDuel(state,member(3),battle);
  const legalAttack=tag.tagActions(state,member(3)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===source.uid
  );
  assert.ok(legalAttack,'active seat 3 must be able to attack the teammate-owned Sangan/Witch');
  state=tag.stepTagDuel(state,member(3),legalAttack);
  state=settleUntilSearchChoice(state);
  assert.equal(tag.tagDecisionMember(state).id,member(0),
    'the source team active physical seat controls the mandatory search choice');
  const choices=tag.tagActions(state,member(0));
  assert.ok(choices.some(action=>action.kind==='choose'&&action.target===activeCandidate.uid),
    'the eligible card from active physical seat 0 Deck must be offered');
  assert.ok(!choices.some(action=>action.kind==='choose'&&action.target===partnerCandidate.uid),
    'an eligible card in inactive partner seat 2 Deck must not be offered');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'inactive physical source owner cannot choose the search result');
  const choose=choices.find(action=>action.kind==='choose'&&action.target===activeCandidate.uid);
  state=tag.stepTagDuel(state,member(0),choose);
  assert.equal(state.core.phase,'battle','the turn resumes in Battle Phase after the mandatory trigger');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid),
    entry.name+' enters the shared team Graveyard with its physical UID');
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===activeCandidate.uid),
    'the active physical seat receives the searched card from its own Deck');
  assert.ok(!tag.tagMemberHand(state,member(2)).some(card=>card.uid===activeCandidate.uid),
    'the searched card must not be placed in the inactive partner hand');
  assert.deepEqual(holder(state,2).deck.map(card=>card.uid),partnerDeckBefore,
    'the inactive partner physical Deck is not searched or shuffled');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
