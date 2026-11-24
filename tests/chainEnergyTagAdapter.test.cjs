'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
 CHAIN_ENERGY_ID,createChainEnergyLedger,resolveChainEnergy
}=require('../dist/chainEnergyTagAdapter');

function source(uid,id=CHAIN_ENERGY_ID,faceUp=true){return {uid,id,faceUp,setTurn:0};}
function card(uid,id='12345678'){return {uid,id};}
function player(team,{lp=team===0?7000:8000,hand=[],backrow=[]}={}){
 return {id:'tag-team-'+team,name:team===0?'Equipe Azul':'Equipe Vermelha',lp,deck:[],hand,monsters:[],backrow,grave:[],extra:[],banished:[],field:null,summoned:false};
}
function state({
 lp0=7000,lp1=8000,hand0=[],hand1=[],backrow0=[],backrow1=[],active=[0,1],cursor=0
}={}){
 const reserves={'2':{deck:[],hand:[],extra:[]},'3':{deck:[],hand:[],extra:[]}};
 const core={
  version:1,turn:1,current:cursor%2,phase:'main',resume:'main',priority:cursor%2,
  passes:0,pending:{kind:'none'},chain:[],
  players:[player(0,{lp:lp0,hand:hand0,backrow:backrow0}),player(1,{lp:lp1,hand:hand1,backrow:backrow1})],
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
  actionId:'action-1',controllerMemberId:'p0',actionKind:'normal-summon',
  sourceZone:'hand',cardType:'monster',cards:[card('m0:hand-card')],
  currentLP:7000,...overrides
 };
}
function withEnergy(overrides={}){
 return state({backrow0:[source('m0:energy')],...overrides});
}

test('Chain Energy charges 500 shared LP before a Normal Summon from hand',()=>{
 const c=card('m0:normal-monster');
 const s=withEnergy({hand0:[c]});
 const r=resolveChainEnergy(s,createChainEnergyLedger(),event({cards:[c]}));
 assert.equal(r.status,'payable');assert.equal(r.plan.amount,500);
 assert.equal(r.plan.team,0);assert.equal(r.plan.actionKind,'normal-summon');
 assert.equal(r.plan.timing,'before-action');assert.equal(r.plan.chainLink,false);
});
test('Chain Energy charges for a Special Summon from hand',()=>{
 const c=card('m0:special-monster');
 const r=resolveChainEnergy(withEnergy({hand0:[c]}),createChainEnergyLedger(),event({actionKind:'special-summon',cards:[c]}));
 assert.equal(r.status,'payable');assert.equal(r.plan.amount,500);
});
test('Chain Energy charges for Setting a monster, Spell or Trap from hand',()=>{
 for(const cardType of ['monster','spell','trap']){
  const c=card('m0:set-'+cardType);
  const r=resolveChainEnergy(withEnergy({hand0:[c]}),createChainEnergyLedger(),event({actionKind:'set',cardType,cards:[c]}));
  assert.equal(r.status,'payable');assert.equal(r.plan.amount,500);
 }
});
test('Chain Energy charges for activating a Spell or Trap from hand',()=>{
 for(const cardType of ['spell','trap']){
  const c=card('m0:activate-'+cardType);
  const r=resolveChainEnergy(withEnergy({hand0:[c]}),createChainEnergyLedger(),event({actionKind:'activate',cardType,cards:[c]}));
  assert.equal(r.status,'payable');assert.equal(r.plan.amount,500);
 }
});
test('Chain Energy also charges when a monster effect is activated from hand',()=>{
 const c=card('m0:kuriboh');
 const r=resolveChainEnergy(withEnergy({hand0:[c]}),createChainEnergyLedger(),event({actionKind:'activate',cardType:'monster',cards:[c]}));
 assert.equal(r.status,'payable');assert.equal(r.plan.amount,500);
});
test('Chain Energy charges per monster in a multi-card Special Summon from hand',()=>{
 const a=card('m0:monster-a'),b=card('m0:monster-b');
 const r=resolveChainEnergy(withEnergy({hand0:[a,b]}),createChainEnergyLedger(),event({actionKind:'special-summon',cards:[a,b]}));
 assert.equal(r.status,'payable');assert.equal(r.plan.cardCount,2);assert.equal(r.plan.amount,1000);
});
test('Chain Energy charges per card in a multi-card Set from hand',()=>{
 const a=card('m0:spell-a'),b=card('m0:trap-b');
 const r=resolveChainEnergy(withEnergy({hand0:[a,b]}),createChainEnergyLedger(),event({actionKind:'set',cardType:'spell',cards:[a,b]}));
 assert.equal(r.status,'payable');assert.equal(r.plan.amount,1000);
});
test('each active Chain Energy copy contributes 500 per hand card',()=>{
 const a=card('m0:one'),b=card('m0:two');
 const s=state({hand0:[a,b],backrow0:[source('m0:energy-a')],backrow1:[source('m1:energy-b')]});
 const r=resolveChainEnergy(s,createChainEnergyLedger(),event({cards:[a,b]}));
 assert.equal(r.status,'payable');assert.equal(r.plan.copyCount,2);
 assert.equal(r.plan.amount,2000);assert.equal(r.plan.sourceUids.length,2);
});
test('both teams pay from their shared LP when their active member plays from hand',()=>{
 const c=card('m1:opponent-card');
 const s=state({cursor:1,hand1:[c],backrow0:[source('m0:energy')]});
 const r=resolveChainEnergy(s,createChainEnergyLedger(),event({
  actionId:'red-action',controllerMemberId:'p1',actionKind:'set',cardType:'trap',
  cards:[c],currentLP:8000
 }));
 assert.equal(r.status,'payable');assert.equal(r.plan.team,1);assert.equal(r.plan.amount,500);
});
test('no active Chain Energy leaves the action unchanged',()=>{
 const c=card('m0:card');
 const r=resolveChainEnergy(state({hand0:[c]}),createChainEnergyLedger(),event({cards:[c]}));
 assert.equal(r.status,'unchanged');assert.equal(r.plan,null);
});
test('face-down Chain Energy does not tax the action',()=>{
 const c=card('m0:card');
 const r=resolveChainEnergy(state({hand0:[c],backrow0:[source('m0:energy',CHAIN_ENERGY_ID,false)]}),createChainEnergyLedger(),event({cards:[c]}));
 assert.equal(r.status,'unchanged');
});
test('negated Chain Energy copies are excluded',()=>{
 const c=card('m0:card');
 const r=resolveChainEnergy(withEnergy({hand0:[c]}),createChainEnergyLedger(),event({cards:[c],negatedSourceUids:['m0:energy']}));
 assert.equal(r.status,'unchanged');
});
test('cards played from the Deck are not taxed',()=>{
 const r=resolveChainEnergy(withEnergy(),createChainEnergyLedger(),event({sourceZone:'deck',cards:[]}));
 assert.equal(r.status,'not-applicable');
});
test('cards played from the Graveyard are not taxed',()=>{
 const r=resolveChainEnergy(withEnergy(),createChainEnergyLedger(),event({sourceZone:'grave',cards:[]}));
 assert.equal(r.status,'not-applicable');
});
test('cards played from the Extra Deck are not taxed',()=>{
 const r=resolveChainEnergy(withEnergy(),createChainEnergyLedger(),event({sourceZone:'extra',cards:[]}));
 assert.equal(r.status,'not-applicable');
});
test('cards activated from the field or already Set are not taxed',()=>{
 const r=resolveChainEnergy(withEnergy(),createChainEnergyLedger(),event({sourceZone:'field',actionKind:'activate',cardType:'spell',cards:[]}));
 assert.equal(r.status,'not-applicable');
});
test('cards played from the banished zone are not taxed',()=>{
 const r=resolveChainEnergy(withEnergy(),createChainEnergyLedger(),event({sourceZone:'banished',cards:[]}));
 assert.equal(r.status,'not-applicable');
});
test('discarding a card as an effect cost is not a Chain Energy play action',()=>{
 const c=card('m0:discarded');
 const r=resolveChainEnergy(withEnergy(),createChainEnergyLedger(),event({actionKind:'discard-cost',cards:[c]}));
 assert.equal(r.status,'not-applicable');
});
test('sending a card from hand to the GY without playing it is not taxed',()=>{
 const c=card('m0:sent');
 const r=resolveChainEnergy(withEnergy(),createChainEnergyLedger(),event({actionKind:'send-to-grave',cards:[c]}));
 assert.equal(r.status,'not-applicable');
});
test('revealing a card from hand is not taxed',()=>{
 const c=card('m0:revealed');
 const r=resolveChainEnergy(withEnergy(),createChainEnergyLedger(),event({actionKind:'reveal',cards:[c]}));
 assert.equal(r.status,'not-applicable');
});
test('activating an effect from hand and then Special Summoning from hand are two costs',()=>{
 const spell=card('m0:flute'),dragon=card('m0:dragon');
 const s=withEnergy({hand0:[spell,dragon]});
 const first=resolveChainEnergy(s,createChainEnergyLedger(),event({
  actionId:'activate-flute',actionKind:'activate',cardType:'spell',cards:[spell]
 }));
 const second=resolveChainEnergy(s,first.ledger,event({
  actionId:'summon-dragon',actionKind:'special-summon',cardType:'monster',cards:[dragon]
 }));
 assert.equal(first.plan.amount,500);assert.equal(second.plan.amount,500);
 assert.deepEqual(second.ledger.processedActionIds,['activate-flute','summon-dragon']);
});
test('insufficient shared LP blocks the action before payment',()=>{
 const c=card('m0:card');
 const s=withEnergy({lp0:499,hand0:[c]});
 const r=resolveChainEnergy(s,createChainEnergyLedger(),event({cards:[c],currentLP:499}));
 assert.equal(r.status,'insufficient-lp');assert.equal(r.plan,null);
});
test('paying exactly to zero LP blocks the action; one LP above the cost permits it',()=>{
 const c=card('m0:card');
 const zero=resolveChainEnergy(withEnergy({lp0:500,hand0:[c]}),createChainEnergyLedger(),event({cards:[c],currentLP:500}));
 const one=resolveChainEnergy(withEnergy({lp0:501,hand0:[c]}),createChainEnergyLedger(),event({cards:[c],currentLP:501}));
 assert.equal(zero.status,'insufficient-lp');assert.equal(one.status,'payable');
});
test('stale shared LP snapshots are rejected',()=>{
 const c=card('m0:card');
 assert.throws(()=>resolveChainEnergy(withEnergy({lp0:6500,hand0:[c]}),createChainEnergyLedger(),event({cards:[c]})),/Snapshot de LP obsoleto/);
});
test('only the current physical member may perform the action',()=>{
 const c=card('m2:reserve-card');
 const s=withEnergy();
 assert.throws(()=>resolveChainEnergy(s,createChainEnergyLedger(),event({controllerMemberId:'p2',cards:[c]})),/participante físico ativo/);
});
test('the active member cannot spend a teammate private-hand UID',()=>{
 const own=card('m0:own'),teammate=card('m2:private');
 const s=withEnergy({hand0:[own]});
 assert.throws(()=>resolveChainEnergy(s,createChainEnergyLedger(),event({cards:[teammate]})),/mão privada/);
});
test('the hand card must exist exactly once with its original ID',()=>{
 const c=card('m0:card');
 const s=withEnergy({hand0:[c]});
 assert.throws(()=>resolveChainEnergy(s,createChainEnergyLedger(),event({cards:[{...c,id:'87654321'}]})),/não corresponde exatamente/);
});
test('duplicate card UIDs in one action are rejected',()=>{
 const c=card('m0:duplicate');
 assert.throws(()=>resolveChainEnergy(withEnergy({hand0:[c]}),createChainEnergyLedger(),event({cards:[c,c]})),/UID duplicado/);
});
test('duplicate Chain Energy source UIDs are rejected',()=>{
 const c=card('m0:card');
 const s=state({hand0:[c],backrow0:[source('m0:duplicate')],backrow1:[source('m0:duplicate')]});
 assert.throws(()=>resolveChainEnergy(s,createChainEnergyLedger(),event({cards:[c]})),/UID duplicado/);
});
test('wrong card type for a summon and malformed event fields fail closed',()=>{
 const c=card('m0:card');
 assert.throws(()=>resolveChainEnergy(withEnergy({hand0:[c]}),createChainEnergyLedger(),event({actionKind:'normal-summon',cardType:'spell',cards:[c]})),/tipo incompatível/);
 assert.throws(()=>resolveChainEnergy(withEnergy({hand0:[c]}),createChainEnergyLedger(),event({actionKind:'activate',cards:[{id:'123',uid:'m0:bad'}]})),/Identidade/);
});
test('duplicate action receipts remain idempotent after LP or turn state advances',()=>{
 const c=card('m0:card');
 const s=withEnergy({hand0:[c]});
 const first=resolveChainEnergy(s,createChainEnergyLedger(),event({cards:[c]}));
 s.core.players[0].lp=6400;
 const second=resolveChainEnergy(s,first.ledger,event({cards:[c]}));
 assert.equal(first.status,'payable');assert.equal(second.status,'duplicate');
});
test('the adapter never exposes private card identities in the cost plan',()=>{
 const c=card('m0:secret-card');
 const r=resolveChainEnergy(withEnergy({hand0:[c]}),createChainEnergyLedger(),event({cards:[c]}));
 assert.equal(r.status,'payable');
 assert.equal(Object.hasOwn(r.plan,'cards'),false);
 assert.equal(Object.hasOwn(r.plan,'cardUids'),false);
});
test('Chain Energy preserves the complete TagDuel state and supplied ledger',()=>{
 const c=card('m0:card');
 const s=withEnergy({hand0:[c]}),before=structuredClone(s),ledger=createChainEnergyLedger();
 const r=resolveChainEnergy(s,ledger,event({cards:[c]}));
 assert.equal(r.status,'payable');assert.deepEqual(s,before);
 assert.deepEqual(ledger,{version:1,processedActionIds:[]});
});
test('Chain Energy preserves private hands, Decks, 3+3 zones, Field Zone and Extra Deck',()=>{
 const c=card('m0:card');
 const s=withEnergy({hand0:[c]});
 s.core.players[0].deck=[card('m0:deck-card')];
 s.core.players[0].extra=[card('m0:extra-card')];
 s.core.players[0].monsters=[{uid:'m0:monster',id:'12345678'}];
 s.core.players[0].field={uid:'m0:field',id:'12345678'};
 const before=structuredClone(s);
 resolveChainEnergy(s,createChainEnergyLedger(),event({cards:[c]}));
 assert.deepEqual(s,before);
});
