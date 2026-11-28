'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createTagDuel,tagInventory}=require('../dist/tagDuel');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');
const {bindTarget,synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {atk,def}=require('../dist/duelEngine');
const {
 TWIN_HEADED_BEHEMOTH_ID,TWIN_HEADED_BEHEMOTH_KONAMI_CID,
 VAMPIRE_LORD_ID,VAMPIRE_LORD_KONAMI_CID,
 createExactDelayedGraveyardRevivalLookups,createDelayedGraveyardRevivalLedger,
 assertDelayedGraveyardRevivalRules,recordDelayedGraveyardRevivalDestruction,
 resolveDelayedGraveyardRevival
}=require('../dist/delayedGraveyardRevivalTagAdapter');

const enabled=getEnabledCardIds();
const normalMonsters=enabled.filter(id=>{
 const c=getDuelCard(id);return c?.kind==='monster'&&c.monsterType==='normal'&&!c.fusion;
});
const effectMonsters=enabled.filter(id=>{
 const c=getDuelCard(id);return c?.kind==='monster'&&c.monsterType!=='normal'&&!c.fusion;
});
const traps=enabled.filter(id=>getDuelCard(id)?.kind==='trap');
const spells=enabled.filter(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field);
const fieldSpells=enabled.filter(id=>getDuelCard(id)?.kind==='spell'&&getDuelCard(id)?.field);
assert.ok(normalMonsters.length>=11,'A suíte exige onze Monstros Normais habilitados.');
assert.ok(effectMonsters.length>=2,'A suíte exige dois monstros de efeito habilitados.');
assert.ok(traps.length>=4&&spells.length>=2&&fieldSpells.length>=1,'A suíte exige Magias, Magia de Campo e Armadilhas habilitadas.');
const vampirePlaceholder=effectMonsters[0];
const twinPlaceholder=effectMonsters[1];
const deck=[...normalMonsters.slice(0,11),...traps.slice(0,4),...spells.slice(0,2),fieldSpells[0],vampirePlaceholder,twinPlaceholder];
assert.equal(deck.length,20);
const lookups={
 twinHeadedBehemoth:id=>id===twinPlaceholder,
 vampireLord:id=>id===vampirePlaceholder
};

function base(first=0){
 const players=[
  {id:'p0',name:'Azul A',cards:[...deck],extra:[]},
  {id:'p1',name:'Vermelho A',cards:[...deck],extra:[]},
  {id:'p2',name:'Azul B',cards:[...deck],extra:[]},
  {id:'p3',name:'Vermelho B',cards:[...deck],extra:[]}
 ];
 return createTagDuel(players,{seed:'m698-delayed-revival',first,classic:true});
}
function holder(duel,seat){
 const team=seat%2,held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
 if(!held)throw new Error('Assento físico indisponível: '+seat);
 return held;
}
function take(duel,seat,id){
 const held=holder(duel,seat);
 for(const pool of [held.hand,held.deck,held.extra??[]]){
  const index=pool.findIndex(card=>card.id===id);
  if(index>=0)return pool.splice(index,1)[0];
 }
 throw new Error('Carta física indisponível: '+seat+'/'+id);
}
function addMonster(duel,ownerSeat,controllerTeam,id){
 const card=take(duel,ownerSeat,id);
 const monster={...card,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:ownerSeat%2};
 duel.core.players[controllerTeam].monsters.push(monster);
 synchronizeCardLifetimes(duel.core);
 return monster;
}
function addNormalMonster(duel,ownerSeat=0,controllerTeam=ownerSeat%2){
 return addMonster(duel,ownerSeat,controllerTeam,normalMonsters.find(id=>!duel.core.players.some(p=>p.monsters.some(m=>m.id===id))));
}
function inventory(duel){
 return tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]).sort();
}
function destroyToGrave(duel,monster,{eventId='destroy-1',sequence=1,destruction='battle',sourceTeam=null,destination='grave'}={}){
 const controllerTeam=duel.core.players.findIndex(player=>player.monsters.some(card=>card.uid===monster.uid));
 assert.ok(controllerTeam>=0,'A instância deve estar em uma Monster Zone antes da destruição.');
 const sourceBinding=bindTarget(duel.core,monster.uid);
 assert.ok(sourceBinding&&sourceBinding.zone==='monsters');
 const ownerSeat=Number(/^m([0-3]):/.exec(monster.uid)[1]);
 const ownerTeam=ownerSeat%2;
 const pool=duel.core.players[controllerTeam].monsters;
 const index=pool.findIndex(card=>card.uid===monster.uid);
 const card=pool.splice(index,1)[0];
 if(destination==='grave')duel.core.players[ownerTeam].grave.push({uid:card.uid,id:card.id});
 else if(destination==='banished')(duel.core.players[ownerTeam].banished??=[]).push({uid:card.uid,id:card.id});
 else if(destination==='hand')duel.core.players[ownerTeam].hand.push({uid:card.uid,id:card.id});
 synchronizeCardLifetimes(duel.core);
 const graveBinding=destination==='grave'?bindTarget(duel.core,monster.uid):null;
 return {
  state:duel,
  event:{
   kind:'delayed-graveyard-revival-destruction',eventId,sequence,turn:duel.core.turn,
   cardUid:monster.uid,destination,destruction,controllerTeam,sourceTeam,sourceBinding,graveBinding
  }
 };
}
function record(duel,ledger,monster,options){
 const moved=destroyToGrave(duel,monster,options);
 return {state:moved.state,event:moved.event,result:recordDelayedGraveyardRevivalDestruction(moved.state,ledger,moved.event,lookups)};
}
function windowFor(duel,eventId,phase,accepted=true,flags={}){
 return {
  kind:'delayed-graveyard-revival-window',eventId,phase,turn:duel.core.turn,
  activeTeam:duel.core.current,activeSeat:duel.cursor,accepted,...flags
 };
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
function moveGraveToBanished(duel,uid,team=0){
 const grave=duel.core.players[team].grave,index=grave.findIndex(card=>card.uid===uid);
 assert.ok(index>=0);
 (duel.core.players[team].banished??=[]).push(grave.splice(index,1)[0]);
 synchronizeCardLifetimes(duel.core);
}
function moveGraveToHandAndBack(duel,uid,team=0){
 const grave=duel.core.players[team].grave,index=grave.findIndex(card=>card.uid===uid);
 assert.ok(index>=0);
 const card=grave.splice(index,1)[0];duel.core.players[team].hand.push(card);synchronizeCardLifetimes(duel.core);
 const hand=duel.core.players[team].hand,index2=hand.findIndex(c=>c.uid===uid);
 duel.core.players[team].grave.push(hand.splice(index2,1)[0]);synchronizeCardLifetimes(duel.core);
}

test('candidate identities are exact, officially sourced and not admitted by the current engine',()=>{
 assert.equal(TWIN_HEADED_BEHEMOTH_ID,'43586926');assert.equal(TWIN_HEADED_BEHEMOTH_KONAMI_CID,5030);
 assert.equal(VAMPIRE_LORD_ID,'53839837');assert.equal(VAMPIRE_LORD_KONAMI_CID,5410);
 assert.equal(getDuelCard(TWIN_HEADED_BEHEMOTH_ID),undefined);
 assert.equal(getDuelCard(VAMPIRE_LORD_ID),undefined);
 assert.equal(enabled.includes(TWIN_HEADED_BEHEMOTH_ID),false);
 assert.equal(enabled.includes(VAMPIRE_LORD_ID),false);
 const exact=createExactDelayedGraveyardRevivalLookups();
 assert.equal(exact.twinHeadedBehemoth(TWIN_HEADED_BEHEMOTH_ID),true);
 assert.equal(exact.vampireLord(VAMPIRE_LORD_ID),true);
 assert.equal(lookups.twinHeadedBehemoth(twinPlaceholder),true);
 assert.equal(lookups.vampireLord(vampirePlaceholder),true);
});

test('owner rules remain Deck 20–30, hand 6 at End Phase, zones 3+3 and Extra 5',()=>{
 const duel=base();assert.equal(assertDelayedGraveyardRevivalRules(duel),undefined);
 for(let i=0;i<7;i++)duel.core.players[0].hand.push(duel.core.players[0].deck.pop());
 assert.equal(duel.core.players[0].hand.length,11);
 assert.equal(assertDelayedGraveyardRevivalRules(duel),undefined);
});

test('Twin-Headed Behemoth schedules only after destruction on the field sent to the owner GY',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder),ledger=createDelayedGraveyardRevivalLedger();
 const moved=record(duel,ledger,source,{destruction:'battle'});
 assert.equal(moved.result.status,'scheduled');
 assert.equal(moved.result.ledger.pending[0].kind,'twin-headed-behemoth');
 assert.equal(moved.result.ledger.pending[0].duePhase,'end');
 assert.equal(moved.result.ledger.pending[0].dueTurn,duel.core.turn);
});

test('Twin-Headed Behemoth can revive after either battle or effect destruction',()=>{
 for(const destruction of ['battle','effect']){
  const duel=base(),source=addMonster(duel,0,0,twinPlaceholder);
  const result=record(duel,createDelayedGraveyardRevivalLedger(),source,{destruction});
  assert.equal(result.result.status,'scheduled');
 }
});

test('Twin-Headed Behemoth follows physical owner when destroyed under the opposing team control',()=>{
 const duel=activateSeat(base(),1,1),source=addMonster(duel,0,1,twinPlaceholder);
 const result=record(duel,createDelayedGraveyardRevivalLedger(),source,{destruction:'effect',sourceTeam:0});
 assert.equal(result.result.status,'scheduled');
 const window=windowFor(duel,result.event.eventId,'end');
 const revived=resolveDelayedGraveyardRevival(duel,result.result.ledger,window,lookups);
 assert.equal(revived.status,'summoned');
 assert.equal(revived.state.core.players[0].monsters[0].uid,source.uid);
 assert.ok(source.uid.startsWith('m0:'));
 assert.equal(revived.state.core.players[1].monsters.length,0);
});

test('Twin-Headed Behemoth returns with exactly 1000 ATK and DEF',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder),result=record(duel,createDelayedGraveyardRevivalLedger(),source,{});
 const revived=resolveDelayedGraveyardRevival(duel,result.result.ledger,windowFor(duel,result.event.eventId,'end'),lookups);
 const monster=revived.state.core.players[0].monsters.find(card=>card.uid===source.uid);
 assert.equal(revived.status,'summoned');assert.equal(revived.atkAfter,1000);assert.equal(revived.defAfter,1000);
 assert.equal(atk(monster,revived.state.core),1000);assert.equal(def(monster,revived.state.core),1000);
});

test('Twin-Headed Behemoth is optional and declining does not consume its once-per-Duel use',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder),result=record(duel,createDelayedGraveyardRevivalLedger(),source,{});
 const declined=resolveDelayedGraveyardRevival(duel,result.result.ledger,windowFor(duel,result.event.eventId,'end',false),lookups);
 assert.equal(declined.status,'no-trigger');assert.equal(declined.ledger.twinUsedUids.includes(source.uid),false);
 assert.equal(declined.state.core.players[0].monsters.some(card=>card.uid===source.uid),false);
});

test('a negated Twin-Headed Behemoth activation consumes its once-per-Duel use without summoning',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder),result=record(duel,createDelayedGraveyardRevivalLedger(),source,{});
 const negated=resolveDelayedGraveyardRevival(duel,result.result.ledger,windowFor(duel,result.event.eventId,'end',true,{activationNegated:true}),lookups);
 assert.equal(negated.status,'effect-negated');assert.ok(negated.ledger.twinUsedUids.includes(source.uid));
 assert.equal(negated.state.core.players[0].monsters.some(card=>card.uid===source.uid),false);
});

test('Twin-Headed Behemoth once-per-Duel is tracked by physical UID, not card name',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder),ledger=createDelayedGraveyardRevivalLedger();
 const first=record(duel,ledger,source,{eventId:'twin-first',sequence:1});
 const revived=resolveDelayedGraveyardRevival(duel,first.result.ledger,windowFor(duel,'twin-first','end'),lookups);
 assert.ok(revived.ledger.twinUsedUids.includes(source.uid));
 const returned=revived.state.core.players[0].monsters.find(card=>card.uid===source.uid);
 const second=record(revived.state,revived.ledger,returned,{eventId:'twin-second',sequence:2});
 assert.equal(second.result.status,'no-trigger');
});

test('a full three-monster field leaves the optional Twin-Headed Behemoth trigger pending',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder),result=record(duel,createDelayedGraveyardRevivalLedger(),source,{});
 for(let i=0;i<3;i++)addNormalMonster(duel,0,0);
 const full=resolveDelayedGraveyardRevival(duel,result.result.ledger,windowFor(duel,result.event.eventId,'end'),lookups);
 assert.equal(full.status,'no-space');assert.equal(full.ledger.pending.length,1);
 const removed=duel.core.players[0].monsters.pop();duel.core.players[0].grave.push({uid:removed.uid,id:removed.id});synchronizeCardLifetimes(duel.core);
 const retry=resolveDelayedGraveyardRevival(duel,result.result.ledger,windowFor(duel,result.event.eventId,'end'),lookups);
 assert.equal(retry.status,'summoned');
});

test('a Twin-Headed Behemoth moved out of the GY before End Phase cannot revive',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder),result=record(duel,createDelayedGraveyardRevivalLedger(),source,{});
 moveGraveToBanished(duel,source.uid);
 const resolved=resolveDelayedGraveyardRevival(duel,result.result.ledger,windowFor(duel,result.event.eventId,'end'),lookups);
 assert.equal(resolved.status,'no-trigger');
});

test('a stale GY binding cannot revive a card that left and re-entered the GY',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder),result=record(duel,createDelayedGraveyardRevivalLedger(),source,{});
 moveGraveToHandAndBack(duel,source.uid);
 const resolved=resolveDelayedGraveyardRevival(duel,result.result.ledger,windowFor(duel,result.event.eventId,'end'),lookups);
 assert.equal(resolved.status,'no-trigger');
});

test('Twin-Headed Behemoth cannot resolve in Standby Phase or on a later turn',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder),result=record(duel,createDelayedGraveyardRevivalLedger(),source,{});
 assert.throws(()=>resolveDelayedGraveyardRevival(duel,result.result.ledger,windowFor(duel,result.event.eventId,'standby'),lookups),/janela válida/i);
 duel.core.turn++;
 assert.throws(()=>resolveDelayedGraveyardRevival(duel,result.result.ledger,windowFor(duel,result.event.eventId,'end'),lookups),/janela válida/i);
});

test('Vampire Lord schedules only after opponent effect destruction while controlled by its owner team',()=>{
 const duel=base(),source=addMonster(duel,0,0,vampirePlaceholder);
 const result=record(duel,createDelayedGraveyardRevivalLedger(),source,{destruction:'effect',sourceTeam:1});
 assert.equal(result.result.status,'scheduled');
 assert.equal(result.result.ledger.pending[0].kind,'vampire-lord');
 assert.equal(result.result.ledger.pending[0].duePhase,'standby');
 assert.equal(result.result.ledger.pending[0].dueTurn,3);
});

test('Vampire Lord schedules the next team Standby Phase when destroyed during the opponent turn',()=>{
 const duel=base(),source=addMonster(duel,1,1,vampirePlaceholder);
 const result=record(duel,createDelayedGraveyardRevivalLedger(),source,{destruction:'effect',sourceTeam:0});
 assert.equal(result.result.status,'scheduled');assert.equal(result.result.ledger.pending[0].dueTurn,2);
});

test('Vampire Lord does not trigger from battle destruction',()=>{
 const duel=base(),source=addMonster(duel,0,0,vampirePlaceholder);
 const result=record(duel,createDelayedGraveyardRevivalLedger(),source,{destruction:'battle',sourceTeam:1});
 assert.equal(result.result.status,'no-trigger');
});

test('Vampire Lord does not trigger from its controller team own card effect',()=>{
 const duel=base(),source=addMonster(duel,0,0,vampirePlaceholder);
 const result=record(duel,createDelayedGraveyardRevivalLedger(),source,{destruction:'effect',sourceTeam:0});
 assert.equal(result.result.status,'no-trigger');
});

test('Vampire Lord stolen by the opponent is not treated as being in its owner possession',()=>{
 const duel=base(),source=addMonster(duel,0,1,vampirePlaceholder);
 const result=record(duel,createDelayedGraveyardRevivalLedger(),source,{destruction:'effect',sourceTeam:0});
 assert.equal(result.result.status,'no-trigger');
});

test('Vampire Lord revives only in the owner team next Standby Phase',()=>{
 const duel=base(),source=addMonster(duel,0,0,vampirePlaceholder);
 const result=record(duel,createDelayedGraveyardRevivalLedger(),source,{destruction:'effect',sourceTeam:1});
 const wrong=activateSeat(structuredClone(duel),1,2);
 assert.throws(()=>resolveDelayedGraveyardRevival(wrong,result.result.ledger,windowFor(wrong,result.event.eventId,'standby'),lookups),/janela válida/i);
 const due=activateSeat(structuredClone(duel),0,3);
 const revived=resolveDelayedGraveyardRevival(due,result.result.ledger,windowFor(due,result.event.eventId,'standby'),lookups);
 assert.equal(revived.status,'summoned');assert.equal(revived.state.core.players[0].monsters[0].uid,source.uid);
});

test('Vampire Lord owned by the inactive partner returns to the shared team field with the same UID',()=>{
 const duel=base(),source=addMonster(duel,2,0,vampirePlaceholder);
 const result=record(duel,createDelayedGraveyardRevivalLedger(),source,{destruction:'effect',sourceTeam:1});
 const due=activateSeat(structuredClone(duel),0,3);
 const revived=resolveDelayedGraveyardRevival(due,result.result.ledger,windowFor(due,result.event.eventId,'standby'),lookups);
 assert.equal(revived.status,'summoned');
 assert.equal(revived.state.core.players[0].monsters[0].uid,source.uid);
 assert.ok(source.uid.startsWith('m2:'));
});

test('Vampire Lord effect negation prevents the revival and records the once-per-turn use',()=>{
 const duel=base(),source=addMonster(duel,0,0,vampirePlaceholder);
 const result=record(duel,createDelayedGraveyardRevivalLedger(),source,{destruction:'effect',sourceTeam:1});
 const due=activateSeat(structuredClone(duel),0,3);
 const negated=resolveDelayedGraveyardRevival(due,result.result.ledger,windowFor(due,result.event.eventId,'standby',true,{effectNegated:true}),lookups);
 assert.equal(negated.status,'effect-negated');
 assert.ok(negated.ledger.vampireUsedTurns.some(item=>item.uid===source.uid&&item.turn===3));
 assert.equal(negated.state.core.players[0].monsters.some(card=>card.uid===source.uid),false);
});

test('Vampire Lord effect can be declined without changing card location or inventory',()=>{
 const duel=base(),source=addMonster(duel,0,0,vampirePlaceholder),before=inventory(duel);
 const result=record(duel,createDelayedGraveyardRevivalLedger(),source,{destruction:'effect',sourceTeam:1});
 const due=activateSeat(structuredClone(duel),0,3);
 const declined=resolveDelayedGraveyardRevival(due,result.result.ledger,windowFor(due,result.event.eventId,'standby',false),lookups);
 assert.equal(declined.status,'no-trigger');assert.deepEqual(inventory(declined.state),before);
});

test('Vampire Lord does not revive after leaving its GY before the due Standby Phase',()=>{
 const duel=base(),source=addMonster(duel,0,0,vampirePlaceholder),result=record(duel,createDelayedGraveyardRevivalLedger(),source,{destruction:'effect',sourceTeam:1});
 moveGraveToBanished(duel,source.uid);
 const due=activateSeat(duel,0,3);
 const resolved=resolveDelayedGraveyardRevival(due,result.result.ledger,windowFor(due,result.event.eventId,'standby'),lookups);
 assert.equal(resolved.status,'no-trigger');
});

test('Vampire Lord with a full owner field keeps its pending trigger until a zone opens',()=>{
 const duel=base(),source=addMonster(duel,0,0,vampirePlaceholder),result=record(duel,createDelayedGraveyardRevivalLedger(),source,{destruction:'effect',sourceTeam:1});
 for(let i=0;i<3;i++)addNormalMonster(duel,0,0);
 const due=activateSeat(duel,0,3);
 const full=resolveDelayedGraveyardRevival(due,result.result.ledger,windowFor(due,result.event.eventId,'standby'),lookups);
 assert.equal(full.status,'no-space');assert.equal(full.ledger.pending.length,1);
 const removed=full.state.core.players[0].monsters.pop();
 full.state.core.players[0].grave.push({uid:removed.uid,id:removed.id});synchronizeCardLifetimes(full.state.core);
 const retry=resolveDelayedGraveyardRevival(full.state,full.ledger,windowFor(full.state,result.event.eventId,'standby'),lookups);
 assert.equal(retry.status,'summoned');
});

test('replaying a destruction event or resolved revival is idempotent',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder),ledger=createDelayedGraveyardRevivalLedger();
 const first=record(duel,ledger,source,{});
 const replayRecord=recordDelayedGraveyardRevivalDestruction(duel,first.result.ledger,first.event,lookups);
 assert.equal(replayRecord.status,'duplicate');
 const resolved=resolveDelayedGraveyardRevival(duel,first.result.ledger,windowFor(duel,first.event.eventId,'end'),lookups);
 const replayResolve=resolveDelayedGraveyardRevival(resolved.state,resolved.ledger,windowFor(resolved.state,first.event.eventId,'end'),lookups);
 assert.equal(resolved.status,'summoned');assert.equal(replayResolve.status,'duplicate');
});

test('reusing an event ID with divergent destruction evidence is rejected',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder),first=record(duel,createDelayedGraveyardRevivalLedger(),source,{});
 assert.throws(()=>recordDelayedGraveyardRevivalDestruction(duel,first.result.ledger,{...first.event,sourceTeam:1},lookups),/Replay divergente/i);
});

test('destruction sequences must be strictly increasing',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder),ledger=createDelayedGraveyardRevivalLedger();
 const first=record(duel,ledger,source,{sequence:2});
 const other=addMonster(duel,1,1,vampirePlaceholder);
 const second=destroyToGrave(duel,other,{eventId:'old-sequence',sequence:1,destruction:'effect',sourceTeam:0});
 assert.throws(()=>recordDelayedGraveyardRevivalDestruction(duel,first.result.ledger,second.event,lookups),/fora de ordem/i);
});

test('a card sent to banishment does not trigger either revival',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder);
 const moved=destroyToGrave(duel,source,{destination:'banished'});
 const result=recordDelayedGraveyardRevivalDestruction(duel,createDelayedGraveyardRevivalLedger(),moved.event,lookups);
 assert.equal(result.status,'no-trigger');
});

test('a fourth Monster Zone or Spell/Trap Zone is rejected while Field Zone remains separate',()=>{
 const tooManyMonsters=base();
 for(let i=0;i<4;i++)addNormalMonster(tooManyMonsters,0,0);
 assert.throws(()=>assertDelayedGraveyardRevivalRules(tooManyMonsters),/Monster Zones/i);
 const tooManyBackrow=base();
 for(let i=0;i<4;i++){
  const card=take(tooManyBackrow,0,traps[i]);
  tooManyBackrow.core.players[0].backrow.push({...card,setTurn:0,faceUp:true,resolved:true});
 }
 synchronizeCardLifetimes(tooManyBackrow.core);
 assert.throws(()=>assertDelayedGraveyardRevivalRules(tooManyBackrow),/Spell\/Trap Zones/i);
 const field=base(),fieldCard=take(field,0,fieldSpells[0]);
 field.core.players[0].field={...fieldCard,setTurn:0,faceUp:true,resolved:true};
 synchronizeCardLifetimes(field.core);
 assert.equal(assertDelayedGraveyardRevivalRules(field),undefined);
});

test('a physical Main Deck below twenty and an Extra Deck above five are rejected',()=>{
 const short=base();short.core.players[0].deck.pop();
 assert.throws(()=>assertDelayedGraveyardRevivalRules(short),/Deck Principal físico/i);
 const fusions=enabled.filter(id=>getDuelCard(id)?.fusion);
 assert.ok(fusions.length>=6);
 const tooManyExtra=base();tooManyExtra.core.players[0].extra??=[];
 for(let i=0;i<6;i++)tooManyExtra.core.players[0].extra.push({uid:'m0:m698-extra-'+i,id:fusions[i]});
 assert.throws(()=>assertDelayedGraveyardRevivalRules(tooManyExtra),/Deck Adicional físico excedeu cinco/i);
});

test('revival conserves every physical UID and card identity without granting inventory',()=>{
 const duel=base(),source=addMonster(duel,0,0,twinPlaceholder),before=inventory(duel);
 const result=record(duel,createDelayedGraveyardRevivalLedger(),source,{});
 const revived=resolveDelayedGraveyardRevival(duel,result.result.ledger,windowFor(duel,result.event.eventId,'end'),lookups);
 assert.deepEqual(inventory(revived.state),before);
 assert.equal(revived.state.core.players[0].monsters.filter(card=>card.uid===source.uid).length,1);
});
