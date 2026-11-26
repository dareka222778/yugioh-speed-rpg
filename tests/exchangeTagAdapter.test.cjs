'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel.js');
const {getPlayableCard,enabledCardIds}=require('../dist/effectRegistry.js');
const {rulesFor}=require('../dist/rulesProfile.js');
const {
  EXCHANGE_ID,activateExchange,revealExchangeHands,resolveExchange,
  privateExchangeReceiptForSeat
}=require('../dist/exchangeTagAdapter.js');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20,'fixtures need four physical 20-card decks');
let sequence=0;
function deck(){return NORMALS.slice(0,20);}
function member(seat){return 'm646-seat-'+seat;}
function create(first=0,seed='default'){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M646 Seat '+seat,cards:deck()
  })),{classic:true,first,seed:'m646-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function addExchangeToHand(state,seat,ownerSeat=seat){
  const uid='m'+ownerSeat+':m646-exchange-'+(++sequence);
  holder(state,seat).hand.push({uid,id:EXCHANGE_ID});
  return uid;
}
function addExchangeToBackrow(state,seat,ownerSeat=seat,{faceUp=false,setTurn=0}={}){
  const uid='m'+ownerSeat+':m646-exchange-'+(++sequence);
  state.core.players[seat%2].backrow.push({uid,id:EXCHANGE_ID,faceUp,setTurn});
  return uid;
}
function moveDeckCardToHand(state,ownerSeat,holderSeat){
  const owner=holder(state,ownerSeat),recipient=holder(state,holderSeat);
  const card=owner.deck.shift();
  assert.ok(card);
  recipient.hand.push(card);
  return card;
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
  for(const player of state.core.players){
    assert.ok(player.monsters.length<=3);
    assert.ok(player.backrow.length<=3);
  }
}
function event(state,actorSeat,targetSeat,sourceUid,activationId){
  return {
    activationId:activationId??'m646:'+state.core.turn+':'+sourceUid+':'+(++sequence),
    actorSeat,targetSeat,sourceUid
  };
}
function activate(state,actorSeat,targetSeat,sourceUid,activationId){
  return activateExchange(state,event(state,actorSeat,targetSeat,sourceUid,activationId));
}
function reveal(activation){return revealExchangeHands(activation.state,activation.plan);}
function resolve(revealed,actorTakesUid,targetTakesUid,effectNegated=false){
  return resolveExchange(revealed.state,revealed.plan,actorTakesUid,targetTakesUid,effectNegated);
}
function privateView(result,seat){return privateExchangeReceiptForSeat(result,seat);}

test('Exchange remains outside the playable catalogue and certification allowlist',()=>{
  assert.equal(getPlayableCard(EXCHANGE_ID),undefined);
  assert.equal(enabledCardIds.includes(EXCHANGE_ID),false);
});
test('activation from hand places the same physical Spell face-up in the shared backrow',()=>{
  const state=create(0,'hand-source'),source=addExchangeToHand(state,0),before=inventory(state),original=JSON.stringify(state);
  const activation=activate(state,0,1,source);
  assert.equal(activation.status,'activated');
  assert.equal(holder(activation.state,0).hand.some(card=>card.uid===source),false);
  assert.equal(activation.state.core.players[0].backrow.find(card=>card.uid===source).faceUp,true);
  assertConserved(activation.state,before);
  assert.equal(JSON.stringify(state),original);
});
test('a Set Exchange can be activated in the same turn',()=>{
  const state=create(0,'same-turn-set'),source=addExchangeToBackrow(state,0,0,{setTurn:state.core.turn});
  const activation=activate(state,0,1,source);
  assert.equal(activation.plan.sourceLocation,'backrow');
  assert.equal(activation.state.core.players[0].backrow.find(card=>card.uid===source).faceUp,true);
});
test('the actor and selected opponent privately receive both hands after reveal',()=>{
  const state=create(0,'private-reveal'),source=addExchangeToHand(state,0),activation=activate(state,0,1,source);
  const actorBefore=holder(activation.state,0).hand.map(card=>card.uid);
  const targetBefore=holder(activation.state,1).hand.map(card=>card.uid);
  const revealed=reveal(activation);
  assert.equal(revealed.status,'revealed');
  assert.deepEqual(privateView(revealed,0).actorHand.map(card=>card.uid),actorBefore);
  assert.deepEqual(privateView(revealed,0).targetHand.map(card=>card.uid),targetBefore);
  assert.deepEqual(privateView(revealed,1).actorHand.map(card=>card.uid),actorBefore);
  assert.deepEqual(privateView(revealed,1).targetHand.map(card=>card.uid),targetBefore);
  assert.equal(privateView(revealed,2),undefined,'actor teammate must not receive the reveal');
  assert.equal(privateView(revealed,3),undefined,'opponent teammate is not the selected participant');
  assert.equal(Object.prototype.propertyIsEnumerable.call(revealed,'privateReceipt'),false);
  const publicCandidate=structuredClone(revealed.state);
  publicCandidate.core.players[0].backrow=publicCandidate.core.players[0].backrow.filter(card=>card.uid!==source);
  const publicView=tag.publicTagDuel(publicCandidate);
  for(const uid of [...actorBefore,...targetBefore])assert.equal(JSON.stringify(publicView).includes(uid),false);
});
test('both physical participants exchange one card while preserving UIDs and original owners',()=>{
  const state=create(0,'bilateral-exchange'),source=addExchangeToHand(state,0);
  const actorOwnedByTarget=moveDeckCardToHand(state,0,1);
  const targetOwnedByActor=moveDeckCardToHand(state,1,0);
  const activation=activate(state,0,1,source),revealed=reveal(activation);
  const before=inventory(state),beforeHands=hands(revealed.state);
  const result=resolve(revealed,actorOwnedByTarget.uid,targetOwnedByActor.uid);
  assert.equal(result.status,'resolved');
  assert.equal(holder(result.state,0).hand.some(card=>card.uid===actorOwnedByTarget.uid),true);
  assert.equal(holder(result.state,1).hand.some(card=>card.uid===targetOwnedByActor.uid),true);
  assert.equal(holder(result.state,0).hand.some(card=>card.uid===targetOwnedByActor.uid),false);
  assert.equal(holder(result.state,1).hand.some(card=>card.uid===actorOwnedByTarget.uid),false);
  assert.equal(Number(actorOwnedByTarget.uid.slice(1,2)),0);
  assert.equal(Number(targetOwnedByActor.uid.slice(1,2)),1);
  assert.deepEqual(hands(result.state),beforeHands);
  assertConserved(result.state,before);
  assertRules(result.state);
});
test('a transferred Exchange may be activated by its current physical holder and returns to its original owner team grave',()=>{
  const state=create(0,'stolen-source'),source=addExchangeToHand(state,0,1);
  const activation=activate(state,0,1,source),revealed=reveal(activation);
  const actorTakesUid=holder(revealed.state,1).hand[0].uid;
  const targetTakesUid=holder(revealed.state,0).hand[0].uid;
  const result=resolve(revealed,actorTakesUid,targetTakesUid);
  assert.equal(result.state.core.players[1].grave.some(card=>card.uid===source),true);
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid===source),false);
});
test('a Set Exchange controlled by the active team returns to the original owner grave',()=>{
  const state=create(0,'stolen-set'),source=addExchangeToBackrow(state,0,1,{setTurn:state.core.turn});
  const activation=activate(state,0,1,source),revealed=reveal(activation);
  const result=resolve(revealed,holder(revealed.state,1).hand[0].uid,holder(revealed.state,0).hand[0].uid);
  assert.equal(result.state.core.players[1].grave.some(card=>card.uid===source),true);
});
test('only an opposing physical seat can be selected',()=>{
  const state=create(0,'target-seat'),source=addExchangeToHand(state,0);
  assert.throws(()=>activate(state,0,2,source),/equipe adversária/);
  assert.throws(()=>activate(state,0,4,source),/Evento de Exchange inválido/);
});
test('only the active physical seat may activate during the Main Phase',()=>{
  const state=create(0,'priority'),source=addExchangeToHand(state,0);
  assert.throws(()=>activate(state,2,1,source),/Main Phase/);
  const battle=structuredClone(state);battle.core.phase='battle';
  assert.throws(()=>activate(battle,0,1,source),/Main Phase/);
});
test('activation requires both hands to remain non-empty after the Spell leaves the actor hand',()=>{
  const actorEmpty=create(0,'actor-empty'),actorSource=addExchangeToHand(actorEmpty,0);
  holder(actorEmpty,0).grave.push(...holder(actorEmpty,0).hand.filter(card=>card.uid!==actorSource));
  holder(actorEmpty,0).hand=[holder(actorEmpty,0).hand.find(card=>card.uid===actorSource)];
  assert.throws(()=>activate(actorEmpty,0,1,actorSource),/ao menos uma carta na mão/);
  const targetEmpty=create(0,'target-empty'),targetSource=addExchangeToHand(targetEmpty,0);
  holder(targetEmpty,1).grave.push(...holder(targetEmpty,1).hand.splice(0));
  assert.throws(()=>activate(targetEmpty,0,1,targetSource),/ao menos uma carta na mão/);
});
test('a hand activation needs a free Spell/Trap Zone while the Field Zone remains separate',()=>{
  const state=create(0,'full-backrow'),source=addExchangeToHand(state,0);
  for(let i=0;i<3;i++)state.core.players[0].backrow.push({
    uid:'m0:m646-backrow-'+i,id:NORMALS[i],faceUp:false,setTurn:state.core.turn
  });
  assert.throws(()=>activate(state,0,1,source),/Zona de Magias\/Armadilhas livre/);
  const setState=create(0,'field-separate'),setSource=addExchangeToBackrow(setState,0);
  setState.core.players[0].field={uid:'m0:m646-field',id:NORMALS[4],faceUp:true};
  const activation=activate(setState,0,1,setSource);
  assert.equal(activation.state.core.players[0].field.uid,'m0:m646-field');
});
test('an Exchange in the opposing backrow cannot be activated by the active team',()=>{
  const state=create(0,'opposing-backrow'),source=addExchangeToBackrow(state,1);
  assert.throws(()=>activate(state,0,1,source),/adversária/);
});
test('a participant cannot select a card from their own hand',()=>{
  const state=create(0,'wrong-side-choice'),source=addExchangeToHand(state,0),activation=activate(state,0,1,source);
  const revealed=reveal(activation),actorUid=holder(revealed.state,0).hand[0].uid,targetUid=holder(revealed.state,1).hand[0].uid;
  assert.throws(()=>resolve(revealed,actorUid,targetUid),/mão do outro/);
});
test('the two selections must be distinct and each must exist in the other hand',()=>{
  const state=create(0,'invalid-choices'),source=addExchangeToHand(state,0),activation=activate(state,0,1,source),revealed=reveal(activation);
  const actorUid=holder(revealed.state,0).hand[0].uid,targetUid=holder(revealed.state,1).hand[0].uid;
  assert.throws(()=>resolve(revealed,'not-in-target-hand',actorUid),/mão do outro/);
  assert.throws(()=>resolve(revealed,targetUid,'not-in-actor-hand'),/mão do outro/);
  assert.throws(()=>resolve(revealed,targetUid,targetUid),/duas escolhas válidas/);
});
test('a changed hand invalidates the private reveal commitment',()=>{
  const state=create(0,'stale-reveal'),source=addExchangeToHand(state,0),activation=activate(state,0,1,source),revealed=reveal(activation);
  const changed=structuredClone(revealed.state),target=holder(changed,1);
  target.grave.push(target.hand.pop());
  assert.throws(()=>resolveExchange(changed,revealed.plan,holder(changed,1).hand[0].uid,holder(changed,0).hand[0].uid),/mãos mudaram/);
});
test('a forged plan cannot change the actor or target after activation',()=>{
  const state=create(0,'forged-plan'),source=addExchangeToHand(state,0),activation=activate(state,0,1,source);
  assert.throws(()=>revealExchangeHands(activation.state,{...activation.plan,targetSeat:3}),/Plano de Exchange/);
});
test('the same activation cannot be revealed twice or resolved twice',()=>{
  const state=create(0,'duplicate'),source=addExchangeToHand(state,0),activation=activate(state,0,1,source),revealed=reveal(activation);
  assert.throws(()=>revealExchangeHands(revealed.state,revealed.plan),/já revelou/);
  const result=resolve(revealed,holder(revealed.state,1).hand[0].uid,holder(revealed.state,0).hand[0].uid);
  const duplicate=resolveExchange(result.state,revealed.plan,holder(revealed.state,1).hand[0].uid,holder(revealed.state,0).hand[0].uid);
  assert.equal(duplicate.status,'duplicate');
  assert.equal(duplicate.state,result.state);
  assert.equal(privateView(duplicate,0),undefined);
});
test('negation does not reveal or exchange hands and sends the Spell to its original owner grave',()=>{
  const state=create(0,'negated'),source=addExchangeToHand(state,0,1),activation=activate(state,0,1,source);
  const beforeHands=hands(activation.state),result=resolveExchange(activation.state,activation.plan,undefined,undefined,true);
  assert.equal(result.status,'negated');
  assert.equal(privateView(result,0),undefined);
  assert.deepEqual(hands(result.state),beforeHands);
  assert.equal(result.state.core.players[1].grave.some(card=>card.uid===source),true);
  assertRules(result.state);
});
test('a negated activation cannot carry a reveal or card selections',()=>{
  const state=create(0,'negated-after-reveal'),source=addExchangeToHand(state,0),activation=activate(state,0,1,source),revealed=reveal(activation);
  assert.throws(()=>resolveExchange(revealed.state,revealed.plan,undefined,undefined,true),/não pode revelar/);
});
test('private card identities never enter the public duel projection or public log',()=>{
  const state=create(0,'public-view'),source=addExchangeToHand(state,0),activation=activate(state,0,1,source),revealed=reveal(activation);
  const selectedActor=holder(revealed.state,1).hand[0].uid;
  const selectedTarget=holder(revealed.state,0).hand[0].uid;
  const result=resolve(revealed,selectedActor,selectedTarget);
  const publicCandidate=structuredClone(result.state);
  publicCandidate.core.players[0].grave=publicCandidate.core.players[0].grave.filter(card=>card.uid!==source);
  const publicView=tag.publicTagDuel(publicCandidate);
  for(const uid of [selectedActor,selectedTarget]){
    assert.equal(JSON.stringify(publicView).includes(uid),false);
  }
  assert.equal(JSON.stringify(result.state.core.log).includes(selectedActor),false);
  assert.equal(JSON.stringify(result.state.core.log).includes(selectedTarget),false);
});
test('a six-card hand is preserved until the End Phase; Exchange does not auto-discard',()=>{
  const state=create(0,'end-phase-hand'),source=addExchangeToHand(state,0);
  while(holder(state,0).hand.length<7)moveDeckCardToHand(state,0,0);
  while(holder(state,1).hand.length<6)moveDeckCardToHand(state,1,1);
  const activation=activate(state,0,1,source),revealed=reveal(activation);
  assert.equal(holder(revealed.state,0).hand.length,6);
  assert.equal(holder(revealed.state,1).hand.length,6);
  const result=resolve(revealed,holder(revealed.state,1).hand[0].uid,holder(revealed.state,0).hand[0].uid);
  assert.equal(holder(result.state,0).hand.length,6);
  assert.equal(holder(result.state,1).hand.length,6);
});
test('Exchange preserves the original input, inventory, shared zones, and owner identity',()=>{
  const state=create(0,'conservation'),source=addExchangeToHand(state,0),before=inventory(state),original=JSON.stringify(state);
  const activation=activate(state,0,1,source),revealed=reveal(activation);
  const result=resolve(revealed,holder(revealed.state,1).hand[2].uid,holder(revealed.state,0).hand[2].uid);
  assert.equal(JSON.stringify(state),original);
  assertConserved(result.state,before);
  assertRules(result.state);
});
test('a source Set by the active team may be activated even when another seat owns it',()=>{
  const state=create(0,'set-owner'),source=addExchangeToBackrow(state,0,1,{setTurn:state.core.turn});
  const activation=activate(state,0,3,source);
  assert.equal(activation.plan.sourceOwnerSeat,1);
  assert.equal(activation.state.core.players[0].backrow.find(card=>card.uid===source).faceUp,true);
});
