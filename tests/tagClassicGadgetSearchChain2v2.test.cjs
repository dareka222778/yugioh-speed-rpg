'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect,getMonsterDefinition}=require('../dist/monsterEffects');

const YELLOW_GADGET='13839120';
const GREEN_GADGET='41172955';
const RED_GADGET='86445415';
const MONSTER_REBORN='83764718';
const FISSURE='66788016';

for(const [id,name] of [
  [YELLOW_GADGET,'Yellow Gadget'],
  [GREEN_GADGET,'Green Gadget'],
  [RED_GADGET,'Red Gadget']
]){
  assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getEffect(id)?.kind,'monsterEffect');
  assert.equal(getMonsterEffect(id)?.trigger,'onSummon');
  assert.equal(getMonsterEffect(id)?.operation.kind,'searchFiltered');
  assert.deepEqual(getMonsterEffect(id)?.summons,['normal','special']);
  assert.equal(getMonsterDefinition(id)?.activation.policy,'optional');
}

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Gadget fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm199-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(required,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M199 Seat '+seat,cards:deck(required)
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
  throw new Error('M199 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const card=takeCard(state,seat,id);
  physical.hand.push(card);
  return card;
}
function ensureInDeck(state,seat,id){
  const physical=holder(state,seat);
  const existing=physical.deck.find(card=>card.id===id);
  if(existing)return existing;
  const card=takeCard(state,seat,id);
  physical.deck.push(card);
  return card;
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
  assert.equal(cards.length,before.size,'Gadget searches must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Gadget searches must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function normalSummon(state,source){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='summon'&&candidate.card===source.uid&&candidate.position==='atk'
  );
  assert.ok(action,'the active physical owner must receive the Normal Summon action');
  return tag.stepTagDuel(state,member(0),action);
}
function settleResponses(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a pass action');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function resolveOptionalSearch(state,source,targetId,excludedIds=[]){
  const optional=tag.tagActions(state,member(0)).filter(action=>action.kind==='choose').map(action=>action.target);
  assert.ok(optional.includes(source.uid),'the optional Gadget trigger must include its physical source');
  assert.ok(optional.includes('__skip__'),'the optional Gadget trigger must allow the player to decline');
  const target=holder(state,0).deck.find(card=>card.id===targetId);
  assert.ok(target,'the matching Gadget must remain in the active physical Deck');
  state=tag.stepTagDuel(state,member(0),{kind:'choose',target:source.uid});
  const choices=tag.tagActions(state,member(0)).filter(action=>action.kind==='choose').map(action=>action.target);
  assert.ok(choices.includes(target.uid),'the filtered search must include the matching Gadget UID');
  for(const id of excludedIds){
    const excluded=holder(state,0).deck.filter(card=>card.id===id);
    assert.ok(excluded.length>0,'the negative-control card must remain in the active Deck: '+id);
    assert.ok(!choices.some(uid=>excluded.some(card=>card.uid===uid)),
      'the Gadget search must exclude a nonmatching card: '+id);
  }
  state=tag.stepTagDuel(state,member(0),{kind:'choose',target:target.uid});
  return {state,target};
}

test('Yellow Gadget searches only Green Gadget from the active physical Deck on Normal Summon',()=>{
  let state=game([YELLOW_GADGET,GREEN_GADGET,RED_GADGET,FISSURE],'m199-yellow-green');
  const before=inventorySnapshot(state);
  const source=ensureInHand(state,0,YELLOW_GADGET);
  ensureInDeck(state,0,GREEN_GADGET);
  ensureInDeck(state,0,RED_GADGET);
  ensureInDeck(state,0,FISSURE);
  state=normalSummon(state,source);
  const result=resolveOptionalSearch(state,source,GREEN_GADGET,[RED_GADGET,FISSURE]);
  state=result.state;
  assert.match(result.target.uid,/^m0:/,'Green Gadget must come from physical seat 0 Deck');
  assert.ok(holder(state,0).hand.some(card=>card.uid===result.target.uid&&card.id===GREEN_GADGET),
    'Green Gadget enters the active physical hand');
  assert.ok(!holder(state,2).hand.some(card=>card.uid===result.target.uid),
    'the partner physical hand does not receive the searched card');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.id===YELLOW_GADGET),
    'Yellow Gadget remains on the shared field with its original UID');
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Green Gadget searches only Red Gadget when a partner-owned copy is Special Summoned',()=>{
  let state=game([GREEN_GADGET,RED_GADGET,YELLOW_GADGET,MONSTER_REBORN,FISSURE],'m199-green-red-special');
  const before=inventorySnapshot(state);
  const source=takeCard(state,2,GREEN_GADGET);
  state.core.players[0].grave.push(source);
  const reborn=ensureInHand(state,0,MONSTER_REBORN);
  ensureInDeck(state,0,RED_GADGET);
  ensureInDeck(state,0,YELLOW_GADGET);
  ensureInDeck(state,0,FISSURE);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===reborn.uid&&candidate.target===source.uid
  );
  assert.ok(action,'the active teammate can activate Monster Reborn on a partner-owned Green Gadget in the shared Graveyard');
  state=settleResponses(tag.stepTagDuel(state,member(0),action));
  const result=resolveOptionalSearch(state,source,RED_GADGET,[YELLOW_GADGET,FISSURE]);
  state=result.state;
  assert.match(result.target.uid,/^m0:/,'Red Gadget must come from active physical seat 0 Deck, not seat 2');
  assert.ok(holder(state,0).hand.some(card=>card.uid===result.target.uid&&card.id===RED_GADGET));
  assert.ok(!holder(state,2).hand.some(card=>card.uid===result.target.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.id===GREEN_GADGET),
    'the Special Summoned Green Gadget retains its partner physical UID on the shared field');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===reborn.uid&&card.id===MONSTER_REBORN));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Red Gadget searches only Yellow Gadget from the active physical Deck on Normal Summon',()=>{
  let state=game([RED_GADGET,YELLOW_GADGET,GREEN_GADGET,FISSURE],'m199-red-yellow');
  const before=inventorySnapshot(state);
  const source=ensureInHand(state,0,RED_GADGET);
  ensureInDeck(state,0,YELLOW_GADGET);
  ensureInDeck(state,0,GREEN_GADGET);
  ensureInDeck(state,0,FISSURE);
  state=normalSummon(state,source);
  const result=resolveOptionalSearch(state,source,YELLOW_GADGET,[GREEN_GADGET,FISSURE]);
  state=result.state;
  assert.match(result.target.uid,/^m0:/,'Yellow Gadget must come from physical seat 0 Deck');
  assert.ok(holder(state,0).hand.some(card=>card.uid===result.target.uid&&card.id===YELLOW_GADGET));
  assert.ok(!holder(state,2).hand.some(card=>card.uid===result.target.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.id===RED_GADGET));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('the active player may decline Yellow Gadget and leave its matching target in the Deck',()=>{
  let state=game([YELLOW_GADGET,GREEN_GADGET,FISSURE],'m199-yellow-decline');
  const before=inventorySnapshot(state);
  const source=ensureInHand(state,0,YELLOW_GADGET);
  const target=ensureInDeck(state,0,GREEN_GADGET);
  state=normalSummon(state,source);
  const choices=tag.tagActions(state,member(0)).filter(action=>action.kind==='choose').map(action=>action.target);
  assert.ok(choices.includes(source.uid));
  assert.ok(choices.includes('__skip__'));
  state=tag.stepTagDuel(state,member(0),{kind:'choose',target:'__skip__'});
  assert.ok(holder(state,0).deck.some(card=>card.uid===target.uid&&card.id===GREEN_GADGET),
    'declining the optional trigger must leave Green Gadget in the physical Deck');
  assert.ok(!holder(state,0).hand.some(card=>card.uid===target.uid));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});
