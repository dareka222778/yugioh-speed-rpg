'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  MIRAGE_DRAGON_ID,
  PITCH_BLACK_WARWOLF_ID,
  BATTLE_TRAP_LOCK_RULE,
  battleTrapLockRuleForCard,
  battleTrapLockSources,
  tagTrapActivationAllowed
}=require('../dist/battleTrapLockTagAdapter');
const {continuousRuleIssues}=require('../dist/continuousRules');

const noNegation=()=>false;
function monster(uid,id,faceUp=true){return {uid,id,position:'atk',faceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0};}
function player(team){return {id:'tag-team-'+team,name:team?'Vermelha':'Azul',lp:4000,deck:[],hand:[],monsters:[],backrow:[],grave:[],extra:[],banished:[],field:null,summoned:false};}
function makeState(options={}){
  const players=[player(0),player(1)];
  for(const source of options.sources??[])players[source.team].monsters.push(monster(source.uid,source.id,source.faceUp!==false));
  return {
    version:1,mode:'tag-classic',
    members:[
      {id:'seat-0',name:'Seat 0',team:0},
      {id:'seat-1',name:'Seat 1',team:1},
      {id:'seat-2',name:'Seat 2',team:0},
      {id:'seat-3',name:'Seat 3',team:1}
    ],
    active:options.active??[0,1],cursor:0,reserves:{'2':{deck:[],hand:[]},'3':{deck:[],hand:[]}},
    core:{version:1,players,turn:1,current:0,phase:options.phase??'battle',resume:options.resume??'battle',priority:0,passes:0,pending:{kind:'none'},chain:[],winner:null,reason:'',log:[]}
  };
}

test('both official card identities map to the same validated continuous Trap-only rule',()=>{
  for(const id of [MIRAGE_DRAGON_ID,PITCH_BLACK_WARWOLF_ID]){
    assert.deepEqual(battleTrapLockRuleForCard(id),BATTLE_TRAP_LOCK_RULE);
    assert.deepEqual(continuousRuleIssues([battleTrapLockRuleForCard(id)]),[]);
  }
  assert.equal(battleTrapLockRuleForCard('00000000'),undefined);
});

test('Mirage Dragon blocks only the opposing team during Battle Phase',()=>{
  const state=makeState({sources:[{team:0,uid:'m0:mirage',id:MIRAGE_DRAGON_ID}]});
  assert.equal(tagTrapActivationAllowed(state,0,'trap',noNegation),true);
  assert.equal(tagTrapActivationAllowed(state,1,'trap',noNegation),false);
});

test('Pitch-Black Warwolf applies the identical Battle Phase restriction',()=>{
  const state=makeState({sources:[{team:1,uid:'m3:warwolf',id:PITCH_BLACK_WARWOLF_ID}]});
  assert.equal(tagTrapActivationAllowed(state,1,'trap',noNegation),true);
  assert.equal(tagTrapActivationAllowed(state,0,'trap',noNegation),false);
});

test('Main Phase Trap activations remain legal',()=>{
  const state=makeState({phase:'main',resume:'main',sources:[{team:0,uid:'m0:mirage',id:MIRAGE_DRAGON_ID}]});
  assert.equal(tagTrapActivationAllowed(state,1,'trap',noNegation),true);
  assert.deepEqual(battleTrapLockSources(state,noNegation),[]);
});

test('a response window resumed from Battle Phase keeps the restriction active',()=>{
  const state=makeState({phase:'response',resume:'battle',sources:[{team:0,uid:'m2:warwolf',id:PITCH_BLACK_WARWOLF_ID}]});
  assert.equal(tagTrapActivationAllowed(state,1,'trap',noNegation),false);
});

test('a choice window resumed from Battle Phase keeps the restriction active',()=>{
  const state=makeState({phase:'choice',resume:'battle',sources:[{team:1,uid:'m1:mirage',id:MIRAGE_DRAGON_ID}]});
  assert.equal(tagTrapActivationAllowed(state,0,'trap',noNegation),false);
});

test('response and choice windows resumed from Main Phase do not inherit a stale Battle lock',()=>{
  for(const phase of ['response','choice']){
    const state=makeState({phase,resume:'main',sources:[{team:0,uid:'m0:mirage',id:MIRAGE_DRAGON_ID}]});
    assert.equal(tagTrapActivationAllowed(state,1,'trap',noNegation),true);
  }
});

test('Quick-Play Spells and other non-Trap activations are not blocked',()=>{
  const state=makeState({sources:[{team:0,uid:'m0:mirage',id:MIRAGE_DRAGON_ID}]});
  assert.equal(tagTrapActivationAllowed(state,1,'non-trap',noNegation),true);
});

test('a face-down source does not impose the restriction',()=>{
  const state=makeState({sources:[{team:0,uid:'m0:mirage',id:MIRAGE_DRAGON_ID,faceUp:false}]});
  assert.equal(tagTrapActivationAllowed(state,1,'trap',noNegation),true);
});

test('a negated source does not impose the restriction',()=>{
  const state=makeState({sources:[{team:0,uid:'m0:mirage',id:MIRAGE_DRAGON_ID}]});
  assert.equal(tagTrapActivationAllowed(state,1,'trap',()=>true),true);
});

test('current controller team, not the physical owner encoded in UID, determines the opponent',()=>{
  const state=makeState({sources:[{team:1,uid:'m0:stolen-warwolf',id:PITCH_BLACK_WARWOLF_ID}]});
  assert.equal(tagTrapActivationAllowed(state,1,'trap',noNegation),true);
  assert.equal(tagTrapActivationAllowed(state,0,'trap',noNegation),false);
  assert.deepEqual(battleTrapLockSources(state,noNegation).map(x=>({controllerTeam:x.controllerTeam,restrictedTeam:x.restrictedTeam})),[{controllerTeam:1,restrictedTeam:0}]);
});

test('all four physical seats preserve team targeting across active-seat rotations',()=>{
  const rotations=[[0,1],[2,1],[0,3],[2,3]];
  for(let seat=0;seat<4;seat++){
    const team=seat%2;
    for(const active of rotations){
      const state=makeState({active,sources:[{team,uid:'m'+seat+':source',id:seat%2?PITCH_BLACK_WARWOLF_ID:MIRAGE_DRAGON_ID}]});
      assert.equal(tagTrapActivationAllowed(state,team,'trap',noNegation),true);
      assert.equal(tagTrapActivationAllowed(state,1-team,'trap',noNegation),false);
    }
  }
});

test('two opposing face-up sources lock Trap activations for both teams',()=>{
  const state=makeState({sources:[
    {team:0,uid:'m0:mirage',id:MIRAGE_DRAGON_ID},
    {team:1,uid:'m1:warwolf',id:PITCH_BLACK_WARWOLF_ID}
  ]});
  assert.equal(tagTrapActivationAllowed(state,0,'trap',noNegation),false);
  assert.equal(tagTrapActivationAllowed(state,1,'trap',noNegation),false);
  assert.equal(battleTrapLockSources(state,noNegation).length,2);
});

test('malformed physical source UID is rejected instead of guessing ownership',()=>{
  const state=makeState({sources:[{team:0,uid:'source-without-seat',id:MIRAGE_DRAGON_ID}]});
  assert.throws(()=>battleTrapLockSources(state,noNegation),/UID físico válido/);
});

test('duplicated source UID across team Monster Zones is rejected',()=>{
  const state=makeState({sources:[
    {team:0,uid:'m0:duplicate',id:MIRAGE_DRAGON_ID},
    {team:1,uid:'m0:duplicate',id:PITCH_BLACK_WARWOLF_ID}
  ]});
  assert.throws(()=>battleTrapLockSources(state,noNegation),/UID físico duplicado/);
});

test('the policy is pure and does not alter field, phase, chain or player data',()=>{
  const state=makeState({phase:'response',resume:'battle',sources:[{team:0,uid:'m2:mirage',id:MIRAGE_DRAGON_ID}]});
  const before=structuredClone(state);
  assert.equal(tagTrapActivationAllowed(state,1,'trap',noNegation),false);
  assert.deepEqual(state,before);
});

test('an unknown monster does not create a Trap activation lock',()=>{
  const state=makeState({sources:[{team:0,uid:'m0:unknown',id:'00000000'}]});
  assert.equal(tagTrapActivationAllowed(state,1,'trap',noNegation),true);
});
