'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel.js');
const {getPlayableCard,enabledCardIds,getDuelCard}=require('../dist/effectRegistry.js');
const {rulesFor}=require('../dist/rulesProfile.js');
const {
  TRAP_DUSTSHOOT_ID,
  activateTrapDustshoot,
  resolveTrapDustshoot,
  privateTrapDustshootRevealForSeat
}=require('../dist/trapDustshootTagAdapter.js');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
const FIELD_SPELLS=[...new Set(enabledCardIds.filter(id=>getDuelCard(id)?.field))];
const BACKROW_SPELLS=[...new Set(enabledCardIds.filter(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field&&!getDuelCard(id)?.fusion))];
const SPELLS=[...FIELD_SPELLS,...BACKROW_SPELLS];
const FUSIONS=[...new Set(enabledCardIds.filter(id=>getDuelCard(id)?.fusion))];
assert.ok(NORMALS.length>=20,'the normal-monster pool must build four physical 20-card decks');
assert.ok(FIELD_SPELLS.length>=1,'fixtures require an enabled Field Spell');
assert.ok(BACKROW_SPELLS.length>=8,'fixtures require eight enabled backrow Spells');
assert.ok(FUSIONS.length>=6,'fixtures require six enabled Fusion cards');
let sequence=0;
function deck(){return NORMALS.slice(0,20);}
function mixedDeck(){return [FIELD_SPELLS[0],...BACKROW_SPELLS.slice(0,8),...NORMALS.slice(0,11)];}
function member(seat){return 'm642-seat-'+seat;}
function create(first=0,seed='default',extraBySeat={},cardsBySeat={}){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M642 Seat '+seat,
    cards:[...(cardsBySeat[seat]||deck())],
    extra:[...(extraBySeat[seat]||[])]
  })),{classic:true,first,seed:'m642-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function addDustshoot(state,seat,{setTurn=0}={}){
  const uid='m'+seat+':m642-trap-dustshoot-'+(++sequence);
  state.core.players[seat%2].backrow.push({uid,id:TRAP_DUSTSHOOT_ID,setTurn,faceUp:false});
  return uid;
}
function moveFromDeckToMonster(state,seat){
  const held=holder(state,seat);
  const index=held.deck.findIndex(card=>getDuelCard(card.id)?.kind==='monster'&&!getDuelCard(card.id)?.fusion);
  assert.ok(index>=0);
  const [card]=held.deck.splice(index,1);
  state.core.players[seat%2].monsters.push({
    ...card,position:'def',faceUp:false,entered:0,changed:0,attacked:0,
    atkBoost:0,defBoost:0
  });
  return card.uid;
}
function moveFromDeckToBackrow(state,seat){
  const held=holder(state,seat);
  const index=held.deck.findIndex(card=>getDuelCard(card.id)?.kind==='spell'&&!getDuelCard(card.id)?.field);
  assert.ok(index>=0);
  const [card]=held.deck.splice(index,1);
  state.core.players[seat%2].backrow.push({...card,setTurn:0,faceUp:false});
  return card.uid;
}
function moveFromDeckToField(state,seat){
  const held=holder(state,seat);
  const index=held.deck.findIndex(card=>getDuelCard(card.id)?.field);
  assert.ok(index>=0);
  const [card]=held.deck.splice(index,1);
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
    activationId:activationId??'m642:'+state.core.turn+':'+sourceUid+':'+(++sequence),
    actorSeat,targetSeat,sourceUid
  };
}
function activate(state,actorSeat,targetSeat,sourceUid,activationId){
  return activateTrapDustshoot(state,event(state,actorSeat,targetSeat,sourceUid,activationId));
}

test('Trap Dustshoot remains outside the playable catalogue and certification allowlist',()=>{
  assert.equal(getPlayableCard(TRAP_DUSTSHOOT_ID),undefined);
  assert.equal(enabledCardIds.includes(TRAP_DUSTSHOOT_ID),false);
});

test('activation requires a previously Set Trap and at least four cards in the selected physical hand',()=>{
  const state=create(0,'threshold');
  const source=addDustshoot(state,0);
  const target=holder(state,1);
  const activation=activate(state,0,1,source);
  assert.equal(activation.plan.targetHandCountAtActivation,target.hand.length);
  assert.ok(target.hand.length>=4);
  const short=structuredClone(state);
  const shortSource=short.core.players[0].backrow.find(card=>card.uid===source);
  holder(short,1).deck.push(...holder(short,1).hand.splice(0,2));
  assert.equal(holder(short,1).hand.length,3);
  assert.throws(()=>activate(short,0,1,shortSource.uid),/pelo menos quatro cartas/);
  const sameTurn=structuredClone(state);
  const sameTurnSource=addDustshoot(sameTurn,0,{setTurn:sameTurn.core.turn});
  assert.throws(()=>activate(sameTurn,0,1,sameTurnSource),/mesmo turno/);
});

test('only the activating seat sees the selected hand; one monster returns to its physical owner's Deck and is shuffled',()=>{
  const state=create(0,'private-return');
  const source=addDustshoot(state,0);
  const targetSeat=3;
  const target=holder(state,targetSeat);
  const selected=target.hand.find(card=>getDuelCard(card.id)?.kind==='monster');
  assert.ok(selected);
  const before=inventory(state),beforeHands=hands(state),beforeLog=JSON.stringify(state.core.log);
  const counterBefore=state.core.random.counter;
  const activation=activate(state,0,targetSeat,source);
  const result=resolveTrapDustshoot(activation.state,activation.plan,selected.uid);
  assert.equal(result.status,'resolved');
  const reveal=privateTrapDustshootRevealForSeat(result,0);
  assert.equal(reveal.targetSeat,targetSeat);
  assert.equal(reveal.hand.some(card=>card.uid===selected.uid&&card.id===selected.id),true);
  assert.deepEqual(reveal.selectedCard,{uid:selected.uid,id:selected.id,ownerSeat:3});
  assert.equal(privateTrapDustshootRevealForSeat(result,2),undefined,'the actor partner must not see the private hand');
  assert.equal(privateTrapDustshootRevealForSeat(result,1),undefined,'the target must not receive the private hand');
  assert.equal(privateTrapDustshootRevealForSeat(result,3),undefined,'the target partner must not receive the private hand');
  assert.equal(holder(result.state,3).hand.some(card=>card.uid===selected.uid),false);
  assert.equal(holder(result.state,3).deck.some(card=>card.uid===selected.uid),true,'the card returns to its physical owner');
  assert.ok(result.state.core.random.counter>counterBefore,'the owner Deck is shuffled with the persisted duel RNG');
  assert.deepEqual(hands(result.state),beforeHands.filter(uid=>uid!==selected.uid));
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid===source),true);
  assert.equal(JSON.stringify(result.state.core.log),beforeLog);
  assert.equal(Object.keys(result).includes('privateReceipt'),false);
  assertConserved(result.state,before);
  assertRules(result.state);
  const publicCandidate=structuredClone(result.state);
  publicCandidate.core.players[0].grave=publicCandidate.core.players[0].grave.filter(card=>card.uid!==source);
  const publicView=tag.publicTagDuel(publicCandidate);
  assert.equal(JSON.stringify(publicView).includes(selected.id),false);
  assert.equal(JSON.stringify(publicView).includes(selected.uid),false);
});

test('a selected Fusion monster returns to its physical owner Extra Deck, not the Main Deck',()=>{
  const state=create(0,'fusion-return',{3:FUSIONS.slice(0,5)});
  const source=addDustshoot(state,0);
  const target=holder(state,3);
  const fusion=target.extra.pop();
  target.hand.push(fusion);
  const activation=activate(state,0,3,source);
  const result=resolveTrapDustshoot(activation.state,activation.plan,fusion.uid);
  assert.equal(holder(result.state,3).extra.some(card=>card.uid===fusion.uid),true);
  assert.equal(holder(result.state,3).deck.some(card=>card.uid===fusion.uid),false);
  assert.equal(privateTrapDustshootRevealForSeat(result,0).selectedCard.id,fusion.id);
  assertRules(result.state);
});

test('a selected card is removed only from the chosen inactive opponent hand, not the other hand',()=>{
  const state=create(0,'one-hand-only');
  const source=addDustshoot(state,0);
  const selected=holder(state,1).hand.find(card=>getDuelCard(card.id)?.kind==='monster');
  const other=holder(state,3).hand[0];
  const activation=activate(state,0,1,source);
  const result=resolveTrapDustshoot(activation.state,activation.plan,selected.uid);
  assert.equal(holder(result.state,1).hand.some(card=>card.uid===selected.uid),false);
  assert.equal(holder(result.state,3).hand.some(card=>card.uid===other.uid),true);
});

test('if no monster is in the selected hand, the hand is inspected and no card is returned',()=>{
  const state=create(0,'no-monster',{}, {1:[...SPELLS.slice(0,5),...NORMALS.slice(0,15)]});
  const source=addDustshoot(state,0);
  const target=holder(state,1);
  const pool=[...target.hand,...target.deck];
  const spells=pool.filter(card=>getDuelCard(card.id)?.kind==='spell').slice(0,4);
  assert.equal(spells.length,4);
  target.hand=spells;
  target.deck=pool.filter(card=>!spells.some(spell=>spell.uid===card.uid));
  assert.equal(target.hand.length,4);
  assert.equal(target.hand.some(card=>getDuelCard(card.id)?.kind==='monster'),false);
  const before=hands(state);
  const activation=activate(state,0,1,source);
  const result=resolveTrapDustshoot(activation.state,activation.plan,undefined);
  assert.equal(result.status,'resolved');
  assert.equal(privateTrapDustshootRevealForSeat(result,0).hand.length,4);
  assert.equal(privateTrapDustshootRevealForSeat(result,0).selectedCard,undefined);
  assert.deepEqual(hands(result.state),before);
});

test('a non-Monster cannot be selected, and a Monster that left the hand makes the choice stale',()=>{
  const state=create(0,'invalid-selection',{}, {1:[...SPELLS.slice(0,5),...NORMALS.slice(0,15)]});
  const source=addDustshoot(state,0);
  const target=holder(state,1);
  const pool=[...target.hand,...target.deck];
  const spell=pool.find(card=>getDuelCard(card.id)?.kind==='spell');
  const monster=pool.find(card=>getDuelCard(card.id)?.kind==='monster');
  assert.ok(spell&&monster);
  const chosen=[spell,monster,...pool.filter(card=>card.uid!==spell.uid&&card.uid!==monster.uid).slice(0,2)];
  target.hand=chosen;
  target.deck=pool.filter(card=>!chosen.some(item=>item.uid===card.uid));
  const activation=activate(state,0,1,source);
  assert.throws(()=>resolveTrapDustshoot(activation.state,activation.plan,spell.uid),/só pode devolver um Monstro/);
  const changed=structuredClone(activation.state);
  const removed=holder(changed,1).hand.find(card=>card.uid===monster.uid);
  holder(changed,1).hand=holder(changed,1).hand.filter(card=>card.uid!==monster.uid);
  holder(changed,1).grave??=[];
  holder(changed,1).grave.push(removed);
  assert.throws(()=>resolveTrapDustshoot(changed,activation.plan,monster.uid),/saiu da mão adversária/);
});

test('the four-card condition is checked at activation, not rechecked after the chain',()=>{
  const state=create(0,'condition-at-activation');
  const source=addDustshoot(state,0);
  const activation=activate(state,0,1,source);
  const changed=structuredClone(activation.state);
  const target=holder(changed,1);
  target.grave??=[];
  target.grave.push(...target.hand.splice(0,2));
  assert.equal(target.hand.length,3);
  const monster=target.hand.find(card=>getDuelCard(card.id)?.kind==='monster');
  if(monster){
    const result=resolveTrapDustshoot(changed,activation.plan,monster.uid);
    assert.equal(result.status,'resolved');
  }else{
    const result=resolveTrapDustshoot(changed,activation.plan,undefined);
    assert.equal(result.status,'resolved');
  }
});

test('a negated Trap reveals nothing and moves no opponent card',()=>{
  const state=create(0,'negated');
  const source=addDustshoot(state,0);
  const selected=holder(state,1).hand.find(card=>getDuelCard(card.id)?.kind==='monster');
  const before=inventory(state),beforeHands=hands(state);
  const activation=activate(state,0,1,source);
  const result=resolveTrapDustshoot(activation.state,activation.plan,undefined,true);
  assert.equal(result.status,'negated');
  assert.equal(result.privateReceipt,undefined);
  assert.equal(privateTrapDustshootRevealForSeat(result,0),undefined);
  assert.equal(holder(result.state,1).hand.some(card=>card.uid===selected.uid),true);
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid===source),true);
  assert.deepEqual(hands(result.state),beforeHands);
  assertConserved(result.state,before);
});

test('activation and resolution IDs prevent repeated activations and forged plans',()=>{
  const state=create(0,'idempotent');
  const source=addDustshoot(state,0);
  const activationId='m642:idempotent:'+source;
  const activation=activate(state,0,1,source,activationId);
  assert.throws(()=>activate(activation.state,0,1,source,activationId),/já foi registrada/);
  const forged={...activation.plan,targetSeat:3};
  assert.throws(()=>resolveTrapDustshoot(activation.state,forged,undefined),/registro imutável/);
  const selected=holder(state,1).hand.find(card=>getDuelCard(card.id)?.kind==='monster');
  const first=resolveTrapDustshoot(activation.state,activation.plan,selected.uid);
  const duplicate=resolveTrapDustshoot(first.state,activation.plan,selected.uid);
  assert.equal(duplicate.status,'duplicate');
  assert.equal(duplicate.privateReceipt,undefined);
  assert.equal(privateTrapDustshootRevealForSeat(duplicate,0),undefined);
});

test('an already activated Trap resolves even if it leaves the field before resolution',()=>{
  const state=create(0,'source-removed');
  const source=addDustshoot(state,0);
  const selected=holder(state,1).hand.find(card=>getDuelCard(card.id)?.kind==='monster');
  const activation=activate(state,0,1,source);
  const interrupted=structuredClone(activation.state);
  const index=interrupted.core.players[0].backrow.findIndex(card=>card.uid===source);
  const [removed]=interrupted.core.players[0].backrow.splice(index,1);
  interrupted.core.players[0].banished.push(removed);
  const result=resolveTrapDustshoot(interrupted,activation.plan,selected.uid);
  assert.equal(result.status,'resolved');
  assert.equal(holder(result.state,1).deck.some(card=>card.uid===selected.uid),true);
  assert.equal(result.state.core.players[0].banished.some(card=>card.uid===source),true);
});

test('a 7-card hand is not discarded by this adapter before the engine End Phase',()=>{
  const state=create(0,'hand-limit');
  const source=addDustshoot(state,0);
  const actor=holder(state,0);
  while(actor.hand.length<7)actor.hand.push(actor.deck.shift());
  const before=hands(state);
  const selected=holder(state,1).hand.find(card=>getDuelCard(card.id)?.kind==='monster');
  const activation=activate(state,0,1,source);
  const result=resolveTrapDustshoot(activation.state,activation.plan,selected.uid);
  assert.equal(holder(result.state,0).hand.length,7);
  assert.equal(result.state.core.phase,'main');
  assert.equal(result.state.core.handFlow,undefined);
  assert.deepEqual(hands(result.state),before.filter(uid=>uid!==selected.uid));
  assertRules(result.state);
});

test('three shared Monster Zones, three shared S/T Zones and the separate Field Zone remain valid',()=>{
  const state=create(0,'zone-limits',{}, {1:mixedDeck()});
  const source=addDustshoot(state,0);
  for(let i=0;i<3;i++)moveFromDeckToMonster(state,1);
  for(let i=0;i<3;i++)moveFromDeckToBackrow(state,1);
  moveFromDeckToField(state,1);
  assert.ok(activate(state,0,1,source));
  const fourth=structuredClone(state);
  moveFromDeckToMonster(fourth,1);
  assert.throws(()=>activate(fourth,0,1,source),/três Monster Zones/);
});

test('Main Deck 20–30 and Extra Deck maximum 5 remain physical-seat limits',()=>{
  const valid=create(0,'extra-five',{3:FUSIONS.slice(0,5)});
  const source=addDustshoot(valid,0);
  assert.ok(activate(valid,0,3,source));
  const invalid=structuredClone(valid);
  invalid.reserves['3'].extra.push({uid:'m3:m642-extra-sixth',id:FUSIONS[5]});
  assert.throws(()=>activateTrapDustshoot(invalid,event(invalid,0,3,source)),/Extra Deck físico excedeu cinco/);
  const short=structuredClone(valid);
  short.reserves['3'].deck.splice(0,2);
  assert.throws(()=>activateTrapDustshoot(short,event(short,0,3,source)),/Deck principal físico fora do limite 20–30/);
});
