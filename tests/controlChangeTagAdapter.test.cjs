'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getDuelCard,getPlayableCard}=require('../dist/effectRegistry');
const {legalActions}=require('../dist/duelEngine');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
 SNATCH_STEAL_ID,CREATURE_SWAP_ID,
 assertControlChangeRules,assertPhysicalExtraDeckCounts,
 snatchStealActions,creatureSwapActions,createControlChangeSession,
 activateSnatchSteal,activateCreatureSwap,resolveControlChange,
 releaseSnatchSteal,resolveSnatchStealStandby
}=require('../dist/controlChangeTagAdapter');

const SOURCE_FIXTURE='55144522'; // Pot of Greed: enabled Spell fixture
const normalDeck=tag.tagNormalCardIds.slice(0,20);
assert.equal(normalDeck.length,20);
const TARGET_A=normalDeck[0],TARGET_B=normalDeck[1],TARGET_C=normalDeck[2];
const lookup=id=>{
 const card=getDuelCard(id);
 return card?{kind:card.kind,name:card.englishName??card.name}:undefined;
};
function makeDuel(first=0){
 const players=[0,1,2,3].map(seat=>({
  id:'m651-seat-'+seat,name:'M651 Seat '+seat,cards:[...normalDeck],extra:[]
 }));
 const duel=tag.createTagDuel(players,{seed:'m651-control-change-'+first,first,classic:true});
 duel.core.turn=3;duel.core.phase='main';duel.core.resume='main';
 duel.core.pending={kind:'none'};duel.core.chain=[];duel.core.priority=first%2;
 duel.core.passes=0;duel.core.damageStep=false;duel.core.turnEnding=false;
 duel.core.pendingNegated=false;duel.core.handFlow=undefined;duel.core.choice=undefined;
 assertControlChangeRules(duel);
 return duel;
}
function privateZone(duel,seat,zone){
 const team=seat%2;
 return duel.active[team]===seat
  ?duel.core.players[team][zone]
  :duel.reserves[String(seat)][zone];
}
function partnerSeat(seat){return (seat+2)%4;}
function placeSpell(duel,ownerSeat,id=SOURCE_FIXTURE){
 const hand=privateZone(duel,ownerSeat,'hand'),deck=privateZone(duel,ownerSeat,'deck');
 if(!hand.length){const drawn=deck.shift();assert.ok(drawn,'fixture needs another card');hand.push(drawn);}
 const card=hand[0];
 assert.ok(card,'fixture needs a physical card in hand for seat '+ownerSeat);
 card.id=id;
 return card.uid;
}
function placeBackrow(duel,ownerSeat,controllerTeam,id=SOURCE_FIXTURE){
 const uid=placeSpell(duel,ownerSeat,id);
 const hand=privateZone(duel,ownerSeat,'hand'),index=hand.findIndex(card=>card.uid===uid);
 const [card]=hand.splice(index,1);
 duel.core.players[controllerTeam].backrow.push({...card,faceUp:false,setTurn:0});
 return uid;
}
function placeMonster(duel,ownerSeat,controllerTeam,id=TARGET_A,faceUp=true){
 const hand=privateZone(duel,ownerSeat,'hand'),deck=privateZone(duel,ownerSeat,'deck');
 if(!hand.length){const drawn=deck.shift();assert.ok(drawn,'fixture needs another card');hand.push(drawn);}
 const [card]=hand.splice(0,1);
 card.id=id;
 duel.core.players[controllerTeam].monsters.push({
  ...card,owner:ownerSeat%2,position:faceUp?'atk':'def',faceUp,
  entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0
 });
 synchronizeCardLifetimes(duel.core);
 return card.uid;
}
function setupSnatch({first=0,sourceOwnerSeat,targetOwnerSeat,sourceId=SOURCE_FIXTURE}={}){
 const duel=makeDuel(first),controllerTeam=duel.core.current,opposingTeam=1-controllerTeam;
 const activeSeat=duel.active[controllerTeam],sourceOwner=sourceOwnerSeat??activeSeat;
 const targetOwner=targetOwnerSeat??duel.active[opposingTeam];
 const sourceUid=placeSpell(duel,sourceOwner,sourceId);
 const targetUid=placeMonster(duel,targetOwner,opposingTeam,TARGET_A);
 assertControlChangeRules(duel);
 return {duel,controllerTeam,opposingTeam,activeSeat,sourceOwnerSeat:sourceOwner,
  targetOwnerSeat:targetOwner,sourceUid,targetUid};
}
function setupSwap({first=0,sourceOwnerSeat,ownOwnerSeat,opposingOwnerSeat,faceDown=false}={}){
 const duel=makeDuel(first),controllerTeam=duel.core.current,opposingTeam=1-controllerTeam;
 const activeSeat=duel.active[controllerTeam],sourceOwner=sourceOwnerSeat??activeSeat;
 const ownOwner=ownOwnerSeat??activeSeat,opposingOwner=opposingOwnerSeat??duel.active[opposingTeam];
 const sourceUid=placeSpell(duel,sourceOwner);
 const ownUid=placeMonster(duel,ownOwner,controllerTeam,TARGET_A,true);
 const opposingUid=placeMonster(duel,opposingOwner,opposingTeam,TARGET_B,!faceDown);
 assertControlChangeRules(duel);
 return {duel,controllerTeam,opposingTeam,activeSeat,sourceOwnerSeat:sourceOwner,
  ownOwnerSeat:ownOwner,opposingOwnerSeat:opposingOwner,sourceUid,ownUid,opposingUid};
}
function activateSnatch(f,id='m651-snatch',targetUid=f.targetUid,sourceUid=f.sourceUid){
 return activateSnatchSteal(createControlChangeSession(f.duel),sourceUid,id,lookup,
  {cardId:SOURCE_FIXTURE,targetUid});
}
function activateSwap(f,id='m651-swap',sourceUid=f.sourceUid){
 return activateCreatureSwap(createControlChangeSession(f.duel),sourceUid,id,lookup,
  {cardId:SOURCE_FIXTURE});
}
function resolveSwap(session,id='m651-swap',ownUid,opposingUid,options={}){
 return resolveControlChange(session,id,{...options,ownTargetUid:ownUid,opposingTargetUid:opposingUid});
}
function inventory(duel){
 return tag.tagInventory(duel).filter(card=>card.entityKind!=='token')
  .map(card=>card.uid+'|'+card.id).sort();
}
function graveHas(duel,team,uid){return duel.core.players[team].grave.some(card=>card.uid===uid);}
function moveMonsterToHand(duel,uid,ownerSeat){
 for(const team of [0,1]){
  const index=duel.core.players[team].monsters.findIndex(card=>card.uid===uid);
  if(index>=0){
   const [card]=duel.core.players[team].monsters.splice(index,1);
   privateZone(duel,ownerSeat,'hand').push(card);
   synchronizeCardLifetimes(duel.core);
   return card;
  }
 }
 throw new Error('monster not found');
}
function addMonster(duel,ownerSeat,team,id=TARGET_C){
 return placeMonster(duel,ownerSeat,team,id);
}

test('Snatch Steal and Creature Swap remain unadmitted; adapters grant no cards',()=>{
 assert.equal(getPlayableCard(SNATCH_STEAL_ID),undefined);
 assert.equal(getPlayableCard(CREATURE_SWAP_ID),undefined);
 assert.equal(getDuelCard(SNATCH_STEAL_ID),undefined);
 assert.equal(getDuelCard(CREATURE_SWAP_ID),undefined);
 assert.equal(lookup(SOURCE_FIXTURE).kind,'spell');
 assertPhysicalExtraDeckCounts([0,1,2,3],5);
 assert.throws(()=>assertPhysicalExtraDeckCounts([0,1,6,3],5),/cinco/);
});

test('Snatch Steal offers only a face-up opposing monster and an active-seat Spell',()=>{
 const f=setupSnatch();
 const actions=snatchStealActions(f.duel,lookup,{cardId:SOURCE_FIXTURE});
 assert.deepEqual(actions,[{kind:'equip',card:f.sourceUid,target:f.targetUid,effect:'snatch-steal'}]);
 const faceDown=structuredClone(f.duel);
 faceDown.core.players[f.opposingTeam].monsters[0].faceUp=false;
 assert.deepEqual(snatchStealActions(faceDown,lookup,{cardId:SOURCE_FIXTURE}),[]);
 const partner=setupSnatch({sourceOwnerSeat:partnerSeat(0)});
 assert.deepEqual(snatchStealActions(partner.duel,lookup,{cardId:SOURCE_FIXTURE}),[]);
});

test('Snatch Steal rejects a target already equipped by another card',()=>{
 const f=setupSnatch();
 const equipUid=placeBackrow(f.duel,f.activeSeat,f.controllerTeam);
 f.duel.core.players[f.controllerTeam].backrow.find(card=>card.uid===equipUid).equippedTo=f.targetUid;
 assert.deepEqual(snatchStealActions(f.duel,lookup,{cardId:SOURCE_FIXTURE}),[]);
});

test('Snatch Steal moves control only on resolution and preserves physical ownership and inventory',()=>{
 const f=setupSnatch(),before=inventory(f.duel);
 const pending=activateSnatch(f);
 assert.ok(pending.duel.core.players[f.opposingTeam].monsters.some(m=>m.uid===f.targetUid));
 assert.ok(!pending.duel.core.players[f.controllerTeam].monsters.some(m=>m.uid===f.targetUid));
 const resolved=resolveControlChange(pending,'m651-snatch');
 const target=resolved.session.duel.core.players[f.controllerTeam].monsters.find(m=>m.uid===f.targetUid);
 assert.ok(target);
 assert.equal(target.owner,f.opposingTeam);
 assert.equal(resolved.session.duel.core.players[f.controllerTeam].backrow.find(c=>c.uid===f.sourceUid).equippedTo,f.targetUid);
 assert.equal(resolved.result.targetControlled,true);
 assert.equal(resolved.result.sourceSentToGrave,false);
 assert.deepEqual(inventory(resolved.session.duel),before);
});

test('a negated Snatch Steal keeps the target in place and sends the Equip to its owner Graveyard',()=>{
 const f=setupSnatch(),pending=activateSnatch(f);
 pending.duel.core.chain[0].negated=true;
 const resolved=resolveControlChange(pending,'m651-snatch');
 assert.equal(resolved.result.sourceEffectNegated,true);
 assert.equal(resolved.result.targetControlled,false);
 assert.ok(graveHas(resolved.session.duel,f.activeSeat%2,f.sourceUid));
 assert.ok(resolved.session.duel.core.players[f.opposingTeam].monsters.some(m=>m.uid===f.targetUid));
});

test('Snatch Steal returns control immediately when its Equip leaves the field',()=>{
 const f=setupSnatch(),before=inventory(f.duel);
 const stolen=resolveControlChange(activateSnatch(f),'m651-snatch').session;
 const released=releaseSnatchSteal(stolen,'m651-snatch');
 assert.equal(released.result.equipSentToGrave,true);
 assert.equal(released.result.monsterReturned,true);
 assert.ok(released.session.duel.core.players[f.opposingTeam].monsters.some(m=>m.uid===f.targetUid));
 assert.ok(graveHas(released.session.duel,f.activeSeat%2,f.sourceUid));
 assert.deepEqual(inventory(released.session.duel),before);
});

test('Snatch Steal standby grants 1000 LP to the opposing team once per opposing Standby',()=>{
 const f=setupSnatch(),stolen=resolveControlChange(activateSnatch(f),'m651-snatch').session;
 const initial=stolen.duel.core.players[f.opposingTeam].lp;
 stolen.duel.core.turn=4;
 const first=resolveSnatchStealStandby(stolen,'m651-snatch',4,f.opposingTeam);
 assert.equal(first.result.applied,true);
 assert.equal(first.session.duel.core.players[f.opposingTeam].lp,initial+1000);
 const duplicate=resolveSnatchStealStandby(first.session,'m651-snatch',4,f.opposingTeam);
 assert.equal(duplicate.result.applied,false);
 assert.equal(duplicate.session.duel.core.players[f.opposingTeam].lp,initial+1000);
 duplicate.session.duel.core.turn=5;
 const second=resolveSnatchStealStandby(duplicate.session,'m651-snatch',5,f.opposingTeam);
 assert.equal(second.result.applied,true);
 assert.equal(second.session.duel.core.players[f.opposingTeam].lp,initial+2000);
});

test('Snatch Steal standby rejects the controller team and an out-of-turn event',()=>{
 const f=setupSnatch(),stolen=resolveControlChange(activateSnatch(f),'m651-snatch').session;
 stolen.duel.core.turn=4;
 assert.throws(()=>resolveSnatchStealStandby(stolen,'m651-snatch',4,f.controllerTeam),/equipe adversária/);
 assert.throws(()=>resolveSnatchStealStandby(stolen,'m651-snatch',5,f.opposingTeam),/turno/);
});

test('Snatch Steal does not retarget a monster that left and returned with the same UID',()=>{
 const f=setupSnatch(),pending=activateSnatch(f);
 const stale=structuredClone(pending);
 moveMonsterToHand(stale.duel,f.targetUid,f.targetOwnerSeat);
 const hand=privateZone(stale.duel,f.targetOwnerSeat,'hand');
 const index=hand.findIndex(card=>card.uid===f.targetUid);
 const [card]=hand.splice(index,1);
 stale.duel.core.players[f.opposingTeam].monsters.push({
  ...card,owner:f.targetOwnerSeat%2,position:'atk',faceUp:true,
  entered:stale.duel.core.turn,changed:stale.duel.core.turn,attacked:0,atkBoost:0,defBoost:0
 });
 synchronizeCardLifetimes(stale.duel.core);
 const resolved=resolveControlChange(stale,'m651-snatch');
 assert.equal(resolved.result.targetControlled,false);
 assert.ok(resolved.session.duel.core.players[f.opposingTeam].monsters.some(m=>m.uid===f.targetUid));
});

test('Snatch Steal never retargets a replacement copy with the same card ID',()=>{
 const f=setupSnatch(),pending=activateSnatch(f);
 const stale=structuredClone(pending);
 moveMonsterToHand(stale.duel,f.targetUid,f.targetOwnerSeat);
 const replacement=addMonster(stale.duel,stale.duel.active[f.opposingTeam],f.opposingTeam,TARGET_A);
 synchronizeCardLifetimes(stale.duel.core);
 const resolved=resolveControlChange(stale,'m651-snatch');
 assert.equal(resolved.result.targetControlled,false);
 assert.ok(!resolved.session.duel.core.players[f.controllerTeam].monsters.some(m=>m.uid===replacement));
});

test('Snatch Steal rejects a full controller Monster Zone before activation',()=>{
 const f=setupSnatch();
 for(let i=0;i<3;i++)addMonster(f.duel,f.activeSeat,f.controllerTeam,[TARGET_A,TARGET_B,TARGET_C][i]);
 assert.deepEqual(snatchStealActions(f.duel,lookup,{cardId:SOURCE_FIXTURE}),[]);
});

test('Snatch Steal returns to the previous controller; if its field is full, the monster returns to physical owner Graveyard',()=>{
 const f=setupSnatch(),stolen=resolveControlChange(activateSnatch(f),'m651-snatch').session;
 for(let i=0;i<3;i++)addMonster(stolen.duel,stolen.duel.active[f.opposingTeam],f.opposingTeam,[TARGET_A,TARGET_B,TARGET_C][i]);
 const released=releaseSnatchSteal(stolen,'m651-snatch');
 assert.equal(released.result.monsterReturned,false);
 assert.equal(released.result.monsterSentToGrave,true);
 assert.ok(graveHas(released.session.duel,f.opposingTeam,f.targetUid));
});

test('Snatch Steal releases control even if the Equip has already left its zone',()=>{
 const f=setupSnatch(),stolen=resolveControlChange(activateSnatch(f),'m651-snatch').session;
 const field=stolen.duel.core.players[f.controllerTeam].backrow;
 const index=field.findIndex(card=>card.uid===f.sourceUid);
 const [equip]=field.splice(index,1);
 stolen.duel.core.players[f.activeSeat%2].grave.push({uid:equip.uid,id:equip.id});
 synchronizeCardLifetimes(stolen.duel.core);
 const released=releaseSnatchSteal(stolen,'m651-snatch');
 assert.equal(released.result.equipSentToGrave,false);
 assert.equal(released.result.monsterReturned,true);
});

test('Snatch Steal does not return a monster that has already left the field',()=>{
 const f=setupSnatch(),stolen=resolveControlChange(activateSnatch(f),'m651-snatch').session;
 moveMonsterToHand(stolen.duel,f.targetUid,f.targetOwnerSeat);
 const released=releaseSnatchSteal(stolen,'m651-snatch');
 assert.equal(released.result.monsterReturned,false);
 assert.equal(released.result.monsterSentToGrave,false);
});

test('Creature Swap offers one monster from each shared team field',()=>{
 const f=setupSwap();
 const actions=creatureSwapActions(f.duel,lookup,{cardId:SOURCE_FIXTURE});
 assert.deepEqual(actions,[{kind:'spell',card:f.sourceUid,effect:'creature-swap',ownTarget:f.ownUid,opposingTarget:f.opposingUid}]);
 const noOpponent=structuredClone(f.duel);
 noOpponent.core.players[f.opposingTeam].monsters=[];
 assert.deepEqual(creatureSwapActions(noOpponent,lookup,{cardId:SOURCE_FIXTURE}),[]);
});

test('Creature Swap exchanges control while preserving physical UIDs and owner teams',()=>{
 const f=setupSwap(),before=inventory(f.duel);
 const pending=activateSwap(f);
 const resolved=resolveSwap(pending,'m651-swap',f.ownUid,f.opposingUid);
 const own=resolved.session.duel.core.players[f.controllerTeam].monsters.find(m=>m.uid===f.opposingUid);
 const opposing=resolved.session.duel.core.players[f.opposingTeam].monsters.find(m=>m.uid===f.ownUid);
 assert.ok(own&&opposing);
 assert.equal(own.owner,f.opposingTeam);
 assert.equal(opposing.owner,f.controllerTeam);
 assert.equal(resolved.result.targetsSwapped,true);
 assert.equal(resolved.result.sourceSentToGrave,true);
 assert.ok(graveHas(resolved.session.duel,f.activeSeat%2,f.sourceUid));
 assert.deepEqual(inventory(resolved.session.duel),before);
});

test('Creature Swap locks both monsters from changing battle position for the rest of this turn',()=>{
 const f=setupSwap(),resolved=resolveSwap(activateSwap(f),'m651-swap',f.ownUid,f.opposingUid).session;
 const actions=legalActions(resolved.duel.core,'tag-team-'+f.controllerTeam);
 assert.ok(!actions.some(action=>action.kind==='position'&&[f.ownUid,f.opposingUid].includes(action.card)));
 resolved.duel.core.turn++;
 const later=legalActions(resolved.duel.core,'tag-team-'+f.controllerTeam);
 assert.ok(later.some(action=>action.kind==='position'&&[f.ownUid,f.opposingUid].includes(action.card)));
});

test('Creature Swap can exchange a face-down monster without revealing its identity',()=>{
 const f=setupSwap({faceDown:true});
 const actions=creatureSwapActions(f.duel,lookup,{cardId:SOURCE_FIXTURE});
 assert.ok(actions.some(action=>action.opposingTarget===f.opposingUid));
 const resolved=resolveSwap(activateSwap(f),'m651-swap',f.ownUid,f.opposingUid).session;
 const target=resolved.duel.core.players[f.controllerTeam].monsters.find(m=>m.uid===f.opposingUid);
 assert.ok(target);
 assert.equal(target.faceUp,false);
});

test('a negated Creature Swap does not exchange monsters and still sends the Spell to Graveyard',()=>{
 const f=setupSwap(),pending=activateSwap(f);
 pending.duel.core.chain[0].negated=true;
 const resolved=resolveControlChange(pending,'m651-swap');
 assert.equal(resolved.result.sourceEffectNegated,true);
 assert.equal(resolved.result.targetsSwapped,false);
 assert.ok(resolved.session.duel.core.players[f.controllerTeam].monsters.some(m=>m.uid===f.ownUid));
 assert.ok(graveHas(resolved.session.duel,f.activeSeat%2,f.sourceUid));
});

test('Creature Swap chooses from the current fields at resolution, not from activation-time targets',()=>{
 const f=setupSwap(),pending=activateSwap(f);
 const changed=structuredClone(pending);
 moveMonsterToHand(changed.duel,f.opposingUid,f.opposingOwnerSeat);
 const replacement=addMonster(changed.duel,changed.duel.active[f.opposingTeam],f.opposingTeam,TARGET_B);
 const resolved=resolveSwap(changed,'m651-swap',f.ownUid,replacement);
 assert.equal(resolved.result.targetsSwapped,true);
 assert.ok(resolved.session.duel.core.players[f.controllerTeam].monsters.some(m=>m.uid===replacement));
 assert.ok(resolved.session.duel.core.players[f.opposingTeam].monsters.some(m=>m.uid===f.ownUid));
});

test('Creature Swap rejects an invalid resolution pair and duplicate activation IDs',()=>{
 const f=setupSwap(),session=activateSwap(f);
 const invalid=resolveSwap(session,'m651-swap',f.ownUid,f.ownUid);
 assert.equal(invalid.result.targetsSwapped,false);
 assert.throws(()=>activateCreatureSwap(session,f.sourceUid,'m651-swap',lookup,
  {cardId:SOURCE_FIXTURE}),/duplicado/);
});

test('both adapters require the active seat to own the activating Spell',()=>{
 const f=setupSnatch({sourceOwnerSeat:partnerSeat(0)});
 assert.deepEqual(snatchStealActions(f.duel,lookup,{cardId:SOURCE_FIXTURE}),[]);
 const s=setupSwap({sourceOwnerSeat:partnerSeat(0)});
 assert.deepEqual(creatureSwapActions(s.duel,lookup,{cardId:SOURCE_FIXTURE}),[]);
});

test('Creature Swap does not resolve if a chosen team has no monster at resolution',()=>{
 const f=setupSwap(),pending=activateSwap(f);
 moveMonsterToHand(pending.duel,f.opposingUid,f.opposingOwnerSeat);
 const resolved=resolveSwap(pending,'m651-swap',f.ownUid,f.opposingUid);
 assert.equal(resolved.result.targetsSwapped,false);
});

test('Creature Swap preserves a full three-monster field without overflowing zones',()=>{
 const f=setupSwap();
 for(let i=0;i<2;i++)addMonster(f.duel,f.activeSeat,f.controllerTeam,[TARGET_B,TARGET_C][i]);
 const resolved=resolveSwap(activateSwap(f),'m651-swap',f.ownUid,f.opposingUid);
 assert.equal(resolved.result.targetsSwapped,true);
 assert.equal(resolved.session.duel.core.players[f.controllerTeam].monsters.length,3);
 assert.equal(resolved.session.duel.core.players[f.opposingTeam].monsters.length,1);
});

test('a response stacked above the Spell prevents out-of-order resolution',()=>{
 const f=setupSwap(),pending=activateSwap(f);
 pending.duel.core.chain.push({actor:f.opposingTeam,card:'m'+pending.duel.active[f.opposingTeam]+':response',id:SOURCE_FIXTURE,target:''});
 assert.throws(()=>resolveControlChange(pending,'m651-swap'),/topo da corrente/);
});

test('all four opening-seat rotations preserve ownership and control-change invariants',()=>{
 for(const first of [0,1,2,3]){
  const f=setupSwap({first});
  const before=inventory(f.duel);
  const resolved=resolveSwap(activateSwap(f),'m651-swap',f.ownUid,f.opposingUid);
  assert.ok(resolved.session.duel.core.players[f.controllerTeam].monsters.some(m=>m.uid===f.opposingUid));
  assert.ok(resolved.session.duel.core.players[f.opposingTeam].monsters.some(m=>m.uid===f.ownUid));
  assert.deepEqual(inventory(resolved.session.duel),before);
  assertControlChangeRules(resolved.session.duel);
 }
});

test('a seven-card hand is retained until End Phase; the adapter does not discard early',()=>{
 const f=setupSnatch();
 const hand=privateZone(f.duel,f.activeSeat,'hand'),deck=privateZone(f.duel,f.activeSeat,'deck');
 hand.push(deck.pop(),deck.pop(),deck.pop());
 const before=hand.length;
 const session=activateSnatch(f);
 assert.equal(before,7);
 assert.equal(privateZone(session.duel,f.activeSeat,'hand').length,6);
 assert.doesNotThrow(()=>assertControlChangeRules(session.duel));
});

test('the Field Zone is independent of the three shared Spell/Trap Zones',()=>{
 const f=setupSwap(),fieldUid=placeSpell(f.duel,f.activeSeat);
 const fieldHand=privateZone(f.duel,f.activeSeat,'hand'),fieldIndex=fieldHand.findIndex(card=>card.uid===fieldUid);
 const [fieldCard]=fieldHand.splice(fieldIndex,1);
 f.duel.core.players[f.controllerTeam].field={...fieldCard,faceUp:true,setTurn:0};
 for(let i=0;i<3;i++)placeBackrow(f.duel,f.activeSeat,f.controllerTeam);
 assert.doesNotThrow(()=>assertControlChangeRules(f.duel));
 placeBackrow(f.duel,f.activeSeat,f.controllerTeam);
 assert.throws(()=>assertControlChangeRules(f.duel),/três Spell\/Trap Zones/);
});

test('rejects a fourth Monster Zone and preserves the 3+3 shared-field invariant',()=>{
 const f=setupSnatch();
 for(let i=0;i<4;i++)addMonster(f.duel,f.activeSeat,f.controllerTeam,[TARGET_A,TARGET_B,TARGET_C][i%3]);
 assert.throws(()=>assertControlChangeRules(f.duel),/zona|Monster Zone/i);
});

test('invalid activation leaves the original session immutable and duplicate resolution is rejected',()=>{
 const f=setupSnatch(),input=createControlChangeSession(f.duel),snapshot=JSON.stringify(input);
 assert.throws(()=>activateSnatchSteal(input,f.sourceUid,'m651-invalid',lookup,
  {cardId:SOURCE_FIXTURE,targetUid:'missing'}),/alvo válido/);
 assert.equal(JSON.stringify(input),snapshot);
 const resolved=resolveControlChange(activateSnatch(f),'m651-snatch');
 assert.throws(()=>resolveControlChange(resolved.session,'m651-snatch'),/ausente ou já resolvida/);
});

test('Snatch Steal cannot be released twice or award Standby LP after release',()=>{
 const f=setupSnatch(),stolen=resolveControlChange(activateSnatch(f),'m651-snatch').session;
 const released=releaseSnatchSteal(stolen,'m651-snatch');
 assert.throws(()=>releaseSnatchSteal(released.session,'m651-snatch'),/ausente ou já liberado/);
 released.session.duel.core.turn=4;
 assert.throws(()=>resolveSnatchStealStandby(released.session,'m651-snatch',4,f.opposingTeam),/ausente ou liberado/);
});
