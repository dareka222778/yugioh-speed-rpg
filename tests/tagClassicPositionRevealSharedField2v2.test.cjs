'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const BOOK_OF_TAIYOU='38699854';
const STOP_DEFENSE='63102017';
const DESERT_SUNLIGHT='93747864';
const DARK_PIERCING_LIGHT='45895206';

for(const [id,name,kind] of [
  [BOOK_OF_TAIYOU,'Book of Taiyou','spell'],
  [STOP_DEFENSE,'Stop Defense','spell'],
  [DESERT_SUNLIGHT,'Desert Sunlight','trap'],
  [DARK_PIERCING_LIGHT,'Dark-Piercing Light','spell']
]){
  assert.equal(getPlayableCard(id)?.kind,kind,name+' must be enabled with the expected card kind');
  assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getEffect(id)?.kind,'positionChange',name+' must use the reviewed position-change model');
}

const normal=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster')
  .slice(0,8);
assert.equal(normal.length,8,'the four physical Decks need eight enabled Normal Monsters');
const fixtureIds=[...new Set([
  ...normal,BOOK_OF_TAIYOU,STOP_DEFENSE,DESERT_SUNLIGHT,DARK_PIERCING_LIGHT
])];
assert.ok(fixtureIds.length<=20,'the fixture pool must fit a legal 20-card physical Deck');

function member(seat){return 'm222-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...fixtureIds])];
  assert.ok(ids.length>=8&&ids.length<=20);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
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
  throw new Error('M222 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const existing=physical.hand.find(card=>card.id===id);
  if(existing)return existing;
  const card=takePhysical(state,seat,id);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id,{faceUp=false,position='def'}={}){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,
    uid:card.uid,
    owner:seat%2,
    position,
    faceUp,
    entered:state.core.turn,
    changed:state.core.turn,
    attacked:0,
    atkBoost:0,
    defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
  assert.equal(cards.length,before.size,'position-changing effects must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3]){
    for(const card of tag.tagMemberHand(state,member(seat))){
      assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat+': '+card.uid);
    }
  }
}
function endTurn(state){
  const actor=tag.tagDecisionMember(state).id;
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active physical participant must be able to end the turn');
  state=tag.stepTagDuel(state,actor,action);
  for(let guard=0;state.core.phase==='discard';guard++){
    assert.ok(guard<8,'End Phase hand-limit discard must terminate');
    const discardOwner=tag.tagDecisionMember(state).id;
    const discard=tag.tagActions(state,discardOwner).find(candidate=>candidate.kind==='discard');
    assert.ok(discard,'the physical participant with excess cards must receive a legal discard');
    state=tag.stepTagDuel(state,discardOwner,discard);
  }
  return state;
}
function rotateToSeat2(state){
  for(let guard=0;tag.tagDecisionMember(state).id!==member(2);guard++){
    assert.ok(guard<4,'turn rotation must reach allied partner seat 2');
    state=endTurn(state);
  }
  assert.equal(state.active[0],2,'seat 2 must become the active representative of its team');
  assert.equal(state.active[1],1,'seat 1 remains the active opposing representative');
  return state;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function createGame(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M222 Seat '+seat,
    cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return state;
}
function spellActions(state,seat,card){
  return tag.tagActions(state,member(seat)).filter(action=>action.kind==='spell'&&action.card===card.uid);
}
function activateSpell(state,seat,card,targetUid){
  const options=spellActions(state,seat,card);
  if(targetUid!==undefined){
    const action=options.find(candidate=>candidate.target===targetUid);
    assert.ok(action,'the exact eligible shared-field target must be offered');
    state=tag.stepTagDuel(state,member(seat),action);
  }else{
    const action=options.find(candidate=>candidate.target===undefined);
    assert.ok(action,'the Spell must be legally activatable');
    state=tag.stepTagDuel(state,member(seat),action);
  }
  return settle(state);
}
function setTrap(state,seat,card){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='set'&&candidate.card===card.uid);
  assert.ok(action,'the physical owner must be able to Set the Trap');
  return tag.stepTagDuel(state,member(seat),action);
}
function activatePartnerTrap(state,trap){
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  assert.deepEqual(tag.tagActions(state,member(0)),[],
    'the inactive physical owner cannot submit the active partner action');
  const action=tag.tagActions(state,member(2)).find(candidate=>candidate.kind==='trap'&&candidate.card===trap.uid);
  assert.ok(action,'active seat 2 must be able to activate the Trap Set by seat 0');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(0),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'rejected inactive-owner action must not mutate the duel');
  return settle(tag.stepTagDuel(state,member(2),action));
}

test('Book of Taiyou can reveal a face-down monster owned by the inactive allied partner on the shared field',()=>{
  let state=createGame('m222-book-of-taiyou-partner-field');
  const spell=ensureInHand(state,2,BOOK_OF_TAIYOU);
  const ally=deploy(state,0,normal[0],{faceUp:false,position:'def'});
  const opponent=deploy(state,3,normal[1],{faceUp:false,position:'def'});
  state=rotateToSeat2(state);
  const before=inventorySnapshot(state);
  assertPrivateHands(state);
  assert.deepEqual(tag.tagActions(state,member(0)),[],
    'the inactive partner cannot activate a Spell from seat 2 physical hand');
  assert.ok(!spellActions(state,0,spell).length);
  const offered=spellActions(state,2,spell).map(action=>action.target);
  assert.ok(offered.includes(ally.uid),'Book of Taiyou may select the inactive partner monster on the allied shared field');
  assert.ok(offered.includes(opponent.uid),'Book of Taiyou may also select a face-down monster on the opposing shared field');
  state=activateSpell(state,2,spell,ally.uid);
  const revealed=state.core.players[0].monsters.find(monster=>monster.uid===ally.uid);
  assert.equal(revealed.faceUp,true);
  assert.equal(revealed.position,'atk');
  assert.equal(state.core.players[1].monsters.find(monster=>monster.uid===opponent.uid).faceUp,false,
    'the unselected opponent monster remains hidden');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});

test('Stop Defense targets either opposing physical seat but never an allied monster',()=>{
  let state=createGame('m222-stop-defense-opponent-team');
  const spell=ensureInHand(state,2,STOP_DEFENSE);
  const ally=deploy(state,0,normal[0],{faceUp:false,position:'def'});
  const hiddenOpponent=deploy(state,3,normal[1],{faceUp:false,position:'def'});
  const visibleOpponent=deploy(state,1,normal[2],{faceUp:true,position:'def'});
  const attackOpponent=deploy(state,1,normal[3],{faceUp:true,position:'atk'});
  state=rotateToSeat2(state);
  const before=inventorySnapshot(state);
  assertPrivateHands(state);
  const offered=spellActions(state,2,spell).map(action=>action.target);
  assert.ok(offered.includes(hiddenOpponent.uid),'the inactive opposing partner face-down Defense monster is a legal target');
  assert.ok(offered.includes(visibleOpponent.uid),'a face-up Defense monster is also a legal target');
  assert.ok(!offered.includes(ally.uid),'the allied shared field is not an opposing target');
  assert.ok(!offered.includes(attackOpponent.uid),'Attack Position monsters are not legal targets');
  state=activateSpell(state,2,spell,hiddenOpponent.uid);
  const target=state.core.players[1].monsters.find(monster=>monster.uid===hiddenOpponent.uid);
  assert.equal(target.faceUp,true);
  assert.equal(target.position,'atk');
  assert.equal(state.core.players[0].monsters.find(monster=>monster.uid===ally.uid).faceUp,false);
  assert.equal(state.core.players[1].monsters.find(monster=>monster.uid===visibleOpponent.uid).position,'def');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});

test('Dark-Piercing Light reveals both opposing physical seats while preserving the allied hidden field',()=>{
  let state=createGame('m222-dark-piercing-light-opposing-team');
  const spell=ensureInHand(state,2,DARK_PIERCING_LIGHT);
  const allied0=deploy(state,0,normal[0],{faceUp:false,position:'def'});
  const allied2=deploy(state,2,normal[1],{faceUp:false,position:'def'});
  const opposing1=deploy(state,1,normal[2],{faceUp:false,position:'def'});
  const opposing3=deploy(state,3,normal[3],{faceUp:false,position:'def'});
  state=rotateToSeat2(state);
  const before=inventorySnapshot(state);
  assertPrivateHands(state);
  state=activateSpell(state,2,spell);
  for(const uid of [opposing1.uid,opposing3.uid]){
    const monster=state.core.players[1].monsters.find(candidate=>candidate.uid===uid);
    assert.equal(monster.faceUp,true,'both opposing physical seats must be revealed');
    assert.equal(monster.position,'def','Dark-Piercing Light reveals without changing battle position');
  }
  for(const uid of [allied0.uid,allied2.uid]){
    const monster=state.core.players[0].monsters.find(candidate=>candidate.uid===uid);
    assert.equal(monster.faceUp,false,'the allied shared field must remain hidden');
  }
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});

test('Desert Sunlight Set by seat 0 may be activated by seat 2 and reveals only the allied shared field in Defense',()=>{
  let state=createGame('m222-desert-sunlight-partner-trap');
  const trap=ensureInHand(state,0,DESERT_SUNLIGHT);
  const allied0=deploy(state,0,normal[0],{faceUp:false,position:'def'});
  const allied2=deploy(state,2,normal[1],{faceUp:false,position:'def'});
  const alliedVisible=deploy(state,0,normal[2],{faceUp:true,position:'atk'});
  const opposing1=deploy(state,1,normal[3],{faceUp:false,position:'def'});
  const opposing3=deploy(state,3,normal[4],{faceUp:false,position:'def'});
  const before=inventorySnapshot(state);
  state=setTrap(state,0,trap);
  const publicAfterSet=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicAfterSet.includes(trap.uid),'the Set Trap UID must remain private');
  assert.ok(!publicAfterSet.includes(DESERT_SUNLIGHT),'the Set Trap identity must remain hidden');
  state=rotateToSeat2(state);
  assertPrivateHands(state);
  state=activatePartnerTrap(state,trap);
  for(const uid of [allied0.uid,allied2.uid]){
    const monster=state.core.players[0].monsters.find(candidate=>candidate.uid===uid);
    assert.equal(monster.faceUp,true,'both allied physical seats must be revealed');
    assert.equal(monster.position,'def','Desert Sunlight reveals allied monsters in Defense Position');
  }
  assert.equal(state.core.players[0].monsters.find(candidate=>candidate.uid===alliedVisible.uid).position,'atk',
    'already face-up allied monsters are not repositioned');
  for(const uid of [opposing1.uid,opposing3.uid]){
    assert.equal(state.core.players[1].monsters.find(candidate=>candidate.uid===uid).faceUp,false,
      'opposing hidden monsters must remain hidden');
  }
  assert.ok(state.core.players[0].grave.some(card=>card.uid===trap.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});
