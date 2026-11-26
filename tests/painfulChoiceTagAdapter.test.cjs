'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel.js');
const {getPlayableCard,enabledCardIds,getDuelCard}=require('../dist/effectRegistry.js');
const {rulesFor}=require('../dist/rulesProfile.js');
const {
  PAINFUL_CHOICE_ID,activatePainfulChoice,revealPainfulChoice,resolvePainfulChoice,
  privatePainfulChoiceRevealForSeat
}=require('../dist/painfulChoiceTagAdapter.js');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
const SPELLS=[...new Set(enabledCardIds.filter(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field&&!getDuelCard(id)?.fusion))];
assert.ok(NORMALS.length>=20,'fixtures need four physical 20-card decks');
assert.ok(SPELLS.length>=5,'fixtures need five enabled Spell cards');
let sequence=0;
function deck(){return NORMALS.slice(0,20);}
function member(seat){return 'm645-seat-'+seat;}
function create(first=0,seed='default',cardsBySeat={}){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M645 Seat '+seat,cards:[...(cardsBySeat[seat]||deck())]
  })),{classic:true,first,seed:'m645-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function addPainfulChoiceToHand(state,seat){
  const uid='m'+seat+':m645-painful-choice-'+(++sequence);
  holder(state,seat).hand.push({uid,id:PAINFUL_CHOICE_ID});
  return uid;
}
function addPainfulChoiceToBackrow(state,seat,{faceUp=false,setTurn=0}={}){
  const uid='m'+seat+':m645-painful-choice-'+(++sequence);
  state.core.players[seat%2].backrow.push({uid,id:PAINFUL_CHOICE_ID,faceUp,setTurn});
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
function event(state,actorSeat,targetSeat,sourceUid,activationId){
  return {activationId:activationId??'m645:'+state.core.turn+':'+sourceUid+':'+(++sequence),actorSeat,targetSeat,sourceUid};
}
function activate(state,actorSeat,targetSeat,sourceUid,activationId){
  return activatePainfulChoice(state,event(state,actorSeat,targetSeat,sourceUid,activationId));
}
function selectFive(state,seat=0){
  return holder(state,seat).deck.slice(0,5).map(card=>card.uid);
}
function reveal(activation,selectedUids){
  return revealPainfulChoice(activation.state,activation.plan,selectedUids);
}
function resolve(revealed,selectedUids,chosenUid,effectNegated=false){
  return resolvePainfulChoice(revealed.state,revealed.plan,selectedUids,chosenUid,effectNegated);
}
function privateView(result,seat){return privatePainfulChoiceRevealForSeat(result,seat);}

test('Painful Choice remains outside the playable catalogue and certification allowlist',()=>{
  assert.equal(getPlayableCard(PAINFUL_CHOICE_ID),undefined);
  assert.equal(enabledCardIds.includes(PAINFUL_CHOICE_ID),false);
});
test('activation from hand places the same physical Spell face-up in the shared backrow',()=>{
  const state=create(0,'hand-source'),source=addPainfulChoiceToHand(state,0),before=inventory(state),original=JSON.stringify(state);
  const activation=activate(state,0,1,source);
  assert.equal(activation.status,'activated');assert.equal(activation.plan.targetSeat,1);
  assert.equal(holder(activation.state,0).hand.some(card=>card.uid===source),false);
  assert.equal(activation.state.core.players[0].backrow.find(card=>card.uid===source).faceUp,true);
  assertConserved(activation.state,before);assert.equal(JSON.stringify(state),original);
});
test('a Set Spell can be activated in the same turn',()=>{
  const state=create(0,'same-turn-set'),source=addPainfulChoiceToBackrow(state,0,{setTurn:state.core.turn});
  const activation=activate(state,0,3,source);
  assert.equal(activation.plan.sourceLocation,'backrow');
  assert.equal(activation.state.core.players[0].backrow.find(card=>card.uid===source).faceUp,true);
});
test('the active seat selects five cards from its own Deck and reveals them only to itself and the chosen opponent',()=>{
  const state=create(0,'private-reveal'),source=addPainfulChoiceToHand(state,0),activation=activate(state,0,1,source);
  const selected=selectFive(activation.state),beforeDeck=holder(activation.state,0).deck.map(card=>card.uid);
  const revealed=reveal(activation,selected);
  assert.equal(revealed.status,'revealed');assert.deepEqual(holder(revealed.state,0).deck.map(card=>card.uid),beforeDeck);
  assert.deepEqual(privateView(revealed,0).cards.map(card=>card.uid),selected);
  assert.deepEqual(privateView(revealed,1).cards.map(card=>card.uid),selected);
  assert.equal(privateView(revealed,2),undefined,'actor teammate must not receive the private reveal');
  assert.equal(privateView(revealed,3),undefined,'opponent teammate is not the selected decision seat');
  assert.equal(Object.prototype.propertyIsEnumerable.call(revealed,'privateReceipt'),false);
  const publicCandidate=structuredClone(revealed.state);
  publicCandidate.core.players[0].backrow=publicCandidate.core.players[0].backrow.filter(card=>card.uid!==activation.plan.sourceUid);
  const publicView=tag.publicTagDuel(publicCandidate);
  assert.equal(JSON.stringify(publicView).includes(selected[0]),false,'the public projection hides Deck UIDs');
});
test('the selected opponent chooses one card for the active hand; the other four go to the shared Graveyard',()=>{
  const state=create(0,'opponent-choice'),source=addPainfulChoiceToHand(state,0),activation=activate(state,0,3,source);
  const selected=selectFive(activation.state),revealed=reveal(activation,selected),chosen=selected[2];
  const before=inventory(state),beforeHands=hands(revealed.state),result=resolve(revealed,selected,chosen);
  assert.equal(result.status,'resolved');
  assert.equal(holder(result.state,0).hand.some(card=>card.uid===chosen),true);
  assert.equal(holder(result.state,0).deck.some(card=>selected.includes(card.uid)),false);
  assert.equal(result.state.core.players[0].grave.filter(card=>selected.includes(card.uid)).length,4);
  assert.deepEqual(hands(result.state),[...beforeHands,chosen].sort());
  assertConserved(result.state,before);assertRules(result.state);
  assert.deepEqual(privateView(result,0).cards.map(card=>card.uid),selected);
  assert.deepEqual(privateView(result,3).cards.map(card=>card.uid),selected);
  assert.equal(privateView(result,2),undefined);
});
test('a selected Spell card is a valid choice and retains its physical identity',()=>{
  const cards=[...SPELLS.slice(0,5),...NORMALS.slice(0,15)];
  const state=create(0,'spell-in-deck',{0:cards}),source=addPainfulChoiceToBackrow(state,0);
  const activation=activate(state,0,1,source);
  const spell=holder(activation.state,0).deck.find(card=>SPELLS.slice(0,5).includes(card.id));
  assert.ok(spell,'at least one Spell should remain in the Deck after initial draw');
  const selected=[spell.uid,...holder(activation.state,0).deck.filter(card=>card.uid!==spell.uid).slice(0,4).map(card=>card.uid)];
  const revealed=reveal(activation,selected),result=resolve(revealed,selected,spell.uid);
  assert.equal(holder(result.state,0).hand.some(card=>card.uid===spell.uid),true);
});
test('exactly five distinct cards from the active Deck must be revealed',()=>{
  const state=create(0,'five-required'),source=addPainfulChoiceToHand(state,0),activation=activate(state,0,1,source);
  const selected=selectFive(activation.state);
  assert.throws(()=>reveal(activation,selected.slice(0,4)),/cinco cartas distintas/);
  assert.throws(()=>reveal(activation,[selected[0],selected[0],...selected.slice(2)]),/cinco cartas distintas/);
});
test('a card outside the active physical Deck cannot be included in the reveal',()=>{
  const state=create(0,'wrong-owner'),source=addPainfulChoiceToHand(state,0),activation=activate(state,0,1,source);
  const selected=selectFive(activation.state);selected[0]=holder(activation.state,1).deck[0].uid;
  assert.throws(()=>reveal(activation,selected),/permanecer no Deck físico/);
});
test('only an opposing physical seat can be selected as the decision maker',()=>{
  const state=create(0,'opponent-seat'),source=addPainfulChoiceToHand(state,0);
  assert.throws(()=>activate(state,0,2,source),/equipe adversária/);
  assert.throws(()=>activate(state,0,4,source),/Evento de Painful Choice inválido/);
});
test('only the active physical seat may activate during the Main Phase',()=>{
  const state=create(0,'priority'),source=addPainfulChoiceToHand(state,0);
  assert.throws(()=>activate(state,2,1,source),/Main Phase/);
  const battle=structuredClone(state);battle.core.phase='battle';
  assert.throws(()=>activate(battle,0,1,source),/Main Phase/);
});
test('activation is rejected when the active physical Deck has fewer than five cards',()=>{
  const state=create(0,'short-deck'),source=addPainfulChoiceToHand(state,0),actor=holder(state,0);
  actor.grave.push(...actor.deck.splice(4));assert.equal(actor.deck.length,4);
  assert.throws(()=>activate(state,0,1,source),/pelo menos cinco cartas/);
});
test('the selected opponent cannot choose a card outside the five-card reveal',()=>{
  const state=create(0,'invalid-choice'),source=addPainfulChoiceToHand(state,0),activation=activate(state,0,1,source);
  const selected=selectFive(activation.state),revealed=reveal(activation,selected),outside=holder(activation.state,0).deck[5].uid;
  assert.throws(()=>resolve(revealed,selected,outside),/não corresponde às cinco cartas/);
});
test('a changed or forged selection cannot satisfy the stored SHA-256 commitment',()=>{
  const state=create(0,'commitment'),source=addPainfulChoiceToHand(state,0),activation=activate(state,0,1,source);
  const selected=selectFive(activation.state),revealed=reveal(activation,selected),changed=[...selected];
  changed[0]=holder(activation.state,0).deck[5].uid;
  assert.throws(()=>resolve(revealed,changed,changed[0]),/não corresponde às cinco cartas/);
});
test('a selected card moved out of the Deck before resolution makes the plan stale',()=>{
  const state=create(0,'stale-deck'),source=addPainfulChoiceToHand(state,0),activation=activate(state,0,1,source);
  const selected=selectFive(activation.state),revealed=reveal(activation,selected),changed=structuredClone(revealed.state);
  const actor=holder(changed,0),index=actor.deck.findIndex(card=>card.uid===selected[0]);
  actor.grave.push(actor.deck.splice(index,1)[0]);
  assert.throws(()=>resolvePainfulChoice(changed,revealed.plan,selected,selected[1]),/saiu do Deck/);
});
test('negation sends only the Spell to the Graveyard and never reveals or moves the five cards',()=>{
  const state=create(0,'negated'),source=addPainfulChoiceToHand(state,0),activation=activate(state,0,1,source);
  const deckBefore=holder(activation.state,0).deck.map(card=>card.uid),handBefore=holder(activation.state,0).hand.map(card=>card.uid);
  const result=resolvePainfulChoice(activation.state,activation.plan,undefined,undefined,true);
  assert.equal(result.status,'negated');assert.equal(privateView(result,0),undefined);
  assert.deepEqual(holder(result.state,0).deck.map(card=>card.uid),deckBefore);
  assert.deepEqual(holder(result.state,0).hand.map(card=>card.uid),handBefore);
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid===source),true);
});
test('the same activation cannot be revealed twice or resolved twice',()=>{
  const state=create(0,'duplicate'),source=addPainfulChoiceToHand(state,0),activation=activate(state,0,1,source);
  const selected=selectFive(activation.state),revealed=reveal(activation,selected);
  assert.throws(()=>revealPainfulChoice(revealed.state,revealed.plan,selected),/já revelou/);
  const first=resolve(revealed,selected,selected[0]);
  const second=resolvePainfulChoice(first.state,revealed.plan,selected,selected[0]);
  assert.equal(second.status,'duplicate');assert.equal(second.state,first.state);assert.equal(privateView(second,0),undefined);
});
test('the same activation ID cannot be registered twice on its updated state',()=>{
  const state=create(0,'activation-id'),source=addPainfulChoiceToHand(state,0),id='m645:fixed-activation';
  const activation=activate(state,0,1,source,id);
  assert.throws(()=>activate(activation.state,0,1,source,id),/já foi registrada/);
});
test('a source Set by the opposing team cannot be activated through the shared field',()=>{
  const state=create(0,'wrong-source-team'),source=addPainfulChoiceToBackrow(state,1);
  assert.throws(()=>activate(state,0,1,source),/equipe adversária/);
});
test('private revealed card identities never enter the public duel projection or log',()=>{
  const state=create(0,'public-view'),source=addPainfulChoiceToHand(state,0),activation=activate(state,0,1,source);
  const selected=selectFive(activation.state),revealed=reveal(activation,selected),result=resolve(revealed,selected,selected[0]);
  const publicCandidate=structuredClone(result.state);
  publicCandidate.core.players[0].grave=publicCandidate.core.players[0].grave.filter(card=>card.uid!==source);
  const publicView=tag.publicTagDuel(publicCandidate);
  for(const uid of selected)assert.equal(JSON.stringify(publicView).includes(uid),false);
  assert.equal(JSON.stringify(result.state.core.log).includes(selected[0]),false);
});
test('Painful Choice preserves the original input and conserves every physical UID',()=>{
  const state=create(0,'conservation'),source=addPainfulChoiceToHand(state,0),before=inventory(state),original=JSON.stringify(state);
  const activation=activate(state,0,1,source),selected=selectFive(activation.state),revealed=reveal(activation,selected);
  const result=resolve(revealed,selected,selected[4]);
  assert.equal(JSON.stringify(state),original);assertConserved(result.state,before);assertRules(result.state);
});
test('a forged plan cannot change the actor, target, or physical source owner',()=>{
  const state=create(0,'forged-plan'),source=addPainfulChoiceToHand(state,0),activation=activate(state,0,1,source);
  assert.throws(()=>revealPainfulChoice(activation.state,{...activation.plan,targetSeat:3},selectFive(activation.state)),/Plano de Painful Choice/);
});
