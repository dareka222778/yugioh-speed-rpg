'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel.js');
const {getPlayableCard,engineCatalog}=require('../dist/effectRegistry.js');
const {rulesFor}=require('../dist/rulesProfile.js');
const {
  CAT_OF_ILL_OMEN_ID,AN_OWL_OF_LUCK_ID,NECROVALLEY_ID,
  activateFlipSearch,resolveFlipSearch,hasNecrovalleyOnField
}=require('../dist/flipSearchTagAdapter.js');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20,'fixtures need four physical 20-card decks');
const TRAP_ID='17814387';
const FIELD_ID='50913601';
const FIELD_SENTINEL_ID='86318356';
const NON_FIELD_SPELL_ID='76103675';
let sequence=0;
function scenario(name,run){test(name,run);}
function member(seat){return 'm677-seat-'+seat;}
function deckFor(seat){
  const base=NORMALS.slice(0,19);
  if(seat===0)return [...base,FIELD_ID];
  if(seat===1)return [...base,FIELD_SENTINEL_ID];
  return NORMALS.slice(0,20);
}
function create(first=0,seed='default'){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M677 Seat '+seat,cards:deckFor(seat)
  })),{classic:true,first,seed:'m677-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function addSource(state,team,ownerSeat,effect='cat-trap'){
  const physical=holder(state,ownerSeat),card=physical.deck.shift();
  assert.ok(card,'source fixture must exist in physical Deck');
  state.core.players[team].monsters.push({
    ...card,position:'atk',faceUp:true,entered:state.core.turn,changed:state.core.turn,
    attacked:0,atkBoost:0,defBoost:0
  });
  return {
    uid:card.uid,id:card.id,ownerSeat,
    lookup:id=>id===card.id?effect:undefined
  };
}
function addCandidate(state,seat,id){
  const uid='m'+seat+':m677-candidate-'+(++sequence);
  holder(state,seat).deck.push({uid,id});
  return uid;
}
function addFieldSentinel(state,team=1,ownerSeat=1){
  const physical=holder(state,ownerSeat),index=physical.deck.findIndex(card=>card.id===FIELD_SENTINEL_ID);
  assert.ok(index>=0,'field sentinel fixture must exist');
  const [card]=physical.deck.splice(index,1);
  state.core.players[team].field={...card,faceUp:true,setTurn:Math.max(0,state.core.turn-1)};
  return card.uid;
}
function addBackrow(state,team,ownerSeat,id=TRAP_ID){
  const uid=addCandidate(state,ownerSeat,id),physical=holder(state,ownerSeat);
  const index=physical.deck.findIndex(card=>card.uid===uid);
  const [card]=physical.deck.splice(index,1);
  state.core.players[team].backrow.push({...card,faceUp:false,setTurn:0});
  return uid;
}
function moveHand(state,seat,count){
  const physical=holder(state,seat);
  physical.hand.push(...physical.deck.splice(0,count));
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
function event(state,actorSeat,source,activationId){
  return {
    activationId:activationId??'m677:'+state.core.turn+':'+source.uid+':'+(++sequence),
    actorSeat,sourceUid:source.uid
  };
}
function activate(state,actorSeat,source,activationId){
  return activateFlipSearch(state,event(state,actorSeat,source,activationId),source.lookup);
}
function resolve(activation,choice=null,negated=false,hasNecro){
  return resolveFlipSearch(activation.state,activation.plan,choice,negated,hasNecro);
}
function findCandidate(state,seat,id){
  return holder(state,seat).deck.find(card=>card.id===id);
}
function removeFieldCandidate(state,seat,id){
  const physical=holder(state,seat),index=physical.deck.findIndex(card=>card.id===id);
  if(index>=0){const [card]=physical.deck.splice(index,1);state.core.players[seat%2].grave.push(card);}
}
function sourceToGrave(state,team,source){
  const field=state.core.players[team].monsters,index=field.findIndex(card=>card.uid===source.uid);
  assert.ok(index>=0);
  const [card]=field.splice(index,1);
  state.core.players[source.ownerSeat%2].grave.push(card);
}

scenario('candidate card IDs stay outside the playable catalogue and default lookup is explicit',()=>{
  assert.equal(getPlayableCard(CAT_OF_ILL_OMEN_ID),undefined);
  assert.equal(getPlayableCard(AN_OWL_OF_LUCK_ID),undefined);
  const adapter=require('../dist/flipSearchTagAdapter.js');
  assert.equal(adapter.defaultFlipSearchEffect(CAT_OF_ILL_OMEN_ID),'cat-trap');
  assert.equal(adapter.defaultFlipSearchEffect(AN_OWL_OF_LUCK_ID),'owl-field');
  assert.equal(engineCatalog.some(card=>card.id===CAT_OF_ILL_OMEN_ID),false);
  assert.equal(engineCatalog.some(card=>card.id===AN_OWL_OF_LUCK_ID),false);
});
scenario('activation records a face-up flip trigger without mutating the input or exposing a Deck choice',()=>{
  const state=create(0,'activation-immutable'),source=addSource(state,0,2),before=inventory(state),original=JSON.stringify(state);
  const activation=activate(state,0,source);
  assert.equal(activation.status,'triggered');
  assert.equal(JSON.stringify(state),original);
  assert.ok(activation.state.flipSearchPending.some(item=>item.activationId===activation.plan.activationId));
  assert.ok(activation.state.core.players[0].monsters.some(card=>card.uid===source.uid));
  assertConserved(activation.state,before);assertRules(activation.state);
});
scenario('only the active physical member of the controlling team can register the trigger',()=>{
  const state=create(0,'inactive-partner'),source=addSource(state,0,2);
  assert.throws(()=>activate(state,2,source),/participante ativo/);
});
scenario('a face-down source cannot register a FLIP effect a second time',()=>{
  const state=create(0,'face-down-source'),source=addSource(state,0,2);
  state.core.players[0].monsters.find(card=>card.uid===source.uid).faceUp=false;
  assert.throws(()=>activate(state,0,source),/face para cima/);
});
scenario('a source controlled by the opposing team is not accepted',()=>{
  const state=create(0,'opposing-source'),source=addSource(state,1,1);
  assert.throws(()=>activate(state,0,source),/não está no campo/);
});
scenario('an unrelated monster cannot borrow either search definition',()=>{
  const state=create(0,'unknown-source'),source=addSource(state,0,2);
  assert.throws(()=>activateFlipSearch(state,event(state,0,source),()=>undefined),/não pertence/);
});
scenario('invalid physical seat and empty activation identifier are rejected',()=>{
  const state=create(0,'invalid-event'),source=addSource(state,0,2);
  assert.throws(()=>activateFlipSearch(state,{activationId:'bad',actorSeat:4,sourceUid:source.uid},source.lookup),/inválido/);
  assert.throws(()=>activateFlipSearch(state,{activationId:' ',actorSeat:0,sourceUid:source.uid},source.lookup),/inválido/);
});
scenario('Cat selects a Trap by UID and places that exact physical card on top of the active Deck',()=>{
  const state=create(0,'cat-top'),source=addSource(state,0,2),target=addCandidate(state,0,TRAP_ID),before=inventory(state);
  const activation=activate(state,0,source),result=resolve(activation,{selectedUid:target,destination:'top'});
  assert.equal(result.status,'searched-to-top');
  assert.equal(holder(result.state,0).deck[0].uid,target);
  assert.equal(result.receipt.selectedCardId,TRAP_ID);
  assert.equal(result.receipt.privateSeat,0);assert.equal(result.receipt.visibility,'private');
  assertConserved(result.state,before);assertRules(result.state);
});
scenario('Owl selects only a Field Spell and places it on top of the active Deck',()=>{
  const state=create(0,'owl-top'),source=addSource(state,0,2,'owl-field'),target=findCandidate(state,0,FIELD_ID);
  assert.ok(target);
  const activation=activate(state,0,source),result=resolve(activation,{selectedUid:target.uid,destination:'top'});
  assert.equal(result.status,'searched-to-top');
  assert.equal(holder(result.state,0).deck[0].uid,target.uid);
  assert.equal(holder(result.state,0).deck[0].id,FIELD_ID);assertRules(result.state);
});
scenario('Cat cannot select a Spell even when the Deck contains one',()=>{
  const state=create(0,'cat-wrong-type'),source=addSource(state,0,2),activation=activate(state,0,source);
  const field=findCandidate(state,0,FIELD_ID);
  assert.ok(field);
  assert.throws(()=>resolve(activation,{selectedUid:field.uid,destination:'top'}),/Tipo de carta incompatível/);
});
scenario('Owl cannot select a Trap even when a Field Spell is also available',()=>{
  const state=create(0,'owl-wrong-type'),source=addSource(state,0,2,'owl-field'),trap=addCandidate(state,0,TRAP_ID);
  const activation=activate(state,0,source);
  assert.throws(()=>resolve(activation,{selectedUid:trap,destination:'top'}),/Tipo de carta incompatível/);
});
scenario('Owl rejects a Normal Spell that is not a Field Spell',()=>{
  const state=create(0,'owl-normal-spell'),source=addSource(state,0,2,'owl-field'),normal=addCandidate(state,0,NON_FIELD_SPELL_ID);
  const activation=activate(state,0,source);
  assert.throws(()=>resolve(activation,{selectedUid:normal,destination:'top'}),/Tipo de carta incompatível/);
});
scenario('Necrovalley on either team Field Zone permits the optional hand destination',()=>{
  const state=create(0,'necro-opponent-field'),source=addSource(state,0,2),target=addCandidate(state,0,TRAP_ID);
  const sentinel=addFieldSentinel(state,1,1),hasNecro=duel=>duel.core.players.some(player=>player.field?.uid===sentinel&&player.field.faceUp);
  const activation=activate(state,0,source),beforeHand=holder(activation.state,0).hand.length;
  const result=resolve(activation,{selectedUid:target,destination:'hand'},false,hasNecro);
  assert.equal(result.status,'added-to-hand');
  assert.equal(holder(result.state,0).hand.length,beforeHand+1);
  assert.equal(holder(result.state,0).hand.at(-1).uid,target);assertRules(result.state);
});
scenario('hand destination is rejected without face-up Necrovalley',()=>{
  const state=create(0,'no-necro-hand'),source=addSource(state,0,2),target=addCandidate(state,0,TRAP_ID);
  const activation=activate(state,0,source);
  assert.throws(()=>resolve(activation,{selectedUid:target,destination:'hand'}),/Somente Necrovalley/);
});
scenario('the six-card hand limit is checked at End Phase, not during the search resolution',()=>{
  const state=create(0,'hand-seven'),source=addSource(state,0,2);
  moveHand(state,0,6);
  const target=addCandidate(state,0,TRAP_ID),sentinel=addFieldSentinel(state,1,1);
  const hasNecro=duel=>duel.core.players.some(player=>player.field?.uid===sentinel&&player.field.faceUp);
  const activation=activate(state,0,source),result=resolve(activation,{selectedUid:target,destination:'hand'},false,hasNecro);
  assert.equal(holder(result.state,0).hand.length,7);
  assert.equal(result.state.core.handFlow,undefined);
  assert.equal(rulesFor(result.state.core).handCheck,'end');assertRules(result.state);
});
scenario('a partner-owned source searches the active member Deck, not the source owner Deck',()=>{
  const state=create(0,'partner-source'),source=addSource(state,0,2),target=addCandidate(state,0,TRAP_ID);
  const activation=activate(state,0,source),result=resolve(activation,{selectedUid:target,destination:'top'});
  assert.equal(holder(result.state,0).deck[0].uid,target);
  assert.equal(source.ownerSeat,2);assert.equal(result.receipt.privateSeat,0);
});
scenario('a stolen source controlled by the active team still searches the active member Deck',()=>{
  const state=create(0,'stolen-source'),source=addSource(state,0,1),target=addCandidate(state,0,TRAP_ID);
  const activation=activate(state,0,source),result=resolve(activation,{selectedUid:target,destination:'top'});
  assert.equal(source.ownerSeat,1);assert.equal(result.receipt.privateSeat,0);
  assert.equal(holder(result.state,0).deck[0].uid,target);
});
scenario('a Trap in the partner Deck is not a candidate for the active member',()=>{
  const state=create(0,'partner-deck-private'),source=addSource(state,0,2),partnerTarget=addCandidate(state,2,TRAP_ID);
  const activation=activate(state,0,source),result=resolve(activation);
  assert.equal(result.status,'no-valid-card');
  assert.equal(holder(result.state,2).deck.some(card=>card.uid===partnerTarget),true);
});
scenario('the search checks the current Deck at resolution, including cards added after the trigger',()=>{
  const state=create(0,'current-deck-at-resolution'),source=addSource(state,0,2),activation=activate(state,0,source);
  const target=addCandidate(activation.state,0,TRAP_ID);
  const result=resolve(activation,{selectedUid:target,destination:'top'});
  assert.equal(holder(result.state,0).deck[0].uid,target);
});
scenario('a mandatory FLIP trigger with no matching card resolves without moving another card',()=>{
  const state=create(0,'no-valid-trap'),source=addSource(state,0,2),before=inventory(state);
  const activation=activate(state,0,source),result=resolve(activation);
  assert.equal(result.status,'no-valid-card');assert.equal(result.receipt.selectedUid,null);
  assertConserved(result.state,before);
});
scenario('negation leaves the private Deck and hand untouched and consumes no RNG',()=>{
  const state=create(0,'negated'),source=addSource(state,0,2),target=addCandidate(state,0,TRAP_ID);
  const activation=activate(state,0,source),beforeDeck=holder(activation.state,0).deck.map(card=>card.uid);
  const beforeHand=holder(activation.state,0).hand.map(card=>card.uid),counter=activation.state.core.random.counter;
  const result=resolve(activation,null,true);
  assert.equal(result.status,'negated');
  assert.deepEqual(holder(result.state,0).deck.map(card=>card.uid),beforeDeck);
  assert.deepEqual(holder(result.state,0).hand.map(card=>card.uid),beforeHand);
  assert.equal(result.state.core.random.counter,counter);assert.ok(target);
});
scenario('duplicate trigger identifiers cannot register twice',()=>{
  const state=create(0,'duplicate-trigger'),source=addSource(state,0,2),eventData=event(state,0,source,'m677-duplicate');
  const first=activateFlipSearch(state,eventData,source.lookup);
  assert.throws(()=>activateFlipSearch(first.state,eventData,source.lookup),/já foi registrado/);
});
scenario('duplicate resolution is idempotent and returns the same immutable state',()=>{
  const state=create(0,'duplicate-resolution'),source=addSource(state,0,2),target=addCandidate(state,0,TRAP_ID);
  const activation=activate(state,0,source),first=resolve(activation,{selectedUid:target,destination:'top'});
  const duplicate=resolveFlipSearch(first.state,activation.plan,{selectedUid:target,destination:'top'});
  assert.equal(duplicate.status,'duplicate');assert.equal(duplicate.state,first.state);
});
scenario('tampered plans cannot change the selected effect or physical actor',()=>{
  const state=create(0,'tampered-plan'),source=addSource(state,0,2),activation=activate(state,0,source);
  const tampered={...activation.plan,effect:'owl-field'};
  assert.throws(()=>resolveFlipSearch(activation.state,tampered,null),/não corresponde/);
});
scenario('a plan cannot resolve after its turn has become stale',()=>{
  const state=create(0,'stale-turn'),source=addSource(state,0,2),activation=activate(state,0,source);
  const stale=structuredClone(activation.state);stale.core.turn++;
  assert.throws(()=>resolveFlipSearch(stale,activation.plan,null),/obsoleto/);
});
scenario('the trigger resolves even if its source leaves the field after activation',()=>{
  const state=create(0,'source-removed'),source=addSource(state,0,2),target=addCandidate(state,0,TRAP_ID);
  const activation=activate(state,0,source);sourceToGrave(activation.state,0,source);
  const result=resolve(activation,{selectedUid:target,destination:'top'});
  assert.equal(result.status,'searched-to-top');assert.equal(holder(result.state,0).deck[0].uid,target);
});
scenario('a selected UID from another physical Deck cannot be used',()=>{
  const state=create(0,'wrong-owner-selection'),source=addSource(state,0,2),target=addCandidate(state,2,TRAP_ID);
  const activation=activate(state,0,source);
  assert.throws(()=>resolve(activation,{selectedUid:target,destination:'top'}),/Não há carta válida|não está no Deck/);
});
scenario('the top-of-Deck slot is index zero, the same position consumed by a draw',()=>{
  const state=create(0,'top-order'),source=addSource(state,0,2),target=addCandidate(state,0,TRAP_ID);
  const activation=activate(state,0,source),result=resolve(activation,{selectedUid:target,destination:'top'});
  assert.equal(holder(result.state,0).deck[0].uid,target);
  assert.equal(holder(result.state,0).deck[0].uid,holder(result.state,0).deck.slice(0,1)[0].uid);
});
scenario('the public TagDuel projection does not reveal the searched card UID or identity',()=>{
  const state=create(0,'public-private'),source=addSource(state,0,2),target=addCandidate(state,0,TRAP_ID);
  const activation=activate(state,0,source),result=resolve(activation,{selectedUid:target,destination:'top'});
  const publicState=JSON.stringify(tag.publicTagDuel(result.state));
  assert.equal(publicState.includes(target),false);assert.equal(publicState.includes(TRAP_ID),false);
});
scenario('Necrovalley is recognized only face-up in a Field Zone, never in backrow',()=>{
  const fake={core:{players:[{field:{id:NECROVALLEY_ID,faceUp:true}},{field:null}]}};
  assert.equal(hasNecrovalleyOnField(fake),true);
  fake.core.players[0].field.faceUp=false;assert.equal(hasNecrovalleyOnField(fake),false);
  fake.core.players[0].field=null;
  fake.core.players[1].field=null;
  fake.core.players[0].backrow=[{id:NECROVALLEY_ID,faceUp:true}];
  assert.equal(hasNecrovalleyOnField(fake),false);
});
scenario('Field Zone remains separate while all three shared backrow slots are occupied',()=>{
  const state=create(0,'field-separate'),source=addSource(state,0,2);
  addFieldSentinel(state,1,1);
  addBackrow(state,0,2);addBackrow(state,0,2);addBackrow(state,0,2);
  const activation=activate(state,0,source);
  assert.equal(activation.state.core.players[0].backrow.length,3);
  assert.ok(activation.state.core.players[1].field);
});
scenario('fourth backrow card is rejected without treating Field Zone as a fourth slot',()=>{
  const state=create(0,'backrow-overflow'),source=addSource(state,0,2);
  addBackrow(state,0,2);addBackrow(state,0,2);addBackrow(state,0,2);addBackrow(state,0,2);
  assert.throws(()=>activate(state,0,source),/limite de zonas|três Spell\/Trap Zones/);
});
scenario('fourth monster in a shared team field is rejected',()=>{
  const state=create(0,'monster-overflow'),source=addSource(state,0,2);
  for(let i=0;i<3;i++){
    const owner=i%2===0?2:0,physical=holder(state,owner),card=physical.deck.shift();
    state.core.players[0].monsters.push({...card,position:'atk',faceUp:true,entered:state.core.turn,changed:state.core.turn,attacked:0,atkBoost:0,defBoost:0});
  }
  assert.throws(()=>activate(state,0,source),/limite de zonas|três Monster Zones/);
});
scenario('main Deck below 20 is rejected instead of silently drawing or granting cards',()=>{
  const state=create(0,'deck-underflow'),source=addSource(state,0,2);
  holder(state,3).deck.pop();
  assert.throws(()=>activate(state,0,source),/limite 20–30/);
});
scenario('main Deck above 30 is rejected instead of accepting overflow',()=>{
  const state=create(0,'deck-overflow'),source=addSource(state,0,2);
  for(let i=20;i<31;i++)holder(state,3).deck.push({uid:'m3:m677-overflow-'+i,id:NORMALS[i]});
  assert.throws(()=>activate(state,0,source),/limite 20–30/);
});
scenario('six Extra Deck cards are rejected; the profile cap remains five',()=>{
  const state=create(0,'extra-overflow'),source=addSource(state,0,2);
  const fusionIds=engineCatalog.filter(card=>card.fusion).slice(0,6).map(card=>card.id);
  assert.equal(fusionIds.length,6);
  const extra=holder(state,0).extra??(holder(state,0).extra=[]);
  fusionIds.forEach((id,index)=>extra.push({uid:'m0:m677-extra-'+index,id}));
  assert.throws(()=>activate(state,0,source),/limite de zonas|Extra Deck físico excedeu cinco/);
});
scenario('the active seat can be seat two and still searches its own private Deck',()=>{
  const state=create(2,'active-seat-two'),source=addSource(state,0,0),target=addCandidate(state,2,TRAP_ID);
  const activation=activate(state,2,source),result=resolve(activation,{selectedUid:target,destination:'top'});
  assert.equal(result.receipt.privateSeat,2);assert.equal(holder(result.state,2).deck[0].uid,target);
});
scenario('the default Necrovalley predicate checks both teams without conflating other Field Spells',()=>{
  const fake={core:{players:[{field:{id:FIELD_SENTINEL_ID,faceUp:true}},{field:null}]}};
  assert.equal(hasNecrovalleyOnField(fake),false);
  fake.core.players[1].field={id:NECROVALLEY_ID,faceUp:true};
  assert.equal(hasNecrovalleyOnField(fake),true);
});
scenario('selection preserves duplicate copies as separate physical UIDs',()=>{
  const state=create(0,'duplicate-copies'),source=addSource(state,0,2);
  const first=addCandidate(state,0,TRAP_ID),second=addCandidate(state,0,TRAP_ID);
  const activation=activate(state,0,source),result=resolve(activation,{selectedUid:second,destination:'top'});
  assert.equal(holder(result.state,0).deck[0].uid,second);
  assert.ok(holder(result.state,0).deck.some(card=>card.uid===first));
});
scenario('searching to hand preserves the same UID and does not create a second card',()=>{
  const state=create(0,'hand-identity'),source=addSource(state,0,2),target=addCandidate(state,0,TRAP_ID);
  const sentinel=addFieldSentinel(state,1,1),hasNecro=duel=>duel.core.players.some(player=>player.field?.uid===sentinel&&player.field.faceUp);
  const before=inventory(state),activation=activate(state,0,source);
  const result=resolve(activation,{selectedUid:target,destination:'hand'},false,hasNecro);
  assert.equal(holder(result.state,0).hand.at(-1).uid,target);
  assertConserved(result.state,before);
});
scenario('the adapter never writes the private selection to the duel log or random stream',()=>{
  const state=create(0,'no-log-rng'),source=addSource(state,0,2),target=addCandidate(state,0,TRAP_ID);
  const activation=activate(state,0,source),log=JSON.stringify(activation.state.core.log),counter=activation.state.core.random.counter;
  const result=resolve(activation,{selectedUid:target,destination:'top'});
  assert.equal(JSON.stringify(result.state.core.log),log);
  assert.equal(result.state.core.random.counter,counter);
});
scenario('an invalid source UID cannot be used to forge a physical owner',()=>{
  const state=create(0,'bad-source-uid'),source=addSource(state,0,2);
  assert.throws(()=>activateFlipSearch(state,{activationId:'m677-bad-uid',actorSeat:0,sourceUid:'not-a-physical-uid'},source.lookup),/não está no campo/);
});
