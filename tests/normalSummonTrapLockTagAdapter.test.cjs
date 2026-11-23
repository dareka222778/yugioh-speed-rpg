'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  EAGLE_EYE_ID,
  CREEPING_DOOM_MANTA_ID,
  INVASION_OF_FLAMES_ID,
  TACTICAL_ESPIONAGE_EXPERT_ID,
  NORMAL_SUMMON_TRAP_LOCK_RULE,
  normalSummonTrapLockRuleForCard,
  normalSummonTrapLockActive,
  tagTrapActivationAllowedDuringNormalSummon
}=require('../dist/normalSummonTrapLockTagAdapter');
const {continuousRuleIssues}=require('../dist/continuousRules');

const ids=[EAGLE_EYE_ID,CREEPING_DOOM_MANTA_ID,INVASION_OF_FLAMES_ID,TACTICAL_ESPIONAGE_EXPERT_ID];
const noNegation=()=>false;
function player(team){return {id:'tag-team-'+team,name:team?'Vermelha':'Azul',lp:4000,deck:[],hand:[],monsters:[],backrow:[],grave:[],extra:[],banished:[],field:null,summoned:false};}
function monster(uid,id,faceUp=true){return {uid,id,position:'atk',faceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0};}
function makeState(options={}){
  const actor=options.actor??0,id=options.id??EAGLE_EYE_ID,uid=options.uid??'m0:normal-summon';
  const players=[player(0),player(1)];
  if(options.source!==false)players[actor].monsters.push(monster(uid,id,options.faceUp!==false));
  return {
    version:1,mode:'tag-classic',
    members:[
      {id:'seat-0',name:'Seat 0',team:0},
      {id:'seat-1',name:'Seat 1',team:1},
      {id:'seat-2',name:'Seat 2',team:0},
      {id:'seat-3',name:'Seat 3',team:1}
    ],
    active:options.active??[0,1],cursor:0,reserves:{'2':{deck:[],hand:[]},'3':{deck:[],hand:[]}},
    core:{version:1,players,turn:1,current:actor,phase:options.phase??'response',resume:'main',priority:actor,passes:0,
      pending:options.pending??{kind:'summon',actor,card:uid,id},pendingNegated:options.pendingNegated??false,
      chain:[],winner:null,reason:'',log:[]}
  };
}

test('all four official identities map to the shared both-teams Normal Summon Trap lock',()=>{
  for(const id of ids){
    assert.deepEqual(normalSummonTrapLockRuleForCard(id),NORMAL_SUMMON_TRAP_LOCK_RULE);
    assert.deepEqual(continuousRuleIssues([normalSummonTrapLockRuleForCard(id)]),[]);
  }
  assert.equal(normalSummonTrapLockRuleForCard('00000000'),undefined);
});

test('Eagle Eye blocks Trap activations by both teams after its successful Normal Summon',()=>{
  const state=makeState({id:EAGLE_EYE_ID});
  assert.equal(normalSummonTrapLockActive(state,noNegation),true);
  assert.equal(tagTrapActivationAllowedDuringNormalSummon(state,0,'trap',noNegation),false);
  assert.equal(tagTrapActivationAllowedDuringNormalSummon(state,1,'trap',noNegation),false);
});

test('Creeping Doom Manta uses the same summon-response lock',()=>{
  const state=makeState({id:CREEPING_DOOM_MANTA_ID});
  assert.equal(normalSummonTrapLockActive(state,noNegation),true);
});

test('Invasion of Flames uses the same summon-response lock',()=>{
  const state=makeState({id:INVASION_OF_FLAMES_ID});
  assert.equal(normalSummonTrapLockActive(state,noNegation),true);
});

test('Tactical Espionage Expert uses the same summon-response lock',()=>{
  const state=makeState({id:TACTICAL_ESPIONAGE_EXPERT_ID});
  assert.equal(normalSummonTrapLockActive(state,noNegation),true);
});

test('the restriction is Trap-only and does not block Quick-Play Spells',()=>{
  const state=makeState();
  assert.equal(tagTrapActivationAllowedDuringNormalSummon(state,1,'non-trap',noNegation),true);
});

test('a Special Summon does not activate this Normal Summon-only policy',()=>{
  const state=makeState({pending:{kind:'specialSummon',actor:0,card:'m0:normal-summon',id:EAGLE_EYE_ID}});
  assert.equal(normalSummonTrapLockActive(state,noNegation),false);
  assert.equal(tagTrapActivationAllowedDuringNormalSummon(state,1,'trap',noNegation),true);
});

test('a Flip Summon does not activate this Normal Summon-only policy',()=>{
  const state=makeState({pending:{kind:'flip',actor:0,card:'m0:normal-summon',id:EAGLE_EYE_ID}});
  assert.equal(normalSummonTrapLockActive(state,noNegation),false);
});

test('the lock exists only in the summon response window',()=>{
  for(const phase of ['main','battle','choice','discard','finished']){
    const state=makeState({phase});
    assert.equal(normalSummonTrapLockActive(state,noNegation),false);
  }
});

test('a negated Normal Summon does not create the lock',()=>{
  const state=makeState({pendingNegated:true});
  assert.equal(normalSummonTrapLockActive(state,noNegation),false);
});

test('a face-down or removed source does not create the lock',()=>{
  assert.equal(normalSummonTrapLockActive(makeState({faceUp:false}),noNegation),false);
  assert.equal(normalSummonTrapLockActive(makeState({source:false}),noNegation),false);
});

test('a negated monster effect does not create the lock',()=>{
  const state=makeState();
  assert.equal(normalSummonTrapLockActive(state,()=>true),false);
});

test('pending card identity must match the face-up monster on the field',()=>{
  const state=makeState({pending:{kind:'summon',actor:0,card:'m0:normal-summon',id:TACTICAL_ESPIONAGE_EXPERT_ID}});
  assert.equal(normalSummonTrapLockActive(state,noNegation),false);
});

test('current controller team controls the summon window even if the physical UID belongs to the partner team',()=>{
  const state=makeState({actor:1,uid:'m0:stolen-eagle',id:EAGLE_EYE_ID});
  assert.equal(tagTrapActivationAllowedDuringNormalSummon(state,0,'trap',noNegation),false);
  assert.equal(tagTrapActivationAllowedDuringNormalSummon(state,1,'trap',noNegation),false);
});

test('all four physical seats preserve the lock across active-seat rotations',()=>{
  const rotations=[[0,1],[2,1],[0,3],[2,3]];
  for(let seat=0;seat<4;seat++)for(const active of rotations){
    const state=makeState({actor:seat%2,uid:'m'+seat+':source',active,id:ids[seat]});
    assert.equal(tagTrapActivationAllowedDuringNormalSummon(state,0,'trap',noNegation),false);
    assert.equal(tagTrapActivationAllowedDuringNormalSummon(state,1,'trap',noNegation),false);
  }
});

test('the adapter rejects malformed physical source identities',()=>{
  const state=makeState({uid:'unknown-seat:source'});
  assert.throws(()=>normalSummonTrapLockActive(state,noNegation),/UID físico válido/);
});

test('the adapter is pure and does not mutate pending, phase, field or player data',()=>{
  const state=makeState({id:INVASION_OF_FLAMES_ID});
  const before=structuredClone(state);
  assert.equal(tagTrapActivationAllowedDuringNormalSummon(state,1,'trap',noNegation),false);
  assert.deepEqual(state,before);
});

test('an unknown pending card cannot create the lock',()=>{
  const state=makeState({id:'00000000'});
  assert.equal(normalSummonTrapLockActive(state,noNegation),false);
});
