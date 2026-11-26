'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel.js');
const {getPlayableCard,enabledCardIds,getDuelCard}=require('../dist/effectRegistry.js');
const {rulesFor}=require('../dist/rulesProfile.js');
const {
  THE_INEXPERIENCED_SPY_ID,
  planInexperiencedSpy,
  resolveInexperiencedSpy,
  privateSpyRevealForSeat
}=require('../dist/inexperiencedSpyTagAdapter.js');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20,'the normal-monster pool must build four physical 20-card decks');
let sequence=0;
function deck(){return NORMALS.slice(0,20);}
function member(seat){return 'm640-seat-'+seat;}
function create(first=0,seed='default',extraBySeat={}){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M640 Seat '+seat,cards:deck(),extra:[...(extraBySeat[seat]||[])]
  })),{classic:true,first,seed:'m640-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function addSpy(state,seat,{zone='hand'}={}){
  const uid='m'+seat+':m640-spy-'+(++sequence);
  const card={uid,id:THE_INEXPERIENCED_SPY_ID};
  if(zone==='hand')holder(state,seat).hand.push(card);
  else state.core.players[seat%2].backrow.push({...card,setTurn:state.core.turn,faceUp:false});
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
function plan(state,actorSeat,targetSeat,sourceUid){
  return planInexperiencedSpy(state,{
    activationId:'m640:'+state.core.turn+':'+sourceUid+':'+(++sequence),
    actorSeat,targetSeat,sourceUid
  });
}

test('The Inexperienced Spy remains outside the catalog and certification allowlist',()=>{
  assert.equal(getPlayableCard(THE_INEXPERIENCED_SPY_ID),undefined);
});

test('only the activating physical seat receives the selected opponent card identity',()=>{
  const state=create(0,'private-seat');
  const source=addSpy(state,0);
  const targetSeat=1;
  const targetCard=holder(state,targetSeat).hand[0];
  const before=inventory(state),beforeHands=hands(state),beforeLog=JSON.stringify(state.core.log);
  const planned=plan(state,0,targetSeat,source);
  const result=resolveInexperiencedSpy(state,planned,targetCard.uid);
  assert.equal(result.status,'resolved');
  const privateView=privateSpyRevealForSeat(result,0);
  assert.equal(privateView.recipientSeat,0);
  assert.equal(privateView.targetSeat,targetSeat);
  assert.equal(privateView.cardUid,targetCard.uid);
  assert.equal(privateView.cardId,targetCard.id);
  assert.equal(privateSpyRevealForSeat(result,2),undefined,'the actor partner must not see the card');
  assert.equal(privateSpyRevealForSeat(result,1),undefined,'the target must not receive the reveal');
  assert.equal(privateSpyRevealForSeat(result,3),undefined,'the other opponent must not receive the reveal');
  assert.equal(Object.keys(result).includes('privateReceipt'),false,'private receipt must be non-enumerable');
  assert.equal(JSON.stringify(result).includes('"privateReceipt"'),false);
  assert.equal(JSON.stringify(result.state.core.log),beforeLog,'the card identity must not enter the public duel log');
  assert.equal(holder(result.state,targetSeat).hand.some(c=>c.uid===targetCard.uid),true,'the selected card remains in hand');
  assert.equal(result.state.core.players[0].grave.some(c=>c.uid===source),true,'the Normal Spell goes to the shared Graveyard');
  assert.deepEqual(hands(result.state),beforeHands.filter(uid=>uid!==source));
  assertConserved(result.state,before);
  assertRules(result.state);
});

test('the active player can inspect either opposing physical hand, including the inactive opponent partner',()=>{
  const state=create(0,'inactive-opponent');
  const source=addSpy(state,0);
  const targetSeat=3;
  assert.notEqual(state.active[1],targetSeat);
  const targetCard=holder(state,targetSeat).hand[0];
  const result=resolveInexperiencedSpy(state,plan(state,0,targetSeat,source),targetCard.uid);
  assert.equal(privateSpyRevealForSeat(result,0).cardId,targetCard.id);
  assert.equal(privateSpyRevealForSeat(result,2),undefined);
});

test('the chosen card belongs to the selected physical hand and is never moved',()=>{
  const state=create(0,'physical-target');
  const source=addSpy(state,0);
  const targetA=holder(state,1).hand[0];
  const targetB=holder(state,3).hand[0];
  const planned=plan(state,0,1,source);
  assert.throws(()=>resolveInexperiencedSpy(state,planned,targetB.uid),/mão física adversária selecionada/);
  const result=resolveInexperiencedSpy(state,planned,targetA.uid);
  assert.equal(holder(result.state,1).hand.some(c=>c.uid===targetA.uid),true);
  assert.equal(holder(result.state,3).hand.some(c=>c.uid===targetB.uid),true);
});

test('a set Spy owned by the inactive teammate can be activated by the active partner',()=>{
  const state=create(2,'partner-set');
  const source=addSpy(state,0,{zone:'backrow'});
  const targetCard=holder(state,1).hand[0];
  const result=resolveInexperiencedSpy(state,plan(state,2,1,source),targetCard.uid);
  assert.equal(result.status,'resolved');
  assert.equal(inventory(result.state).get(source),THE_INEXPERIENCED_SPY_ID);
  assert.equal(result.state.core.players[0].grave.some(c=>c.uid===source),true);
  assert.equal(privateSpyRevealForSeat(result,2).cardId,targetCard.id);
  assert.equal(privateSpyRevealForSeat(result,0),undefined,'physical owner is not the activating seat');
});

test('a negated activation consumes the Spell but produces no private reveal',()=>{
  const state=create(0,'negated');
  const source=addSpy(state,0);
  const targetCard=holder(state,1).hand[0];
  const before=inventory(state);
  const result=resolveInexperiencedSpy(state,plan(state,0,1,source),undefined,true);
  assert.equal(result.status,'negated');
  assert.equal(result.privateReceipt,undefined);
  assert.equal(privateSpyRevealForSeat(result,0),undefined);
  assert.equal(holder(result.state,1).hand.some(c=>c.uid===targetCard.uid),true);
  assert.equal(result.state.core.players[0].grave.some(c=>c.uid===source),true);
  assertConserved(result.state,before);
});

test('activation receipts make resolution idempotent and never reveal twice',()=>{
  const state=create(0,'idempotent');
  const source=addSpy(state,0);
  const targetCard=holder(state,1).hand[0];
  const planned=plan(state,0,1,source);
  const first=resolveInexperiencedSpy(state,planned,targetCard.uid);
  const duplicate=resolveInexperiencedSpy(first.state,planned,targetCard.uid);
  assert.equal(duplicate.status,'duplicate');
  assert.equal(duplicate.privateReceipt,undefined);
  assert.equal(privateSpyRevealForSeat(duplicate,0),undefined);
  assert.equal(duplicate.state.core.players[0].grave.filter(c=>c.uid===source).length,1);
});

test('invalid teammate target, inactive actor, wrong phase, empty target hand and foreign source are rejected',()=>{
  const state=create(0,'invalid');
  const source=addSpy(state,0);
  const event={activationId:'m640:invalid',actorSeat:0,targetSeat:1,sourceUid:source};
  assert.throws(()=>planInexperiencedSpy(state,{...event,targetSeat:2}),/equipe adversária/);
  assert.throws(()=>planInexperiencedSpy(state,{...event,actorSeat:2}),/Main Phase/);
  assert.throws(()=>planInexperiencedSpy(state,{...event,sourceUid:'m1:foreign'}));
  const wrongPhase=structuredClone(state);wrongPhase.core.phase='battle';
  assert.throws(()=>planInexperiencedSpy(wrongPhase,event));
  const empty=structuredClone(state);holder(empty,1).hand.length=0;
  assert.throws(()=>planInexperiencedSpy(empty,event),/mão física escolhida está vazia/);
});

test('a selected card that leaves the target hand before resolution makes the plan stale',()=>{
  const state=create(0,'stale-target');
  const source=addSpy(state,0);
  const target=holder(state,1).hand[0];
  const planned=plan(state,0,1,source);
  const changed=structuredClone(state);
  const removed=holder(changed,1).hand.shift();
  changed.core.players[1].grave.push(removed);
  assert.throws(()=>resolveInexperiencedSpy(changed,planned,target.uid),/saiu da mão antes da resolução/);
});

test('the private receipt is not part of persisted duel state or public TagDuel output',()=>{
  const state=create(0,'public-safety');
  const source=addSpy(state,0);
  const target=holder(state,1).hand[0];
  const result=resolveInexperiencedSpy(state,plan(state,0,1,source),target.uid);
  assert.equal(result.state.inexperiencedSpyReceipts.length,1);
  assert.equal(JSON.stringify(result.state).includes(target.id),true,'the authoritative state still contains private hands');
  const publicView=tag.publicTagDuel(result.state);
  assert.equal(JSON.stringify(publicView).includes(target.id),false);
  assert.equal(JSON.stringify(publicView).includes(target.uid),false);
  assert.equal(JSON.stringify(result.state).includes('privateReceipt'),false);
});

test('a 7-card hand remains intact until the engine End Phase discard',()=>{
  const state=create(0,'hand-limit');
  const source=addSpy(state,0);
  const actor=holder(state,0);
  while(actor.hand.length<8)actor.hand.push(actor.deck.shift());
  const before=hands(state);
  const target=holder(state,1).hand[0];
  const result=resolveInexperiencedSpy(state,plan(state,0,1,source),target.uid);
  assert.equal(holder(result.state,0).hand.length,7);
  assert.equal(before.length-hands(result.state).length,1);
  assert.equal(result.state.core.phase,'main');
  assert.equal(result.state.core.handFlow,undefined);
  assertRules(result.state);
});

test('three shared Monster Zones and three shared S/T Zones remain hard limits',()=>{
  const state=create(0,'zone-limits');
  for(let i=0;i<3;i++)state.core.players[0].monsters.push({
    uid:'m0:m640-monster-'+i,id:NORMALS[i],position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,attackCount:0,atkBoost:0,defBoost:0
  });
  for(let i=0;i<3;i++)state.core.players[0].backrow.push({
    uid:'m0:m640-backrow-'+i,id:NORMALS[4+i],setTurn:0,faceUp:false
  });
  const source=addSpy(state,0);
  assert.throws(()=>plan(state,0,1,source),/Zona de Magias\/Armadilhas livre/);
  const fourth=structuredClone(state);
  fourth.core.players[0].monsters.push({
    uid:'m0:m640-fourth',id:NORMALS[7],position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,attackCount:0,atkBoost:0,defBoost:0
  });
  assert.throws(()=>planInexperiencedSpy(fourth,{
    activationId:'m640:fourth',actorSeat:0,targetSeat:1,sourceUid:source
  }),/três Monster Zones/);
});

test('Main Deck 20–30 and Extra Deck maximum 5 remain physical-seat limits',()=>{
  const FUSIONS=[...new Set(enabledCardIds.filter(id=>getDuelCard(id)?.fusion))];
  assert.ok(FUSIONS.length>=6,'fixture requires six enabled Fusion cards');
  const valid=create(0,'extra-five',{2:FUSIONS.slice(0,5)});
  const source=addSpy(valid,0);
  assert.ok(plan(valid,0,1,source));
  const invalid=structuredClone(valid);
  invalid.reserves['2'].extra.push({uid:'m2:m640-extra-sixth',id:FUSIONS[5]});
  assert.throws(()=>planInexperiencedSpy(invalid,{
    activationId:'m640:extra',actorSeat:0,targetSeat:1,sourceUid:source
  }),/Extra Deck físico excedeu cinco/);
  const short=structuredClone(valid);
  short.reserves['2'].deck.pop();
  assert.throws(()=>planInexperiencedSpy(short,{
    activationId:'m640:short',actorSeat:0,targetSeat:1,sourceUid:source
  }),/Deck principal físico fora do limite 20–30/);
});
