'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel.js');
const {engineCard,getPlayableCard,engineCatalog}=require('../dist/effectRegistry.js');
const {rulesFor}=require('../dist/rulesProfile.js');
const {
  DISTURBANCE_STRATEGY_ID,CONFISCATION_ID,DRAGGED_DOWN_ID,MIND_CRUSH_ID,
  defaultHandDisruptionEffect,activateHandDisruption,resolveHandDisruption
}=require('../dist/handDisruptionTagAdapter.js');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=31);
const SPELL_FIXTURE=(engineCatalog.find(card=>card.kind==='spell'&&card.race==='Normal'&&getPlayableCard(card.id))||{}).id;
const TRAP_FIXTURE=(engineCatalog.find(card=>card.kind==='trap'&&card.race==='Normal'&&getPlayableCard(card.id))||{}).id;
const DECLARED_ID=NORMALS[0];
const NO_MATCH_ID=(engineCatalog.find(card=>getPlayableCard(card.id)&&!NORMALS.includes(card.id)&&card.id!==SPELL_FIXTURE&&card.id!==TRAP_FIXTURE)||{}).id;
assert.ok(SPELL_FIXTURE,'need a playable Normal Spell fixture');
assert.ok(TRAP_FIXTURE,'need a playable Normal Trap fixture');
assert.ok(NO_MATCH_ID,'need a declared card name absent from fixture Decks');
let sequence=0;

function deckWith(ids){
  const selected=[...ids],rest=NORMALS.filter(id=>!selected.includes(id));
  const deck=[...selected,...rest.slice(0,20-selected.length)];
  assert.equal(deck.length,20);
  return deck;
}
function create(first=0,decks=null,seed='default'){
  const standard=deckWith([SPELL_FIXTURE,TRAP_FIXTURE,DECLARED_ID]);
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:'m703-seat-'+seat,name:'M703 Seat '+seat,cards:decks?.[seat]??standard
  })),{classic:true,first,seed:'m703-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function takeCard(state,seat,id){
  const physical=holder(state,seat);
  let index=physical.deck.findIndex(card=>card.id===id);
  if(index>=0)return physical.deck.splice(index,1)[0];
  index=physical.hand.findIndex(card=>card.id===id);
  if(index>=0)return physical.hand.splice(index,1)[0];
  throw new Error('fixture card not found: '+id);
}
function addSource(state,actorSeat,effect,declaredCardId){
  const id=(effect==='disturbance-strategy'||effect==='mind-crush')?TRAP_FIXTURE:SPELL_FIXTURE;
  const card=takeCard(state,actorSeat,id);
  state.core.players[actorSeat%2].backrow.push({
    ...card,faceUp:true,setTurn:Math.max(0,state.core.turn-1)
  });
  return {uid:card.uid,id:card.id,lookup:cardId=>cardId===id?effect:undefined,declaredCardId};
}
function moveHand(state,seat,count){
  const physical=holder(state,seat);
  while(physical.hand.length<count&&physical.deck.length)physical.hand.push(physical.deck.shift());
}
function addCardsToHand(state,seat,id,count){
  for(let i=0;i<count;i++)holder(state,seat).hand.push(takeCard(state,seat,id));
}
function inventory(state){
  const cards=tag.tagInventory(state).filter(card=>card.entityKind!=='token');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,cards.length,'physical UIDs must be unique');
  return map;
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
function zones(state,seat){
  const physical=holder(state,seat);
  return {deck:physical.deck.length,hand:physical.hand.length};
}
function sourceInGrave(state,team,uid){
  return state.core.players[team].grave.some(card=>card.uid===uid);
}
function event(state,actorSeat,source,declaredCardId){
  return {
    activationId:'m703:'+state.core.turn+':'+source.uid+':'+(++sequence),
    actorSeat,sourceUid:source.uid,...(declaredCardId?{declaredCardId}:{})
  };
}
function activate(state,actorSeat,source,declaredCardId=source.declaredCardId){
  return activateHandDisruption(state,event(state,actorSeat,source,declaredCardId),source.lookup);
}
function resolve(activation,choices={},negated=false){
  return resolveHandDisruption(activation.state,activation.plan,choices,negated);
}
function targetDeckWithCopies(){
  const selected=[SPELL_FIXTURE,TRAP_FIXTURE,DECLARED_ID,DECLARED_ID];
  const rest=NORMALS.filter(id=>id!==DECLARED_ID);
  return [...selected,...rest.slice(0,20-selected.length)];
}

test('four historical candidates map explicitly but remain outside the playable/certified set',()=>{
  const ids=[DISTURBANCE_STRATEGY_ID,CONFISCATION_ID,DRAGGED_DOWN_ID,MIND_CRUSH_ID];
  const names=['disturbance-strategy','confiscation','dragged-down','mind-crush'];
  for(let i=0;i<ids.length;i++){
    assert.equal(defaultHandDisruptionEffect(ids[i]),names[i]);
    assert.equal(getPlayableCard(ids[i]),undefined);
  }
});

test('Disturbance Strategy shuffles the opponent active hand into its Deck and draws the same count',()=>{
  const state=create(0,null,'disturbance'),source=addSource(state,0,'disturbance-strategy');
  moveHand(state,1,7);
  const partnerBefore=[zones(state,2),zones(state,3)];
  const partnerHands=[holder(state,2).hand.map(card=>card.uid),holder(state,3).hand.map(card=>card.uid)];
  const before=inventory(state),activation=activate(state,0,source);
  const randomBefore=activation.state.core.random.counter;
  const result=resolve(activation);
  assert.equal(result.status,'resolved');
  assert.equal(result.receipt.shuffledCount,7);
  assert.equal(result.receipt.drawnCounts[1],7);
  assert.equal(holder(result.state,1).hand.length,7);
  assert.ok(result.state.core.random.counter>randomBefore,'shuffle must use persisted random stream');
  assert.deepEqual([zones(result.state,2),zones(result.state,3)],partnerBefore);
  assert.deepEqual(holder(result.state,2).hand.map(card=>card.uid),partnerHands[0]);
  assert.deepEqual(holder(result.state,3).hand.map(card=>card.uid),partnerHands[1]);
  assert.ok(sourceInGrave(result.state,0,source.uid));
  assertConserved(result.state,before);assertRules(result.state);
});

test('Disturbance Strategy does not publish the shuffled or redrawn hand',()=>{
  const state=create(0,null,'disturbance-privacy'),source=addSource(state,0,'disturbance-strategy');
  moveHand(state,1,5);
  const activation=activate(state,0,source),log=JSON.stringify(activation.state.core.log);
  const result=resolve(activation);
  assert.equal(Object.prototype.hasOwnProperty.call(result.receipt,'revealedHands'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.receipt,'cardIds'),false);
  assert.equal(JSON.stringify(result.state.core.log),log);
  assert.equal(result.privateView,undefined);
});

test('Disturbance Strategy cannot be activated on the turn its Trap was set',()=>{
  const state=create(0,null,'disturbance-timing'),source=addSource(state,0,'disturbance-strategy');
  state.core.players[0].backrow.find(card=>card.uid===source.uid).setTurn=state.core.turn;
  assert.throws(()=>activate(state,0,source),/mesmo turno/);
});

test('Confiscation pays 1000 shared LP at activation and gives only the activator team a private hand view',()=>{
  const state=create(0,null,'confiscation'),source=addSource(state,0,'confiscation');
  moveHand(state,1,5);
  const targetBefore=holder(state,1).hand.map(card=>({uid:card.uid,id:card.id}));
  const selected=targetBefore[2],lp=state.core.players[0].lp;
  const before=inventory(state),activation=activate(state,0,source);
  assert.equal(activation.state.core.players[0].lp,lp-1000,'cost is paid at activation');
  const result=resolve(activation,{selectedUid:selected.uid});
  assert.equal(result.status,'resolved');
  assert.equal(result.privateView.visibility,'actor-team');
  assert.equal(result.privateView.viewerTeam,0);
  assert.deepEqual(result.privateView.cards.map(card=>card.uid),targetBefore.map(card=>card.uid));
  assert.equal(result.receipt.discardedCardIds[0],selected.id);
  assert.equal(result.receipt.revealedHands,undefined);
  assert.ok(sourceInGrave(result.state,0,source.uid));
  assert.ok(sourceInGrave(result.state,1,selected.uid));
  assert.equal(result.state.core.players[0].lp,lp-1000);
  assertConserved(result.state,before);assertRules(result.state);
});

test('Confiscation negation preserves the paid LP cost but does not inspect or discard the hand',()=>{
  const state=create(0,null,'confiscation-negated'),source=addSource(state,0,'confiscation');
  moveHand(state,1,4);
  const lp=state.core.players[0].lp,hand=holder(state,1).hand.map(card=>card.uid);
  const activation=activate(state,0,source),result=resolve(activation,{},true);
  assert.equal(result.status,'negated');
  assert.equal(result.state.core.players[0].lp,lp-1000);
  assert.deepEqual(holder(result.state,1).hand.map(card=>card.uid),hand);
  assert.equal(result.privateView,undefined);
  assert.ok(sourceInGrave(result.state,0,source.uid));
});

test('Confiscation rejects insufficient shared LP and an empty opposing hand',()=>{
  const low=create(0,null,'confiscation-low-lp'),source=addSource(low,0,'confiscation');
  low.core.players[0].lp=1000;moveHand(low,1,1);
  assert.throws(()=>activate(low,0,source),/mais de 1000 LP/);
  const empty=create(0,null,'confiscation-empty'),emptySource=addSource(empty,0,'confiscation');
  holder(empty,1).hand=[];
  assert.throws(()=>activate(empty,0,emptySource),/mais de 1000 LP/);
});

test('Confiscation requires an explicit card from the current opposing hand',()=>{
  const state=create(0,null,'confiscation-choice'),source=addSource(state,0,'confiscation');
  moveHand(state,1,4);
  const activation=activate(state,0,source);
  assert.throws(()=>resolve(activation,{}),/selecionar uma carta/);
  assert.throws(()=>resolve(activation,{selectedUid:holder(state,0).hand[0].uid}),/não está mais na mão/);
});

test('Dragged Down reveals both active hands, lets each select from the opposite hand, discards and draws one',()=>{
  const state=create(0,null,'dragged-down'),source=addSource(state,0,'dragged-down');
  moveHand(state,0,6);moveHand(state,1,5);
  const actor=holder(state,0).hand.map(card=>({uid:card.uid,id:card.id}));
  const target=holder(state,1).hand.map(card=>({uid:card.uid,id:card.id}));
  const before=inventory(state),activation=activate(state,0,source);
  const result=resolve(activation,{
    actorSelectedUid:target[1].uid,
    opponentSelectedUid:actor[2].uid
  });
  assert.equal(result.status,'resolved');
  assert.deepEqual(result.receipt.revealedHands[0].cardIds,actor.map(card=>card.id));
  assert.deepEqual(result.receipt.revealedHands[1].cardIds,target.map(card=>card.id));
  assert.equal(result.receipt.discardedCounts[0],1);
  assert.equal(result.receipt.discardedCounts[1],1);
  assert.deepEqual(result.receipt.drawnCounts,{0:1,1:1,2:0,3:0});
  assert.equal(holder(result.state,0).hand.length,actor.length);
  assert.equal(holder(result.state,1).hand.length,target.length);
  assert.ok(sourceInGrave(result.state,0,source.uid));
  assertConserved(result.state,before);assertRules(result.state);
});

test('Dragged Down rejects choices selected from the wrong private hand',()=>{
  const state=create(0,null,'dragged-down-invalid'),source=addSource(state,0,'dragged-down');
  moveHand(state,0,4);moveHand(state,1,4);
  const activation=activate(state,0,source);
  assert.throws(()=>resolve(activation,{
    actorSelectedUid:holder(state,0).hand[0].uid,
    opponentSelectedUid:holder(state,1).hand[0].uid
  }),/mão errada/);
});

test('Dragged Down reports deck-out for adjudication when a player cannot draw after discarding',()=>{
  const state=create(0,null,'dragged-down-deckout'),source=addSource(state,0,'dragged-down');
  moveHand(state,0,4);moveHand(state,1,4);
  const actor=holder(state,0),target=holder(state,1);
  actor.hand.push(...actor.deck.splice(0));
  target.deck.splice(1);
  const activation=activate(state,0,source);
  const result=resolve(activation,{
    actorSelectedUid:target.hand[0].uid,
    opponentSelectedUid:actor.hand[0].uid
  });
  assert.equal(result.status,'deckout-pending');
  assert.deepEqual(result.receipt.deckOutSeats,[0]);
  assert.equal(result.state.core.winner,null);
  assert.equal(holder(result.state,0).hand.length,actor.hand.length-1);
});

test('Mind Crush discards every matching copy by rules name without revealing the remaining hand',()=>{
  const decks=[deckWith([SPELL_FIXTURE,TRAP_FIXTURE,DECLARED_ID]),targetDeckWithCopies(),deckWith([SPELL_FIXTURE,TRAP_FIXTURE]),deckWith([SPELL_FIXTURE,TRAP_FIXTURE])];
  const state=create(0,decks,'mind-crush-match'),source=addSource(state,0,'mind-crush',DECLARED_ID);
  addCardsToHand(state,1,DECLARED_ID,2);
  const before=inventory(state),random=state.core.random.counter,actorHand=holder(state,0).hand.map(card=>card.uid);
  const activation=activate(state,0,source,DECLARED_ID),result=resolve(activation);
  assert.equal(result.status,'resolved');
  assert.equal(result.receipt.discardedCounts[1],2);
  assert.deepEqual(result.receipt.discardedCardIds,[DECLARED_ID,DECLARED_ID]);
  assert.equal(holder(result.state,0).hand.length,actorHand.length);
  assert.equal(result.state.core.random.counter,random);
  assert.equal(result.receipt.revealedHands,undefined);
  assert.ok(sourceInGrave(result.state,1,holder(state,1).hand[0]?.uid)||result.receipt.discardedCounts[1]===2);
  assertConserved(result.state,before);assertRules(result.state);
});

test('Mind Crush miss discards one random card from the activator and consumes persisted RNG',()=>{
  const state=create(0,null,'mind-crush-miss'),source=addSource(state,0,'mind-crush',NO_MATCH_ID);
  moveHand(state,0,5);moveHand(state,1,5);
  const actorHand=holder(state,0).hand.map(card=>card.uid),targetHand=holder(state,1).hand.map(card=>card.uid);
  const random=state.core.random.counter,activation=activate(state,0,source,NO_MATCH_ID),result=resolve(activation);
  assert.equal(result.receipt.discardedCounts[0],1);
  assert.equal(result.receipt.selfDiscardedCardIds.length,1);
  assert.equal(result.receipt.discardedCounts[1],0);
  assert.ok(result.state.core.random.counter>random);
  assert.equal(holder(result.state,0).hand.length,actorHand.length-1);
  assert.deepEqual(holder(result.state,1).hand.map(card=>card.uid),targetHand);
  assert.equal(result.receipt.revealedHands,undefined);
});

test('Mind Crush with no match and no activator hand does not invent a discard',()=>{
  const state=create(0,null,'mind-crush-empty-actor'),source=addSource(state,0,'mind-crush',NO_MATCH_ID);
  holder(state,0).deck.push(...holder(state,0).hand.splice(0));
  moveHand(state,1,4);
  const random=state.core.random.counter,activation=activate(state,0,source,NO_MATCH_ID),result=resolve(activation);
  assert.equal(result.receipt.discardedCounts[0],0);
  assert.equal(result.state.core.random.counter,random);
});

test('Mind Crush rejects an unknown declared card name',()=>{
  const state=create(0,null,'mind-crush-invalid'),source=addSource(state,0,'mind-crush');
  assert.throws(()=>activateHandDisruption(state,{
    activationId:'m703-invalid-declare',actorSeat:0,sourceUid:source.uid,declaredCardId:'00000000'
  },source.lookup),/não existe/);
});

test('only active seats are affected; inactive partner hands and Decks remain private',()=>{
  const state=create(0,null,'partners'),source=addSource(state,0,'disturbance-strategy');
  moveHand(state,1,5);moveHand(state,2,6);moveHand(state,3,6);
  const partnerZones=[zones(state,2),zones(state,3)];
  const partnerHands=[holder(state,2).hand.map(card=>card.uid),holder(state,3).hand.map(card=>card.uid)];
  const result=resolve(activate(state,0,source));
  assert.deepEqual([zones(result.state,2),zones(result.state,3)],partnerZones);
  assert.deepEqual(holder(result.state,2).hand.map(card=>card.uid),partnerHands[0]);
  assert.deepEqual(holder(result.state,3).hand.map(card=>card.uid),partnerHands[1]);
});

test('trap sources must be set before the current turn and source type must match its effect',()=>{
  const trap=create(0,null,'trap-type'),source=addSource(trap,0,'mind-crush',DECLARED_ID);
  const sourceCard=trap.core.players[0].backrow.find(card=>card.uid===source.uid);
  sourceCard.setTurn=trap.core.turn;
  assert.throws(()=>activate(trap,0,source,DECLARED_ID),/mesmo turno/);
  const spell=create(0,null,'wrong-source-kind'),spellSource=addSource(spell,0,'confiscation');
  assert.throws(()=>activateHandDisruption(spell,{
    activationId:'m703-wrong-kind',actorSeat:0,sourceUid:spellSource.uid
  },id=>id===spellSource.id?'disturbance-strategy':undefined),/Tipo da carta/);
});

test('resolved activations are idempotent and activation IDs cannot be reused',()=>{
  const state=create(0,null,'idempotency'),source=addSource(state,0,'disturbance-strategy');
  moveHand(state,1,3);
  const activation=activate(state,0,source),result=resolve(activation);
  assert.equal(resolveHandDisruption(result.state,activation.plan,{},false).status,'duplicate');
  assert.throws(()=>activateHandDisruption(activation.state,{
    activationId:activation.plan.activationId,actorSeat:0,sourceUid:source.uid
  },source.lookup),/já foi registrada/);
});

test('effect negation sends the source to GY but does not alter the opponent hand or random stream',()=>{
  const state=create(0,null,'negated'),source=addSource(state,0,'disturbance-strategy');
  moveHand(state,1,5);
  const hand=holder(state,1).hand.map(card=>card.uid),random=state.core.random.counter;
  const activation=activate(state,0,source),result=resolve(activation,{},true);
  assert.equal(result.status,'negated');
  assert.deepEqual(holder(result.state,1).hand.map(card=>card.uid),hand);
  assert.equal(result.state.core.random.counter,random);
  assert.ok(sourceInGrave(result.state,0,source.uid));
});

test('all four effects preserve physical inventory, the 3+3 layout and End Phase hand check',()=>{
  const state=create(0,null,'rules'),source=addSource(state,0,'confiscation');
  moveHand(state,1,7);
  const before=inventory(state),activation=activate(state,0,source);
  const result=resolve(activation,{selectedUid:holder(activation.state,1).hand[0].uid});
  assertConserved(result.state,before);assertRules(result.state);
  assert.equal(rulesFor(result.state.core).handCheck,'end');
});

test('private Confiscation hand view never enters persistent state or public logs',()=>{
  const state=create(0,null,'private-view'),source=addSource(state,0,'confiscation');
  moveHand(state,1,4);
  const activation=activate(state,0,source),log=JSON.stringify(activation.state.core.log);
  const selected=holder(activation.state,1).hand[0].uid;
  const result=resolve(activation,{selectedUid:selected});
  assert.ok(result.privateView.cards.length>=1);
  assert.equal(JSON.stringify(result.state.core.log),log);
  assert.equal(JSON.stringify(result.state).includes('privateView'),false);
});

test('Dragged Down public reveal is explicit while the other three effects never expose full hands',()=>{
  const state=create(0,null,'reveal'),source=addSource(state,0,'dragged-down');
  moveHand(state,0,4);moveHand(state,1,4);
  const actor=holder(state,0).hand[0].uid,target=holder(state,1).hand[0].uid;
  const result=resolve(activate(state,0,source),{actorSelectedUid:target,opponentSelectedUid:actor});
  assert.equal(result.receipt.revealedHands.length,2);
  assert.ok(result.receipt.revealedHands.every(hand=>hand.cardIds.length===4));
});

test('TagDuel rotation order remains valid when team 1 is the activating team',()=>{
  const state=create(1,null,'team-one'),source=addSource(state,1,'confiscation');
  moveHand(state,0,4);
  const activation=activate(state,1,source);
  const selected=holder(activation.state,0).hand[0].uid;
  const result=resolve(activation,{selectedUid:selected});
  assert.equal(result.plan,undefined);
  assert.equal(result.receipt.actorSeat,1);
  assert.equal(result.receipt.targetSeat,0);
  assert.ok(sourceInGrave(result.state,1,source.uid));
});

test('no private hand contents are copied into state logs by any adapter branch',()=>{
  const state=create(0,null,'log-privacy'),source=addSource(state,0,'mind-crush',NO_MATCH_ID);
  moveHand(state,0,5);moveHand(state,1,5);
  const activation=activate(state,0,source,NO_MATCH_ID),log=JSON.stringify(activation.state.core.log);
  const result=resolve(activation);
  assert.equal(JSON.stringify(result.state.core.log),log);
  assert.equal(result.privateView,undefined);
});
