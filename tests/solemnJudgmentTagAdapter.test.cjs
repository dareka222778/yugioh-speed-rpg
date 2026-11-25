'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getDuelCard,getPlayableCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {createTokenGroup}=require('../dist/tokens');
const {
  SOLEMN_JUDGMENT_ID,
  assertSolemnJudgmentRules,
  assertPhysicalExtraDeckCounts,
  solemnJudgmentActions,
  createSolemnJudgmentSession,
  activateSolemnJudgment,
  resolveSolemnJudgment
}=require('../dist/solemnJudgmentTagAdapter');

const SOURCE_TRAP_ID='77414722'; // enabled fixture; Solemn Judgment itself remains unadmitted
const MST='05318639';
const TARGET_TRAP_ID='03819470';
const FIELD_ID='86318356';
const JINZO_ID='77585513';
const lookup=id=>{
  const card=getDuelCard(id);
  return card?{kind:card.kind,name:card.englishName??card.name}:undefined;
};
const normalDeck=tag.tagNormalCardIds.slice(0,20);
assert.equal(normalDeck.length,20);

function makeDuel(first=0){
  const players=[0,1,2,3].map(seat=>({
    id:'m629-seat-'+seat,
    name:'M629 Seat '+seat,
    cards:[...normalDeck],
    extra:[]
  }));
  const duel=tag.createTagDuel(players,{seed:'m629-solemn-'+first,first,classic:true});
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
  duel.core.priority=duel.core.teamRotation.active.findIndex(seat=>seat%2===actorTeam)===-1
    ?1-actorTeam:1-actorTeam;
  duel.core.passes=0;
}
function setPendingField(duel,actorTeam,targetUid){
  duel.core.phase='response';
  duel.core.resume='main';
  duel.core.pending={kind:'field',actor:actorTeam,card:targetUid};
  duel.core.chain=[];
  duel.core.priority=1-actorTeam;
  duel.core.passes=0;
}
function setChainTrap(duel,actorTeam,targetUid,id=TARGET_TRAP_ID){
  duel.core.phase='response';
  duel.core.resume='main';
  duel.core.pending={kind:'none'};
  duel.core.chain=[{actor:actorTeam,card:targetUid,id,target:''}];
  duel.core.priority=1-actorTeam;
  duel.core.passes=0;
}
function setPendingSummon(duel,actorTeam,targetUid,id,kind='summon'){
  duel.core.phase='response';
  duel.core.resume='main';
  duel.core.pending={kind,actor:actorTeam,card:targetUid,id};
  duel.core.chain=[];
  duel.core.priority=1-actorTeam;
  duel.core.passes=0;
}
function setup({
  first=0,
  controllerTeam=0,
  sourceOwnerSeat,
  sourceSetTurn=1,
  sourceFaceUp=false,
  targetOwnerSeat,
  targetTeam=1,
  targetId=MST,
  targetKind='spell',
  targetSummonKind='summon',
  lp=8000
}={}){
  const duel=makeDuel(first);
  const activeSeat=duel.active[controllerTeam];
  const sourceOwner=sourceOwnerSeat??partnerSeat(activeSeat);
  const targetOwner=targetOwnerSeat??duel.active[targetTeam];
  const sourceUid=placeBackrow(duel,sourceOwner,controllerTeam,SOURCE_TRAP_ID,sourceSetTurn,sourceFaceUp);
  let targetUid;
  if(targetKind==='field'){
    targetUid=placeField(duel,targetOwner,targetTeam,targetId,true);
    setPendingField(duel,targetTeam,targetUid);
  }else if(targetKind==='chain'){
    targetUid=placeBackrow(duel,targetOwner,targetTeam,targetId,0,true);
    setChainTrap(duel,targetTeam,targetUid,targetId);
  }else if(targetKind==='summon'||targetKind==='flip'||targetKind==='specialSummon'||targetKind==='set'){
    targetUid=placeMonster(duel,targetOwner,targetTeam,targetId,targetKind!=='set');
    setPendingSummon(duel,targetTeam,targetUid,targetId,targetKind==='set'?'summon':targetSummonKind);
  }else{
    targetUid=placeBackrow(duel,targetOwner,targetTeam,targetId,0,true);
    setPendingSpell(duel,targetTeam,targetUid,targetId);
  }
  duel.core.players[controllerTeam].lp=lp;
  duel.core.priority=controllerTeam;
  tag.assertTagDuel(duel);
  assertSolemnJudgmentRules(duel);
  return {duel,controllerTeam,activeSeat,sourceOwnerSeat:sourceOwner,sourceUid,targetTeam,targetOwnerSeat:targetOwner,targetUid};
}
function actions(f,lookupFn=lookup){
  return solemnJudgmentActions(f.duel,lookupFn,{cardId:SOURCE_TRAP_ID});
}
function activate(f,id='m629-activation',lookupFn=lookup){
  return activateSolemnJudgment(createSolemnJudgmentSession(f.duel),f.sourceUid,id,lookupFn,{cardId:SOURCE_TRAP_ID});
}
function resolve(session,id='m629-activation',options={}){
  return resolveSolemnJudgment(session,id,{...options,cardId:SOURCE_TRAP_ID});
}
function inventory(duel){
  return tag.tagInventory(duel).filter(card=>card.entityKind!=='token')
    .map(card=>card.uid+'|'+card.id).sort();
}
function graveHas(duel,team,uid){
  return duel.core.players[team].grave.some(card=>card.uid===uid);
}
function moveTargetToHand(duel,targetUid,ownerSeat){
  for(const team of [0,1]){
    const backrowIndex=duel.core.players[team].backrow.findIndex(card=>card.uid===targetUid);
    if(backrowIndex>=0){
      const [card]=duel.core.players[team].backrow.splice(backrowIndex,1);
      privateZone(duel,ownerSeat,'hand').push(card);
      synchronizeCardLifetimes(duel.core);
      return;
    }
    if(duel.core.players[team].field?.uid===targetUid){
      const card=duel.core.players[team].field;
      duel.core.players[team].field=null;
      privateZone(duel,ownerSeat,'hand').push(card);
      synchronizeCardLifetimes(duel.core);
      return;
    }
    const monsterIndex=duel.core.players[team].monsters.findIndex(card=>card.uid===targetUid);
    if(monsterIndex>=0){
      const [card]=duel.core.players[team].monsters.splice(monsterIndex,1);
      privateZone(duel,ownerSeat,'hand').push(card);
      synchronizeCardLifetimes(duel.core);
      return;
    }
  }
  throw new Error('target not found');
}
function returnTargetToBackrow(duel,targetUid,ownerSeat,controllerTeam){
  const hand=privateZone(duel,ownerSeat,'hand');
  const index=hand.findIndex(card=>card.uid===targetUid);
  assert.ok(index>=0);
  const [card]=hand.splice(index,1);
  duel.core.players[controllerTeam].backrow.push({...card,faceUp:true,setTurn:0});
  synchronizeCardLifetimes(duel.core);
}

test('Solemn Judgment remains unadmitted and grants no inventory',()=>{
  assert.equal(getPlayableCard(SOLEMN_JUDGMENT_ID),undefined);
  assert.equal(getDuelCard(SOLEMN_JUDGMENT_ID),undefined);
  assertPhysicalExtraDeckCounts([0,1,2,3],5);
  assert.throws(()=>assertPhysicalExtraDeckCounts([0,1,6,3],5),/cinco/);
});
test('offers only the Set Counter Trap and keeps the target out of the public action payload',()=>{
  const f=setup();
  assert.deepEqual(actions(f),[{kind:'trap',card:f.sourceUid,target:''}]);
  assert.ok(!JSON.stringify(actions(f)).includes(f.targetUid));
});
test('pays half the shared team LP at activation and negates a pending Spell activation',()=>{
  const f=setup();
  const before=inventory(f.duel);
  const session=activate(f);
  assert.equal(session.duel.core.players[0].lp,4000);
  assert.equal(session.pending['m629-activation'].lpPaid,4000);
  const resolved=resolve(session);
  assert.equal(resolved.result.targetActivationNegated,true);
  assert.equal(resolved.result.summonNegated,false);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.equal(resolved.result.sourceSentToGrave,true);
  assert.equal(resolved.session.duel.core.pendingNegated,true);
  assert.ok(graveHas(resolved.session.duel,1,f.targetUid));
  assert.ok(graveHas(resolved.session.duel,0,f.sourceUid));
  assert.deepEqual(inventory(resolved.session.duel),before);
});
test('rounds half LP upward and preserves a positive remainder',()=>{
  const f=setup({lp:8001});
  const session=activate(f);
  assert.equal(session.duel.core.players[0].lp,4000);
  assert.equal(session.pending['m629-activation'].lpPaid,4001);
});
test('refuses a half-LP cost that would reduce the team to zero',()=>{
  const f=setup({lp:1});
  assert.deepEqual(actions(f),[]);
  assert.throws(()=>activate(f),/não está legal/);
});
test('negates an activated Field Spell in the separate Field Zone',()=>{
  const f=setup({targetKind:'field',targetId:FIELD_ID});
  const resolved=resolve(activate(f));
  assert.equal(resolved.result.targetActivationNegated,true);
  assert.equal(resolved.session.duel.core.players[1].field,null);
  assert.ok(graveHas(resolved.session.duel,1,f.targetUid));
});
test('negates the top Spell/Trap Chain link, including a Trap activation',()=>{
  const f=setup({targetKind:'chain',targetId:TARGET_TRAP_ID});
  const resolved=resolve(activate(f));
  assert.equal(resolved.result.targetActivationNegated,true);
  assert.equal(resolved.session.duel.core.chain.length,1);
  assert.equal(resolved.session.duel.core.chain[0].negated,true);
  assert.ok(graveHas(resolved.session.duel,1,f.targetUid));
});
test('negates a Normal Summon attempt and sends the monster to its owner Graveyard',()=>{
  const f=setup({targetKind:'summon',targetId:normalDeck[0]});
  const resolved=resolve(activate(f));
  assert.equal(resolved.result.summonNegated,true);
  assert.equal(resolved.result.targetActivationNegated,false);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.ok(graveHas(resolved.session.duel,1,f.targetUid));
  assert.ok(!resolved.session.duel.core.players[1].monsters.some(card=>card.uid===f.targetUid));
});
test('negates a Flip Summon attempt',()=>{
  const f=setup({targetKind:'flip',targetId:normalDeck[1],targetSummonKind:'flip'});
  const resolved=resolve(activate(f));
  assert.equal(resolved.result.summonNegated,true);
  assert.ok(graveHas(resolved.session.duel,1,f.targetUid));
});
test('negates a Special Summon attempt',()=>{
  const f=setup({targetKind:'specialSummon',targetId:normalDeck[2],targetSummonKind:'specialSummon'});
  const resolved=resolve(activate(f));
  assert.equal(resolved.result.summonNegated,true);
  assert.ok(graveHas(resolved.session.duel,1,f.targetUid));
});
test('a stolen summoned monster returns to its physical owner team',()=>{
  const f=setup({targetKind:'summon',targetId:normalDeck[3],targetOwnerSeat:0});
  const resolved=resolve(activate(f));
  assert.ok(graveHas(resolved.session.duel,0,f.targetUid));
  assert.ok(!graveHas(resolved.session.duel,1,f.targetUid));
});
test('a stolen activated Spell returns to its physical owner team',()=>{
  const f=setup({targetOwnerSeat:0});
  const resolved=resolve(activate(f));
  assert.ok(graveHas(resolved.session.duel,0,f.targetUid));
  assert.ok(!graveHas(resolved.session.duel,1,f.targetUid));
});
test('a stolen Solemn Judgment fixture returns to its physical owner team',()=>{
  const f=setup({sourceOwnerSeat:1});
  const resolved=resolve(activate(f));
  assert.ok(graveHas(resolved.session.duel,1,f.sourceUid));
  assert.ok(!graveHas(resolved.session.duel,0,f.sourceUid));
});
test('can activate a Set card controlled by the active team even when owned by its inactive partner',()=>{
  const f=setup();
  assert.equal(f.sourceOwnerSeat,partnerSeat(f.activeSeat));
  const session=activate(f);
  assert.equal(session.pending['m629-activation'].controllerSeat,f.activeSeat);
  assert.equal(session.pending['m629-activation'].sourceOwnerSeat,f.sourceOwnerSeat);
});
test('can negate an activation made by the same team when the response priority permits it',()=>{
  const f=setup({targetTeam:0});
  assert.equal(actions(f).length,1);
  const resolved=resolve(activate(f));
  assert.ok(graveHas(resolved.session.duel,0,f.targetUid));
});
test('does not respond to monster-effect activations',()=>{
  const f=setup();
  f.duel.core.pending={kind:'monsterEffect',actor:1,card:f.targetUid,id:JINZO_ID};
  assert.deepEqual(actions(f),[]);
});
test('does not negate a face-down Normal Set as if it were a Summon',()=>{
  const f=setup({targetKind:'set',targetId:normalDeck[4]});
  assert.deepEqual(actions(f),[]);
});
test('does not respond to an already-negated pending activation',()=>{
  const f=setup();
  f.duel.core.pendingNegated=true;
  assert.deepEqual(actions(f),[]);
});
test('requires response phase and the current priority seat',()=>{
  const f=setup();
  const wrongPhase=structuredClone(f.duel);
  wrongPhase.core.phase='main';
  assert.deepEqual(solemnJudgmentActions(wrongPhase,lookup,{cardId:SOURCE_TRAP_ID}),[]);
  const wrongPriority=structuredClone(f.duel);
  wrongPriority.core.priority=1;
  assert.deepEqual(solemnJudgmentActions(wrongPriority,lookup,{cardId:SOURCE_TRAP_ID}),[]);
});
test('requires a Trap Set before the current turn and rejects a face-up source',()=>{
  const sameTurn=setup({sourceSetTurn:3});
  assert.deepEqual(actions(sameTurn),[]);
  const faceUp=setup({sourceFaceUp:true});
  assert.deepEqual(actions(faceUp),[]);
});
test('Jinzo prevents the Trap activation before a response is offered',()=>{
  const f=setup();
  placeMonster(f.duel,f.activeSeat,f.controllerTeam,JINZO_ID,true);
  assert.deepEqual(actions(f),[]);
});
test('a negated Solemn Judgment still pays its activation cost and leaves the target untouched',()=>{
  const f=setup();
  const session=activate(f);
  const own=session.duel.core.chain.at(-1);
  own.negated=true;
  const resolved=resolve(session);
  assert.equal(resolved.result.sourceEffectNegated,true);
  assert.equal(resolved.result.lpPaid,4000);
  assert.equal(resolved.result.targetActivationNegated,false);
  assert.equal(resolved.result.targetDestroyed,false);
  assert.ok(!graveHas(resolved.session.duel,1,f.targetUid));
  assert.ok(graveHas(resolved.session.duel,0,f.sourceUid));
  assert.equal(resolved.session.duel.core.players[0].lp,4000);
});
test('a target that leaves before resolution is not destroyed or replaced',()=>{
  const f=setup();
  const session=activate(f);
  moveTargetToHand(session.duel,f.targetUid,f.targetOwnerSeat);
  const resolved=resolve(session);
  assert.equal(resolved.result.targetActivationNegated,false);
  assert.equal(resolved.result.targetDestroyed,false);
  assert.ok(!graveHas(resolved.session.duel,1,f.targetUid));
});
test('does not retarget a replacement that reuses the same UID after a zone lifetime change',()=>{
  const f=setup();
  const session=activate(f);
  moveTargetToHand(session.duel,f.targetUid,f.targetOwnerSeat);
  returnTargetToBackrow(session.duel,f.targetUid,f.targetOwnerSeat,f.targetTeam);
  const resolved=resolve(session);
  assert.equal(resolved.result.targetActivationNegated,false);
  assert.equal(resolved.result.targetDestroyed,false);
});
test('requires Solemn Judgment to resolve at the top of the Chain',()=>{
  const f=setup();
  const session=activate(f);
  session.duel.core.chain.push({actor:1,card:f.targetUid,id:MST,target:''});
  assert.throws(()=>resolve(session),/topo da corrente/);
});
test('rejects duplicate activation IDs and duplicate resolution',()=>{
  const f=setup();
  const session=activate(f);
  assert.throws(()=>activateSolemnJudgment(session,f.sourceUid,'m629-activation',lookup,{cardId:SOURCE_TRAP_ID}),/duplicado/);
  const resolved=resolve(session);
  assert.throws(()=>resolveSolemnJudgment(resolved.session,'m629-activation',{cardId:SOURCE_TRAP_ID}),/ausente ou já resolvida/);
});
test('a token Summon is negated and the token is removed without entering a Graveyard',()=>{
  const f=setup({targetKind:'spell'});
  const token=createTokenGroup(f.duel.core,f.targetTeam,1,'atk')[0];
  setPendingSummon(f.duel,f.targetTeam,token.uid,token.id,'specialSummon');
  tag.assertTagDuel(f.duel);
  const session=activate(f);
  const resolved=resolve(session);
  assert.equal(resolved.result.summonNegated,true);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.ok(!resolved.session.duel.core.players[f.targetTeam].monsters.some(card=>card.uid===token.uid));
  assert.ok(!resolved.session.duel.core.players[0].grave.some(card=>card.uid===token.uid));
});
test('all four opening-seat rotations preserve physical ownership and LP routing',()=>{
  for(const first of [0,1,2,3]){
    const f=setup({first});
    const session=activate(f);
    const resolved=resolve(session);
    assert.ok(graveHas(resolved.session.duel,1,f.targetUid),'first='+first);
    assert.ok(graveHas(resolved.session.duel,0,f.sourceUid),'first='+first);
    assert.equal(resolved.session.duel.core.players[0].lp,4000,'first='+first);
  }
});
test('three shared backrow slots and a separate Field Zone remain valid',()=>{
  const duel=makeDuel();
  const seat=duel.active[0];
  placeBackrow(duel,seat,0,SOURCE_TRAP_ID,0,false);
  placeBackrow(duel,seat,0,MST,0,false);
  placeBackrow(duel,seat,0,TARGET_TRAP_ID,0,false);
  placeField(duel,seat,0,FIELD_ID,true);
  assert.doesNotThrow(()=>assertSolemnJudgmentRules(duel));
});
test('rejects a fourth shared Spell/Trap Zone without changing the Field Zone',()=>{
  const duel=makeDuel();
  const seat=duel.active[0];
  for(let i=0;i<3;i++)placeBackrow(duel,seat,0,i%2?MST:TARGET_TRAP_ID,0,false);
  placeField(duel,seat,0,FIELD_ID,true);
  duel.core.players[0].backrow.push({...duel.core.players[0].backrow[0],uid:'m0:overflow'});
  assert.throws(()=>assertSolemnJudgmentRules(duel),/limite de zonas/);
  assert.ok(duel.core.players[0].field);
});
test('a hand may exceed six during the turn; no premature discard is performed',()=>{
  const duel=makeDuel();
  const hand=privateZone(duel,duel.active[0],'hand');
  const deck=privateZone(duel,duel.active[0],'deck');
  hand.push(deck.pop(),deck.pop());
  const before=hand.length;
  assert.doesNotThrow(()=>assertSolemnJudgmentRules(duel));
  assert.equal(hand.length,before);
});
test('the adapter conserves every physical UID and never creates inventory',()=>{
  const f=setup();
  const before=inventory(f.duel);
  const resolved=resolve(activate(f));
  assert.deepEqual(inventory(resolved.session.duel),before);
  assert.equal(tag.tagInventory(resolved.session.duel).filter(card=>card.entityKind!=='token').length,before.length);
});
