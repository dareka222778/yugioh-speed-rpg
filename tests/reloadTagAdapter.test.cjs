'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel.js');
const {getPlayableCard,enabledCardIds}=require('../dist/effectRegistry.js');
const {rulesFor}=require('../dist/rulesProfile.js');
const {
  RELOAD_ID,activateReload,resolveReload
}=require('../dist/reloadTagAdapter.js');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20,'fixtures need four physical 20-card decks');
let sequence=0;
function deck(){return NORMALS.slice(0,20);}
function member(seat){return 'm647-seat-'+seat;}
function create(first=0,seed='default'){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M647 Seat '+seat,cards:deck()
  })),{classic:true,first,seed:'m647-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function addReloadToHand(state,seat,ownerSeat=seat){
  const uid='m'+ownerSeat+':m647-reload-'+(++sequence);
  holder(state,seat).hand.push({uid,id:RELOAD_ID});
  return uid;
}
function addReloadToBackrow(state,seat,ownerSeat=seat,setTurn=0){
  const uid='m'+ownerSeat+':m647-reload-'+(++sequence);
  state.core.players[seat%2].backrow.push({uid,id:RELOAD_ID,faceUp:false,setTurn});
  return uid;
}
function moveDeckCardToHand(state,seat){
  const player=holder(state,seat),card=player.deck.shift();
  assert.ok(card);player.hand.push(card);return card;
}
function inventory(state){
  const cards=tag.tagInventory(state).filter(card=>card.entityKind!=='token');
  const result=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(result.size,cards.length,'physical UIDs must be unique');
  return result;
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
    assert.ok(player.monsters.length<=3);assert.ok(player.backrow.length<=3);
  }
}
function event(state,actorSeat,sourceUid,activationId){
  return {
    activationId:activationId??'m647:'+state.core.turn+':'+sourceUid+':'+(++sequence),
    actorSeat,sourceUid
  };
}
function activate(state,actorSeat,sourceUid,activationId){
  return activateReload(state,event(state,actorSeat,sourceUid,activationId));
}
function resolve(activation,effectNegated=false){
  return resolveReload(activation.state,activation.plan,effectNegated);
}

test('Reload remains outside the playable catalogue and certification allowlist',()=>{
  assert.equal(getPlayableCard(RELOAD_ID),undefined);
  assert.equal(enabledCardIds.includes(RELOAD_ID),false);
});
test('activation from hand moves the same physical Quick-Play Spell face-up to the shared backrow',()=>{
  const state=create(0,'hand-source'),source=addReloadToHand(state,0),before=inventory(state),original=JSON.stringify(state);
  const activation=activate(state,0,source);
  assert.equal(activation.status,'activated');
  assert.equal(holder(activation.state,0).hand.some(card=>card.uid===source),false);
  assert.equal(activation.state.core.players[0].backrow.find(card=>card.uid===source).faceUp,true);
  assertConserved(activation.state,before);
  assert.equal(JSON.stringify(state),original);
});
test('a Quick-Play Spell Set this turn cannot be activated',()=>{
  const state=create(0,'same-turn-set'),source=addReloadToBackrow(state,0,0,state.core.turn);
  assert.throws(()=>activate(state,0,source),/turno posterior/);
});
test('a Set Quick-Play Spell can be activated on a later own turn',()=>{
  const state=create(0,'previous-turn-set'),source=addReloadToBackrow(state,0,0,state.core.turn-1);
  const activation=activate(state,0,source);
  assert.equal(activation.plan.sourceLocation,'backrow');
  assert.equal(activation.state.core.players[0].backrow.find(card=>card.uid===source).faceUp,true);
});
test('Reload returns the whole hand, shuffles, and draws the same number without changing Deck or hand counts',()=>{
  const state=create(0,'same-count'),source=addReloadToHand(state,0);
  moveDeckCardToHand(state,0);moveDeckCardToHand(state,0);
  const activation=activate(state,0,source),before=inventory(state);
  const handCount=holder(activation.state,0).hand.length,deckCount=holder(activation.state,0).deck.length;
  const counter=activation.state.core.random.counter;
  const result=resolve(activation);
  assert.equal(result.status,'resolved');
  assert.equal(holder(result.state,0).hand.length,handCount);
  assert.equal(holder(result.state,0).deck.length,deckCount);
  assert.ok(result.state.core.random.counter>counter);
  assertConserved(result.state,before);assertRules(result.state);
});
test('the shuffle uses the persisted HMAC duel random stream, not Math.random or a client seed',()=>{
  const state=create(0,'persisted-rng'),source=addReloadToHand(state,0),activation=activate(state,0,source);
  const counter=activation.state.core.random.counter;
  const result=resolve(activation);
  assert.ok(result.state.core.random.counter>counter);
  assert.match(result.state.core.random.seed,/^[a-f0-9]{64}$/);
});
test('Reload with no remaining hand cards resolves with zero draws and preserves the Deck',()=>{
  const state=create(0,'empty-hand'),source=addReloadToHand(state,0);
  const activation=activate(state,0,source),beforeDeck=holder(activation.state,0).deck.length;
  assert.equal(holder(activation.state,0).hand.length,0);
  const result=resolve(activation);
  assert.equal(holder(result.state,0).hand.length,0);
  assert.equal(holder(result.state,0).deck.length,beforeDeck);
  assert.equal(result.status,'resolved');
});
test('negation sends only the Spell to its original owner Graveyard and consumes no shuffle randomness',()=>{
  const state=create(0,'negated'),source=addReloadToHand(state,0,1),activation=activate(state,0,source);
  const beforeHand=holder(activation.state,0).hand.map(card=>card.uid);
  const beforeDeck=holder(activation.state,0).deck.map(card=>card.uid);
  const counter=activation.state.core.random.counter;
  const result=resolve(activation,true);
  assert.equal(result.status,'negated');
  assert.deepEqual(holder(result.state,0).hand.map(card=>card.uid),beforeHand);
  assert.deepEqual(holder(result.state,0).deck.map(card=>card.uid),beforeDeck);
  assert.equal(result.state.core.players[1].grave.some(card=>card.uid===source),true);
  assert.equal(result.state.core.random.counter,counter);
});
test('a six-card hand remains six until End Phase; Reload does not auto-discard',()=>{
  const state=create(0,'six-card-hand'),source=addReloadToHand(state,0);
  while(holder(state,0).hand.length<7)moveDeckCardToHand(state,0);
  const activation=activate(state,0,source);
  assert.equal(holder(activation.state,0).hand.length,6);
  const result=resolve(activation);
  assert.equal(holder(result.state,0).hand.length,6);
  assert.equal(rulesFor(result.state.core).handCheck,'end');
});
test('Quick-Play from hand can be activated in an open Battle Phase outside the Damage Step',()=>{
  const state=create(0,'battle-phase'),source=addReloadToHand(state,0);
  state.core.phase='battle';
  const activation=activate(state,0,source);
  assert.equal(activation.status,'activated');
  assert.equal(activation.plan.activationPhase,'battle');
});
test('Reload cannot be activated during the Damage Step',()=>{
  const state=create(0,'damage-step'),source=addReloadToHand(state,0);
  state.core.phase='battle';state.core.damageStep=true;
  assert.throws(()=>activate(state,0,source),/prioridade legal/);
});
test('a Set Quick-Play Spell can respond during the opponent turn after it was Set on a previous turn',()=>{
  const state=create(0,'opponent-response'),source=addReloadToBackrow(state,0,1,state.core.turn-1);
  state.core.current=1;state.core.priority=0;state.core.phase='response';
  state.core.chain=[{actor:1,card:'m1:response',id:'response'}];
  state.core.pending={kind:'spell',actor:1,card:'m1:response',id:'response'};
  const activation=activate(state,state.active[0],source);
  assert.equal(activation.status,'activated');
  assert.equal(activation.plan.activationPhase,'response');
});
test('a Quick-Play Spell in hand cannot be activated during the opponent turn',()=>{
  const state=create(0,'hand-opponent-turn'),source=addReloadToHand(state,0);
  state.core.current=1;state.core.priority=0;state.core.phase='response';
  state.core.chain=[{actor:1,card:'m1:response',id:'response'}];
  state.core.pending={kind:'spell',actor:1,card:'m1:response',id:'response'};
  assert.throws(()=>activate(state,state.active[0],source),/prioridade legal/);
});
test('only the active physical seat of the controlling team may activate Reload',()=>{
  const state=create(0,'active-seat'),source=addReloadToHand(state,0);
  assert.throws(()=>activate(state,2,source),/assento físico ativo/);
});
test('hand activation requires a free Spell/Trap Zone while the Field Zone remains separate',()=>{
  const state=create(0,'full-backrow'),source=addReloadToHand(state,0);
  for(let i=0;i<3;i++)state.core.players[0].backrow.push({
    uid:'m0:m647-backrow-'+i,id:NORMALS[i],faceUp:false,setTurn:state.core.turn
  });
  assert.throws(()=>activate(state,0,source),/Zona de Magias\/Armadilhas livre/);
  const setState=create(0,'field-separate'),setSource=addReloadToBackrow(setState,0,0,setState.core.turn-1);
  setState.core.players[0].field={uid:'m0:m647-field',id:NORMALS[4],faceUp:true};
  assert.equal(activate(setState,0,setSource).status,'activated');
});
test('a Reload in the opposing backrow cannot be activated by the active team',()=>{
  const state=create(0,'opposing-backrow'),source=addReloadToBackrow(state,1,1,state.core.turn-1);
  assert.throws(()=>activate(state,0,source),/adversária/);
});
test('a Set Reload controlled by one team returns to its original owner team Graveyard',()=>{
  const state=create(0,'stolen-set'),source=addReloadToBackrow(state,0,1,state.core.turn-1);
  const activation=activate(state,0,source),result=resolve(activation);
  assert.equal(result.state.core.players[1].grave.some(card=>card.uid===source),true);
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid===source),false);
});
test('a changed hand or Deck invalidates the stored activation commitments',()=>{
  const state=create(0,'stale-plan'),source=addReloadToHand(state,0),activation=activate(state,0,source);
  const changed=structuredClone(activation.state);
  const player=holder(changed,0);
  player.deck.reverse();
  assert.throws(()=>resolveReload(changed,activation.plan),/mão ou o Deck mudou/);
});
test('a forged plan cannot change the physical actor or source owner',()=>{
  const state=create(0,'forged-plan'),source=addReloadToHand(state,0),activation=activate(state,0,source);
  assert.throws(()=>resolveReload(activation.state,{...activation.plan,actorSeat:2}),/Plano de Reload/);
});
test('the same activation cannot be resolved twice',()=>{
  const state=create(0,'duplicate'),source=addReloadToHand(state,0),activation=activate(state,0,source);
  const first=resolve(activation),second=resolveReload(first.state,activation.plan);
  assert.equal(second.status,'duplicate');
  assert.equal(second.state,first.state);
});
test('Reload preserves every physical UID and the original input',()=>{
  const state=create(0,'conservation'),source=addReloadToHand(state,0),before=inventory(state),original=JSON.stringify(state);
  const activation=activate(state,0,source),result=resolve(activation);
  assert.equal(JSON.stringify(state),original);
  assertConserved(result.state,before);assertRules(result.state);
});
test('the source card can be Set by a different physical owner and still returns to that owner Graveyard',()=>{
  const state=create(0,'source-owner'),source=addReloadToBackrow(state,0,3,state.core.turn-1);
  const activation=activate(state,0,source),result=resolve(activation);
  assert.equal(result.state.core.players[1].grave.some(card=>card.uid===source),true);
});
