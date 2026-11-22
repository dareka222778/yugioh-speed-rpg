'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  THREE_HUMP_LACOODA_ID,
  prepareThreeHumpLacooda,
  resolveThreeHumpLacooda
}=require('../dist/threeHumpLacoodaTagAdapter');

function monster(uid,faceUp=true,id=THREE_HUMP_LACOODA_ID){
  return {uid,id,position:'atk',faceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0};
}
function makeState(options={}){
  const copies=options.copies??[
    monster('m0:lacooda-a'),
    monster('m2:lacooda-b'),
    monster('m0:lacooda-c')
  ];
  return {
    version:1,
    players:[
      {
        id:'tag-team-0',name:'Equipe Azul',lp:4000,
        deck:[{uid:'m0:draw-a',id:'DRAW_A'},{uid:'m0:draw-b',id:'DRAW_B'},{uid:'m0:draw-c',id:'DRAW_C'}],
        hand:[],monsters:copies,backrow:[],grave:[],extra:[],field:null,summoned:false
      },
      {
        id:'tag-team-1',name:'Equipe Vermelha',lp:4000,
        deck:[{uid:'m1:opponent-draw',id:'OPPONENT_DRAW'}],
        hand:[],monsters:[monster('m1:opponent-lacooda')],backrow:[],grave:[],extra:[],field:null,summoned:false
      }
    ],
    teamRotation:{
      version:1,cursor:0,active:[0,1],
      reserves:{
        2:{hand:[],deck:[{uid:'m2:partner-draw',id:'PARTNER_DRAW'}],extra:[]},
        3:{hand:[],deck:[],extra:[]}
      }
    },
    turn:4,current:0,phase:'main',priority:0,passes:0,
    pending:null,chain:[],winner:null,reason:'',log:[]
  };
}
function prepare(state,sourceUid='m2:lacooda-b',options={}){
  return prepareThreeHumpLacooda(state,0,0,sourceUid,options.isNegated);
}

test('activation counts face-up copies controlled by the team, not the opposing field, and permits a partner-owned source',()=>{
  const state=makeState(),before=structuredClone(state);
  const activation=prepare(state);
  assert.equal(activation.sourceUid,'m2:lacooda-b');
  assert.equal(activation.team,0);
  assert.equal(activation.activeSeat,0);
  assert.deepEqual(activation.candidateUids,['m0:lacooda-a','m2:lacooda-b','m0:lacooda-c']);
  assert.equal(Object.isFrozen(activation),true);
  assert.equal(Object.isFrozen(activation.candidateUids),true);
  assert.deepEqual(state,before,'activation capture must not mutate the duel');
});

test('two distinct copies are an activation cost and the draw belongs to the active physical Deck',()=>{
  const state=makeState(),activation=prepare(state);
  const plan=resolveThreeHumpLacooda(state,activation,['m2:lacooda-b','m0:lacooda-a']);
  assert.equal(plan.effect,'threeHumpLacooda');
  assert.deepEqual(plan.tributeUids,['m2:lacooda-b','m0:lacooda-a']);
  assert.equal(plan.costTiming,'activation');
  assert.equal(plan.graveyard,'shared-team-graveyard');
  assert.equal(plan.drawSeat,0);
  assert.equal(plan.drawCount,3);
  assert.equal(plan.drawVisibility,'active-seat-only');
  assert.equal(plan.keepPrivateFromPartner,true);
  assert.equal(plan.shuffleDeck,false);
  assert.equal(Object.isFrozen(plan.tributeUids),true);
});

test('the activating copy may remain on the field instead of being Tributed',()=>{
  const state=makeState(),activation=prepare(state,'m0:lacooda-a');
  const plan=resolveThreeHumpLacooda(state,activation,['m2:lacooda-b','m0:lacooda-c']);
  assert.equal(plan.sourceUid,'m0:lacooda-a');
  assert.equal(plan.tributeUids.includes(plan.sourceUid),false);
});

test('exactly two distinct activation candidates are required',()=>{
  const state=makeState(),activation=prepare(state);
  assert.throws(()=>resolveThreeHumpLacooda(state,activation,['m0:lacooda-a']),/exatamente duas/);
  assert.throws(()=>resolveThreeHumpLacooda(state,activation,['m0:lacooda-a','m0:lacooda-a']),/exatamente duas/);
  assert.throws(()=>resolveThreeHumpLacooda(state,activation,['m0:lacooda-a','m1:opponent-lacooda']),/exatamente duas/);
  assert.throws(()=>resolveThreeHumpLacooda(state,activation,['m0:lacooda-a','m2:partner-draw']),/exatamente duas/);
});

test('fewer than three face-up team copies cannot activate, and face-down copies do not count',()=>{
  const two=makeState({copies:[monster('m0:one'),monster('m2:two'),monster('m0:down',false)]});
  assert.throws(()=>prepare(two,'m0:one'),/pelo menos três/);
  const one=makeState({copies:[monster('m0:one'),monster('m2:down',false),monster('m0:down-2',false)]});
  assert.throws(()=>prepare(one,'m0:one'),/pelo menos três/);
});

test('a source that is face-down, not a Lacooda, or effect-negated cannot activate',()=>{
  const down=makeState({copies:[monster('m0:one',false),monster('m2:two'),monster('m0:three')]});
  assert.throws(()=>prepare(down,'m0:one'),/precisa estar face-up/);
  const wrong=makeState({copies:[monster('m0:one',true,'WRONG'),monster('m2:two'),monster('m0:three')]});
  assert.throws(()=>prepare(wrong,'m0:one'),/precisa estar face-up/);
  const negated=makeState();
  assert.throws(()=>prepare(negated,'m2:lacooda-b',{isNegated:()=>true}),/efeito .* negado/);
});

test('the active physical Deck must not borrow cards from the inactive partner',()=>{
  const state=makeState(),activation=prepare(state);
  state.players[0].deck=[{uid:'m2:partner-draw',id:'PARTNER_DRAW'}];
  assert.throws(()=>resolveThreeHumpLacooda(state,activation,['m2:lacooda-b','m0:lacooda-a']),/não pertence ao representante ativo/);
});

test('the activation becomes stale if the physical representative or turn changes',()=>{
  const state=makeState(),activation=prepare(state);
  state.teamRotation.active[0]=2;
  assert.throws(()=>resolveThreeHumpLacooda(state,activation,['m2:lacooda-b','m0:lacooda-a']),/representante ativo mudou/);
  const other=makeState(),otherActivation=prepare(other);
  other.turn+=1;
  assert.throws(()=>resolveThreeHumpLacooda(other,otherActivation,['m2:lacooda-b','m0:lacooda-a']),/turno mudou/);
});

test('the source and Tributed monsters may leave after activation because Tributing is a cost',()=>{
  const state=makeState(),activation=prepare(state);
  state.players[0].monsters=state.players[0].monsters.filter(m=>m.uid==='m0:lacooda-c');
  const plan=resolveThreeHumpLacooda(state,activation,['m2:lacooda-b','m0:lacooda-a']);
  assert.deepEqual(plan.tributeUids,['m2:lacooda-b','m0:lacooda-a']);
  assert.equal(plan.drawCount,3);
});

test('five copies permit a second activation after the first two Tributes; no once-per-turn limit is invented',()=>{
  const state=makeState({copies:[
    monster('m0:a'),monster('m2:b'),monster('m0:c'),monster('m2:d'),monster('m0:e')
  ]});
  const first=prepare(state,'m0:a');
  const firstPlan=resolveThreeHumpLacooda(state,first,['m0:a','m2:b']);
  state.players[0].monsters=state.players[0].monsters.filter(m=>!firstPlan.tributeUids.includes(m.uid));
  const second=prepare(state,'m0:c');
  assert.equal(second.candidateUids.length,3);
  const secondPlan=resolveThreeHumpLacooda(state,second,['m0:c','m2:d']);
  assert.equal(secondPlan.drawCount,3);
});

test('the plan is immutable and never changes cards, Decks, hands or the shared Graveyard',()=>{
  const state=makeState(),before=structuredClone(state),activation=prepare(state);
  const plan=resolveThreeHumpLacooda(state,activation,['m2:lacooda-b','m0:lacooda-a']);
  assert.deepEqual(state,before);
  assert.equal(state.players[0].deck.length,3);
  assert.equal(state.players[0].grave.length,0);
  assert.equal(state.players[1].deck[0].uid,'m1:opponent-draw');
  assert.equal(state.teamRotation.reserves[2].deck[0].uid,'m2:partner-draw');
  assert.equal(plan.drawSeat,activation.activeSeat);
});
