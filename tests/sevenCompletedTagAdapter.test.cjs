'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SEVEN_COMPLETED_ID,createSevenCompletedLedger,resolveSevenCompleted}=require('../dist/sevenCompletedTagAdapter');

function ref(uid,id,extra={}){return {uid,id,...extra};}
function monster(uid,id,faceUp=true){return {uid,id,position:'atk',faceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0};}
function player(team,{monsters=[],backrow=[]}={}){
 return {id:'tag-team-'+team,name:team===0?'Equipe Azul':'Equipe Vermelha',lp:8000,deck:[],hand:[],monsters,backrow:backrow.map(card=>({setTurn:0,faceUp:true,...card})),grave:[],extra:[],field:null,banished:[],summoned:false};
}
function state({team0={},team1={},cursor=0}={}){
 const active=[0,1],reserves={'2':{deck:[],hand:[],extra:[]},'3':{deck:[],hand:[],extra:[]}};
 const core={version:1,turn:1,current:cursor%2,phase:'main',resume:'main',priority:cursor%2,passes:0,pending:{kind:'none'},chain:[],players:[player(0,team0),player(1,team1)],teamRotation:{version:1,cursor,active,reserves},winner:null,reason:'',log:[]};
 return {version:1,mode:'tag-classic',members:[{id:'p0',name:'A',team:0},{id:'p1',name:'B',team:1},{id:'p2',name:'C',team:0},{id:'p3',name:'D',team:1}],active,cursor,reserves,core};
}
function baseState(overrides={}){
 return state({team0:{backrow:[ref('m0:7c',SEVEN_COMPLETED_ID)],monsters:[monster('m0:jinzo','77585513')]},...overrides});
}
function event(overrides={}){return {eventId:'equip-1',controllerMemberId:'p0',sourceUid:'m0:7c',targetUid:'m0:jinzo',stat:'atk',...overrides};}

test('ATK choice creates exactly +700 ATK plan for a face-up Machine monster',()=>{
 const r=resolveSevenCompleted(baseState(),createSevenCompletedLedger(),event());
 assert.equal(r.status,'equipped');assert.deepEqual(r.plan,{eventId:'equip-1',controllerMemberId:'p0',sourceUid:'m0:7c',targetUid:'m0:jinzo',targetTeam:0,stat:'atk',amount:700,visibility:'public'});
});
test('DEF choice creates +700 DEF, not ATK or both',()=>{
 const r=resolveSevenCompleted(baseState(),createSevenCompletedLedger(),event({stat:'def'}));
 assert.equal(r.plan.stat,'def');assert.equal(r.plan.amount,700);assert.equal(Object.hasOwn(r.plan,'atk'),false);assert.equal(Object.hasOwn(r.plan,'def'),false);
});
test('a face-up Machine monster on the opposing team is a legal Equip target',()=>{
 const s=baseState({team1:{monsters:[monster('m1:cannon','11384280')]}});
 const r=resolveSevenCompleted(s,createSevenCompletedLedger(),event({targetUid:'m1:cannon'}));
 assert.equal(r.plan.targetTeam,1);assert.equal(r.plan.targetUid,'m1:cannon');
});
test('non-Machine monsters are rejected',()=>{
 const s=baseState({team0:{backrow:[ref('m0:7c',SEVEN_COMPLETED_ID)],monsters:[monster('m0:dm','46986414')]}});
 assert.throws(()=>resolveSevenCompleted(s,createSevenCompletedLedger(),event({targetUid:'m0:dm'})),/monstro Máquina/);
});
test('face-down monsters cannot be equipped',()=>{
 const s=baseState({team0:{backrow:[ref('m0:7c',SEVEN_COMPLETED_ID)],monsters:[monster('m0:jinzo','77585513',false)]}});
 assert.throws(()=>resolveSevenCompleted(s,createSevenCompletedLedger(),event()),/face para cima/);
});
test('a target removed before resolution is rejected without retargeting',()=>{
 const s=baseState({team0:{backrow:[ref('m0:7c',SEVEN_COMPLETED_ID)],monsters:[]}});
 assert.throws(()=>resolveSevenCompleted(s,createSevenCompletedLedger(),event()),/ausente ou ambíguo/);
});
test('duplicate target UIDs across shared fields are rejected as ambiguous',()=>{
 const s=baseState({team1:{monsters:[monster('m0:jinzo','11384280')]}});
 assert.throws(()=>resolveSevenCompleted(s,createSevenCompletedLedger(),event()),/ausente ou ambíguo/);
});
test('an inactive teammate cannot activate the active member Equip Spell',()=>{
 assert.throws(()=>resolveSevenCompleted(baseState(),createSevenCompletedLedger(),event({controllerMemberId:'p2'})),/participante ativo/);
});
test('the source physical card must be 7 Completed',()=>{
 const s=baseState({team0:{backrow:[ref('m0:7c','12345678')],monsters:[monster('m0:jinzo','77585513')]}});
 assert.throws(()=>resolveSevenCompleted(s,createSevenCompletedLedger(),event()),/instância física/);
});
test('the source must be face-up and not already equipped',()=>{
 const faceDown=baseState({team0:{backrow:[ref('m0:7c',SEVEN_COMPLETED_ID,{faceUp:false})],monsters:[monster('m0:jinzo','77585513')]}});
 assert.throws(()=>resolveSevenCompleted(faceDown,createSevenCompletedLedger(),event()),/face-up/);
 const equipped=baseState({team0:{backrow:[ref('m0:7c',SEVEN_COMPLETED_ID,{equippedTo:'m0:jinzo'})],monsters:[monster('m0:jinzo','77585513')]}});
 assert.throws(()=>resolveSevenCompleted(equipped,createSevenCompletedLedger(),event()),/face-up/);
});
test('invalid stat choice is rejected',()=>{
 assert.throws(()=>resolveSevenCompleted(baseState(),createSevenCompletedLedger(),event({stat:'both'})),/Evento/);
});
test('duplicate event delivery remains idempotent after the target leaves the field',()=>{
 const s=baseState();const first=resolveSevenCompleted(s,createSevenCompletedLedger(),event());
 s.core.players[0].monsters=[];
 const second=resolveSevenCompleted(s,first.ledger,event());
 assert.equal(first.status,'equipped');assert.equal(second.status,'duplicate');assert.equal(second.plan,null);
});
test('two distinct Equip Spell instances produce independent +700 plans',()=>{
 const s=baseState({team0:{backrow:[ref('m0:7c1',SEVEN_COMPLETED_ID),ref('m0:7c2',SEVEN_COMPLETED_ID)],monsters:[monster('m0:jinzo','77585513')]}});
 const first=resolveSevenCompleted(s,createSevenCompletedLedger(),event({sourceUid:'m0:7c1',eventId:'equip-1'}));
 const second=resolveSevenCompleted(s,first.ledger,event({sourceUid:'m0:7c2',eventId:'equip-2'}));
 assert.equal(first.plan.amount,700);assert.equal(second.plan.amount,700);assert.notEqual(first.plan.sourceUid,second.plan.sourceUid);
});
test('the active red-team member can equip a Machine monster on either team',()=>{
 const s=baseState({team0:{monsters:[monster('m0:cannon','11384280')]},team1:{backrow:[ref('m1:7c',SEVEN_COMPLETED_ID)],monsters:[monster('m1:jinzo','77585513')]},cursor:1});
 const r=resolveSevenCompleted(s,createSevenCompletedLedger(),event({controllerMemberId:'p1',sourceUid:'m1:7c',targetUid:'m0:cannon'}));
 assert.equal(r.plan.targetTeam,0);assert.equal(r.plan.controllerMemberId,'p1');
});
test('wrong current team is rejected',()=>{
 const s=baseState();s.core.current=1;
 assert.throws(()=>resolveSevenCompleted(s,createSevenCompletedLedger(),event()),/participante ativo/);
});
test('non-classic mode is rejected',()=>{
 const s=baseState();s.mode='tag-normal-lab';
 assert.throws(()=>resolveSevenCompleted(s,createSevenCompletedLedger(),event()),/2v2 clássico/);
});
test('the adapter rejects duplicate source UIDs',()=>{
 const s=baseState({team0:{backrow:[ref('m0:7c',SEVEN_COMPLETED_ID),ref('m0:7c',SEVEN_COMPLETED_ID)],monsters:[monster('m0:jinzo','77585513')]}});
 assert.throws(()=>resolveSevenCompleted(s,createSevenCompletedLedger(),event()),/instância física/);
});
test('the adapter never mutates LP, zones, monster stats, or the ledger',()=>{
 const s=baseState();const ledger=createSevenCompletedLedger();const before=JSON.stringify([s,ledger]);
 const r=resolveSevenCompleted(s,ledger,event());
 assert.equal(JSON.stringify([s,ledger]),before);assert.deepEqual(r.ledger.processedEventIds,['equip-1']);
});
