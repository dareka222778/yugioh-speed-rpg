'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const SONIC_BIRD='57617178';
const SENJU='23401839';
const MANJU='95492061';
const BLACK_LUSTER_RITUAL='72989439';
const BLACK_LUSTER_SOLDIER='05405694';
const FISSURE='66788016';

assert.equal(getMonsterEffect(SONIC_BIRD)?.trigger,'onSummon');
assert.equal(getMonsterEffect(SENJU)?.trigger,'onSummon');
assert.equal(getMonsterEffect(MANJU)?.trigger,'onSummon');
assert.equal(getMonsterEffect(SONIC_BIRD)?.operation.kind,'searchFiltered');
assert.equal(getMonsterEffect(SENJU)?.operation.kind,'searchFiltered');
assert.equal(getMonsterEffect(MANJU)?.operation.kind,'searchFiltered');
assert.equal(getEffect(BLACK_LUSTER_RITUAL)?.kind,'ritualSummon');
assert.equal(getPlayableCard(BLACK_LUSTER_SOLDIER)?.monsterType,'ritual');
assert.equal(getEffect(FISSURE)?.kind,'fissure');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the ritual search fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm194-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(required,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M194 Seat '+seat,cards:deck(required)
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
  throw new Error('M194 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const card=takeCard(state,seat,id);
  physical.hand.push(card);
  return card;
}
function ensureInDeck(state,seat,id){
  const physical=holder(state,seat);
  const inDeck=physical.deck.some(card=>card.id===id);
  if(inDeck)return physical.deck.find(card=>card.id===id);
  const card=takeCard(state,seat,id);
  physical.deck.push(card);
  return card;
}
function deployFaceDown(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'def',faceUp:false,
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
  assert.equal(cards.length,before.size,'ritual search must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'ritual search must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function resolveOptionalSearch(state,source,targetId){
  const optional=tag.tagActions(state,member(0)).filter(action=>action.kind==='choose').map(action=>action.target);
  assert.ok(optional.includes(source.uid),'the optional trigger prompt must include the physical source card');
  assert.ok(optional.includes('__skip__'),'the optional trigger must allow the player to decline');
  state=tag.stepTagDuel(state,member(0),{kind:'choose',target:source.uid});
  const searchChoices=tag.tagActions(state,member(0)).filter(action=>action.kind==='choose').map(action=>action.target);
  const target=holder(state,0).deck.find(card=>card.id===targetId);
  assert.ok(target,'the requested Ritual target must remain in the active physical Deck before resolution');
  assert.ok(searchChoices.includes(target.uid),'the search choices must include the matching Ritual card UID');
  assert.ok(!searchChoices.some(uid=>holder(state,0).deck.find(card=>card.uid===uid)?.id===FISSURE),
    'a non-Ritual Spell must never appear in a Ritual search');
  state=tag.stepTagDuel(state,member(0),{kind:'choose',target:target.uid});
  return {state,target};
}
function normalSummon(state,source){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='summon'&&candidate.card===source.uid&&candidate.position==='atk'
  );
  assert.ok(action,'the active physical owner must receive the Normal Summon action');
  return tag.stepTagDuel(state,member(0),action);
}

test('Sonic Bird optionally searches only a Ritual Spell on Normal Summon',()=>{
  let state=game([SONIC_BIRD,BLACK_LUSTER_RITUAL,FISSURE],'m194-sonic-bird');
  const before=inventorySnapshot(state);
  const source=ensureInHand(state,0,SONIC_BIRD);
  const targetBefore=ensureInDeck(state,0,BLACK_LUSTER_RITUAL);
  ensureInDeck(state,0,FISSURE);
  state=normalSummon(state,source);
  const result=resolveOptionalSearch(state,source,BLACK_LUSTER_RITUAL);
  state=result.state;
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===result.target.uid&&card.id===BLACK_LUSTER_RITUAL),
    'Black Luster Ritual is added to the active physical player's hand');
  assert.match(result.target.uid,/^m0:/,'the searched Ritual Spell must come from the active physical Deck');
  assert.ok(!tag.tagMemberHand(state,member(2)).some(card=>card.uid===result.target.uid),
    'the partner hand must not receive the searched card');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Senju of the Thousand Hands optionally searches only a Ritual Monster on Normal Summon',()=>{
  let state=game([SENJU,BLACK_LUSTER_SOLDIER,BLACK_LUSTER_RITUAL],'m194-senju');
  const before=inventorySnapshot(state);
  const source=ensureInHand(state,0,SENJU);
  ensureInDeck(state,0,BLACK_LUSTER_SOLDIER);
  ensureInDeck(state,0,BLACK_LUSTER_RITUAL);
  state=normalSummon(state,source);
  const result=resolveOptionalSearch(state,source,BLACK_LUSTER_SOLDIER);
  state=result.state;
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===result.target.uid&&card.id===BLACK_LUSTER_SOLDIER),
    'Black Luster Soldier is added to the active physical player's hand');
  assert.match(result.target.uid,/^m0:/);
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Manju of the Ten Thousand Hands can search a Ritual Spell on Normal Summon',()=>{
  let state=game([MANJU,BLACK_LUSTER_RITUAL,BLACK_LUSTER_SOLDIER],'m194-manju-spell');
  const before=inventorySnapshot(state);
  const source=ensureInHand(state,0,MANJU);
  ensureInDeck(state,0,BLACK_LUSTER_RITUAL);
  ensureInDeck(state,0,BLACK_LUSTER_SOLDIER);
  state=normalSummon(state,source);
  const result=resolveOptionalSearch(state,source,BLACK_LUSTER_RITUAL);
  state=result.state;
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===result.target.uid&&card.id===BLACK_LUSTER_RITUAL));
  assert.match(result.target.uid,/^m0:/);
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Manju of the Ten Thousand Hands can search a Ritual Monster on Flip Summon',()=>{
  let state=game([MANJU,BLACK_LUSTER_SOLDIER,BLACK_LUSTER_RITUAL],'m194-manju-flip');
  const before=inventorySnapshot(state);
  const source=deployFaceDown(state,0,MANJU);
  ensureInDeck(state,0,BLACK_LUSTER_SOLDIER);
  ensureInDeck(state,0,BLACK_LUSTER_RITUAL);
  const flip=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='position'&&candidate.card===source.uid&&candidate.mode==='flip'
  );
  assert.ok(flip,'the active player can Flip Summon the face-down Manju');
  state=tag.stepTagDuel(state,member(0),flip);
  const result=resolveOptionalSearch(state,source,BLACK_LUSTER_SOLDIER);
  state=result.state;
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===result.target.uid&&card.id===BLACK_LUSTER_SOLDIER));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
