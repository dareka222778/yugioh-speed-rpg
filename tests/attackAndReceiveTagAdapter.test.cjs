'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ATTACK_AND_RECEIVE_ID,createAttackReceiveLedger,resolveAttackAndReceive}=require('../dist/attackAndReceiveTagAdapter');

function trap(uid,id=ATTACK_AND_RECEIVE_ID,faceUp=true){return {uid,id,faceUp,setTurn:0};}
function player(team,{lp=8000,backrow=[],grave=[]}={}){return {id:'tag-team-'+team,name:team===0?'Equipe Azul':'Equipe Vermelha',lp,deck:[],hand:[],monsters:[],backrow,grave,extra:[],banished:[],field:null,summoned:false};}
function state({turn=1,current=0,phase='main',team0={},team1={}}={}){
 const active=[0,1],reserves={'2':{deck:[],hand:[],extra:[]},'3':{deck:[],hand:[],extra:[]}};
 const core={version:1,turn,current,phase,resume:'main',priority:current,passes:0,pending:{kind:'none'},chain:[],players:[player(0,team0),player(1,team1)],teamRotation:{version:1,cursor:0,active,reserves},winner:null,reason:'',log:[]};
 return {version:1,mode:'tag-classic',members:[{id:'p0',name:'A',team:0},{id:'p1',name:'B',team:1},{id:'p2',name:'C',team:0},{id:'p3',name:'D',team:1}],active,cursor:0,reserves,core};
}
function makeState({team=0,graveCopies=0,lpBefore=8000,lpAfter=7000,sourceFaceUp=true,phase='main'}={}){
 const grave=Array.from({length:graveCopies},(_,i)=>({uid:'m'+team+':old-'+i,id:ATTACK_AND_RECEIVE_ID}));
 const data={lp:lpAfter,backrow:[trap('m'+team+':source',ATTACK_AND_RECEIVE_ID,sourceFaceUp)],grave};
 return {state:state({phase,team0:team===0?data:{},team1:team===1?data:{}}),sourceUid:'m'+team+':source',event:{eventId:'damage-1',damagedTeam:team,lpBefore,lpAfter,damage:lpBefore-lpAfter,cause:'effect',resolved:true}};
}

test('Attack and Receive deals 700 after real LP damage',()=>{
 const f=makeState();const r=resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,f.event);
 assert.equal(r.status,'resolved');assert.equal(r.packet.amount,700);assert.equal(r.packet.targetTeam,1);
});
test('Attack and Receive accepts battle and effect damage',()=>{
 const f=makeState();const battle={...f.event,cause:'battle'};
 assert.equal(resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,battle).packet.amount,700);
 assert.equal(resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,f.event).packet.amount,700);
});
test('Attack and Receive adds 300 for each prior copy in the shared team Graveyard',()=>{
 const f=makeState({graveCopies:3});const r=resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,f.event);
 assert.equal(r.packet.priorCopiesInGraveyard,3);assert.equal(r.packet.amount,1600);
});
test('the resolving Trap in the backrow is not counted as a Graveyard copy',()=>{
 const f=makeState({graveCopies:0});assert.equal(resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,f.event).packet.amount,700);
});
test('only the team that actually took damage may activate the Trap',()=>{
 const f=makeState({team:0});assert.throws(()=>resolveAttackAndReceive(f.state,createAttackReceiveLedger(),1,'m1:source',f.event),/própria equipe/);
});
test('zero damage and mismatched before/after values are rejected',()=>{
 const f=makeState();assert.throws(()=>resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,{...f.event,damage:0}),/dano real/);
 assert.throws(()=>resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,{...f.event,damage:500}),/dano real/);
});
test('stale damage snapshots cannot be replayed after LP changes',()=>{
 const f=makeState();const stale=state({team0:{lp:6500,backrow:[trap(f.sourceUid)]}});
 assert.throws(()=>resolveAttackAndReceive(stale,createAttackReceiveLedger(),0,f.sourceUid,f.event),/obsoleto/);
});
test('the source must be face-up in the damaged team backrow',()=>{
 const f=makeState({sourceFaceUp:false});assert.throws(()=>resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,f.event),/face-up/);
});
test('a source card in the opposing backrow cannot be used by the damaged team',()=>{
 const f=makeState({team:0});const s=state({team0:{lp:7000},team1:{backrow:[trap('m1:source')]}});
 assert.throws(()=>resolveAttackAndReceive(s,createAttackReceiveLedger(),0,'m1:source',f.event),/face-up/);
});
test('different copies can respond to the same damage event independently',()=>{
 const f=makeState();f.state.core.players[0].backrow.push(trap('m2:source-2'));
 const first=resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,f.event);
 const second=resolveAttackAndReceive(f.state,first.ledger,0,'m2:source-2',f.event);
 assert.equal(first.packet.amount,700);assert.equal(second.packet.amount,700);assert.notEqual(first.packet.sourceUid,second.packet.sourceUid);
});
test('the same source and damage event are idempotent',()=>{
 const f=makeState();const first=resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,f.event);
 const second=resolveAttackAndReceive(f.state,first.ledger,0,f.sourceUid,f.event);
 assert.equal(second.status,'duplicate');assert.equal(second.packet,null);
});
test('activation negation and effect negation produce no damage packet',()=>{
 const f=makeState();const a=resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,f.event,{activation:true});
 const e=resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,f.event,{effect:true});
 assert.equal(a.status,'negated');assert.equal(a.packet,null);assert.equal(e.status,'negated');assert.equal(e.packet,null);
});
test('negated activation is still idempotent for the same source/event',()=>{
 const f=makeState();const first=resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,f.event,{activation:true});
 const second=resolveAttackAndReceive(f.state,first.ledger,0,f.sourceUid,f.event);
 assert.equal(second.status,'duplicate');assert.equal(second.packet,null);
});
test('invalid damage cause and invalid team snapshots are rejected',()=>{
 const f=makeState();assert.throws(()=>resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,{...f.event,cause:'cost'}),/dano real/);
 assert.throws(()=>resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,{...f.event,damagedTeam:2}),/Equipe/);
});
test('a Trap source missing from the backrow is rejected',()=>{
 const f=makeState();f.state.core.players[0].backrow=[];
 assert.throws(()=>resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,f.event),/face-up/);
});
test('duplicate Graveyard UIDs are rejected before calculating damage',()=>{
 const f=makeState({graveCopies:1});f.state.core.players[0].grave.push({...f.state.core.players[0].grave[0]});
 assert.throws(()=>resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,f.event),/UID duplicado/);
});
test('a finished duel cannot activate Attack and Receive after lethal damage',()=>{
 const f=makeState({phase:'finished'});assert.throws(()=>resolveAttackAndReceive(f.state,createAttackReceiveLedger(),0,f.sourceUid,f.event),/Duelo encerrado/);
});
test('activation ledger and TagDuel input remain immutable',()=>{
 const f=makeState({graveCopies:2});const ledger=createAttackReceiveLedger();const before=JSON.stringify([f.state,ledger,f.event]);
 resolveAttackAndReceive(f.state,ledger,0,f.sourceUid,f.event);
 assert.equal(JSON.stringify([f.state,ledger,f.event]),before);
});
