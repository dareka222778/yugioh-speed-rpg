'use strict';
const {test}=require('node:test');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const SANGAN='26202165';
const KURIBOH='40640057';
function diagnosticTest(name,run){
  test(name,(...args)=>{
    try{return run(...args);}
    catch(error){
      const detail='[M100 Sangan diagnostic] '+(error?.stack??String(error))+'\\n';
      try{fs.mkdirSync('artifacts',{recursive:true});fs.appendFileSync('artifacts/engine-acceptance-failure.tap',detail);}catch{}
      process.stderr.write(detail);
      throw error;
    }
  });
}
function member(seat){return 'm100-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...tag.tagNormalCardIds])].slice(0,7);
  assert.ok(ids.length>=7,'fixture deck must have seven unique card identities');
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
  throw new Error('M100 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInDeck(state,seat,id){
  const physical=holder(state,seat);
  const index=physical.hand.findIndex(card=>card.id===id);
  if(index>=0)physical.deck.push(physical.hand.splice(index,1)[0]);
  const found=physical.deck.find(card=>card.id===id);
  assert.ok(found,'expected card must remain in physical Deck '+seat);
  return found;
}
function deploy(state,seat,id,position,faceUp=true){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,setTurn:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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

diagnosticTest('Sangan searches the active physical teammate Deck by ATK in classic 2v2',()=>{
  const sangan=getPlayableCard(SANGAN);
  assert.ok(sangan&&sangan.kind==='monster');
  const effect=getMonsterEffect(SANGAN);
  assert.equal(effect?.trigger,'onSentToGrave');
  assert.equal(effect?.oncePerTurn,true);
  assert.deepEqual(effect?.operation,{kind:'search',stat:'atk',maximum:1500});
  const kuriboh=getPlayableCard(KURIBOH);
  assert.ok(kuriboh&&kuriboh.kind==='monster');

  const normalCards=[...new Set(tag.tagNormalCardIds)]
    .map(id=>({id,card:getPlayableCard(id)}))
    .filter(entry=>entry.card&&entry.card.level<=4&&Number.isInteger(entry.card.atk));
  const attackerEntry=normalCards
    .filter(entry=>entry.card.atk>(sangan.atk??0))
    .sort((a,b)=>b.card.atk-a.card.atk)[0];
  const ineligibleEntry=normalCards
    .filter(entry=>entry.card.atk>1500)
    .sort((a,b)=>b.card.atk-a.card.atk)[0];
  assert.ok(attackerEntry,'Sangan battle fixture needs a stronger Normal Monster');
  assert.ok(ineligibleEntry,'Sangan search fixture needs a Normal Monster above 1500 ATK');

  const players=[
    {id:member(0),name:'M100 Seat 0',cards:deck([attackerEntry.id])},
    {id:member(1),name:'M100 Seat 1',cards:deck([KURIBOH,ineligibleEntry.id])},
    {id:member(2),name:'M100 Seat 2',cards:deck()},
    {id:member(3),name:'M100 Seat 3',cards:deck([SANGAN,KURIBOH])}
  ];
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m100-sangan-active-physical-deck'});
  const attacker=deploy(state,0,attackerEntry.id,'atk');
  const source=deploy(state,3,SANGAN,'atk');
  const activeCandidate=ensureInDeck(state,1,KURIBOH);
  const inactiveCandidate=ensureInDeck(state,3,KURIBOH);
  const ineligible=ensureInDeck(state,1,ineligibleEntry.id);
  state.core.turn=3;

  assert.match(attacker.uid,/^m0:/);
  assert.match(source.uid,/^m3:/);
  assert.match(activeCandidate.uid,/^m1:/);
  assert.match(inactiveCandidate.uid,/^m3:/);
  assert.match(ineligible.uid,/^m1:/);
  assert.ok(attackerEntry.card.atk>sangan.atk);
  assert.ok(ineligibleEntry.card.atk>1500);
  const before=inventorySnapshot(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settleResponses(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===source.uid
  );
  assert.ok(attack);
  state=settleResponses(tag.stepTagDuel(state,member(0),attack));

  assert.ok(state.core.players[1].grave.some(card=>card.uid===source.uid),
    'Sangan must be sent to the shared team Graveyard');
  assert.equal(state.core.phase,'choice');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical teammate resolves the mandatory search trigger');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive source owner must not receive the search decision');
  const choices=tag.tagActions(state,member(1)).filter(action=>action.kind==='choose');
  assert.ok(choices.some(action=>action.target===activeCandidate.uid),
    'the active physical Deck candidate at 1500 ATK or less must be offered');
  assert.ok(!choices.some(action=>action.target===inactiveCandidate.uid),
    'the inactive partner copy must not leak into the active search choices');
  assert.ok(!choices.some(action=>action.target===ineligible.uid),
    'a card above 1500 ATK must be excluded');
  const chosen=choices.find(action=>action.target===activeCandidate.uid);
  state=settleResponses(tag.stepTagDuel(state,member(1),chosen));

  assert.ok(tag.tagMemberHand(state,member(1)).some(card=>card.uid===activeCandidate.uid),
    'the selected physical UID must be added to the active representative hand');
  assert.ok(state.reserves[3].deck.some(card=>card.uid===inactiveCandidate.uid),
    'the inactive partner Deck must remain unchanged');
  assert.ok(state.core.players[1].deck.some(card=>card.uid===ineligible.uid),
    'the over-limit card must remain in the active physical Deck');
  assert.ok(!tag.tagMemberHand(state,member(3)).some(card=>card.uid===activeCandidate.uid));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000-(attackerEntry.card.atk-sangan.atk));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
