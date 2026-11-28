'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createTagDuel,tagInventory,tagNormalCardIds}=require('../dist/tagDuel');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
 CARD_OF_SAFE_RETURN_ID,CARD_OF_SAFE_RETURN_KONAMI_CID,SPIRIT_OF_THE_POT_OF_GREED_ID,
 SPIRIT_OF_THE_POT_OF_GREED_KONAMI_CID,POT_OF_GREED_ID,POT_OF_GREED_KONAMI_CID,
 createDrawTriggerLedger,createExactDrawTriggerLookups,captureDrawTriggerEvent,
 resolveDrawTriggerEvent,assertDrawTriggerRules
}=require('../dist/drawTriggerTagAdapter');

const enabled=getEnabledCardIds();
const traps=enabled.filter(id=>getDuelCard(id)?.kind==='trap');
const spells=enabled.filter(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field);
const monsters=enabled.filter(id=>getDuelCard(id)?.kind==='monster');
const [trapA,trapB,trapC]=traps;
const [safePlaceholder,potPlaceholder]=spells;
const spiritPlaceholder=monsters[0];
const normalIds=tagNormalCardIds.slice(0,14);
assert.ok(trapA&&trapB&&trapC&&safePlaceholder&&potPlaceholder&&spiritPlaceholder);
assert.equal(normalIds.length,14);
const deck=[...normalIds,trapA,trapB,trapC,safePlaceholder,potPlaceholder,spiritPlaceholder];
assert.equal(deck.length,20);
const lookups={
 cardOfSafeReturn:id=>id===safePlaceholder,
 spiritOfPotOfGreed:id=>id===spiritPlaceholder,
 potOfGreed:id=>id===potPlaceholder
};
const players=()=>[
 {id:'p0',name:'Azul A',cards:[...deck],extra:[]},
 {id:'p1',name:'Vermelho A',cards:[...deck],extra:[]},
 {id:'p2',name:'Azul B',cards:[...deck],extra:[]},
 {id:'p3',name:'Vermelho B',cards:[...deck],extra:[]}
];
function base(first=0){return createTagDuel(players(),{seed:'m692-draw-triggers',first,classic:true});}
function setWindow(duel,team){
 duel.cursor=duel.active[team];duel.core.current=team;duel.core.priority=team;
 if(duel.core.teamRotation){duel.core.teamRotation.cursor=duel.cursor;duel.core.teamRotation.active=duel.active;duel.core.teamRotation.reserves=duel.reserves;}
}
function holder(duel,seat){
 const team=seat%2;const held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
 if(!held)throw new Error('Assento físico indisponível: '+seat);return held;
}
function take(duel,seat,id){
 const held=holder(duel,seat);
 for(const pool of [held.deck,held.hand,held.extra??[]]){
  const i=pool.findIndex(card=>card.id===id);if(i>=0)return pool.splice(i,1)[0];
 }
 throw new Error('Carta física indisponível: '+seat+'/'+id);
}
function placeSafeReturn(duel,seat,{faceUp=true,resolved=true}={}){
 const card=take(duel,seat,safePlaceholder);
 const source={...card,setTurn:duel.core.turn,faceUp,resolved};
 duel.core.players[seat%2].backrow.push(source);synchronizeCardLifetimes(duel.core);return source;
}
function placeSpirit(duel,seat,{faceUp=true,position='atk'}={}){
 const card=take(duel,seat,spiritPlaceholder);
 const monster={...card,position,faceUp,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:seat%2};
 duel.core.players[seat%2].monsters.push(monster);synchronizeCardLifetimes(duel.core);return monster;
}
function placePot(duel,seat,location='hand'){
 const card=take(duel,seat,potPlaceholder);
 if(location==='hand')holder(duel,seat).hand.push(card);
 else duel.core.players[seat%2].backrow.push({...card,setTurn:duel.core.turn-1,faceUp:true,resolved:false});
 synchronizeCardLifetimes(duel.core);return card;
}
function summonFromGrave(duel,ownerSeat,controllerTeam){
 const card=take(duel,ownerSeat,normalIds[0]),graveyardTeam=ownerSeat%2;
 duel.core.players[graveyardTeam].grave.push(card);
 const index=duel.core.players[graveyardTeam].grave.findIndex(item=>item.uid===card.uid);
 const moved=duel.core.players[graveyardTeam].grave.splice(index,1)[0];
 const monster={...moved,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:graveyardTeam};
 duel.core.players[controllerTeam].monsters.push(monster);synchronizeCardLifetimes(duel.core);
 return {uid:monster.uid,graveyardTeam};
}
function safeEvent(duel,origins,{eventId='safe-1',sequence=1,actorSeat=duel.active[0],phase='main1',damageStep=false,negatedSourceUids}={}){
 return {kind:'graveyard-special-summon',eventId,sequence,actorSeat,phase,damageStep,
  summonedUids:origins.map(origin=>origin.uid),origins,...(negatedSourceUids?{negatedSourceUids}:{})};
}
function potEvent(duel,source,{eventId='pot-1',sequence=1,actorSeat=duel.active[0],phase='main1',sourceLocation='hand',negatedSourceUids}={}){
 return {kind:'pot-of-greed-activation',eventId,sequence,actorSeat,phase,sourceUid:source.uid,sourceLocation,
  ...(negatedSourceUids?{negatedSourceUids}:{})};
}
function applyPlans(duel,plans){
 for(const plan of plans){
  if(!plan.actualDrawCount)continue;
  const held=holder(duel,plan.recipientSeat);
  assert.equal(held.deck.length,plan.deckCountAtPlan,'Deck físico mudou antes da compra planejada');
  assert.equal(held.hand.length,plan.handCountAtPlan,'Mão física mudou antes da compra planejada');
  held.hand.push(...held.deck.splice(0,plan.actualDrawCount));
 }
 synchronizeCardLifetimes(duel.core);
}
function removeBackrowToGrave(duel,source){
 const team=Number(source.uid[1])%2,player=duel.core.players[team],i=player.backrow.findIndex(card=>card.uid===source.uid);
 if(i<0)throw new Error('Fonte backrow não encontrada.');
 player.grave.push(player.backrow.splice(i,1)[0]);synchronizeCardLifetimes(duel.core);
}
function removeMonsterToGrave(duel,source){
 const team=Number(source.uid[1])%2,player=duel.core.players[team],i=player.monsters.findIndex(card=>card.uid===source.uid);
 if(i<0)throw new Error('Fonte Monster Zone não encontrada.');
 player.grave.push(player.monsters.splice(i,1)[0]);synchronizeCardLifetimes(duel.core);
}
function moveDeckToGrave(duel,seat,keep){
 const held=holder(duel,seat),team=seat%2,rest=held.deck.splice(keep);
 duel.core.players[team].grave.push(...rest);synchronizeCardLifetimes(duel.core);
}
function captureSafe(duel,source,origin,options={}){
 const ledger=createDrawTriggerLedger(),event=safeEvent(duel,[origin],options);
 return {event,ledger,result:captureDrawTriggerEvent(duel,ledger,event,lookups),source};
}
function capturePot(duel,source,options={}){
 const ledger=createDrawTriggerLedger(),event=potEvent(duel,source,options);
 return {event,ledger,result:captureDrawTriggerEvent(duel,ledger,event,lookups),source};
}

test('candidate identities and official Konami IDs are exact and remain outside the live catalog',()=>{
 assert.equal(CARD_OF_SAFE_RETURN_ID,'57953380');assert.equal(CARD_OF_SAFE_RETURN_KONAMI_CID,5123);
 assert.equal(SPIRIT_OF_THE_POT_OF_GREED_ID,'04896788');assert.equal(SPIRIT_OF_THE_POT_OF_GREED_KONAMI_CID,5819);
 assert.equal(POT_OF_GREED_ID,'55144522');assert.equal(POT_OF_GREED_KONAMI_CID,4844);
 assert.equal(getDuelCard(CARD_OF_SAFE_RETURN_ID),undefined);assert.equal(getDuelCard(SPIRIT_OF_THE_POT_OF_GREED_ID),undefined);
 assert.equal(getEnabledCardIds().includes(CARD_OF_SAFE_RETURN_ID),false);
 assert.equal(getEnabledCardIds().includes(SPIRIT_OF_THE_POT_OF_GREED_ID),false);
 assert.equal(createExactDrawTriggerLookups().cardOfSafeReturn(CARD_OF_SAFE_RETURN_ID),true);
 assert.equal(createExactDrawTriggerLookups().spiritOfPotOfGreed(SPIRIT_OF_THE_POT_OF_GREED_ID),true);
});
test('classic rules preserve Deck 20–30, Extra 5, zones 3+3 and hand limit 6 only at End Phase',()=>{
 const duel=base();assert.equal(assertDrawTriggerRules(duel),undefined);
});
test('Card of Safe Return triggers from its team GY and draws into that team\'s active physical seat',()=>{
 const duel=base(),source=placeSafeReturn(duel,1),origin=summonFromGrave(duel,1,0);
 setWindow(duel,0);const {event,ledger,result}=captureSafe(duel,source,origin);
 assert.equal(result.status,'choice-required');assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].controllerTeam,1);assert.equal(result.candidates[0].recipientSeat,1);
 const resolved=resolveDrawTriggerEvent(duel,result.ledger,{eventId:event.eventId,acceptedSourceUids:[source.uid]},lookups);
 assert.equal(resolved.status,'triggered');assert.equal(resolved.plans[0].recipientSeat,1);
 const before=holder(duel,1).hand.length;applyPlans(duel,resolved.plans);assert.equal(holder(duel,1).hand.length,before+1);
 assert.equal(holder(duel,0).hand.length,5);
});
test('Card of Safe Return does not trigger when the summoned monster came from the opposing team GY',()=>{
 const duel=base(),source=placeSafeReturn(duel,1),origin=summonFromGrave(duel,0,1);
 setWindow(duel,1);const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),safeEvent(duel,[origin],{actorSeat:duel.active[1]}),lookups);
 assert.equal(r.status,'no-trigger');assert.equal(r.candidates.length,0);
});
test('Card of Safe Return excludes the Damage Step but allows a non-damage Battle Phase summon',()=>{
 const duel=base(),source=placeSafeReturn(duel,1),origin=summonFromGrave(duel,1,0);
 const duringDamage=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),safeEvent(duel,[origin],{damageStep:true,phase:'battle'}),lookups);
 assert.equal(duringDamage.status,'no-trigger');
 const outsideDamage=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),safeEvent(duel,[origin],{eventId:'safe-battle',sequence:2,phase:'battle',damageStep:false}),lookups);
 assert.equal(outsideDamage.status,'choice-required');assert.equal(outsideDamage.candidates[0].sourceUid,source.uid);
});
test('one simultaneous group of two monsters from the same GY triggers each copy only once',()=>{
 const duel=base(),source=placeSafeReturn(duel,1),a=summonFromGrave(duel,1,0),b=summonFromGrave(duel,3,0);
 const event=safeEvent(duel,[a,b],{eventId:'safe-two-monsters'});
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 assert.equal(r.status,'choice-required');assert.equal(r.candidates.length,1);
});
test('two Card of Safe Return copies produce two sequential, non-overlapping draws',()=>{
 const duel=base(),a=placeSafeReturn(duel,1),b=placeSafeReturn(duel,3);
 const origin=summonFromGrave(duel,1,0),event=safeEvent(duel,[origin]);
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 const resolved=resolveDrawTriggerEvent(duel,r.ledger,{eventId:event.eventId,acceptedSourceUids:[a.uid,b.uid]},lookups);
 assert.equal(resolved.plans.length,2);assert.deepEqual(resolved.plans.map(p=>p.deckCountAtPlan),[13,12]);
 assert.deepEqual(resolved.plans.map(p=>p.handCountAtPlan),[5,6]);
 applyPlans(duel,resolved.plans);assert.equal(holder(duel,1).hand.length,7);
});
test('Card of Safe Return must be face-up and resolved to create a trigger',()=>{
 const duel=base(),faceDown=placeSafeReturn(duel,1,{faceUp:false}),unresolved=placeSafeReturn(duel,3,{resolved:false});
 const origin=summonFromGrave(duel,1,0),event=safeEvent(duel,[origin]);
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 assert.equal(r.status,'no-trigger');assert.equal(r.candidates.length,0);
 assert.ok(faceDown.uid&&unresolved.uid);
});
test('a Card of Safe Return source negated at event capture does not trigger',()=>{
 const duel=base(),source=placeSafeReturn(duel,1),origin=summonFromGrave(duel,1,0);
 const event=safeEvent(duel,[origin],{negatedSourceUids:[source.uid]});
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 assert.equal(r.status,'no-trigger');
});
test('a source owned by a reserve teammate draws to the currently active physical teammate',()=>{
 const duel=base(2),source=placeSafeReturn(duel,1),origin=summonFromGrave(duel,1,0);
 setWindow(duel,0);const event=safeEvent(duel,[origin],{actorSeat:duel.active[0]});
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 assert.equal(r.candidates[0].recipientSeat,3);assert.equal(source.uid.slice(0,2),'m1');
});
test('the adapter never performs the End Phase hand-limit discard itself',()=>{
 const duel=base(),source=placeSafeReturn(duel,1),origin=summonFromGrave(duel,1,0),held=holder(duel,1);
 held.hand.push(...held.deck.splice(0,1));assert.equal(held.hand.length,6);const beforeDeck=held.deck.length;
 const event=safeEvent(duel,[origin]),r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 const resolved=resolveDrawTriggerEvent(duel,r.ledger,{eventId:event.eventId,acceptedSourceUids:[source.uid]},lookups);
 applyPlans(duel,resolved.plans);assert.equal(held.hand.length,7);assert.equal(held.deck.length,beforeDeck-1);
 assert.equal(require('../dist/rulesProfile').rulesFor(duel.core).handCheck,'end');
});
test('an empty physical Deck produces an explicit deck-out plan without inventing a card',()=>{
 const duel=base(),source=placeSafeReturn(duel,1),origin=summonFromGrave(duel,1,0);
 moveDeckToGrave(duel,1,0);
 const event=safeEvent(duel,[origin]),r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 const resolved=resolveDrawTriggerEvent(duel,r.ledger,{eventId:event.eventId,acceptedSourceUids:[source.uid]},lookups);
 assert.equal(resolved.status,'deck-out');assert.equal(resolved.plans[0].actualDrawCount,0);assert.equal(resolved.plans[0].deckOut,true);
});
test('event capture and resolution are idempotent even if the source later leaves the field',()=>{
 const duel=base(),source=placeSafeReturn(duel,1),origin=summonFromGrave(duel,1,0),event=safeEvent(duel,[origin]);
 const first=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 const duplicate=captureDrawTriggerEvent(duel,first.ledger,event,lookups);
 assert.equal(duplicate.status,'choice-required');
 const resolved=resolveDrawTriggerEvent(duel,duplicate.ledger,{eventId:event.eventId,acceptedSourceUids:[source.uid]},lookups);
 removeBackrowToGrave(duel,source);
 const again=captureDrawTriggerEvent(duel,resolved.ledger,event,lookups);
 assert.equal(again.status,'duplicate');
});
test('reusing an event ID with different payload is rejected',()=>{
 const duel=base(),source=placeSafeReturn(duel,1),origin=summonFromGrave(duel,1,0);
 const event=safeEvent(duel,[origin]),r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 const changed={...event,phase:'battle'};
 assert.throws(()=>captureDrawTriggerEvent(duel,r.ledger,changed,lookups),/conteúdo diferente/);
});
test('event sequence must be strictly increasing',()=>{
 const duel=base(),source=placeSafeReturn(duel,1),origin=summonFromGrave(duel,1,0);
 const first=safeEvent(duel,[origin],{sequence:2}),r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),first,lookups);
 const resolved=resolveDrawTriggerEvent(duel,r.ledger,{eventId:first.eventId,acceptedSourceUids:[]},lookups);
 const next=safeEvent(duel,[origin],{eventId:'safe-lower',sequence:2});
 assert.throws(()=>captureDrawTriggerEvent(duel,resolved.ledger,next,lookups),/estritamente crescente/);
 assert.ok(source.uid);
});
test('optional draw triggers can be declined without changing a hand or Deck',()=>{
 const duel=base(),source=placeSafeReturn(duel,1),origin=summonFromGrave(duel,1,0),event=safeEvent(duel,[origin]);
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups),before=holder(duel,1).hand.length;
 const resolved=resolveDrawTriggerEvent(duel,r.ledger,{eventId:event.eventId,acceptedSourceUids:[]},lookups);
 assert.equal(resolved.status,'declined');assert.equal(resolved.plans.length,0);assert.equal(holder(duel,1).hand.length,before);
 assert.ok(source.uid);
});
test('a source removed between trigger capture and resolution cannot draw',()=>{
 const duel=base(),source=placeSafeReturn(duel,1),origin=summonFromGrave(duel,1,0),event=safeEvent(duel,[origin]);
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);removeBackrowToGrave(duel,source);
 const resolved=resolveDrawTriggerEvent(duel,r.ledger,{eventId:event.eventId,acceptedSourceUids:[source.uid]},lookups);
 assert.equal(resolved.status,'no-trigger');assert.deepEqual(resolved.skippedSourceUids,[source.uid]);
});
test('a source negated after capture is skipped at resolution',()=>{
 const duel=base(),source=placeSafeReturn(duel,1),origin=summonFromGrave(duel,1,0),event=safeEvent(duel,[origin]);
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 const resolved=resolveDrawTriggerEvent(duel,r.ledger,{eventId:event.eventId,acceptedSourceUids:[source.uid],negatedSourceUids:[source.uid]},lookups);
 assert.equal(resolved.status,'no-trigger');assert.deepEqual(resolved.skippedSourceUids,[source.uid]);
});

test('Spirit triggers for any Pot of Greed activator and draws to that physical active seat',()=>{
 const duel=base(),spirit=placeSpirit(duel,1),pot=placePot(duel,0);
 setWindow(duel,0);const event=potEvent(duel,pot),r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 assert.equal(r.status,'choice-required');assert.equal(r.candidates.length,1);
 assert.equal(r.candidates[0].controllerTeam,1);assert.equal(r.candidates[0].recipientSeat,0);
 const resolved=resolveDrawTriggerEvent(duel,r.ledger,{eventId:event.eventId,acceptedSourceUids:[spirit.uid]},lookups);
 assert.equal(resolved.plans[0].recipientSeat,0);
 const before=holder(duel,0).hand.length;applyPlans(duel,resolved.plans);assert.equal(holder(duel,0).hand.length,before+1);
});
test('Spirit also triggers when the Pot of Greed activator controls the Spirit',()=>{
 const duel=base(),spirit=placeSpirit(duel,0),pot=placePot(duel,0),event=potEvent(duel,pot);
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 assert.equal(r.candidates[0].recipientSeat,0);assert.equal(r.candidates[0].controllerTeam,0);
 assert.equal(resolveDrawTriggerEvent(duel,r.ledger,{eventId:event.eventId,acceptedSourceUids:[spirit.uid]},lookups).status,'triggered');
});
test('Spirit must be face-up Attack Position when Pot of Greed is activated',()=>{
 const duel=base(),faceDown=placeSpirit(duel,1,{faceUp:false}),defense=placeSpirit(duel,3,{position:'def'}),pot=placePot(duel,0);
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),potEvent(duel,pot),lookups);
 assert.equal(r.status,'no-trigger');assert.equal(r.candidates.length,0);
 assert.ok(faceDown.uid&&defense.uid);
});
test('Spirit must remain face-up Attack Position until its draw effect resolves',()=>{
 const duel=base(),spirit=placeSpirit(duel,1),pot=placePot(duel,0),event=potEvent(duel,pot);
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 spirit.position='def';synchronizeCardLifetimes(duel.core);
 const resolved=resolveDrawTriggerEvent(duel,r.ledger,{eventId:event.eventId,acceptedSourceUids:[spirit.uid]},lookups);
 assert.equal(resolved.status,'no-trigger');assert.deepEqual(resolved.skippedSourceUids,[spirit.uid]);
});
test('multiple Spirits each plan one draw for the same Pot of Greed activator',()=>{
 const duel=base(),a=placeSpirit(duel,1),b=placeSpirit(duel,3),pot=placePot(duel,0),event=potEvent(duel,pot);
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 const resolved=resolveDrawTriggerEvent(duel,r.ledger,{eventId:event.eventId,acceptedSourceUids:[a.uid,b.uid]},lookups);
 assert.equal(resolved.plans.length,2);assert.deepEqual(resolved.plans.map(p=>p.recipientSeat),[0,0]);
 assert.deepEqual(resolved.plans.map(p=>p.deckCountAtPlan),[14,13]);applyPlans(duel,resolved.plans);
 assert.equal(holder(duel,0).hand.length,7);
});
test('a Pot of Greed source must belong to the physical seat that activated it',()=>{
 const duel=base(),spirit=placeSpirit(duel,1),pot=placePot(duel,1);
 const event=potEvent(duel,pot,{actorSeat:duel.active[0]});
 assert.throws(()=>captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups),/pertencer ao assento físico ativador/);
 assert.ok(spirit.uid);
});
test('Spirit cannot trigger outside the activating player Main Phase',()=>{
 const duel=base(),spirit=placeSpirit(duel,1),pot=placePot(duel,0);
 const event=potEvent(duel,pot,{phase:'battle'});
 assert.throws(()=>captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups),/Main Phase/);
 assert.ok(spirit.uid);
});
test('the activation source must be identified as Pot of Greed by the resolver lookup',()=>{
 const duel=base(),wrong=take(duel,0,trapA);
 holder(duel,0).hand.push(wrong);
 const event={kind:'pot-of-greed-activation',eventId:'bad-pot',sequence:1,actorSeat:0,phase:'main1',sourceUid:wrong.uid,sourceLocation:'hand'};
 assert.throws(()=>captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups),/Pot of Greed/);
});
test('a set Pot of Greed may be activated from the backrow on a later turn',()=>{
 const duel=base(),spirit=placeSpirit(duel,1),pot=placePot(duel,0,'backrow'),event=potEvent(duel,pot,{sourceLocation:'backrow'});
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 assert.equal(r.status,'choice-required');assert.equal(r.candidates[0].sourceUid,spirit.uid);
});
test('a Spirit negated at event capture does not create a candidate',()=>{
 const duel=base(),spirit=placeSpirit(duel,1),pot=placePot(duel,0),event=potEvent(duel,pot,{negatedSourceUids:[spirit.uid]});
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 assert.equal(r.status,'no-trigger');assert.equal(r.candidates.length,0);
});
test('a Spirit negated after capture is skipped at resolution',()=>{
 const duel=base(),spirit=placeSpirit(duel,1),pot=placePot(duel,0),event=potEvent(duel,pot);
 const r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 const resolved=resolveDrawTriggerEvent(duel,r.ledger,{eventId:event.eventId,acceptedSourceUids:[spirit.uid],negatedSourceUids:[spirit.uid]},lookups);
 assert.equal(resolved.status,'no-trigger');assert.deepEqual(resolved.skippedSourceUids,[spirit.uid]);
});
test('two Spirits with one card remaining cause the second draw to adjudicate deck-out',()=>{
 const duel=base(),a=placeSpirit(duel,1),b=placeSpirit(duel,3),pot=placePot(duel,0);
 moveDeckToGrave(duel,0,1);const event=potEvent(duel,pot),r=captureDrawTriggerEvent(duel,createDrawTriggerLedger(),event,lookups);
 const resolved=resolveDrawTriggerEvent(duel,r.ledger,{eventId:event.eventId,acceptedSourceUids:[a.uid,b.uid]},lookups);
 assert.equal(resolved.status,'deck-out');assert.deepEqual(resolved.plans.map(p=>p.actualDrawCount),[1,0]);
 assert.deepEqual(resolved.plans.map(p=>p.deckOut),[false,true]);
});
test('invalid physical deck size, zone count or Extra Deck count is rejected',()=>{
 const short=base();short.core.players[0].deck.pop();assert.throws(()=>assertDrawTriggerRules(short),/20–30/);
 const crowded=base();for(let i=0;i<4;i++){const card=take(crowded,0,normalIds[i]);crowded.core.players[0].monsters.push({...card,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,owner:0});}
 assert.throws(()=>assertDrawTriggerRules(crowded),/limite de zonas/);
 const extra=base();for(let i=0;i<6;i++)extra.core.players[0].extra.push(take(extra,0,normalIds[i]));
 assert.throws(()=>assertDrawTriggerRules(extra),/Extra Deck físico excedeu cinco/);
});
