'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {enabledCardIds,getDuelCard,getPlayableCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
  CURSE_OF_ROYAL_ID,
  assertCurseOfRoyalRules,
  assertPhysicalExtraDeckCounts,
  curseOfRoyalActions,
  createCurseOfRoyalSession,
  activateCurseOfRoyal,
  resolveCurseOfRoyal
}=require('../dist/curseOfRoyalTagAdapter');

const MST='05318639';
const POT='55144522';
const JINZO_ID='77585513';
const SOURCE_TRAP_ID='77414722';
const TARGET_TRAP_ID='03819470';
const SPELL_ID=POT;
const FIELD_ID='86318356';
assert.ok(SOURCE_TRAP_ID);
assert.ok(SPELL_ID);
assert.ok(FIELD_ID);
assert.ok(getDuelCard(MST));
const lookup=id=>{
  const card=getDuelCard(id);
  if(!card)return undefined;
  return {
    kind:card.kind,
    name:card.englishName??card.name,
    destroysExactlyOneSpellTrap:id===MST||id===TARGET_TRAP_ID||id===FIELD_ID
  };
};
const normalDeck=tag.tagNormalCardIds.slice(0,20);
assert.equal(normalDeck.length,20);

function makeDuel(first=0){
  const players=[0,1,2,3].map(seat=>({
    id:'m628-seat-'+seat,
    name:'M628 Seat '+seat,
    cards:[...normalDeck],
    extra:[]
  }));
  const duel=tag.createTagDuel(players,{seed:'m628-curse-of-royal-'+first,first,classic:true});
  duel.core.turn=3;
  duel.core.phase='main';
  duel.core.pending={kind:'none'};
  duel.core.chain=[];
  duel.core.priority=first%2;
  duel.core.passes=0;
  duel.core.damageStep=false;
  duel.core.turnEnding=false;
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
function placeMonster(duel,ownerSeat,controllerTeam,id){
  const hand=privateZone(duel,ownerSeat,'hand');
  const [card]=hand.splice(0,1);
  assert.ok(card);
  card.id=id;
  duel.core.players[controllerTeam].monsters.push({
    ...card,owner:ownerSeat%2,position:'atk',faceUp:true,entered:duel.core.turn,
    changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0
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
function setup({
  first=0,
  controllerTeam=0,
  sourceOwnerSeat,
  sourceSetTurn=1,
  sourceFaceUp=false,
  targetOwnerSeat,
  targetId=MST,
  targetZone='backrow',
  targetKind='spell',
  targetSetTurn=0
}={}){
  const duel=makeDuel(first);
  const activeSeat=duel.active[controllerTeam];
  const owner=sourceOwnerSeat??partnerSeat(activeSeat);
  const opponentTeam=(1-controllerTeam);
  const targetOwner=targetOwnerSeat??duel.active[opponentTeam];
  const sourceUid=placeBackrow(duel,owner,controllerTeam,SOURCE_TRAP_ID,sourceSetTurn,sourceFaceUp);
  const targetUid=targetZone==='field'
    ?placeField(duel,targetOwner,opponentTeam,targetId,true)
    :placeBackrow(duel,targetOwner,opponentTeam,targetId,targetSetTurn,true);
  if(targetKind==='chain')setChainTrap(duel,opponentTeam,targetUid,targetId);
  else if(targetKind==='field')setPendingField(duel,opponentTeam,targetUid);
  else setPendingSpell(duel,opponentTeam,targetUid,targetId);
  tag.assertTagDuel(duel);
  assertCurseOfRoyalRules(duel);
  return {duel,controllerTeam,activeSeat,opponentTeam,sourceOwnerSeat:owner,sourceUid,targetOwnerSeat:targetOwner,targetUid};
}
function actions(f,lookupFn=lookup){
  return curseOfRoyalActions(f.duel,lookupFn,{cardId:SOURCE_TRAP_ID});
}
function activate(f,id='m628-activation',lookupFn=lookup){
  return activateCurseOfRoyal(createCurseOfRoyalSession(f.duel),f.sourceUid,id,lookupFn,{cardId:SOURCE_TRAP_ID});
}
function resolve(session,id='m628-activation',options={}){
  return resolveCurseOfRoyal(session,id,{...options,cardId:SOURCE_TRAP_ID});
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
    const i=duel.core.players[team].backrow.findIndex(card=>card.uid===targetUid);
    if(i>=0){
      const [card]=duel.core.players[team].backrow.splice(i,1);
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
  }
  throw new Error('target not found');
}

test('Curse of Royal remains unadmitted and the adapter cannot grant it',()=>{
  assert.equal(getPlayableCard(CURSE_OF_ROYAL_ID),undefined);
  assert.equal(getDuelCard(CURSE_OF_ROYAL_ID),undefined);
  assertPhysicalExtraDeckCounts([0,1,2,3],5);
  assert.throws(()=>assertPhysicalExtraDeckCounts([0,1,6,3],5),/cinco/);
});
test('opens only for an opponent Spell activation whose typed effect destroys exactly one Spell/Trap',()=>{
  const f=setup();
  const list=actions(f);
  assert.deepEqual(list,[{kind:'trap',card:f.sourceUid,target:''}]);
  assert.ok(!JSON.stringify(list).includes(f.targetUid),'the target UID is not exposed in the action payload');
  const noDestroy=setup({targetId:POT});
  assert.deepEqual(actions(noDestroy),[]);
  const destroyAll=setup();
  const allLookup=id=>{
    const value=lookup(id);
    return value?{...value,destroysExactlyOneSpellTrap:false}:undefined;
  };
  assert.deepEqual(actions(destroyAll,allLookup),[]);
});
test('ignores monster effects, same-team activations and already-negated activations',()=>{
  const f=setup();
  const monster=structuredClone(f.duel);
  const monsterUid=placeMonster(monster,monster.active[1],1,JINZO_ID);
  monster.core.pending={kind:'monsterEffect',actor:1,card:monsterUid,id:JINZO_ID};
  assert.deepEqual(curseOfRoyalActions(monster,lookup,{cardId:SOURCE_TRAP_ID}),[]);
  const same=structuredClone(f.duel);
  const sameIndex=same.core.players[1].backrow.findIndex(card=>card.uid===f.targetUid);
  const [sameTarget]=same.core.players[1].backrow.splice(sameIndex,1);
  same.core.players[0].backrow.push(sameTarget);
  same.core.pending.actor=0;
  same.core.priority=0;
  assert.deepEqual(curseOfRoyalActions(same,lookup,{cardId:SOURCE_TRAP_ID}),[]);
  const negated=structuredClone(f.duel);
  negated.core.pendingNegated=true;
  assert.deepEqual(curseOfRoyalActions(negated,lookup,{cardId:SOURCE_TRAP_ID}),[]);
});
test('requires the active response priority and a Trap Set before the current turn',()=>{
  const f=setup();
  const wrongPriority=structuredClone(f.duel);
  wrongPriority.core.priority=1;
  assert.deepEqual(curseOfRoyalActions(wrongPriority,lookup,{cardId:SOURCE_TRAP_ID}),[]);
  const sameTurn=setup({sourceSetTurn:3});
  assert.deepEqual(actions(sameTurn),[]);
  const faceUp=setup({sourceFaceUp:true});
  assert.deepEqual(actions(faceUp),[]);
  const wrongPhase=structuredClone(f.duel);
  wrongPhase.core.phase='main';
  assert.deepEqual(curseOfRoyalActions(wrongPhase,lookup,{cardId:SOURCE_TRAP_ID}),[]);
});
test('activates from the shared team backrow even when the Set card belongs to the inactive partner',()=>{
  const f=setup();
  const session=activate(f);
  assert.equal(session.pending['m628-activation'].controllerSeat,f.activeSeat);
  assert.equal(session.pending['m628-activation'].sourceOwnerSeat,f.sourceOwnerSeat);
  assert.equal(session.duel.core.chain.at(-1).id,SOURCE_TRAP_ID);
  assert.equal(session.duel.core.players[0].backrow.find(card=>card.uid===f.sourceUid).faceUp,true);
  assert.deepEqual(inventory(session.duel),inventory(f.duel));
});
test('negates and destroys the activated Spell, routing both cards to their physical owners',()=>{
  const f=setup();
  const before=inventory(f.duel);
  const session=activate(f);
  const resolved=resolve(session);
  const result=resolved.result;
  const duel=resolved.session.duel;
  assert.equal(result.targetActivationNegated,true);
  assert.equal(result.targetDestroyed,true);
  assert.equal(result.sourceSentToGrave,true);
  assert.equal(duel.core.pendingNegated,true);
  assert.ok(graveHas(duel,f.opponentTeam,f.targetUid));
  assert.ok(graveHas(duel,f.controllerTeam,f.sourceUid));
  assert.deepEqual(inventory(duel),before);
});
test('a stolen activated Spell returns to the physical owner team, not its controller team',()=>{
  const f=setup({targetOwnerSeat:0});
  const session=activate(f);
  const resolved=resolve(session);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.ok(graveHas(resolved.session.duel,0,f.targetUid));
  assert.ok(!graveHas(resolved.session.duel,1,f.targetUid));
});
test('a stolen Curse of Royal returns to its physical owner team after resolution',()=>{
  const f=setup({sourceOwnerSeat:1});
  const session=activate(f);
  const resolved=resolve(session);
  assert.ok(graveHas(resolved.session.duel,1,f.sourceUid));
  assert.ok(!graveHas(resolved.session.duel,0,f.sourceUid));
});
test('negates a Trap activation represented by the top chain link',()=>{
  const f=setup({targetId:TARGET_TRAP_ID,targetKind:'chain'});
  const session=activate(f);
  const resolved=resolve(session);
  assert.equal(resolved.result.targetActivationNegated,true);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.equal(resolved.session.duel.core.chain.length,1);
  assert.equal(resolved.session.duel.core.chain[0].negated,true);
  assert.ok(graveHas(resolved.session.duel,1,f.targetUid));
});
test('destroys a Field Spell in the separate Field Zone without consuming a backrow slot',()=>{
  const f=setup({targetId:FIELD_ID,targetZone:'field',targetKind:'field'});
  const session=activate(f);
  const resolved=resolve(session);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.equal(resolved.session.duel.core.players[1].field,null);
  assert.ok(graveHas(resolved.session.duel,1,f.targetUid));
});
test('a target that leaves its zone before resolution is not replaced or destroyed',()=>{
  const f=setup();
  const session=activate(f);
  const stale=structuredClone(session);
  moveTargetToHand(stale.duel,f.targetUid,f.targetOwnerSeat);
  const resolved=resolve(stale);
  assert.equal(resolved.result.targetActivationNegated,false);
  assert.equal(resolved.result.targetDestroyed,false);
  assert.ok(!graveHas(resolved.session.duel,1,f.targetUid));
});
test('does not destroy a target that leaves and returns with a new zone lifetime',()=>{
  const f=setup();
  const session=activate(f);
  const stale=structuredClone(session);
  moveTargetToHand(stale.duel,f.targetUid,f.targetOwnerSeat);
  const hand=privateZone(stale.duel,f.targetOwnerSeat,'hand');
  const index=hand.findIndex(card=>card.uid===f.targetUid);
  const [card]=hand.splice(index,1);
  stale.duel.core.players[1].backrow.push({...card,faceUp:true,setTurn:0});
  synchronizeCardLifetimes(stale.duel.core);
  const resolved=resolve(stale);
  assert.equal(resolved.result.targetDestroyed,false);
});
test('does not retarget a replacement copy with the same card ID',()=>{
  const f=setup();
  const session=activate(f);
  const stale=structuredClone(session);
  moveTargetToHand(stale.duel,f.targetUid,f.targetOwnerSeat);
  const replacementUid=placeBackrow(stale.duel,stale.duel.active[1],1,MST,0,true);
  synchronizeCardLifetimes(stale.duel.core);
  const resolved=resolve(stale);
  assert.equal(resolved.result.targetActivationNegated,false);
  assert.equal(resolved.result.targetDestroyed,false);
  assert.ok(!graveHas(resolved.session.duel,1,replacementUid));
  assert.ok(!graveHas(resolved.session.duel,1,f.targetUid));
});
test('a negated Curse of Royal does not negate the original activation but still leaves the field',()=>{
  const f=setup();
  const session=activate(f);
  const resolved=resolve(session,'m628-activation',{sourceActivationNegated:true});
  assert.equal(resolved.result.sourceEffectNegated,true);
  assert.equal(resolved.result.targetActivationNegated,false);
  assert.equal(resolved.result.targetDestroyed,false);
  assert.ok(graveHas(resolved.session.duel,0,f.sourceUid));
  assert.ok(!resolved.session.duel.core.pendingNegated);
});
test('requires the Counter Trap link to remain at the top of the chain for resolution',()=>{
  const f=setup();
  const session=activate(f);
  const stacked=structuredClone(session);
  stacked.duel.core.chain.push({actor:1,card:f.targetUid,id:MST,target:''});
  const snapshot=JSON.stringify(stacked);
  assert.throws(()=>resolve(stacked),/topo da corrente/);
  assert.equal(JSON.stringify(stacked),snapshot);
});
test('Jinzo blocks the activation before the Counter Trap is offered',()=>{
  const f=setup();
  const jinzo=placeMonster(f.duel,f.duel.active[1],1,JINZO_ID);
  assert.ok(jinzo);
  assert.deepEqual(actions(f),[]);
});
test('the hand may exceed six during the turn; no premature discard is performed',()=>{
  const f=setup();
  const hand=privateZone(f.duel,f.activeSeat,'hand');
  const deck=privateZone(f.duel,f.activeSeat,'deck');
  hand.push(deck.pop(),deck.pop(),deck.pop());
  const before=hand.length;
  const session=activate(f);
  assert.equal(privateZone(session.duel,f.activeSeat,'hand').length,before);
  assert.doesNotThrow(()=>assertCurseOfRoyalRules(session.duel));
});
test('the Field Zone is separate from three shared Spell/Trap Zones',()=>{
  const duel=makeDuel(0);
  const seat=duel.active[0];
  const hand=privateZone(duel,seat,'hand');
  const deck=privateZone(duel,seat,'deck');
  hand.push(deck.pop());
  placeField(duel,seat,0,FIELD_ID,true);
  for(let i=0;i<3;i++)placeBackrow(duel,seat,0,i%2?SPELL_ID:TARGET_TRAP_ID,0,false);
  assert.doesNotThrow(()=>assertCurseOfRoyalRules(duel));
  assert.throws(()=>assertCurseOfRoyalRules({...duel,core:{
    ...duel.core,players:duel.core.players.map((player,index)=>index===0
      ?{...player,backrow:[...player.backrow,{uid:'m0:overflow',id:TARGET_TRAP_ID,faceUp:false,setTurn:0}]}
      :player)
  }}),/limite de zonas/);
});
test('rejects a fourth Monster Zone and preserves the three-zone invariant',()=>{
  const duel=makeDuel(0);
  const seat=duel.active[0];
  const hand=privateZone(duel,seat,'hand');
  const deck=privateZone(duel,seat,'deck');
  hand.push(deck.pop());
  for(let i=0;i<4;i++)placeMonster(duel,seat,0,normalDeck[i]);
  assert.throws(()=>assertCurseOfRoyalRules(duel),/limite de zonas/);
});
test('rejects an invalid activation without mutating the saved session',()=>{
  const f=setup();
  const session=createCurseOfRoyalSession(f.duel);
  const snapshot=JSON.stringify(session);
  assert.throws(()=>activateCurseOfRoyal(session,'missing','invalid',lookup,{cardId:SOURCE_TRAP_ID}),/não está legal/);
  assert.equal(JSON.stringify(session),snapshot);
});
test('rejects duplicate activation IDs and duplicate resolution',()=>{
  const f=setup();
  const session=activate(f);
  assert.throws(()=>activateCurseOfRoyal(session,f.sourceUid,'m628-activation',lookup,{cardId:SOURCE_TRAP_ID}),/duplicado/);
  const resolved=resolve(session);
  assert.throws(()=>resolveCurseOfRoyal(resolved.session,'m628-activation',{cardId:SOURCE_TRAP_ID}),/ausente ou já resolvida/);
});
test('all four opening-seat rotations preserve team routing and physical ownership',()=>{
  for(const first of [0,1,2,3]){
    const f=setup({first});
    const resolved=resolve(activate(f)).session.duel;
    assert.ok(graveHas(resolved,1,f.targetUid),'first='+first);
    assert.ok(graveHas(resolved,0,f.sourceUid),'first='+first);
  }
});
test('a missing or ambiguous destruction descriptor fails closed',()=>{
  const f=setup();
  const unknown=id=>id===MST?{kind:'spell',destroysExactlyOneSpellTrap:false}:lookup(id);
  assert.deepEqual(curseOfRoyalActions(f.duel,unknown,{cardId:SOURCE_TRAP_ID}),[]);
  const missing=id=>id===MST?undefined:lookup(id);
  assert.deepEqual(curseOfRoyalActions(f.duel,missing,{cardId:SOURCE_TRAP_ID}),[]);
});
test('the adapter conserves every physical UID and grants no inventory',()=>{
  const f=setup();
  const before=inventory(f.duel);
  const resolved=resolve(activate(f)).session.duel;
  assert.deepEqual(inventory(resolved),before);
  assert.equal(tag.tagInventory(resolved).filter(card=>card.entityKind!=='token').length,before.length);
});
