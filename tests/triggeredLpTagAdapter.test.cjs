'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
 BACKFIRE_ID,BALLOON_LIZARD_ID,createBackfireLedger,createBalloonLizardLedger,
 resolveBackfireEvent,recordBalloonLizardStandby,reconcileBalloonLizardLedger,resolveBalloonLizardDestruction
}=require('../dist/triggeredLpTagAdapter');

function monster(uid,id,faceUp=true,extra={}){return {uid,id,faceUp,position:'atk',entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0,...extra};}
function backrow(uid,id,faceUp=true){return {uid,id,faceUp,setTurn:0};}
function player(team,{monsters=[],backrow:rows=[],grave=[],banished=[],deck=[],hand=[],extra=[]}={}){
 return {id:'tag-team-'+team,name:team===0?'Equipe Azul':'Equipe Vermelha',lp:8000,deck,hand,monsters,backrow:rows,grave,extra,banished,field:null,summoned:false};
}
function state({turn=1,current=0,team0={},team1={}}={}){
 const active=[0,1],reserves={'2':{deck:[],hand:[],extra:[]},'3':{deck:[],hand:[],extra:[]}};
 const core={version:1,turn,current,phase:'main',resume:'main',priority:current,passes:0,pending:{kind:'none'},chain:[],players:[player(0,team0),player(1,team1)],teamRotation:{version:1,cursor:0,active,reserves},winner:null,reason:'',log:[]};
 return {version:1,mode:'tag-classic',members:[{id:'p0',name:'A',team:0},{id:'p1',name:'B',team:1},{id:'p2',name:'C',team:0},{id:'p3',name:'D',team:1}],active,cursor:0,reserves,core};
}
const fire=(uid,team=0,faceUp=true,destination='grave')=>({uid,id:'fire-monster-'+uid,controllerTeam:team,attribute:'FIRE',wasFaceUp:faceUp,from:'monster-zone',destination});
const event=(eventId,destroyed,cause='battle',negatedSourceUids=[])=>({eventId,cause,destroyed,negatedSourceUids});
const standby=(turn,team,sourceUid)=>({kind:'standby',phase:'standby',turn,team,sourceUid});
function balloonState(turn=1,team=0,faceUp=true){
 return state({turn,current:team,team0:{monsters:team===0?[monster('m0:balloon',BALLOON_LIZARD_ID,faceUp)]:[],grave:[]},team1:{monsters:team===1?[monster('m1:balloon',BALLOON_LIZARD_ID,faceUp)]:[],grave:[]}});
}
function destroyedBalloonState(team=0){
 const uid='m'+team+':balloon';
 return state({team0:{grave:team===0?[{uid,id:BALLOON_LIZARD_ID}]:[]},team1:{grave:team===1?[{uid,id:BALLOON_LIZARD_ID}]:[],monsters:[monster('m1:destroyer','00000001')]}});
}
function destroyEvent(team=1,overrides={}){
 return {eventId:'destroy-1',sourceUid:'m0:balloon',destroyedCardId:BALLOON_LIZARD_ID,destroyed:true,destination:'grave',destroyerUid:'m1:destroyer',destroyerTeam:team,effectNegatedAtResolution:false,...overrides};
}

test('Backfire triggers 500 when a face-up FIRE monster is destroyed and sent to GY',()=>{
 const s=state({team0:{backrow:[backrow('m0:backfire',BACKFIRE_ID)]}});
 const r=resolveBackfireEvent(s,createBackfireLedger(),0,event('e1',[fire('m0:fire')]));
 assert.equal(r.packets.length,1);assert.equal(r.packets[0].amount,500);assert.equal(r.packets[0].targetTeam,1);
});
test('simultaneous FIRE monsters produce one 500 trigger per Backfire copy, not per monster',()=>{
 const s=state({team0:{backrow:[backrow('m0:b1',BACKFIRE_ID),backrow('m2:b2',BACKFIRE_ID)]}});
 const r=resolveBackfireEvent(s,createBackfireLedger(),0,event('e2',[fire('m0:f1'),fire('m2:f2')]));
 assert.deepEqual(r.packets.map(p=>p.amount),[500,500]);assert.deepEqual(r.packets.map(p=>p.destroyedUids.length),[2,2]);
});
test('Backfire ignores face-down FIRE monsters',()=>{
 const s=state({team0:{backrow:[backrow('m0:b',BACKFIRE_ID)]}});
 assert.equal(resolveBackfireEvent(s,createBackfireLedger(),0,event('e3',[fire('m0:f',0,false)])).packets.length,0);
});
test('Backfire ignores non-FIRE monsters',()=>{
 const s=state({team0:{backrow:[backrow('m0:b',BACKFIRE_ID)]}});
 const row={...fire('m0:w'),attribute:'WATER'};
 assert.equal(resolveBackfireEvent(s,createBackfireLedger(),0,event('e4',[row])).packets.length,0);
});
test('Backfire requires the destroyed monster to reach the GY',()=>{
 const s=state({team0:{backrow:[backrow('m0:b',BACKFIRE_ID)]}});
 assert.equal(resolveBackfireEvent(s,createBackfireLedger(),0,event('e5',[fire('m0:f',0,true,'banished')])).packets.length,0);
});
test('Backfire accepts both battle and effect destruction events',()=>{
 const s=state({team0:{backrow:[backrow('m0:b',BACKFIRE_ID)]}});
 assert.equal(resolveBackfireEvent(s,createBackfireLedger(),0,event('e6',[fire('m0:f')],'battle')).packets.length,1);
 assert.equal(resolveBackfireEvent(s,createBackfireLedger(),0,event('e7',[fire('m0:f2')],'effect')).packets.length,1);
});
test('Backfire does not trigger while its own Trap is face-down',()=>{
 const s=state({team0:{backrow:[backrow('m0:b',BACKFIRE_ID,false)]}});
 assert.equal(resolveBackfireEvent(s,createBackfireLedger(),0,event('e8',[fire('m0:f')])).packets.length,0);
});
test('a negated Backfire copy produces no damage while another active copy still resolves',()=>{
 const s=state({team0:{backrow:[backrow('m0:b1',BACKFIRE_ID),backrow('m2:b2',BACKFIRE_ID)]}});
 const r=resolveBackfireEvent(s,createBackfireLedger(),0,event('e9',[fire('m0:f')],'effect',['m0:b1']));
 assert.deepEqual(r.packets.map(p=>p.sourceUid),['m2:b2']);
});
test('Backfire destruction event is idempotent by event ID',()=>{
 const s=state({team0:{backrow:[backrow('m0:b',BACKFIRE_ID)]}});
 const first=resolveBackfireEvent(s,createBackfireLedger(),0,event('e10',[fire('m0:f')]));
 const second=resolveBackfireEvent(s,first.ledger,0,event('e10',[fire('m0:f')]));
 assert.equal(first.packets.length,1);assert.equal(second.packets.length,0);
});
test('Backfire rejects duplicate destroyed UIDs and invalid team snapshots',()=>{
 const s=state({team0:{backrow:[backrow('m0:b',BACKFIRE_ID)]}});
 assert.throws(()=>resolveBackfireEvent(s,createBackfireLedger(),0,event('e11',[fire('m0:f'),fire('m0:f')])),/duplicados/);
 assert.throws(()=>resolveBackfireEvent(s,createBackfireLedger(),0,event('e12',[{...fire('m0:f'),controllerTeam:2}])),/Equipe/);
});
test('Balloon Lizard gains one counter during its controller team Standby Phase',()=>{
 const s=balloonState(2,0);const r=recordBalloonLizardStandby(s,createBalloonLizardLedger(),standby(2,0,'m0:balloon'));
 assert.equal(r.status,'counter-added');assert.equal(r.counters,1);
});
test('Balloon Lizard duplicate Standby delivery is idempotent',()=>{
 const s=balloonState(2,0);const first=recordBalloonLizardStandby(s,createBalloonLizardLedger(),standby(2,0,'m0:balloon'));
 const second=recordBalloonLizardStandby(s,first.ledger,standby(2,0,'m0:balloon'));
 assert.equal(second.status,'duplicate');assert.equal(second.counters,1);
});
test('Balloon Lizard rejects an inactive team or stale Standby event',()=>{
 const s=balloonState(2,0);const ledger=createBalloonLizardLedger();
 assert.throws(()=>recordBalloonLizardStandby(s,ledger,standby(2,1,'m1:balloon')),/fora da equipe ativa/);
 assert.throws(()=>recordBalloonLizardStandby(s,ledger,standby(1,0,'m0:balloon')),/obsoleto/);
});
test('face-down Balloon Lizard does not gain a counter',()=>{
 const s=balloonState(2,0,false);const r=recordBalloonLizardStandby(s,createBalloonLizardLedger(),standby(2,0,'m0:balloon'));
 assert.equal(r.status,'face-down');assert.equal(r.counters,0);
});
test('Balloon Lizard counters accumulate once on successive own Standby turns',()=>{
 const first=recordBalloonLizardStandby(balloonState(1,0),createBalloonLizardLedger(),standby(1,0,'m0:balloon'));
 const second=recordBalloonLizardStandby(balloonState(3,0),first.ledger,standby(3,0,'m0:balloon'));
 assert.equal(second.counters,2);
});
test('Balloon Lizard counters are removed when the card leaves the Monster Zone',()=>{
 const first=recordBalloonLizardStandby(balloonState(1,0),createBalloonLizardLedger(),standby(1,0,'m0:balloon'));
 const left=state({team0:{grave:[{uid:'m0:balloon',id:BALLOON_LIZARD_ID}]}});
 assert.deepEqual(reconcileBalloonLizardLedger(left,first.ledger).counters,{});
});
test('Balloon Lizard damage is 400 per counter and targets the destroyer controller team',()=>{
 let s=balloonState(1,0);
 let ledger=recordBalloonLizardStandby(s,createBalloonLizardLedger(),standby(1,0,'m0:balloon')).ledger;
 s=balloonState(2,0);
 ledger=recordBalloonLizardStandby(s,ledger,standby(2,0,'m0:balloon')).ledger;
 const after=destroyedBalloonState(0);
 const r=resolveBalloonLizardDestruction(after,ledger,destroyEvent(1));
 assert.equal(r.status,'resolved');assert.equal(r.counters,2);assert.equal(r.damage,800);assert.equal(r.targetTeam,1);
});
test('Balloon Lizard with no counters resolves for zero damage',()=>{
 const r=resolveBalloonLizardDestruction(destroyedBalloonState(0),createBalloonLizardLedger(),destroyEvent(1));
 assert.equal(r.status,'resolved');assert.equal(r.damage,0);
});
test('negated Balloon Lizard trigger deals no damage and clears its counters',()=>{
 const s=destroyedBalloonState(0);
 const ledger={version:1,counters:{'m0:balloon':{count:3,lastStandbyTurn:3}},processedDestructionEventIds:[]};
 const r=resolveBalloonLizardDestruction(s,ledger,destroyEvent(1,{effectNegatedAtResolution:true}));
 assert.equal(r.status,'negated');assert.equal(r.damage,0);assert.equal(r.ledger.counters['m0:balloon'],undefined);
});
test('Balloon Lizard destruction delivery is idempotent',()=>{
 const s=destroyedBalloonState(0);
 const ledger={version:1,counters:{'m0:balloon':{count:2,lastStandbyTurn:2}},processedDestructionEventIds:[]};
 const first=resolveBalloonLizardDestruction(s,ledger,destroyEvent(1));
 const second=resolveBalloonLizardDestruction(s,first.ledger,destroyEvent(1));
 assert.equal(first.damage,800);assert.equal(second.status,'duplicate');assert.equal(second.damage,0);
});
test('Balloon Lizard rejects stale destruction while the source remains on the field',()=>{
 const s=balloonState(1,0);
 assert.throws(()=>resolveBalloonLizardDestruction(s,createBalloonLizardLedger(),destroyEvent(1)),/ainda está no campo/);
});
test('Balloon Lizard requires the destroyer card to exist and match a live field controller',()=>{
 const s=destroyedBalloonState(0);
 assert.throws(()=>resolveBalloonLizardDestruction(s,createBalloonLizardLedger(),destroyEvent(1,{destroyerUid:'missing'})),/não encontrada/);
 const wrong=state({team0:{grave:[{uid:'m0:balloon',id:BALLOON_LIZARD_ID}],monsters:[monster('m1:destroyer','00000001')]}});
 assert.throws(()=>resolveBalloonLizardDestruction(wrong,createBalloonLizardLedger(),destroyEvent(1,{destroyerTeam:0})),/diverge/);
});
test('Balloon Lizard event cannot target an invalid destroyer team',()=>{
 const s=destroyedBalloonState(0);
 assert.throws(()=>resolveBalloonLizardDestruction(s,createBalloonLizardLedger(),destroyEvent(2)),/Equipe/);
});
test('adapter functions preserve input state and ledgers',()=>{
 const s=state({team0:{backrow:[backrow('m0:b',BACKFIRE_ID)]}});
 const ledger=createBackfireLedger();const ev=event('immut',[fire('m0:f')]);
 const before=JSON.stringify([s,ledger,ev]);resolveBackfireEvent(s,ledger,0,ev);
 assert.equal(JSON.stringify([s,ledger,ev]),before);
 const bs=balloonState(1,0);const bl=createBalloonLizardLedger();recordBalloonLizardStandby(bs,bl,standby(1,0,'m0:balloon'));
 assert.deepEqual(bl.counters,{});
});
