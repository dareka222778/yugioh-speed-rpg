'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
 BARREL_BEHIND_THE_DOOR_ID,createBarrelRedirectLedger,resolveBarrelBehindTheDoor
}=require('../dist/barrelBehindTheDoorTagAdapter');

function source(uid,id,faceUp=true){return {uid,id,faceUp,setTurn:0};}
function player(team,{lp=team===0?7000:8000,backrow=[]}={}){
 return {id:'tag-team-'+team,name:team===0?'Equipe Azul':'Equipe Vermelha',lp,deck:[],hand:[],monsters:[],backrow,grave:[],extra:[],banished:[],field:null,summoned:false};
}
function state({lp0=7000,lp1=8000,backrow0=[],backrow1=[],active=[0,1],cursor=0}={}){
 const reserves={'2':{deck:[],hand:[],extra:[]},'3':{deck:[],hand:[],extra:[]}};
 const core={
  version:1,turn:1,current:cursor%2,phase:'main',resume:'main',priority:cursor%2,
  passes:0,pending:{kind:'none'},chain:[],
  players:[player(0,{lp:lp0,backrow:backrow0}),player(1,{lp:lp1,backrow:backrow1})],
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
function event(overrides={}){
 return {
  activationId:'barrel-activation-1',
  sourceEffectActivationId:'source-effect-1',
  sourceEffectChainLinkId:'chain-link-2',
  counterTrapUid:'m0:barrel',
  controllerTeam:0,originalTargetTeam:0,currentLPByTeam:[7000,8000],
  sourceCardId:'19523799',sourceUid:'m1:source',sourceType:'spell',
  wasSetFaceDown:true,counterTrapResolved:true,counterTrapNegated:false,
  sourceEffectWillResolve:true,sourceEffectNegated:false,
  effectActivated:true,wouldInflictDamage:true,damageAmount:700,damageAlreadyApplied:false,
  ...overrides
 };
}
function stateWithBarrel(overrides={}){
 return state({backrow0:[source('m0:barrel',BARREL_BEHIND_THE_DOOR_ID,true)],...overrides});
}

test('Barrel redirects activated Spell effect damage to the opposing team without changing the amount',()=>{
 const s=stateWithBarrel();
 const r=resolveBarrelBehindTheDoor(s,createBarrelRedirectLedger(),event());
 assert.equal(r.status,'redirected');assert.equal(r.plan.amount,700);
 assert.equal(r.plan.originalTargetTeam,0);assert.equal(r.plan.redirectedTargetTeam,1);
});
test('Barrel redirects activated monster effects',()=>{
 const r=resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({sourceType:'monster'}));
 assert.equal(r.status,'redirected');assert.equal(r.plan.amount,700);
});
test('Barrel redirects activated Trap effects',()=>{
 const r=resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({sourceType:'trap'}));
 assert.equal(r.status,'redirected');
});
test('Barrel routing is symmetric when team one controls the Counter Trap',()=>{
 const s=state({backrow1:[source('m1:barrel',BARREL_BEHIND_THE_DOOR_ID,true)]});
 const r=resolveBarrelBehindTheDoor(s,createBarrelRedirectLedger(),event({
  activationId:'barrel-red',counterTrapUid:'m1:barrel',controllerTeam:1,originalTargetTeam:1,
  currentLPByTeam:[7000,8000]
 }));
 assert.equal(r.status,'redirected');assert.equal(r.plan.redirectedTargetTeam,0);
});
test('Barrel does not redirect damage that would hit the other team, not its controller',()=>{
 const r=resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({originalTargetTeam:1}));
 assert.equal(r.status,'not-applicable');assert.equal(r.plan,undefined);
});
test('Barrel excludes damage not caused by an activated effect',()=>{
 const r=resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({effectActivated:false}));
 assert.equal(r.status,'no-damage');
});
test('Barrel excludes an activated effect that would not inflict damage',()=>{
 const r=resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({wouldInflictDamage:false}));
 assert.equal(r.status,'no-damage');
});
test('Barrel excludes zero damage',()=>{
 const r=resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({damageAmount:0}));
 assert.equal(r.status,'no-damage');
});
test('Barrel excludes a source effect that will not resolve',()=>{
 const r=resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({sourceEffectWillResolve:false}));
 assert.equal(r.status,'no-damage');
});
test('Barrel excludes a negated source effect',()=>{
 const r=resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({sourceEffectNegated:true}));
 assert.equal(r.status,'no-damage');
});
test('Barrel excludes an unresolved Counter Trap activation',()=>{
 const r=resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({counterTrapResolved:false}));
 assert.equal(r.status,'no-damage');
});
test('Barrel excludes a negated Counter Trap activation',()=>{
 const r=resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({counterTrapNegated:true}));
 assert.equal(r.status,'no-damage');
});
test('Barrel requires that the Counter Trap was Set face-down',()=>{
 const r=resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({wasSetFaceDown:false}));
 assert.equal(r.status,'not-applicable');
});
test('Barrel requires its activated instance to be face-up in the controller backrow',()=>{
 const down=state({backrow0:[source('m0:barrel',BARREL_BEHIND_THE_DOOR_ID,false)]});
 assert.throws(()=>resolveBarrelBehindTheDoor(down,createBarrelRedirectLedger(),event()),/face-up/);
 const missing=state();
 assert.throws(()=>resolveBarrelBehindTheDoor(missing,createBarrelRedirectLedger(),event()),/não corresponde/);
});
test('Barrel rejects a wrong card ID or duplicate physical UID in the backrow',()=>{
 const wrong=state({backrow0:[source('m0:barrel','12345678',true)]});
 assert.throws(()=>resolveBarrelBehindTheDoor(wrong,createBarrelRedirectLedger(),event()),/não corresponde/);
 const duplicate=state({
  backrow0:[source('m0:barrel',BARREL_BEHIND_THE_DOOR_ID,true)],
  backrow1:[source('m0:barrel',BARREL_BEHIND_THE_DOOR_ID,true)]
 });
 assert.throws(()=>resolveBarrelBehindTheDoor(duplicate,createBarrelRedirectLedger(),event()),/não corresponde/);
});
test('Barrel rejects stale shared LP snapshots',()=>{
 const s=stateWithBarrel({lp0:6500});
 assert.throws(()=>resolveBarrelBehindTheDoor(s,createBarrelRedirectLedger(),event()),/Snapshot de LP obsoleto/);
});
test('Barrel refuses to redirect damage that was already applied',()=>{
 assert.throws(()=>resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({damageAlreadyApplied:true})),/já aplicado/);
});
test('Barrel rejects malformed source card IDs and physical UIDs',()=>{
 assert.throws(()=>resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({sourceCardId:'123'})),/Identidade/);
 assert.throws(()=>resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({sourceUid:'unknown:source'})),/proprietário físico/);
});
test('battle damage is not a valid source type for this activation window',()=>{
 assert.throws(()=>resolveBarrelBehindTheDoor(stateWithBarrel(),createBarrelRedirectLedger(),event({sourceType:'battle'})),/Recibo de ativação/);
});
test('two distinct Counter Trap activations can refer to one source effect without multiplying its damage',()=>{
 const s=state({backrow0:[
  source('m0:barrel-a',BARREL_BEHIND_THE_DOOR_ID,true),
  source('m2:barrel-b',BARREL_BEHIND_THE_DOOR_ID,true)
 ]});
 const first=resolveBarrelBehindTheDoor(s,createBarrelRedirectLedger(),event({counterTrapUid:'m0:barrel-a'}));
 const second=resolveBarrelBehindTheDoor(s,first.ledger,event({
  activationId:'barrel-activation-2',counterTrapUid:'m2:barrel-b'
 }));
 assert.equal(first.plan.sourceEffectActivationId,second.plan.sourceEffectActivationId);
 assert.equal(first.plan.amount,second.plan.amount);
 assert.equal(first.plan.redirectedTargetTeam,second.plan.redirectedTargetTeam);
 assert.deepEqual(second.ledger.processedActivationIds,['barrel-activation-1','barrel-activation-2']);
});
test('duplicate Counter Trap activation receipt is idempotent even after LP changes',()=>{
 const s=stateWithBarrel();
 const first=resolveBarrelBehindTheDoor(s,createBarrelRedirectLedger(),event());
 s.core.players[0].lp=6400;
 const second=resolveBarrelBehindTheDoor(s,first.ledger,event());
 assert.equal(first.status,'redirected');assert.equal(second.status,'duplicate');
});
test('the Counter Trap can be controlled by a teammate even when its physical owner is the opposing seat',()=>{
 const s=state({backrow0:[source('m1:barrel-owned-by-opponent',BARREL_BEHIND_THE_DOOR_ID,true)]});
 const r=resolveBarrelBehindTheDoor(s,createBarrelRedirectLedger(),event({counterTrapUid:'m1:barrel-owned-by-opponent'}));
 assert.equal(r.status,'redirected');assert.equal(r.plan.controllerTeam,0);
 assert.equal(r.plan.redirectedTargetTeam,1);
});
test('Barrel does not mutate LP, backrow, player data or its ledger',()=>{
 const s=stateWithBarrel(),before=structuredClone(s),ledger=createBarrelRedirectLedger();
 const r=resolveBarrelBehindTheDoor(s,ledger,event());
 assert.equal(r.status,'redirected');assert.deepEqual(s,before);
 assert.deepEqual(ledger,{version:1,processedActivationIds:[]});
});
test('invalid ledgers and invalid damage amounts fail closed',()=>{
 const s=stateWithBarrel();
 assert.throws(()=>resolveBarrelBehindTheDoor(s,{version:1,processedActivationIds:['x','x']},event()),/Ledger/);
 assert.throws(()=>resolveBarrelBehindTheDoor(s,createBarrelRedirectLedger(),event({damageAmount:1.2})),/Recibo de ativação/);
});
test('active seat rotation does not change the shared-team redirection target',()=>{
 const s=state({active:[2,3],cursor:2,backrow0:[source('m0:barrel',BARREL_BEHIND_THE_DOOR_ID,true)]});
 const r=resolveBarrelBehindTheDoor(s,createBarrelRedirectLedger(),event());
 assert.equal(r.status,'redirected');assert.equal(r.plan.redirectedTargetTeam,1);
});
