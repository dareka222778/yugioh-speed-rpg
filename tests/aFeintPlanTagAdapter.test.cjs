'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {A_FEINT_PLAN_ID,prepareAFeintPlan,aFeintPlanBlocksAttack}=require('../dist/aFeintPlanTagAdapter');

function monster(uid,faceUp) {
  return {uid,id:'MONSTER',position:'def',faceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0};
}
function makeState(options={}) {
  const source={
    uid:'m2:feint-plan-owned-by-partner',
    id:options.sourceId??A_FEINT_PLAN_ID,
    setTurn:options.setTurn??1,
    faceUp:options.sourceFaceUp!==false,
    resolved:false
  };
  const players=[
    {id:'tag-team-0',name:'Azul',lp:4000,deck:[],hand:[],monsters:[monster('m0:face-down',false),monster('m0:face-up',true)],backrow:[source],grave:[],extra:[],summoned:false},
    {id:'tag-team-1',name:'Vermelha',lp:4000,deck:[],hand:[],monsters:[monster('m1:other-face-down',false),monster('m1:attacker',true)],backrow:[],grave:[],extra:[],summoned:false}
  ];
  if(options.duplicateSource) players[1].backrow.push({...source,uid:'m1:duplicate-feint'});
  return {
    version:1,players,turn:3,current:options.current??1,
    phase:options.phase??'main',resume:'battle',priority:0,passes:0,
    pending:options.pending??{kind:'none'},
    damageStep:options.damageStep??false,
    chain:[],winner:null,reason:'',log:[]
  };
}
const sourceUid='m2:feint-plan-owned-by-partner';

test('A Feint Plan owned by the inactive partner creates a team-wide lock for this turn',()=>{
  const state=makeState();
  const before=structuredClone(state);
  const lock=prepareAFeintPlan(state,sourceUid);
  assert.equal(lock.sourceOwnerSeat,2);
  assert.equal(lock.controllerTeam,0);
  assert.equal(lock.scope,'all-monsters');
  assert.equal(lock.blockedTarget,'face-down');
  assert.equal(lock.expiresAt,'endOfTurn');
  assert.equal(aFeintPlanBlocksAttack(lock,state,'m1:attacker','m0:face-down'),true);
  assert.equal(aFeintPlanBlocksAttack(lock,state,'m0:attacker','m1:other-face-down'),true);
  assert.equal(aFeintPlanBlocksAttack(lock,state,'m1:attacker','m0:face-up'),false);
  assert.deepEqual(state,before);
});

test('the already-declared attack against a face-down target is not retroactively cancelled',()=>{
  const state=makeState({phase:'response',pending:{kind:'attack',actor:1,card:'m1:attacker',target:'m0:face-down',stage:'declare'}});
  const lock=prepareAFeintPlan(state,sourceUid);
  assert.equal(lock.exemptAttackUid,'m1:attacker');
  assert.equal(lock.exemptTargetUid,'m0:face-down');
  assert.equal(aFeintPlanBlocksAttack(lock,state,'m1:attacker','m0:face-down'),false);
  assert.equal(aFeintPlanBlocksAttack(lock,state,'m1:other-attacker','m0:face-down'),true);
});

test('an already-declared face-up attack is not exempted if its target later becomes face-down',()=>{
  const state=makeState({phase:'response',pending:{kind:'attack',actor:1,card:'m1:attacker',target:'m0:face-up',stage:'declare'}});
  const lock=prepareAFeintPlan(state,sourceUid);
  assert.equal(lock.exemptAttackUid,null);
  const target=state.players[0].monsters.find(m=>m.uid==='m0:face-up');
  target.faceUp=false;
  assert.equal(aFeintPlanBlocksAttack(lock,state,'m1:attacker','m0:face-up'),true);
});

test('a direct attack has no exemption and a later face-down target is blocked',()=>{
  const state=makeState({phase:'response',pending:{kind:'attack',actor:1,card:'m1:attacker',stage:'declare'}});
  const lock=prepareAFeintPlan(state,sourceUid);
  assert.equal(lock.exemptAttackUid,null);
  assert.equal(aFeintPlanBlocksAttack(lock,state,'m1:attacker','m0:face-down'),true);
});

test('the lock expires when the turn changes',()=>{
  const state=makeState();
  const lock=prepareAFeintPlan(state,sourceUid);
  state.turn+=1;
  assert.equal(aFeintPlanBlocksAttack(lock,state,'m1:attacker','m0:face-down'),false);
});

test('face-up targets and direct attacks are never blocked',()=>{
  const state=makeState();
  const lock=prepareAFeintPlan(state,sourceUid);
  assert.equal(aFeintPlanBlocksAttack(lock,state,'m1:attacker','m0:face-up'),false);
  assert.equal(aFeintPlanBlocksAttack(lock,state,'m1:attacker',undefined),false);
});

test('a target removed from the field is not treated as a face-down target',()=>{
  const state=makeState();
  const lock=prepareAFeintPlan(state,sourceUid);
  state.players[0].monsters=state.players[0].monsters.filter(m=>m.uid!=='m0:face-down');
  assert.equal(aFeintPlanBlocksAttack(lock,state,'m1:attacker','m0:face-down'),false);
});

test('the Trap cannot activate in the Damage Step or after attack calculation begins',()=>{
  assert.throws(()=>prepareAFeintPlan(makeState({damageStep:true}),sourceUid),/Etapa de Dano/);
  assert.throws(()=>prepareAFeintPlan(makeState({phase:'response',pending:{kind:'attack',actor:1,card:'m1:attacker',target:'m0:face-down',stage:'damage'}}),sourceUid),/após a declaração/);
});

test('the Trap must be face-up and set before the current turn',()=>{
  assert.throws(()=>prepareAFeintPlan(makeState({sourceFaceUp:false}),sourceUid),/Setada em turno anterior/);
  assert.throws(()=>prepareAFeintPlan(makeState({setTurn:3}),sourceUid),/Setada em turno anterior/);
});

test('a duplicate source UID in two backrows is rejected as ambiguous',()=>{
  assert.throws(()=>prepareAFeintPlan(makeState({duplicateSource:true}),sourceUid),/única Zona/);
});

test('a source in the opponent team backrow is controlled by that team, but its physical owner must match',()=>{
  const state=makeState();
  state.players[0].backrow=[];
  state.players[1].backrow.push({uid:'m0:wrong-owner',id:A_FEINT_PLAN_ID,setTurn:1,faceUp:true,resolved:false});
  assert.throws(()=>prepareAFeintPlan(state,'m0:wrong-owner'),/proprietário físico/);
});

test('Trap activation or effect negation is respected',()=>{
  const state=makeState();
  assert.throws(()=>prepareAFeintPlan(state,sourceUid,()=>true),/bloqueado\/negado/);
});

test('the lock is global across both teams and does not mutate the board',()=>{
  const state=makeState();
  const before=structuredClone(state);
  const lock=prepareAFeintPlan(state,sourceUid);
  for(const team of state.players) for(const target of team.monsters) {
    const expected=!target.faceUp;
    assert.equal(aFeintPlanBlocksAttack(lock,state,'m1:attacker',target.uid),expected);
  }
  assert.deepEqual(state,before);
});

test('a source that is not A Feint Plan cannot create this lock',()=>{
  assert.throws(()=>prepareAFeintPlan(makeState({sourceId:'00000000'}),sourceUid),/Setada em turno anterior/);
});
