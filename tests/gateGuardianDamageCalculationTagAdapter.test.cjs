'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  KAZEJIN_ID,
  SUIJIN_ID,
  SANGA_OF_THE_THUNDER_ID,
  GATE_GUARDIAN_ATTACK_REDUCTION_RULE,
  planGateGuardianAttackReduction,
  recordGateGuardianAttackReductionUse
}=require('../dist/gateGuardianDamageCalculationTagAdapter');

const ids=[KAZEJIN_ID,SUIJIN_ID,SANGA_OF_THE_THUNDER_ID];
const noNegation=()=>false;
function player(team){return {id:'tag-team-'+team,name:team?'Vermelha':'Azul',lp:4000,deck:[],hand:[],monsters:[],backrow:[],grave:[],extra:[],banished:[],field:null,summoned:false};}
function monster(uid,id,faceUp=true){return {uid,id,position:'atk',faceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0};}
function makeState(options={}){
  const attackerTeam=options.attackerTeam??0,controllerTeam=1-attackerTeam;
  const sourceUid=options.sourceUid??'m1:gate-component',attackerUid=options.attackerUid??'m0:attacker';
  const sourceId=options.sourceId??KAZEJIN_ID;
  const players=[player(0),player(1)];
  if(options.source!==false)players[controllerTeam].monsters.push(monster(sourceUid,sourceId,options.sourceFaceUp!==false));
  if(options.attacker!==false)players[attackerTeam].monsters.push(monster(attackerUid,'12345678',options.attackerFaceUp!==false));
  return {
    version:1,mode:'tag-classic',
    members:[
      {id:'seat-0',name:'Seat 0',team:0},
      {id:'seat-1',name:'Seat 1',team:1},
      {id:'seat-2',name:'Seat 2',team:0},
      {id:'seat-3',name:'Seat 3',team:1}
    ],
    active:options.active??[0,1],cursor:0,reserves:{'2':{deck:[],hand:[]},'3':{deck:[],hand:[]}},
    core:{version:1,players,turn:2,current:attackerTeam,priority:options.priority??(1-attackerTeam),phase:options.phase??'response',resume:options.resume??'battle',damageStep:options.damageStep??true,
      pending:options.pending??{kind:'attack',actor:attackerTeam,card:attackerUid,target:sourceUid,stage:options.stage??'calculation'},chain:[],winner:null,reason:'',log:[]}
  };
}
function plan(state,token='face-up-epoch-1',ledger={},negated=noNegation){
  return planGateGuardianAttackReduction(state,'m1:gate-component',token,ledger,negated);
}

test('the shared policy expresses a once-per-face-up-instance Damage Calculation ATK-zero effect',()=>{
  assert.deepEqual(GATE_GUARDIAN_ATTACK_REDUCTION_RULE,{
    kind:'damageCalculationAttackZero',window:'opponentTurn',target:'attackingMonster',
    duration:'damageCalculation',oncePer:'faceUpInstance'
  });
});

test('Kazejin produces a plan only while being attacked during opponent Damage Calculation',()=>{
  const state=makeState({sourceId:KAZEJIN_ID});
  assert.deepEqual(plan(state),{
    sourceUid:'m1:gate-component',sourceId:KAZEJIN_ID,attackerUid:'m0:attacker',
    controllerTeam:1,attackerTeam:0,faceUpInstanceId:'face-up-epoch-1',
    attackerAtkDuringDamageCalculation:0,duration:'damageCalculation'
  });
});

test('Suijin shares the same target-only ATK reduction',()=>{
  const state=makeState({sourceId:SUIJIN_ID});
  assert.equal(planGateGuardianAttackReduction(state,'m1:gate-component','epoch-a',{},noNegation).sourceId,SUIJIN_ID);
});

test('Sanga of the Thunder shares the same target-only ATK reduction',()=>{
  const state=makeState({sourceId:SANGA_OF_THE_THUNDER_ID});
  assert.equal(planGateGuardianAttackReduction(state,'m1:gate-component','epoch-a',{},noNegation).sourceId,SANGA_OF_THE_THUNDER_ID);
});

test('the effect is unavailable before Damage Calculation',()=>{
  for(const stage of ['declare','damage']){
    assert.equal(plan(makeState({stage})),undefined);
  }
});

test('the effect is unavailable outside the Damage Step response window',()=>{
  for(const options of [
    {phase:'battle',resume:'battle',damageStep:true},
    {phase:'response',resume:'main',damageStep:true},
    {phase:'response',resume:'battle',damageStep:false},
    {phase:'choice',resume:'battle',damageStep:true}
  ])assert.equal(plan(makeState(options)),undefined);
});

test('the defending team must hold response priority to activate the Quick Effect',()=>{
  const state=makeState({priority:0});
  assert.equal(plan(state),undefined);
});

test('the source must be the actual attack target, not another monster',()=>{
  const state=makeState({pending:{kind:'attack',actor:0,card:'m0:attacker',target:'m3:other',stage:'calculation'}});
  assert.equal(plan(state),undefined);
});

test('direct attacks do not provide an attacking monster to reduce',()=>{
  const state=makeState({pending:{kind:'attack',actor:0,card:'m0:attacker',stage:'calculation'}});
  assert.equal(plan(state),undefined);
});

test('the effect is usable only during the opponent team turn',()=>{
  const state=makeState({attackerTeam:1});
  state.core.current=0;
  assert.equal(planGateGuardianAttackReduction(state,'m1:gate-component','epoch-a',{},noNegation),undefined);
});

test('the source and attacking monster must both remain face-up on the field',()=>{
  assert.equal(plan(makeState({sourceFaceUp:false})),undefined);
  assert.equal(plan(makeState({attackerFaceUp:false})),undefined);
  assert.equal(plan(makeState({source:false})),undefined);
  assert.equal(plan(makeState({attacker:false})),undefined);
});

test('a negated component effect cannot produce a reduction plan',()=>{
  assert.equal(plan(makeState(), 'epoch-a', {}, ()=>true),undefined);
});

test('the once-while-face-up limit is keyed to the supplied face-up instance token',()=>{
  const state=makeState();
  assert.equal(plan(state,'epoch-a',{'m1:gate-component':'epoch-a'}),undefined);
  assert.ok(plan(state,'epoch-b',{'m1:gate-component':'epoch-a'}));
});

test('a new face-up token permits reuse after a face-down/up or field re-entry transition',()=>{
  const state=makeState();
  const first=plan(state,'epoch-a');
  const ledger=recordGateGuardianAttackReductionUse({},first);
  assert.equal(plan(state,'epoch-a',ledger),undefined);
  assert.ok(plan(state,'epoch-b',ledger));
});

test('current controller team, not physical owner seat, determines the defending component team',()=>{
  const state=makeState({sourceUid:'m0:stolen-suijin',sourceId:SUIJIN_ID});
  const result=planGateGuardianAttackReduction(state,'m0:stolen-suijin','epoch-a',{},noNegation);
  assert.equal(result.controllerTeam,1);
  assert.equal(result.attackerTeam,0);
});

test('all four physical seats work across active-seat rotations and stolen control',()=>{
  const rotations=[[0,1],[2,1],[0,3],[2,3]];
  for(let sourceSeat=0;sourceSeat<4;sourceSeat++)for(let attackerTeam=0;attackerTeam<2;attackerTeam++)for(const active of rotations){
    const controllerTeam=1-attackerTeam;
    const state=makeState({attackerTeam,sourceUid:'m'+sourceSeat+':source',active,sourceId:ids[sourceSeat]});
    const result=planGateGuardianAttackReduction(state,'m'+sourceSeat+':source','epoch-a',{},noNegation);
    assert.ok(result);
    assert.equal(result.controllerTeam,controllerTeam);
    assert.equal(result.attackerTeam,attackerTeam);
  }
});

test('the adapter rejects malformed physical UIDs instead of inferring a seat',()=>{
  const state=makeState({sourceUid:'unknown-seat:source'});
  assert.throws(()=>planGateGuardianAttackReduction(state,'unknown-seat:source','epoch-a',{},noNegation),/UID físico válido/);
});

test('duplicate physical UIDs across Monster Zones are rejected',()=>{
  const state=makeState();
  state.core.players[0].monsters.push(monster('m1:gate-component',SUIJIN_ID));
  assert.throws(()=>plan(state),/UID físico duplicado/);
});

test('the use ledger is copied, records only the exact face-up instance and rejects stale duplicate commits',()=>{
  const state=makeState();
  const ledger={};
  const first=plan(state,'epoch-a',ledger);
  const next=recordGateGuardianAttackReductionUse(ledger,first);
  assert.deepEqual(ledger,{});
  assert.deepEqual(next,{'m1:gate-component':'epoch-a'});
  assert.throws(()=>recordGateGuardianAttackReductionUse(next,first),/já consumida/);
});

test('planning is pure and does not change ATK, pending attack, phase or players',()=>{
  const state=makeState();
  const before=structuredClone(state);
  plan(state);
  assert.deepEqual(state,before);
});

test('unknown monster identities never receive the Gate Guardian effect',()=>{
  assert.equal(plan(makeState({sourceId:'00000000'})),undefined);
});
