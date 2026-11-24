'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BAD_REACTION_TO_SIMOCHI_ID,createSimochiLedger,resolveSimochiLpGain}=require('../dist/badReactionToSimochiTagAdapter');

function trap(uid,id=BAD_REACTION_TO_SIMOCHI_ID,faceUp=true){return {uid,id,faceUp,setTurn:0};}
function player(team,{lp=8000,backrow=[]}={}){return {id:'tag-team-'+team,name:team===0?'Equipe Azul':'Equipe Vermelha',lp,deck:[],hand:[],monsters:[],backrow,grave:[],extra:[],banished:[],field:null,summoned:false};}
function state({team0={},team1={}}={}){
 const active=[0,1],reserves={'2':{deck:[],hand:[],extra:[]},'3':{deck:[],hand:[],extra:[]}};
 const core={version:1,turn:1,current:0,phase:'main',resume:'main',priority:0,passes:0,pending:{kind:'none'},chain:[],players:[player(0,team0),player(1,team1)],teamRotation:{version:1,cursor:0,active,reserves},winner:null,reason:'',log:[]};
 return {version:1,mode:'tag-classic',members:[{id:'p0',name:'A',team:0},{id:'p1',name:'B',team:1},{id:'p2',name:'C',team:0},{id:'p3',name:'D',team:1}],active,cursor:0,reserves,core};
}
function gainEvent(targetTeam=0,overrides={}){return {eventId:'gain-1',targetTeam,currentLP:7000,proposedGain:1200,cause:'effect',resolved:true,effectNegated:false,...overrides};}

test('face-up Simochi on the opposing team converts LP gain into equal damage',()=>{
 const s=state({team1:{backrow:[trap('m1:simochi')],lp:8000}});
 const r=resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0));
 assert.equal(r.status,'converted');assert.equal(r.replacement.outcome,'damage');assert.equal(r.replacement.amount,1200);assert.equal(r.replacement.targetTeam,0);
});
test('without an opposing Simochi, the original LP gain remains unchanged',()=>{
 const s=state({team0:{lp:7000},team1:{lp:8000}});
 const r=resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0));
 assert.equal(r.status,'unchanged');assert.equal(r.replacement.outcome,'gain');assert.equal(r.replacement.amount,1200);
});
test('face-down Simochi does not replace LP gain',()=>{
 const s=state({team1:{backrow:[trap('m1:simochi',BAD_REACTION_TO_SIMOCHI_ID,false)]}});
 const r=resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0));
 assert.equal(r.status,'unchanged');assert.equal(r.replacement.outcome,'gain');
});
test('Simochi does not convert its controller team own LP gain',()=>{
 const s=state({team0:{backrow:[trap('m0:simochi')],lp:7000}});
 const r=resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0));
 assert.equal(r.status,'unchanged');assert.equal(r.replacement.outcome,'gain');
});
test('when both teams have Simochi, only the opposing team copy converts this gain',()=>{
 const s=state({team0:{backrow:[trap('m0:own')]},team1:{backrow:[trap('m1:opponent')]}});
 const r=resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0));
 assert.equal(r.status,'converted');assert.deepEqual(r.replacement.sourceUids,['m1:opponent']);
});
test('multiple face-up copies are not cumulative',()=>{
 const s=state({team1:{backrow:[trap('m1:s1'),trap('m3:s2'),trap('m1:s3')]}});
 const r=resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0));
 assert.equal(r.replacement.amount,1200);assert.equal(r.replacement.sourceUids.length,3);
});
test('a negated copy is excluded while another active copy still converts',()=>{
 const s=state({team1:{backrow:[trap('m1:s1'),trap('m3:s2')]}});
 const r=resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0,{negatedSourceUids:['m1:s1']}));
 assert.equal(r.status,'converted');assert.deepEqual(r.replacement.sourceUids,['m3:s2']);
});
test('all negated Simochi copies leave the LP gain unchanged',()=>{
 const s=state({team1:{backrow:[trap('m1:s1')]}});
 const r=resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0,{negatedSourceUids:['m1:s1']}));
 assert.equal(r.status,'unchanged');assert.equal(r.replacement.outcome,'gain');
});
test('battle damage, LP costs and other non-effect changes are not converted',()=>{
 for(const cause of ['battle','cost','other']){
  const s=state({team1:{backrow:[trap('m1:simochi')]}});
  const r=resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0,{cause}));
  assert.equal(r.status,'not-applicable');assert.equal(r.replacement,null);
 }
});
test('unresolved and negated gain effects produce no replacement',()=>{
 const s=state({team1:{backrow:[trap('m1:simochi')]}});
 assert.equal(resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0,{resolved:false})).status,'no-gain');
 assert.equal(resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0,{effectNegated:true})).status,'no-gain');
});
test('zero LP gain does not create a damage replacement',()=>{
 const s=state({team1:{backrow:[trap('m1:simochi')]}});
 assert.equal(resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0,{proposedGain:0})).status,'no-gain');
});
test('negative or fractional LP gain is rejected',()=>{
 const s=state({team1:{backrow:[trap('m1:simochi')]}});
 assert.throws(()=>resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0,{proposedGain:-1})),/inválido/);
 assert.throws(()=>resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0,{proposedGain:1.5})),/inválido/);
});
test('invalid target team is rejected',()=>{
 const s=state();assert.throws(()=>resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(2)),/Equipe/);
});
test('stale current LP snapshot is rejected',()=>{
 const s=state({team0:{lp:6500},team1:{backrow:[trap('m1:simochi')]}});
 assert.throws(()=>resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0)),/obsoleto/);
});
test('the same gain event is idempotent',()=>{
 const s=state({team1:{backrow:[trap('m1:simochi')]}});
 const first=resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0));
 const second=resolveSimochiLpGain(s,first.ledger,gainEvent(0));
 assert.equal(first.status,'converted');assert.equal(second.status,'duplicate');assert.equal(second.replacement,null);
});
test('a second distinct gain event is converted independently',()=>{
 const s=state({team1:{backrow:[trap('m1:simochi')]}});
 const first=resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0,{eventId:'gain-1'}));
 const second=resolveSimochiLpGain(s,first.ledger,gainEvent(0,{eventId:'gain-2'}));
 assert.equal(first.replacement.amount,1200);assert.equal(second.replacement.amount,1200);
});
test('duplicate Simochi source UIDs are rejected',()=>{
 const s=state({team1:{backrow:[trap('m1:simochi'),trap('m1:simochi')]}});
 assert.throws(()=>resolveSimochiLpGain(s,createSimochiLedger(),gainEvent(0)),/UID duplicado/);
});
test('LP replacement plan leaves TagDuel and ledger immutable',()=>{
 const s=state({team1:{backrow:[trap('m1:simochi')]}});
 const ledger=createSimochiLedger();const ev=gainEvent(0);const before=JSON.stringify([s,ledger,ev]);
 resolveSimochiLpGain(s,ledger,ev);assert.equal(JSON.stringify([s,ledger,ev]),before);
});
