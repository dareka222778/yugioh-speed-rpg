'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const RESTRUCTER='99518961';
const SECRET_BARREL='27053506';
const YAMI='59197169';
const MOOYAN='58074572';

assert.equal(getPlayableCard(RESTRUCTER)?.kind,'spell');
assert.equal(getPlayableCard(RESTRUCTER)?.englishName,'Restructer Revolution');
assert.deepEqual(getEffect(RESTRUCTER)?.operations?.[0],{
  kind:'scaledLP',direction:'damage',recipient:'opponent',amountPerCard:200,
  selectors:[{zone:'hand',player:'opponent'}]
});
assert.equal(getPlayableCard(SECRET_BARREL)?.kind,'trap');
assert.equal(getPlayableCard(SECRET_BARREL)?.englishName,'Secret Barrel');
assert.deepEqual(getEffect(SECRET_BARREL)?.operations?.[0],{
  kind:'scaledLP',direction:'damage',recipient:'opponent',amountPerCard:200,
  selectors:[
    {zone:'hand',player:'opponent'},
    {zone:'monsters',player:'opponent'},
    {zone:'backrow',player:'opponent',includeField:true}
  ]
});
assert.equal(getPlayableCard(YAMI)?.field,true,'Yami must be an enabled Field Spell');
assert.equal(getPlayableCard(MOOYAN)?.kind,'spell','Mooyan Curry must be a playable Spell for the shared backrow fixture');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the four-seat fixture needs at least eight enabled Normal Monsters');
const normalIds=normal.slice(0,10).map(entry=>entry.id);
const fixtureIds=[...new Set([...normalIds,RESTRUCTER,SECRET_BARREL,YAMI,MOOYAN])];

function member(seat){return 'm219-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...fixtureIds])];
  assert.ok(ids.length>=8&&ids.length<=20,'the physical fixture deck must have a valid distinct-card pool');
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
  throw new Error('M219 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const card=takePhysical(state,seat,id);
  physical.hand.push(card);
  return card;
}
function setHandCount(state,seat,count){
  const physical=holder(state,seat);
  while(physical.hand.length>count)physical.deck.unshift(physical.hand.pop());
  while(physical.hand.length<count){
    assert.ok(physical.deck.length,'the physical seat Deck must supply the requested fixture hand');
    physical.hand.push(physical.deck.shift());
  }
  assert.equal(physical.hand.length,count);
}
function deploy(state,seat,id,faceUp=true){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:faceUp?'atk':'def',faceUp,
    entered:state.core.turn,changed:state.core.turn,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique before resolution');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'scaled LP effects must conserve all physical cards');
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
      'the physical owner of the excess hand must make their own End Phase discard');
    const discard=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='discard');
    assert.ok(discard,'a participant above six cards must receive a legal End Phase discard');
    state=tag.stepTagDuel(state,member(seat),discard);
  }
  assert.ok(tag.tagMemberHand(state,member(seat)).length<=6,
    'the outgoing physical participant must finish End Phase with at most six cards');
  return state;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function createGame(requiredBySeat,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M219 Seat '+seat,
    cards:deck(requiredBySeat[seat]||[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  state.core.players[0].lp=4000;
  state.core.players[1].lp=4000;
  return state;
}
function rotateToSeat2(state){
  for(let guard=0;tag.tagDecisionMember(state).id!==member(2);guard++){
    assert.ok(guard<4,'turn rotation must reach allied partner seat 2');
    const activeSeat=state.members.findIndex(player=>player.id===tag.tagDecisionMember(state).id);
    assert.ok(activeSeat>=0,'the active physical seat must remain registered');
    state=endTurn(state,activeSeat);
  }
  assert.equal(state.active[0],2,'seat 2 must be the active physical representative of the activating team');
  assert.equal(state.active[1],1,'seat 1 remains the active opposing representative while seat 2 acts');
  return state;
}

test('Restructer Revolution counts only the active opposing physical hand, not the inactive opponent partner hand',()=>{
  let state=createGame([[RESTRUCTER],[],[RESTRUCTER],[]],'m219-restructer-active-opponent-hand');
  const partnerSpell=ensureInHand(state,0,RESTRUCTER);
  const activeSpell=ensureInHand(state,2,RESTRUCTER);
  assert.match(partnerSpell.uid,/^m0:/,'the partner Spell must remain owned by seat 0');
  assert.match(activeSpell.uid,/^m2:/,'the active Spell must remain owned by seat 2');

  state=rotateToSeat2(state);
  setHandCount(state,1,2);
  setHandCount(state,3,6);
  assert.equal(tag.tagMemberHand(state,member(1)).length,2,'the active opposing physical seat has two cards');
  assert.equal(tag.tagMemberHand(state,member(3)).length,6,'the inactive opposing partner has six private cards');
  const before=inventorySnapshot(state);
  const privateState=snapshots(state);
  assertPrivateHands(state,privateState.hands);

  const actions=tag.tagActions(state,member(2));
  assert.ok(!actions.some(action=>action.card===partnerSpell.uid),
    'seat 2 cannot activate a Spell from inactive partner seat 0 private hand');
  assert.deepEqual(tag.tagActions(state,member(0)),[],
    'the inactive allied physical partner cannot submit the active seat action');
  const action=actions.find(candidate=>candidate.kind==='spell'&&candidate.card===activeSpell.uid);
  assert.ok(action,'active seat 2 must be able to activate its own Restructer Revolution');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(0),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'a rejected partner action must not mutate the duel');

  state=settle(tag.stepTagDuel(state,member(2),action));
  assert.equal(state.core.phase,'main');
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,3600],
    'only the two cards in the active opponent seat hand cause 400 damage; the inactive partner hand is excluded');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===activeSpell.uid&&card.id===RESTRUCTER));
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===partnerSpell.uid),
    'the inactive allied partner copy remains in its physical hand');
  for(const seat of [0,1,2,3]){
    const expected=privateState.hands.get(seat).filter(uid=>!(seat===2&&uid===activeSpell.uid));
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),expected,
      'Restructer Revolution must not mutate physical seat '+seat+' hand beyond its own source');
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),privateState.decks.get(seat),
      'Restructer Revolution must not borrow physical seat '+seat+' Deck');
  }
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const restored=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(restored));
  assertPrivateHands(restored,new Map([0,1,2,3].map(seat=>[seat,tag.tagMemberHand(restored,member(seat)).map(card=>card.uid)])));
  assertConserved(restored,before);
});

test('Secret Barrel counts the active opposing hand plus both opponents shared field zones',()=>{
  let state=createGame([[SECRET_BARREL],[YAMI,MOOYAN],[],[]],'m219-secret-barrel-shared-field');
  const trap=ensureInHand(state,0,SECRET_BARREL);
  const yami=ensureInHand(state,1,YAMI);
  const mooyan=ensureInHand(state,1,MOOYAN);
  assert.match(trap.uid,/^m0:/);
  assert.match(yami.uid,/^m1:/);
  assert.match(mooyan.uid,/^m1:/);

  const before=inventorySnapshot(state);
  const setTrap=tag.tagActions(state,member(0)).find(action=>action.kind==='set'&&action.card===trap.uid);
  assert.ok(setTrap,'seat 0 must be able to Set Secret Barrel');
  state=tag.stepTagDuel(state,member(0),setTrap);
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===trap.uid&&!card.faceUp));
  state=endTurn(state,0);
  assert.equal(tag.tagDecisionMember(state).id,member(1));

  const setField=tag.tagActions(state,member(1)).find(action=>action.kind==='setField'&&action.card===yami.uid);
  assert.ok(setField,'opposing seat 1 must be able to Set its Field Spell');
  state=settle(tag.stepTagDuel(state,member(1),setField));
  assert.equal(state.core.players[1].field?.uid,yami.uid);
  assert.equal(state.core.players[1].field?.faceUp,false);

  const setBackrow=tag.tagActions(state,member(1)).find(action=>action.kind==='set'&&action.card===mooyan.uid);
  assert.ok(setBackrow,'opposing seat 1 must be able to Set a Spell in the shared backrow');
  state=tag.stepTagDuel(state,member(1),setBackrow);
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===mooyan.uid&&!card.faceUp));

  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  deploy(state,1,normalIds[0],true);
  deploy(state,3,normalIds[1],false);
  setHandCount(state,1,2);
  setHandCount(state,3,6);
  assert.equal(state.core.players[1].monsters.length,2,'both opposing physical seats share the same three Monster Zones');
  assert.equal(state.core.players[1].backrow.length,1);
  assert.ok(state.core.players[1].field?.uid===yami.uid);
  assert.equal(tag.tagMemberHand(state,member(1)).length,2);
  assert.equal(tag.tagMemberHand(state,member(3)).length,6);
  const privateState=snapshots(state);
  assertPrivateHands(state,privateState.hands);
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicBefore.includes(yami.uid)&&!publicBefore.includes(YAMI),
    'the Set Field Spell must remain hidden while it is counted');
  assert.ok(!publicBefore.includes(mooyan.uid)&&!publicBefore.includes(MOOYAN),
    'the Set backrow Spell must remain hidden while it is counted');

  const action=tag.tagActions(state,member(2)).find(candidate=>candidate.kind==='trap'&&candidate.card===trap.uid);
  assert.ok(action,'active allied seat 2 may activate seat 0 shared Secret Barrel');
  assert.deepEqual(tag.tagActions(state,member(0)),[]);
  state=settle(tag.stepTagDuel(state,member(2),action));
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,2800],
    '2 active-opponent hand cards + 2 shared monsters + 1 set backrow + 1 set Field Spell = 6 counted cards and 1200 damage');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===trap.uid&&card.id===SECRET_BARREL));
  assert.ok(state.core.players[1].field?.uid===yami.uid&&!state.core.players[1].field.faceUp,
    'Secret Barrel counts but does not reveal or remove the opposing Set Field Spell');
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===mooyan.uid&&!card.faceUp),
    'Secret Barrel counts but does not reveal or remove the opposing Set backrow card');

  for(const seat of [0,1,2,3]){
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),privateState.hands.get(seat),
      'Secret Barrel must not mutate physical seat '+seat+' private hand');
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),privateState.decks.get(seat),
      'Secret Barrel must not borrow physical seat '+seat+' Deck');
  }
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const restored=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(restored));
  assertConserved(restored,before);
});
