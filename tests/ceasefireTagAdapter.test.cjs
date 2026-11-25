'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getDuelCard,getPlayableCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
  CEASEFIRE_ID,
  assertCeasefireRules,
  assertPhysicalExtraDeckCounts,
  ceasefireActions,
  createCeasefireSession,
  activateCeasefire,
  resolveCeasefire
}=require('../dist/ceasefireTagAdapter');

const SOURCE_TRAP_ID='56120475'; // enabled Normal Trap fixture
const MST='05318639';
const COUNTER_TRAP_ID='77414722';
const JINZO_ID='77585513';
const FIELD_ID='86318356';
const MAN_EATER_ID='54652250';
const MAGician_OF_FAITH_ID='31560081';
const lookup=id=>{
  const card=getDuelCard(id);
  return card?{kind:card.kind,monsterType:card.monsterType,effectMonster:card.kind==='monster'&&card.monsterType==='effect',name:card.englishName??card.name}:undefined;
};
const normalDeck=tag.tagNormalCardIds.slice(0,20);
assert.equal(normalDeck.length,20);

function makeDuel(first=0){
  const players=[0,1,2,3].map(seat=>({
    id:'m630-seat-'+seat,
    name:'M630 Seat '+seat,
    cards:[...normalDeck],
    extra:[]
  }));
  const duel=tag.createTagDuel(players,{seed:'m630-ceasefire-'+first,first,classic:true});
  duel.core.players[0].lp=8000;
  duel.core.players[1].lp=8000;
  duel.core.turn=3;
  duel.core.phase='main';
  duel.core.resume='main';
  duel.core.pending={kind:'none'};
  duel.core.chain=[];
  duel.core.priority=first%2;
  duel.core.passes=0;
  duel.core.damageStep=false;
  duel.core.turnEnding=false;
  duel.core.pendingNegated=false;
  duel.core.handFlow=undefined;
  duel.core.choice=undefined;
  duel.core.summonTriggers=[];
  duel.core.triggerBuild=undefined;
  return duel;
}
function privateZone(duel,seat,zone){
  const team=seat%2;
  return duel.active[team]===seat
    ?duel.core.players[team][zone]
    :duel.reserves[String(seat)][zone];
}
function partnerSeat(seat){return (seat+2)%4;}
function placeBackrow(duel,ownerSeat,controllerTeam,id,setTurn=0,faceUp=false){
  const hand=privateZone(duel,ownerSeat,'hand');
  const [card]=hand.splice(0,1);
  assert.ok(card,'fixture needs a physical card in hand for seat '+ownerSeat);
  card.id=id;
  duel.core.players[controllerTeam].backrow.push({...card,faceUp,setTurn});
  return card.uid;
}
function placeField(duel,ownerSeat,controllerTeam,id,faceUp=true){
  const hand=privateZone(duel,ownerSeat,'hand');
  const [card]=hand.splice(0,1);
  assert.ok(card);
  card.id=id;
  duel.core.players[controllerTeam].field={...card,faceUp,setTurn:0};
  return card.uid;
}
function placeMonster(duel,ownerSeat,controllerTeam,id,faceUp=true){
  const hand=privateZone(duel,ownerSeat,'hand');
  const [card]=hand.splice(0,1);
  assert.ok(card);
  card.id=id;
  duel.core.players[controllerTeam].monsters.push({
    ...card,owner:ownerSeat%2,position:faceUp?'atk':'def',faceUp,
    entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0
  });
  return card.uid;
}
function setPendingSpell(duel,actorTeam,targetUid,id=MST){
  duel.core.phase='response';
  duel.core.resume='main';
  duel.core.pending={kind:'spell',actor:actorTeam,card:targetUid,id};
  duel.core.chain=[];
  duel.core.priority=1-actorTeam;
  duel.core.passes=0;
}
function setChain(duel,actorTeam,targetUid,id){
  duel.core.phase='response';
  duel.core.resume='main';
  duel.core.pending={kind:'none'};
  duel.core.chain=[{actor:actorTeam,card:targetUid,id,target:''}];
  duel.core.priority=1-actorTeam;
  duel.core.passes=0;
}
function setup({
  first=0,
  controllerTeam=0,
  sourceOwnerSeat,
  sourceSetTurn=1,
  sourceFaceUp=false,
  targetTeam=1,
  targetOwnerSeat,
  targetKind='spell',
  targetId=MST,
  condition='faceDownNormal',
  lp=8000
}={}){
  const duel=makeDuel(first);
  const activeSeat=duel.active[controllerTeam];
  const sourceOwner=sourceOwnerSeat??partnerSeat(activeSeat);
  const targetOwner=targetOwnerSeat??duel.active[targetTeam];
  const sourceUid=placeBackrow(duel,sourceOwner,controllerTeam,SOURCE_TRAP_ID,sourceSetTurn,sourceFaceUp);
  const targetUid=targetKind==='chain'
    ?placeBackrow(duel,targetOwner,targetTeam,targetId,0,true)
    :placeBackrow(duel,targetOwner,targetTeam,targetId,0,true);
  if(targetKind==='chain')setChain(duel,targetTeam,targetUid,targetId);
  else setPendingSpell(duel,targetTeam,targetUid,targetId);
  let conditionUid;
  if(condition==='faceDownNormal')conditionUid=placeMonster(duel,duel.active[targetTeam],targetTeam,normalDeck[0],false);
  else if(condition==='effect')conditionUid=placeMonster(duel,duel.active[targetTeam],targetTeam,MAN_EATER_ID,true);
  duel.core.players[controllerTeam].lp=lp;
  duel.core.priority=controllerTeam;
  tag.assertTagDuel(duel);
  assertCeasefireRules(duel);
  return {duel,controllerTeam,activeSeat,sourceOwnerSeat:sourceOwner,sourceUid,targetTeam,targetOwnerSeat:targetOwner,targetUid,conditionUid};
}
function actions(f,lookupFn=lookup){
  return ceasefireActions(f.duel,lookupFn,{cardId:SOURCE_TRAP_ID});
}
function activate(f,id='m630-activation',lookupFn=lookup){
  return activateCeasefire(createCeasefireSession(f.duel),f.sourceUid,id,lookupFn,{cardId:SOURCE_TRAP_ID});
}
function resolve(session,id='m630-activation',options={}){
  return resolveCeasefire(session,id,lookup,{...options,cardId:SOURCE_TRAP_ID});
}
function inventory(duel){
  return tag.tagInventory(duel).filter(card=>card.entityKind!=='token')
    .map(card=>card.uid+'|'+card.id).sort();
}
function graveHas(duel,team,uid){
  return duel.core.players[team].grave.some(card=>card.uid===uid);
}
function removeCondition(f){
  const team=f.conditionUid?Number(f.conditionUid.match(/^m([0-3]):/)[1])%2:f.targetTeam;
  const player=f.duel.core.players[team];
  const index=player.monsters.findIndex(card=>card.uid===f.conditionUid);
  assert.ok(index>=0);
  const [card]=player.monsters.splice(index,1);
  privateZone(f.duel,Number(f.conditionUid.match(/^m([0-3]):/)[1]),'hand').push(card);
  synchronizeCardLifetimes(f.duel.core);
}
function moveSourceToGraveBeforeResolve(session,sourceUid,ownerSeat){
  const team=ownerSeat%2;
  for(const controller of [0,1]){
    const index=session.duel.core.players[controller].backrow.findIndex(card=>card.uid===sourceUid);
    if(index>=0){
      const [card]=session.duel.core.players[controller].backrow.splice(index,1);
      session.duel.core.players[team].grave.push({uid:card.uid,id:card.id});
      synchronizeCardLifetimes(session.duel.core);
      return;
    }
  }
  throw new Error('source not found');
}

test('Ceasefire remains unadmitted and grants no inventory',()=>{
  assert.equal(getPlayableCard(CEASEFIRE_ID),undefined);
  assert.equal(getDuelCard(CEASEFIRE_ID),undefined);
  assertPhysicalExtraDeckCounts([0,1,2,3],5);
  assert.throws(()=>assertPhysicalExtraDeckCounts([0,1,6,3],5),/cinco/);
});
test('offers only the Set Trap when a face-down Defense monster is present',()=>{
  const f=setup();
  assert.deepEqual(actions(f),[{kind:'trap',card:f.sourceUid,target:''}]);
  assert.ok(!JSON.stringify(actions(f)).includes(f.targetUid));
});
test('can activate when an Effect Monster is present even with no face-down monsters',()=>{
  const f=setup({condition:'none'});
  const effectUid=placeMonster(f.duel,f.duel.active[1],1,MAN_EATER_ID,true);
  tag.assertTagDuel(f.duel);
  assert.equal(actions(f).length,1);
  assert.ok(effectUid);
});
test('does not activate with only face-up Normal Monsters and no face-down monsters',()=>{
  const f=setup();
  removeCondition(f);
  placeMonster(f.duel,f.duel.active[1],1,normalDeck[1],true);
  assert.deepEqual(actions(f),[]);
});
test('requires a live response window',()=>{
  const f=setup();
  f.duel.core.phase='main';
  assert.deepEqual(actions(f),[]);
  const noPending=setup();
  noPending.duel.core.pending={kind:'none'};
  noPending.duel.core.chain=[];
  assert.deepEqual(actions(noPending),[]);
});
test('cannot activate during the Damage Step',()=>{
  const f=setup();
  f.duel.core.damageStep=true;
  assert.deepEqual(actions(f),[]);
});
test('cannot chain a Normal Trap to a Counter Trap',()=>{
  const f=setup({targetKind:'chain',targetId:COUNTER_TRAP_ID});
  assert.deepEqual(actions(f),[]);
});
test('can chain to an ordinary Spell or Normal Trap activation',()=>{
  const spell=setup({targetKind:'spell',targetId:MST});
  assert.equal(actions(spell).length,1);
  const normalTrap=setup({targetKind:'chain',targetId:SOURCE_TRAP_ID});
  assert.equal(actions(normalTrap).length,1);
});
test('flips every face-down Defense monster on both teams',()=>{
  const f=setup();
  const second=placeMonster(f.duel,f.duel.active[0],0,normalDeck[1],false);
  const session=activate(f);
  const resolved=resolve(session);
  assert.equal(resolved.result.flippedUids.length,2);
  for(const uid of [f.conditionUid,second]){
    const monster=resolved.session.duel.core.players.flatMap(player=>player.monsters).find(card=>card.uid===uid);
    assert.equal(monster.faceUp,true);
    assert.equal(monster.position,'def');
  }
});
test('flipping monsters does not enqueue or activate Flip Effects',()=>{
  const f=setup();
  const flipUid=placeMonster(f.duel,f.duel.active[0],0,MAN_EATER_ID,false);
  f.duel.core.summonTriggers=[];
  f.duel.core.triggerBuild=undefined;
  const resolved=resolve(activate(f));
  assert.equal(resolved.result.flipEffectsActivated,false);
  assert.deepEqual(resolved.session.duel.core.summonTriggers,[]);
  assert.equal(resolved.session.duel.core.triggerBuild,undefined);
  assert.ok(resolved.result.flippedUids.includes(flipUid));
});
test('counts Effect Monsters from both teams after the mass flip',()=>{
  const f=setup();
  const first=placeMonster(f.duel,f.duel.active[0],0,MAN_EATER_ID,true);
  const second=placeMonster(f.duel,f.duel.active[1],1,MAGician_OF_FAITH_ID,false);
  const resolved=resolve(activate(f));
  assert.equal(resolved.result.effectMonsterCount,2);
  assert.equal(resolved.result.damage,1000);
  assert.ok(resolved.result.flippedUids.includes(second));
  assert.ok(!resolved.result.flippedUids.includes(first));
});
test('counts a face-down Effect Monster after it is flipped face-up',()=>{
  const f=setup({condition:'none'});
  const uid=placeMonster(f.duel,f.duel.active[1],1,MAN_EATER_ID,false);
  const resolved=resolve(activate(f));
  assert.equal(resolved.result.effectMonsterCount,1);
  assert.equal(resolved.result.damage,500);
  assert.ok(resolved.result.flippedUids.includes(uid));
});
test('a face-down Normal Monster is flipped but contributes no burn damage',()=>{
  const f=setup();
  const resolved=resolve(activate(f));
  assert.equal(resolved.result.flippedUids.length,1);
  assert.equal(resolved.result.effectMonsterCount,0);
  assert.equal(resolved.result.damage,0);
  assert.equal(resolved.session.duel.core.players[1].lp,8000);
});
test('inflicts damage only to the opposing shared LP pool',()=>{
  const f=setup();
  placeMonster(f.duel,f.duel.active[0],0,MAN_EATER_ID,true);
  placeMonster(f.duel,f.duel.active[1],1,MAGician_OF_FAITH_ID,true);
  const resolved=resolve(activate(f));
  assert.equal(resolved.session.duel.core.players[0].lp,8000);
  assert.equal(resolved.session.duel.core.players[1].lp,7000);
  assert.equal(resolved.result.damage,1000);
});
test('ends the duel if Ceasefire reduces the opponent to zero LP',()=>{
  const f=setup({lp:8000});
  f.duel.core.players[1].lp=500;
  placeMonster(f.duel,f.duel.active[0],0,MAN_EATER_ID,true);
  const resolved=resolve(activate(f));
  assert.equal(resolved.session.duel.core.players[1].lp,0);
  assert.equal(resolved.session.duel.core.phase,'finished');
  assert.equal(resolved.session.duel.core.winner,resolved.session.duel.core.players[0].id);
  assert.equal(resolved.result.duelEndedByLP,true);
});
test('a negated Ceasefire does not flip monsters or inflict damage',()=>{
  const f=setup();
  const session=activate(f);
  const resolved=resolve(session,'m630-activation',{sourceActivationNegated:true});
  assert.equal(resolved.result.sourceEffectNegated,true);
  assert.deepEqual(resolved.result.flippedUids,[]);
  assert.equal(resolved.result.damage,0);
  assert.equal(resolved.session.duel.core.players[1].lp,8000);
  assert.ok(graveHas(resolved.session.duel,0,f.sourceUid));
});
test('a Counter Trap that negates Ceasefire still sends the source to its physical owner Graveyard',()=>{
  const f=setup();
  const session=activate(f);
  session.duel.core.chain.at(-1).negated=true;
  const resolved=resolve(session);
  assert.equal(resolved.result.sourceEffectNegated,true);
  assert.equal(resolved.result.damage,0);
  assert.ok(graveHas(resolved.session.duel,0,f.sourceUid));
});
test('Jinzo blocks the activation before the action is offered',()=>{
  const f=setup();
  placeMonster(f.duel,f.duel.active[0],0,JINZO_ID,true);
  assert.deepEqual(actions(f),[]);
});
test('Jinzo appearing after activation negates Ceasefire at resolution',()=>{
  const f=setup();
  const session=activate(f);
  placeMonster(session.duel,session.duel.active[0],0,JINZO_ID,true);
  const resolved=resolve(session);
  assert.equal(resolved.result.sourceEffectNegated,true);
  assert.equal(resolved.result.damage,0);
  assert.equal(resolved.result.flippedUids.length,0);
});
test('a stolen Ceasefire fixture returns to the physical owner team',()=>{
  const f=setup({sourceOwnerSeat:1});
  const resolved=resolve(activate(f));
  assert.ok(graveHas(resolved.session.duel,1,f.sourceUid));
  assert.ok(!graveHas(resolved.session.duel,0,f.sourceUid));
});
test('a Set card owned by the inactive partner can be activated by the active teammate',()=>{
  const f=setup();
  assert.equal(f.sourceOwnerSeat,partnerSeat(f.activeSeat));
  const session=activate(f);
  assert.equal(session.pending['m630-activation'].controllerSeat,f.activeSeat);
  assert.equal(session.pending['m630-activation'].sourceOwnerSeat,f.sourceOwnerSeat);
});
test('rejects a Trap Set during the current turn and a face-up source',()=>{
  assert.deepEqual(actions(setup({sourceSetTurn:3})),[]);
  assert.deepEqual(actions(setup({sourceFaceUp:true})),[]);
});
test('requires the response priority and rejects a wrong phase',()=>{
  const f=setup();
  const wrongPriority=structuredClone(f.duel);
  wrongPriority.core.priority=1;
  assert.deepEqual(ceasefireActions(wrongPriority,lookup,{cardId:SOURCE_TRAP_ID}),[]);
  const wrongPhase=structuredClone(f.duel);
  wrongPhase.core.phase='main';
  assert.deepEqual(ceasefireActions(wrongPhase,lookup,{cardId:SOURCE_TRAP_ID}),[]);
});
test('a source removed before resolution does not cancel its already activated effect',()=>{
  const f=setup();
  const session=activate(f);
  moveSourceToGraveBeforeResolve(session,f.sourceUid,f.sourceOwnerSeat);
  const resolved=resolve(session);
  assert.equal(resolved.result.sourceEffectNegated,false);
  assert.equal(resolved.result.sourceSentToGrave,false);
  assert.equal(resolved.result.flippedUids.length,1);
});
test('rejects duplicate activation IDs and duplicate resolution',()=>{
  const f=setup();
  const session=activate(f);
  assert.throws(()=>activateCeasefire(session,f.sourceUid,'m630-activation',lookup,{cardId:SOURCE_TRAP_ID}),/duplicado/);
  const resolved=resolve(session);
  assert.throws(()=>resolveCeasefire(resolved.session,'m630-activation',lookup,{cardId:SOURCE_TRAP_ID}),/ausente ou já resolvida/);
});
test('requires Ceasefire to resolve at the top of the Chain',()=>{
  const f=setup();
  const session=activate(f);
  session.duel.core.chain.push({actor:1,card:f.targetUid,id:MST,target:''});
  assert.throws(()=>resolve(session),/topo da corrente/);
});
test('all four opening-seat rotations preserve physical ownership and team LP',()=>{
  for(const first of [0,1,2,3]){
    const f=setup({first});
    placeMonster(f.duel,f.duel.active[0],0,MAN_EATER_ID,true);
    const resolved=resolve(activate(f));
    assert.ok(graveHas(resolved.session.duel,0,f.sourceUid),'first='+first);
    assert.equal(resolved.session.duel.core.players[1].lp,7500,'first='+first);
    assert.equal(resolved.session.duel.core.players[0].lp,8000,'first='+first);
  }
});
test('three shared backrow slots and the separate Field Zone remain valid',()=>{
  const duel=makeDuel();
  const seat=duel.active[0];
  placeBackrow(duel,seat,0,SOURCE_TRAP_ID,0,false);
  placeBackrow(duel,seat,0,MST,0,false);
  placeBackrow(duel,seat,0,COUNTER_TRAP_ID,0,false);
  placeField(duel,seat,0,FIELD_ID,true);
  assert.doesNotThrow(()=>assertCeasefireRules(duel));
});
test('rejects a fourth shared Spell/Trap Zone while keeping the Field Zone separate',()=>{
  const duel=makeDuel();
  const seat=duel.active[0];
  for(let i=0;i<3;i++)placeBackrow(duel,seat,0,i%2?MST:SOURCE_TRAP_ID,0,false);
  placeField(duel,seat,0,FIELD_ID,true);
  duel.core.players[0].backrow.push({...duel.core.players[0].backrow[0],uid:'m0:overflow'});
  assert.throws(()=>assertCeasefireRules(duel),/limite de zonas/);
  assert.ok(duel.core.players[0].field);
});
test('a hand may exceed six during the turn without premature discard',()=>{
  const duel=makeDuel();
  const hand=privateZone(duel,duel.active[0],'hand');
  const deck=privateZone(duel,duel.active[0],'deck');
  hand.push(deck.pop(),deck.pop());
  const before=hand.length;
  assert.doesNotThrow(()=>assertCeasefireRules(duel));
  assert.equal(hand.length,before);
});
test('conserves every physical UID and never grants inventory',()=>{
  const f=setup();
  const before=inventory(f.duel);
  const resolved=resolve(activate(f));
  assert.deepEqual(inventory(resolved.session.duel),before);
});
