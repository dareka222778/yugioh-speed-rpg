'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getDuelCard}=require('../dist/effectRegistry');
const {createSpellNegationAdapter,SPELL_CANCELLER_ID,IMPERIAL_ORDER_ID,
 assertSpellNegationRules}=require('../dist/spellNegationTagAdapter');

const normalDeck=tag.tagNormalCardIds.slice(0,20);
assert.equal(normalDeck.length,20);
const CANCELLER_FIXTURE=normalDeck[0];
const IMPERIAL_FIXTURE='77414722'; // Magic Jammer, used only as an enabled physical test fixture
const SPELL_FIXTURE='55144522'; // Pot of Greed
const ROYAL_DECREE_ID='51452091';
const JINZO_ID='77585513';
const adapter=tag.createSpellNegationAdapter(id=>{
 if(id===CANCELLER_FIXTURE)return {kind:'monster',effect:'spell-canceller'};
 if(id===IMPERIAL_FIXTURE)return {kind:'trap',effect:'imperial-order'};
 return undefined;
});
let scenarios=0;
function scenario(name,fn){scenarios++;test(name,fn);}
function players(){return [0,1,2,3].map(i=>({id:'m661-seat-'+i,name:'M661 Seat '+i,cards:[...normalDeck],extra:[]}));}
function makeDuel(first=0){
 const duel=tag.createTagDuel(players(),{seed:'m661-spell-negation-'+first,first,classic:true});
 duel.core.turn=3;duel.core.phase='main';duel.core.resume='main';
 duel.core.pending={kind:'none'};duel.core.chain=[];duel.core.priority=first%2;
 duel.core.passes=0;duel.core.damageStep=false;duel.core.turnEnding=false;
 duel.core.pendingNegated=false;duel.core.handFlow=undefined;duel.core.choice=undefined;
 return duel;
}
function privateZone(duel,seat,zone){
 const team=seat%2;
 return duel.active[team]===seat?duel.core.players[team][zone]:duel.reserves[String(seat)][zone];
}
function takePhysical(duel,seat){
 const hand=privateZone(duel,seat,'hand');
 if(!hand.length){const deck=privateZone(duel,seat,'deck');assert.ok(deck.length);hand.push(deck.shift());}
 return hand.shift();
}
function placeMonster(duel,ownerSeat,controllerTeam,id=CANCELLER_FIXTURE,faceUp=true){
 const card=takePhysical(duel,ownerSeat);card.id=id;
 duel.core.players[controllerTeam].monsters.push({...card,owner:ownerSeat%2,position:'atk',faceUp,
  entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0});
 return card.uid;
}
function placeBackrow(duel,ownerSeat,controllerTeam,id=IMPERIAL_FIXTURE,faceUp=true,setTurn=1){
 const card=takePhysical(duel,ownerSeat);card.id=id;
 duel.core.players[controllerTeam].backrow.push({...card,faceUp,setTurn,resolved:true});
 return card.uid;
}
function placeField(duel,ownerSeat,controllerTeam,id=SPELL_FIXTURE,faceUp=true){
 const card=takePhysical(duel,ownerSeat);card.id=id;
 duel.core.players[controllerTeam].field={...card,faceUp,setTurn:1,resolved:true};
 return card.uid;
}
function inventory(duel){
 return tag.tagInventory(duel).filter(card=>card.entityKind!=='token')
  .map(card=>card.uid+'|'+card.id).sort();
}
function graveHas(duel,team,uid){return duel.core.players[team].grave.some(card=>card.uid===uid);}
function receipt(session,sourceUid,actorSeat=session.duel.cursor,overrides={}){
 return {activationId:'m661:'+sourceUid+':'+session.duel.core.turn,sourceUid,actorSeat,
  turn:session.duel.core.turn,window:'standby',...overrides};
}
function setupImperial({first=0,ownerSeat,controllerTeam=0,faceUp=true,lp=4000}={}){
 const duel=makeDuel(first),seat=ownerSeat??(duel.active[controllerTeam]+2)%4;
 const sourceUid=placeBackrow(duel,seat,controllerTeam,IMPERIAL_FIXTURE,faceUp,1);
 duel.core.players[controllerTeam].lp=lp;
 const session=adapter.createSession(duel);
 return {duel,session,sourceUid,ownerSeat:seat,controllerTeam,actorSeat:duel.active[controllerTeam]};
}

scenario('Spell Canceller and Imperial Order are not silently admitted to the playable catalog',()=>{
 assert.equal(getPlayableCard(SPELL_CANCELLER_ID),undefined);
 assert.equal(getPlayableCard(IMPERIAL_ORDER_ID),undefined);
 assert.equal(getDuelCard(SPELL_CANCELLER_ID),undefined);
 assert.equal(getDuelCard(IMPERIAL_ORDER_ID),undefined);
 assert.equal(getPlayableCard(ROYAL_DECREE_ID)?.id,ROYAL_DECREE_ID);
 assert.equal(getPlayableCard(JINZO_ID)?.id,JINZO_ID);
});
scenario('the adapter enforces 20–30 cards, hand 6 at End Phase, 3+3 zones and Extra 5',()=>{
 const duel=makeDuel();assert.doesNotThrow(()=>assertSpellNegationRules(duel));
 assert.equal(duel.core.players.length,2);
 assert.equal(duel.active.length,2);
});
scenario('without either source, Spell activations and field effects remain available',()=>{
 const duel=makeDuel();
 assert.equal(adapter.spellActivationBlocked(duel),false);
 assert.equal(adapter.spellEffectsNegated(duel),false);
});
scenario('face-up Spell Canceller blocks Spell activations for both teams',()=>{
 const duel=makeDuel();const uid=placeMonster(duel,2,0,CANCELLER_FIXTURE,true);
 const sources=adapter.activeSources(duel);
 assert.deepEqual(sources.spellCancellerUids,[uid]);
 assert.equal(adapter.spellActivationBlocked(duel),true);
 assert.equal(adapter.spellEffectsNegated(duel),true);
});
scenario('a face-down Spell Canceller fixture has no continuous effect',()=>{
 const duel=makeDuel();placeMonster(duel,2,0,CANCELLER_FIXTURE,false);
 assert.equal(adapter.spellActivationBlocked(duel),false);
 assert.equal(adapter.spellEffectsNegated(duel),false);
});
scenario('a Spell Canceller physically owned by the inactive partner still protects the shared team field',()=>{
 const duel=makeDuel();const uid=placeMonster(duel,2,0,CANCELLER_FIXTURE,true);
 assert.equal(uid.startsWith('m2:'),true);
 assert.equal(adapter.spellActivationBlocked(duel),true);
});
scenario('Imperial Order negates a face-up Spell effect but does not prohibit Spell activation',()=>{
 const duel=makeDuel();
 placeBackrow(duel,2,0,IMPERIAL_FIXTURE,true);
 const spellUid=placeBackrow(duel,1,1,SPELL_FIXTURE,true);
 assert.equal(adapter.spellActivationBlocked(duel),false);
 assert.equal(adapter.isSpellEffectNegated(duel,spellUid),true);
});
scenario('Imperial Order does not negate a face-down Spell or a non-Spell card',()=>{
 const duel=makeDuel();placeBackrow(duel,2,0,IMPERIAL_FIXTURE,true);
 const facedown=placeBackrow(duel,1,1,SPELL_FIXTURE,false);
 const trap=placeBackrow(duel,1,1,IMPERIAL_FIXTURE,true);
 assert.equal(adapter.isSpellEffectNegated(duel,facedown),false);
 assert.equal(adapter.isSpellEffectNegated(duel,trap),false);
});
scenario('Imperial Order applies to a Spell occupying the independent Field Zone',()=>{
 const duel=makeDuel();placeBackrow(duel,2,0,IMPERIAL_FIXTURE,true);
 const fieldUid=placeField(duel,1,1,SPELL_FIXTURE,true);
 assert.equal(adapter.isSpellEffectNegated(duel,fieldUid),true);
 assert.equal(duel.core.players[1].backrow.length,0);
 assert.ok(duel.core.players[1].field);
});
scenario('a face-down Imperial Order does not negate Spell effects',()=>{
 const duel=makeDuel();placeBackrow(duel,2,0,IMPERIAL_FIXTURE,false);
 const spellUid=placeBackrow(duel,1,1,SPELL_FIXTURE,true);
 assert.equal(adapter.isSpellEffectNegated(duel,spellUid),false);
});
scenario('Royal Decree suppresses Imperial Order as a Trap effect',()=>{
 const duel=makeDuel();placeBackrow(duel,2,0,IMPERIAL_FIXTURE,true);
 placeBackrow(duel,0,0,ROYAL_DECREE_ID,true);
 const spellUid=placeBackrow(duel,1,1,SPELL_FIXTURE,true);
 assert.equal(adapter.isSpellEffectNegated(duel,spellUid),false);
});
scenario('Jinzo suppresses Imperial Order without suppressing Spell Canceller',()=>{
 const duel=makeDuel();placeBackrow(duel,2,0,IMPERIAL_FIXTURE,true);
 placeMonster(duel,1,1,JINZO_ID,true);
 const spellUid=placeBackrow(duel,1,1,SPELL_FIXTURE,true);
 assert.equal(adapter.isSpellEffectNegated(duel,spellUid),false);
});
scenario('Spell Canceller remains an activation lock alongside Imperial Order',()=>{
 const duel=makeDuel();placeMonster(duel,2,0,CANCELLER_FIXTURE,true);
 placeBackrow(duel,0,0,IMPERIAL_FIXTURE,true);
 assert.equal(adapter.spellActivationBlocked(duel),true);
 assert.equal(adapter.spellEffectsNegated(duel),true);
});
scenario('Spell Canceller ceases to block activations after it leaves the shared Monster Zone',()=>{
 const duel=makeDuel();const uid=placeMonster(duel,2,0,CANCELLER_FIXTURE,true);
 duel.core.players[0].monsters=duel.core.players[0].monsters.filter(card=>card.uid!==uid);
 assert.equal(adapter.spellActivationBlocked(duel),false);
});
scenario('a Spell target outside the shared field is not treated as an on-field Spell effect',()=>{
 const duel=makeDuel();placeBackrow(duel,2,0,IMPERIAL_FIXTURE,true);
 assert.equal(adapter.isSpellEffectNegated(duel,'not-on-field'),false);
});
scenario('maintenance is charged from the controller team shared LP, not the physical owner',()=>{
 const f=setupImperial({ownerSeat:2,controllerTeam:0,lp:4000});
 const before=inventory(f.session.duel),hands=JSON.stringify(f.session.duel.reserves);
 const result=adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,f.actorSeat));
 assert.equal(result.status,'paid');assert.equal(result.paid,700);
 assert.equal(result.lpBefore,4000);assert.equal(result.lpAfter,3300);
 assert.equal(f.session.duel.core.players[0].lp,3300);
 assert.deepEqual(inventory(f.session.duel),before);
 assert.equal(JSON.stringify(f.session.duel.reserves),hands);
});
scenario('the inactive partner may physically own Imperial Order while the active teammate pays its upkeep',()=>{
 const f=setupImperial({ownerSeat:2,controllerTeam:0});
 const result=adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,0));
 assert.equal(result.ownerSeat,2);assert.equal(result.controllerTeam,0);
 assert.equal(result.status,'paid');assert.equal(f.session.duel.core.players[0].lp,3300);
});
scenario('the current physical partner seat, not the card owner, controls the team Standby receipt',()=>{
 const f=setupImperial({first:2,ownerSeat:0,controllerTeam:0});
 const result=adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,2));
 assert.equal(result.status,'paid');
 assert.equal(f.session.duel.core.players[0].lp,3300);
});
scenario('the wrong partner seat cannot pay the team maintenance cost',()=>{
 const f=setupImperial({first:2,ownerSeat:0,controllerTeam:0});
 assert.throws(()=>adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,0)),/assento ativo/);
});
scenario('Imperial Order on the other team cannot charge the current team Standby Phase',()=>{
 const f=setupImperial({first:1,ownerSeat:3,controllerTeam:0});
 assert.throws(()=>adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,1)),/equipe e ao assento ativo/);
});
scenario('maintenance rejects a forged non-Standby receipt and a stale turn',()=>{
 const f=setupImperial();
 assert.throws(()=>adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,f.actorSeat,{window:'main'})),/Standby/);
 assert.throws(()=>adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,f.actorSeat,{activationId:'m661:stale',turn:2})),/início do turno/);
});
scenario('a face-down Imperial Order cannot collect maintenance',()=>{
 const f=setupImperial({faceUp:false});
 const result=adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,f.actorSeat));
 assert.equal(result.status,'source-lost');assert.equal(f.session.duel.core.players[0].lp,4000);
});
scenario('Royal Decree negating Trap effects also suspends Imperial Order maintenance',()=>{
 const f=setupImperial();placeBackrow(f.session.duel,0,0,ROYAL_DECREE_ID,true);
 const result=adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,f.actorSeat));
 assert.equal(result.status,'negated');assert.equal(result.paid,0);
 assert.equal(f.session.duel.core.players[0].lp,4000);
});
scenario('a team with fewer than 700 LP destroys Imperial Order without paying',()=>{
 const f=setupImperial({ownerSeat:2,lp:699});
 const result=adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,f.actorSeat));
 assert.equal(result.status,'destroyed-unpaid');assert.equal(result.paid,0);
 assert.equal(f.session.duel.core.players[0].lp,699);
 assert.equal(graveHas(f.session.duel,0,f.sourceUid),true);
});
scenario('a stolen Imperial Order returns to its physical owner team Graveyard if upkeep cannot be paid',()=>{
 const f=setupImperial({ownerSeat:1,controllerTeam:0,lp:699});
 const result=adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,f.actorSeat));
 assert.equal(result.status,'destroyed-unpaid');
 assert.equal(graveHas(f.session.duel,1,f.sourceUid),true);
 assert.equal(graveHas(f.session.duel,0,f.sourceUid),false);
});
scenario('exactly 700 LP can be paid and ends the duel at zero LP',()=>{
 const f=setupImperial({lp:700});
 const result=adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,f.actorSeat));
 assert.equal(result.status,'paid-and-lost');assert.equal(result.lpAfter,0);
 assert.equal(f.session.duel.core.phase,'finished');
 assert.equal(f.session.duel.core.winner,'tag-team-1');
});
scenario('a repeated receipt is idempotent and cannot charge twice',()=>{
 const f=setupImperial(),r=receipt(f.session,f.sourceUid,f.actorSeat);
 const first=adapter.processMaintenance(f.session,r);
 const second=adapter.processMaintenance(f.session,r);
 assert.deepEqual(second,first);assert.equal(f.session.duel.core.players[0].lp,3300);
});
scenario('a second activation ID cannot charge the same source twice in one team turn',()=>{
 const f=setupImperial();
 adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,f.actorSeat));
 const again=adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,f.actorSeat,{activationId:'m661:second-id'}));
 assert.equal(again.status,'already-processed');assert.equal(f.session.duel.core.players[0].lp,3300);
});
scenario('two distinct Imperial Orders each pay once during the same team Standby Phase',()=>{
 const duel=makeDuel(),first=placeBackrow(duel,2,0,IMPERIAL_FIXTURE,true),second=placeBackrow(duel,0,0,IMPERIAL_FIXTURE,true);
 const session=adapter.createSession(duel);
 const a=adapter.processMaintenance(session,receipt(session,first,0,{activationId:'m661:first'}));
 const b=adapter.processMaintenance(session,receipt(session,second,0,{activationId:'m661:second'}));
 assert.equal(a.status,'paid');assert.equal(b.status,'paid');
 assert.equal(session.duel.core.players[0].lp,2600);
});
scenario('a new team turn charges again after the partner rotation',()=>{
 const f=setupImperial({ownerSeat:0});
 adapter.processMaintenance(f.session,receipt(f.session,f.sourceUid,0));
 const duel=f.session.duel;
 duel.core.turn+=2;duel.core.current=0;duel.cursor=2;duel.active[0]=2;
 duel.core.teamRotation.cursor=2;duel.core.teamRotation.active=duel.active;
 duel.core.teamRotation.reserves=duel.reserves;
 const next=adapter.processMaintenance(f.session,{
  activationId:'m661:partner-turn',sourceUid:f.sourceUid,actorSeat:2,turn:duel.core.turn,window:'standby'
 });
 assert.equal(next.status,'paid');assert.equal(next.lpAfter,2600);
});
scenario('the adapter does not alter the private hands or grant inventory during negation checks',()=>{
 const duel=makeDuel();placeMonster(duel,2,0,CANCELLER_FIXTURE,true);
 const before=inventory(duel),hands=JSON.stringify(duel.reserves);
 adapter.spellActivationBlocked(duel);adapter.spellEffectsNegated(duel);
 assert.deepEqual(inventory(duel),before);assert.equal(JSON.stringify(duel.reserves),hands);
});
scenario('three backrow slots remain separate from the Field Zone',()=>{
 const duel=makeDuel();
 placeBackrow(duel,2,0,IMPERIAL_FIXTURE,true);
 placeBackrow(duel,0,0,IMPERIAL_FIXTURE,false);
 placeBackrow(duel,2,0,IMPERIAL_FIXTURE,false);
 placeField(duel,0,0,SPELL_FIXTURE,true);
 assert.equal(duel.core.players[0].backrow.length,3);
 assert.ok(duel.core.players[0].field);
 assert.doesNotThrow(()=>assertSpellNegationRules(duel));
});
process.on('exit',()=>{if(scenarios!==29)process.exitCode=1;});
