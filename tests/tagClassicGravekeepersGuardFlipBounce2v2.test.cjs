'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const GRAVEKEEPERS_GUARD='37101832';
const BOOK_OF_TAIYOU='38699854';

assert.equal(getPlayableCard(GRAVEKEEPERS_GUARD)?.englishName,"Gravekeeper's Guard");
assert.equal(getPlayableCard(GRAVEKEEPERS_GUARD)?.kind,'monster');
assert.equal(getEffect(GRAVEKEEPERS_GUARD)?.kind,'monsterEffect');
assert.equal(getPlayableCard(BOOK_OF_TAIYOU)?.englishName,'Book of Taiyou');
assert.equal(getEffect(BOOK_OF_TAIYOU)?.kind,'positionChange');

const normal=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster')
  .slice(0,8);
assert.equal(normal.length,8,'four physical Decks need eight enabled Normal Monsters');
const fixtureIds=[...new Set([...normal,GRAVEKEEPERS_GUARD,BOOK_OF_TAIYOU])];
assert.ok(fixtureIds.length<=20);

function member(seat){return 'm223-seat-'+seat;}
function deck(){
  return Array.from({length:20},(_,index)=>fixtureIds[index%fixtureIds.length]);
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
  throw new Error('M223 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const existing=physical.hand.find(card=>card.id===id);
  if(existing)return existing;
  const card=takePhysical(state,seat,id);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,owner:seat%2,position,faceUp,
    entered:state.core.turn,changed:state.core.turn,attacked:0,
    atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function createGame(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M223 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m223-gravekeepers-guard'});
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
  assert.equal(state.active[0],2);
  assert.equal(state.active[1],1);
  return state;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id);
}
function activateBookAndChooseGuard(state,spell,guard,target){
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  assert.deepEqual(tag.tagActions(state,member(0)),[],
    'inactive physical owner seat 0 cannot submit seat 2 action');
  const action=tag.tagActions(state,member(2)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid&&candidate.target===guard.uid
  );
  assert.ok(action,'active seat 2 must be able to use its own Book of Taiyou on partner-owned Guard');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(0),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'rejected inactive-owner action must not mutate the duel');
  state=settle(tag.stepTagDuel(state,member(2),action));
  assert.equal(state.core.phase,'choice','the mandatory FLIP effect must request its target');
  assert.equal(tag.tagDecisionMember(state).id,member(2),'the active team representative resolves its mandatory FLIP effect');
  const choose=tag.tagActions(state,member(2)).find(candidate=>
    candidate.kind==='choose'&&candidate.target===target.uid
  );
  assert.ok(choose,"Gravekeeper's Guard must offer the selected opposing monster");
  state=tag.stepTagDuel(state,member(2),choose);
  return settle(state);
}

test("Book of Taiyou triggers partner-owned Gravekeeper's Guard and returns the chosen monster to its physical owner",()=>{
  let state=createGame();
  const spell=ensureInHand(state,2,BOOK_OF_TAIYOU);
  const guard=deploy(state,0,GRAVEKEEPERS_GUARD,{faceUp:false,position:'def'});
  const target=deploy(state,3,normal[0],{faceUp:true,position:'atk'});
  const otherHidden=deploy(state,1,normal[1],{faceUp:false,position:'def'});
  state=rotateToSeat2(state);
  const beforeCards=tag.tagInventory(state);
  assert.equal(beforeCards.length,80);
  const before=new Map(beforeCards.map(card=>[card.uid,card.id]));
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicBefore.includes(guard.uid),'the face-down Guard UID must remain hidden');
  assert.ok(!publicBefore.includes(GRAVEKEEPERS_GUARD),'the face-down Guard identity must remain hidden');
  assert.ok(!publicBefore.includes(spell.uid),'the physical hand UID must remain private');
  state=activateBookAndChooseGuard(state,spell,guard,target);
  assert.equal(state.core.players[0].monsters.find(monster=>monster.uid===guard.uid).faceUp,true,
    'Book of Taiyou reveals the partner-owned Guard');
  assert.equal(state.core.players[0].monsters.find(monster=>monster.uid===guard.uid).position,'atk');
  assert.ok(!state.core.players[1].monsters.some(monster=>monster.uid===target.uid),
    'the selected opponent monster leaves the shared field');
  assert.ok(tag.tagMemberHand(state,member(3)).some(card=>card.uid===target.uid),
    'the bounced card returns to physical owner seat 3, not active opposing seat 1');
  assert.ok(!tag.tagMemberHand(state,member(1)).some(card=>card.uid===target.uid));
  assert.equal(state.core.players[1].monsters.find(monster=>monster.uid===otherHidden.uid).faceUp,false,
    'the unselected opponent face-down monster remains hidden');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid));
  assertConserved(state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});
