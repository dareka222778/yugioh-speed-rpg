'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createTagDuel,tagInventory}=require('../dist/tagDuel');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');
const {bindTarget,synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
 DD_SCOUT_PLANE_ID,DIMENSION_FUSION_ID,RETURN_FROM_DIFFERENT_DIMENSION_ID,
 createExactBanishedReturnLookups,createBanishedReturnLedger,
 recordBanishTransition,resolveDDScoutPlaneEndPhase,resolveDimensionFusion,
 resolveReturnFromDifferentDimension,resolveReturnFromDifferentDimensionEndPhase
}=require('../dist/banishedZoneReturnTagAdapter');

const enabled=getEnabledCardIds();
const monsters=enabled.filter(id=>getDuelCard(id)?.kind==='monster'&&!getDuelCard(id)?.fusion&&getDuelCard(id)?.monsterType!=='ritual');
const scoutPlaceholder=monsters[0],summonA=monsters[1],summonB=monsters[2],summonC=monsters[3];
const filler=monsters.slice(4,15);
const spells=enabled.filter(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field);
const traps=enabled.filter(id=>getDuelCard(id)?.kind==='trap');
const fusionPlaceholder=enabled.find(id=>getDuelCard(id)?.fusion);
assert.ok(scoutPlaceholder&&summonA&&summonB&&summonC&&filler.length===11&&spells.length>=2&&traps.length>=3&&fusionPlaceholder);
const deck=[scoutPlaceholder,summonA,summonB,summonC,...filler,spells[0],spells[1],traps[0],traps[1],traps[2]];
assert.equal(deck.length,20);assert.equal(new Set(deck).size,20);
const lookups={
 'dd-scout-plane':id=>id===scoutPlaceholder,
 'dimension-fusion':id=>id===DIMENSION_FUSION_ID,
 'return-from-different-dimension':id=>id===RETURN_FROM_DIFFERENT_DIMENSION_ID
};
function base(seed='m701-banished-return',first=0){
 const players=[
  {id:'p0',name:'Azul A',cards:[...deck],extra:[fusionPlaceholder]},
  {id:'p1',name:'Vermelho A',cards:[...deck],extra:[fusionPlaceholder]},
  {id:'p2',name:'Azul B',cards:[...deck],extra:[fusionPlaceholder]},
  {id:'p3',name:'Vermelho B',cards:[...deck],extra:[fusionPlaceholder]}
 ];
 return createTagDuel(players,{seed,first,classic:true});
}
function holder(duel,seat){
 const team=seat%2,active=duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
 if(!active)throw new Error('Assento físico indisponível: '+seat);
 return active;
}
function take(duel,seat,id,zone='deck'){
 const held=holder(duel,seat),pool=zone==='deck'?held.deck:zone==='hand'?held.hand:zone==='extra'?held.extra:held.grave;
 if(!pool)throw new Error('Pilha física ausente: '+zone);
 const index=pool.findIndex(card=>card.id===id);assert.ok(index>=0,'Carta física indisponível: '+seat+'/'+zone+'/'+id);
 return pool[index];
}
function inventory(duel){
 return tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]).sort((a,b)=>a[0].localeCompare(b[0]));
}
function ownerTeam(uid){return Number(/^m([0-3]):/.exec(uid)[1])%2;}
function banishFromZone(duel,seat,id,zone='deck',{eventId='banish-event',sequence=1,reason='effect'}={}){
 let pool,controllerTeam=seat%2;
 if(zone==='monsters'){
  controllerTeam=duel.core.players.findIndex(player=>player.monsters.some(card=>card.id===id&&ownerTeam(card.uid)===seat%2));
  assert.ok(controllerTeam>=0);pool=duel.core.players[controllerTeam].monsters;
 }else if(zone==='grave')pool=duel.core.players[seat%2].grave;
 else if(zone==='banished')pool=duel.core.players[seat%2].banished;
 else pool=holder(duel,seat)[zone];
 assert.ok(pool,'Pilha não suportada: '+zone);
 const index=pool.findIndex(card=>card.id===id);assert.ok(index>=0);
 const card=pool[index],binding=bindTarget(duel.core,card.uid);assert.ok(binding);
 pool.splice(index,1);
 const team=ownerTeam(card.uid);
 (duel.core.players[team].banished??=[]).push({uid:card.uid,id:card.id,...card.properlySummoned?{properlySummoned:true}:{}});
 synchronizeCardLifetimes(duel.core);
 const event={kind:'ioc-banish-transition',eventId,sequence,turn:duel.core.turn,cardUid:card.uid,
  fromZone:zone,toZone:'banished',binding,reason};
 return {state:duel,event,card,controllerTeam};
}
function addMonster(duel,seat,controllerTeam,id){
 const card=take(duel,seat,id,'deck'),team=seat%2;
 const monster={...card,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,
  attacked:0,atkBoost:0,defBoost:0,owner:team};
 duel.core.players[controllerTeam].monsters.push(monster);synchronizeCardLifetimes(duel.core);return monster;
}
function moveMonsterToGrave(duel,uid){
 const controller=duel.core.players.findIndex(player=>player.monsters.some(card=>card.uid===uid));
 assert.ok(controller>=0);
 const index=duel.core.players[controller].monsters.findIndex(card=>card.uid===uid);
 const [monster]=duel.core.players[controller].monsters.splice(index,1),team=ownerTeam(uid);
 duel.core.players[team].grave.push({uid:monster.uid,id:monster.id,...monster.properlySummoned?{properlySummoned:true}:{}});
 synchronizeCardLifetimes(duel.core);
}
function moveMonsterToOtherTeam(duel,uid){
 const from=duel.core.players.findIndex(player=>player.monsters.some(card=>card.uid===uid));
 assert.ok(from>=0);const index=duel.core.players[from].monsters.findIndex(card=>card.uid===uid);
 const [monster]=duel.core.players[from].monsters.splice(index,1);
 duel.core.players[1-from].monsters.push(monster);synchronizeCardLifetimes(duel.core);
}
function endPhase(duel){duel.core.phase='main';duel.core.turnEnding=true;return duel;}
function turnWindow(duel){return {turn:duel.core.turn,turnTeam:duel.core.current,turnSeat:duel.cursor};}
function scoutWindow(duel,eventId,team,effectNegated=false){
 return {kind:'dd-scout-plane-end-phase',eventId,...turnWindow(duel),
  resolvingTeam:team,resolvingSeat:duel.active[team],effectNegated};
}
function fusionWindow(duel,selectedByTeam,effectNegated=false){
 return {kind:'dimension-fusion-resolution',cardId:DIMENSION_FUSION_ID,...turnWindow(duel),
  activatingTeam:duel.core.current,activatingSeat:duel.cursor,selectedByTeam,effectNegated};
}
function returnWindow(duel,team,eventId,selectedUids,effectNegated=false){
 return {kind:'return-different-dimension-resolution',cardId:RETURN_FROM_DIFFERENT_DIMENSION_ID,eventId,
  ...turnWindow(duel),activatingTeam:team,activatingSeat:duel.active[team],selectedUids,effectNegated};
}
function endWindow(duel){return {kind:'return-different-dimension-end-phase',...turnWindow(duel)};}
function addBanished(duel,seat,id,options={}){
 return banishFromZone(duel,seat,id,'deck',options);
}
function recordScout(duel,eventId='scout-event',sequence=1){
 const moved=banishFromZone(duel,0,scoutPlaceholder,'deck',{eventId,sequence});
 const recorded=recordBanishTransition(moved.state,createBanishedReturnLedger(),moved.event,lookups);
 return {...moved,...recorded};
}

test('candidate IDs and Konami CIDs are exact and remain outside the enabled catalog',()=>{
 assert.equal(DD_SCOUT_PLANE_ID,'03773196');assert.equal(DIMENSION_FUSION_ID,'23557835');
 assert.equal(RETURN_FROM_DIFFERENT_DIMENSION_ID,'27174286');
 const exact=createExactBanishedReturnLookups();
 assert.equal(exact['dd-scout-plane'](DD_SCOUT_PLANE_ID),true);
 assert.equal(exact['dimension-fusion'](DIMENSION_FUSION_ID),true);
 assert.equal(exact['return-from-different-dimension'](RETURN_FROM_DIFFERENT_DIMENSION_ID),true);
 for(const id of [DD_SCOUT_PLANE_ID,DIMENSION_FUSION_ID,RETURN_FROM_DIFFERENT_DIMENSION_ID])assert.equal(enabled.includes(id),false);
});

test('D.D. Scout Plane schedules only after a physical banish transition this turn',()=>{
 const duel=base(),moved=recordScout(duel,'scout-schedule',1);
 assert.equal(moved.status,'scheduled');assert.equal(moved.ledger.pendingScout.length,1);
 assert.equal(moved.ledger.pendingScout[0].ownerTeam,0);
 assert.equal(moved.ledger.pendingScout[0].banishedEpoch,moved.event.binding.epoch+1);
});

test('D.D. Scout Plane returns face-up Attack Position to its owner team at End Phase',()=>{
 const duel=base(),moved=recordScout(duel,'scout-return',1),before=inventory(moved.state);
 endPhase(moved.state);
 const resolved=resolveDDScoutPlaneEndPhase(moved.state,moved.ledger,scoutWindow(moved.state,'scout-return',0));
 assert.equal(resolved.status,'summoned');assert.equal(resolved.state.core.players[0].monsters.length,1);
 const monster=resolved.state.core.players[0].monsters[0];
 assert.equal(monster.position,'atk');assert.equal(monster.faceUp,true);assert.equal(monster.owner,0);
 assert.deepEqual(inventory(resolved.state),before);
});

test('D.D. Scout Plane does not return if it left the banished pile before End Phase',()=>{
 const duel=base(),moved=recordScout(duel,'scout-left',1);
 const card=moved.state.core.players[0].banished.pop();moved.state.core.players[0].grave.push({uid:card.uid,id:card.id});
 synchronizeCardLifetimes(moved.state.core);endPhase(moved.state);
 const resolved=resolveDDScoutPlaneEndPhase(moved.state,moved.ledger,scoutWindow(moved.state,'scout-left',0));
 assert.equal(resolved.status,'no-target');assert.equal(resolved.state.core.players[0].monsters.length,0);
});

test('D.D. Scout Plane cannot return into a full three-Monster-Zone team',()=>{
 const duel=base();
 for(const id of [summonA,summonB,summonC])addMonster(duel,0,0,id);
 const moved=recordScout(duel,'scout-full',1);endPhase(moved.state);
 const resolved=resolveDDScoutPlaneEndPhase(moved.state,moved.ledger,scoutWindow(moved.state,'scout-full',0));
 assert.equal(resolved.status,'no-target');assert.equal(resolved.state.core.players[0].monsters.length,3);
});

test('D.D. Scout Plane effect negation consumes its once-per-turn activation',()=>{
 const moved=recordScout(base(),'scout-negated',1);endPhase(moved.state);
 const negated=resolveDDScoutPlaneEndPhase(moved.state,moved.ledger,scoutWindow(moved.state,'scout-negated',0,true));
 assert.equal(negated.status,'effect-negated');
 const replay=resolveDDScoutPlaneEndPhase(negated.state,negated.ledger,scoutWindow(negated.state,'scout-negated',0));
 assert.equal(replay.status,'no-target');
 assert.equal(replay.ledger.scoutUsed.length,1);
});

test('D.D. Scout Plane rejects a trigger window controlled by the opposing team',()=>{
 const moved=recordScout(base(),'scout-owner-gate',1);endPhase(moved.state);
 assert.throws(()=>resolveDDScoutPlaneEndPhase(moved.state,moved.ledger,{
  ...scoutWindow(moved.state,'scout-owner-gate',0),resolvingTeam:1,resolvingSeat:1
 }),/time proprietário/i);
});

test('D.D. Scout Plane banished by Return from the Different Dimension can trigger later in the same End Phase',()=>{
 const duel=base(),moved=addBanished(duel,0,scoutPlaceholder);
 const activated=resolveReturnFromDifferentDimension(moved.state,createBanishedReturnLedger(),
  returnWindow(moved.state,0,'return-scout',[moved.card.uid]));
 assert.equal(activated.status,'resolved');endPhase(activated.state);
 const returned=resolveReturnFromDifferentDimensionEndPhase(activated.state,activated.ledger,endWindow(activated.state),lookups);
 assert.deepEqual(returned.banishedUids,[moved.card.uid]);assert.equal(returned.ledger.pendingScout.length,1);
 const pending=returned.ledger.pendingScout[0];
 const scout=resolveDDScoutPlaneEndPhase(returned.state,returned.ledger,scoutWindow(returned.state,pending.eventId,0));
 assert.equal(scout.status,'summoned');assert.equal(scout.state.core.players[0].monsters.length,1);
});

test('Dimension Fusion pays 2000 shared LP and returns the maximum from both teams',()=>{
 const duel=base(),a=addBanished(duel,0,summonA),b=addBanished(duel,1,summonB),before=inventory(duel);
 const result=resolveDimensionFusion(duel,createBanishedReturnLedger(),fusionWindow(duel,[[a.card.uid],[b.card.uid]]));
 assert.equal(result.status,'resolved');assert.equal(result.state.core.players[0].lp,2000);
 assert.equal(result.state.core.players[1].lp,4000);assert.equal(result.state.core.players[0].monsters.length,1);
 assert.equal(result.state.core.players[1].monsters.length,1);
 assert.deepEqual(result.summonedUids,[a.card.uid,b.card.uid]);assert.deepEqual(inventory(result.state),before);
 assert.deepEqual(result.changedTeams,[0,1]);
});

test('Dimension Fusion respects the three-zone cap and summons as many as possible',()=>{
 const duel=base(),a=addBanished(duel,0,summonA),b=addBanished(duel,0,summonB),c=addBanished(duel,1,summonC);
 for(const id of [filler[0],filler[1]])addMonster(duel,0,0,id);
 const result=resolveDimensionFusion(duel,createBanishedReturnLedger(),fusionWindow(duel,[[a.card.uid],[c.card.uid]]));
 assert.equal(result.status,'resolved');assert.equal(result.state.core.players[0].monsters.length,3);
 assert.equal(result.state.core.players[0].banished.length,1);assert.equal(result.state.core.players[1].monsters.length,1);
 assert.deepEqual(result.summonedUids,[a.card.uid,c.card.uid]);
});

test('Dimension Fusion allows the other team to summon when one side has no free zone',()=>{
 const duel=base(),a=addBanished(duel,0,summonA),b=addBanished(duel,1,summonB);
 for(const id of [filler[0],filler[1],filler[2]])addMonster(duel,0,0,id);
 const result=resolveDimensionFusion(duel,createBanishedReturnLedger(),fusionWindow(duel,[[],[b.card.uid]]));
 assert.equal(result.status,'resolved');assert.equal(result.state.core.players[0].monsters.length,3);
 assert.equal(result.state.core.players[1].monsters.length,1);assert.deepEqual(result.summonedUids,[b.card.uid]);
});

test('Dimension Fusion effect negation still pays its 2000 LP cost',()=>{
 const duel=base(),a=addBanished(duel,0,summonA);
 const result=resolveDimensionFusion(duel,createBanishedReturnLedger(),fusionWindow(duel,[[],[]],true));
 assert.equal(result.status,'effect-negated');assert.equal(result.state.core.players[0].lp,2000);
 assert.equal(result.state.core.players[0].monsters.length,0);assert.equal(result.state.core.players[0].banished.length,1);
});

test('Dimension Fusion refuses insufficient LP without changing state',()=>{
 const duel=base();duel.core.players[0].lp=1999;addBanished(duel,0,summonA);
 const before=inventory(duel),result=resolveDimensionFusion(duel,createBanishedReturnLedger(),fusionWindow(duel,[[duel.core.players[0].banished[0].uid],[]]));
 assert.equal(result.status,'insufficient-lp');assert.equal(result.state.core.players[0].lp,1999);
 assert.deepEqual(inventory(result.state),before);
});

test('Dimension Fusion payment to zero ends the duel before any summon',()=>{
 const duel=base();duel.core.players[0].lp=2000;const a=addBanished(duel,0,summonA);
 const result=resolveDimensionFusion(duel,createBanishedReturnLedger(),fusionWindow(duel,[[a.card.uid],[]]));
 assert.equal(result.status,'lethal-cost');assert.equal(result.state.core.phase,'finished');
 assert.equal(result.state.core.winner,result.state.core.players[1].id);
 assert.equal(result.state.core.players[0].monsters.length,0);
});

test('Dimension Fusion excludes a Fusion monster that was never properly Summoned',()=>{
 const duel=base(),card=take(duel,0,fusionPlaceholder,'extra');
 const binding=bindTarget(duel.core,card.uid),team=0;
 duel.core.players[team].banished.push({uid:card.uid,id:card.id});
 synchronizeCardLifetimes(duel.core);
 const result=resolveDimensionFusion(duel,createBanishedReturnLedger(),fusionWindow(duel,[[],[]]));
 assert.equal(result.status,'no-target');assert.equal(result.state.core.players[0].lp,4000);
});

test('Return from the Different Dimension pays half LP rounded up and summons only its team',()=>{
 const duel=base();duel.core.players[0].lp=5001;
 const a=addBanished(duel,0,summonA),b=addBanished(duel,1,summonB),before=inventory(duel);
 const result=resolveReturnFromDifferentDimension(duel,createBanishedReturnLedger(),
  returnWindow(duel,0,'return-half',[a.card.uid]));
 assert.equal(result.status,'resolved');assert.equal(result.state.core.players[0].lp,2500);
 assert.equal(result.state.core.players[1].lp,4000);assert.equal(result.state.core.players[0].monsters.length,1);
 assert.equal(result.state.core.players[1].monsters.length,0);assert.equal(result.state.core.players[1].banished.length,1);
 assert.equal(result.ledger.returnAtEnd.length,1);assert.deepEqual(inventory(result.state),before);
});

test('Return from the Different Dimension can activate for its team during the opponent turn',()=>{
 const duel=base();duel.core.current=1;duel.cursor=1;duel.active[1]=1;duel.core.teamRotation.cursor=1;duel.core.teamRotation.active[1]=1;
 const a=addBanished(duel,0,summonA);
 const result=resolveReturnFromDifferentDimension(duel,createBanishedReturnLedger(),
  returnWindow(duel,0,'return-opponent-turn',[a.card.uid]));
 assert.equal(result.status,'resolved');assert.equal(result.state.core.players[0].monsters.length,1);
 assert.equal(result.state.core.players[0].lp,2000);
});

test('Return from the Different Dimension effect negation still pays half LP and creates no delayed banish',()=>{
 const duel=base(),a=addBanished(duel,0,summonA);
 const result=resolveReturnFromDifferentDimension(duel,createBanishedReturnLedger(),
  returnWindow(duel,0,'return-negated',[],true));
 assert.equal(result.status,'effect-negated');assert.equal(result.state.core.players[0].lp,2000);
 assert.equal(result.state.core.players[0].monsters.length,0);assert.equal(result.ledger.returnAtEnd.length,0);
});

test('Return from the Different Dimension payment to zero ends the duel before resolving',()=>{
 const duel=base();duel.core.players[0].lp=1;addBanished(duel,0,summonA);
 const result=resolveReturnFromDifferentDimension(duel,createBanishedReturnLedger(),
  returnWindow(duel,0,'return-lethal',[],true));
 assert.equal(result.status,'lethal-cost');assert.equal(result.state.core.phase,'finished');
 assert.equal(result.state.core.players[0].lp,0);
});

test('Return from the Different Dimension End Phase banishes only tracked monsters still on the field',()=>{
 const duel=base(),a=addBanished(duel,0,summonA),b=addBanished(duel,0,summonB);
 const result=resolveReturnFromDifferentDimension(duel,createBanishedReturnLedger(),
  returnWindow(duel,0,'return-two',[a.card.uid,b.card.uid]));
 moveMonsterToGrave(result.state,b.card.uid);endPhase(result.state);
 const ended=resolveReturnFromDifferentDimensionEndPhase(result.state,result.ledger,endWindow(result.state),lookups);
 assert.deepEqual(ended.banishedUids,[a.card.uid]);
 assert.equal(ended.state.core.players[0].banished.some(card=>card.uid===a.card.uid),true);
 assert.equal(ended.state.core.players[0].grave.some(card=>card.uid===b.card.uid),true);
});

test('Return from the Different Dimension does not banish a monster that left and re-entered',()=>{
 const duel=base(),a=addBanished(duel,0,summonA);
 const result=resolveReturnFromDifferentDimension(duel,createBanishedReturnLedger(),
  returnWindow(duel,0,'return-reentry',[a.card.uid]));
 moveMonsterToGrave(result.state,a.card.uid);
 const grave=result.state.core.players[0].grave.find(card=>card.uid===a.card.uid);
 result.state.core.players[0].grave.splice(result.state.core.players[0].grave.indexOf(grave),1);
 result.state.core.players[0].monsters.push({...grave,owner:0,position:'atk',faceUp:true,entered:result.state.core.turn,changed:result.state.core.turn,attacked:0,atkBoost:0,defBoost:0});
 synchronizeCardLifetimes(result.state.core);endPhase(result.state);
 const ended=resolveReturnFromDifferentDimensionEndPhase(result.state,result.ledger,endWindow(result.state),lookups);
 assert.deepEqual(ended.banishedUids,[]);assert.equal(ended.state.core.players[0].monsters.length,1);
});

test('Return from the Different Dimension follows a tracked monster after control changes',()=>{
 const duel=base(),a=addBanished(duel,0,summonA);
 const result=resolveReturnFromDifferentDimension(duel,createBanishedReturnLedger(),
  returnWindow(duel,0,'return-control',[a.card.uid]));
 moveMonsterToOtherTeam(result.state,a.card.uid);endPhase(result.state);
 const ended=resolveReturnFromDifferentDimensionEndPhase(result.state,result.ledger,endWindow(result.state),lookups);
 assert.deepEqual(ended.banishedUids,[a.card.uid]);
 assert.equal(ended.state.core.players[0].banished.some(card=>card.uid===a.card.uid),true);
 assert.equal(ended.state.core.players[1].monsters.some(card=>card.uid===a.card.uid),false);
});

test('Return from the Different Dimension End Phase keeps the hand private and does not discard early',()=>{
 const duel=base(),a=addBanished(duel,0,summonA);
 const result=resolveReturnFromDifferentDimension(duel,createBanishedReturnLedger(),
  returnWindow(duel,0,'return-hand-limit',[a.card.uid]));
 const handBefore=result.state.core.players[0].hand.map(card=>card.uid).sort();
 while(result.state.core.players[0].hand.length<7)result.state.core.players[0].hand.push(result.state.core.players[0].deck.pop());
 endPhase(result.state);
 const ended=resolveReturnFromDifferentDimensionEndPhase(result.state,result.ledger,endWindow(result.state),lookups);
 assert.deepEqual(ended.state.core.players[0].hand.map(card=>card.uid).sort(),handBefore.concat([]).sort().concat(
  result.state.core.players[0].hand.slice(handBefore.length).map(card=>card.uid).sort()).sort());
 assert.equal(ended.state.core.players[0].hand.length,7);
});

test('Return from the Different Dimension refuses to resolve when no banished monster can fit',()=>{
 const duel=base(),a=addBanished(duel,0,summonA);
 for(const id of [filler[0],filler[1],filler[2]])addMonster(duel,0,0,id);
 const result=resolveReturnFromDifferentDimension(duel,createBanishedReturnLedger(),
  returnWindow(duel,0,'return-no-space',[a.card.uid]));
 assert.equal(result.status,'no-target');assert.equal(result.state.core.players[0].lp,4000);
 assert.equal(result.state.core.players[0].banished.length,1);
});

test('Return from the Different Dimension rejects a selection from the opponent banished pile',()=>{
 const duel=base(),a=addBanished(duel,1,summonA);
 assert.throws(()=>resolveReturnFromDifferentDimension(duel,createBanishedReturnLedger(),
  returnWindow(duel,0,'return-wrong-team',[a.card.uid])),/outra equipe/i);
});

test('End Phase delayed banishment is idempotent and preserves inventory',()=>{
 const duel=base(),a=addBanished(duel,0,summonA),before=inventory(duel);
 const result=resolveReturnFromDifferentDimension(duel,createBanishedReturnLedger(),
  returnWindow(duel,0,'return-idempotent',[a.card.uid]));
 endPhase(result.state);
 const first=resolveReturnFromDifferentDimensionEndPhase(result.state,result.ledger,endWindow(result.state),lookups);
 const replay=resolveReturnFromDifferentDimensionEndPhase(first.state,first.ledger,endWindow(first.state),lookups);
 assert.deepEqual(first.banishedUids,[a.card.uid]);assert.equal(replay.status,'no-target');
 assert.deepEqual(inventory(first.state),before);
});

test('D.D. Scout Plane duplicate event IDs cannot change their fingerprint',()=>{
 const duel=base(),moved=banishFromZone(duel,0,scoutPlaceholder,'deck',{eventId:'scout-fingerprint',sequence:1});
 const ledger=createBanishedReturnLedger();
 const first=recordBanishTransition(moved.state,ledger,moved.event,lookups);
 const duplicate=recordBanishTransition(moved.state,first.ledger,moved.event,lookups);
 assert.equal(duplicate.status,'duplicate');
 assert.throws(()=>recordBanishTransition(moved.state,first.ledger,{...moved.event,reason:'battle'},lookups),/Replay divergente/i);
});

test('banished return ledger refuses malformed and over-limit processed events',()=>{
 const duel=base();
 const processed=Array.from({length:4096},(_,i)=>({
  eventId:'done-'+i,fingerprint:'a'.repeat(64),sequence:i+1,status:'no-trigger'
 }));
 const ledger={version:1,lastSequence:4096,pendingScout:[{
  eventId:'pending-cap',fingerprint:'b'.repeat(64),sequence:4097,turn:duel.core.turn,
  cardUid:'m0:synthetic',ownerTeam:0,banishedEpoch:1
 }],processed,scoutUsed:[],returnAtEnd:[]};
 endPhase(duel);
 assert.throws(()=>resolveDDScoutPlaneEndPhase(duel,ledger,scoutWindow(duel,'pending-cap',0)),/4096/i);
});
