'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const TERRAFORMING='73628505';
const REINFORCEMENT='32807846';
const FUSION_SAGE='26902560';
const WARRIOR_RETURNING='95281259';
const EMBLEM='06390406';
const YAMI='59197169';
const POLYMERIZATION='24094653';
const CELTIC_GUARDIAN='91152256';
const BUSTER_BLADER='78193831';

const RULES=[
  [TERRAFORMING,'Terraforming',{from:'deck',filter:{kind:'spell',field:true}}],
  [REINFORCEMENT,'Reinforcement of the Army',{from:'deck',filter:{kind:'monster',race:'Warrior',maxLevel:4}}],
  [FUSION_SAGE,'Fusion Sage',{from:'deck',filter:{name:'Polymerization'}}],
  [WARRIOR_RETURNING,'The Warrior Returning Alive',{from:'grave',filter:{kind:'monster',race:'Warrior'}}],
  [EMBLEM,'Emblem of Dragon Destroyer',{from:'either',filter:{name:'Buster Blader'}}]
];
for(const [id,name,rule] of RULES){
  assert.equal(getPlayableCard(id)?.kind,'spell',name+' must be an enabled Spell');
  assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getEffect(id)?.kind,'searchZone',name+' must use the reviewed search-zone operation');
  assert.deepEqual(getEffect(id)?.rule,rule,name+' must preserve its exact source and filter');
}
assert.equal(getPlayableCard(YAMI)?.field,true,'Yami must be a certified Field Spell');
assert.equal(getPlayableCard(POLYMERIZATION)?.kind,'spell');
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.race,'Warrior');
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.level,4);
assert.equal(getPlayableCard(BUSTER_BLADER)?.race,'Warrior');
assert.ok((getPlayableCard(BUSTER_BLADER)?.level??0)>4,'Buster Blader is the high-Level negative control');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the four-seat fixture needs at least eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);
const nonWarrior=normal.find(entry=>entry.card.race&&entry.card.race!=='Warrior'&&entry.card.level&&entry.card.level<=4);
assert.ok(nonWarrior,'Reinforcement of the Army needs a non-Warrior Level 4 negative control');
const fixtureIds=[...new Set([
  ...normalIds,nonWarrior.id,
  TERRAFORMING,REINFORCEMENT,FUSION_SAGE,WARRIOR_RETURNING,EMBLEM,
  YAMI,POLYMERIZATION,CELTIC_GUARDIAN,BUSTER_BLADER
])];
assert.ok(fixtureIds.length<=20,'the search fixture must fit valid 20-card physical Decks');

function member(seat){return 'm220-seat-'+seat;}
function deck(required=[],extraCopies=[]){
  const ids=[...new Set([...required,...fixtureIds])];
  const pool=[...ids,...extraCopies];
  assert.ok(pool.length>=8&&pool.length<=20);
  return Array.from({length:20},(_,index)=>pool[index%pool.length]);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takePhysical(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M220 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const card=takePhysical(state,seat,id);
  physical.hand.push(card);
  return card;
}
function moveToGrave(state,seat,id){
  const card=takePhysical(state,seat,id);
  state.core.players[seat%2].grave.push(card);
  return card;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'search Spells must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function snapshots(state){
  return {
    hands:new Map([0,1,2,3].map(seat=>[seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)])),
    decks:new Map([0,1,2,3].map(seat=>[seat,holder(state,seat).deck.map(card=>card.uid)]))
  };
}
function assertPrivateHands(state,hands){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const uids of hands.values())for(const uid of uids){
    assert.ok(!publicState.includes(uid),'private hand UID leaked to public duel: '+uid);
  }
}
function endTurn(state,seat){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='end');
  assert.ok(action,'physical seat '+seat+' must be able to end its turn');
  state=tag.stepTagDuel(state,member(seat),action);
  for(let guard=0;state.core.phase==='discard';guard++){
    assert.ok(guard<8,'End Phase hand-limit discard must terminate');
    assert.equal(tag.tagDecisionMember(state).id,member(seat),
      'the physical owner of an excess hand must make their own End Phase discard');
    const discard=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='discard');
    assert.ok(discard,'a participant above six cards must receive a legal End Phase discard');
    state=tag.stepTagDuel(state,member(seat),discard);
  }
  assert.ok(tag.tagMemberHand(state,member(seat)).length<=6,
    'the outgoing physical participant must finish End Phase with at most six cards');
  return state;
}
function rotateToSeat2(state){
  state=endTurn(state,0);
  assert.equal(tag.tagDecisionMember(state).id,member(1));
  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  assert.equal(state.active[0],2);
  assert.equal(state.active[1],1,'seat 1 is the active opposing representative while seat 2 acts');
  return state;
}
function settleResponses(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the search Spell response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function createGame(seed,extraCopiesBySeat={}){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M220 Seat '+seat,cards:deck([],extraCopiesBySeat[seat]||[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  return state;
}
function searchActions(state,seat,spell){
  return tag.tagActions(state,member(seat)).filter(action=>action.kind==='spell'&&action.card===spell.uid);
}
function activateSearch(state,seat,spell,targetUid){
  const options=searchActions(state,seat,spell);
  const offered=options.map(action=>action.target);
  assert.ok(offered.includes(targetUid),'the exact eligible physical UID must be offered by the search filter');
  const action=options.find(candidate=>candidate.target===targetUid);
  state=settleResponses(tag.stepTagDuel(state,member(seat),action));
  assert.equal(state.core.phase,'main','the selected search must resolve without leaving a pending choice');
  return state;
}

test('Terraforming searches only a Field Spell from the active physical Deck, never the partner Deck',()=>{
  let state=createGame('m220-terraforming-physical-deck');
  const before=inventorySnapshot(state);
  const spell=ensureInHand(state,2,TERRAFORMING);
  const ownField=holder(state,2).deck.find(card=>card.id===YAMI);
  const partnerField=holder(state,0).deck.find(card=>card.id===YAMI);
  const wrongKind=holder(state,2).deck.find(card=>card.id===POLYMERIZATION);
  assert.ok(ownField&&partnerField&&wrongKind);
  state=rotateToSeat2(state);
  const options=searchActions(state,2,spell);
  const offered=options.map(action=>action.target);
  assert.ok(offered.includes(ownField.uid));
  assert.ok(!offered.includes(partnerField.uid),'Terraforming cannot inspect the inactive partner physical Deck');
  assert.ok(!offered.includes(wrongKind.uid),'Terraforming cannot select a non-Field Spell');
  const hands=snapshots(state).hands;
  assertPrivateHands(state,hands);
  state=activateSearch(state,2,spell,ownField.uid);
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===ownField.uid&&card.id===YAMI));
  assert.ok(holder(state,0).deck.some(card=>card.uid===partnerField.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid));
  assertPrivateHands(state,new Map([0,1,2,3].map(seat=>[seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)])));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Reinforcement of the Army enforces Warrior and Level 4 filters inside the active physical Deck',()=>{
  let state=createGame('m220-reinforcement-race-level-filter');
  const before=inventorySnapshot(state);
  const spell=ensureInHand(state,2,REINFORCEMENT);
  const ownWarrior=holder(state,2).deck.find(card=>card.id===CELTIC_GUARDIAN);
  const partnerWarrior=holder(state,0).deck.find(card=>card.id===CELTIC_GUARDIAN);
  const highLevelWarrior=holder(state,2).deck.find(card=>card.id===BUSTER_BLADER);
  const nonWarriorLowLevel=holder(state,2).deck.find(card=>card.id===nonWarrior.id);
  assert.ok(ownWarrior&&partnerWarrior&&highLevelWarrior&&nonWarriorLowLevel);
  state=rotateToSeat2(state);
  const options=searchActions(state,2,spell);
  const offered=options.map(action=>action.target);
  assert.ok(offered.includes(ownWarrior.uid));
  assert.ok(!offered.includes(partnerWarrior.uid),'ROTA cannot inspect the inactive partner Deck');
  assert.ok(!offered.includes(highLevelWarrior.uid),'ROTA excludes Warriors above Level 4');
  assert.ok(!offered.includes(nonWarriorLowLevel.uid),'ROTA excludes non-Warrior monsters at Level 4 or below');
  state=activateSearch(state,2,spell,ownWarrior.uid);
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===ownWarrior.uid));
  assert.ok(holder(state,0).deck.some(card=>card.uid===partnerWarrior.uid));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Fusion Sage searches Polymerization from the active physical Deck without borrowing the partner copy',()=>{
  let state=createGame('m220-fusion-sage-physical-deck');
  const before=inventorySnapshot(state);
  const spell=ensureInHand(state,2,FUSION_SAGE);
  const ownPoly=holder(state,2).deck.find(card=>card.id===POLYMERIZATION);
  const partnerPoly=holder(state,0).deck.find(card=>card.id===POLYMERIZATION);
  assert.ok(ownPoly&&partnerPoly);
  state=rotateToSeat2(state);
  const options=searchActions(state,2,spell);
  const offered=options.map(action=>action.target);
  assert.ok(offered.includes(ownPoly.uid));
  assert.ok(!offered.includes(partnerPoly.uid),'Fusion Sage cannot inspect the inactive partner physical Deck');
  state=activateSearch(state,2,spell,ownPoly.uid);
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===ownPoly.uid&&card.id===POLYMERIZATION));
  assert.ok(holder(state,0).deck.some(card=>card.uid===partnerPoly.uid));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('The Warrior Returning Alive searches the shared team Graveyard but adds the selected physical card to the active hand',()=>{
  let state=createGame('m220-warrior-returning-shared-grave');
  const before=inventorySnapshot(state);
  const spell=ensureInHand(state,2,WARRIOR_RETURNING);
  const partnerWarrior=moveToGrave(state,0,CELTIC_GUARDIAN);
  const partnerNonWarrior=moveToGrave(state,0,nonWarrior.id);
  const ownDeckWarrior=holder(state,2).deck.find(card=>card.id===CELTIC_GUARDIAN);
  assert.ok(ownDeckWarrior);
  assert.match(partnerWarrior.uid,/^m0:/);
  state=rotateToSeat2(state);
  const options=searchActions(state,2,spell);
  const offered=options.map(action=>action.target);
  assert.ok(offered.includes(partnerWarrior.uid),'the shared team Graveyard includes the inactive partner physical card');
  assert.ok(!offered.includes(partnerNonWarrior.uid),'the Graveyard filter excludes non-Warrior cards');
  assert.ok(!offered.includes(ownDeckWarrior.uid),'from=grave cannot select a card still in the active physical Deck');
  state=activateSearch(state,2,spell,partnerWarrior.uid);
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===partnerWarrior.uid&&card.id===CELTIC_GUARDIAN),
    'the active effect controller receives the selected card in their private hand');
  assert.ok(!tag.tagMemberHand(state,member(0)).some(card=>card.uid===partnerWarrior.uid),
    'the selected card must not be duplicated into the inactive partner hand');
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Emblem of Dragon Destroyer searches Buster Blader from the active Deck or shared team Graveyard only',()=>{
  let state=createGame('m220-emblem-either-owned-deck-shared-grave',{0:[BUSTER_BLADER]});
  const before=inventorySnapshot(state);
  const spell=ensureInHand(state,2,EMBLEM);
  const ownDeckBuster=holder(state,2).deck.find(card=>card.id===BUSTER_BLADER);
  const partnerCopies=holder(state,0).deck.filter(card=>card.id===BUSTER_BLADER);
  assert.equal(partnerCopies.length,2,'seat 0 needs separate physical Buster Blader copies for Deck and shared Graveyard controls');
  const partnerDeckBuster=partnerCopies[1];
  const partnerGraveBuster=moveToGrave(state,0,BUSTER_BLADER);
  assert.ok(ownDeckBuster&&partnerDeckBuster&&partnerGraveBuster);
  state=rotateToSeat2(state);
  const options=searchActions(state,2,spell);
  const offered=options.map(action=>action.target);
  assert.ok(offered.includes(ownDeckBuster.uid),'Emblem can search Buster Blader from the active physical Deck');
  assert.ok(offered.includes(partnerGraveBuster.uid),'Emblem can search Buster Blader from the shared team Graveyard');
  assert.ok(!offered.includes(partnerDeckBuster.uid),'Emblem cannot inspect the inactive partner physical Deck');
  state=activateSearch(state,2,spell,partnerGraveBuster.uid);
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===partnerGraveBuster.uid&&card.id===BUSTER_BLADER));
  assert.ok(holder(state,0).deck.some(card=>card.uid===partnerDeckBuster.uid));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});
