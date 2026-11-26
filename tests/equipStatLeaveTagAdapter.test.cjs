'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getDuelCard,getPlayableCard,enabledCardIds}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
 AXE_OF_DESPAIR_ID,BLACK_PENDANT_ID,assertEquipStatRules,assertPhysicalExtraDeckCounts,
 axeOfDespairActions,blackPendantActions,createEquipStatSession,
 activateAxeOfDespair,activateBlackPendant,resolveEquipStat,releaseEquipStat,
 resolveAxeOfDespairGraveTrigger,resolveBlackPendantGraveTrigger
}=require('../dist/equipStatLeaveTagAdapter');

const SOURCE_FIXTURE='55144522'; // Pot of Greed: enabled Spell fixture
const NORMALS=tag.tagNormalCardIds.slice(0,20);
assert.equal(NORMALS.length,20);
const TARGET_A=NORMALS[0],TARGET_B=NORMALS[1];
const FIELD=enabledCardIds.find(id=>getPlayableCard(id)?.kind==='spell'&&getPlayableCard(id)?.field===true);
const lookup=id=>{
 const card=getDuelCard(id);
 return card?{kind:card.kind,name:card.englishName??card.name}:undefined;
};
function makeDuel(first=0,seed='default'){
 const players=[0,1,2,3].map(seat=>({
  id:'m652-seat-'+seat,name:'M652 Seat '+seat,cards:[...NORMALS],extra:[]
 }));
 const duel=tag.createTagDuel(players,{seed:'m652-'+seed,first,classic:true});
 duel.core.turn=3;duel.core.phase='main';duel.core.resume='main';
 duel.core.pending={kind:'none'};duel.core.chain=[];duel.core.priority=first%2;
 duel.core.passes=0;duel.core.damageStep=false;duel.core.turnEnding=false;
 duel.core.pendingNegated=false;duel.core.handFlow=undefined;duel.core.choice=undefined;
 assertEquipStatRules(duel);
 return duel;
}
function privateZone(duel,seat,zone){
 const team=seat%2;
 return duel.active[team]===seat?duel.core.players[team][zone]:duel.reserves[String(seat)][zone];
}
function partnerSeat(seat){return (seat+2)%4;}
function placeSpell(duel,ownerSeat,id=SOURCE_FIXTURE){
 const hand=privateZone(duel,ownerSeat,'hand'),deck=privateZone(duel,ownerSeat,'deck');
 if(!hand.length){const drawn=deck.shift();assert.ok(drawn,'fixture needs another card');hand.push(drawn);}
 const card=hand[hand.length-1];
 assert.ok(card,'fixture needs a physical Spell in hand');
 card.id=id;
 return card.uid;
}
function placeBackrow(duel,ownerSeat,controllerTeam,id=SOURCE_FIXTURE,setTurn=0){
 const uid=placeSpell(duel,ownerSeat,id);
 const hand=privateZone(duel,ownerSeat,'hand'),index=hand.findIndex(card=>card.uid===uid);
 const [card]=hand.splice(index,1);
 duel.core.players[controllerTeam].backrow.push({...card,faceUp:false,setTurn});
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
function setup({first=0,sourceOwnerSeat,targetTeam,targetOwnerSeat,sourceInBackrow=false,setTurn=0,faceUp=true}={}){
 const duel=makeDuel(first),team=duel.core.current,activeSeat=duel.active[team];
 const ownerSeat=sourceOwnerSeat??activeSeat,targetController=targetTeam??team;
 const targetOwner=targetOwnerSeat??duel.active[targetController];
 const sourceUid=sourceInBackrow
  ?placeBackrow(duel,ownerSeat,team,SOURCE_FIXTURE,setTurn)
  :placeSpell(duel,ownerSeat,SOURCE_FIXTURE);
 const targetUid=placeMonster(duel,targetOwner,targetController,TARGET_A,faceUp);
 assertEquipStatRules(duel);
 return {duel,team,activeSeat,ownerSeat,targetController,targetOwner,sourceUid,targetUid};
}
function activateAxe(f,id='m652-axe'){
 return activateAxeOfDespair(createEquipStatSession(f.duel),f.sourceUid,id,lookup,
  {cardId:SOURCE_FIXTURE,targetUid:f.targetUid});
}
function activatePendant(f,id='m652-pendant'){
 return activateBlackPendant(createEquipStatSession(f.duel),f.sourceUid,id,lookup,
  {cardId:SOURCE_FIXTURE,targetUid:f.targetUid});
}
function monster(duel,uid){
 for(const player of duel.core.players){
  const found=player.monsters.find(card=>card.uid===uid);
  if(found)return found;
 }
}
function inventory(duel){
 const cards=tag.tagInventory(duel).filter(card=>card.entityKind!=='token');
 const result=cards.map(card=>card.uid+'|'+card.id).sort();
 assert.equal(new Set(result.map(row=>row.split('|')[0])).size,result.length);
 return result;
}
function graveHas(duel,team,uid){return duel.core.players[team].grave.some(card=>card.uid===uid);}
function assertConserved(duel,before){assert.deepEqual(inventory(duel),before);}
function assertRules(duel){
 const rules=rulesFor(duel.core);
 assert.equal(rules.mainDeckMin,20);assert.equal(rules.mainDeckMax,30);
 assert.equal(rules.handLimit,6);assert.equal(rules.handCheck,'end');
 assert.equal(rules.monsterZones,3);assert.equal(rules.spellTrapZones,3);
 assert.equal(rules.extraDeckMax,5);
 for(const player of duel.core.players){assert.ok(player.monsters.length<=3);assert.ok(player.backrow.length<=3);}
}

test('Axe of Despair and Black Pendant remain unadmitted; no inventory or certificates are granted',()=>{
 for(const id of [AXE_OF_DESPAIR_ID,BLACK_PENDANT_ID]){
  assert.equal(getPlayableCard(id),undefined);
  assert.equal(getDuelCard(id),undefined);
 }
 assertPhysicalExtraDeckCounts([0,1,2,3],5);
 assert.throws(()=>assertPhysicalExtraDeckCounts([0,1,6,3],5),/cinco/);
});

test('Axe of Despair offers a face-up monster on either team and a physical Spell owned by the active seat',()=>{
 const f=setup({targetTeam:1});
 assert.deepEqual(axeOfDespairActions(f.duel,lookup,{cardId:SOURCE_FIXTURE}),[
  {kind:'equip',card:f.sourceUid,target:f.targetUid,effect:'axe-of-despair',sourceLocation:'hand'}
 ]);
 const down=structuredClone(f.duel);
 down.core.players[1].monsters[0].faceUp=false;
 assert.deepEqual(axeOfDespairActions(down,lookup,{cardId:SOURCE_FIXTURE}),[]);
 const partner=setup({sourceOwnerSeat:partnerSeat(0)});
 assert.deepEqual(axeOfDespairActions(partner.duel,lookup,{cardId:SOURCE_FIXTURE}),[]);
});

test('Black Pendant offers the same legal Equip window but never exposes a face-down target',()=>{
 const f=setup();
 assert.equal(blackPendantActions(f.duel,lookup,{cardId:SOURCE_FIXTURE}).length,1);
 const down=structuredClone(f.duel);
 down.core.players[0].monsters[0].faceUp=false;
 assert.deepEqual(blackPendantActions(down,lookup,{cardId:SOURCE_FIXTURE}),[]);
});

test('a set Equip from the partner may activate only after the turn it was set',()=>{
 const f=setup({sourceOwnerSeat:partnerSeat(0),sourceInBackrow:true,setTurn:3});
 assert.deepEqual(axeOfDespairActions(f.duel,lookup,{cardId:SOURCE_FIXTURE}),[]);
 f.duel.core.players[0].backrow[0].setTurn=2;
 assert.equal(axeOfDespairActions(f.duel,lookup,{cardId:SOURCE_FIXTURE}).length,1);
 const pending=activateAxe(f);
 assert.equal(pending.duel.core.players[0].backrow.find(card=>card.uid===f.sourceUid).faceUp,true);
});

test('a hand Equip cannot activate when all three shared Spell/Trap Zones are occupied',()=>{
 const f=setup();
 for(let i=0;i<3;i++)placeBackrow(f.duel,f.activeSeat,f.team,SOURCE_FIXTURE,0);
 assert.deepEqual(axeOfDespairActions(f.duel,lookup,{cardId:SOURCE_FIXTURE}),[]);
});

test('a previously set Equip can activate even when the shared backrow is full',()=>{
 const f=setup({sourceOwnerSeat:partnerSeat(0),sourceInBackrow:true,setTurn:0});
 for(let i=0;i<2;i++)placeBackrow(f.duel,f.activeSeat,f.team,FIELD,0);
 assert.equal(f.duel.core.players[f.team].backrow.length,3);
 assert.equal(axeOfDespairActions(f.duel,lookup,{cardId:SOURCE_FIXTURE}).length,1);
});

test('Equip Spells are limited to the active team Main Phase and current priority',()=>{
 const f=setup();
 f.duel.core.phase='battle';
 assert.deepEqual(axeOfDespairActions(f.duel,lookup,{cardId:SOURCE_FIXTURE}),[]);
 f.duel.core.phase='main';f.duel.core.priority=1-f.team;
 assert.deepEqual(axeOfDespairActions(f.duel,lookup,{cardId:SOURCE_FIXTURE}),[]);
});

test('activation moves only the physical Equip to the backrow and does not boost before resolution',()=>{
 const f=setup(),before=inventory(f.duel),original=JSON.stringify(f.duel);
 const pending=activateAxe(f);
 assert.equal(JSON.stringify(f.duel),original);
 assert.ok(pending.duel.core.players[f.team].backrow.some(card=>card.uid===f.sourceUid&&card.equippedTo===f.targetUid));
 assert.equal(monster(pending.duel,f.targetUid).atkBoost,0);
 assertConserved(pending.duel,before);assertRules(pending.duel);
});

test('Axe of Despair applies exactly +1000 ATK after successful resolution',()=>{
 const f=setup(),pending=activateAxe(f);
 const resolved=resolveEquipStat(pending,'m652-axe');
 assert.equal(resolved.result.applied,true);
 assert.equal(monster(resolved.session.duel,f.targetUid).atkBoost,1000);
 assert.equal(monster(resolved.session.duel,f.targetUid).defBoost,0);
 assertConserved(resolved.session.duel,inventory(f.duel));
});

test('Black Pendant applies exactly +500 ATK after successful resolution',()=>{
 const f=setup(),pending=activatePendant(f);
 const resolved=resolveEquipStat(pending,'m652-pendant');
 assert.equal(resolved.result.applied,true);
 assert.equal(monster(resolved.session.duel,f.targetUid).atkBoost,500);
 assert.equal(monster(resolved.session.duel,f.targetUid).defBoost,0);
});

test('a negated Equip activation sends the physical card to its owner Graveyard without a stat modifier',()=>{
 const f=setup(),pending=activateAxe(f);
 pending.duel.core.chain[pending.duel.core.chain.length-1].negated=true;
 const resolved=resolveEquipStat(pending,'m652-axe');
 assert.equal(resolved.result.negated,true);
 assert.equal(resolved.result.applied,false);
 assert.equal(resolved.result.sourceSentToGrave,true);
 assert.ok(graveHas(resolved.session.duel,f.team,f.sourceUid));
 assert.equal(monster(resolved.session.duel,f.targetUid).atkBoost,0);
});

test('a target that leaves and returns with the same UID is rejected by its lifetime epoch',()=>{
 const f=setup(),pending=activateAxe(f);
 const stale=structuredClone(pending);
 const field=stale.duel.core.players[f.team].monsters;
 const index=field.findIndex(card=>card.uid===f.targetUid);
 const [target]=field.splice(index,1);
 privateZone(stale.duel,f.targetOwner,'hand').push(target);
 synchronizeCardLifetimes(stale.duel.core);
 const hand=privateZone(stale.duel,f.targetOwner,'hand'),handIndex=hand.findIndex(card=>card.uid===f.targetUid);
 const [returned]=hand.splice(handIndex,1);
 stale.duel.core.players[f.team].monsters.push({
  ...returned,position:'atk',faceUp:true,entered:stale.duel.core.turn,
  changed:stale.duel.core.turn,attacked:0,atkBoost:0,defBoost:0
 });
 synchronizeCardLifetimes(stale.duel.core);
 const resolved=resolveEquipStat(stale,'m652-axe');
 assert.equal(resolved.result.applied,false);
 assert.ok(graveHas(resolved.session.duel,f.team,f.sourceUid));
});

test('a replacement copy with the same card ID is never selected by a stale Equip target',()=>{
 const f=setup(),pending=activateAxe(f);
 const stale=structuredClone(pending);
 const field=stale.duel.core.players[f.team].monsters;
 const index=field.findIndex(card=>card.uid===f.targetUid);
 const [target]=field.splice(index,1);
 privateZone(stale.duel,f.targetOwner,'hand').push(target);
 synchronizeCardLifetimes(stale.duel.core);
 const replacement=placeMonster(stale.duel,stale.duel.active[f.team],f.team,TARGET_A,true);
 const resolved=resolveEquipStat(stale,'m652-axe');
 assert.equal(resolved.result.applied,false);
 assert.equal(monster(resolved.session.duel,replacement).atkBoost,0);
});

test('release removes the exact Equip modifier and sends the source to its physical owner Graveyard',()=>{
 const f=setup(),before=inventory(f.duel);
 const resolved=resolveEquipStat(activateAxe(f),'m652-axe').session;
 const released=releaseEquipStat(resolved,'m652-axe');
 assert.equal(released.result.removedAtk,1000);
 assert.equal(released.result.equipSentToGrave,true);
 assert.equal(monster(released.session.duel,f.targetUid).atkBoost,0);
 assert.ok(graveHas(released.session.duel,f.team,f.sourceUid));
 assertConserved(released.session.duel,before);
});

test('Axe of Despair optional Graveyard trigger may be declined without moving the card',()=>{
 const f=setup(),released=releaseEquipStat(resolveEquipStat(activateAxe(f),'m652-axe').session,'m652-axe');
 const declined=resolveAxeOfDespairGraveTrigger(released.session,'m652-axe');
 assert.equal(declined.result.status,'declined');
 assert.ok(graveHas(declined.session.duel,f.team,f.sourceUid));
 assert.equal(declined.session.duel.core.players[f.team].deck.some(card=>card.uid===f.sourceUid),false);
});

test('Axe of Despair tributes one team monster and returns to the physical owner top Deck',()=>{
 const f=setup({sourceOwnerSeat:partnerSeat(0),sourceInBackrow:true,setTurn:0});
 const tributeUid=placeMonster(f.duel,f.activeSeat,f.team,TARGET_B,true);
 const before=inventory(f.duel);
 const resolved=resolveEquipStat(activateAxe(f),'m652-axe').session;
 const released=releaseEquipStat(resolved,'m652-axe').session;
 const deckBefore=privateZone(released.duel,f.ownerSeat,'deck').length;
 const trigger=resolveAxeOfDespairGraveTrigger(released,'m652-axe',tributeUid);
 assert.equal(trigger.result.status,'returned-to-deck');
 assert.equal(privateZone(trigger.session.duel,f.ownerSeat,'deck').length,deckBefore+1);
 assert.equal(privateZone(trigger.session.duel,f.ownerSeat,'deck')[0].uid,f.sourceUid);
 assert.ok(graveHas(trigger.session.duel,f.team,tributeUid));
 assert.equal(graveHas(trigger.session.duel,f.team,f.sourceUid),false);
 assertConserved(trigger.session.duel,before);
});

test('Axe of Despair trigger cannot tribute a monster controlled by the opposing team',()=>{
 const f=setup(),opposing=placeMonster(f.duel,f.duel.active[1-f.team],1-f.team,TARGET_B,true);
 const released=releaseEquipStat(resolveEquipStat(activateAxe(f),'m652-axe').session,'m652-axe').session;
 assert.throws(()=>resolveAxeOfDespairGraveTrigger(released,'m652-axe',opposing),/equipe proprietária/);
});

test('Axe of Despair trigger is idempotent and cannot recycle the same physical copy twice',()=>{
 const f=setup(),released=releaseEquipStat(resolveEquipStat(activateAxe(f),'m652-axe').session,'m652-axe').session;
 const first=resolveAxeOfDespairGraveTrigger(released,'m652-axe',undefined);
 const second=resolveAxeOfDespairGraveTrigger(first.session,'m652-axe',undefined);
 assert.equal(second.result.status,'duplicate');
});

test('Black Pendant inflicts 500 LP damage once when sent from the field to the Graveyard',()=>{
 const f=setup(),before=inventory(f.duel);
 const active=resolveEquipStat(activatePendant(f),'m652-pendant').session;
 const released=releaseEquipStat(active,'m652-pendant').session;
 const initial=released.duel.core.players[1-f.team].lp;
 const first=resolveBlackPendantGraveTrigger(released,'m652-pendant');
 assert.equal(first.result.applied,true);
 assert.equal(first.result.damage,500);
 assert.equal(first.session.duel.core.players[1-f.team].lp,initial-500);
 const second=resolveBlackPendantGraveTrigger(first.session,'m652-pendant');
 assert.equal(second.result.status,'duplicate');
 assert.equal(second.result.damage,0);
 assertConserved(first.session.duel,before);
});

test('Black Pendant also triggers after a negated activation was sent from the field to the Graveyard',()=>{
 const f=setup(),pending=activatePendant(f);
 pending.duel.core.chain[pending.duel.core.chain.length-1].negated=true;
 const negated=resolveEquipStat(pending,'m652-pendant').session;
 const trigger=resolveBlackPendantGraveTrigger(negated,'m652-pendant');
 assert.equal(trigger.result.damage,500);
 assert.equal(trigger.result.applied,true);
});

test('Black Pendant damage that reaches zero LP ends the duel for the owner team',()=>{
 const f=setup(),active=resolveEquipStat(activatePendant(f),'m652-pendant').session;
 const released=releaseEquipStat(active,'m652-pendant').session;
 released.duel.core.players[1-f.team].lp=300;
 const result=resolveBlackPendantGraveTrigger(released,'m652-pendant');
 assert.equal(result.result.damage,300);
 assert.equal(result.result.winner,f.team);
 assert.equal(result.session.duel.core.phase,'finished');
 assert.equal(result.session.duel.core.winner,'tag-team-'+f.team);
});

test('a set Equip controlled by a team member returns to the physical owner reserve Deck',()=>{
 const f=setup({sourceOwnerSeat:partnerSeat(0),sourceInBackrow:true,setTurn:0});
 const active=resolveEquipStat(activateAxe(f),'m652-axe').session;
 const released=releaseEquipStat(active,'m652-axe').session;
 const tributeUid=placeMonster(released.duel,released.duel.active[f.team],f.team,TARGET_B,true);
 const before=privateZone(released.duel,f.ownerSeat,'deck').length;
 const returned=resolveAxeOfDespairGraveTrigger(released,'m652-axe',tributeUid);
 assert.equal(returned.result.status,'returned-to-deck');
 assert.equal(privateZone(returned.session.duel,f.ownerSeat,'deck').length,before+1);
 assert.equal(privateZone(returned.session.duel,f.ownerSeat,'deck')[0].uid,f.sourceUid);
 assert.ok(graveHas(returned.session.duel,f.team,tributeUid));
});

test('the Field Zone remains separate from the three shared Spell/Trap Zones',()=>{
 const f=setup();
 assert.ok(FIELD,'fixture has a certified Field Spell');
 const fieldCard=placeSpell(f.duel,f.activeSeat,FIELD);
 const hand=privateZone(f.duel,f.activeSeat,'hand'),index=hand.findIndex(card=>card.uid===fieldCard);
 const [card]=hand.splice(index,1);
 f.duel.core.players[f.team].field={...card,faceUp:true,setTurn:f.duel.core.turn};
 assert.equal(axeOfDespairActions(f.duel,lookup,{cardId:SOURCE_FIXTURE}).length,1);
 assertEquipStatRules(f.duel);
});

test('hand overflow remains an End Phase responsibility and the adapter never discards',()=>{
 const f=setup(),pending=activateAxe(f),player=privateZone(pending.duel,f.activeSeat,'hand');
 while(player.hand.length<7){const card=player.deck.shift();assert.ok(card);player.hand.push(card);}
 const before=player.hand.map(card=>card.uid);
 const result=resolveEquipStat(pending,'m652-axe');
 assert.deepEqual(privateZone(result.session.duel,f.activeSeat,'hand').map(card=>card.uid),before);
 assert.equal(rulesFor(result.session.duel.core).handLimit,6);
 assert.equal(rulesFor(result.session.duel.core).handCheck,'end');
});

test('activation and resolution preserve the persisted random stream and do not mutate the input',()=>{
 const f=setup(),pending=activateAxe(f),counter=pending.duel.core.random.counter;
 const original=JSON.stringify(pending);
 const resolved=resolveEquipStat(pending,'m652-axe');
 assert.equal(JSON.stringify(pending),original);
 assert.equal(resolved.session.duel.core.random.counter,counter);
});

test('the adapter never changes physical ownership when a teammate controls the Equip',()=>{
 const f=setup({sourceOwnerSeat:partnerSeat(0),sourceInBackrow:true,setTurn:0});
 const before=inventory(f.duel),active=resolveEquipStat(activateAxe(f),'m652-axe').session;
 const released=releaseEquipStat(active,'m652-axe').session;
 assert.ok(graveHas(released.duel,f.team,f.sourceUid));
 assertConserved(released.duel,before);
});

test('the classic rules profile remains deck 20–30, hand 6 at End Phase, zones 3+3 and Extra 5',()=>{
 const f=setup(),rules=rulesFor(f.duel.core);
 assert.equal(rules.mainDeckMin,20);assert.equal(rules.mainDeckMax,30);
 assert.equal(rules.handLimit,6);assert.equal(rules.handCheck,'end');
 assert.equal(rules.monsterZones,3);assert.equal(rules.spellTrapZones,3);
 assert.equal(rules.extraDeckMax,5);
 assertEquipStatRules(f.duel);
});
