'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel.js');
const {getPlayableCard,enabledCardIds,getDuelCard}=require('../dist/effectRegistry.js');
const {rulesFor}=require('../dist/rulesProfile.js');
const {
  THE_FORCEFUL_SENTRY_ID,
  activateForcefulSentry,
  resolveForcefulSentry,
  privateForcefulSentryRevealForSeat
}=require('../dist/forcefulSentryTagAdapter.js');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
const SPELLS=[...new Set(enabledCardIds.filter(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.fusion&&!getDuelCard(id)?.field))];
const FUSIONS=[...new Set(enabledCardIds.filter(id=>getDuelCard(id)?.fusion))];
assert.ok(NORMALS.length>=20,'fixtures need four physical 20-card decks');
assert.ok(SPELLS.length>=1,'fixtures need an enabled Spell to test any-card selection');
assert.ok(FUSIONS.length>=1,'fixtures need a Fusion to test Extra Deck return');
let sequence=0;
function deck(){return NORMALS.slice(0,20);}
function member(seat){return 'm643-seat-'+seat;}
function create(first=0,seed='default',extraBySeat={},cardsBySeat={}){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M643 Seat '+seat,
    cards:[...(cardsBySeat[seat]||deck())],
    extra:[...(extraBySeat[seat]||[])]
  })),{classic:true,first,seed:'m643-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function addSentryToHand(state,seat){
  const uid='m'+seat+':m643-forceful-sentry-'+(++sequence);
  holder(state,seat).hand.push({uid,id:THE_FORCEFUL_SENTRY_ID});
  return uid;
}
function addSentryToBackrow(state,seat,{faceUp=false,setTurn=0}={}){
  const uid='m'+seat+':m643-forceful-sentry-'+(++sequence);
  state.core.players[seat%2].backrow.push({uid,id:THE_FORCEFUL_SENTRY_ID,faceUp,setTurn});
  return uid;
}
function moveFromDeckToHand(state,seat,id){
  const held=holder(state,seat);
  const index=held.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'requested fixture card must be in the physical Deck');
  const [card]=held.deck.splice(index,1);
  held.hand.push(card);
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
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(rules.extraDeckMax,5);
  for(const player of state.core.players){
    assert.ok(player.monsters.length<=3);
    assert.ok(player.backrow.length<=3);
  }
}
function event(state,actorSeat,targetSeat,sourceUid,activationId){
  return {
    activationId:activationId??'m643:'+state.core.turn+':'+sourceUid+':'+(++sequence),
    actorSeat,targetSeat,sourceUid
  };
}
function activate(state,actorSeat,targetSeat,sourceUid,activationId){
  return activateForcefulSentry(state,event(state,actorSeat,targetSeat,sourceUid,activationId));
}
function selectedMonster(state,seat){
  const card=holder(state,seat).hand.find(item=>getDuelCard(item.id)?.kind==='monster');
  assert.ok(card);
  return card;
}

test('The Forceful Sentry remains outside the playable catalogue and certification allowlist',()=>{
  assert.equal(getPlayableCard(THE_FORCEFUL_SENTRY_ID),undefined);
  assert.equal(enabledCardIds.includes(THE_FORCEFUL_SENTRY_ID),false);
});

test('activation from hand places the same physical Spell face-up in the shared backrow',()=>{
  const state=create(0,'hand-source');
  const source=addSentryToHand(state,0);
  const before=inventory(state);
  const activation=activate(state,0,1,source);
  assert.equal(activation.status,'activated');
  assert.equal(holder(activation.state,0).hand.some(card=>card.uid===source),false);
  const field=activation.state.core.players[0].backrow.find(card=>card.uid===source);
  assert.ok(field);
  assert.equal(field.faceUp,true);
  assert.equal(activation.plan.sourceLocation,'hand');
  assertConserved(activation.state,before);
  assertRules(activation.state);
  assert.equal(holder(state,0).hand.some(card=>card.uid===source),true,'activation must not mutate the input snapshot');
});

test('a previously Set Spell can be activated in the same turn; Trap-only set delay is not applied',()=>{
  const state=create(0,'same-turn-set');
  const source=addSentryToBackrow(state,0,{setTurn:state.core.turn});
  const activation=activate(state,0,3,source);
  assert.equal(activation.plan.sourceLocation,'backrow');
  assert.equal(activation.state.core.players[0].backrow.find(card=>card.uid===source).faceUp,true);
});

test('a teammate-owned Set Spell may be activated from the shared field while its owner UID is preserved',()=>{
  const state=create(0,'teammate-set');
  const source=addSentryToBackrow(state,2,{setTurn:state.core.turn});
  const activation=activate(state,0,1,source);
  assert.equal(activation.plan.sourceOwnerSeat,2);
  assert.equal(activation.state.core.players[0].backrow.find(card=>card.uid===source).uid,'m2:'+source.split(':')[1]);
});

test('only the activating physical seat receives the inspected hand; a selected monster returns to its owner Deck and shuffles',()=>{
  const state=create(0,'private-monster');
  const source=addSentryToHand(state,0);
  const targetSeat=3;
  const target=holder(state,targetSeat);
  const selected=selectedMonster(state,targetSeat);
  const before=inventory(state),beforeHands=hands(state),beforeLog=JSON.stringify(state.core.log);
  const counterBefore=state.core.random.counter;
  const activation=activate(state,0,targetSeat,source);
  const result=resolveForcefulSentry(activation.state,activation.plan,selected.uid);
  assert.equal(result.status,'resolved');
  const reveal=privateForcefulSentryRevealForSeat(result,0);
  assert.equal(reveal.targetSeat,targetSeat);
  assert.equal(reveal.hand.some(card=>card.uid===selected.uid&&card.id===selected.id),true);
  assert.deepEqual(reveal.selectedCard,{uid:selected.uid,id:selected.id,ownerSeat:3});
  assert.equal(privateForcefulSentryRevealForSeat(result,2),undefined,'actor partner must not see the hand');
  assert.equal(privateForcefulSentryRevealForSeat(result,1),undefined,'target must not receive the hand');
  assert.equal(privateForcefulSentryRevealForSeat(result,3),undefined,'target partner must not receive the hand');
  assert.equal(holder(result.state,3).hand.some(card=>card.uid===selected.uid),false);
  assert.equal(holder(result.state,3).deck.some(card=>card.uid===selected.uid),true);
  assert.ok(result.state.core.random.counter>counterBefore,'Main Deck return must use persisted duel RNG');
  assertConserved(result.state,before);
  assert.deepEqual(hands(result.state),beforeHands.filter(uid=>uid!==selected.uid));
  assert.equal(JSON.stringify(result.state.core.log),beforeLog);
  assert.equal(Object.keys(result).includes('privateReceipt'),false);
  assertRules(result.state);
});

test('any card type may be selected, including a Spell; the card returns to the physical owner Main Deck',()=>{
  const state=create(0,'spell-return');
  const source=addSentryToBackrow(state,0);
  const spell=moveFromDeckToHand(state,3,SPELLS[0]);
  const activation=activate(state,0,3,source);
  const result=resolveForcefulSentry(activation.state,activation.plan,spell.uid);
  assert.equal(holder(result.state,3).deck.some(card=>card.uid===spell.uid),true);
  assert.equal(holder(result.state,3).hand.some(card=>card.uid===spell.uid),false);
  assert.deepEqual(privateForcefulSentryRevealForSeat(result,0).selectedCard,{uid:spell.uid,id:spell.id,ownerSeat:3});
  assertRules(result.state);
});

test('a Fusion card returns to its physical owner Extra Deck, never the Main Deck',()=>{
  const state=create(0,'fusion-return',{3:FUSIONS.slice(0,5)});
  const source=addSentryToBackrow(state,0);
  const target=holder(state,3);
  const fusion=target.extra.pop();
  target.hand.push(fusion);
  const activation=activate(state,0,3,source);
  const result=resolveForcefulSentry(activation.state,activation.plan,fusion.uid);
  assert.equal(holder(result.state,3).extra.some(card=>card.uid===fusion.uid),true);
  assert.equal(holder(result.state,3).deck.some(card=>card.uid===fusion.uid),false);
  assert.equal(privateForcefulSentryRevealForSeat(result,0).selectedCard.id,fusion.id);
  assertRules(result.state);
});

test('an empty opposing hand resolves without a selection or an RNG shuffle',()=>{
  const state=create(0,'empty-hand');
  const source=addSentryToHand(state,0);
  const target=holder(state,1);
  target.deck.push(...target.hand.splice(0));
  const activation=activate(state,0,1,source);
  const counter=activation.state.core.random.counter;
  const result=resolveForcefulSentry(activation.state,activation.plan,undefined);
  assert.equal(result.status,'resolved');
  assert.deepEqual(privateForcefulSentryRevealForSeat(result,0).hand,[]);
  assert.equal(privateForcefulSentryRevealForSeat(result,0).selectedCard,undefined);
  assert.equal(result.state.core.random.counter,counter);
  assertRules(result.state);
});

test('a non-empty hand requires exactly one selected physical UID',()=>{
  const state=create(0,'required-selection');
  const source=addSentryToHand(state,0);
  const activation=activate(state,0,1,source);
  assert.throws(()=>resolveForcefulSentry(activation.state,activation.plan,undefined),/Escolha uma carta/);
});

test('a stale or forged target UID is rejected without mutating the activated snapshot',()=>{
  const state=create(0,'stale-selection');
  const source=addSentryToHand(state,0);
  const activation=activate(state,0,1,source);
  const before=JSON.stringify(activation.state);
  assert.throws(()=>resolveForcefulSentry(activation.state,activation.plan,'m1:not-in-hand'),/saiu da mão/);
  assert.equal(JSON.stringify(activation.state),before);
  const forged={...activation.plan,targetSeat:3};
  assert.throws(()=>resolveForcefulSentry(activation.state,forged,undefined),/Plano de The Forceful Sentry/);
});

test('negation sends the activated Spell to the Graveyard without inspecting or shuffling the target hand',()=>{
  const state=create(0,'negated');
  const source=addSentryToHand(state,0);
  const targetCard=selectedMonster(state,1);
  const activation=activate(state,0,1,source);
  const counter=activation.state.core.random.counter;
  const result=resolveForcefulSentry(activation.state,activation.plan,undefined,true);
  assert.equal(result.status,'negated');
  assert.equal(privateForcefulSentryRevealForSeat(result,0),undefined);
  assert.equal(holder(result.state,1).hand.some(card=>card.uid===targetCard.uid),true);
  assert.equal(result.state.core.random.counter,counter);
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid===source),true);
});

test('a negated activation cannot smuggle a selected card UID into the resolver',()=>{
  const state=create(0,'negated-with-choice');
  const source=addSentryToHand(state,0);
  const activation=activate(state,0,1,source);
  const targetCard=selectedMonster(activation.state,1);
  assert.throws(()=>resolveForcefulSentry(activation.state,activation.plan,targetCard.uid,true),/ativação negada/);
});

test('the same activation cannot be resolved twice; duplicate resolution is idempotent',()=>{
  const state=create(0,'duplicate');
  const source=addSentryToHand(state,0);
  const selected=selectedMonster(state,1);
  const activation=activate(state,0,1,source);
  const first=resolveForcefulSentry(activation.state,activation.plan,selected.uid);
  const second=resolveForcefulSentry(first.state,activation.plan,selected.uid);
  assert.equal(second.status,'duplicate');
  assert.equal(second.state,first.state);
  assert.equal(privateForcefulSentryRevealForSeat(second,0),undefined);
});

test('the chosen physical hand is one of the two opposing seats; a teammate hand is rejected',()=>{
  const state=create(0,'opponent-seat');
  const source=addSentryToHand(state,0);
  assert.throws(()=>activate(state,0,2,source),/equipe adversária/);
  assert.throws(()=>activate(state,0,4,source),/Evento de The Forceful Sentry inválido/);
});

test('only the active seat may activate and the effect is Main-Phase only',()=>{
  const state=create(0,'priority');
  const source=addSentryToHand(state,0);
  const wrongSeat=addSentryToHand(state,2);
  assert.throws(()=>activate(state,2,1,wrongSeat),/Main Phase/);
  const battle=structuredClone(state);
  battle.core.phase='battle';
  assert.throws(()=>activate(battle,0,1,source),/Main Phase/);
});

test('a full shared Spell/Trap backrow prevents activating the Spell from hand',()=>{
  const state=create(0,'full-backrow');
  const source=addSentryToHand(state,0);
  for(let i=0;i<3;i++)state.core.players[0].backrow.push({
    uid:'m0:m643-filler-'+i,id:NORMALS[i],faceUp:false,setTurn:0
  });
  assert.throws(()=>activate(state,0,1,source),/Zona de Magias\/Armadilhas livre/);
});

test('the private receipt is transient, non-enumerable, and never added to public JSON or duel logs',()=>{
  const state=create(0,'privacy');
  const source=addSentryToHand(state,0);
  const selected=selectedMonster(state,1);
  const activation=activate(state,0,1,source);
  const result=resolveForcefulSentry(activation.state,activation.plan,selected.uid);
  assert.equal(Object.prototype.propertyIsEnumerable.call(result,'privateReceipt'),false);
  assert.equal(JSON.stringify(result).includes(selected.id),false);
  assert.equal(JSON.stringify(result).includes(selected.uid),false);
  assert.equal(JSON.stringify(result.state.core.log).includes(selected.id),false);
  assert.equal(JSON.stringify(result.state.core.log).includes(selected.uid),false);
});

test('activation IDs are single-use and cannot be registered twice',()=>{
  const state=create(0,'activation-id');
  const source=addSentryToHand(state,0);
  const activationId='m643:fixed-activation';
  activate(state,0,1,source,activationId);
  assert.throws(()=>activate(state,0,1,source,activationId),/já foi registrada/);
});

test('the adapter preserves the original input and conserves every physical UID across resolution',()=>{
  const state=create(0,'immutable');
  const source=addSentryToHand(state,0);
  const selected=selectedMonster(state,3);
  const before=inventory(state);
  const original=JSON.stringify(state);
  const activation=activate(state,0,3,source);
  const result=resolveForcefulSentry(activation.state,activation.plan,selected.uid);
  assert.equal(JSON.stringify(state),original);
  assertConserved(result.state,before);
  assertRules(result.state);
});

test('a source card owned by the opposing team cannot be activated through a forged team field',()=>{
  const state=create(0,'wrong-source-team');
  const source=addSentryToBackrow(state,1);
  assert.throws(()=>activate(state,0,3,source),/equipe adversária/);
});
