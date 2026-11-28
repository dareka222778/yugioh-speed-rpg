'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createTagDuel,tagInventory,tagNormalCardIds}=require('../dist/tagDuel');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {CURSE_OF_DARKNESS_ID,CURSE_OF_DARKNESS_KONAMI_CID,createCurseOfDarknessLedger,resolveCurseOfDarknessSpell,assertCurseOfDarknessRules}=require('../dist/curseOfDarknessTagAdapter');
const enabled=getEnabledCardIds(),trapIds=enabled.filter(id=>getDuelCard(id)?.kind==='trap');
const [trapA,trapB,trapC]=trapIds,normalIds=tagNormalCardIds.slice(0,15);
const spellId=enabled.find(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field);
const jinzoId=enabled.find(id=>getDuelCard(id)?.name==='Jinzo');
assert.ok(trapA&&trapB&&trapC&&spellId&&jinzoId,'O catálogo-base precisa fornecer fixtures reais de Magia, Armadilhas e Jinzo.');
assert.equal(normalIds.length,15);assert.equal(getDuelCard(CURSE_OF_DARKNESS_ID),undefined);
assert.equal(enabled.includes(CURSE_OF_DARKNESS_ID),false);
const mainDeck=[...normalIds,trapA,trapB,trapC,spellId,jinzoId];assert.equal(mainDeck.length,20);
const players=()=>[
 {id:'p0',name:'Azul A',cards:[...mainDeck],extra:[]},{id:'p1',name:'Vermelho A',cards:[...mainDeck],extra:[]},
 {id:'p2',name:'Azul B',cards:[...mainDeck],extra:[]},{id:'p3',name:'Vermelho B',cards:[...mainDeck],extra:[]}
];
function baseDuel(first=0){return createTagDuel(players(),{seed:'m685-curse-of-darkness',first,classic:true});}
function setMainWindow(duel,team){
 duel.cursor=duel.active[team];duel.core.current=team;duel.core.priority=team;duel.core.phase='main';
 duel.core.turnEnding=undefined;duel.core.damageStep=undefined;
 if(duel.core.teamRotation){duel.core.teamRotation.cursor=duel.cursor;duel.core.teamRotation.active=duel.active;duel.core.teamRotation.reserves=duel.reserves;}
}
function takePhysical(duel,seat,id){
 const team=seat%2,held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
 for(const pool of [held.hand,held.deck,held.extra??[]]){const index=pool.findIndex(card=>card.id===id);if(index>=0)return pool.splice(index,1)[0];}
 throw new Error('Carta física indisponível para o assento '+seat+': '+id);
}
function placeBackrow(duel,seat,id,{faceUp=true,resolved=true}={}){
 const card=takePhysical(duel,seat,id),backrow={...card,setTurn:0,faceUp,resolved};
 duel.core.players[seat%2].backrow.push(backrow);synchronizeCardLifetimes(duel.core);return backrow;
}
function placeMonster(duel,seat,id){
 const card=takePhysical(duel,seat,id),monster={...card,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:seat%2};
 duel.core.players[seat%2].monsters.push(monster);synchronizeCardLifetimes(duel.core);return monster;
}
function spellToGrave(duel,ownerSeat=0){
 const card=takePhysical(duel,ownerSeat,spellId);duel.core.players[ownerSeat%2].grave.push({uid:card.uid,id:card.id});
 synchronizeCardLifetimes(duel.core);return card;
}
const lookup=id=>[trapA,trapB,trapC].includes(id);
function eventFor(duel,{eventId='spell-resolved-1',ownerSeat=0,activatingSeat=duel.active[0],...overrides}={}){
 const spell=spellToGrave(duel,ownerSeat);
 return {eventId,spellUid:spell.uid,spellCardId:spell.id,activatingSeat,resolved:true,activationNegated:false,effectNegated:false,
  currentLPByTeam:[duel.core.players[0].lp,duel.core.players[1].lp],...overrides};
}
function setup({first=0,sourceSeats=[1],actorTeam=0,spellOwnerSeat=0,sourceOptions=[]}={}){
 const duel=baseDuel(first),sources=sourceSeats.map((seat,index)=>placeBackrow(duel,seat,index%2?trapB:trapA,sourceOptions[index]??{}));
 setMainWindow(duel,actorTeam);const event=eventFor(duel,{ownerSeat:spellOwnerSeat,activatingSeat:duel.active[actorTeam]});
 return {duel,sources,event};
}
function inventory(duel){return new Map(tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]));}

test('Curse of Darkness has the expected identity and stays outside the live catalog',()=>{
 assert.equal(CURSE_OF_DARKNESS_ID,'84970821');assert.equal(CURSE_OF_DARKNESS_KONAMI_CID,5917);
 assert.equal(getDuelCard(CURSE_OF_DARKNESS_ID),undefined);assert.equal(enabled.includes(CURSE_OF_DARKNESS_ID),false);
});
test('one active copy plans 1000 damage to the physical Spell activator team',()=>{
 const {duel,sources,event}=setup(),r=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),event,lookup);
 assert.equal(r.status,'triggered');assert.equal(r.plans.length,1);assert.equal(r.plans[0].sourceUid,sources[0].uid);
 assert.equal(r.plans[0].targetTeam,0);assert.equal(r.plans[0].activatingSeat,0);assert.equal(r.plans[0].damage,1000);
 assert.equal(r.plans[0].lpBefore,4000);assert.equal(r.plans[0].lpAfter,3000);
});
test('damage is routed to team one when its active physical seat activates the Spell',()=>{
 const {duel,event}=setup({first:1,sourceSeats:[0],actorTeam:1,spellOwnerSeat:1});
 const r=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),event,lookup);
 assert.equal(r.status,'triggered');assert.equal(r.plans[0].targetTeam,1);assert.equal(r.plans[0].sourceTeam,0);assert.equal(r.plans[0].activatingSeat,1);
});
test('physical Spell owner does not override the active teammate who activated it',()=>{
 const {duel,event}=setup({first:2,sourceSeats:[1],actorTeam:0,spellOwnerSeat:0});
 assert.equal(event.activatingSeat,2);assert.match(event.spellUid,/^m0:/);
 const r=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),event,lookup);
 assert.equal(r.plans[0].targetTeam,0);assert.equal(r.plans[0].activatingSeat,2);
});
test('a resolved Spell still triggers when only its effect was negated',()=>{
 const {duel,event}=setup(),r=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),{...event,effectNegated:true},lookup);
 assert.equal(r.status,'triggered');assert.equal(r.plans[0].damage,1000);
});
test('a negated Spell activation never triggers Curse of Darkness',()=>{
 const {duel,event}=setup(),r=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),{...event,resolved:false,activationNegated:true},lookup);
 assert.equal(r.status,'activation-negated');assert.equal(r.plans.length,0);
});
test('an unresolved Spell event does not trigger damage',()=>{
 const {duel,event}=setup(),r=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),{...event,resolved:false},lookup);
 assert.equal(r.status,'not-resolved');assert.equal(r.plans.length,0);
});
test('a contradictory activation-negated and resolved event is rejected',()=>{
 const {duel,event}=setup();
 assert.throws(()=>resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),{...event,activationNegated:true},lookup),/não pode ser registrada como resolvida/);
});
test('no face-up resolved Curse copy means no trigger',()=>{
 const duel=baseDuel();placeBackrow(duel,1,trapA,{faceUp:false,resolved:true});setMainWindow(duel,0);
 const r=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),eventFor(duel),lookup);
 assert.equal(r.status,'no-source');assert.equal(r.plans.length,0);
});
test('a face-up but unresolved continuous Trap is not active',()=>{
 const duel=baseDuel();placeBackrow(duel,1,trapA,{faceUp:true,resolved:false});setMainWindow(duel,0);
 assert.equal(resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),eventFor(duel),lookup).status,'no-source');
});
test('source-specific negation excludes only the listed Curse copy',()=>{
 const duel=baseDuel(),a=placeBackrow(duel,1,trapA),b=placeBackrow(duel,3,trapB);setMainWindow(duel,0);
 const r=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),eventFor(duel,{negatedSourceUids:[a.uid]}),lookup);
 assert.deepEqual(r.plans.map(plan=>plan.sourceUid),[b.uid]);
});
test('two active copies stack in deterministic UID order',()=>{
 const {duel,sources,event}=setup({sourceSeats:[1,3]}),r=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),event,lookup);
 assert.equal(r.plans.length,2);assert.deepEqual(r.plans.map(p=>p.sourceUid),sources.map(x=>x.uid).sort());
 assert.deepEqual(r.plans.map(p=>p.damage),[1000,1000]);
});
test('multiple copies clamp the final damage to remaining LP and mark lethal',()=>{
 const {duel,event}=setup({sourceSeats:[1,3]});duel.core.players[0].lp=1500;
 const r=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),{...event,currentLPByTeam:[1500,4000]},lookup);
 assert.equal(r.status,'duel-ended');assert.deepEqual(r.plans.map(p=>p.damage),[1000,500]);assert.deepEqual(r.plans.map(p=>p.lpAfter),[500,0]);
});
test('zero LP cannot receive a new damage plan',()=>{
 const {duel,event}=setup();duel.core.players[0].lp=0;
 const r=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),{...event,currentLPByTeam:[0,4000]},lookup);
 assert.equal(r.status,'duel-ended');assert.equal(r.plans.length,0);
});
test('Jinzo suppresses every Curse copy',()=>{
 const {duel,event}=setup({sourceSeats:[1,3]});placeMonster(duel,0,jinzoId);
 const r=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),event,lookup);
 assert.equal(r.status,'no-source');assert.equal(r.plans.length,0);
});
test('copies controlled by either team react to the same resolved Spell',()=>{
 const {duel,event}=setup({sourceSeats:[0,1]}),r=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),event,lookup);
 assert.equal(r.plans.length,2);assert.deepEqual(new Set(r.plans.map(p=>p.sourceTeam)),new Set([0,1]));
 assert.ok(r.plans.every(p=>p.targetTeam===0));
});
test('the Spell identity must be a real enabled Spell card',()=>{
 const {duel,event}=setup(),trap=takePhysical(duel,0,trapA);
 duel.core.players[0].grave.push({uid:trap.uid,id:trap.id});synchronizeCardLifetimes(duel.core);
 assert.throws(()=>resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),{...event,spellUid:trap.uid,spellCardId:trap.id},lookup),/Carta de Magia real/);
});
test('a Spell UID must match exactly one physical inventory card',()=>{
 const {duel,event}=setup();
 assert.throws(()=>resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),{...event,spellUid:'m3:missing'},lookup),/não corresponde/);
});
test('the activating seat must be active for its team',()=>{
 const {duel,event}=setup();
 assert.throws(()=>resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),{...event,activatingSeat:2},lookup),/assento físico ativo/);
});
test('malformed physical spell ownership is rejected',()=>{
 const {duel,event}=setup();
 assert.throws(()=>resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),{...event,spellUid:'spell-without-owner'},lookup),/não corresponde/);
});
test('stale LP snapshots are rejected for new events',()=>{
 const {duel,event}=setup();duel.core.players[0].lp-=1;
 assert.throws(()=>resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),event,lookup),/Snapshot de LP obsoleto/);
});
test('same event replay is idempotent even after LP advances',()=>{
 const {duel,event}=setup(),first=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),event,lookup);
 duel.core.players[0].lp-=1000;
 const second=resolveCurseOfDarknessSpell(duel,first.ledger,event,lookup);
 assert.equal(first.status,'triggered');assert.equal(second.status,'duplicate');assert.equal(second.plans.length,0);
});
test('reusing an event ID with changed resolution facts is rejected',()=>{
 const {duel,event}=setup(),first=resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),event,lookup);
 assert.throws(()=>resolveCurseOfDarknessSpell(duel,first.ledger,{...event,effectNegated:true},lookup),/conteúdo diferente/);
});
test('malformed and duplicate ledgers are rejected',()=>{
 const {duel,event}=setup();
 assert.throws(()=>resolveCurseOfDarknessSpell(duel,{version:1,processed:[{eventId:'x',fingerprint:'bad'}]},event,lookup),/Ledger/);
 assert.throws(()=>resolveCurseOfDarknessSpell(duel,{version:1,processed:[{eventId:'x',fingerprint:'a'.repeat(64)},{eventId:'x',fingerprint:'b'.repeat(64)}]},event,lookup),/Ledger/);
});
test('malformed event identity and duplicate negation UIDs are rejected',()=>{
 const {duel,event}=setup();
 assert.throws(()=>resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),{...event,eventId:' '},lookup),/ID do evento/);
 assert.throws(()=>resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),{...event,negatedSourceUids:['x','x']},lookup),/fontes negadas/);
});
test('duplicate source UIDs are rejected instead of double-counted',()=>{
 const {duel,sources,event}=setup();duel.core.players[1].backrow.push({...sources[0]});
 assert.throws(()=>resolveCurseOfDarknessSpell(duel,createCurseOfDarknessLedger(),event,lookup),/duplicado/);
});
test('the adapter never mutates LP, zones, hands, Decks, inventory or the input ledger',()=>{
 const {duel,event}=setup({sourceSeats:[1,3]}),before=structuredClone(duel),ledger=createCurseOfDarknessLedger(),beforeInventory=inventory(duel);
 const r=resolveCurseOfDarknessSpell(duel,ledger,event,lookup);
 assert.equal(r.status,'triggered');assert.deepEqual(duel,before);assert.deepEqual(inventory(duel),beforeInventory);assert.deepEqual(ledger,{version:1,processed:[]});
});
test('owner rules remain Deck 20–30, hand six at End Phase, 3+3 zones and Extra five',()=>{
 const duel=baseDuel();assert.doesNotThrow(()=>assertCurseOfDarknessRules(duel));
 assert.equal(duel.core.players[0].monsters.length,0);assert.equal(duel.core.players[0].backrow.length,0);
});
