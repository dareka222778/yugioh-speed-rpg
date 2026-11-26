'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel.js');
const {getPlayableCard,enabledCardIds,getDuelCard}=require('../dist/effectRegistry.js');
const {rulesFor}=require('../dist/rulesProfile.js');
const {
  MIND_HAXORZ_ID,
  activateMindHaxorz,
  resolveMindHaxorz,
  privateMindHaxorzRevealForSeat
}=require('../dist/mindHaxorzTagAdapter.js');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20,'the normal-monster pool must build four physical 20-card decks');
let sequence=0;
function deck(){return NORMALS.slice(0,20);}
function member(seat){return 'm641-seat-'+seat;}
function create(first=0,seed='default',extraBySeat={}){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M641 Seat '+seat,cards:deck(),extra:[...(extraBySeat[seat]||[])]
  })),{classic:true,first,seed:'m641-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function addMindHaxorz(state,seat,{setTurn=0}={}){
  const uid='m'+seat+':m641-mind-haxorz-'+(++sequence);
  state.core.players[seat%2].backrow.push({uid,id:MIND_HAXORZ_ID,setTurn,faceUp:false});
  return uid;
}
function addSetMonster(state,seat){
  const card=holder(state,seat).hand.shift();
  state.core.players[seat%2].monsters.push({
    ...card,position:'def',faceUp:false,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  });
  return card.uid;
}
function addSetBackrow(state,seat){
  const card=holder(state,seat).hand.shift();
  state.core.players[seat%2].backrow.push({...card,setTurn:0,faceUp:false});
  return card.uid;
}
function addSetField(state,seat){
  const card=holder(state,seat).hand.shift();
  state.core.players[seat%2].field={...card,setTurn:0,faceUp:false,resolved:false};
  return card.uid;
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
    activationId:activationId??'m641:'+state.core.turn+':'+sourceUid+':'+(++sequence),
    actorSeat,targetSeat,sourceUid
  };
}
function activate(state,actorSeat,targetSeat,sourceUid,activationId){
  return activateMindHaxorz(state,event(state,actorSeat,targetSeat,sourceUid,activationId));
}

test('Mind Haxorz remains outside the playable catalogue and certification allowlist',()=>{
  assert.equal(getPlayableCard(MIND_HAXORZ_ID),undefined);
  assert.equal(enabledCardIds.includes(MIND_HAXORZ_ID),false);
});

test('only the activating seat sees the chosen opposing hand and every Set card on the shared field',()=>{
  const state=create(0,'private-inspection');
  const source=addMindHaxorz(state,0);
  const setMonster=addSetMonster(state,1);
  const setBackrow=addSetBackrow(state,3);
  const setField=addSetField(state,1);
  const targetHand=holder(state,1).hand.map(card=>({uid:card.uid,id:card.id,ownerSeat:1}));
  const before=inventory(state),beforeHands=hands(state),beforeLog=JSON.stringify(state.core.log);
  const activation=activate(state,0,1,source);
  assert.equal(activation.status,'activated');
  assert.equal(activation.state.core.players[0].lp,state.core.players[0].lp-500);
  const result=resolveMindHaxorz(activation.state,activation.plan);
  assert.equal(result.status,'resolved');
  const view=privateMindHaxorzRevealForSeat(result,0);
  assert.deepEqual(view.hand,targetHand);
  assert.deepEqual(view.setCards.map(card=>card.uid).sort(),[setMonster,setBackrow,setField].sort());
  assert.deepEqual(view.setCards.map(card=>card.zone).sort(),['backrow','field','monster']);
  assert.equal(privateMindHaxorzRevealForSeat(result,2),undefined,'the actor partner must not see the inspection');
  assert.equal(privateMindHaxorzRevealForSeat(result,1),undefined,'the selected opponent must not receive the inspection');
  assert.equal(privateMindHaxorzRevealForSeat(result,3),undefined,'the other opponent must not receive the inspection');
  assert.equal(Object.keys(result).includes('privateReceipt'),false);
  assert.equal(JSON.stringify(result).includes('"privateReceipt"'),false);
  assert.equal(JSON.stringify(result.state.core.log),beforeLog,'private identities must not enter the public duel log');
  assert.deepEqual(hands(result.state),beforeHands,'inspection must not move any card from a hand');
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid===source),true,'the Trap goes to the shared Graveyard');
  assertConserved(result.state,before);
  assertRules(result.state);
  const publicCandidate=structuredClone(result.state);
  publicCandidate.core.players[0].grave=publicCandidate.core.players[0].grave.filter(card=>card.uid!==source);
  const publicView=tag.publicTagDuel(publicCandidate);
  for(const card of [...targetHand,...view.setCards]){
    assert.equal(JSON.stringify(publicView).includes(card.id),false,'public projection leaked hidden card identity '+card.id);
    assert.equal(JSON.stringify(publicView).includes(card.uid),false,'public projection leaked hidden UID '+card.uid);
  }
});

test('the effect can inspect either opposing physical hand, including the inactive opponent partner',()=>{
  const state=create(0,'inactive-opponent');
  const source=addMindHaxorz(state,0);
  const targetSeat=3;
  assert.notEqual(state.active[1],targetSeat);
  const expected=holder(state,targetSeat).hand.map(card=>card.uid).sort();
  const activation=activate(state,0,targetSeat,source);
  const result=resolveMindHaxorz(activation.state,activation.plan);
  assert.deepEqual(privateMindHaxorzRevealForSeat(result,0).hand.map(card=>card.uid).sort(),expected);
  assert.equal(privateMindHaxorzRevealForSeat(result,2),undefined);
});

test('an active partner may activate a previously Set Trap owned by the inactive teammate',()=>{
  const state=create(2,'partner-set');
  const source=addMindHaxorz(state,0);
  const activation=activate(state,2,1,source);
  assert.equal(activation.plan.sourceOwnerSeat,0);
  assert.equal(activation.plan.actorSeat,2);
  assert.equal(activation.state.core.players[0].lp,state.core.players[0].lp-500);
  const target=holder(state,1).hand[0];
  const result=resolveMindHaxorz(activation.state,activation.plan);
  assert.equal(privateMindHaxorzRevealForSeat(result,2).hand.some(card=>card.uid===target.uid),true);
  assert.equal(privateMindHaxorzRevealForSeat(result,0),undefined,'the physical owner is not automatically the recipient');
});

test('the 500 LP cost is paid at activation and remains paid when the effect is negated',()=>{
  const state=create(0,'negated');
  const source=addMindHaxorz(state,0);
  const before=inventory(state);
  const activation=activate(state,0,1,source);
  const result=resolveMindHaxorz(activation.state,activation.plan,true);
  assert.equal(result.status,'negated');
  assert.equal(result.state.core.players[0].lp,state.core.players[0].lp-500);
  assert.equal(result.privateReceipt,undefined);
  assert.equal(privateMindHaxorzRevealForSeat(result,0),undefined);
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid===source),true);
  assertConserved(result.state,before);
});

test('paying the last 500 LP ends the duel before the inspection can resolve',()=>{
  const state=create(0,'zero-lp');
  state.core.players[0].lp=500;
  const source=addMindHaxorz(state,0);
  const activation=activate(state,0,1,source);
  assert.equal(activation.status,'lost-to-cost');
  assert.equal(activation.state.core.players[0].lp,0);
  assert.equal(activation.state.core.phase,'finished');
  assert.equal(activation.state.core.winner,activation.state.core.players[1].id);
  assert.equal(activation.state.core.reason,'Life Points');
});

test('insufficient LP, same-turn Set, inactive actor, teammate target and non-Set source are rejected',()=>{
  const state=create(0,'invalid');
  const source=addMindHaxorz(state,0);
  assert.throws(()=>activate(state,0,2,source),/equipe adversária/);
  assert.throws(()=>activate(state,2,1,source),/prioridade aberta/);
  const low=structuredClone(state);low.core.players[0].lp=499;
  assert.throws(()=>activate(low,0,1,source),/PV insuficientes/);
  const sameTurn=structuredClone(state);
  const sameTurnSource=addMindHaxorz(sameTurn,0,{setTurn:sameTurn.core.turn});
  assert.throws(()=>activate(sameTurn,0,1,sameTurnSource),/mesmo turno/);
  const faceUp=structuredClone(state);
  faceUp.core.players[0].backrow.find(card=>card.uid===source).faceUp=true;
  assert.throws(()=>activate(faceUp,0,1,source),/face para cima/);
  const wrongPhase=structuredClone(state);wrongPhase.core.phase='response';
  assert.throws(()=>activate(wrongPhase,0,1,source),/prioridade aberta/);
  const wrongChain=structuredClone(state);wrongChain.core.chain.push({actor:0,card:'x',id:'x',target:''});
  assert.throws(()=>activate(wrongChain,0,1,source),/prioridade aberta/);
  assert.throws(()=>activate(state,0,1,'m1:foreign'));
});

test('activation IDs prevent repeated payment and resolution IDs prevent duplicate reveals',()=>{
  const state=create(0,'idempotent');
  const source=addMindHaxorz(state,0);
  const activationId='m641:idempotent:'+source;
  const activation=activate(state,0,1,source,activationId);
  assert.throws(()=>activate(activation.state,0,1,source,activationId),/já foi registrada/);
  const first=resolveMindHaxorz(activation.state,activation.plan);
  const duplicate=resolveMindHaxorz(first.state,activation.plan);
  assert.equal(duplicate.status,'duplicate');
  assert.equal(duplicate.privateReceipt,undefined);
  assert.equal(privateMindHaxorzRevealForSeat(duplicate,0),undefined);
  assert.equal(duplicate.state.core.players[0].grave.filter(card=>card.uid===source).length,1);
});

test('resolution rejects a forged target/source plan instead of trusting a client-supplied activation object',()=>{
  const state=create(0,'forged-plan');
  const source=addMindHaxorz(state,0);
  const activation=activate(state,0,1,source);
  const forged={...activation.plan,targetSeat:3};
  assert.throws(()=>resolveMindHaxorz(activation.state,forged),/registro imutável/);
  const forgedSource={...activation.plan,sourceUid:'m0:forged-source'};
  assert.throws(()=>resolveMindHaxorz(activation.state,forgedSource),/registro imutável/);
  const valid=resolveMindHaxorz(activation.state,activation.plan);
  assert.equal(valid.status,'resolved');
  assert.ok(privateMindHaxorzRevealForSeat(valid,0));
});

test('a Trap removed from the field after activation does not prevent its already activated effect from resolving',()=>{
  const state=create(0,'source-removed');
  const source=addMindHaxorz(state,0);
  const activation=activate(state,0,1,source);
  const interrupted=structuredClone(activation.state);
  const index=interrupted.core.players[0].backrow.findIndex(card=>card.uid===source);
  const [removed]=interrupted.core.players[0].backrow.splice(index,1);
  interrupted.core.players[0].banished.push(removed);
  const result=resolveMindHaxorz(interrupted,activation.plan);
  assert.equal(result.status,'resolved');
  assert.ok(privateMindHaxorzRevealForSeat(result,0));
  assert.equal(result.state.core.players[0].banished.some(card=>card.uid===source),true);
});

test('a 7-card hand remains intact until the engine End Phase discard',()=>{
  const state=create(0,'hand-limit');
  const source=addMindHaxorz(state,0);
  const actor=holder(state,0);
  while(actor.hand.length<7)actor.hand.push(actor.deck.shift());
  const before=hands(state);
  const activation=activate(state,0,1,source);
  const result=resolveMindHaxorz(activation.state,activation.plan);
  assert.equal(holder(result.state,0).hand.length,7);
  assert.deepEqual(hands(result.state),before);
  assert.equal(result.state.core.phase,'main');
  assert.equal(result.state.core.handFlow,undefined);
  assertRules(result.state);
});

test('three shared Monster Zones and three shared S/T Zones remain hard limits while the Field Zone stays independent',()=>{
  const state=create(0,'zone-limits');
  for(let i=0;i<3;i++)addSetMonster(state,1);
  for(let i=0;i<3;i++)addSetBackrow(state,3);
  const source=addMindHaxorz(state,0);
  assert.ok(activate(state,0,1,source));
  const fourth=structuredClone(state);
  const extra=holder(fourth,1).hand.shift();
  fourth.core.players[1].monsters.push({
    ...extra,position:'def',faceUp:false,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  });
  assert.throws(()=>activate(fourth,0,1,source),/três Monster Zones/);
});

test('Main Deck 20–30 and Extra Deck maximum 5 remain physical-seat limits',()=>{
  const FUSIONS=[...new Set(enabledCardIds.filter(id=>getDuelCard(id)?.fusion))];
  assert.ok(FUSIONS.length>=6,'fixture requires six enabled Fusion cards');
  const valid=create(0,'extra-five',{2:FUSIONS.slice(0,5)});
  const source=addMindHaxorz(valid,0);
  assert.ok(activate(valid,0,1,source));
  const invalid=structuredClone(valid);
  invalid.reserves['2'].extra.push({uid:'m2:m641-extra-sixth',id:FUSIONS[5]});
  assert.throws(()=>activateMindHaxorz(invalid,event(invalid,0,1,source)),/Extra Deck físico excedeu cinco/);
  const short=structuredClone(valid);
  short.reserves['2'].deck.pop();
  assert.throws(()=>activateMindHaxorz(short,event(short,0,1,source)),/Deck principal físico fora do limite 20–30/);
});
