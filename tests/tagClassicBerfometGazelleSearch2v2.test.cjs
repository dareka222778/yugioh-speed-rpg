'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const BERFOMET='77207191';
const GAZELLE='05818798';
const MONSTER_REBORN='83764718';
const NORMAL_FODDER='91152256';
const GAZELLE_NAME='Gazelle the King of Mythical Beasts';

assert.equal(getPlayableCard(BERFOMET)?.englishName,'Berfomet');
assert.equal(getPlayableCard(GAZELLE)?.englishName,GAZELLE_NAME);
assert.equal(getEffect(BERFOMET)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(BERFOMET),{
  trigger:'onSummon',
  operation:{kind:'searchFiltered',rule:{from:'deck',filter:{name:GAZELLE_NAME}}},
  summons:['normal','flip']
});

const member=seat=>'m206-seat-'+seat;
const normalIds=[...new Set(tag.tagNormalCardIds)].slice(0,8);
assert.ok(normalIds.length>=8,'the fixture requires eight enabled Normal Monsters');

function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M206 Seat '+seat,
    cards:deck([BERFOMET,GAZELLE,MONSTER_REBORN,NORMAL_FODDER])
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
  throw new Error('M206 fixture card missing from physical seat '+seat+': '+id);
}
function deployFaceUp(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function deployFaceDown(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:'def',faceUp:false,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
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
  assert.equal(cards.length,before.size,'Berfomet search must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Berfomet search must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settleResponses(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Berfomet trigger response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a pass action');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function summonNormal(state,source,tribute){
  const physical=holder(state,0);
  physical.hand.push(source);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='summon'&&candidate.card===source.uid&&candidate.position==='atk'&&
    Array.isArray(candidate.tributes)&&candidate.tributes.length===1&&candidate.tributes[0]===tribute.uid
  );
  assert.ok(action,'the Level 5 Berfomet Normal Summon must offer its required one-monster Tribute');
  return tag.stepTagDuel(state,member(0),action);
}
function chooseBerfometTrigger(state,source){
  state=settleResponses(state);
  const choices=tag.tagActions(state,member(0)).filter(action=>action.kind==='choose').map(action=>action.target);
  assert.ok(choices.includes(source.uid),'the optional Berfomet trigger must include its physical source');
  assert.ok(choices.includes('__skip__'),'the optional Berfomet trigger must allow the player to decline');
  return tag.stepTagDuel(state,member(0),{kind:'choose',target:source.uid});
}
function searchTargetChoices(state){
  return tag.tagActions(state,member(0)).filter(action=>action.kind==='choose').map(action=>action.target);
}

test('Berfomet searches only Gazelle from the active physical Deck after Normal Summon',()=>{
  let state=game('m206-normal-search');
  const before=inventorySnapshot(state);
  const source=takeCard(state,0,BERFOMET);
  const tribute=deployFaceUp(state,0,NORMAL_FODDER);
  const gazelle=holder(state,0).deck.find(card=>card.id===GAZELLE);
  const excluded=holder(state,0).deck.find(card=>card.id===NORMAL_FODDER);
  assert.ok(gazelle&&excluded,'the active physical Deck needs Gazelle and a negative-control monster');
  const partnerGazelle=holder(state,2).deck.find(card=>card.id===GAZELLE);
  assert.ok(partnerGazelle,'the inactive partner must retain an independent Gazelle copy');

  state=summonNormal(state,source,tribute);
  state=chooseBerfometTrigger(state,source);
  const choices=searchTargetChoices(state);
  assert.ok(choices.includes(gazelle.uid),'the exact Gazelle UID in the active Deck must be selectable');
  assert.ok(!choices.includes(excluded.uid),'a different Normal Monster must not pass the exact-name filter');
  state=tag.stepTagDuel(state,member(0),{kind:'choose',target:gazelle.uid});

  assert.ok(holder(state,0).hand.some(card=>card.uid===gazelle.uid&&card.id===GAZELLE));
  assert.match(gazelle.uid,/^m0:/,'the searched card must originate in physical seat 0 Deck');
  assert.ok(holder(state,2).deck.some(card=>card.uid===partnerGazelle.uid),
    'the partner physical Deck retains its own Gazelle');
  assert.ok(!holder(state,2).hand.some(card=>card.uid===gazelle.uid),
    'the active search must never move a card into the partner private hand');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.id===BERFOMET));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('the active teammate may Flip Summon a partner-owned Berfomet and searches their own Deck',()=>{
  let state=game('m206-partner-flip');
  const before=inventorySnapshot(state);
  const source=deployFaceDown(state,2,BERFOMET);
  const gazelle=holder(state,0).deck.find(card=>card.id===GAZELLE);
  const partnerGazelle=holder(state,2).deck.find(card=>card.id===GAZELLE);
  assert.ok(gazelle&&partnerGazelle);
  assert.match(source.uid,/^m2:/,'Berfomet must preserve the inactive partner physical UID');

  const flip=tag.tagActions(state,member(0)).find(action=>
    action.kind==='position'&&action.card===source.uid&&action.mode==='flip'
  );
  assert.ok(flip,'the active teammate can Flip Summon a partner-owned monster on the shared field');
  state=tag.stepTagDuel(state,member(0),flip);
  state=chooseBerfometTrigger(state,source);
  const choices=searchTargetChoices(state);
  assert.ok(choices.includes(gazelle.uid),'the target must come from active physical seat 0 Deck');
  assert.ok(!choices.includes(partnerGazelle.uid),'the inactive partner Deck is not searchable by the active seat');
  state=tag.stepTagDuel(state,member(0),{kind:'choose',target:gazelle.uid});

  assert.ok(holder(state,0).hand.some(card=>card.uid===gazelle.uid));
  assert.ok(holder(state,2).deck.some(card=>card.uid===partnerGazelle.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('declining Berfomet leaves Gazelle in the active physical Deck',()=>{
  let state=game('m206-decline');
  const before=inventorySnapshot(state);
  const source=takeCard(state,0,BERFOMET);
  const tribute=deployFaceUp(state,0,NORMAL_FODDER);
  const gazelle=holder(state,0).deck.find(card=>card.id===GAZELLE);
  assert.ok(gazelle);
  state=summonNormal(state,source,tribute);
  state=settleResponses(state);
  const choices=tag.tagActions(state,member(0)).filter(action=>action.kind==='choose').map(action=>action.target);
  assert.ok(choices.includes(source.uid));
  assert.ok(choices.includes('__skip__'));
  state=tag.stepTagDuel(state,member(0),{kind:'choose',target:'__skip__'});
  assert.ok(holder(state,0).deck.some(card=>card.uid===gazelle.uid&&card.id===GAZELLE));
  assert.ok(!holder(state,0).hand.some(card=>card.uid===gazelle.uid));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Special Summoning Berfomet does not trigger its Normal/Flip Summon search',()=>{
  let state=game('m206-special-no-trigger');
  const before=inventorySnapshot(state);
  const source=takeCard(state,2,BERFOMET);
  state.core.players[0].grave.push(source);
  const reborn=takeCard(state,0,MONSTER_REBORN);
  holder(state,0).hand.push(reborn);
  const gazelle=holder(state,0).deck.find(card=>card.id===GAZELLE);
  assert.ok(gazelle);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===reborn.uid&&candidate.target===source.uid
  );
  assert.ok(action,'Monster Reborn can target the partner-owned Berfomet in the shared Graveyard');
  state=settleResponses(tag.stepTagDuel(state,member(0),action));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.id===BERFOMET));
  const choices=tag.tagActions(state,member(0)).filter(candidate=>candidate.kind==='choose').map(candidate=>candidate.target);
  assert.ok(!choices.includes(source.uid),'Special Summon is excluded by Berfomet summon filter');
  assert.ok(holder(state,0).deck.some(card=>card.uid===gazelle.uid));
  assert.ok(!holder(state,0).hand.some(card=>card.uid===gazelle.uid));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});
