'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  EIGHT_CLAWS_SCORPION_ID,
  planEightClawsTurnDown,
  prepareEightClawsBattleEffect,
  resolveEightClawsBattleEffect
}=require('../dist/eightClawsScorpionTagAdapter');

function monster(uid,id,faceUp=true,position='atk',extra={}){
  return {uid,id,position,faceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0,...extra};
}
function makeState(options={}){
  const source=monster('m2:scorpion-partner',EIGHT_CLAWS_SCORPION_ID,true,'atk',options.sourceExtra??{});
  const target=monster('m1:target', 'TARGET', options.targetFaceUp??true, options.targetPosition??'atk');
  return {
    version:1,
    players:[
      {id:'tag-team-0',name:'Equipe Azul',lp:4000,deck:[],hand:[],monsters:[source],backrow:[],grave:[],extra:[],field:null,summoned:false},
      {id:'tag-team-1',name:'Equipe Vermelha',lp:4000,deck:[],hand:[],monsters:[target],backrow:[],grave:[],extra:[],field:null,summoned:false}
    ],
    teamRotation:{
      version:1,cursor:0,active:[0,1],
      reserves:{2:{hand:[],deck:[],extra:[]},3:{hand:[],deck:[],extra:[]}}
    },
    turn:4,current:0,phase:options.phase??'response',resume:'battle',priority:1,passes:0,
    pending:options.pending??{kind:'attack',actor:0,card:source.uid,target:target.uid,stage:'damage',defenders:[target.uid]},
    chain:[],winner:null,reason:'',log:[]
  };
}
function snapshot(state){
  return {sourceUid:'m2:scorpion-partner',targetUid:'m1:target',team:0,activeSeat:0,turn:state.turn,targetWasFaceDownDefenseAtDeclaration:true};
}

test('the once-per-turn Ignition Effect plans face-down Defense and records effectUsedTurn',()=>{
  const state=makeState({phase:'main',pending:{kind:'none'}});
  const before=structuredClone(state);
  const plan=planEightClawsTurnDown(state,0,0,'m2:scorpion-partner');
  assert.equal(plan.position,'def');
  assert.equal(plan.faceUp,false);
  assert.equal(plan.effectUsedTurn,state.turn);
  assert.equal(plan.sourceUid,'m2:scorpion-partner','a partner-owned monster controlled by the team can activate');
  assert.deepEqual(state,before,'the adapter emits a plan and never mutates the field');
});

test('Flip Summoning after using the effect does not reset the once-per-turn marker',()=>{
  const state=makeState({phase:'main',pending:{kind:'none'}});
  const plan=planEightClawsTurnDown(state,0,0,'m2:scorpion-partner');
  const source=state.players[0].monsters[0];
  source.effectUsedTurn=plan.effectUsedTurn;
  source.faceUp=true;
  source.position='atk';
  assert.throws(()=>planEightClawsTurnDown(state,0,0,source.uid),/já usou este efeito/);
});

test('the turn-down effect is Main Phase only and respects effect negation',()=>{
  const response=makeState({phase:'response',pending:{kind:'none'}});
  assert.throws(()=>planEightClawsTurnDown(response,0,0,'m2:scorpion-partner'),/Main Phase/);
  const main=makeState({phase:'main',pending:{kind:'none'}});
  assert.throws(()=>planEightClawsTurnDown(main,0,0,'m2:scorpion-partner',()=>true),/efeito .* negado/);
});

test('the battle trigger uses the face-down Defense snapshot captured before the engine reveals the target',()=>{
  const state=makeState({targetFaceUp:true,targetPosition:'atk'});
  const before=structuredClone(state);
  const activation=prepareEightClawsBattleEffect(state,snapshot(state));
  assert.ok(activation);
  assert.equal(activation.targetWasFaceDownDefenseAtDeclaration,true);
  assert.equal(activation.sourceUid,'m2:scorpion-partner');
  assert.deepEqual(state,before);
});

test('a target that was face-up at attack declaration does not trigger the 2400 ATK effect',()=>{
  const state=makeState();
  const context={...snapshot(state),targetWasFaceDownDefenseAtDeclaration:false};
  assert.equal(prepareEightClawsBattleEffect(state,context),undefined);
});

test('the target may be face-up by resolution and 8-Claws Scorpion still becomes exactly 2400 ATK',()=>{
  const state=makeState({targetFaceUp:true,targetPosition:'atk'});
  state.players[0].monsters[0].atkBoost=900;
  const activation=prepareEightClawsBattleEffect(state,snapshot(state));
  const plan=resolveEightClawsBattleEffect(state,activation);
  assert.equal(plan.atkMode,'set');
  assert.equal(plan.atkValue,2400);
  assert.equal(plan.duration,'damage-calculation-only');
  assert.equal(plan.targetNeedNotRemainFaceDown,true);
  assert.equal(plan.equipModifiersDoNotChangeSetValue,true);
});

test('the target may remain face-down Defense at resolution; the same set-value applies',()=>{
  const state=makeState({targetFaceUp:false,targetPosition:'def'});
  const activation=prepareEightClawsBattleEffect(state,snapshot(state));
  const plan=resolveEightClawsBattleEffect(state,activation);
  assert.equal(plan.atkValue,2400);
});

test('the battle activation requires the exact current attack source and target',()=>{
  const state=makeState();
  const wrongSource={...snapshot(state),sourceUid:'m0:other'};
  assert.throws(()=>prepareEightClawsBattleEffect(state,wrongSource),/não corresponde à declaração/);
  const wrongTarget={...snapshot(state),targetUid:'m1:other'};
  assert.throws(()=>prepareEightClawsBattleEffect(state,wrongTarget),/não corresponde à declaração/);
});

test('the battle target must still exist when damage calculation resolves',()=>{
  const state=makeState();
  const activation=prepareEightClawsBattleEffect(state,snapshot(state));
  state.players[1].monsters=[];
  assert.throws(()=>resolveEightClawsBattleEffect(state,activation),/deixou o campo/);
});

test('the trigger is not prepared or resolved while the source effect is negated',()=>{
  const state=makeState();
  assert.equal(prepareEightClawsBattleEffect(state,snapshot(state),()=>true),undefined);
  const activation=prepareEightClawsBattleEffect(state,snapshot(state));
  assert.equal(resolveEightClawsBattleEffect(state,activation,()=>true),undefined);
});

test('stale turn and physical representative snapshots are rejected',()=>{
  const state=makeState(),activation=prepareEightClawsBattleEffect(state,snapshot(state));
  state.turn+=1;
  assert.throws(()=>resolveEightClawsBattleEffect(state,activation),/turno mudou/);
  const other=makeState(),otherActivation=prepareEightClawsBattleEffect(other,snapshot(other));
  other.teamRotation.active[0]=2;
  assert.throws(()=>resolveEightClawsBattleEffect(other,otherActivation),/representante ativo mudou/);
});

test('a stale or non-8-Claws source cannot use the turn-down effect',()=>{
  const wrong=makeState({phase:'main',pending:{kind:'none'}});
  wrong.players[0].monsters[0].id='WRONG';
  assert.throws(()=>planEightClawsTurnDown(wrong,0,0,'m2:scorpion-partner'),/precisa estar face-up/);
  const down=makeState({phase:'main',pending:{kind:'none'}});
  down.players[0].monsters[0].faceUp=false;
  assert.throws(()=>planEightClawsTurnDown(down,0,0,'m2:scorpion-partner'),/precisa estar face-up/);
});

test('the battle plan never changes field cards, LP, hands or Decks',()=>{
  const state=makeState(),before=structuredClone(state);
  const activation=prepareEightClawsBattleEffect(state,snapshot(state));
  const plan=resolveEightClawsBattleEffect(state,activation);
  assert.equal(plan.atkValue,2400);
  assert.deepEqual(state,before);
});
