'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {tagInventory}=require('../dist/tagDuel');
const {
  PREMATURE_BURIAL_ID,
  getPrematureBurialCandidates,
  planPrematureBurialActivation,
  registerPrematureBurialActivation,
  planPrematureBurialResolution,
  resolvePrematureBurialResolution,
  destroyPrematureBurial,
  removePrematureBurialWithoutDestruction,
  onPrematureBurialMonsterLeavesField
}=require('../dist/prematureBurialTagAdapter');

const lookup=id=>{
  if(id===PREMATURE_BURIAL_ID||id==='spell')return {kind:'spell'};
  if(id==='fusion')return {kind:'monster',monsterType:'fusion'};
  if(id==='ritual')return {kind:'monster',monsterType:'ritual'};
  if(id==='normal')return {kind:'monster',monsterType:'normal'};
  return {kind:'monster',monsterType:'effect'};
};
const ref=(uid,id='normal',extra={})=>({uid,id,...extra});
const refs=(seat,prefix,count)=>Array.from({length:count},(_,i)=>ref('m'+seat+':'+prefix+'-'+i));
const backrow=(uid,id='other')=>({...ref(uid,id),setTurn:1,faceUp:true});
const monster=(card,owner)=>({...card,owner,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});

function makeState({
  cursor=0,sourceId=PREMATURE_BURIAL_ID,lp0=4000,lp1=4000,
  grave0,grave1,monsters0=[],monsters1=[],backrow0=[],backrow1=[],
  deck0,deck1,hand0,hand1,extra0,extra1,reserveHands={},reserveDecks={},
  field0=null,field1=null
}={}){
  const active=cursor===2?[2,1]:cursor===3?[0,3]:[0,1];
  const source=ref('m'+cursor+':premature-burial',sourceId);
  const reserves={};
  for(const seat of [0,1,2,3])if(!active.includes(seat)){
    reserves[String(seat)]={
      deck:reserveDecks[seat]??refs(seat,'reserve-deck',2),
      hand:reserveHands[seat]??refs(seat,'reserve-hand',2),
      extra:refs(seat,'reserve-extra',5)
    };
  }
  const g0=grave0??[ref('m'+active[0]+':blue-target')];
  const g1=grave1??[ref('m'+active[1]+':red-target')];
  const players=[
    {
      id:'tag-team-0',name:'Equipe Azul',lp:lp0,
      deck:deck0??refs(active[0],'deck-a',8),
      hand:hand0??(cursor%2===0?[source,ref('m'+active[0]+':blue-hand')]:refs(active[0],'hand-a',2)),
      monsters:monsters0,backrow:backrow0,grave:g0,extra:extra0??refs(active[0],'extra-a',5),
      banished:[],field:field0,summoned:false
    },
    {
      id:'tag-team-1',name:'Equipe Vermelha',lp:lp1,
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
const targetFor=state=>'m'+state.active[state.cursor%2]+':blue-target';
const activate=(state,id='premature-1',targetUid=targetFor(state))=>{
  const sourceUid='m'+state.cursor+':premature-burial';
  const plan=planPrematureBurialActivation(state,sourceUid,id,targetUid,lookup);
  return {plan,state:registerPrematureBurialActivation(state,plan,lookup)};
};
const resolve=(state,id='premature-1',negated=false)=>{
  const plan=planPrematureBurialResolution(state,id);
  return resolvePrematureBurialResolution(state,plan,negated,lookup);
};
const inventory=state=>tagInventory(state).map(card=>card.uid+'='+card.id).sort();
const move=(state,team,uid,from,to)=>{
  const list=state.core.players[team][from],index=list.findIndex(card=>card.uid===uid);
  assert.notEqual(index,-1);
  const [card]=list.splice(index,1);
  state.core.players[team][to].push(card);
  synchronizeCardLifetimes(state.core);
};

test('800 LP are paid at activation; Equip Spell leaves hand and occupies a face-up backrow slot',()=>{
  const state=makeState();
  const {plan,state:pending}=activate(state,'cost');
  assert.equal(plan.lpCost,800);
  assert.equal(pending.core.players[0].lp,3200);
  assert.equal(pending.core.players[0].hand.some(c=>c.uid==='m0:premature-burial'),false);
  const equip=pending.core.players[0].backrow.find(c=>c.uid==='m0:premature-burial');
  assert.ok(equip);assert.equal(equip.faceUp,true);assert.equal(equip.setTurn,1);
  assert.equal(equip.equippedTo,undefined);
  assert.equal(pending.core.players[0].monsters.length,0);
});
test('LP below 800 rejects activation without paying or mutating the input',()=>{
  const state=makeState({lp0:799}),before=structuredClone(state);
  assert.throws(()=>activate(state,'poor'),/LP insuficiente/);
  assert.deepEqual(state,before);
  assert.equal(state.core.players[0].lp,799);
});
test('source must be the Equip Spell in the active physical representative hand during Main Phase',()=>{
  const state=makeState();
  assert.equal(activate(state,'main').state.core.players[0].lp,3200);
  for(const phase of ['battle','end']){
    const invalid=makeState();invalid.core.phase=phase;
    assert.throws(()=>activate(invalid,'phase-'+phase),/Main Phase/);
  }
  const wrong=makeState({sourceId:'99999999'});
  assert.throws(()=>activate(wrong,'wrong'),/mão do representante ativo/);
  const missing=makeState({hand0:refs(0,'other',2)});
  assert.throws(()=>planPrematureBurialActivation(missing,'m0:premature-burial','missing','m0:blue-target',lookup),/mão do representante ativo/);
});
test('inactive partner reserve hand cannot activate Premature Burial',()=>{
  const state=makeState();
  state.core.players[0].hand=state.core.players[0].hand.filter(c=>c.uid!=='m0:premature-burial');
  state.reserves['2'].hand.push(ref('m2:premature-burial',PREMATURE_BURIAL_ID));
  state.core.teamRotation.reserves=state.reserves;synchronizeCardLifetimes(state.core);
  assert.throws(()=>planPrematureBurialActivation(state,'m2:premature-burial','reserve','m0:blue-target',lookup),/representante físico ativo/);
});
test('a pending chain or decision prevents activation',()=>{
  const chain=makeState();chain.core.chain.push({kind:'fixture'});
  assert.throws(()=>activate(chain,'chain'),/decisão ou corrente/);
  const choice=makeState();choice.core.choice={kind:'fixture'};
  assert.throws(()=>activate(choice,'choice'),/decisão ou corrente/);
});
test('target must belong to the activating team shared Graveyard',()=>{
  const state=makeState({grave0:[ref('m0:blue-target')],grave1:[ref('m1:red-target')]});
  assert.throws(()=>planPrematureBurialActivation(state,'m0:premature-burial','cross-team','m1:red-target',lookup),/próprio Cemitério/);
  assert.deepEqual(getPrematureBurialCandidates(state,0,lookup),['m0:blue-target']);
});
test('tokens, non-monsters and improperly summoned Fusion/Ritual monsters are excluded',()=>{
  const state=makeState({grave0:[
    ref('m0:blue-target'),ref('m0:spell','spell'),ref('m0:token','normal',{entityKind:'token'}),
    ref('m0:fusion','fusion'),ref('m0:ritual','ritual'),
    ref('m0:proper-fusion','fusion',{properlySummoned:true}),
    ref('m0:proper-ritual','ritual',{properlySummoned:true})
  ]});
  assert.deepEqual(getPrematureBurialCandidates(state,0,lookup),[
    'm0:blue-target','m0:proper-fusion','m0:proper-ritual'
  ]);
});
test('Monster Zone or Spell/Trap Zone full blocks activation before paying LP',()=>{
  const fullMonsters=makeState({monsters0:[0,1,2].map(i=>monster(ref('m0:field-'+i),0))});
  assert.throws(()=>activate(fullMonsters,'full-monsters'),/alvo elegível|Monster Zone/);
  const fullBackrow=makeState({backrow0:[0,1,2].map(i=>backrow('m0:back-'+i))});
  assert.throws(()=>activate(fullBackrow,'full-backrow'),/alvo elegível|Spell\/Trap Zone/);
  assert.equal(fullBackrow.core.players[0].lp,4000);
});
test('valid resolution summons face-up Attack and equips the source to the target',()=>{
  const state=makeState({grave0:[ref('m2:partner-monster')]});
  const {state:pending}=activate(state,'partner','m2:partner-monster');
  const result=resolve(pending,'partner');
  assert.equal(result.status,'equipped');
  const revived=result.state.core.players[0].monsters[0];
  assert.equal(revived.uid,'m2:partner-monster');assert.equal(revived.owner,2);
  assert.equal(revived.faceUp,true);assert.equal(revived.position,'atk');
  const equip=result.state.core.players[0].backrow.find(c=>c.uid==='m0:premature-burial');
  assert.equal(equip.equippedTo,revived.uid);
  assert.equal(result.state.prematureBurial.equipped['m0:premature-burial'].targetOwnerSeat,2);
});
test('target removed after activation prevents summon, sends Equip Spell to GY and keeps the LP cost',()=>{
  const {state:pending}=activate(makeState(),'stale');
  move(pending,0,'m0:blue-target','grave','banished');
  const result=resolve(pending,'stale');
  assert.equal(result.status,'target-invalid');
  assert.equal(result.state.core.players[0].lp,3200);
  assert.ok(result.state.core.players[0].grave.some(c=>c.uid==='m0:premature-burial'));
  assert.equal(result.state.core.players[0].monsters.length,0);
});
test('target leaving and returning to the same Graveyard invalidates the activation-time epoch',()=>{
  const {state:pending}=activate(makeState(),'epoch');
  move(pending,0,'m0:blue-target','grave','banished');
  move(pending,0,'m0:blue-target','banished','grave');
  const result=resolve(pending,'epoch');
  assert.equal(result.status,'target-invalid');
  assert.equal(result.state.core.players[0].lp,3200);
});
test('negation consumes the activation and does not refund the 800 LP cost',()=>{
  const {state:pending}=activate(makeState(),'negated');
  const result=resolve(pending,'negated',true);
  assert.equal(result.status,'negated');
  assert.equal(result.state.core.players[0].lp,3200);
  assert.ok(result.state.core.players[0].grave.some(c=>c.uid==='m0:premature-burial'));
  assert.equal(result.state.core.players[0].monsters.length,0);
});
test('source destroyed before resolution cannot summon the target',()=>{
  const {state:pending}=activate(makeState(),'source-gone');
  move(pending,0,'m0:premature-burial','backrow','grave');
  const result=resolve(pending,'source-gone');
  assert.equal(result.status,'source-missing');
  assert.equal(result.state.core.players[0].lp,3200);
  assert.equal(result.state.core.players[0].monsters.length,0);
});
test('Monster Zone filled after activation sends the Equip Spell to GY without summoning',()=>{
  const {state:pending}=activate(makeState(),'zone-after');
  pending.core.players[0].monsters=[0,1,2].map(i=>monster(ref('m0:occupied-'+i),0));
  synchronizeCardLifetimes(pending.core);
  const result=resolve(pending,'zone-after');
  assert.equal(result.status,'no-space');
  assert.equal(result.state.core.players[0].monsters.length,3);
  assert.ok(result.state.core.players[0].grave.some(c=>c.uid==='m0:premature-burial'));
});
test('destroying Premature Burial also destroys the equipped monster and sends both to GY',()=>{
  const {state:pending}=activate(makeState(),'destroy');
  const equipped=resolve(pending,'destroy').state;
  const destroyed=destroyPrematureBurial(equipped,'m0:premature-burial');
  assert.equal(destroyed.monsterDestroyed,true);
  assert.ok(destroyed.state.core.players[0].grave.some(c=>c.uid==='m0:premature-burial'));
  assert.ok(destroyed.state.core.players[0].grave.some(c=>c.uid==='m0:blue-target'));
  assert.equal(destroyed.state.core.players[0].monsters.length,0);
  assert.deepEqual(destroyed.state.prematureBurial.equipped,{});
});
test('destroying the Equip Spell destroys the target even after control moved to the opposing team',()=>{
  const {state:pending}=activate(makeState(),'control-change');
  const equipped=resolve(pending,'control-change').state;
  const card=equipped.core.players[0].monsters.pop();
  equipped.core.players[1].monsters.push(card);
  synchronizeCardLifetimes(equipped.core);
  const destroyed=destroyPrematureBurial(equipped,'m0:premature-burial');
  assert.equal(destroyed.monsterDestroyed,true);
  assert.ok(destroyed.state.core.players[1].grave.some(c=>c.uid==='m0:blue-target'));
  assert.ok(destroyed.state.core.players[0].grave.some(c=>c.uid==='m0:premature-burial'));
});
test('leaving the field without destruction removes the link but leaves the monster alive',()=>{
  const {state:pending}=activate(makeState(),'non-destroy');
  const equipped=resolve(pending,'non-destroy').state;
  const removed=removePrematureBurialWithoutDestruction(equipped,'m0:premature-burial','banished');
  assert.ok(removed.core.players[0].banished.some(c=>c.uid==='m0:premature-burial'));
  assert.ok(removed.core.players[0].monsters.some(c=>c.uid==='m0:blue-target'));
  assert.deepEqual(removed.prematureBurial.equipped,{});
});
test('when the equipped monster leaves the field, the Equip Spell is sent to GY without a second destruction',()=>{
  const {state:pending}=activate(makeState(),'monster-leaves');
  const equipped=resolve(pending,'monster-leaves').state;
  const left=onPrematureBurialMonsterLeavesField(equipped,'m0:blue-target','banished');
  assert.ok(left.core.players[0].banished.some(c=>c.uid==='m0:blue-target'));
  assert.ok(left.core.players[0].grave.some(c=>c.uid==='m0:premature-burial'));
  assert.deepEqual(left.prematureBurial.equipped,{});
});
test('equip links and replay protection survive JSON save/restore',()=>{
  const {state:pending}=activate(makeState(),'json');
  const restored=JSON.parse(JSON.stringify(pending));
  const result=resolve(restored,'json');
  const roundTrip=JSON.parse(JSON.stringify(result.state));
  assert.equal(roundTrip.prematureBurial.equipped['m0:premature-burial'].targetUid,'m0:blue-target');
  assert.throws(()=>planPrematureBurialResolution(roundTrip,'json'),/ausente|resolvida|obsoleta/);
});
test('activationId cannot be reused while pending or after resolution',()=>{
  const first=activate(makeState(),'unique');
  assert.throws(()=>activate(first.state,'unique'),/já utilizado/);
  const result=resolve(first.state,'unique');
  assert.throws(()=>activate(result.state,'unique'),/já utilizado/);
});
test('all four physical turn rotations preserve the active owner and partner target owner',()=>{
  for(const cursor of [0,1,2,3]){
    const state=makeState({cursor,grave0:[ref('m2:blue-partner')],grave1:[ref('m3:red-partner')]});
    const team=cursor%2,target=team===0?'m2:blue-partner':'m3:red-partner';
    const {state:pending}=activate(state,'rotation-'+cursor,target);
    const result=resolve(pending,'rotation-'+cursor);
    assert.equal(result.status,'equipped');
    assert.equal(result.state.core.players[team].monsters[0].owner,Number(target[1]));
    assert.equal(result.state.core.players[team].backrow[0].equippedTo,target);
  }
});
test('3 backrow slots coexist with a separate Field Zone; fourth slots and Extra Deck six are rejected',()=>{
  const state=makeState({backrow0:[0,1].map(i=>backrow('m0:back-'+i)),field0:backrow('m0:field')});
  assert.equal(resolve(activate(state,'field-separate').state,'field-separate').status,'equipped');
  const full=makeState({backrow0:[0,1,2].map(i=>backrow('m0:back-'+i))});
  assert.throws(()=>activate(full,'fourth-backrow'),/alvo elegível|Spell\/Trap Zone/);
  const extra=makeState({extra0:refs(0,'extra',6)});
  assert.throws(()=>activate(extra,'extra-six'),/Extra Deck/);
});
test('hands above six remain until End Phase and a short in-duel Deck is not truncated',()=>{
  const hand=[ref('m0:premature-burial',PREMATURE_BURIAL_ID),...refs(0,'hand',6)];
  const state=makeState({hand0:hand,deck0:refs(0,'short-deck',1)});
  const result=resolve(activate(state,'hand-seven').state,'hand-seven');
  assert.equal(result.state.core.players[0].hand.length,6);
  assert.equal(result.state.core.players[0].deck.length,1);
});
test('inventory including inactive reserves is conserved and the adapter grants no cards',()=>{
  const state=makeState(),before=inventory(state);
  const result=resolve(activate(state,'conserve').state,'conserve');
  assert.deepEqual(inventory(result.state),before);
});
test('activation and resolution do not mutate the caller input',()=>{
  const state=makeState(),before=structuredClone(state);
  const plan=planPrematureBurialActivation(state,'m0:premature-burial','immutable','m0:blue-target',lookup);
  assert.deepEqual(state,before);
  const registered=registerPrematureBurialActivation(state,plan,lookup);
  assert.deepEqual(state,before);
  const resolution=planPrematureBurialResolution(registered,'immutable');
  const result=resolvePrematureBurialResolution(registered,resolution,false,lookup);
  assert.equal(result.status,'equipped');
  assert.deepEqual(registered.prematureBurial.pending.immutable.targetUid,'m0:blue-target');
});
test('malformed and duplicate physical UIDs are rejected',()=>{
  const malformed=makeState({grave0:[ref('bad:uid')]});
  assert.throws(()=>activate(malformed,'malformed','bad:uid'),/UID|próprio Cemitério/);
  const duplicate=makeState();duplicate.core.players[0].grave.push(ref('m0:blue-target'));
  assert.throws(()=>activate(duplicate,'duplicate'),/duplicado/);
});
