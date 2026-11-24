'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ANCIENT_TELESCOPE_ID,createTelescopeLedger,resolveAncientTelescope}=require('../dist/ancientTelescopeTagAdapter');

function ref(uid,id){return {uid,id};}
function player(team,{deck=[],hand=[],backrow=[],grave=[]}={}){
 return {id:'tag-team-'+team,name:team===0?'Equipe Azul':'Equipe Vermelha',lp:8000,deck,hand,monsters:[],backrow:backrow.map(card=>({...card,setTurn:0,faceUp:true})),grave,extra:[],field:null,banished:[],summoned:false};
}
function state({team0={},team1={},reserve2=[],reserve3=[],cursor=0}={}){
 const active=[0,1],reserves={'2':{deck:reserve2,hand:[],extra:[]},'3':{deck:reserve3,hand:[],extra:[]}};
 const core={version:1,turn:1,current:cursor%2,phase:'main',resume:'main',priority:cursor%2,passes:0,pending:{kind:'none'},chain:[],players:[player(0,team0),player(1,team1)],teamRotation:{version:1,cursor,active,reserves},winner:null,reason:'',log:[]};
 return {version:1,mode:'tag-classic',members:[{id:'p0',name:'A',team:0},{id:'p1',name:'B',team:1},{id:'p2',name:'C',team:0},{id:'p3',name:'D',team:1}],active,cursor,reserves,core};
}
function event(overrides={}){return {eventId:'peek-1',controllerMemberId:'p0',sourceUid:'m0:telescope',...overrides};}
function deck(prefix,count=7){return Array.from({length:count},(_,i)=>ref(prefix+':'+i,String(10000000+i).padStart(8,'0')));}
function baseState(overrides={}){
 return state({team0:{backrow:[ref('m0:telescope',ANCIENT_TELESCOPE_ID)]},team1:{deck:deck('m1')},...overrides});
}

test('reveals the first five cards in the opponent active seat Deck order',()=>{
 const s=baseState();const r=resolveAncientTelescope(s,createTelescopeLedger(),event());
 assert.equal(r.status,'revealed');assert.deepEqual(r.reveal.cards.map(c=>c.uid),['m1:0','m1:1','m1:2','m1:3','m1:4']);assert.equal(r.reveal.orderPreserved,true);
});
test('reads only the active opposing physical seat, not the inactive partner reserve',()=>{
 const s=baseState({reserve3:[ref('m3:secret','99999999')]});
 const r=resolveAncientTelescope(s,createTelescopeLedger(),event());
 assert.equal(r.reveal.targetMemberId,'p1');assert.ok(r.reveal.cards.every(c=>c.uid.startsWith('m1:')));assert.ok(!r.reveal.cards.some(c=>c.uid==='m3:secret'));
});
test('marks the reveal controller-private to the activating physical member',()=>{
 const r=resolveAncientTelescope(baseState(),createTelescopeLedger(),event());
 assert.equal(r.reveal.visibleToMemberId,'p0');assert.equal(r.reveal.visibility,'controller-private');assert.notEqual(r.reveal.visibleToMemberId,'p1');
});
test('routes symmetrically when the red team activates the card',()=>{
 const s=baseState({team0:{deck:deck('m0')},team1:{backrow:[ref('m1:telescope',ANCIENT_TELESCOPE_ID)]},cursor:1});
 const r=resolveAncientTelescope(s,createTelescopeLedger(),event({controllerMemberId:'p1',sourceUid:'m1:telescope'}));
 assert.equal(r.reveal.targetTeam,0);assert.equal(r.reveal.targetMemberId,'p0');assert.equal(r.reveal.visibleToMemberId,'p1');assert.deepEqual(r.reveal.cards.map(c=>c.uid),['m0:0','m0:1','m0:2','m0:3','m0:4']);
});
test('a Deck with fewer than five cards reveals all remaining cards',()=>{
 const s=baseState({team1:{deck:deck('m1',3)}});
 const r=resolveAncientTelescope(s,createTelescopeLedger(),event());
 assert.equal(r.status,'revealed');assert.deepEqual(r.reveal.cards.map(c=>c.uid),['m1:0','m1:1','m1:2']);
});
test('an empty opponent Deck resolves as an empty private reveal',()=>{
 const s=baseState({team1:{deck:[]}});
 const r=resolveAncientTelescope(s,createTelescopeLedger(),event());
 assert.equal(r.status,'empty-deck');assert.deepEqual(r.reveal.cards,[]);
});
test('an inactive teammate cannot resolve the active member card effect',()=>{
 const s=baseState();assert.throws(()=>resolveAncientTelescope(s,createTelescopeLedger(),event({controllerMemberId:'p2'})),/participante ativo/);
});
test('a member from the wrong current team cannot resolve the card',()=>{
 const s=baseState();s.core.current=1;
 assert.throws(()=>resolveAncientTelescope(s,createTelescopeLedger(),event()),/participante ativo/);
});
test('the source instance must be Ancient Telescope',()=>{
 const s=baseState({team0:{backrow:[ref('m0:telescope','12345678')]}});
 assert.throws(()=>resolveAncientTelescope(s,createTelescopeLedger(),event()),/instância física/);
});
test('the activated source UID must exist exactly once in the controller team zones',()=>{
 const s=baseState({team0:{backrow:[]}});
 assert.throws(()=>resolveAncientTelescope(s,createTelescopeLedger(),event()),/instância física/);
 const duplicate=baseState({team0:{backrow:[ref('m0:telescope',ANCIENT_TELESCOPE_ID)],grave:[ref('m0:telescope',ANCIENT_TELESCOPE_ID)]}});
 assert.throws(()=>resolveAncientTelescope(duplicate,createTelescopeLedger(),event()),/instância física/);
});
test('a duplicate event stays idempotent after rotation and Deck changes',()=>{
 const s=baseState();const first=resolveAncientTelescope(s,createTelescopeLedger(),event());
 s.core.players[1].deck.length=0;s.active=[2,3];s.cursor=3;s.core.current=1;s.core.teamRotation.active=[2,3];s.core.teamRotation.cursor=3;
 const second=resolveAncientTelescope(s,first.ledger,event());
 assert.equal(first.status,'revealed');assert.equal(second.status,'duplicate');assert.equal(second.reveal,null);
});
test('an empty or malformed event ID is rejected',()=>{
 const s=baseState();assert.throws(()=>resolveAncientTelescope(s,createTelescopeLedger(),event({eventId:' '})),/Evento/);
});
test('a malformed ledger or duplicate receipt is rejected',()=>{
 const s=baseState();assert.throws(()=>resolveAncientTelescope(s,{version:1,processedEventIds:['x','x']},event()),/Ledger/);
});
test('duplicate physical UIDs in the opponent Deck are rejected',()=>{
 const s=baseState({team1:{deck:[ref('same','10000000'),ref('same','10000001')]}});
 assert.throws(()=>resolveAncientTelescope(s,createTelescopeLedger(),event()),/UID físico duplicado/);
});
test('non-classic 2v2 mode is rejected',()=>{
 const s=baseState();s.mode='tag-normal-lab';
 assert.throws(()=>resolveAncientTelescope(s,createTelescopeLedger(),event()),/2v2 clássico/);
});
test('inconsistent active-seat rotation is rejected',()=>{
 const s=baseState();s.core.teamRotation.active=[2,1];
 assert.throws(()=>resolveAncientTelescope(s,createTelescopeLedger(),event()),/Rotação/);
});
test('the adapter does not mutate Decks, hands, reserves, or the input ledger',()=>{
 const s=baseState({reserve3:[ref('m3:secret','99999999')]});const ledger=createTelescopeLedger();const before=JSON.stringify([s,ledger]);
 const r=resolveAncientTelescope(s,ledger,event());
 assert.equal(JSON.stringify([s,ledger]),before);assert.deepEqual(r.ledger.processedEventIds,['peek-1']);
});
test('the reveal contains only physical identity fields, not a writable Deck reference',()=>{
 const r=resolveAncientTelescope(baseState(),createTelescopeLedger(),event());
 assert.deepEqual(Object.keys(r.reveal.cards[0]).sort(),['id','uid']);assert.notEqual(r.reveal.cards[0],baseState().core.players[1].deck[0]);
});
