'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
 DARK_ROOM_OF_NIGHTMARE_ID,COFFIN_SELLER_ID,SKULL_INVITATION_ID,
 createDarkRoomLedger,createCoffinSellerLedger,createSkullInvitationLedger,
 resolveDarkRoomOfNightmare,resolveCoffinSeller,resolveSkullInvitation
}=require('../dist/triggeredBurnTagAdapter');

function source(uid,id,faceUp=true){return {uid,id,faceUp,setTurn:0};}
function player(team,{lp=team===0?7000:8000,backrow=[],grave=[]}={}){
 return {id:'tag-team-'+team,name:team===0?'Equipe Azul':'Equipe Vermelha',lp,deck:[],hand:[],monsters:[],backrow,grave,extra:[],banished:[],field:null,summoned:false};
}
function state({
 lp0=7000,lp1=8000,backrow0=[],backrow1=[],grave0=[],grave1=[],
 active=[0,1],cursor=0
}={}){
 const reserves={'2':{deck:[],hand:[],extra:[]},'3':{deck:[],hand:[],extra:[]}};
 const players=[
  player(0,{lp:lp0,backrow:backrow0,grave:grave0}),
  player(1,{lp:lp1,backrow:backrow1,grave:grave1})
 ];
 const core={
  version:1,turn:1,current:cursor%2,phase:'main',resume:'main',priority:cursor%2,
  passes:0,pending:{kind:'none'},chain:[],players,
  teamRotation:{version:1,cursor,active,reserves},winner:null,reason:'',log:[]
 };
 return {
  version:1,mode:'tag-classic',
  members:[
   {id:'p0',name:'A',team:0},{id:'p1',name:'B',team:1},
   {id:'p2',name:'C',team:0},{id:'p3',name:'D',team:1}
  ],
  active,cursor,reserves,core
 };
}
function damageEvent(targetTeam=0,overrides={}){
 return {
  eventId:'damage-1',targetTeam,currentLP:targetTeam===0?7000:8000,amount:500,
  sourceCardId:'19523799',sourceUid:'m1:source',cause:'effect',
  resolved:true,damageApplied:true,effectNegated:false,...overrides
 };
}
function graveCard(uid,id,kind){return {uid,id,kind};}
function graveEvent(cards,overrides={}){
 return {eventId:'grave-1',committed:true,cards,currentLPByTeam:[7000,8000],...overrides};
}
function putInGrave(card){return {id:card.id,uid:card.uid};}
function addGrave(state,team,...cards){state.core.players[team].grave.push(...cards.map(putInGrave));}

test('Dark Room triggers 300 after actual effect damage to the opposing team',()=>{
 const s=state({backrow1:[source('m1:room',DARK_ROOM_OF_NIGHTMARE_ID)]});
 const r=resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0));
 assert.equal(r.status,'triggered');assert.equal(r.plans.length,1);
 assert.equal(r.plans[0].targetTeam,0);assert.equal(r.plans[0].amount,300);
});
test('Dark Room does not trigger when no opposing copy is face-up',()=>{
 const s=state({backrow1:[source('m1:room',DARK_ROOM_OF_NIGHTMARE_ID,false)]});
 const r=resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0));
 assert.equal(r.status,'unchanged');assert.equal(r.plans.length,0);
});
test('Dark Room ignores its controller team own effect damage',()=>{
 const s=state({backrow0:[source('m0:room',DARK_ROOM_OF_NIGHTMARE_ID)]});
 const r=resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0));
 assert.equal(r.status,'unchanged');
});
test('Dark Room routes symmetrically when team one takes effect damage',()=>{
 const s=state({backrow0:[source('m0:room',DARK_ROOM_OF_NIGHTMARE_ID)]});
 const r=resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(1));
 assert.equal(r.status,'triggered');assert.equal(r.plans[0].targetTeam,1);
 assert.equal(r.plans[0].controllerTeam,0);
});
test('each face-up Dark Room copy creates one independent 300 plan',()=>{
 const s=state({backrow1:[
  source('m1:room-a',DARK_ROOM_OF_NIGHTMARE_ID),
  source('m3:room-b',DARK_ROOM_OF_NIGHTMARE_ID)
 ]});
 const r=resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0));
 assert.equal(r.plans.length,2);assert.deepEqual(r.plans.map(p=>p.amount),[300,300]);
});
test('Dark Room never reacts to damage caused by Dark Room itself',()=>{
 const s=state({backrow1:[source('m1:room',DARK_ROOM_OF_NIGHTMARE_ID)]});
 const r=resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0,{sourceCardId:DARK_ROOM_OF_NIGHTMARE_ID}));
 assert.equal(r.status,'not-applicable');assert.equal(r.plans.length,0);
});
test('Dark Room ignores battle damage, costs and other non-effect changes',()=>{
 const s=state({backrow1:[source('m1:room',DARK_ROOM_OF_NIGHTMARE_ID)]});
 for(const cause of ['battle','cost','other']){
  const r=resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0,{cause}));
  assert.equal(r.status,'no-damage');assert.equal(r.plans.length,0);
 }
});
test('Dark Room ignores unresolved, negated or unapplied damage events',()=>{
 const s=state({backrow1:[source('m1:room',DARK_ROOM_OF_NIGHTMARE_ID)]});
 for(const overrides of [{resolved:false,damageApplied:false},{effectNegated:true,damageApplied:false},{damageApplied:false}]){
  const r=resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0,overrides));
  assert.equal(r.status,'no-damage');
 }
});
test('Dark Room ignores zero damage',()=>{
 const s=state({backrow1:[source('m1:room',DARK_ROOM_OF_NIGHTMARE_ID)]});
 assert.equal(resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0,{amount:0})).status,'no-damage');
});
test('a negated Dark Room copy is excluded while another active copy still triggers',()=>{
 const s=state({backrow1:[source('m1:room-a',DARK_ROOM_OF_NIGHTMARE_ID),source('m3:room-b',DARK_ROOM_OF_NIGHTMARE_ID)]});
 const r=resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0,{negatedSourceUids:['m1:room-a']}));
 assert.deepEqual(r.plans.map(p=>p.sourceUid),['m3:room-b']);
});
test('all negated Dark Room copies leave the damage event unchanged',()=>{
 const s=state({backrow1:[source('m1:room',DARK_ROOM_OF_NIGHTMARE_ID)]});
 const r=resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0,{negatedSourceUids:['m1:room']}));
 assert.equal(r.status,'unchanged');assert.equal(r.plans.length,0);
});
test('Dark Room rejects stale LP snapshots',()=>{
 const s=state({lp0:6500,backrow1:[source('m1:room',DARK_ROOM_OF_NIGHTMARE_ID)]});
 assert.throws(()=>resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0)),/Snapshot de LP obsoleto/);
});
test('Dark Room duplicate receipt remains idempotent after LP advances',()=>{
 const s=state({backrow1:[source('m1:room',DARK_ROOM_OF_NIGHTMARE_ID)]});
 const first=resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0));
 s.core.players[0].lp=6400;
 const second=resolveDarkRoomOfNightmare(s,first.ledger,damageEvent(0));
 assert.equal(first.status,'triggered');assert.equal(second.status,'duplicate');
});
test('Dark Room rejects duplicate active source UIDs',()=>{
 const s=state({backrow1:[source('m1:dup',DARK_ROOM_OF_NIGHTMARE_ID),source('m1:dup',DARK_ROOM_OF_NIGHTMARE_ID)]});
 assert.throws(()=>resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0)),/UID duplicado/);
});
test('Dark Room rejects malformed damage identity and fractional amount',()=>{
 const s=state({backrow1:[source('m1:room',DARK_ROOM_OF_NIGHTMARE_ID)]});
 assert.throws(()=>resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0,{sourceCardId:'123'})),/Identidade/);
 assert.throws(()=>resolveDarkRoomOfNightmare(s,createDarkRoomLedger(),damageEvent(0,{amount:1.5})),/Evento de dano/);
});
test('Dark Room does not mutate LP, zones or the supplied ledger',()=>{
 const s=state({backrow1:[source('m1:room',DARK_ROOM_OF_NIGHTMARE_ID)]});
 const before=structuredClone(s),ledger=createDarkRoomLedger();
 const r=resolveDarkRoomOfNightmare(s,ledger,damageEvent(0));
 assert.equal(r.status,'triggered');assert.deepEqual(s,before);assert.deepEqual(ledger,{version:1,processedEventIds:[]});
});

test('Coffin Seller triggers once when an opponent-owned monster enters the shared GY',()=>{
 const card=graveCard('m1:monster-a','12345678','monster');
 const s=state({backrow0:[source('m0:seller',COFFIN_SELLER_ID)],grave1:[putInGrave(card)]});
 const r=resolveCoffinSeller(s,createCoffinSellerLedger(),graveEvent([card]));
 assert.equal(r.status,'triggered');assert.equal(r.plans.length,1);
 assert.equal(r.plans[0].targetTeam,1);assert.equal(r.plans[0].amount,300);
});
test('several opponent monsters in one GY batch still cause only 300 per Coffin Seller copy',()=>{
 const a=graveCard('m1:monster-a','12345678','monster');
 const b=graveCard('m3:monster-b','23456789','monster');
 const s=state({backrow0:[source('m0:seller-a',COFFIN_SELLER_ID),source('m2:seller-b',COFFIN_SELLER_ID)],grave1:[putInGrave(a),putInGrave(b)]});
 const r=resolveCoffinSeller(s,createCoffinSellerLedger(),graveEvent([a,b]));
 assert.equal(r.plans.length,2);assert.deepEqual(r.plans.map(p=>p.amount),[300,300]);
});
test('Coffin Seller does not react to a monster owned by its own team',()=>{
 const card=graveCard('m0:monster','12345678','monster');
 const s=state({backrow0:[source('m0:seller',COFFIN_SELLER_ID)],grave0:[putInGrave(card)]});
 const r=resolveCoffinSeller(s,createCoffinSellerLedger(),graveEvent([card]));
 assert.equal(r.status,'unchanged');assert.equal(r.plans.length,0);
});
test('Coffin Seller ignores Spell and Trap cards sent to the opposing GY',()=>{
 const spell=graveCard('m1:spell','11111111','spell');
 const trap=graveCard('m3:trap','22222222','trap');
 const s=state({backrow0:[source('m0:seller',COFFIN_SELLER_ID)],grave1:[putInGrave(spell),putInGrave(trap)]});
 const r=resolveCoffinSeller(s,createCoffinSellerLedger(),graveEvent([spell,trap]));
 assert.equal(r.status,'unchanged');
});
test('Coffin Seller supports simultaneous monster sends to both teams and routes each opponent correctly',()=>{
 const a=graveCard('m0:blue-monster','12345678','monster');
 const b=graveCard('m1:red-monster','23456789','monster');
 const s=state({
  backrow0:[source('m0:seller-blue',COFFIN_SELLER_ID)],
  backrow1:[source('m1:seller-red',COFFIN_SELLER_ID)],
  grave0:[putInGrave(a)],grave1:[putInGrave(b)]
 });
 const r=resolveCoffinSeller(s,createCoffinSellerLedger(),graveEvent([a,b]));
 assert.equal(r.plans.length,2);
 assert.deepEqual(r.plans.map(p=>[p.controllerTeam,p.targetTeam]),[[0,1],[1,0]]);
});
test('face-down Coffin Seller does not trigger',()=>{
 const card=graveCard('m1:monster','12345678','monster');
 const s=state({backrow0:[source('m0:seller',COFFIN_SELLER_ID,false)],grave1:[putInGrave(card)]});
 assert.equal(resolveCoffinSeller(s,createCoffinSellerLedger(),graveEvent([card])).status,'unchanged');
});
test('negated Coffin Seller copies are excluded',()=>{
 const card=graveCard('m1:monster','12345678','monster');
 const s=state({backrow0:[source('m0:seller',COFFIN_SELLER_ID)],grave1:[putInGrave(card)]});
 const r=resolveCoffinSeller(s,createCoffinSellerLedger(),graveEvent([card],{negatedSourceUids:['m0:seller']}));
 assert.equal(r.status,'unchanged');
});
test('Coffin Seller derives physical owner from UID even after seat rotation',()=>{
 const card=graveCard('m1:monster','12345678','monster');
 const s=state({active:[2,3],cursor:2,backrow0:[source('m0:seller',COFFIN_SELLER_ID)],grave1:[putInGrave(card)]});
 const r=resolveCoffinSeller(s,createCoffinSellerLedger(),graveEvent([card]));
 assert.equal(r.status,'triggered');assert.equal(r.plans[0].targetTeam,1);
});
test('Coffin Seller rejects a card missing from its physical owner shared GY',()=>{
 const card=graveCard('m1:monster','12345678','monster');
 const s=state({backrow0:[source('m0:seller',COFFIN_SELLER_ID)]});
 assert.throws(()=>resolveCoffinSeller(s,createCoffinSellerLedger(),graveEvent([card])),/não corresponde exatamente/);
});
test('Coffin Seller rejects duplicate UIDs and malformed physical owner prefixes',()=>{
 const duplicate=graveCard('m1:dup','12345678','monster');
 const s=state({backrow0:[source('m0:seller',COFFIN_SELLER_ID)],grave1:[putInGrave(duplicate)]});
 assert.throws(()=>resolveCoffinSeller(s,createCoffinSellerLedger(),graveEvent([duplicate,{...duplicate}])),/UID duplicado/);
 const malformed=graveCard('ownerless:monster','12345678','monster');
 const s2=state({backrow0:[source('m0:seller',COFFIN_SELLER_ID)]});
 assert.throws(()=>resolveCoffinSeller(s2,createCoffinSellerLedger(),graveEvent([malformed])),/UID físico sem proprietário/);
});
test('Coffin Seller rejects stale LP snapshots and replays duplicate event IDs idempotently',()=>{
 const card=graveCard('m1:monster','12345678','monster');
 const s=state({backrow0:[source('m0:seller',COFFIN_SELLER_ID)],grave1:[putInGrave(card)]});
 assert.throws(()=>resolveCoffinSeller(s,createCoffinSellerLedger(),graveEvent([card],{currentLPByTeam:[6900,8000]})),/Snapshot de LP obsoleto/);
 const first=resolveCoffinSeller(s,createCoffinSellerLedger(),graveEvent([card]));
 s.core.players[1].lp=7900;
 const second=resolveCoffinSeller(s,first.ledger,graveEvent([card]));
 assert.equal(first.status,'triggered');assert.equal(second.status,'duplicate');
});
test('Coffin Seller records a committed empty/no-movement event without damage',()=>{
 const s=state({backrow0:[source('m0:seller',COFFIN_SELLER_ID)]});
 const r=resolveCoffinSeller(s,createCoffinSellerLedger(),graveEvent([]));
 assert.equal(r.status,'no-event');assert.equal(r.plans.length,0);
});

test('Skull Invitation damages each physical owner 300 for each card sent to GY',()=>{
 const a=graveCard('m0:monster','12345678','monster');
 const b=graveCard('m2:spell','23456789','spell');
 const s=state({backrow1:[source('m1:skull',SKULL_INVITATION_ID)],grave0:[putInGrave(a),putInGrave(b)]});
 const r=resolveSkullInvitation(s,createSkullInvitationLedger(),graveEvent([a,b]));
 assert.equal(r.status,'triggered');assert.equal(r.plans.length,1);
 assert.equal(r.plans[0].targetTeam,0);assert.equal(r.plans[0].amount,600);
});
test('Skull Invitation splits mixed-owner batches by physical team',()=>{
 const a=graveCard('m0:monster','12345678','monster');
 const b=graveCard('m1:spell','23456789','spell');
 const c=graveCard('m2:trap','34567890','trap');
 const s=state({backrow0:[source('m0:skull',SKULL_INVITATION_ID)],grave0:[putInGrave(a),putInGrave(c)],grave1:[putInGrave(b)]});
 const r=resolveSkullInvitation(s,createSkullInvitationLedger(),graveEvent([a,b,c]));
 assert.deepEqual(r.plans.map(p=>[p.targetTeam,p.amount]),[[0,600],[1,300]]);
});
test('each active Skull Invitation copy applies independently to every owner group',()=>{
 const a=graveCard('m0:a','12345678','monster');
 const b=graveCard('m1:b','23456789','spell');
 const s=state({
  backrow0:[source('m0:skull-a',SKULL_INVITATION_ID)],
  backrow1:[source('m1:skull-b',SKULL_INVITATION_ID)],
  grave0:[putInGrave(a)],grave1:[putInGrave(b)]
 });
 const r=resolveSkullInvitation(s,createSkullInvitationLedger(),graveEvent([a,b]));
 assert.equal(r.plans.length,4);
 assert.deepEqual(r.plans.map(p=>p.amount),[300,300,300,300]);
});
test('Skull Invitation ignores face-down copies',()=>{
 const a=graveCard('m0:a','12345678','monster');
 const s=state({backrow1:[source('m1:skull',SKULL_INVITATION_ID,false)],grave0:[putInGrave(a)]});
 assert.equal(resolveSkullInvitation(s,createSkullInvitationLedger(),graveEvent([a])).status,'unchanged');
});
test('Skull Invitation does not trigger without an active copy',()=>{
 const a=graveCard('m0:a','12345678','monster');
 const s=state({grave0:[putInGrave(a)]});
 assert.equal(resolveSkullInvitation(s,createSkullInvitationLedger(),graveEvent([a])).status,'unchanged');
});
test('Skull Invitation reacts to committed GY movement regardless of whether it was battle, effect or cost',()=>{
 const a=graveCard('m0:a','12345678','monster');
 const s=state({backrow1:[source('m1:skull',SKULL_INVITATION_ID)],grave0:[putInGrave(a)]});
 const r=resolveSkullInvitation(s,createSkullInvitationLedger(),graveEvent([a]));
 assert.equal(r.status,'triggered');assert.equal(r.plans[0].amount,300);
});
test('Skull Invitation ignores an uncommitted movement receipt',()=>{
 const a=graveCard('m0:a','12345678','monster');
 const s=state({backrow1:[source('m1:skull',SKULL_INVITATION_ID)]});
 const r=resolveSkullInvitation(s,createSkullInvitationLedger(),graveEvent([a],{committed:false}));
 assert.equal(r.status,'no-event');assert.equal(r.plans.length,0);
});
test('Skull Invitation rejects cards that are not present in the physical owner GY',()=>{
 const a=graveCard('m0:a','12345678','monster');
 const s=state({backrow1:[source('m1:skull',SKULL_INVITATION_ID)]});
 assert.throws(()=>resolveSkullInvitation(s,createSkullInvitationLedger(),graveEvent([a])),/não corresponde exatamente/);
});
test('Skull Invitation excludes negated copies and rejects duplicate source UIDs',()=>{
 const a=graveCard('m0:a','12345678','monster');
 const s=state({backrow1:[source('m1:skull',SKULL_INVITATION_ID)],grave0:[putInGrave(a)]});
 const r=resolveSkullInvitation(s,createSkullInvitationLedger(),graveEvent([a],{negatedSourceUids:['m1:skull']}));
 assert.equal(r.status,'unchanged');
 const s2=state({backrow1:[source('m1:dup',SKULL_INVITATION_ID),source('m1:dup',SKULL_INVITATION_ID)],grave0:[putInGrave(a)]});
 assert.throws(()=>resolveSkullInvitation(s2,createSkullInvitationLedger(),graveEvent([a])),/UID duplicado/);
});
test('Skull Invitation rejects stale LP snapshots and duplicate receipts remain idempotent',()=>{
 const a=graveCard('m0:a','12345678','monster');
 const s=state({backrow1:[source('m1:skull',SKULL_INVITATION_ID)],grave0:[putInGrave(a)]});
 assert.throws(()=>resolveSkullInvitation(s,createSkullInvitationLedger(),graveEvent([a],{currentLPByTeam:[7000,7900]})),/Snapshot de LP obsoleto/);
 const first=resolveSkullInvitation(s,createSkullInvitationLedger(),graveEvent([a]));
 s.core.players[0].lp=6800;
 const second=resolveSkullInvitation(s,first.ledger,graveEvent([a]));
 assert.equal(first.status,'triggered');assert.equal(second.status,'duplicate');
});
test('all three adapters preserve the full TagDuel snapshot and never mutate the ledgers',()=>{
 const a=graveCard('m0:a','12345678','monster');
 const s=state({
  backrow0:[source('m0:seller',COFFIN_SELLER_ID),source('m0:skull',SKULL_INVITATION_ID)],
  backrow1:[source('m1:room',DARK_ROOM_OF_NIGHTMARE_ID)],
  grave0:[putInGrave(a)]
 });
 const before=structuredClone(s);
 const d=createDarkRoomLedger(),c=createCoffinSellerLedger(),k=createSkullInvitationLedger();
 resolveDarkRoomOfNightmare(s,d,damageEvent(0));
 resolveCoffinSeller(s,c,graveEvent([a]));
 resolveSkullInvitation(s,k,graveEvent([a]));
 assert.deepEqual(s,before);
 assert.deepEqual(d,{version:1,processedEventIds:[]});
 assert.deepEqual(c,{version:1,processedEventIds:[]});
 assert.deepEqual(k,{version:1,processedEventIds:[]});
});
