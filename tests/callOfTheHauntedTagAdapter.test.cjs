'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {tagInventory}=require('../dist/tagDuel');
const {
  CALL_OF_THE_HAUNTED_ID,getCallOfTheHauntedCandidates,planCallOfTheHauntedActivation,
  registerCallOfTheHauntedActivation,planCallOfTheHauntedResolution,resolveCallOfTheHauntedResolution,
  removeCallOfTheHaunted,onCallOfTheHauntedMonsterLeavesField
}=require('../dist/callOfTheHauntedTagAdapter');
const lookup=id=>{
  if(id===CALL_OF_THE_HAUNTED_ID)return {kind:'trap'};
  if(id==='fusion')return {kind:'monster',monsterType:'fusion'};
  if(id==='ritual')return {kind:'monster',monsterType:'ritual'};
  if(id==='spell')return {kind:'spell'};
  return {kind:'monster',monsterType:'effect'};
};
const ref=(uid,id='monster',extra={})=>({uid,id,...extra});
const refs=(seat,prefix,count)=>Array.from({length:count},(_,i)=>ref('m'+seat+':'+prefix+'-'+i));
const back=(uid,id='other',{faceUp=false,setTurn=1}={})=>({...ref(uid,id),setTurn,faceUp});
const monster=(card,owner)=>({...card,owner,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});
function makeState({
  cursor=0,sourceTeam=0,sourceSeat=cursor,setTurn=1,phase='main',priority=cursor%2,chain=[],
  grave0,grave1,monsters0=[],monsters1=[],backrow0=[],backrow1=[],deck0,deck1,hand0,hand1,extra0,extra1,
  reserveHands={},reserveDecks={},field0=null,field1=null,turn=3
}={}){
  const active=cursor===2?[2,1]:cursor===3?[0,3]:[0,1],source=back('m'+sourceSeat+':call-of-the-haunted',CALL_OF_THE_HAUNTED_ID,{setTurn}),reserves={};
  for(const seat of [0,1,2,3])if(!active.includes(seat))reserves[String(seat)]={
    deck:reserveDecks[seat]??refs(seat,'reserve-deck',2),hand:reserveHands[seat]??refs(seat,'reserve-hand',2),extra:refs(seat,'reserve-extra',5)
  };
  const players=[
    {id:'tag-team-0',name:'Equipe Azul',lp:4000,deck:deck0??refs(active[0],'deck-a',2),
      hand:hand0??refs(active[0],'hand-a',2),monsters:monsters0,backrow:[...backrow0],grave:grave0??[ref('m'+active[0]+':blue-target')],
      extra:extra0??refs(active[0],'extra-a',5),banished:[],field:field0,summoned:false},
    {id:'tag-team-1',name:'Equipe Vermelha',lp:4000,deck:deck1??refs(active[1],'deck-b',2),
      hand:hand1??refs(active[1],'hand-b',2),monsters:monsters1,backrow:[...backrow1],grave:grave1??[ref('m'+active[1]+':red-target')],
      extra:extra1??refs(active[1],'extra-b',5),banished:[],field:field1,summoned:false}
  ];
  players[sourceTeam].backrow.push(source);
  const teamRotation={version:1,cursor,active,reserves};
  const core={version:1,players,turn,current:cursor%2,phase,resume:'main',priority,passes:0,pending:{kind:'none'},chain,
    winner:null,reason:'',log:[],teamRotation,cardLifetimes:{}};
  const members=[{id:'p0',name:'P0',team:0},{id:'p1',name:'P1',team:1},{id:'p2',name:'P2',team:0},{id:'p3',name:'P3',team:1}];
  const state={version:1,mode:'tag-classic',members,active,cursor,reserves,core};
  synchronizeCardLifetimes(core);return state;
}
const sourceFor=state=>state.core.players.flatMap(player=>player.backrow).find(card=>card.id===CALL_OF_THE_HAUNTED_ID)?.uid??('m'+state.cursor+':call-of-the-haunted');
const targetFor=state=>'m'+state.active[state.cursor%2]+':blue-target';
const activate=(state,id='call-1',targetUid=targetFor(state))=>{
  const plan=planCallOfTheHauntedActivation(state,sourceFor(state),id,targetUid,lookup);
  return {plan,state:registerCallOfTheHauntedActivation(state,plan,lookup)};
};
const resolution=(state,id='call-1')=>planCallOfTheHauntedResolution(state,id);
const resolve=(state,id='call-1',targetUid=targetFor(state),negated=false)=>{
  const activated=activate(state,id,targetUid);
  return resolveCallOfTheHauntedResolution(activated.state,resolution(activated.state,id),negated,lookup);
};
const inventory=state=>tagInventory(state).map(card=>card.uid+'='+card.id).sort();

test('candidatos vêm somente do GY compartilhado da própria equipe',()=>{
  const state=makeState({grave0:[ref('m2:partner-target')],grave1:[ref('m1:enemy-target')]});
  assert.deepEqual(getCallOfTheHauntedCandidates(state,0,lookup),['m2:partner-target']);
});
test('Tokens, não-monstros e Fusion/Ritual sem properlySummoned são rejeitados',()=>{
  const state=makeState({grave0:[ref('m0:normal'),ref('m0:spell','spell'),ref('m0:token','monster',{entityKind:'token'}),
    ref('m0:fusion','fusion'),ref('m0:ritual','ritual'),ref('m0:proper-fusion','fusion',{properlySummoned:true})]});
  assert.deepEqual(getCallOfTheHauntedCandidates(state,0,lookup),['m0:normal','m0:proper-fusion']);
});
test('Trap Setada no turno atual não pode ser ativada',()=>{
  const state=makeState({setTurn:3});
  assert.throws(()=>activate(state,'same-turn'),/turno anterior/);
});
test('Trap Setada em turno anterior pode ativar na própria Main Phase',()=>{
  assert.doesNotThrow(()=>activate(makeState(),'own-main'));
});
test('Trap Setada pode ativar na própria Battle Phase',()=>{
  const state=makeState({phase:'battle'});
  assert.doesNotThrow(()=>activate(state,'own-battle'));
});
test('Trap Setada pode responder à corrente do adversário com prioridade da equipe',()=>{
  const state=makeState({cursor:0,sourceTeam:1,sourceSeat:3,phase:'response',priority:1,chain:[{id:'chain-1'}],
    grave1:[ref('m1:blue-target')]});
  assert.doesNotThrow(()=>activate(state,'response','m1:blue-target'));
});
test('resposta sem corrente ou com prioridade de outra equipe é rejeitada',()=>{
  const noChain=makeState({cursor:0,sourceTeam:1,sourceSeat:3,phase:'response',priority:1,chain:[],grave1:[ref('m1:blue-target')]});
  assert.throws(()=>activate(noChain,'no-chain','m1:blue-target'));
  const wrong=makeState({cursor:0,sourceTeam:1,sourceSeat:3,phase:'response',priority:0,chain:[{id:'chain-1'}],grave1:[ref('m1:blue-target')]});
  assert.throws(()=>activate(wrong,'wrong-priority','m1:blue-target'));
});
test('Trap de parceiro físico inativo pode ser ativada pela equipe controladora',()=>{
  const state=makeState({cursor:0,sourceTeam:0,sourceSeat:2,grave0:[ref('m2:partner-target')]});
  const result=activate(state,'partner','m2:partner-target');
  assert.equal(result.plan.trapOwnerSeat,2);assert.equal(result.plan.controllerSeat,0);
});
test('Monster Zone cheia impede ativação sem mover Trap ou alvo',()=>{
  const monsters=[0,1,2].map(i=>monster(ref('m0:field-'+i),0)),state=makeState({monsters0:monsters});
  assert.throws(()=>activate(state,'full-zone'),/Monster Zone livre/);
  assert.equal(state.core.players[0].backrow[0].faceUp,false);
});
test('registro vira a Continuous Trap face-up e persiste alvo por zone/epoch',()=>{
  const state=makeState(),plan=planCallOfTheHauntedActivation(state,sourceFor(state),'register','m0:blue-target',lookup);
  const registered=registerCallOfTheHauntedActivation(state,plan,lookup);
  assert.equal(registered.core.players[0].backrow[0].faceUp,true);
  assert.equal(registered.callOfTheHaunted.pending.register.targetBinding.zone,'grave');
});
test('resolução válida invoca face-up Attack, preserva UID/dono e grava equippedTo',()=>{
  const state=makeState({grave0:[ref('m2:partner-target')]});
  const activated=activate(state,'summon','m2:partner-target');
  const result=resolveCallOfTheHauntedResolution(activated.state,resolution(activated.state,'summon'),false,lookup);
  assert.equal(result.status,'summoned');
  const revived=result.state.core.players[0].monsters[0];
  assert.equal(revived.uid,'m2:partner-target');assert.equal(revived.owner,2);
  assert.equal(revived.position,'atk');assert.equal(revived.faceUp,true);
  assert.equal(result.state.core.players[0].backrow.find(card=>card.uid==='m0:call-of-the-haunted').equippedTo,revived.uid);
});
test('alvo que sai do GY antes da resolução não é invocado e Trap vai ao GY',()=>{
  const activated=activate(makeState(),'target-left'),changed=structuredClone(activated.state);
  const [target]=changed.core.players[0].grave.splice(0,1);changed.core.players[0].banished.push(target);
  synchronizeCardLifetimes(changed.core);
  const result=resolveCallOfTheHauntedResolution(changed,resolution(changed),false,lookup);
  assert.equal(result.status,'target-invalid');assert.equal(result.state.core.players[0].monsters.length,0);
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid==='m0:call-of-the-haunted'),true);
});
test('alvo que sai e retorna ao GY recebe epoch novo e invalida ativação antiga',()=>{
  const activated=activate(makeState(),'epoch'),changed=structuredClone(activated.state);
  const [target]=changed.core.players[0].grave.splice(0,1);changed.core.players[0].banished.push(target);
  synchronizeCardLifetimes(changed.core);
  const [returned]=changed.core.players[0].banished.splice(0,1);changed.core.players[0].grave.push(returned);
  synchronizeCardLifetimes(changed.core);
  const result=resolveCallOfTheHauntedResolution(changed,resolution(changed),false,lookup);
  assert.equal(result.status,'target-invalid');
});
test('negação não invoca e envia a Trap ao GY sem alterar alvo',()=>{
  const result=resolve(makeState(),'negated','m0:blue-target',true);
  assert.equal(result.status,'negated');assert.equal(result.state.core.players[0].monsters.length,0);
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid==='m0:blue-target'),true);
});
test('fonte removida antes da resolução não invoca o alvo',()=>{
  const activated=activate(makeState(),'source-gone'),changed=structuredClone(activated.state);
  const [trap]=changed.core.players[0].backrow.splice(0,1);changed.core.players[0].grave.push(trap);
  synchronizeCardLifetimes(changed.core);
  const result=resolveCallOfTheHauntedResolution(changed,resolution(changed),false,lookup);
  assert.equal(result.status,'source-missing');assert.equal(result.state.core.players[0].monsters.length,0);
});
test('Monster Zone preenchida após ativação envia a Trap ao GY sem invocar',()=>{
  const activated=activate(makeState(),'late-full'),full=structuredClone(activated.state);
  full.core.players[0].monsters.push(...[0,1,2].map(i=>monster(ref('m0:late-'+i),0)));
  const result=resolveCallOfTheHauntedResolution(full,resolution(full),false,lookup);
  assert.equal(result.status,'no-space');assert.equal(result.state.core.players[0].grave.some(card=>card.uid==='m0:call-of-the-haunted'),true);
});
test('activationId duplicado e replay após resolução são rejeitados',()=>{
  const activated=activate(makeState(),'replay');
  assert.throws(()=>planCallOfTheHauntedActivation(activated.state,sourceFor(activated.state),'replay','m0:blue-target',lookup));
  const result=resolveCallOfTheHauntedResolution(activated.state,resolution(activated.state,'replay'),false,lookup);
  assert.throws(()=>planCallOfTheHauntedActivation(result.state,sourceFor(result.state),'replay','m0:blue-target',lookup));
});
test('pending/link e replay sobrevivem ao round-trip JSON',()=>{
  const activated=activate(makeState(),'json'),restored=JSON.parse(JSON.stringify(activated.state));
  const result=resolveCallOfTheHauntedResolution(restored,resolution(restored,'json'),false,lookup);
  const roundTrip=JSON.parse(JSON.stringify(result.state));
  assert.equal(roundTrip.callOfTheHaunted.equipped['m0:call-of-the-haunted'].targetUid,'m0:blue-target');
  assert.throws(()=>planCallOfTheHauntedResolution(roundTrip,'json'));
});
test('quando a Trap deixa o campo por destruição, o monstro é destruído',()=>{
  const result=resolve(makeState(),'trap-destroyed');
  const removed=removeCallOfTheHaunted(result.state,'m0:call-of-the-haunted','grave');
  assert.equal(removed.monsterDestroyed,true);
  assert.equal(removed.state.core.players[0].grave.some(card=>card.uid==='m0:blue-target'),true);
  assert.equal(removed.state.core.players[0].grave.some(card=>card.uid==='m0:call-of-the-haunted'),true);
});
test('quando a Trap é banida, o monstro ainda é destruído e a Trap vai ao banimento',()=>{
  const result=resolve(makeState(),'trap-banished');
  const removed=removeCallOfTheHaunted(result.state,'m0:call-of-the-haunted','banished');
  assert.equal(removed.monsterDestroyed,true);
  assert.equal(removed.state.core.players[0].banished.some(card=>card.uid==='m0:call-of-the-haunted'),true);
  assert.equal(removed.state.core.players[0].grave.some(card=>card.uid==='m0:blue-target'),true);
});
test('quando a Trap retorna à mão do dono físico, o monstro é destruído',()=>{
  const state=makeState({sourceTeam:0,sourceSeat:2,grave0:[ref('m0:blue-target')]});
  const result=resolve(state,'trap-bounce','m0:blue-target');
  const removed=removeCallOfTheHaunted(result.state,'m2:call-of-the-haunted','hand');
  assert.equal(removed.monsterDestroyed,true);
  assert.equal(removed.state.reserves['2'].hand.some(card=>card.uid==='m2:call-of-the-haunted'),true);
  assert.equal(removed.state.core.players[0].grave.some(card=>card.uid==='m0:blue-target'),true);
});
test('quando o monstro é destruído, a Trap contínua vai ao GY',()=>{
  const result=resolve(makeState(),'monster-destroyed');
  const cleaned=onCallOfTheHauntedMonsterLeavesField(result.state,'m0:blue-target','grave');
  assert.equal(cleaned.core.players[0].grave.some(card=>card.uid==='m0:call-of-the-haunted'),true);
  assert.equal(cleaned.core.players[0].grave.some(card=>card.uid==='m0:blue-target'),true);
});
test('quando o monstro é banido, Trap vai ao GY e monstro ao banimento do dono',()=>{
  const result=resolve(makeState(),'monster-banished');
  const cleaned=onCallOfTheHauntedMonsterLeavesField(result.state,'m0:blue-target','banished');
  assert.equal(cleaned.core.players[0].banished.some(card=>card.uid==='m0:blue-target'),true);
  assert.equal(cleaned.core.players[0].grave.some(card=>card.uid==='m0:call-of-the-haunted'),true);
});
test('quando monstro do parceiro volta à mão, Trap vai ao GY e carta vai à reserva física',()=>{
  const state=makeState({grave0:[ref('m2:partner-target')]});
  const result=resolve(state,'partner-bounce','m2:partner-target');
  const cleaned=onCallOfTheHauntedMonsterLeavesField(result.state,'m2:partner-target','hand');
  assert.equal(cleaned.reserves['2'].hand.some(card=>card.uid==='m2:partner-target'),true);
  assert.equal(cleaned.core.players[0].grave.some(card=>card.uid==='m0:call-of-the-haunted'),true);
});
test('vínculo segue UID mesmo após o monstro trocar de equipe',()=>{
  const result=resolve(makeState(),'control-change');
  const changed=structuredClone(result.state),[target]=changed.core.players[0].monsters.splice(0,1);
  changed.core.players[1].monsters.push(target);synchronizeCardLifetimes(changed.core);
  const cleaned=onCallOfTheHauntedMonsterLeavesField(changed,'m0:blue-target','grave');
  assert.equal(cleaned.core.players[0].grave.some(card=>card.uid==='m0:call-of-the-haunted'),true);
  assert.equal(cleaned.core.players[0].grave.some(card=>card.uid==='m0:blue-target'),true);
});
test('quatro rotações preservam dono físico da Trap e do monstro',()=>{
  for(const cursor of [0,1,2,3]){
    const team=cursor%2,sourceSeat=cursor,targetSeat=team===0?2:3;
    const targetUid='m'+targetSeat+':target';
    const state=makeState({cursor,sourceTeam:team,sourceSeat,grave0:team===0?[ref(targetUid)]:[ref('m0:other')],
      grave1:team===1?[ref(targetUid)]:[ref('m1:other')]});
    const activated=activate(state,'rotation-'+cursor,targetUid);
    const result=resolveCallOfTheHauntedResolution(activated.state,resolution(activated.state,'rotation-'+cursor),false,lookup);
    assert.equal(result.status,'summoned');
    assert.equal(result.state.core.players[team].monsters[0].owner,targetSeat);
    const removed=removeCallOfTheHaunted(result.state,'m'+sourceSeat+':call-of-the-haunted','grave');
    assert.equal(removed.state.core.players[team].grave.some(card=>card.uid===targetUid),true);
  }
});
test('3+3 zonas, Field Zone separada e Extra Deck 5 permanecem preservados',()=>{
  const field=back('m1:field','spell'),state=makeState({field1:field,backrow0:[back('m0:old-1','other'),back('m0:old-2','other')]});
  const result=resolve(state,'zones');
  assert.equal(result.state.core.players[0].backrow.length,3);
  assert.equal(result.state.core.players[1].field.uid,'m1:field');
  assert.equal(result.state.core.players[0].extra.length,5);
});
test('mão acima de seis aguarda End Phase e Deck curto não é truncado',()=>{
  const state=makeState({hand0:refs(0,'large-hand',8),deck0:refs(0,'short-deck',1)});
  const result=resolve(state,'hand-limit');
  assert.equal(result.state.core.players[0].hand.length,8);assert.equal(result.state.core.players[0].deck.length,1);
});
test('inventário é conservado sem grants',()=>{
  const state=makeState(),before=inventory(state),result=resolve(state,'conserve');
  assert.deepEqual(inventory(result.state),before);
});
test('ativação/resolução e limpeza não mutam a entrada',()=>{
  const state=makeState(),before=JSON.stringify(state),activated=activate(state,'immutable');
  const snapshot=JSON.stringify(activated.state),result=resolveCallOfTheHauntedResolution(activated.state,resolution(activated.state,'immutable'),false,lookup);
  removeCallOfTheHaunted(result.state,'m0:call-of-the-haunted','grave');
  assert.equal(JSON.stringify(state),before);assert.equal(JSON.stringify(activated.state),snapshot);
});
test('UID físico malformado ou duplicado é rejeitado',()=>{
  const malformed=makeState();malformed.core.players[0].grave[0].uid='bad-uid';
  assert.throws(()=>getCallOfTheHauntedCandidates(malformed,0,lookup));
  const duplicate=makeState({grave0:[ref('m0:same')],grave1:[ref('m0:same')]});
  assert.throws(()=>getCallOfTheHauntedCandidates(duplicate,0,lookup));
});
