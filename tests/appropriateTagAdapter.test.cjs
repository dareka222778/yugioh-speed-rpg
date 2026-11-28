'use strict';
const assert=require('node:assert/strict');const {test}=require('node:test');
const {createTagDuel,tagInventory,tagNormalCardIds}=require('../dist/tagDuel');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {APPROPRIATE_ID,APPROPRIATE_KONAMI_CID,createAppropriateLedger,registerAppropriateActivation,processAppropriateDraw,assertAppropriateRules}=require('../dist/appropriateTagAdapter');
const enabled=getEnabledCardIds(),traps=enabled.filter(id=>getDuelCard(id)?.kind==='trap'),[trapA,trapB,trapC]=traps;
const normalIds=tagNormalCardIds.slice(0,15),spellId=enabled.find(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field);
const jinzoId=enabled.find(id=>getDuelCard(id)?.name==='Jinzo');
assert.ok(trapA&&trapB&&trapC&&spellId&&jinzoId);assert.equal(normalIds.length,15);
assert.equal(getDuelCard(APPROPRIATE_ID),undefined);assert.equal(enabled.includes(APPROPRIATE_ID),false);
const deck=[...normalIds,trapA,trapB,trapC,spellId,jinzoId];assert.equal(deck.length,20);
const players=()=>[
 {id:'p0',name:'Azul A',cards:[...deck],extra:[]},{id:'p1',name:'Vermelho A',cards:[...deck],extra:[]},
 {id:'p2',name:'Azul B',cards:[...deck],extra:[]},{id:'p3',name:'Vermelho B',cards:[...deck],extra:[]}
];
function base(first=0){return createTagDuel(players(),{seed:'m686-appropriate',first,classic:true});}
function setWindow(duel,team){duel.cursor=duel.active[team];duel.core.current=team;duel.core.priority=team;duel.core.phase='main';
 if(duel.core.teamRotation){duel.core.teamRotation.cursor=duel.cursor;duel.core.teamRotation.active=duel.active;duel.core.teamRotation.reserves=duel.reserves;}}
function take(duel,seat,id){const team=seat%2,held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
 for(const pool of [held.hand,held.deck,held.extra??[]]){const i=pool.findIndex(c=>c.id===id);if(i>=0)return pool.splice(i,1)[0];}
 throw new Error('Carta física indisponível: '+seat+'/'+id);}
function placeAppropriate(duel,seat,id=trapA,{faceUp=true,resolved=true,setTurn=0}={}){
 const card=take(duel,seat,id),source={...card,setTurn,faceUp,resolved};duel.core.players[seat%2].backrow.push(source);synchronizeCardLifetimes(duel.core);return source;}
function placeMonster(duel,seat,id){const card=take(duel,seat,id),monster={...card,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:seat%2};
 duel.core.players[seat%2].monsters.push(monster);synchronizeCardLifetimes(duel.core);return monster;}
function drawCards(duel,seat,count){const team=seat%2,held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
 const cards=held.deck.splice(0,count);held.hand.push(...cards);synchronizeCardLifetimes(duel.core);return cards;}
function drawEvent(duel,seat,{sequence,phase='main1',count=1,eventId='draw-'+sequence,negatedSourceUids}={}){
 const cards=drawCards(duel,seat,count);return {eventId,sequence,drawingSeat:seat,phase,drawCount:cards.length,drawnUids:cards.map(c=>c.uid),...(negatedSourceUids?{negatedSourceUids}:{})};}
const lookup=id=>[trapA,trapB,trapC].includes(id);
function setup({first=0,sourceSeats=[1],drawSeat=0,sequence=1}={}){
 const duel=base(first),sources=sourceSeats.map((seat,index)=>placeAppropriate(duel,seat,index%2?trapB:trapA));
 setWindow(duel,drawSeat%2);const enablingDraw=drawEvent(duel,drawSeat,{sequence,phase:'main1',count:1});let ledger=createAppropriateLedger();
 for(const source of sources){const team=Number(source.uid[1])%2;
  const result=registerAppropriateActivation(duel,ledger,{sourceUid:source.uid,controllerTeam:team,actorSeat:duel.active[team],
   activationEventId:'activate-'+source.uid,drawEvent:enablingDraw,activationResolved:true,activationNegated:false,effectNegated:false},lookup);
  ledger=result.ledger;}
 return {duel,sources,enablingDraw,ledger};}
function applyPlan(duel,plan){const player=duel.core.players[plan.controllerTeam];
 assert.deepEqual(player.deck.slice(0,plan.expectedDeckTopUids.length).map(c=>c.uid),plan.expectedDeckTopUids);
 const cards=player.deck.splice(0,plan.actualDrawCount);player.hand.push(...cards);synchronizeCardLifetimes(duel.core);}
function moveDeckToGraveExcept(duel,team,keep){const player=duel.core.players[team],kept=player.deck.splice(0,keep),rest=player.deck.splice(0);
 player.grave.push(...rest.map(c=>({uid:c.uid,id:c.id})));synchronizeCardLifetimes(duel.core);return kept;}

test('Appropriate has the official identity and remains outside the live catalog',()=>{
 assert.equal(APPROPRIATE_ID,'48539234');assert.equal(APPROPRIATE_KONAMI_CID,4947);assert.equal(getDuelCard(APPROPRIATE_ID),undefined);assert.equal(enabled.includes(APPROPRIATE_ID),false);});
test('a successful activation arms only after an opponent draw outside Draw Phase',()=>{
 const {sources,enablingDraw,ledger}=setup();assert.equal(ledger.activations.length,1);assert.equal(ledger.activations[0].sourceUid,sources[0].uid);
 assert.equal(ledger.activations[0].armedAfterSequence,enablingDraw.sequence);assert.equal(ledger.activations[0].setTurn,0);});
test('the draw that enabled activation is not itself counted',()=>{
 const {duel,enablingDraw,ledger}=setup();const r=processAppropriateDraw(duel,ledger,enablingDraw,lookup);
 assert.equal(r.status,'no-trigger');assert.equal(r.plans.length,0);});
test('a later opponent draw outside Draw Phase plans two cards for the controller team',()=>{
 const {duel,ledger}=setup(),event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1}),r=processAppropriateDraw(duel,ledger,event,lookup);
 assert.equal(r.status,'triggered');assert.equal(r.plans.length,1);assert.equal(r.plans[0].controllerTeam,1);assert.equal(r.plans[0].drawSeat,1);
 assert.equal(r.plans[0].requestedDrawCount,2);assert.equal(r.plans[0].actualDrawCount,2);});
test('a teammate-owned Trap still draws into the active physical seat of its team',()=>{
 const {duel,ledger,sources}=setup({first:2,sourceSeats:[1],drawSeat:2}),event=drawEvent(duel,2,{sequence:2,phase:'battle',count:1});
 const r=processAppropriateDraw(duel,ledger,event,lookup);assert.equal(sources[0].uid.slice(0,2),'m1');assert.equal(r.plans[0].drawSeat,3);
 assert.ok(r.plans[0].drawnCards.every(c=>c.uid.startsWith('m3:')));});
test('the controller team does not trigger its own Appropriate when it draws',()=>{
 const {duel,ledger}=setup(),own=drawEvent(duel,1,{sequence:2,phase:'main1',count:1});
 assert.equal(processAppropriateDraw(duel,ledger,own,lookup).status,'no-trigger');});
test('Appropriate cannot be activated during either Draw Phase',()=>{
 const duel=base(),source=placeAppropriate(duel,1);setWindow(duel,0);const event=drawEvent(duel,0,{sequence:1,phase:'draw',count:1});
 const r=registerAppropriateActivation(duel,createAppropriateLedger(),{sourceUid:source.uid,controllerTeam:1,actorSeat:1,activationEventId:'act-draw-phase',
  drawEvent:event,activationResolved:true,activationNegated:false,effectNegated:false},lookup);
 assert.equal(r.status,'not-triggerable');assert.equal(r.ledger.activations.length,0);});
test('Appropriate cannot be activated by its own team draw',()=>{
 const duel=base(),source=placeAppropriate(duel,1);setWindow(duel,1);const event=drawEvent(duel,1,{sequence:1,phase:'main1',count:1});
 const r=registerAppropriateActivation(duel,createAppropriateLedger(),{sourceUid:source.uid,controllerTeam:1,actorSeat:1,activationEventId:'act-own-draw',
  drawEvent:event,activationResolved:true,activationNegated:false,effectNegated:false},lookup);assert.equal(r.status,'not-triggerable');});
test('a Trap set this turn cannot arm Appropriate',()=>{
 const duel=base(),source=placeAppropriate(duel,1,trapA,{setTurn:duel.core.turn});setWindow(duel,0);const event=drawEvent(duel,0,{sequence:1,phase:'main1',count:1});
 assert.throws(()=>registerAppropriateActivation(duel,createAppropriateLedger(),{sourceUid:source.uid,controllerTeam:1,actorSeat:1,activationEventId:'act-same-turn',
  drawEvent:event,activationResolved:true,activationNegated:false,effectNegated:false},lookup),/turno anterior/);});
test('Jinzo blocks the activation before Appropriate can arm',()=>{
 const duel=base(),source=placeAppropriate(duel,1);placeMonster(duel,0,jinzoId);setWindow(duel,0);const event=drawEvent(duel,0,{sequence:1,phase:'main1',count:1});
 const r=registerAppropriateActivation(duel,createAppropriateLedger(),{sourceUid:source.uid,controllerTeam:1,actorSeat:1,activationEventId:'act-jinzo',
  drawEvent:event,activationResolved:true,activationNegated:false,effectNegated:false},lookup);assert.equal(r.status,'activation-blocked');});
test('a negated activation does not arm the Trap',()=>{
 const duel=base(),source=placeAppropriate(duel,1);setWindow(duel,0);const event=drawEvent(duel,0,{sequence:1,phase:'main1',count:1});
 const r=registerAppropriateActivation(duel,createAppropriateLedger(),{sourceUid:source.uid,controllerTeam:1,actorSeat:1,activationEventId:'act-negated',
  drawEvent:event,activationResolved:false,activationNegated:true,effectNegated:false},lookup);assert.equal(r.status,'activation-negated');assert.equal(r.ledger.activations.length,0);});
test('an activation whose effect is negated does not arm the Trap',()=>{
 const duel=base(),source=placeAppropriate(duel,1);setWindow(duel,0);const event=drawEvent(duel,0,{sequence:1,phase:'main1',count:1});
 const r=registerAppropriateActivation(duel,createAppropriateLedger(),{sourceUid:source.uid,controllerTeam:1,actorSeat:1,activationEventId:'act-effect-negated',
  drawEvent:event,activationResolved:true,activationNegated:false,effectNegated:true},lookup);assert.equal(r.status,'effect-negated');assert.equal(r.ledger.activations.length,0);});
test('an unresolved activation does not arm the Trap',()=>{
 const duel=base(),source=placeAppropriate(duel,1);setWindow(duel,0);const event=drawEvent(duel,0,{sequence:1,phase:'main1',count:1});
 const r=registerAppropriateActivation(duel,createAppropriateLedger(),{sourceUid:source.uid,controllerTeam:1,actorSeat:1,activationEventId:'act-unresolved',
  drawEvent:event,activationResolved:false,activationNegated:false,effectNegated:false},lookup);assert.equal(r.status,'not-resolved');});
test('a resolved activation cannot also be marked activation-negated',()=>{
 const duel=base(),source=placeAppropriate(duel,1);setWindow(duel,0);const event=drawEvent(duel,0,{sequence:1,phase:'main1',count:1});
 assert.throws(()=>registerAppropriateActivation(duel,createAppropriateLedger(),{sourceUid:source.uid,controllerTeam:1,actorSeat:1,activationEventId:'act-contradiction',
  drawEvent:event,activationResolved:true,activationNegated:true,effectNegated:false},lookup),/não pode ser registrada como resolvida/);});
test('two copies each plan a separate two-card draw',()=>{
 const {duel,ledger}=setup({sourceSeats:[1,3]}),event=drawEvent(duel,0,{sequence:2,phase:'main1',count:2}),r=processAppropriateDraw(duel,ledger,event,lookup);
 assert.equal(r.plans.length,2);assert.deepEqual(r.plans.map(p=>p.actualDrawCount),[2,2]);assert.notDeepEqual(r.plans[0].drawnCards.map(c=>c.uid),r.plans[1].drawnCards.map(c=>c.uid));});
test('multiple copies consume sequential Deck tops without overlap',()=>{
 const {duel,ledger}=setup({sourceSeats:[1,3]});moveDeckToGraveExcept(duel,1,3);const event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1});
 const r=processAppropriateDraw(duel,ledger,event,lookup);assert.equal(r.status,'deck-out');assert.deepEqual(r.plans.map(p=>p.actualDrawCount),[2,1]);
 assert.deepEqual(r.plans.map(p=>p.expectedDeckTopUids),r.plans.map(p=>p.drawnCards.map(c=>c.uid)));});
test('one available card is planned and the failed second draw marks deck-out',()=>{
 const {duel,ledger}=setup();moveDeckToGraveExcept(duel,1,1);const event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1});
 const r=processAppropriateDraw(duel,ledger,event,lookup);assert.equal(r.status,'deck-out');assert.equal(r.plans[0].actualDrawCount,1);assert.equal(r.plans[0].deckOut,true);});
test('an empty Deck produces a zero-card deck-out plan',()=>{
 const {duel,ledger}=setup();moveDeckToGraveExcept(duel,1,0);const event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1});
 const r=processAppropriateDraw(duel,ledger,event,lookup);assert.equal(r.status,'deck-out');assert.equal(r.plans[0].actualDrawCount,0);assert.equal(r.plans[0].deckOut,true);});
test('a subsequent Draw Phase event does not trigger Appropriate',()=>{
 const {duel,ledger}=setup(),event=drawEvent(duel,0,{sequence:2,phase:'draw',count:1}),r=processAppropriateDraw(duel,ledger,event,lookup);
 assert.equal(r.status,'draw-phase');assert.equal(r.plans.length,0);});
test('one draw event triggers once even when the opponent draws multiple cards',()=>{
 const {duel,ledger}=setup(),event=drawEvent(duel,0,{sequence:2,phase:'main1',count:3}),r=processAppropriateDraw(duel,ledger,event,lookup);
 assert.equal(r.plans.length,1);assert.equal(r.plans[0].requestedDrawCount,2);});
test('source-specific negation excludes only the listed Appropriate copy',()=>{
 const {duel,ledger,sources}=setup({sourceSeats:[1,3]}),event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1,negatedSourceUids:[sources[0].uid]});
 const r=processAppropriateDraw(duel,ledger,event,lookup);assert.deepEqual(r.plans.map(p=>p.sourceUid),[sources[1].uid]);});
test('Jinzo suppresses an already armed Appropriate effect',()=>{
 const {duel,ledger}=setup();placeMonster(duel,0,jinzoId);const event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1});
 const r=processAppropriateDraw(duel,ledger,event,lookup);assert.equal(r.status,'no-trigger');assert.equal(r.plans.length,0);});
test('a face-down source is reconciled out of the activation ledger',()=>{
 const {duel,ledger,sources}=setup();sources[0].faceUp=false;const event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1});
 const r=processAppropriateDraw(duel,ledger,event,lookup);assert.equal(r.status,'no-trigger');assert.equal(r.ledger.activations.length,0);});
test('a source removed from the field no longer triggers',()=>{
 const {duel,ledger,sources}=setup(),team=Number(sources[0].uid[1])%2;
 duel.core.players[team].backrow=duel.core.players[team].backrow.filter(c=>c.uid!==sources[0].uid);
 duel.core.players[team].grave.push({uid:sources[0].uid,id:sources[0].id});synchronizeCardLifetimes(duel.core);
 const event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1}),r=processAppropriateDraw(duel,ledger,event,lookup);
 assert.equal(r.status,'no-trigger');assert.equal(r.ledger.activations.length,0);});
test('a reset source with a new set turn must be activated again',()=>{
 const {duel,ledger,sources}=setup();sources[0].setTurn=duel.core.turn;const event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1});
 const r=processAppropriateDraw(duel,ledger,event,lookup);assert.equal(r.status,'no-trigger');assert.equal(r.ledger.activations.length,0);});
test('same activation replay is idempotent for the same source and event',()=>{
 const duel=base(),source=placeAppropriate(duel,1);setWindow(duel,0);const event=drawEvent(duel,0,{sequence:1,phase:'main1',count:1});
 const input={sourceUid:source.uid,controllerTeam:1,actorSeat:1,activationEventId:'act-once',drawEvent:event,activationResolved:true,activationNegated:false,effectNegated:false};
 const first=registerAppropriateActivation(duel,createAppropriateLedger(),input,lookup),second=registerAppropriateActivation(duel,first.ledger,input,lookup);
 assert.equal(first.status,'armed');assert.equal(second.status,'duplicate');});
test('same draw event replay is idempotent after the planned cards have moved',()=>{
 const {duel,ledger}=setup(),event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1}),first=processAppropriateDraw(duel,ledger,event,lookup);
 applyPlan(duel,first.plans[0]);const second=processAppropriateDraw(duel,first.ledger,event,lookup);
 assert.equal(first.status,'triggered');assert.equal(second.status,'duplicate');assert.equal(second.plans.length,0);});
test('reusing a draw event ID with different facts is rejected',()=>{
 const {duel,ledger}=setup(),event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1}),first=processAppropriateDraw(duel,ledger,event,lookup);
 assert.throws(()=>processAppropriateDraw(duel,first.ledger,{...event,phase:'battle'},lookup),/conteúdo diferente/);});
test('draw events must belong to the active physical seat and its private hand',()=>{
 const {duel,ledger}=setup(),event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1});
 assert.throws(()=>processAppropriateDraw(duel,ledger,{...event,drawingSeat:2},lookup),/não está ativo/);
 assert.throws(()=>processAppropriateDraw(duel,ledger,{...event,drawnUids:['m3:missing']},lookup),/mão privada/);});
test('a malformed draw event and duplicate UIDs are rejected',()=>{
 const {duel,ledger}=setup(),event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1});
 assert.throws(()=>processAppropriateDraw(duel,ledger,{...event,sequence:0},lookup),/Evento de compra/);
 assert.throws(()=>processAppropriateDraw(duel,ledger,{...event,drawnUids:[event.drawnUids[0],event.drawnUids[0]],drawCount:2},lookup),/Evento de compra/);});
test('a malformed activation ledger is rejected',()=>{
 const {duel}=setup(),event=drawEvent(duel,0,{sequence:3,phase:'main1',count:1});
 assert.throws(()=>processAppropriateDraw(duel,{version:1,activations:[],processedDrawEvents:[{eventId:'x',fingerprint:'bad'}]},event,lookup),/Ledger Appropriate/);});
test('adapter plans do not mutate LP, hands, Decks, zones or inventory',()=>{
 const {duel,ledger}=setup({sourceSeats:[1,3]}),event=drawEvent(duel,0,{sequence:2,phase:'main1',count:1}),before=structuredClone(duel);
 const inventoryBefore=tagInventory(duel).map(c=>[c.uid,c.id]).sort(),r=processAppropriateDraw(duel,ledger,event,lookup);
 assert.equal(r.status,'triggered');assert.deepEqual(duel,before);assert.deepEqual(tagInventory(duel).map(c=>[c.uid,c.id]).sort(),inventoryBefore);});
test('owner rules remain Deck 20–30, hand six at End Phase, 3+3 zones and Extra five',()=>{
 assert.doesNotThrow(()=>assertAppropriateRules(base()));});
