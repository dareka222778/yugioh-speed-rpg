'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel.js');
const {getPlayableCard,enabledCardIds}=require('../dist/effectRegistry.js');
const {rulesFor}=require('../dist/rulesProfile.js');
const {
  GRACEFUL_CHARITY_ID,activateGracefulCharity,resolveGracefulCharity,
  privateGracefulCharityReceiptForSeat
}=require('../dist/gracefulCharityTagAdapter.js');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20,'fixtures need four physical 20-card decks');
let sequence=0;
function deck(){return NORMALS.slice(0,20);}
function member(seat){return 'm644-seat-'+seat;}
function create(first=0,seed='default'){
  return tag.createTagDuel([0,1,2,3].map(seat=>({id:member(seat),name:'M644 Seat '+seat,cards:deck()})),
    {classic:true,first,seed:'m644-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function addCharityToHand(state,seat){
  const uid='m'+seat+':m644-graceful-charity-'+(++sequence);
  holder(state,seat).hand.push({uid,id:GRACEFUL_CHARITY_ID});
  return uid;
}
function addCharityToBackrow(state,seat,{faceUp=false,setTurn=0}={}){
  const uid='m'+seat+':m644-graceful-charity-'+(++sequence);
  state.core.players[seat%2].backrow.push({uid,id:GRACEFUL_CHARITY_ID,faceUp,setTurn});
  return uid;
}
function inventory(state){
  const cards=tag.tagInventory(state).filter(card=>card.entityKind!=='token');
  const result=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(result.size,cards.length,'physical UIDs must be unique');
  return result;
}
function hands(state){
  const result=[];
  for(const player of state.core.players)for(const card of player.hand)result.push(card.uid);
  for(const held of Object.values(state.reserves))for(const card of held.hand)result.push(card.uid);
  return result.sort();
}
function assertConserved(state,before){
  const after=inventory(state);
  assert.equal(after.size,before.size);
  for(const [uid,id] of before)assert.equal(after.get(uid),id,'physical identity changed: '+uid);
}
function assertRules(state){
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);assert.equal(rules.handCheck,'end');
  assert.equal(rules.monsterZones,3);assert.equal(rules.spellTrapZones,3);
  assert.equal(rules.extraDeckMax,5);
  for(const player of state.core.players){assert.ok(player.monsters.length<=3);assert.ok(player.backrow.length<=3);}
}
function event(state,actorSeat,sourceUid,activationId){
  return {activationId:activationId??'m644:'+state.core.turn+':'+sourceUid+':'+(++sequence),actorSeat,sourceUid};
}
function activate(state,actorSeat,sourceUid,activationId){
  return activateGracefulCharity(state,event(state,actorSeat,sourceUid,activationId));
}
function resolve(activation,discardUids,effectNegated=false){
  return resolveGracefulCharity(activation.state,activation.plan,discardUids,effectNegated);
}
function privateReceipt(result,seat=0){return privateGracefulCharityReceiptForSeat(result,seat);}

test('Graceful Charity is not silently added to the playable catalogue or certification allowlist',()=>{
  assert.equal(getPlayableCard(GRACEFUL_CHARITY_ID),undefined);
  assert.equal(enabledCardIds.includes(GRACEFUL_CHARITY_ID),false);
});
test('activation from hand places the same physical Spell face-up in the shared backrow',()=>{
  const state=create(0,'hand-source'),source=addCharityToHand(state,0),before=inventory(state),original=JSON.stringify(state);
  const activation=activate(state,0,source);
  assert.equal(activation.status,'activated');assert.equal(holder(activation.state,0).hand.some(c=>c.uid===source),false);
  const field=activation.state.core.players[0].backrow.find(c=>c.uid===source);
  assert.ok(field);assert.equal(field.faceUp,true);assert.equal(activation.plan.sourceLocation,'hand');
  assertConserved(activation.state,before);assertRules(activation.state);assert.equal(JSON.stringify(state),original);
});
test('a Set Spell can be activated in the same turn',()=>{
  const state=create(0,'same-turn-set'),source=addCharityToBackrow(state,0,{setTurn:state.core.turn});
  const activation=activate(state,0,source);
  assert.equal(activation.plan.sourceLocation,'backrow');
  assert.equal(activation.state.core.players[0].backrow.find(c=>c.uid===source).faceUp,true);
});
test('a teammate-owned Set Spell can be activated from the shared field without changing its physical owner',()=>{
  const state=create(0,'teammate-set'),source=addCharityToBackrow(state,2,{setTurn:state.core.turn});
  const activation=activate(state,0,source);
  assert.equal(activation.plan.sourceOwnerSeat,2);
  assert.equal(activation.state.core.players[0].backrow.find(c=>c.uid===source).uid,source);
});
test('draws the top three cards of the active physical Deck and discards exactly two selected cards',()=>{
  const state=create(0,'draw-discard'),source=addCharityToHand(state,0),actor=holder(state,0);
  const top=actor.deck.slice(0,3).map(c=>c.uid),oldHand=actor.hand.map(c=>c.uid);
  const activation=activate(state,0,source),discard=[oldHand[0],top[1]],result=resolve(activation,discard);
  assert.equal(result.status,'resolved');assert.deepEqual(privateReceipt(result).drawnUids,top);
  assert.deepEqual(privateReceipt(result).discardedUids,[...discard].sort());
  assert.equal(holder(result.state,0).deck.some(c=>c.uid===top[0]),false);
  assert.equal(holder(result.state,0).hand.some(c=>c.uid===top[0]),true);
  assert.equal(holder(result.state,0).hand.some(c=>c.uid===top[1]),false);
  assert.equal(result.state.core.players[0].grave.filter(c=>discard.includes(c.uid)).length,2);
  assert.equal(result.state.core.players[0].grave.some(c=>c.uid===source),true);assertRules(result.state);
});
test('the effect does not enforce the six-card hand limit before the End Phase',()=>{
  const state=create(0,'hand-overflow'),source=addCharityToBackrow(state,0),actor=holder(state,0);
  actor.hand.push(...actor.deck.splice(0,2));assert.equal(actor.hand.length,6);
  const activation=activate(state,0,source),discard=holder(activation.state,0).hand.slice(0,2).map(c=>c.uid);
  const result=resolve(activation,discard);
  assert.equal(holder(result.state,0).hand.length,7);
  assert.equal(rulesFor(result.state.core).handLimit,6);assert.equal(rulesFor(result.state.core).handCheck,'end');
});
test('either newly drawn card or an older card may be selected for discard',()=>{
  const state=create(0,'discard-drawn'),source=addCharityToBackrow(state,0),activation=activate(state,0,source);
  const drawn=holder(activation.state,0).deck.slice(0,3).map(c=>c.uid),result=resolve(activation,[drawn[0],drawn[2]]);
  assert.deepEqual(privateReceipt(result).discardedUids,[drawn[0],drawn[2]].sort());
});
test('activation is rejected when the active physical Deck has fewer than three cards',()=>{
  const state=create(0,'short-deck'),source=addCharityToHand(state,0),actor=holder(state,0);
  actor.grave.push(...actor.deck.splice(2));assert.equal(actor.deck.length,2);
  assert.throws(()=>activate(state,0,source),/pelo menos três cartas/);
});
test('a Deck reduced below three before resolution rejects without mutating the activated snapshot',()=>{
  const state=create(0,'deck-changed'),source=addCharityToHand(state,0),activation=activate(state,0,source);
  const changed=structuredClone(activation.state),actor=holder(changed,0);
  actor.grave.push(...actor.deck.splice(2));const before=JSON.stringify(changed);
  assert.throws(()=>resolveGracefulCharity(changed,activation.plan,[],false),/Deck insuficiente/);
  assert.equal(JSON.stringify(changed),before);
});
test('negation sends Graceful Charity to the Graveyard without drawing or discarding',()=>{
  const state=create(0,'negated'),source=addCharityToHand(state,0);
  const beforeDeck=holder(state,0).deck.map(c=>c.uid),beforeHand=holder(state,0).hand.map(c=>c.uid);
  const activation=activate(state,0,source),result=resolve(activation,undefined,true);
  assert.equal(result.status,'negated');assert.equal(privateReceipt(result),undefined);
  assert.deepEqual(holder(result.state,0).deck.map(c=>c.uid),beforeDeck);
  assert.deepEqual(holder(result.state,0).hand.map(c=>c.uid),beforeHand.filter(uid=>uid!==source));
  assert.equal(result.state.core.players[0].grave.some(c=>c.uid===source),true);
});
test('exactly two distinct discard UIDs are required',()=>{
  const state=create(0,'two-discard-required'),source=addCharityToHand(state,0),activation=activate(state,0,source);
  const uid=holder(activation.state,0).hand[0].uid;
  assert.throws(()=>resolve(activation,undefined),/exatamente dois descartes/);
  assert.throws(()=>resolve(activation,[uid,uid]),/distintos/);
});
test('unknown or stale discard UIDs are rejected and do not mutate the activated snapshot',()=>{
  const state=create(0,'stale-discard'),source=addCharityToHand(state,0),activation=activate(state,0,source);
  const before=JSON.stringify(activation.state);
  assert.throws(()=>resolve(activation,['m0:missing-a','m0:missing-b']),/Escolha duas cartas/);
  assert.equal(JSON.stringify(activation.state),before);
});
test('the same activation cannot be resolved twice',()=>{
  const state=create(0,'duplicate'),source=addCharityToHand(state,0),activation=activate(state,0,source);
  const discard=holder(activation.state,0).hand.slice(0,2).map(c=>c.uid),first=resolve(activation,discard);
  const second=resolveGracefulCharity(first.state,activation.plan,discard,false);
  assert.equal(second.status,'duplicate');assert.equal(second.state,first.state);assert.equal(privateReceipt(second),undefined);
});
test('the same activation ID cannot be registered twice on its updated state',()=>{
  const state=create(0,'activation-id'),source=addCharityToHand(state,0),id='m644:fixed-activation';
  const activation=activate(state,0,source,id);
  assert.throws(()=>activate(activation.state,0,source,id),/já foi registrada/);
});
test('only the active physical seat may activate during the Main Phase',()=>{
  const state=create(0,'priority'),source=addCharityToHand(state,0);
  assert.throws(()=>activate(state,2,source),/Main Phase/);
  const battle=structuredClone(state);battle.core.phase='battle';
  assert.throws(()=>activate(battle,0,source),/Main Phase/);
});
test('a full shared Spell/Trap backrow prevents activating from hand',()=>{
  const state=create(0,'full-backrow'),source=addCharityToHand(state,0);
  for(let i=0;i<3;i++)state.core.players[0].backrow.push({uid:'m0:m644-filler-'+i,id:NORMALS[i],faceUp:false,setTurn:0});
  assert.throws(()=>activate(state,0,source),/Zona de Magias\/Armadilhas livre/);
});
test('a source Set by the opposing team cannot be activated through the shared field',()=>{
  const state=create(0,'wrong-source-team'),source=addCharityToBackrow(state,1);
  assert.throws(()=>activate(state,0,source),/equipe adversária/);
});
test('private draw/discard receipts are transient and visible only to the activating physical seat',()=>{
  const state=create(0,'private-receipt'),source=addCharityToHand(state,0),activation=activate(state,0,source);
  const discard=holder(activation.state,0).hand.slice(0,2).map(c=>c.uid),result=resolve(activation,discard);
  assert.equal(Object.prototype.propertyIsEnumerable.call(result,'privateReceipt'),false);
  assert.ok(privateReceipt(result,0));assert.equal(privateReceipt(result,2),undefined);
  assert.equal(privateReceipt(result,1),undefined);assert.equal(privateReceipt(result,3),undefined);
  const publicCandidate=structuredClone(result.state);
  publicCandidate.core.players[0].grave=publicCandidate.core.players[0].grave.filter(c=>c.uid!==source);
  const publicView=tag.publicTagDuel(publicCandidate);
  for(const uid of privateReceipt(result,0).drawnUids)assert.equal(JSON.stringify(publicView).includes(uid),false);
});
test('discard/draw preserve every physical UID and do not alter the public duel log',()=>{
  const state=create(0,'conservation'),source=addCharityToHand(state,0),before=inventory(state),beforeLog=JSON.stringify(state.core.log);
  const activation=activate(state,0,source),discard=holder(activation.state,0).hand.slice(0,2).map(c=>c.uid),result=resolve(activation,discard);
  assertConserved(result.state,before);assert.equal(JSON.stringify(result.state.core.log),beforeLog);assertRules(result.state);
});
test('the resolver rejects a forged plan that changes the active seat or source owner',()=>{
  const state=create(0,'forged-plan'),source=addCharityToHand(state,0),activation=activate(state,0,source);
  const forged={...activation.plan,actorSeat:2};
  assert.throws(()=>resolveGracefulCharity(activation.state,forged,[],false),/Plano de Graceful Charity/);
});
test('the original input snapshot remains immutable across activation and resolution',()=>{
  const state=create(0,'immutable'),source=addCharityToHand(state,0),before=JSON.stringify(state);
  const activation=activate(state,0,source),discard=holder(activation.state,0).hand.slice(0,2).map(c=>c.uid),result=resolve(activation,discard);
  assert.equal(JSON.stringify(state),before);assertRules(result.state);
});
