'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getDuelCard,getPlayableCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
  HORN_OF_HEAVEN_ID,
  TRAP_JAMMER_ID,
  assertCounterTrapRules,
  assertPhysicalExtraDeckCounts,
  counterTrapActions,
  createCounterTrapSession,
  activateCounterTrap,
  resolveCounterTrap
}=require('../dist/counterTrapNegationTagAdapter');

const SOURCE_FIXTURE='77414722'; // Magic Jammer: enabled Trap fixture
const TARGET_TRAP='03819470'; // Seven Tools of the Bandit: enabled Trap fixture
const TARGET_SPELL='55144522'; // Pot of Greed: enabled Spell fixture
const normalDeck=tag.tagNormalCardIds.slice(0,20);
assert.equal(normalDeck.length,20);
const COST_MONSTER=normalDeck[0];
const TARGET_MONSTER=normalDeck[1];
const lookup=id=>{
  const card=getDuelCard(id);
  return card?{kind:card.kind,name:card.englishName??card.name}:undefined;
};
function makeDuel(first=0){
  const players=[0,1,2,3].map(seat=>({
    id:'m650-seat-'+seat,
    name:'M650 Seat '+seat,
    cards:[...normalDeck],
    extra:[]
  }));
  const duel=tag.createTagDuel(players,{seed:'m650-counter-trap-'+first,first,classic:true});
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
function placeMonster(duel,ownerSeat,controllerTeam,id){
  const hand=privateZone(duel,ownerSeat,'hand');
  const [card]=hand.splice(0,1);
  assert.ok(card,'fixture needs a physical monster in hand for seat '+ownerSeat);
  card.id=id;
  duel.core.players[controllerTeam].monsters.push({
    ...card,owner:ownerSeat%2,position:'atk',faceUp:true,entered:duel.core.turn,
    changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0
  });
  return card.uid;
}
function setPendingSummon(duel,actorTeam,targetUid,id=TARGET_MONSTER){
  duel.core.phase='response';
  duel.core.resume='main';
  duel.core.pending={kind:'summon',actor:actorTeam,card:targetUid,id};
  duel.core.chain=[];
  duel.core.priority=1-actorTeam;
  duel.core.passes=0;
  duel.core.pendingNegated=false;
}
function setChainTrap(duel,actorTeam,targetUid,id=TARGET_TRAP){
  duel.core.phase='response';
  duel.core.resume='battle';
  duel.core.pending={kind:'none'};
  duel.core.chain=[{actor:actorTeam,card:targetUid,id,target:''}];
  duel.core.priority=1-actorTeam;
  duel.core.passes=0;
}
function setupHorn({
  first=0,sourceOwnerSeat,costOwnerSeat,targetOwnerSeat,
  sourceSetTurn=1,sourceFaceUp=false,costMonster=true
}={}){
  const duel=makeDuel(first),controllerTeam=duel.core.priority,opponentTeam=1-controllerTeam;
  const activeSeat=duel.active[controllerTeam];
  const sourceOwner=sourceOwnerSeat??partnerSeat(activeSeat);
  const costOwner=costOwnerSeat??partnerSeat(activeSeat);
  const targetOwner=targetOwnerSeat??duel.active[opponentTeam];
  const sourceUid=placeBackrow(duel,sourceOwner,controllerTeam,SOURCE_FIXTURE,sourceSetTurn,sourceFaceUp);
  const costUid=costMonster?placeMonster(duel,costOwner,controllerTeam,COST_MONSTER):undefined;
  const targetUid=placeMonster(duel,targetOwner,opponentTeam,TARGET_MONSTER);
  setPendingSummon(duel,opponentTeam,targetUid,TARGET_MONSTER);
  assertCounterTrapRules(duel);
  return {duel,controllerTeam,opponentTeam,activeSeat,sourceOwnerSeat:sourceOwner,costOwnerSeat:costOwner,
    targetOwnerSeat:targetOwner,sourceUid,costUid,targetUid};
}
function setupTrap({
  first=0,sourceOwnerSeat,targetOwnerSeat,sourceSetTurn=1,sourceFaceUp=false,
  targetId=TARGET_TRAP,targetTeam
}={}){
  const duel=makeDuel(first),controllerTeam=duel.core.priority,opponentTeam=1-controllerTeam;
  const activeSeat=duel.active[controllerTeam],sourceOwner=sourceOwnerSeat??partnerSeat(activeSeat);
  const targetOwner=targetOwnerSeat??duel.active[opponentTeam],actor=targetTeam??opponentTeam;
  const sourceUid=placeBackrow(duel,sourceOwner,controllerTeam,SOURCE_FIXTURE,sourceSetTurn,sourceFaceUp);
  const targetUid=placeBackrow(duel,targetOwner,actor,targetId,0,true);
  setChainTrap(duel,actor,targetUid,targetId);
  assertCounterTrapRules(duel);
  return {duel,controllerTeam,opponentTeam,activeSeat,sourceOwnerSeat:sourceOwner,targetOwnerSeat:targetOwner,
    sourceUid,targetUid,targetId};
}
function hornActions(f){return counterTrapActions(f.duel,lookup,{effect:'horn-of-heaven',cardId:SOURCE_FIXTURE});}
function trapActions(f){return counterTrapActions(f.duel,lookup,{effect:'trap-jammer',cardId:SOURCE_FIXTURE});}
function activateHorn(f,id='m650-horn',costUid=f.costUid){
  return activateCounterTrap(createCounterTrapSession(f.duel),f.sourceUid,id,lookup,
    {effect:'horn-of-heaven',cardId:SOURCE_FIXTURE,costUid});
}
function activateTrap(f,id='m650-trap'){
  return activateCounterTrap(createCounterTrapSession(f.duel),f.sourceUid,id,lookup,
    {effect:'trap-jammer',cardId:SOURCE_FIXTURE});
}
function resolve(session,id='m650-horn',options={}){
  return resolveCounterTrap(session,id,options);
}
function inventory(duel){
  return tag.tagInventory(duel).filter(card=>card.entityKind!=='token')
    .map(card=>card.uid+'|'+card.id).sort();
}
function graveHas(duel,team,uid){
  return duel.core.players[team].grave.some(card=>card.uid===uid);
}
function moveMonsterToHand(duel,uid,ownerSeat){
  for(const team of [0,1]){
    const index=duel.core.players[team].monsters.findIndex(card=>card.uid===uid);
    if(index>=0){
      const [card]=duel.core.players[team].monsters.splice(index,1);
      privateZone(duel,ownerSeat,'hand').push(card);
      synchronizeCardLifetimes(duel.core);
      return;
    }
  }
  throw new Error('monster not found');
}
function moveTrapToHand(duel,uid,ownerSeat){
  for(const team of [0,1]){
    const index=duel.core.players[team].backrow.findIndex(card=>card.uid===uid);
    if(index>=0){
      const [card]=duel.core.players[team].backrow.splice(index,1);
      privateZone(duel,ownerSeat,'hand').push(card);
      synchronizeCardLifetimes(duel.core);
      return;
    }
  }
  throw new Error('trap not found');
}

test('the two historical cards remain unadmitted and the adapter grants neither',()=>{
  assert.equal(getPlayableCard(HORN_OF_HEAVEN_ID),undefined);
  assert.equal(getPlayableCard(TRAP_JAMMER_ID),undefined);
  assert.equal(getDuelCard(HORN_OF_HEAVEN_ID),undefined);
  assert.equal(getDuelCard(TRAP_JAMMER_ID),undefined);
  assertPhysicalExtraDeckCounts([0,1,2,3],5);
  assert.throws(()=>assertPhysicalExtraDeckCounts([0,1,6,3],5),/cinco/);
});
test('Horn of Heaven opens only for a pending summon and lists team-controlled tribute choices',()=>{
  const f=setupHorn();
  const actions=hornActions(f);
  assert.deepEqual(actions,[{kind:'trap',card:f.sourceUid,target:'',effect:'horn-of-heaven',cost:f.costUid}]);
  assert.ok(!JSON.stringify(actions).includes(f.targetUid),'summon target UID must remain server-side');
  const wrong=structuredClone(f.duel);
  wrong.core.pending={kind:'none'};
  assert.deepEqual(counterTrapActions(wrong,lookup,{effect:'horn-of-heaven',cardId:SOURCE_FIXTURE}),[]);
});
test('Horn of Heaven cannot be activated without a monster to tribute',()=>{
  const f=setupHorn({costMonster:false});
  assert.deepEqual(hornActions(f),[]);
});
test('Horn of Heaven accepts a tribute owned by the inactive partner but controlled by the team',()=>{
  const f=setupHorn({costOwnerSeat:partnerSeat(0)});
  const actions=hornActions(f);
  assert.ok(actions.some(action=>action.cost===f.costUid));
});
test('Horn of Heaven requires the active response priority and a Trap Set before this turn',()=>{
  const f=setupHorn();
  const wrongPriority=structuredClone(f.duel);
  wrongPriority.core.priority=1-f.controllerTeam;
  assert.deepEqual(counterTrapActions(wrongPriority,lookup,{effect:'horn-of-heaven',cardId:SOURCE_FIXTURE}),[]);
  const sameTurn=setupHorn({sourceSetTurn:3});
  assert.deepEqual(hornActions(sameTurn),[]);
  const faceUp=setupHorn({sourceFaceUp:true});
  assert.deepEqual(hornActions(faceUp),[]);
  const wrongPhase=structuredClone(f.duel);
  wrongPhase.core.phase='main';
  assert.deepEqual(counterTrapActions(wrongPhase,lookup,{effect:'horn-of-heaven',cardId:SOURCE_FIXTURE}),[]);
});
test('Horn of Heaven pays the tribute immediately and conserves physical ownership',()=>{
  const f=setupHorn();
  const before=inventory(f.duel);
  const session=activateHorn(f);
  assert.ok(graveHas(session.duel,f.costOwnerSeat%2,f.costUid));
  assert.equal(session.pending['m650-horn'].costUid,f.costUid);
  assert.equal(session.duel.core.players[f.controllerTeam].backrow.find(card=>card.uid===f.sourceUid).faceUp,true);
  assert.deepEqual(inventory(session.duel),before);
});
test('Horn of Heaven negates and destroys the pending summon, routing it to its physical owner',()=>{
  const f=setupHorn();
  const before=inventory(f.duel);
  const session=activateHorn(f);
  const resolved=resolve(session,'m650-horn');
  assert.equal(resolved.result.summonNegated,true);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.equal(resolved.result.costPaid,true);
  assert.equal(resolved.result.sourceSentToGrave,true);
  assert.equal(resolved.session.duel.core.pendingNegated,true);
  assert.ok(graveHas(resolved.session.duel,f.opponentTeam,f.targetUid));
  assert.ok(graveHas(resolved.session.duel,f.controllerTeam,f.sourceUid));
  assert.deepEqual(inventory(resolved.session.duel),before);
});
test('Horn of Heaven routes a stolen summon to the monster physical owner team',()=>{
  const f=setupHorn({targetOwnerSeat:0});
  const resolved=resolve(activateHorn(f),'m650-horn');
  assert.ok(graveHas(resolved.session.duel,0,f.targetUid));
  assert.ok(!graveHas(resolved.session.duel,f.opponentTeam,f.targetUid));
});
test('a negated Horn of Heaven keeps the tribute cost but does not negate the summon',()=>{
  const f=setupHorn();
  const session=activateHorn(f);
  const resolved=resolve(session,'m650-horn',{sourceActivationNegated:true});
  assert.equal(resolved.result.sourceEffectNegated,true);
  assert.equal(resolved.result.summonNegated,false);
  assert.equal(resolved.result.targetDestroyed,false);
  assert.ok(graveHas(resolved.session.duel,f.costOwnerSeat%2,f.costUid));
  assert.ok(!graveHas(resolved.session.duel,f.opponentTeam,f.targetUid));
});
test('Horn of Heaven rejects a tribute from the opposing team without mutating the session',()=>{
  const f=setupHorn();
  const enemyCost=placeMonster(f.duel,f.duel.active[f.opponentTeam],f.opponentTeam,COST_MONSTER);
  const session=createCounterTrapSession(f.duel);
  const snapshot=JSON.stringify(session);
  assert.throws(()=>activateCounterTrap(session,f.sourceUid,'m650-invalid-cost',lookup,
    {effect:'horn-of-heaven',cardId:SOURCE_FIXTURE,costUid:enemyCost}),/custo é inválido/);
  assert.equal(JSON.stringify(session),snapshot);
});
test('Horn of Heaven does not retarget a summon that leaves and returns with a new zone lifetime',()=>{
  const f=setupHorn();
  const session=activateHorn(f);
  const stale=structuredClone(session);
  moveMonsterToHand(stale.duel,f.targetUid,f.targetOwnerSeat);
  const hand=privateZone(stale.duel,f.targetOwnerSeat,'hand');
  const index=hand.findIndex(card=>card.uid===f.targetUid);
  const [card]=hand.splice(index,1);
  stale.duel.core.players[f.opponentTeam].monsters.push({
    ...card,owner:f.targetOwnerSeat%2,position:'atk',faceUp:true,entered:stale.duel.core.turn,
    changed:stale.duel.core.turn,attacked:0,atkBoost:0,defBoost:0
  });
  synchronizeCardLifetimes(stale.duel.core);
  const resolved=resolve(stale,'m650-horn');
  assert.equal(resolved.result.summonNegated,false);
  assert.equal(resolved.result.targetDestroyed,false);
});
test('Horn of Heaven does not destroy a replacement monster with the same ID',()=>{
  const f=setupHorn();
  const session=activateHorn(f);
  const stale=structuredClone(session);
  moveMonsterToHand(stale.duel,f.targetUid,f.targetOwnerSeat);
  const replacement=placeMonster(stale.duel,stale.duel.active[f.opponentTeam],f.opponentTeam,TARGET_MONSTER);
  synchronizeCardLifetimes(stale.duel.core);
  const resolved=resolve(stale,'m650-horn');
  assert.equal(resolved.result.targetDestroyed,false);
  assert.ok(!graveHas(resolved.session.duel,f.opponentTeam,replacement));
});
test('Horn of Heaven rejects duplicate activation IDs and duplicate resolution',()=>{
  const f=setupHorn();
  const session=activateHorn(f);
  assert.throws(()=>activateCounterTrap(session,f.sourceUid,'m650-horn',lookup,
    {effect:'horn-of-heaven',cardId:SOURCE_FIXTURE,costUid:f.costUid}),/duplicado/);
  const resolved=resolve(session,'m650-horn');
  assert.throws(()=>resolveCounterTrap(resolved.session,'m650-horn'),/ausente ou já resolvida/);
});
test('Horn of Heaven resolves only from the top of the chain',()=>{
  const f=setupHorn();
  const session=activateHorn(f);
  const stacked=structuredClone(session);
  stacked.duel.core.chain.push({actor:f.opponentTeam,card:'m1:stacked',id:TARGET_TRAP,target:''});
  const snapshot=JSON.stringify(stacked);
  assert.throws(()=>resolveCounterTrap(stacked,'m650-horn'),/topo da corrente/);
  assert.equal(JSON.stringify(stacked),snapshot);
});
test('Trap Jammer opens only for an opponent Trap activation during the Battle Phase',()=>{
  const f=setupTrap();
  assert.deepEqual(trapActions(f),[{kind:'trap',card:f.sourceUid,target:'',effect:'trap-jammer'}]);
  const main=structuredClone(f.duel);
  main.core.resume='main';
  assert.deepEqual(counterTrapActions(main,lookup,{effect:'trap-jammer',cardId:SOURCE_FIXTURE}),[]);
  const spell=setupTrap({targetId:TARGET_SPELL});
  assert.deepEqual(trapActions(spell),[]);
});
test('Trap Jammer does not respond to a Trap activated by its own team',()=>{
  const f=setupTrap();
  const same=structuredClone(f.duel);
  same.core.chain[0].actor=f.controllerTeam;
  same.core.priority=f.controllerTeam;
  assert.deepEqual(counterTrapActions(same,lookup,{effect:'trap-jammer',cardId:SOURCE_FIXTURE}),[]);
});
test('Trap Jammer requires a Set card from a previous turn and an available response priority',()=>{
  const sameTurn=setupTrap({sourceSetTurn:3});
  assert.deepEqual(trapActions(sameTurn),[]);
  const faceUp=setupTrap({sourceFaceUp:true});
  assert.deepEqual(trapActions(faceUp),[]);
  const f=setupTrap();
  const wrongPriority=structuredClone(f.duel);
  wrongPriority.core.priority=1-f.controllerTeam;
  assert.deepEqual(counterTrapActions(wrongPriority,lookup,{effect:'trap-jammer',cardId:SOURCE_FIXTURE}),[]);
});
test('Trap Jammer negates and destroys the activated Trap without changing inventory',()=>{
  const f=setupTrap();
  const before=inventory(f.duel);
  const session=activateTrap(f);
  const resolved=resolve(session,'m650-trap');
  assert.equal(resolved.result.targetActivationNegated,true);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.equal(resolved.result.costPaid,false);
  assert.equal(resolved.result.sourceSentToGrave,true);
  assert.ok(resolved.session.duel.core.chain.at(-1).negated);
  assert.ok(graveHas(resolved.session.duel,f.opponentTeam,f.targetUid));
  assert.ok(graveHas(resolved.session.duel,f.controllerTeam,f.sourceUid));
  assert.deepEqual(inventory(resolved.session.duel),before);
});
test('Trap Jammer routes a stolen activated Trap to its physical owner team',()=>{
  const f=setupTrap({targetOwnerSeat:0});
  const resolved=resolve(activateTrap(f),'m650-trap');
  assert.ok(graveHas(resolved.session.duel,0,f.targetUid));
  assert.ok(!graveHas(resolved.session.duel,f.opponentTeam,f.targetUid));
});
test('a negated Trap Jammer does not negate the original Trap activation',()=>{
  const f=setupTrap();
  const resolved=resolve(activateTrap(f),'m650-trap',{sourceActivationNegated:true});
  assert.equal(resolved.result.sourceEffectNegated,true);
  assert.equal(resolved.result.targetActivationNegated,false);
  assert.equal(resolved.result.targetDestroyed,false);
  assert.ok(graveHas(resolved.session.duel,f.controllerTeam,f.sourceUid));
  assert.ok(!graveHas(resolved.session.duel,f.opponentTeam,f.targetUid));
});
test('Trap Jammer does not destroy a target Trap that left the field before resolution',()=>{
  const f=setupTrap();
  const session=activateTrap(f);
  const stale=structuredClone(session);
  moveTrapToHand(stale.duel,f.targetUid,f.targetOwnerSeat);
  const resolved=resolve(stale,'m650-trap');
  assert.equal(resolved.result.targetActivationNegated,false);
  assert.equal(resolved.result.targetDestroyed,false);
});
test('Trap Jammer does not retarget a replacement copy with the same ID',()=>{
  const f=setupTrap();
  const session=activateTrap(f);
  const stale=structuredClone(session);
  moveTrapToHand(stale.duel,f.targetUid,f.targetOwnerSeat);
  const replacement=placeBackrow(stale.duel,stale.duel.active[f.opponentTeam],f.opponentTeam,TARGET_TRAP,0,true);
  synchronizeCardLifetimes(stale.duel.core);
  const resolved=resolve(stale,'m650-trap');
  assert.equal(resolved.result.targetDestroyed,false);
  assert.ok(!graveHas(resolved.session.duel,f.opponentTeam,replacement));
});
test('Jinzo blocks both Counter Trap activations before a response is offered',()=>{
  const horn=setupHorn();
  placeMonster(horn.duel,horn.duel.active[horn.controllerTeam],horn.controllerTeam,'77585513');
  assert.deepEqual(hornActions(horn),[]);
  const trap=setupTrap();
  placeMonster(trap.duel,trap.duel.active[trap.controllerTeam],trap.controllerTeam,'77585513');
  assert.deepEqual(trapActions(trap),[]);
});
test('the hand may exceed six during the turn; no premature rule discard occurs',()=>{
  const f=setupHorn();
  const hand=privateZone(f.duel,f.activeSeat,'hand');
  const deck=privateZone(f.duel,f.activeSeat,'deck');
  hand.push(deck.pop(),deck.pop(),deck.pop());
  const before=hand.length;
  const session=activateHorn(f);
  assert.equal(privateZone(session.duel,f.activeSeat,'hand').length,before);
  assert.doesNotThrow(()=>assertCounterTrapRules(session.duel));
});
test('the Field Zone is separate from three shared Spell/Trap Zones',()=>{
  const f=setupTrap();
  for(let i=0;i<2;i++)placeBackrow(f.duel,f.activeSeat,f.controllerTeam,TARGET_TRAP,0,false);
  assert.doesNotThrow(()=>assertCounterTrapRules(f.duel));
  assert.throws(()=>assertCounterTrapRules({...f.duel,core:{
    ...f.duel.core,players:f.duel.core.players.map((player,index)=>index===f.controllerTeam
      ?{...player,backrow:[...player.backrow,{uid:'m0:overflow',id:TARGET_TRAP,faceUp:false,setTurn:0}]}
      :player)
  }}),/três Spell\/Trap Zones/);
});
test('rejects a fourth Monster Zone and preserves the three-zone invariant',()=>{
  const f=setupHorn();
  for(let i=0;i<3;i++)placeMonster(f.duel,f.activeSeat,f.controllerTeam,normalDeck[i+2]);
  assert.throws(()=>assertCounterTrapRules(f.duel),/três Monster Zones/);
});
test('all four opening-seat rotations preserve source, tribute, target and grave ownership',()=>{
  for(const first of [0,1,2,3]){
    const horn=setupHorn({first});
    const result=resolve(activateHorn(horn),'m650-horn');
    assert.ok(graveHas(result.session.duel,horn.controllerTeam,horn.costUid),'cost first='+first);
    assert.ok(graveHas(result.session.duel,horn.controllerTeam,horn.sourceUid),'source first='+first);
    assert.ok(graveHas(result.session.duel,horn.opponentTeam,horn.targetUid),'target first='+first);
    const trap=setupTrap({first});
    const trapResult=resolve(activateTrap(trap),'m650-trap');
    assert.ok(graveHas(trapResult.session.duel,trap.controllerTeam,trap.sourceUid),'trap source first='+first);
    assert.ok(graveHas(trapResult.session.duel,trap.opponentTeam,trap.targetUid),'trap target first='+first);
  }
});
test('invalid activation does not mutate the saved session',()=>{
  const f=setupHorn();
  const session=createCounterTrapSession(f.duel);
  const snapshot=JSON.stringify(session);
  assert.throws(()=>activateCounterTrap(session,'missing','m650-invalid',lookup,
    {effect:'horn-of-heaven',cardId:SOURCE_FIXTURE,costUid:f.costUid}),/janela de resposta/);
  assert.equal(JSON.stringify(session),snapshot);
});
test('the adapters conserve every physical UID and grant no inventory',()=>{
  for(const f of [setupHorn(),setupTrap()]){
    const before=inventory(f.duel);
    const session=f.costUid?activateHorn(f):activateTrap(f);
    const result=resolve(session,f.costUid?'m650-horn':'m650-trap').session.duel;
    assert.deepEqual(inventory(result),before);
    assert.equal(tag.tagInventory(result).filter(card=>card.entityKind!=='token').length,before.length);
  }
});
