'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const GIFT='98299011';
const SOLAR_RAY='44472639';
const CEMETARY_BOMB='51394546';
const CASES=[
  {id:GIFT,name:'Gift of The Mystical Elf',kind:'gain',amountPerCard:300,selector:{zone:'monsters',player:'both'},expected:[5800,4000]},
  {id:SOLAR_RAY,name:'Solar Ray',kind:'damage',amountPerCard:600,selector:{zone:'monsters',player:'self',faceUp:true,attribute:'LIGHT'},expected:[4000,2800]},
  {id:CEMETARY_BOMB,name:'Cemetary Bomb',kind:'damage',amountPerCard:100,selector:{zone:'grave',player:'opponent'},expected:[4000,3700]}
];

for(const entry of CASES){
  assert.equal(getPlayableCard(entry.id)?.kind,'trap',entry.name+' must be an enabled Trap');
  assert.equal(getPlayableCard(entry.id)?.englishName,entry.name);
  const effect=getEffect(entry.id);
  assert.equal(effect?.kind,'sequence',entry.name+' must use the audited economic sequence');
  assert.deepEqual(effect?.operations?.[0],{
    kind:'scaledLP',
    direction:entry.kind,
    recipient:entry.kind==='gain'?'self':'opponent',
    amountPerCard:entry.amountPerCard,
    selectors:[entry.selector]
  },entry.name+' must preserve its exact count selector and LP rate');
}

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the four-seat fixture needs at least eight enabled Normal Monsters');
const normalIds=normal.slice(0,10).map(entry=>entry.id);
const lightIds=normal.filter(entry=>entry.card.attribute==='LIGHT').map(entry=>entry.id).slice(0,3);
const nonLightId=normal.find(entry=>entry.card.attribute&&entry.card.attribute!=='LIGHT')?.id;
assert.ok(lightIds.length===3,'Solar Ray coverage needs three distinct certified LIGHT Normal Monsters');
assert.ok(nonLightId,'Solar Ray coverage needs a certified non-LIGHT Normal Monster');
const fixtureIds=[...new Set([...normalIds,...lightIds,nonLightId])];

function member(seat){return 'm218-seat-'+seat;}
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
  throw new Error('M218 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const card=takePhysical(state,seat,id);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id,faceUp=true){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:faceUp?'atk':'def',faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
  assert.equal(map.size,80,'all physical UIDs must be unique before resolution');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'scaled LP Traps must conserve all physical cards');
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
    assert.ok(guard<20,'the Trap response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function setup(entry,seed,prepare){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M218 Seat '+seat,
    cards:deck(seat===0?[entry.id]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  state.core.players[0].lp=4000;
  state.core.players[1].lp=4000;
  const trap=ensureInHand(state,0,entry.id);
  assert.match(trap.uid,/^m0:/,entry.name+' must retain seat 0 physical ownership');
  prepare?.(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const set=tag.tagActions(state,member(0)).find(action=>action.kind==='set'&&action.card===trap.uid);
  assert.ok(set,'seat 0 must receive a legal Set action for '+entry.name);
  state=tag.stepTagDuel(state,member(0),set);
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===trap.uid&&!card.faceUp),
    entry.name+' must be Set in the shared allied backrow');
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicBefore.includes(trap.uid),'a Set Trap UID must remain private in the public projection');
  assert.ok(!publicBefore.includes(entry.id),'a Set Trap identity must remain hidden in the public projection');

  state=endTurn(state,0);
  assert.equal(tag.tagDecisionMember(state).id,member(1),'opposing seat 1 acts after seat 0 sets the Trap');
  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2),'the inactive partner seat 2 receives the next allied turn');
  const privateState=snapshots(state);
  assertPrivateHands(state,privateState.hands);
  return {state,trap,before,...privateState};
}
function activateAsPartner(fixture,entry){
  let {state,trap}=fixture;
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  assert.deepEqual(tag.tagActions(state,member(0)),[],
    'the inactive physical owner cannot execute the partner active seat action');
  const action=tag.tagActions(state,member(2)).find(candidate=>
    candidate.kind==='trap'&&candidate.card===trap.uid
  );
  assert.ok(action,'active partner seat 2 must be able to activate the Trap set by seat 0');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(0),action),/Aguarde a vez do participante ativo\./,
    entry.name+' must reject activation submitted by its inactive physical owner');
  assert.equal(JSON.stringify(state),unchanged,'rejected inactive-seat activation must not mutate the duel');
  state=settle(tag.stepTagDuel(state,member(2),action));
  assert.equal(state.core.phase,'main',entry.name+' must finish its response chain');
  assert.deepEqual(state.core.players.map(player=>player.lp),entry.expected,
    entry.name+' must apply the exact scaled LP amount to the correct shared team');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===trap.uid&&card.id===entry.id),
    entry.name+' must enter the activating team Graveyard with its original physical UID');
  for(const seat of [0,1,2,3]){
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),fixture.hands.get(seat),
      entry.name+' must not mutate physical seat '+seat+' private hand');
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),fixture.decks.get(seat),
      entry.name+' must not borrow or mutate physical seat '+seat+' Deck');
  }
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const restored=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(restored),entry.name+' must survive JSON restoration');
  assertPrivateHands(restored,fixture.hands);
  assertConserved(restored,fixture.before);
  return state;
}

test('Gift of The Mystical Elf counts monsters from both shared fields, including a Set monster',()=>{
  const entry=CASES[0];
  const fixture=setup(entry,'m218-gift-both-shared-fields',state=>{
    deploy(state,0,normalIds[0],true);
    deploy(state,2,normalIds[1],true);
    deploy(state,2,normalIds[2],false);
    deploy(state,1,normalIds[3],true);
    deploy(state,3,normalIds[4],false);
    deploy(state,3,normalIds[5],true);
    assert.equal(state.core.players[0].monsters.length,3);
    assert.equal(state.core.players[1].monsters.length,3);
    assert.equal(state.core.players[0].monsters.length+state.core.players[1].monsters.length,6);
  });
  const resolved=activateAsPartner(fixture,entry);
  assert.equal(resolved.core.players[0].lp,5800,'six monsters across both teams grant 1800 LP to the activating team');
  assert.equal(resolved.core.players[1].lp,4000,'Gift of The Mystical Elf must not change the opposing team LP');
});

test('Solar Ray counts only face-up LIGHT monsters on the shared field of its own team',()=>{
  const entry=CASES[1];
  const fixture=setup(entry,'m218-solar-ray-own-faceup-light',state=>{
    const ownA=deploy(state,0,lightIds[0],true);
    const ownB=deploy(state,2,lightIds[1],true);
    const ownHidden=deploy(state,0,lightIds[2],false);
    const opponentA=deploy(state,1,lightIds[0],true);
    const opponentB=deploy(state,3,lightIds[1],true);
    const opponentNonLight=deploy(state,3,nonLightId,true);
    assert.ok(ownA.faceUp&&ownB.faceUp&&!ownHidden.faceUp);
    assert.ok(opponentA.faceUp&&opponentB.faceUp&&opponentNonLight.faceUp);
    assert.equal(state.core.players[0].monsters.length,3);
    assert.equal(state.core.players[1].monsters.length,3);
  });
  const resolved=activateAsPartner(fixture,entry);
  assert.equal(resolved.core.players[0].lp,4000,'Solar Ray must not damage its own team');
  assert.equal(resolved.core.players[1].lp,2800,
    'only the two allied face-up LIGHT monsters count; the hidden allied LIGHT and opposing LIGHT monsters do not');
});

test('Cemetary Bomb counts the shared opposing Graveyard from both physical opponents only',()=>{
  const entry=CASES[2];
  const fixture=setup(entry,'m218-cemetary-bomb-opposing-shared-grave',state=>{
    const own=moveToGrave(state,0,normalIds[0]);
    const opponentOne=moveToGrave(state,1,normalIds[1]);
    const opponentPartner=moveToGrave(state,3,normalIds[2]);
    const opponentSecond=moveToGrave(state,1,normalIds[3]);
    assert.match(own.uid,/^m0:/);
    assert.match(opponentOne.uid,/^m1:/);
    assert.match(opponentPartner.uid,/^m3:/);
    assert.match(opponentSecond.uid,/^m1:/);
    assert.equal(state.core.players[0].grave.length,1);
    assert.equal(state.core.players[1].grave.length,3);
  });
  const resolved=activateAsPartner(fixture,entry);
  assert.equal(resolved.core.players[0].lp,4000,'Cemetary Bomb must not damage its activating team');
  assert.equal(resolved.core.players[1].lp,3700,
    'three cards in the shared opposing Graveyard inflict exactly 300 damage; the allied Graveyard is excluded');
});
