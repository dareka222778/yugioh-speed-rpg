'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {tagInventory}=require('../dist/tagDuel');
const {step}=require('../dist/duelEngine');
const {
  ENEMY_CONTROLLER_ID,getEnemyControllerTargetCandidates,getEnemyControllerTributeCandidates,
  planEnemyControllerActivation,registerEnemyControllerActivation,
  planEnemyControllerResolution,resolveEnemyControllerResolution
}=require('../dist/enemyControllerTagAdapter');
const lookup=id=>id===ENEMY_CONTROLLER_ID?{kind:'spell'}:{kind:'monster',monsterType:'effect'};
const ref=(uid,id='monster',extra={})=>({uid,id,...extra});
const refs=(seat,prefix,count)=>Array.from({length:count},(_,i)=>ref('m'+seat+':'+prefix+'-'+i));
const monster=(uid,{owner,position='atk',faceUp=true,returnTo,returnTurn,positionLockedThrough=0,entityKind}={})=>({
  ...ref(uid,'monster',entityKind?{entityKind}:{}),owner:owner??Number(/^m([0-3]):/.exec(uid)[1]),position,faceUp,
  entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0,
  ...(returnTo!==undefined?{returnTo}:{}),...(returnTurn!==undefined?{returnTurn}:{}),positionLockedThrough
});
function makeState({
  cursor=0,sourceZone='hand',sourceTeam=0,sourceSeat=cursor,setTurn=1,sourceFaceUp=false,
  phase='main',priority=cursor%2,chain=[],monsters0,monsters1,backrow0=[],backrow1=[],
  hand0,hand1,deck0,deck1,extra0,extra1,reserveHands={},reserveDecks={},field0=null,field1=null,turn=3
}={}){
  const active=cursor===2?[2,1]:cursor===3?[0,3]:[0,1],source=ref('m'+sourceSeat+':enemy-controller',ENEMY_CONTROLLER_ID),reserves={};
  for(const seat of [0,1,2,3])if(!active.includes(seat))reserves[String(seat)]={
    deck:reserveDecks[seat]??refs(seat,'reserve-deck',2),hand:reserveHands[seat]??refs(seat,'reserve-hand',2),extra:refs(seat,'reserve-extra',5)
  };
  const players=[
    {id:'tag-team-0',name:'Equipe Azul',lp:4000,deck:deck0??refs(active[0],'deck-a',2),
      hand:hand0??(sourceZone==='hand'&&sourceTeam===0?[source,ref('m'+active[0]+':blue-hand')]:refs(active[0],'hand-a',2)),
      monsters:monsters0??[monster('m0:blue-monster')],backrow:[...backrow0],grave:[],extra:extra0??refs(active[0],'extra-a',5),
      banished:[],field:field0,summoned:false},
    {id:'tag-team-1',name:'Equipe Vermelha',lp:4000,deck:deck1??refs(active[1],'deck-b',2),
      hand:hand1??(sourceZone==='hand'&&sourceTeam===1?[source,ref('m'+active[1]+':red-hand')]:refs(active[1],'hand-b',2)),
      monsters:monsters1??[monster('m1:red-monster')],backrow:[...backrow1],grave:[],extra:extra1??refs(active[1],'extra-b',5),
      banished:[],field:field1,summoned:false}
  ];
  if(sourceZone==='backrow'){
    players[sourceTeam].backrow.push({...source,setTurn,faceUp:sourceFaceUp});
  }
  const teamRotation={version:1,cursor,active,reserves};
  const core={version:1,players,turn,current:cursor%2,phase,resume:'main',priority,passes:0,
    pending:{kind:'none'},chain,winner:null,reason:'',log:[],teamRotation,cardLifetimes:{}};
  const members=[{id:'p0',name:'P0',team:0},{id:'p1',name:'P1',team:1},{id:'p2',name:'P2',team:0},{id:'p3',name:'P3',team:1}];
  const state={version:1,mode:'tag-classic',members,active,cursor,reserves,core};
  synchronizeCardLifetimes(core);return state;
}
const sourceFor=state=>state.core.players.flatMap(player=>[...player.hand,...player.backrow]).find(card=>card.id===ENEMY_CONTROLLER_ID)?.uid??('m'+state.cursor+':enemy-controller');
const activate=(state,id,mode='change-position',targetUid='m1:red-monster',tributeUid)=>{
  const plan=planEnemyControllerActivation(state,sourceFor(state),id,mode,targetUid,tributeUid,lookup);
  return {plan,state:registerEnemyControllerActivation(state,plan,lookup)};
};
const resolution=(state,id)=>planEnemyControllerResolution(state,id);
const resolve=(state,id,mode='change-position',targetUid='m1:red-monster',tributeUid,negated=false)=>{
  const activated=activate(state,id,mode,targetUid,tributeUid);
  return resolveEnemyControllerResolution(activated.state,resolution(activated.state,id),negated,lookup);
};
const inventory=state=>tagInventory(state).map(card=>card.uid+'='+card.id).sort();
const moveTargetToGrave=(state,team,uid)=>{
  const list=state.core.players[team].monsters,index=list.findIndex(card=>card.uid===uid);
  assert.notEqual(index,-1);const [card]=list.splice(index,1);state.core.players[Number(/^m([0-3]):/.exec(card.uid)[1])%2].grave.push(card);
  synchronizeCardLifetimes(state.core);
};
const setResponseState=()=>{
  const state=makeState({cursor:0,sourceZone:'backrow',sourceTeam:1,sourceSeat:3,phase:'response',priority:1,chain:[{id:'chain-1'}]});
  return state;
};

test('alvos são apenas monstros face-up controlados pela equipe adversária',()=>{
  const state=makeState({monsters1:[monster('m1:up'),monster('m3:down',{position:'def',faceUp:false})]});
  assert.deepEqual(getEnemyControllerTargetCandidates(state,0,lookup),['m1:up']);
});
test('tributos são monstros próprios não-token, inclusive do parceiro físico',()=>{
  const state=makeState({monsters0:[monster('m2:partner',{owner:2}),monster('m0:token',{entityKind:'token'})]});
  assert.deepEqual(getEnemyControllerTributeCandidates(state,0,lookup),['m2:partner']);
});
test('Quick-Play da mão pode ser ativada na própria Main Phase',()=>{
  const state=makeState();
  assert.doesNotThrow(()=>planEnemyControllerActivation(state,sourceFor(state),'hand-main','change-position','m1:red-monster',undefined,lookup));
});
test('Quick-Play da mão pode ser ativada na própria Battle Phase',()=>{
  const state=makeState({phase:'battle'});
  assert.doesNotThrow(()=>planEnemyControllerActivation(state,sourceFor(state),'hand-battle','change-position','m1:red-monster',undefined,lookup));
});
test('carta da mão não pode ser ativada pelo parceiro físico inativo',()=>{
  const state=makeState({cursor:2,hand0:[ref('m0:enemy-controller',ENEMY_CONTROLLER_ID)]});
  assert.throws(()=>planEnemyControllerActivation(state,'m0:enemy-controller','inactive','change-position','m1:red-monster',undefined,lookup));
});
test('Quick-Play setada no turno atual não pode ser ativada',()=>{
  const state=makeState({sourceZone:'backrow',sourceTeam:0,sourceSeat:2,setTurn:3});
  assert.throws(()=>planEnemyControllerActivation(state,'m2:enemy-controller','same-turn','change-position','m1:red-monster',undefined,lookup));
});
test('Quick-Play setada pode ser ativada no próprio turno posterior',()=>{
  const state=makeState({sourceZone:'backrow',sourceTeam:0,sourceSeat:2,setTurn:1});
  assert.doesNotThrow(()=>planEnemyControllerActivation(state,'m2:enemy-controller','set-own','change-position','m1:red-monster',undefined,lookup));
});
test('Quick-Play setada pode responder a corrente no turno adversário',()=>{
  const state=setResponseState();
  assert.doesNotThrow(()=>planEnemyControllerActivation(state,'m3:enemy-controller','set-response','change-position','m0:blue-monster',undefined,lookup));
});
test('carta setada não responde sem corrente aberta',()=>{
  const state=makeState({sourceZone:'backrow',sourceTeam:1,sourceSeat:3,phase:'response',priority:1,chain:[]});
  assert.throws(()=>planEnemyControllerActivation(state,'m3:enemy-controller','no-chain','change-position','m0:blue-monster',undefined,lookup));
});
test('carta setada não responde quando a prioridade pertence à outra equipe',()=>{
  const state=makeState({sourceZone:'backrow',sourceTeam:1,sourceSeat:3,phase:'response',priority:0,chain:[{id:'chain-1'}]});
  assert.throws(()=>planEnemyControllerActivation(state,'m3:enemy-controller','wrong-priority','change-position','m0:blue-monster',undefined,lookup));
});
test('modo posição muda Ataque para Defesa e envia a Magia ao GY',()=>{
  const state=makeState();
  const result=resolve(state,'position-atk');
  assert.equal(result.status,'position-changed');
  assert.equal(result.state.core.players[1].monsters[0].position,'def');
  assert.equal(result.state.core.players[1].monsters[0].changed,3);
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid==='m0:enemy-controller'),true);
});
test('modo posição muda Defesa para Ataque',()=>{
  const state=makeState({monsters1:[monster('m1:red-monster',{position:'def'})]});
  const result=resolve(state,'position-def');
  assert.equal(result.state.core.players[1].monsters[0].position,'atk');
});
test('não muda posição de alvo face-down',()=>{
  const state=makeState({monsters1:[monster('m1:down',{position:'def',faceUp:false})]});
  assert.throws(()=>planEnemyControllerActivation(state,sourceFor(state),'face-down','change-position','m1:down',undefined,lookup));
});
test('alvo que deixa o campo antes da resolução invalida o efeito',()=>{
  const activated=activate(makeState(),'target-left');
  const changed=structuredClone(activated.state);moveTargetToGrave(changed,1,'m1:red-monster');
  const result=resolveEnemyControllerResolution(changed,resolution(changed,'target-left'),false,lookup);
  assert.equal(result.status,'target-invalid');
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid==='m0:enemy-controller'),true);
});
test('modo controle exige um Tributo próprio',()=>{
  const state=makeState();
  assert.throws(()=>planEnemyControllerActivation(state,sourceFor(state),'no-tribute','take-control','m1:red-monster',undefined,lookup));
});
test('Tributo é pago na ativação e vai ao GY do proprietário físico',()=>{
  const state=makeState({monsters0:[monster('m2:partner-tribute',{owner:2})]});
  const activated=activate(state,'tribute-paid','take-control','m1:red-monster','m2:partner-tribute');
  assert.equal(activated.state.core.players[0].monsters.length,0);
  assert.equal(activated.state.core.players[0].grave.some(card=>card.uid==='m2:partner-tribute'),true);
  assert.equal(activated.state.core.players[0].backrow.some(card=>card.uid==='m0:enemy-controller'),true);
});
test('Tributo inválido é rejeitado sem remover monstros',()=>{
  const state=makeState(),before=JSON.stringify(state);
  assert.throws(()=>planEnemyControllerActivation(state,sourceFor(state),'bad-tribute','take-control','m1:red-monster','m1:red-monster',lookup));
  assert.equal(JSON.stringify(state),before);
});
test('modo controle toma o alvo e marca retorno para a equipe controladora anterior',()=>{
  const state=makeState({monsters0:[monster('m0:tribute')]});
  const activated=activate(state,'control','take-control','m1:red-monster','m0:tribute');
  const result=resolveEnemyControllerResolution(activated.state,resolution(activated.state,'control'),false,lookup);
  assert.equal(result.status,'control-changed');
  const moved=result.state.core.players[0].monsters.find(card=>card.uid==='m1:red-monster');
  assert.equal(moved.owner,1);assert.equal(moved.returnTo,1);assert.equal(moved.returnTurn,3);
  assert.equal(result.state.core.players[1].monsters.length,0);
});
test('controle temporário preserva posição, face-up, UID e dono físico',()=>{
  const state=makeState({monsters1:[monster('m3:partner-target',{owner:3,position:'def',faceUp:true})],monsters0:[monster('m2:tribute')]});
  const activated=activate(state,'preserve','take-control','m3:partner-target','m2:tribute');
  const result=resolveEnemyControllerResolution(activated.state,resolution(activated.state,'preserve'),false,lookup);
  const moved=result.state.core.players[0].monsters.find(card=>card.uid==='m3:partner-target');
  assert.equal(moved.owner,3);assert.equal(moved.position,'def');assert.equal(moved.faceUp,true);
});
test('End Phase do motor devolve o monstro ao controlador anterior',()=>{
  const state=makeState({monsters0:[monster('m0:tribute')]});
  const activated=activate(state,'return','take-control','m1:red-monster','m0:tribute');
  const result=resolveEnemyControllerResolution(activated.state,resolution(activated.state,'return'),false,lookup);
  const ended=step(result.state.core,{kind:'end'});
  assert.equal(ended.players[0].monsters.some(card=>card.uid==='m1:red-monster'),false);
  assert.equal(ended.players[1].monsters.some(card=>card.uid==='m1:red-monster'),true);
  assert.equal(ended.players[1].monsters.find(card=>card.uid==='m1:red-monster').returnTo,undefined);
});
test('se a zona original estiver cheia no retorno, monstro vai ao GY do dono físico',()=>{
  const state=makeState({monsters0:[monster('m0:tribute')]});
  const activated=activate(state,'full-return','take-control','m1:red-monster','m0:tribute');
  const result=resolveEnemyControllerResolution(activated.state,resolution(activated.state,'full-return'),false,lookup);
  const full=structuredClone(result.state.core);
  full.players[1].monsters.push(monster('m1:extra-a'),monster('m3:extra-b',{owner:3}),monster('m1:extra-c'));
  const ended=step(full,{kind:'end'});
  assert.equal(ended.players[1].monsters.some(card=>card.uid==='m1:red-monster'),false);
  assert.equal(ended.players[1].grave.some(card=>card.uid==='m1:red-monster'),true);
});
test('custo de Tributo permanece pago quando o efeito é negado',()=>{
  const state=makeState({monsters0:[monster('m0:tribute')]});
  const activated=activate(state,'negated-cost','take-control','m1:red-monster','m0:tribute');
  const result=resolveEnemyControllerResolution(activated.state,resolution(activated.state,'negated-cost'),true,lookup);
  assert.equal(result.status,'negated');
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid==='m0:tribute'),true);
  assert.equal(result.state.core.players[1].monsters.some(card=>card.uid==='m1:red-monster'),true);
});
test('custo de Tributo permanece pago se o alvo sair do campo',()=>{
  const state=makeState({monsters0:[monster('m0:tribute')]});
  const activated=activate(state,'invalid-cost','take-control','m1:red-monster','m0:tribute');
  const changed=structuredClone(activated.state);moveTargetToGrave(changed,1,'m1:red-monster');
  const result=resolveEnemyControllerResolution(changed,resolution(changed,'invalid-cost'),false,lookup);
  assert.equal(result.status,'target-invalid');
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid==='m0:tribute'),true);
});
test('não toma controle se a zona for preenchida depois do pagamento do Tributo',()=>{
  const state=makeState({monsters0:[monster('m0:tribute')]});
  const activated=activate(state,'no-space','take-control','m1:red-monster','m0:tribute');
  const full=structuredClone(activated.state);
  full.core.players[0].monsters.push(monster('m0:new-a'),monster('m2:new-b',{owner:2}),monster('m0:new-c'));
  const result=resolveEnemyControllerResolution(full,resolution(full,'no-space'),false,lookup);
  assert.equal(result.status,'no-space');
  assert.equal(result.state.core.players[1].monsters.some(card=>card.uid==='m1:red-monster'),true);
});
test('alvo com retorno temporário anterior é rejeitado para evitar sobrescrever a pilha',()=>{
  const state=makeState({monsters1:[monster('m1:red-monster',{returnTo:0,returnTurn:4})]});
  assert.throws(()=>planEnemyControllerActivation(state,sourceFor(state),'nested-return','take-control','m1:red-monster','m0:blue-monster',lookup));
});
test('alvo bloqueado não tem posição alterada',()=>{
  const state=makeState({monsters1:[monster('m1:red-monster',{positionLockedThrough:3})]});
  const result=resolve(state,'locked-target');
  assert.equal(result.status,'target-locked');
  assert.equal(result.state.core.players[1].monsters[0].position,'atk');
});
test('activationId duplicado e replay após resolução são rejeitados',()=>{
  const activated=activate(makeState(),'duplicate');
  assert.throws(()=>planEnemyControllerActivation(activated.state,sourceFor(activated.state),'duplicate','change-position','m1:red-monster',undefined,lookup));
  const result=resolveEnemyControllerResolution(activated.state,resolution(activated.state,'duplicate'),false,lookup);
  assert.throws(()=>planEnemyControllerActivation(result.state,sourceFor(result.state),'duplicate','change-position','m1:red-monster',undefined,lookup));
});
test('memória pendente sobrevive ao round-trip JSON',()=>{
  const activated=activate(makeState(),'json');
  const restored=JSON.parse(JSON.stringify(activated.state));
  assert.equal(planEnemyControllerResolution(restored,'json').targetUid,'m1:red-monster');
});
test('resposta setada por parceiro inativo preserva dono físico e equipe controladora',()=>{
  const state=setResponseState();
  const activated=activate(state,'partner-set','change-position','m0:blue-monster');
  assert.equal(activated.plan.sourceOwnerSeat,3);
  assert.equal(activated.plan.controllerTeam,1);
  const result=resolveEnemyControllerResolution(activated.state,resolution(activated.state,'partner-set'),false,lookup);
  assert.equal(result.state.core.players[1].grave.some(card=>card.uid==='m3:enemy-controller'),true);
});
test('quatro rotações preservam representantes e UIDs físicos',()=>{
  for(const cursor of [0,1,2,3]){
    const state=makeState({cursor,sourceTeam:cursor%2,sourceSeat:cursor});
    const targetUid=cursor%2===0?'m1:red-monster':'m0:blue-monster';
    const activated=activate(state,'rotation-'+cursor,'change-position',targetUid);
    const result=resolveEnemyControllerResolution(activated.state,resolution(activated.state,'rotation-'+cursor'),false,lookup);
    assert.equal(result.status,'position-changed');
    assert.equal(result.state.active[cursor%2],cursor);
  }
});
test('3+3 zonas, Field Zone separada, Extra 5 e mão 6/End Phase permanecem intactos',()=>{
  const field={...ref('m0:field','field'),setTurn:1,faceUp:true};
  const state=makeState({field0:field,backrow0:[{...ref('m0:old-back','other'),setTurn:1,faceUp:true}]});
  const result=resolve(state,'layout');
  assert.equal(result.state.core.players[0].field.uid,'m0:field');
  assert.equal(result.state.core.players[0].backrow.length,1);
  assert.equal(result.state.core.players[0].extra.length,5);
  assert.equal(result.state.core.players[0].hand.length,1);
});
test('mão acima de seis não é descartada pelo adaptador e Deck curto não é truncado',()=>{
  const hand=[ref('m0:enemy-controller',ENEMY_CONTROLLER_ID),...refs(0,'extra-hand',7)];
  const state=makeState({hand0:hand,deck0:refs(0,'short-deck',1)});
  const result=resolve(state,'hand-limit');
  assert.equal(result.state.core.players[0].hand.length,7);
  assert.equal(result.state.core.players[0].deck.length,1);
});
test('inventário físico é conservado sem grants',()=>{
  const state=makeState(),before=inventory(state),result=resolve(state,'conserve');
  assert.deepEqual(inventory(result.state),before);
});
test('ativação e resolução não mutam a entrada do chamador',()=>{
  const state=makeState(),before=JSON.stringify(state),activated=activate(state,'immutable');
  const snapshot=JSON.stringify(activated.state);
  resolveEnemyControllerResolution(activated.state,resolution(activated.state,'immutable'),false,lookup);
  assert.equal(JSON.stringify(state),before);
  assert.equal(JSON.stringify(activated.state),snapshot);
});
test('UID malformado ou duplicado é rejeitado',()=>{
  const malformed=makeState({monsters0:[{...ref('bad-uid'),owner:0,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0}]});
  assert.throws(()=>getEnemyControllerTargetCandidates(malformed,0,lookup));
  const duplicate=makeState({monsters0:[monster('m0:same')],monsters1:[monster('m0:same')]});
  assert.throws(()=>getEnemyControllerTargetCandidates(duplicate,0,lookup));
});
