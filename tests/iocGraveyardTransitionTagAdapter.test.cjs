'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createTagDuel,tagInventory}=require('../dist/tagDuel');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');
const {bindTarget,synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
 BURNING_ALGAE_ID,BURNING_ALGAE_KONAMI_CID,THING_IN_THE_CRATER_ID,THING_IN_THE_CRATER_KONAMI_CID,
 createExactGraveyardTransitionLookups,createGraveyardTransitionLedger,
 recordGraveyardTransition,resolveGraveyardTransition
}=require('../dist/iocGraveyardTransitionTagAdapter');

const enabled=getEnabledCardIds();
const monsters=enabled.filter(id=>getDuelCard(id)?.kind==='monster'&&!getDuelCard(id)?.fusion);
const pyroMonsters=monsters.filter(id=>getDuelCard(id)?.race==='Pyro');
const burningPlaceholder=monsters.find(id=>getDuelCard(id)?.race!=='Pyro');
const thingPlaceholder=pyroMonsters[0];
const pyroSummon=pyroMonsters[1];
const nonPyro=monsters.find(id=>getDuelCard(id)?.race!=='Pyro'&&id!==burningPlaceholder);
assert.ok(burningPlaceholder&&thingPlaceholder&&pyroSummon&&nonPyro,'Fixture precisa de Pyro e não-Pyro habilitados.');
const excluded=new Set([burningPlaceholder,thingPlaceholder,pyroSummon,nonPyro]);
const filler=monsters.filter(id=>!excluded.has(id)).slice(0,11);
assert.equal(filler.length,11);
const spells=enabled.filter(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field);
const traps=enabled.filter(id=>getDuelCard(id)?.kind==='trap');
assert.ok(spells.length>=2&&traps.length>=3);
const deck=[burningPlaceholder,thingPlaceholder,pyroSummon,nonPyro,...filler,spells[0],spells[1],traps[0],traps[1],traps[2]];
assert.equal(deck.length,20);assert.equal(new Set(deck).size,20);
for(const id of deck)assert.ok(enabled.includes(id));
const lookups={
 'burning-algae':id=>id===burningPlaceholder,
 'thing-in-the-crater':id=>id===thingPlaceholder
};
const exact=createExactGraveyardTransitionLookups();

function base(seed='m700-ioc-graveyard',first=0){
 const players=[
  {id:'p0',name:'Azul A',cards:[...deck],extra:[]},
  {id:'p1',name:'Vermelho A',cards:[...deck],extra:[]},
  {id:'p2',name:'Azul B',cards:[...deck],extra:[]},
  {id:'p3',name:'Vermelho B',cards:[...deck],extra:[]}
 ];
 return createTagDuel(players,{seed,first,classic:true});
}
function holder(duel,seat){
 const team=seat%2,active=duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
 if(!active)throw new Error('Assento físico indisponível: '+seat);
 return active;
}
function take(duel,seat,id){
 const held=holder(duel,seat);
 for(const pool of [held.hand,held.deck,held.extra??[]]){
  const index=pool.findIndex(card=>card.id===id);
  if(index>=0)return pool.splice(index,1)[0];
 }
 throw new Error('Carta física indisponível: '+seat+'/'+id);
}
function moveToHand(duel,seat,id){
 const held=holder(duel,seat);
 if(held.hand.some(card=>card.id===id))return held.hand.find(card=>card.id===id);
 const index=held.deck.findIndex(card=>card.id===id);
 assert.ok(index>=0,'Carta deve estar no Deck do assento físico.');
 const [card]=held.deck.splice(index,1);held.hand.push(card);return card;
}
function inventory(duel){
 return tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]).sort((a,b)=>a[0].localeCompare(b[0]));
}
function eventFor(duel,card,fromZone,{eventId='gy-event',sequence=1,destroyed=false,reason='send'}={}){
 const binding=bindTarget(duel.core,card.uid);
 assert.ok(binding,'Binding físico deve existir antes da transição.');
 assert.equal(binding.zone,fromZone);
 const ownerTeam=Number(/^m([0-3]):/.exec(card.uid)[1])%2;
 const pool=fromZone==='monsters'
  ?duel.core.players.find(player=>player.monsters.some(item=>item.uid===card.uid)).monsters
  :fromZone==='deck'?duel.core.players[ownerTeam].deck
  :fromZone==='hand'?duel.core.players[ownerTeam].hand
  :fromZone==='banished'?duel.core.players[ownerTeam].banished
  :null;
 assert.ok(pool,'Fixture não implementa a zona '+fromZone);
 const index=pool.findIndex(item=>item.uid===card.uid);assert.ok(index>=0);
 const [moved]=pool.splice(index,1);
 duel.core.players[ownerTeam].grave.push({uid:moved.uid,id:moved.id});
 synchronizeCardLifetimes(duel.core);
 return {state:duel,event:{kind:'ioc-graveyard-send',eventId,sequence,turn:duel.core.turn,
  cardUid:card.uid,fromZone,toZone:'grave',binding,destroyed,reason}};
}
function takeFromZone(duel,seat,id,zone){
 if(zone==='deck'||zone==='hand'){
  const held=holder(duel,seat),pool=zone==='deck'?held.deck:held.hand;
  const index=pool.findIndex(card=>card.id===id);assert.ok(index>=0);
  return pool[index];
 }
 if(zone==='banished'){
  const team=seat%2,index=duel.core.players[team].banished.findIndex(card=>card.id===id);
  assert.ok(index>=0);return duel.core.players[team].banished[index];
 }
 throw new Error('Zona não suportada: '+zone);
}
function addMonster(duel,seat,controllerTeam,id){
 const card=take(duel,seat,id);
 const monster={...card,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,
  attacked:0,atkBoost:0,defBoost:0,owner:seat%2};
 duel.core.players[controllerTeam].monsters.push(monster);synchronizeCardLifetimes(duel.core);return monster;
}
function sendFromZone(duel,seat,id,zone,options={}){
 const card=takeFromZone(duel,seat,id,zone);
 return eventFor(duel,card,zone,options);
}
function sendMonsterToGrave(duel,monster,options={}){
 const team=duel.core.players.findIndex(player=>player.monsters.some(card=>card.uid===monster.uid));
 assert.ok(team>=0);
 return eventFor(duel,monster,'monsters',{...options,controllerTeam:team});
}
function windowFor(duel,eventId,flags={}){
 const resolvingTeam=flags.resolvingTeam??duel.core.current;
 return {kind:'ioc-graveyard-resolution',eventId,turn:duel.core.turn,
  turnTeam:duel.core.current,turnSeat:duel.cursor,
  resolvingTeam,resolvingSeat:duel.active[resolvingTeam],...flags};
}
function activateSeat(duel,seat,turn){
 const team=seat%2,oldSeat=duel.active[team];
 if(oldSeat!==seat){
  const player=duel.core.players[team];
  duel.reserves[oldSeat]={deck:player.deck,hand:player.hand,extra:player.extra??[]};
  const incoming=duel.reserves[seat];
  player.deck=incoming.deck;player.hand=incoming.hand;player.extra=incoming.extra;
  delete duel.reserves[seat];duel.active[team]=seat;
 }
 duel.cursor=seat;duel.core.current=team;duel.core.priority=team;duel.core.turn=turn;
 duel.core.teamRotation.cursor=seat;duel.core.teamRotation.active=duel.active;duel.core.teamRotation.reserves=duel.reserves;
 return duel;
}

test('candidate identities, Konami CIDs and exact lookups are fixed without catalog admission',()=>{
 assert.equal(BURNING_ALGAE_ID,'41859700');assert.equal(BURNING_ALGAE_KONAMI_CID,5877);
 assert.equal(THING_IN_THE_CRATER_ID,'78243409');assert.equal(THING_IN_THE_CRATER_KONAMI_CID,5878);
 assert.equal(getDuelCard(BURNING_ALGAE_ID),undefined);assert.equal(getDuelCard(THING_IN_THE_CRATER_ID),undefined);
 assert.equal(exact['burning-algae'](BURNING_ALGAE_ID),true);
 assert.equal(exact['thing-in-the-crater'](THING_IN_THE_CRATER_ID),true);
});

test('owner rules remain Deck 20–30, hand 6 at End Phase, zones 3+3 and Extra 5',()=>{
 const duel=base();assert.equal(duel.core.players[0].hand.length,4);
 for(let i=0;i<7;i++)duel.core.players[0].hand.push(duel.core.players[0].deck.pop());
 assert.equal(duel.core.players[0].hand.length,11);
 const {assertTagDuel}=require('../dist/tagDuel');assert.equal(assertTagDuel(duel),undefined);
});

test('Burning Algae sent from the Deck increases the opposing team shared LP by 1000',()=>{
 const duel=base(),card=takeFromZone(duel,0,burningPlaceholder,'deck');
 const moved=eventFor(duel,card,'deck',{eventId:'burning-deck',sequence:1,reason:'mill'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 assert.equal(recorded.status,'scheduled');
 const resolved=resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'burning-deck'));
 assert.equal(resolved.status,'resolved');assert.deepEqual(resolved.lpDelta,[0,1000]);
 assert.equal(resolved.state.core.players[1].lp,5000);
});

test('Burning Algae sent from the private hand also triggers',()=>{
 const duel=base(),card=moveToHand(duel,0,burningPlaceholder);
 const moved=eventFor(duel,card,'hand',{eventId:'burning-hand',sequence:1,reason:'cost'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 const resolved=resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'burning-hand'));
 assert.equal(resolved.state.core.players[1].lp,5000);
});

test('Burning Algae sent from Banished to the GY triggers on the new transition',()=>{
 const duel=base(),card=take(duel,0,burningPlaceholder);
 duel.core.players[0].banished.push(card);synchronizeCardLifetimes(duel.core);
 const moved=eventFor(duel,card,'banished',{eventId:'burning-banished',sequence:1,reason:'other'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 const resolved=resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'burning-banished'));
 assert.equal(resolved.state.core.players[1].lp,5000);
});

test('Burning Algae uses physical owner team after control changes',()=>{
 const duel=base(),source=addMonster(duel,0,1,burningPlaceholder);
 const moved=sendMonsterToGrave(duel,source,{eventId:'burning-control-change',sequence:1,destroyed:true,reason:'battle'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 const resolved=resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'burning-control-change'));
 assert.equal(resolved.state.core.players[0].lp,4000);
 assert.equal(resolved.state.core.players[1].lp,5000);
});

test('Burning Algae effect negation prevents the LP gain',()=>{
 const duel=base(),card=takeFromZone(duel,0,burningPlaceholder,'deck');
 const moved=eventFor(duel,card,'deck',{eventId:'burning-negated',sequence:1});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 const resolved=resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'burning-negated',{effectNegated:true}));
 assert.equal(resolved.status,'effect-negated');assert.equal(resolved.state.core.players[1].lp,4000);
});

test('The Thing in the Crater triggers only when destroyed from the Monster Zone and sent to GY',()=>{
 const duel=base(),source=addMonster(duel,0,0,thingPlaceholder);
 const moved=sendMonsterToGrave(duel,source,{eventId:'thing-destroyed',sequence:1,destroyed:true,reason:'effect'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 assert.equal(recorded.status,'scheduled');
});

test('The Thing in the Crater does not trigger when sent to GY without being destroyed',()=>{
 const duel=base(),source=addMonster(duel,0,0,thingPlaceholder);
 const moved=sendMonsterToGrave(duel,source,{eventId:'thing-not-destroyed',sequence:1,destroyed:false,reason:'send'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 assert.equal(recorded.status,'no-trigger');
});

test('The Thing in the Crater does not trigger when destroyed but replaced to Banished',()=>{
 const duel=base(),source=addMonster(duel,0,0,thingPlaceholder);
 const binding=bindTarget(duel.core,source.uid);
 duel.core.players[0].monsters=duel.core.players[0].monsters.filter(card=>card.uid!==source.uid);
 duel.core.players[0].banished.push({uid:source.uid,id:source.id});synchronizeCardLifetimes(duel.core);
 const event={kind:'ioc-graveyard-send',eventId:'thing-banished',sequence:1,turn:duel.core.turn,
  cardUid:source.uid,fromZone:'monsters',toZone:'grave',binding,destroyed:true,reason:'battle'};
 const recorded=recordGraveyardTransition(duel,createGraveyardTransitionLedger(),event,lookups);
 assert.equal(recorded.status,'no-trigger');
});

test('The Thing in the Crater can be declined without moving a Pyro from hand',()=>{
 const duel=base(),source=addMonster(duel,0,0,thingPlaceholder);
 const pyro=moveToHand(duel,0,pyroSummon);
 const moved=sendMonsterToGrave(duel,source,{eventId:'thing-declined',sequence:1,destroyed:true,reason:'battle'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 const resolved=resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'thing-declined',{acceptThingInCrater:false}));
 assert.equal(resolved.status,'declined');assert.ok(resolved.state.core.players[0].hand.some(card=>card.uid===pyro.uid));
});

test('The Thing in the Crater optionally Special Summons a Pyro from the active owner private hand',()=>{
 const duel=base(),source=addMonster(duel,0,0,thingPlaceholder),pyro=moveToHand(duel,0,pyroSummon);
 const before=inventory(duel);
 const moved=sendMonsterToGrave(duel,source,{eventId:'thing-pyro',sequence:1,destroyed:true,reason:'battle'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 const resolved=resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'thing-pyro',{acceptThingInCrater:true,pyroUid:pyro.uid}));
 assert.equal(resolved.status,'summoned');assert.equal(resolved.summonedUid,pyro.uid);
 assert.ok(resolved.state.core.players[0].monsters.some(card=>card.uid===pyro.uid));
 assert.deepEqual(inventory(resolved.state),before);
});

test('The Thing in the Crater rejects a non-Pyro card from hand',()=>{
 const duel=base(),source=addMonster(duel,0,0,thingPlaceholder),card=moveToHand(duel,0,nonPyro);
 const moved=sendMonsterToGrave(duel,source,{eventId:'thing-non-pyro',sequence:1,destroyed:true,reason:'battle'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 assert.throws(()=>resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'thing-non-pyro',{
  acceptThingInCrater:true,pyroUid:card.uid
 })),/Pyro/i);
});

test('The Thing in the Crater cannot borrow a Pyro from the partner private hand',()=>{
 const duel=base(),source=addMonster(duel,0,0,thingPlaceholder),pyro=moveToHand(duel,2,pyroSummon);
 const moved=sendMonsterToGrave(duel,source,{eventId:'thing-partner-hand',sequence:1,destroyed:true,reason:'battle'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 assert.throws(()=>resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'thing-partner-hand',{
  acceptThingInCrater:true,pyroUid:pyro.uid
 })),/mão privada/i);
});

test('The Thing in the Crater uses the owner team active seat hand during the opponent turn',()=>{
 const duel=activateSeat(base(),1,1),source=addMonster(duel,0,0,thingPlaceholder),pyro=moveToHand(duel,0,pyroSummon);
 const moved=sendMonsterToGrave(duel,source,{eventId:'thing-opponent-turn',sequence:1,destroyed:true,reason:'effect'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 assert.throws(()=>resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'thing-opponent-turn',{
  resolvingTeam:1,acceptThingInCrater:true,pyroUid:pyro.uid
 })),/equipe proprietária/i);
 const resolved=resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'thing-opponent-turn',{
  resolvingTeam:0,acceptThingInCrater:true,pyroUid:pyro.uid
 }));
 assert.equal(resolved.status,'summoned');assert.ok(resolved.summonedUid.startsWith('m0:'));
});

test('The Thing in the Crater does not summon when the shared Monster Zones are full',()=>{
 const duel=base(),source=addMonster(duel,0,0,thingPlaceholder),pyro=moveToHand(duel,0,pyroSummon);
 for(let i=0;i<3;i++){
  const card=take(duel,0,filler[i]);
  duel.core.players[0].monsters.push({...card,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,
   attacked:0,atkBoost:0,defBoost:0,owner:0});
 }
 // The trigger source must have left the field before the resolution window.
 const moved=sendMonsterToGrave(duel,source,{eventId:'thing-full-zone',sequence:1,destroyed:true,reason:'battle'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 const resolved=resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'thing-full-zone',{
  acceptThingInCrater:true,pyroUid:pyro.uid
 }));
 assert.equal(resolved.status,'no-target');assert.ok(resolved.state.core.players[0].hand.some(card=>card.uid===pyro.uid));
});

test('The Thing in the Crater effect negation prevents the optional summon',()=>{
 const duel=base(),source=addMonster(duel,0,0,thingPlaceholder),pyro=moveToHand(duel,0,pyroSummon);
 const moved=sendMonsterToGrave(duel,source,{eventId:'thing-negated',sequence:1,destroyed:true,reason:'battle'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 const resolved=resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'thing-negated',{
  acceptThingInCrater:true,pyroUid:pyro.uid,effectNegated:true
 }));
 assert.equal(resolved.status,'effect-negated');assert.ok(resolved.state.core.players[0].hand.some(card=>card.uid===pyro.uid));
});

test('a duplicate GY event is idempotent and conflicting replay is rejected',()=>{
 const duel=base(),card=takeFromZone(duel,0,burningPlaceholder,'deck');
 const moved=eventFor(duel,card,'deck',{eventId:'gy-replay',sequence:1});
 const ledger=createGraveyardTransitionLedger(),first=recordGraveyardTransition(moved.state,ledger,moved.event,lookups);
 assert.equal(recordGraveyardTransition(moved.state,first.ledger,moved.event,lookups).status,'duplicate');
 assert.throws(()=>recordGraveyardTransition(moved.state,first.ledger,{...moved.event,reason:'effect'},lookups),/Replay divergente/i);
});

test('out-of-order GY event sequence is rejected',()=>{
 const duel=base(),card=takeFromZone(duel,0,burningPlaceholder,'deck');
 const moved=eventFor(duel,card,'deck',{eventId:'gy-sequence',sequence:2});
 const ledger={...createGraveyardTransitionLedger(),lastSequence:2};
 assert.throws(()=>recordGraveyardTransition(moved.state,ledger,moved.event,lookups),/fora de ordem/i);
});

test('a stale physical binding cannot activate after leaving and re-entering a zone',()=>{
 const duel=base(),card=takeFromZone(duel,0,burningPlaceholder,'deck');
 const binding=bindTarget(duel.core,card.uid);
 const held=holder(duel,0),index=held.deck.findIndex(item=>item.uid===card.uid);
 held.deck.splice(index,1);duel.core.players[0].grave.push(card);synchronizeCardLifetimes(duel.core);
 duel.core.players[0].grave=duel.core.players[0].grave.filter(item=>item.uid!==card.uid);
 duel.core.players[0].deck.push(card);synchronizeCardLifetimes(duel.core);
 duel.core.players[0].deck=duel.core.players[0].deck.filter(item=>item.uid!==card.uid);
 duel.core.players[0].grave.push(card);synchronizeCardLifetimes(duel.core);
 const event={kind:'ioc-graveyard-send',eventId:'gy-stale',sequence:1,turn:duel.core.turn,
  cardUid:card.uid,fromZone:'deck',toZone:'grave',binding,destroyed:false,reason:'mill'};
 assert.equal(recordGraveyardTransition(duel,createGraveyardTransitionLedger(),event,lookups).status,'no-trigger');
});

test('both effects conserve every physical UID and never grant inventory',()=>{
 const duel=base(),before=inventory(duel);
 const algae=takeFromZone(duel,0,burningPlaceholder,'deck');
 const algaeEvent=eventFor(duel,algae,'deck',{eventId:'gy-conserve-algae',sequence:1,reason:'mill'});
 const algaeLedger=recordGraveyardTransition(algaeEvent.state,createGraveyardTransitionLedger(),algaeEvent.event,lookups);
 const algaeResolved=resolveGraveyardTransition(algaeEvent.state,algaeLedger.ledger,windowFor(algaeEvent.state,'gy-conserve-algae'));
 assert.deepEqual(inventory(algaeResolved.state),before);
 const thingDuel=base('m700-conserve-thing'),thing=addMonster(thingDuel,0,0,thingPlaceholder);
 const pyro=moveToHand(thingDuel,0,pyroSummon),thingBefore=inventory(thingDuel);
 const thingEvent=sendMonsterToGrave(thingDuel,thing,{eventId:'gy-conserve-thing',sequence:1,destroyed:true,reason:'battle'});
 const thingLedger=recordGraveyardTransition(thingEvent.state,createGraveyardTransitionLedger(),thingEvent.event,lookups);
 const thingResolved=resolveGraveyardTransition(thingEvent.state,thingLedger.ledger,windowFor(thingEvent.state,'gy-conserve-thing',{
  acceptThingInCrater:true,pyroUid:pyro.uid
 }));
 assert.deepEqual(inventory(thingResolved.state),thingBefore);
});


test('Burning Algae triggers when sent from a Monster Zone even without destruction',()=>{
 const duel=base(),source=addMonster(duel,0,1,burningPlaceholder);
 const moved=sendMonsterToGrave(duel,source,{eventId:'burning-monster-send',sequence:1,destroyed:false,reason:'send'});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 assert.equal(recorded.status,'scheduled');
 const resolved=resolveGraveyardTransition(moved.state,recorded.ledger,windowFor(moved.state,'burning-monster-send'));
 assert.equal(resolved.state.core.players[1].lp,5000);
});

test('The Thing in the Crater does not trigger from Deck even if the event claims destruction',()=>{
 const duel=base(),moved=sendFromZone(duel,0,thingPlaceholder,'deck',{
  eventId:'thing-from-deck',sequence:1,destroyed:true,reason:'effect'
 });
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 assert.equal(recorded.status,'no-trigger');
});

test('a resolved Burning Algae event cannot apply its LP gain twice',()=>{
 const duel=base(),card=takeFromZone(duel,0,burningPlaceholder,'deck');
 const moved=eventFor(duel,card,'deck',{eventId:'burning-once',sequence:1});
 const recorded=recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),moved.event,lookups);
 const window=windowFor(moved.state,'burning-once');
 const first=resolveGraveyardTransition(moved.state,recorded.ledger,window);
 const replay=resolveGraveyardTransition(first.state,first.ledger,window);
 assert.equal(first.state.core.players[1].lp,5000);
 assert.equal(replay.status,'no-target');
 assert.equal(replay.state.core.players[1].lp,5000);
});

test('malformed reason and negative physical epoch are rejected before scheduling',()=>{
 const duel=base(),card=takeFromZone(duel,0,burningPlaceholder,'deck');
 const moved=eventFor(duel,card,'deck',{eventId:'bad-reason',sequence:1});
 assert.throws(()=>recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),{
  ...moved.event,reason:'untrusted'
 },lookups),/motivo/i);
 assert.throws(()=>recordGraveyardTransition(moved.state,createGraveyardTransitionLedger(),{
  ...moved.event,binding:{...moved.event.binding,epoch:-1}
 },lookups),/binding/i);
});

test('resolution refuses to grow a full processed-event ledger',()=>{
 const duel=base(),pending={
  eventId:'ledger-cap-pending',fingerprint:'a'.repeat(64),sequence:4097,turn:duel.core.turn,
  kind:'burning-algae',cardUid:'m0:synthetic',ownerTeam:0,fromZone:'deck',destroyed:false
 };
 const processed=Array.from({length:4096},(_,i)=>({
  eventId:'processed-'+i,fingerprint:'b'.repeat(64),sequence:i+1,status:'resolved'
 }));
 const ledger={version:1,lastSequence:4097,pending:[pending],processed};
 assert.throws(()=>resolveGraveyardTransition(duel,ledger,windowFor(duel,pending.eventId)),/limite/i);
});
