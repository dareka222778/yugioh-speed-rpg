'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {tagInventory}=require('../dist/tagDuel');
const {
  THE_SHALLOW_GRAVE_ID,
  getTheShallowGraveCandidates,
  planTheShallowGraveActivation,
  registerTheShallowGraveActivation,
  planTheShallowGraveResolution,
  resolveTheShallowGraveResolution
}=require('../dist/theShallowGraveTagAdapter');

const lookup=id=>{
  if(id===THE_SHALLOW_GRAVE_ID)return {kind:'spell'};
  if(id==='spell')return {kind:'spell'};
  if(id==='fusion')return {kind:'monster',monsterType:'fusion'};
  if(id==='ritual')return {kind:'monster',monsterType:'ritual'};
  if(id==='normal')return {kind:'monster',monsterType:'normal'};
  return {kind:'monster',monsterType:'effect'};
};
const ref=(uid,id='normal',extra={})=>({uid,id,...extra});
const refs=(seat,prefix,count)=>Array.from({length:count},(_,i)=>ref('m'+seat+':'+prefix+'-'+i));
const monster=(card,owner)=>({...card,owner,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});

function makeState({
  cursor=0,sourceId=THE_SHALLOW_GRAVE_ID,
  grave0,grave1,monsters0=[],monsters1=[],backrow0=[],backrow1=[],
  deck0,deck1,hand0,hand1,extra0,extra1,reserveHands={},reserveDecks={},
  field0=null,field1=null
}={}){
  const active=cursor===2?[2,1]:cursor===3?[0,3]:[0,1];
  const source=ref('m'+cursor+':shallow-grave',sourceId);
  const reserves={};
  for(const seat of [0,1,2,3])if(!active.includes(seat)){
    reserves[String(seat)]={
      deck:reserveDecks[seat]??refs(seat,'reserve-deck',2),
      hand:reserveHands[seat]??refs(seat,'reserve-hand',2),
      extra:refs(seat,'reserve-extra',5)
    };
  }
  const g0=grave0??[ref('m0:blue-target')];
  const g1=grave1??[ref('m1:red-target')];
  const players=[
    {
      id:'tag-team-0',name:'Equipe Azul',lp:4000,
      deck:deck0??refs(active[0],'deck-a',8),
      hand:hand0??(cursor%2===0?[source,ref('m'+active[0]+':blue-hand')]:refs(active[0],'hand-a',2)),
      monsters:monsters0,backrow:backrow0,grave:g0,extra:extra0??refs(active[0],'extra-a',5),
      banished:[],field:field0,summoned:false
    },
    {
      id:'tag-team-1',name:'Equipe Vermelha',lp:4000,
      deck:deck1??refs(active[1],'deck-b',8),
      hand:hand1??(cursor%2===1?[source,ref('m'+active[1]+':red-hand')]:refs(active[1],'hand-b',2)),
      monsters:monsters1,backrow:backrow1,grave:g1,extra:extra1??refs(active[1],'extra-b',5),
      banished:[],field:field1,summoned:false
    }
  ];
  const teamRotation={version:1,cursor,active,reserves};
  const core={
    version:1,players,turn:1,current:cursor%2,phase:'main',resume:'main',
    priority:cursor%2,passes:0,pending:{kind:'none'},chain:[],winner:null,reason:'',
    log:[],teamRotation,cardLifetimes:{}
  };
  const members=[
    {id:'p0',name:'P0',team:0},{id:'p1',name:'P1',team:1},
    {id:'p2',name:'P2',team:0},{id:'p3',name:'P3',team:1}
  ];
  const state={version:1,mode:'tag-classic',members,active,cursor,reserves,core};
  synchronizeCardLifetimes(core);
  return state;
}
const defaultTargets=['m0:blue-target','m1:red-target'];
const activate=(state,id='shallow-1',uids=defaultTargets)=>{
  const sourceUid='m'+state.cursor+':shallow-grave';
  const plan=planTheShallowGraveActivation(state,sourceUid,id,uids,lookup);
  return {plan,state:registerTheShallowGraveActivation(state,plan,lookup)};
};
const resolve=(state,id='shallow-1',negated=false)=>{
  const plan=planTheShallowGraveResolution(state,id);
  return resolveTheShallowGraveResolution(state,plan,negated,lookup);
};
const inventory=state=>[
  ...tagInventory(state),
  ...Object.values(state.reserves).flatMap(held=>[...held.deck,...held.hand,...(held.extra??[])])
].map(card=>card.uid+'='+card.id).sort();
const move=(state,team,uid,from,to)=>{
  const list=state.core.players[team][from];
  const index=list.findIndex(card=>card.uid===uid);
  assert.notEqual(index,-1);
  const [card]=list.splice(index,1);
  if(to==='field')state.core.players[team].field=card;
  else state.core.players[team][to].push(card);
  synchronizeCardLifetimes(state.core);
};

test('Normal Spell is activated only from the active physical representative hand during Main Phase',()=>{
  const state=makeState();
  const plan=planTheShallowGraveActivation(state,'m0:shallow-grave','main-only',defaultTargets,lookup);
  assert.equal(plan.controllerSeat,0);assert.equal(plan.controllerTeam,0);assert.equal(plan.opponentSeat,1);
  for(const phase of ['battle','end']){
    const invalid=structuredClone(state);invalid.core.phase=phase;
    assert.throws(()=>planTheShallowGraveActivation(invalid,'m0:shallow-grave','bad-'+phase,defaultTargets,lookup),/Main Phase/);
  }
});
test('a card in the inactive partner reserve hand cannot activate the Spell',()=>{
  const state=makeState();
  state.core.players[0].hand=state.core.players[0].hand.filter(card=>card.uid!=='m0:shallow-grave');
  state.reserves['2'].hand.push(ref('m2:shallow-grave',THE_SHALLOW_GRAVE_ID));
  state.core.teamRotation.reserves=state.reserves;
  synchronizeCardLifetimes(state.core);
  assert.throws(()=>planTheShallowGraveActivation(state,'m2:shallow-grave','reserve',defaultTargets,lookup),/representante físico ativo/);
});
test('wrong card, missing source and source outside the active hand are rejected',()=>{
  const wrong=makeState({sourceId:'99999999'});
  assert.throws(()=>planTheShallowGraveActivation(wrong,'m0:shallow-grave','wrong-card',defaultTargets,lookup),/mão do representante ativo/);
  assert.throws(()=>planTheShallowGraveActivation(makeState({hand0:refs(0,'other',2)}),'m0:shallow-grave','missing',defaultTargets,lookup),/mão do representante ativo/);
  const deck=makeState();
  deck.core.players[0].hand=deck.core.players[0].hand.filter(card=>card.uid!=='m0:shallow-grave');
  deck.core.players[0].deck.push(ref('m0:shallow-grave',THE_SHALLOW_GRAVE_ID));
  synchronizeCardLifetimes(deck.core);
  assert.throws(()=>planTheShallowGraveActivation(deck,'m0:shallow-grave','deck-source',defaultTargets,lookup),/mão do representante ativo/);
});
test('a pending chain or decision prevents a new activation',()=>{
  const state=makeState();state.core.chain.push({kind:'fixture'});
  assert.throws(()=>planTheShallowGraveActivation(state,'m0:shallow-grave','chain',defaultTargets,lookup),/decisão ou corrente/);
  const choice=makeState();choice.core.choice={kind:'fixture'};
  assert.throws(()=>planTheShallowGraveActivation(choice,'m0:shallow-grave','choice',defaultTargets,lookup),/decisão ou corrente/);
});
test('both teams must have a legal monster and a free shared Monster Zone at activation',()=>{
  const full=[0,1,2].map(i=>monster(ref('m0:field-'+i),0));
  const state=makeState({monsters0:full});
  assert.deepEqual(getTheShallowGraveCandidates(state,0,lookup),[]);
  assert.throws(()=>planTheShallowGraveActivation(state,'m0:shallow-grave','full-at-activation',defaultTargets,lookup),/Cada equipe precisa/);
  const noTarget=makeState({grave1:[ref('m1:only-spell','spell')]});
  assert.throws(()=>planTheShallowGraveActivation(noTarget,'m0:shallow-grave','no-opponent-target',defaultTargets,lookup),/Cada equipe precisa/);
});
test('targets are selected from each team own Graveyard at activation, not from the opponent',()=>{
  const state=makeState({grave0:[ref('m0:blue-target'),ref('m0:blue-second')],grave1:[ref('m1:red-target'),ref('m1:red-second')]});
  const plan=planTheShallowGraveActivation(state,'m0:shallow-grave','team-targets',['m0:blue-second','m1:red-second'],lookup);
  assert.deepEqual(plan.targets,['m0:blue-second','m1:red-second']);
  assert.throws(()=>planTheShallowGraveActivation(state,'m0:shallow-grave','cross-team',['m1:red-target','m0:blue-target'],lookup),/próprio Cemitério/);
  assert.throws(()=>planTheShallowGraveActivation(state,'m0:shallow-grave','same-target',['m0:blue-target','m0:blue-target'],lookup),/distinto por equipe/);
});
test('non-monsters, tokens and improperly summoned Fusion/Ritual monsters are not legal targets',()=>{
  const state=makeState({grave0:[
    ref('m0:blue-target'),ref('m0:spell','spell'),
    ref('m0:token','normal',{entityKind:'token'}),
    ref('m0:fusion','fusion'),ref('m0:ritual','ritual'),
    ref('m0:proper-fusion','fusion',{properlySummoned:true}),
    ref('m0:proper-ritual','ritual',{properlySummoned:true})
  ]});
  assert.deepEqual(getTheShallowGraveCandidates(state,0,lookup),[
    'm0:blue-target','m0:proper-fusion','m0:proper-ritual'
  ]);
});
test('both chosen monsters are summoned face-down Defense and retain physical owners',()=>{
  const state=makeState({grave0:[ref('m2:blue-partner')],grave1:[ref('m3:red-partner')]});
  const {state:pending}=activate(state,'partners',['m2:blue-partner','m3:red-partner']);
  const result=resolve(pending,'partners');
  assert.equal(result.status,'both');assert.equal(result.summoned.length,2);
  const blue=result.state.core.players[0].monsters[0],red=result.state.core.players[1].monsters[0];
  assert.equal(blue.uid,'m2:blue-partner');assert.equal(blue.owner,2);
  assert.equal(blue.faceUp,false);assert.equal(blue.position,'def');
  assert.equal(red.uid,'m3:red-partner');assert.equal(red.owner,3);
  assert.equal(red.faceUp,false);assert.equal(red.position,'def');
});
test('targets are frozen at activation; a later Graveyard card cannot replace either target',()=>{
  const state=makeState();
  const {state:pending}=activate(state,'frozen');
  pending.core.players[0].grave.push(ref('m0:late-blue'));
  pending.core.players[1].grave.push(ref('m1:late-red'));
  synchronizeCardLifetimes(pending.core);
  const result=resolve(pending,'frozen');
  assert.deepEqual(result.summoned.map(x=>x.uid),defaultTargets);
  assert.equal(result.state.core.players[0].monsters.some(x=>x.uid==='m0:late-blue'),false);
});
test('if one target leaves its Graveyard, the other team still resolves independently',()=>{
  const {state:pending}=activate(makeState(),'partial');
  move(pending,0,'m0:blue-target','grave','banished');
  const result=resolve(pending,'partial');
  assert.equal(result.status,'partial');assert.equal(result.summoned.length,1);
  assert.equal(result.summoned[0].team,1);
  assert.equal(result.state.core.players[1].monsters[0].uid,'m1:red-target');
});
test('a target moved to the opposing Graveyard is not stolen or summoned by the wrong team',()=>{
  const {state:pending}=activate(makeState(),'crossed');
  move(pending,0,'m0:blue-target','grave','banished');
  move(pending,0,'m0:blue-target','banished','grave');
  const card=pending.core.players[0].grave.pop();
  pending.core.players[1].grave.push(card);
  synchronizeCardLifetimes(pending.core);
  const result=resolve(pending,'crossed');
  assert.equal(result.status,'partial');
  assert.equal(result.summoned.some(x=>x.uid==='m0:blue-target'),false);
  assert.equal(result.state.core.players[1].monsters[0].uid,'m1:red-target');
});
test('leaving and returning to the same Graveyard changes the target epoch and invalidates the old target',()=>{
  const {state:pending}=activate(makeState(),'epoch');
  move(pending,0,'m0:blue-target','grave','banished');
  move(pending,0,'m0:blue-target','banished','grave');
  const result=resolve(pending,'epoch');
  assert.equal(result.status,'partial');
  assert.equal(result.summoned.some(x=>x.uid==='m0:blue-target'),false);
});
test('a Monster Zone filled after activation blocks only that team at resolution',()=>{
  const {state:pending}=activate(makeState(),'zone-after');
  pending.core.players[0].monsters=[0,1,2].map(i=>monster(ref('m0:occupied-'+i),0));
  synchronizeCardLifetimes(pending.core);
  const result=resolve(pending,'zone-after');
  assert.equal(result.status,'partial');
  assert.equal(result.state.core.players[0].monsters.length,3);
  assert.equal(result.state.core.players[1].monsters[0].uid,'m1:red-target');
});
test('negation consumes the activation receipt without moving either target',()=>{
  const {state:pending}=activate(makeState(),'negated');
  const before=inventory(pending);
  const result=resolve(pending,'negated',true);
  assert.equal(result.status,'negated');
  assert.deepEqual(inventory(result.state),before);
  assert.equal(result.state.shallowGrave.resolved.negated,true);
});
test('the Spell source may leave the hand after activation without cancelling the effect',()=>{
  const {state:pending}=activate(makeState(),'source-moved');
  move(pending,0,'m0:shallow-grave','hand','grave');
  const result=resolve(pending,'source-moved');
  assert.equal(result.status,'both');
});
test('pending targets and replay protection survive JSON save/restore',()=>{
  const {state:pending}=activate(makeState(),'json');
  const restored=JSON.parse(JSON.stringify(pending));
  const result=resolve(restored,'json');
  assert.equal(result.status,'both');
  assert.throws(()=>planTheShallowGraveResolution(result.state,'json'),/ausente|resolvida|obsoleta/);
});
test('activationId cannot be reused while pending or after resolution',()=>{
  const first=activate(makeState(),'unique');
  assert.throws(()=>planTheShallowGraveActivation(first.state,'m0:shallow-grave','unique',defaultTargets,lookup),/já utilizado/);
  const result=resolve(first.state,'unique');
  assert.throws(()=>planTheShallowGraveActivation(result.state,'m0:shallow-grave','unique',defaultTargets,lookup),/já utilizado/);
});
test('malformed and duplicate UIDs are rejected before target selection',()=>{
  const malformed=makeState({grave0:[ref('bad:uid')]});
  assert.throws(()=>planTheShallowGraveActivation(malformed,'m0:shallow-grave','malformed',['bad:uid','m1:red-target'],lookup),/UID|próprio Cemitério/);
  const duplicate=makeState();
  duplicate.core.players[0].grave.push(ref('m0:blue-target'));
  assert.throws(()=>planTheShallowGraveActivation(duplicate,'m0:shallow-grave','duplicate',defaultTargets,lookup),/duplicado/);
});
test('the source team and target teams remain correct for all four physical turn rotations',()=>{
  for(const cursor of [0,1,2,3]){
    const state=makeState({cursor,grave0:[ref('m2:blue-target')],grave1:[ref('m3:red-target')]});
    const uids=['m2:blue-target','m3:red-target'];
    const {state:pending}=activate(state,'rotation-'+cursor,uids);
    const result=resolve(pending,'rotation-'+cursor);
    assert.equal(result.status,'both');
    assert.equal(result.state.core.players[0].monsters[0].owner,2);
    assert.equal(result.state.core.players[1].monsters[0].owner,3);
    assert.equal(result.state.core.current,cursor%2);
  }
});
test('three backrow slots coexist with a separate Field Zone; fourth slots are rejected',()=>{
  const state=makeState({
    backrow0:[0,1,2].map(i=>ref('m0:back-'+i)),
    backrow1:[0,1,2].map(i=>ref('m1:back-'+i)),
    field0:ref('m0:field-spell'),field1:ref('m1:field-spell')
  });
  assert.equal(resolve(activate(state,'field-separated').state,'field-separated').status,'both');
  const invalid=makeState({backrow0:[0,1,2,3].map(i=>ref('m0:back-'+i))});
  assert.throws(()=>planTheShallowGraveActivation(invalid,'m0:shallow-grave','four-backrow',defaultTargets,lookup),/Zonas 3\+3/);
});
test('the three Monster Zone and Extra Deck five limits are enforced',()=>{
  const invalid=makeState({monsters0:[0,1,2,3].map(i=>monster(ref('m0:monster-'+i),0))});
  assert.throws(()=>planTheShallowGraveActivation(invalid,'m0:shallow-grave','four-monsters',defaultTargets,lookup),/Zonas 3\+3/);
  const extra=makeState({extra0:refs(0,'extra',6)});
  assert.throws(()=>planTheShallowGraveActivation(extra,'m0:shallow-grave','extra-six',defaultTargets,lookup),/Extra Deck/);
});
test('hands above six are preserved until End Phase and Deck arrays are not truncated',()=>{
  const hand=[ref('m0:shallow-grave',THE_SHALLOW_GRAVE_ID),...refs(0,'hand',6)];
  const deck=refs(0,'deck',8);
  const state=makeState({hand0:hand,deck0:deck});
  const result=resolve(activate(state,'hand-seven').state,'hand-seven');
  assert.equal(result.state.core.players[0].hand.length,7);
  assert.equal(result.state.core.players[0].deck.length,8);
});
test('the activation plan and resolution never mutate the caller input',()=>{
  const state=makeState();
  const before=structuredClone(state);
  const plan=planTheShallowGraveActivation(state,'m0:shallow-grave','immutable',defaultTargets,lookup);
  assert.deepEqual(state,before);
  const registered=registerTheShallowGraveActivation(state,plan,lookup);
  assert.deepEqual(state,before);
  const resolution=planTheShallowGraveResolution(registered,'immutable');
  const result=resolveTheShallowGraveResolution(registered,resolution,false,lookup);
  assert.deepEqual(registered.shallowGrave.pending.immutable.targets,defaultTargets);
  assert.equal(result.status,'both');
});
test('the physical inventory of inactive partners is conserved through resolution',()=>{
  const state=makeState();
  const before=inventory(state);
  const result=resolve(activate(state,'reserve-conservation').state,'reserve-conservation');
  assert.deepEqual(inventory(result.state),before);
  for(const [seat,held] of Object.entries(result.state.reserves)){
    assert.ok(held.deck.every(card=>card.uid.startsWith('m'+seat+':')));
    assert.ok(held.hand.every(card=>card.uid.startsWith('m'+seat+':')));
  }
});
test('Deck construction size is not applied as a mid-duel minimum',()=>{
  const state=makeState({deck0:refs(0,'short-deck',1),deck1:refs(1,'short-deck',1)});
  assert.equal(resolve(activate(state,'short-deck').state,'short-deck').status,'both');
  assert.equal(state.core.players[0].deck.length,1);
});
