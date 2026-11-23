'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ARSENAL_BUG_ID,arsenalBugModifier}=require('../dist/arsenalBugTagAdapter');

const INSECT_A='00000011',INSECT_B='00000012',WARRIOR='00000013';
const lookup=id=>({
  [ARSENAL_BUG_ID]:{kind:'monster',race:'Insect'},
  [INSECT_A]:{kind:'monster',race:'Insect'},
  [INSECT_B]:{kind:'monster',race:'Insect'},
  [WARRIOR]:{kind:'monster',race:'Warrior'}
})[id];
function monster(uid,id,faceUp=true){return {uid,id,position:'atk',faceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0};}
function makeState(options={}){
  const ownerSeat=options.ownerSeat??0,team=options.team??ownerSeat%2;
  const players=[
    {id:'tag-team-0',name:'Equipe Azul',lp:4000,deck:[],hand:[],monsters:[],backrow:[],grave:[],extra:[],banished:[],field:null,summoned:false},
    {id:'tag-team-1',name:'Equipe Vermelha',lp:4000,deck:[],hand:[],monsters:[],backrow:[],grave:[],extra:[],banished:[],field:null,summoned:false}
  ];
  const source=monster('m'+ownerSeat+':arsenal',options.sourceId??ARSENAL_BUG_ID,options.sourceFaceUp!==false);
  players[team].monsters.push(source,...(options.otherMonsters??[]).map(m=>({...m})));
  if(options.opponentMonsters)players[1-team].monsters.push(...options.opponentMonsters.map(m=>({...m})));
  return {
    mode:'tag-classic',
    members:[
      {id:'seat-0',name:'Seat 0',team:0},
      {id:'seat-1',name:'Seat 1',team:1},
      {id:'seat-2',name:'Seat 2',team:0},
      {id:'seat-3',name:'Seat 3',team:1}
    ],
    active:[0,1],reserves:{},
    core:{turn:2,players}
  };
}
function uid(state,seat=0){return 'm'+seat+':arsenal';}
function currentAtk(base,modifier){return base+modifier.atk;}
function currentDef(base,modifier){return base+modifier.def;}

test('a lone face-up Arsenal Bug receives the -1000 ATK/DEF delta',()=>{
  const state=makeState();
  const result=arsenalBugModifier(state,uid(state),false,lookup);
  assert.deepEqual({atk:result.atk,def:result.def,applies:result.applies,reason:result.reason},{atk:-1000,def:-1000,applies:true,reason:'no-other-insect'});
  assert.equal(currentAtk(2000,result),1000);
  assert.equal(currentDef(2000,result),1000);
});

test('a face-up Insect controlled by the active teammate keeps Arsenal Bug at 2000/2000',()=>{
  const state=makeState({ownerSeat:2,otherMonsters:[monster('m0:partner-insect',INSECT_A)]});
  const result=arsenalBugModifier(state,uid(state,2),false,lookup);
  assert.equal(result.atk,0);
  assert.equal(result.def,0);
  assert.equal(result.otherFaceUpInsects,1);
  assert.equal(currentAtk(2000,result),2000);
});

test('a face-down Insect does not satisfy the other-Insect condition',()=>{
  const state=makeState({otherMonsters:[monster('m2:set-insect',INSECT_A,false)]});
  const result=arsenalBugModifier(state,uid(state),false,lookup);
  assert.equal(result.atk,-1000);
  assert.equal(result.def,-1000);
  assert.equal(result.otherFaceUpInsects,0);
});

test('an opponent-controlled Insect does not count for this team',()=>{
  const state=makeState({opponentMonsters:[monster('m1:opponent-insect',INSECT_A)]});
  const result=arsenalBugModifier(state,uid(state),false,lookup);
  assert.equal(result.atk,-1000);
  assert.equal(result.otherFaceUpInsects,0);
});

test('two face-up Arsenal Bugs count each other and both remain at 2000/2000',()=>{
  const state=makeState({otherMonsters:[monster('m2:arsenal-partner',ARSENAL_BUG_ID)]});
  const first=arsenalBugModifier(state,'m0:arsenal',false,lookup);
  const second=arsenalBugModifier(state,'m2:arsenal-partner',false,lookup);
  assert.equal(first.atk,0);
  assert.equal(second.atk,0);
  assert.equal(first.otherFaceUpInsects,1);
  assert.equal(second.otherFaceUpInsects,1);
});

test('a face-up non-Insect monster does not count',()=>{
  const state=makeState({otherMonsters:[monster('m2:warrior',WARRIOR)]});
  const result=arsenalBugModifier(state,uid(state),false,lookup);
  assert.equal(result.atk,-1000);
  assert.equal(result.otherFaceUpInsects,0);
});

test('the continuous effect does not apply while Arsenal Bug itself is face-down',()=>{
  const state=makeState({sourceFaceUp:false});
  const result=arsenalBugModifier(state,uid(state),false,lookup);
  assert.equal(result.atk,0);
  assert.equal(result.def,0);
  assert.equal(result.reason,'source-face-down');
});

test('a negated Arsenal Bug contributes no stat reduction',()=>{
  const state=makeState();
  const result=arsenalBugModifier(state,uid(state),true,lookup);
  assert.equal(result.atk,0);
  assert.equal(result.def,0);
  assert.equal(result.reason,'effect-negated');
});

test('the modifier is recalculated when a teammate flips an Insect face-up',()=>{
  const state=makeState({otherMonsters:[monster('m2:set-insect',INSECT_A,false)]});
  const before=arsenalBugModifier(state,uid(state),false,lookup);
  assert.equal(before.atk,-1000);
  state.core.players[0].monsters.find(m=>m.uid==='m2:set-insect').faceUp=true;
  const after=arsenalBugModifier(state,uid(state),false,lookup);
  assert.equal(after.atk,0);
  assert.equal(after.otherFaceUpInsects,1);
});

test('the modifier returns when the last other face-up Insect leaves the field',()=>{
  const state=makeState({otherMonsters:[monster('m2:insect',INSECT_A)]});
  assert.equal(arsenalBugModifier(state,uid(state),false,lookup).atk,0);
  state.core.players[0].monsters=state.core.players[0].monsters.filter(m=>m.uid!=='m2:insect');
  assert.equal(arsenalBugModifier(state,uid(state),false,lookup).atk,-1000);
});

test('an effective Type lookup can account for a Type-changing effect',()=>{
  const state=makeState({otherMonsters:[monster('m2:changed-type',WARRIOR)]});
  const warriorLookup=id=>id===WARRIOR?{kind:'monster',race:'Insect'}:lookup(id);
  const result=arsenalBugModifier(state,uid(state),false,warriorLookup);
  assert.equal(result.atk,0);
  assert.equal(result.otherFaceUpInsects,1);
});

test('multiple other face-up Insects are counted on the shared team field',()=>{
  const state=makeState({otherMonsters:[
    monster('m2:insect-a',INSECT_A),
    monster('m0:insect-b',INSECT_B),
    monster('m2:warrior',WARRIOR)
  ]});
  const result=arsenalBugModifier(state,uid(state),false,lookup);
  assert.equal(result.otherFaceUpInsects,2);
  assert.equal(result.atk,0);
});

test('an Insect in the hand or backrow does not count as a monster on the field',()=>{
  const state=makeState();
  state.core.players[0].hand.push({uid:'m2:hand-insect',id:INSECT_A});
  state.core.players[0].backrow.push({uid:'m2:backrow-insect',id:INSECT_B});
  const result=arsenalBugModifier(state,uid(state),false,lookup);
  assert.equal(result.atk,-1000);
});

test('the source must be physically owned by the team that controls it',()=>{
  const state=makeState({ownerSeat:2,team:1});
  assert.throws(()=>arsenalBugModifier(state,uid(state,2),false,lookup),/equipe controladora/);
});

test('a duplicated source UID in two Monster Zones is rejected',()=>{
  const state=makeState({otherMonsters:[monster('m0:arsenal',ARSENAL_BUG_ID)]});
  assert.throws(()=>arsenalBugModifier(state,uid(state),false,lookup),/única Zona/);
});

test('a non-Arsenal Bug source and a source outside the Monster Zones are rejected',()=>{
  const wrong=makeState({sourceId:WARRIOR});
  assert.throws(()=>arsenalBugModifier(wrong,uid(wrong),false,lookup),/não é Arsenal Bug/);
  const absent=makeState();
  absent.core.players[0].monsters=[];
  assert.throws(()=>arsenalBugModifier(absent,uid(absent),false,lookup),/única Zona/);
});

test('the adapter is pure and does not cache a previous stat condition',()=>{
  const state=makeState({otherMonsters:[monster('m2:insect',INSECT_A)]});
  const before=structuredClone(state);
  const first=arsenalBugModifier(state,uid(state),false,lookup);
  state.core.players[0].monsters.find(m=>m.uid==='m2:insect').faceUp=false;
  const second=arsenalBugModifier(state,uid(state),false,lookup);
  assert.equal(first.atk,0);
  assert.equal(second.atk,-1000);
  assert.deepEqual(state.core.players[0].monsters.find(m=>m.uid==='m0:arsenal'),before.core.players[0].monsters.find(m=>m.uid==='m0:arsenal'));
});
