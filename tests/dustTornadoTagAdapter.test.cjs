'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {tagInventory}=require('../dist/tagDuel');
const {
  DUST_TORNADO_ID,getDustTornadoTargetCandidates,planDustTornadoActivation,
  registerDustTornadoActivation,planDustTornadoResolution,resolveDustTornadoResolution
}=require('../dist/dustTornadoTagAdapter');
const lookup=id=>id===DUST_TORNADO_ID?{kind:'trap'}:id==='monster'?{kind:'monster',monsterType:'effect'}:
  id==='other-trap'?{kind:'trap'}:{kind:'spell'};
const ref=(uid,id='spell',extra={})=>({uid,id,...extra});
const refs=(seat,prefix,count)=>Array.from({length:count},(_,i)=>ref('m'+seat+':'+prefix+'-'+i));
const back=(uid,id,{faceUp=false,setTurn=1}={})=>({...ref(uid,id),faceUp,setTurn});
function makeState({
  cursor=0,sourceTeam=0,sourceSeat=cursor,sourceSetTurn=1,phase='main',priority=cursor%2,chain=[],
  backrow0=[],backrow1=[],field0=null,field1=null,hand0,hand1,deck0,deck1,extra0,extra1,
  reserveHands={},reserveDecks={},turn=3
}={}){
  const active=cursor===2?[2,1]:cursor===3?[0,3]:[0,1],source=back('m'+sourceSeat+':dust-tornado',DUST_TORNADO_ID,{faceUp:false,setTurn:sourceSetTurn}),reserves={};
  for(const seat of [0,1,2,3])if(!active.includes(seat))reserves[String(seat)]={
    deck:reserveDecks[seat]??refs(seat,'reserve-deck',2),hand:reserveHands[seat]??refs(seat,'reserve-hand',2),extra:refs(seat,'reserve-extra',5)
  };
  const players=[
    {id:'tag-team-0',name:'Equipe Azul',lp:4000,deck:deck0??refs(active[0],'deck-a',2),hand:hand0??refs(active[0],'hand-a',2),
      monsters:[],backrow:[...backrow0],grave:[],extra:extra0??refs(active[0],'extra-a',5),banished:[],field:field0,summoned:false},
    {id:'tag-team-1',name:'Equipe Vermelha',lp:4000,deck:deck1??refs(active[1],'deck-b',2),hand:hand1??refs(active[1],'hand-b',2),
      monsters:[],backrow:[...backrow1],grave:[],extra:extra1??refs(active[1],'extra-b',5),banished:[],field:field1,summoned:false}
  ];
  players[sourceTeam].backrow.push(source);
  const teamRotation={version:1,cursor,active,reserves};
  const core={version:1,players,turn,current:cursor%2,phase,resume:'main',priority,passes:0,pending:{kind:'none'},chain,
    winner:null,reason:'',log:[],teamRotation,cardLifetimes:{}};
  const members=[{id:'p0',name:'P0',team:0},{id:'p1',name:'P1',team:1},{id:'p2',name:'P2',team:0},{id:'p3',name:'P3',team:1}];
  const state={version:1,mode:'tag-classic',members,active,cursor,reserves,core};
  synchronizeCardLifetimes(core);return state;
}
const sourceFor=state=>state.core.players.flatMap(player=>player.backrow).find(card=>card.id===DUST_TORNADO_ID)?.uid??('m'+state.cursor+':dust-tornado');
const activate=(state,id,targetUid)=>{
  const plan=planDustTornadoActivation(state,sourceFor(state),id,targetUid,lookup);
  return {plan,state:registerDustTornadoActivation(state,plan,lookup)};
};
const resolution=(state,id)=>planDustTornadoResolution(state,id);
const resolve=(state,id,targetUid,setUid,negated=false,prevented=false)=>{
  const activated=activate(state,id,targetUid);
  return resolveDustTornadoResolution(activated.state,resolution(activated.state,id),negated,prevented,setUid,lookup);
};
const inventory=state=>tagInventory(state).map(card=>card.uid+'='+card.id).sort();
const moveTarget=(state,fromTeam,toTeam,uid,toZone='grave')=>{
  const from=state.core.players[fromTeam],index=from.backrow.findIndex(card=>card.uid===uid);
  if(index>=0){const [card]=from.backrow.splice(index,1);if(toZone==='field')state.core.players[toTeam].field=card;else if(toZone==='backrow')state.core.players[toTeam].backrow.push(card);else state.core.players[toTeam].grave.push(card);}
  else if(from.field?.uid===uid){const card=from.field;from.field=null;if(toZone==='field')state.core.players[toTeam].field=card;else state.core.players[toTeam].grave.push(card);}
  synchronizeCardLifetimes(state.core);
};

test('candidatos incluem backrow e Field Zone adversários, mas não a própria equipe',()=>{
  const state=makeState({backrow1:[back('m1:set','other-trap')],field1:back('m3:field','spell')});
  assert.deepEqual(getDustTornadoTargetCandidates(state,0,lookup),['m1:set','m3:field']);
});
test('alvo face-down é selecionável e a API privada retorna somente UID',()=>{
  const state=makeState({backrow1:[back('m1:hidden','other-trap',{faceUp:false})]});
  const targets=getDustTornadoTargetCandidates(state,0,lookup);
  assert.deepEqual(targets,['m1:hidden']);assert.equal(targets[0].includes('other-trap'),false);
});
test('Dust Tornado setada no turno atual não pode ser ativada',()=>{
  const state=makeState({sourceSetTurn:3,backrow1:[back('m1:target','spell')]});
  assert.throws(()=>planDustTornadoActivation(state,sourceFor(state),'same-turn','m1:target',lookup));
});
test('Trap setada em turno anterior pode ser ativada na própria prioridade',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')]});
  assert.doesNotThrow(()=>planDustTornadoActivation(state,sourceFor(state),'own','m1:target',lookup));
});
test('Trap setada pode responder a corrente no turno adversário',()=>{
  const state=makeState({cursor:0,sourceTeam:1,sourceSeat:3,phase:'response',priority:1,chain:[{id:'chain-1'}],
    backrow0:[back('m0:target','spell')]});
  assert.doesNotThrow(()=>planDustTornadoActivation(state,sourceFor(state),'response','m0:target',lookup));
});
test('Trap não responde sem corrente aberta',()=>{
  const state=makeState({cursor:0,sourceTeam:1,sourceSeat:3,phase:'response',priority:1,chain:[],
    backrow0:[back('m0:target','spell')]});
  assert.throws(()=>planDustTornadoActivation(state,sourceFor(state),'no-chain','m0:target',lookup));
});
test('Trap não responde se prioridade pertence à outra equipe',()=>{
  const state=makeState({cursor:0,sourceTeam:1,sourceSeat:3,phase:'response',priority:0,chain:[{id:'chain-1'}],
    backrow0:[back('m0:target','spell')]});
  assert.throws(()=>planDustTornadoActivation(state,sourceFor(state),'wrong-priority','m0:target',lookup));
});
test('alvo monstro não é aceito',()=>{
  const state=makeState({backrow1:[back('m1:monster','monster')]});
  assert.throws(()=>planDustTornadoActivation(state,sourceFor(state),'monster','m1:monster',lookup));
});
test('não ativa sem Spell/Trap adversária',()=>{
  const state=makeState();
  assert.throws(()=>planDustTornadoActivation(state,sourceFor(state),'empty','missing',lookup));
});
test('registro vira a Trap face-up e persiste alvo/zone/epoch',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')]});
  const plan=planDustTornadoActivation(state,sourceFor(state),'register','m1:target',lookup);
  const registered=registerDustTornadoActivation(state,plan,lookup);
  assert.equal(registered.core.players[0].backrow.find(card=>card.uid===plan.sourceUid).faceUp,true);
  assert.equal(registered.dustTornado.pending.register.targetBinding.zone,'backrow');
  assert.equal(registered.core.players[1].backrow[0].uid,'m1:target');
});
test('destrói alvo backrow e envia ao GY do proprietário físico',()=>{
  const state=makeState({sourceTeam:0,sourceSeat:0,backrow1:[back('m3:owned-target','other-trap')]});
  const result=resolve(state,'destroy','m3:owned-target');
  assert.equal(result.status,'destroyed');
  assert.equal(result.state.core.players[1].grave.some(card=>card.uid==='m3:owned-target'),true);
});
test('destrói Field Spell sem consumir uma Spell/Trap Zone',()=>{
  const state=makeState({field1:back('m3:field','spell'),backrow1:[back('m1:other','other-trap')]});
  const result=resolve(state,'field','m3:field');
  assert.equal(result.state.core.players[1].field,null);
  assert.equal(result.state.core.players[1].backrow[0].uid,'m1:other');
  assert.equal(result.state.core.players[1].grave.some(card=>card.uid==='m3:field'),true);
});
test('depois de destruir, pode Setar uma Spell da mão face-down',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')],hand0:[ref('m0:set-spell','spell-card')]});
  const result=resolve(state,'set-spell','m1:target','m0:set-spell');
  const set=result.state.core.players[0].backrow.find(card=>card.uid==='m0:set-spell');
  assert.equal(result.status,'destroyed-and-set');assert.equal(set.faceUp,false);assert.equal(set.setTurn,3);
});
test('depois de destruir, pode Setar uma Trap da mão',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')],hand0:[ref('m0:set-trap','other-trap')]});
  const result=resolve(state,'set-trap','m1:target','m0:set-trap');
  assert.equal(result.state.core.players[0].backrow.some(card=>card.uid==='m0:set-trap'&&!card.faceUp),true);
});
test('pode resolver sem escolher uma carta adicional para Setar',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')]});
  const result=resolve(state,'no-set','m1:target');
  assert.equal(result.status,'destroyed');assert.equal(result.state.core.players[0].hand.length,2);
});
test('não pode Setar uma carta de monstro',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')],hand0:[ref('m0:monster','monster')]});
  const activated=activate(state,'bad-set','m1:target');
  const before=JSON.stringify(activated.state);
  assert.throws(()=>resolveDustTornadoResolution(activated.state,resolution(activated.state,'bad-set'),false,false,'m0:monster',lookup));
  assert.equal(JSON.stringify(activated.state),before);
});
test('carta opcional deve estar na mão da equipe ativa',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')]});
  const activated=activate(state,'not-in-hand','m1:target');
  assert.throws(()=>resolveDustTornadoResolution(activated.state,resolution(activated.state,'not-in-hand'),false,false,'m2:reserve-hand-0',lookup));
});
test('alvo que sai do campo antes da resolução invalida a destruição e o Set opcional',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')],hand0:[ref('m0:set-spell','spell-card')]});
  const activated=activate(state,'target-left','m1:target'),changed=structuredClone(activated.state);
  moveTarget(changed,1,1,'m1:target');
  const result=resolveDustTornadoResolution(changed,resolution(changed,'target-left'),false,false,'m0:set-spell',lookup);
  assert.equal(result.status,'target-invalid');assert.equal(result.state.core.players[0].hand.some(card=>card.uid==='m0:set-spell'),true);
});
test('alvo que muda para a equipe controladora deixa de ser válido',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')]});
  const activated=activate(state,'controller','m1:target'),changed=structuredClone(activated.state);
  moveTarget(changed,1,0,'m1:target','backrow');
  const result=resolveDustTornadoResolution(changed,resolution(changed,'controller'),false,false,undefined,lookup);
  assert.equal(result.status,'target-invalid');
});
test('mudança de backrow para Field Zone invalida o TargetBinding',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')]});
  const activated=activate(state,'zone-change','m1:target'),changed=structuredClone(activated.state);
  moveTarget(changed,1,1,'m1:target','field');
  const result=resolveDustTornadoResolution(changed,resolution(changed,'zone-change'),false,false,undefined,lookup);
  assert.equal(result.status,'target-invalid');
});
test('destruição impedida não executa o Set opcional',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')],hand0:[ref('m0:set-spell','spell-card')]});
  const result=resolve(state,'protected','m1:target','m0:set-spell',false,true);
  assert.equal(result.status,'destruction-prevented');
  assert.equal(result.state.core.players[0].hand.some(card=>card.uid==='m0:set-spell'),true);
  assert.equal(result.state.core.players[1].backrow.some(card=>card.uid==='m1:target'),true);
});
test('negação envia Dust Tornado ao GY sem destruir alvo ou Setar carta',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')],hand0:[ref('m0:set-spell','spell-card')]});
  const result=resolve(state,'negated','m1:target','m0:set-spell',true,false);
  assert.equal(result.status,'negated');
  assert.equal(result.state.core.players[1].backrow.some(card=>card.uid==='m1:target'),true);
  assert.equal(result.state.core.players[0].hand.some(card=>card.uid==='m0:set-spell'),true);
});
test('Set opcional é permitido quando o backrow estava cheio porque a Trap sai ao resolver',()=>{
  const backrow=[back('m0:old-1','spell'),back('m0:old-2','other-trap')];
  const state=makeState({backrow0:backrow,backrow1:[back('m1:target','spell')],hand0:[ref('m0:set-spell','spell-card')]});
  const result=resolve(state,'full-own-backrow','m1:target','m0:set-spell');
  assert.equal(result.state.core.players[0].backrow.length,3);
  assert.equal(result.state.core.players[0].backrow.some(card=>card.uid==='m0:set-spell'),true);
});
test('activationId duplicado e replay são rejeitados',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')]});
  const activated=activate(state,'replay','m1:target');
  assert.throws(()=>planDustTornadoActivation(activated.state,sourceFor(activated.state),'replay','m1:target',lookup));
  const result=resolveDustTornadoResolution(activated.state,resolution(activated.state,'replay'),false,false,undefined,lookup);
  assert.throws(()=>planDustTornadoActivation(result.state,sourceFor(result.state),'replay','m1:target',lookup));
});
test('memória pendente sobrevive ao round-trip JSON',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')]});
  const activated=activate(state,'json','m1:target');
  const restored=JSON.parse(JSON.stringify(activated.state));
  assert.equal(planDustTornadoResolution(restored,'json').targetUid,'m1:target');
});
test('quatro rotações e Trap do parceiro preservam proprietário físico',()=>{
  for(const cursor of [0,1,2,3]){
    const team=cursor%2,sourceSeat=cursor,sourceTeam=team,targetTeam=1-team;
    const state=makeState({cursor,sourceTeam,sourceSeat,backrow0:targetTeam===0?[back('m0:target','spell')]:[],
      backrow1:targetTeam===1?[back('m1:target','spell')]:[]});
    const targetUid=targetTeam===0?'m0:target':'m1:target';
    const result=resolve(state,'rotation-'+cursor,targetUid);
    assert.equal(result.status,'destroyed');
    assert.equal(result.state.core.players[team].grave.some(card=>card.uid==='m'+sourceSeat+':dust-tornado'),true);
  }
});
test('3+3 zonas, Field Zone separada, Extra 5 e mão 6 não são alterados indevidamente',()=>{
  const field=back('m1:field','spell');
  const state=makeState({field1:field,backrow1:[back('m1:target','spell')]});
  const result=resolve(state,'layout','m1:target');
  assert.equal(result.state.core.players[1].field.uid,'m1:field');
  assert.equal(result.state.core.players[0].extra.length,5);
  assert.equal(result.state.core.players[0].hand.length,2);
});
test('mão acima de seis não é descartada antes da End Phase e Deck curto não é truncado',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')],hand0:[...refs(0,'hand',7)]});
  const result=resolve(state,'hand-limit','m1:target');
  assert.equal(result.state.core.players[0].hand.length,7);assert.equal(result.state.core.players[0].deck.length,2);
});
test('inventário físico é conservado sem grants',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')],hand0:[ref('m0:set-spell','spell-card')]});
  const before=inventory(state),result=resolve(state,'conserve','m1:target','m0:set-spell');
  assert.deepEqual(inventory(result.state),before);
});
test('ativação e resolução não mutam a entrada do chamador',()=>{
  const state=makeState({backrow1:[back('m1:target','spell')]}),before=JSON.stringify(state);
  const activated=activate(state,'immutable','m1:target'),snapshot=JSON.stringify(activated.state);
  resolveDustTornadoResolution(activated.state,resolution(activated.state,'immutable'),false,false,undefined,lookup);
  assert.equal(JSON.stringify(state),before);assert.equal(JSON.stringify(activated.state),snapshot);
});
test('UID malformado ou duplicado é rejeitado',()=>{
  const malformed=makeState({backrow1:[{...back('bad-uid','spell')}]});
  malformed.core.players[1].backrow[0].uid='bad-uid';
  assert.throws(()=>getDustTornadoTargetCandidates(malformed,0,lookup));
  const duplicate=makeState({backrow1:[back('m1:same','spell')],backrow0:[back('m1:same','other-trap')]});
  assert.throws(()=>getDustTornadoTargetCandidates(duplicate,0,lookup));
});
