'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getMonsterEffect}=require('../dist/effectRegistry');

const SPY='24317029';
const KURIBOH='40640057';
const spy=getPlayableCard(SPY);
assert.ok(spy&&spy.kind==='monster');
assert.equal(getMonsterEffect(SPY)?.trigger,'flip');
assert.deepEqual(getMonsterEffect(SPY)?.operation,{
  kind:'recruit',
  filter:{archetype:"Gravekeeper's",maximumAtk:1500},
  positions:['atk','def']
});
assert.ok(getPlayableCard(KURIBOH)?.kind==='monster');

function member(seat){return 'm98-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...tag.tagNormalCardIds])].slice(0,7);
  assert.ok(ids.length>=7,'fixture deck must have seven unique identities');
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
  throw new Error('M98 fixture card missing from physical seat '+seat+': '+id);
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
    assert.ok(guard<20,'the response chain must terminate');
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

test('Gravekeeper’s Spy owned by inactive seat 2 recruits an archetype match only from active seat 0 Deck',()=>{
  const players=[
    {id:member(0),name:'M98 Seat 0',cards:deck([SPY,KURIBOH])},
    {id:member(1),name:'M98 Seat 1',cards:deck()},
    {id:member(2),name:'M98 Seat 2',cards:deck([SPY])},
    {id:member(3),name:'M98 Seat 3',cards:deck()}
  ];
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m98-gravekeepers-spy-active-deck'});
  const source=deploy(state,2,SPY,'def',false);
  const activeCandidate=ensureInDeck(state,0,SPY);
  const inactiveCandidate=ensureInDeck(state,2,SPY);
  const nonMatching=ensureInDeck(state,0,KURIBOH);
  state.core.turn=3;
  assert.match(source.uid,/^m2:/);
  assert.match(activeCandidate.uid,/^m0:/);
  assert.match(inactiveCandidate.uid,/^m2:/);
  const before=inventorySnapshot(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const flip=tag.tagActions(state,member(0)).find(action=>
    action.kind==='position'&&action.card===source.uid&&action.mode==='flip'
  );
  assert.ok(flip,'active representative must be able to Flip Summon the inactive partner source');
  state=settleResponses(tag.stepTagDuel(state,member(0),flip));

  assert.equal(state.core.phase,'choice');
  assert.equal(state.core.choice.source,'monsterRecruit','mandatory FLIP effect must proceed directly to recruitment');
  assert.equal(state.core.choice.actor,0);
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assert.deepEqual(tag.tagActions(state,member(2)),[],'inactive physical owner must not receive the mandatory choice');
  const choices=tag.tagActions(state,member(0)).filter(action=>action.kind==='choose');
  assert.ok(choices.some(action=>action.target===activeCandidate.uid),'active physical Deck Gravekeeper candidate must be offered');
  assert.ok(!choices.some(action=>action.target===inactiveCandidate.uid),'inactive source owner Deck must not leak into the choices');
  assert.ok(!choices.some(action=>action.target===nonMatching.uid),'Kuriboh must fail the archetype filter');
  const chosen=choices.find(action=>action.target===activeCandidate.uid);
  state=settleResponses(tag.stepTagDuel(state,member(0),chosen));
  assert.equal(state.core.choice.source,'monsterRecruitPosition');
  const position=tag.tagActions(state,member(0)).find(action=>action.kind==='choose'&&action.target==='__recruit_def__');
  assert.ok(position);
  state=settleResponses(tag.stepTagDuel(state,member(0),position));

  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp&&card.position==='def'),
    'the FLIP source must remain face-up in Defense');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===activeCandidate.uid&&card.id===SPY&&card.position==='def'),
    'the selected Gravekeeper must be Special Summoned from the active Deck');
  assert.ok(state.reserves[2].deck.some(card=>card.uid===inactiveCandidate.uid),
    'the inactive partner copy must remain in the physical reserve Deck');
  assert.ok(state.core.players[0].deck.some(card=>card.uid===nonMatching.uid),
    'the nonmatching archetype card must remain in the active Deck');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
