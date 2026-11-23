'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {tagInventory}=require('../dist/tagDuel');
const {legalActions}=require('../dist/duelEngine');
const {
  CREATURE_SWAP_ID,getCreatureSwapCandidates,planCreatureSwapActivation,
  registerCreatureSwapActivation,planCreatureSwapResolution,resolveCreatureSwapResolution
}=require('../dist/creatureSwapTagAdapter');
const lookup=id=>id===CREATURE_SWAP_ID?{kind:'spell'}:{kind:'monster',monsterType:'effect'};
const ref=(uid,id='monster',extra={})=>({uid,id,...extra});
const refs=(seat,prefix,count)=>Array.from({length:count},(_,i)=>ref('m'+seat+':'+prefix+'-'+i));
const monster=(uid,{owner,position='atk',faceUp=true,positionLockedThrough=0}={})=>({
  ...ref(uid),owner:owner??Number(/^m([0-3]):/.exec(uid)[1]),position,faceUp,
  entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0,positionLockedThrough
});
function makeState({
  cursor=0,sourceId=CREATURE_SWAP_ID,monsters0,monsters1,backrow0=[],backrow1=[],
  hand0,hand1,deck0,deck1,extra0,extra1,reserveHands={},reserveDecks={},field0=null,field1=null,turn=3
}={}){
  const active=cursor===2?[2,1]:cursor===3?[0,3]:[0,1],source=ref('m'+cursor+':creature-swap',sourceId),reserves={};
  for(const seat of [0,1,2,3])if(!active.includes(seat))reserves[String(seat)]={
    deck:reserveDecks[seat]??refs(seat,'reserve-deck',2),
    hand:reserveHands[seat]??refs(seat,'reserve-hand',2),extra:refs(seat,'reserve-extra',5)
  };
  const players=[
    {id:'tag-team-0',name:'Equipe Azul',lp:4000,deck:deck0??refs(active[0],'deck-a',2),
      hand:hand0??(cursor%2===0?[source,ref('m'+active[0]+':blue-hand')]:refs(active[0],'hand-a',2)),
      monsters:monsters0??[monster('m0:blue-monster')],backrow:backrow0,grave:[],extra:extra0??refs(active[0],'extra-a',5),
      banished:[],field:field0,summoned:false},
    {id:'tag-team-1',name:'Equipe Vermelha',lp:4000,deck:deck1??refs(active[1],'deck-b',2),
      hand:hand1??(cursor%2===1?[source,ref('m'+active[1]+':red-hand')]:refs(active[1],'hand-b',2)),
      monsters:monsters1??[monster('m1:red-monster')],backrow:backrow1,grave:[],extra:extra1??refs(active[1],'extra-b',5),
      banished:[],field:field1,summoned:false}
  ];
  const teamRotation={version:1,cursor,active,reserves};
  const core={version:1,players,turn,current:cursor%2,phase:'main',resume:'main',priority:cursor%2,passes:0,
    pending:{kind:'none'},chain:[],winner:null,reason:'',log:[],teamRotation,cardLifetimes:{}};
  const members=[{id:'p0',name:'P0',team:0},{id:'p1',name:'P1',team:1},{id:'p2',name:'P2',team:0},{id:'p3',name:'P3',team:1}];
  const state={version:1,mode:'tag-classic',members,active,cursor,reserves,core};
  synchronizeCardLifetimes(core);return state;
}
const sourceFor=state=>'m'+state.cursor+':creature-swap';
const activate=(state,id='swap-1')=>{
  const plan=planCreatureSwapActivation(state,sourceFor(state),id,lookup);
  return {plan,state:registerCreatureSwapActivation(state,plan,lookup)};
};
const resolution=(state,id='swap-1')=>planCreatureSwapResolution(state,id);
const resolve=(state,id='swap-1',choices={team0Uid:'m0:blue-monster',team1Uid:'m1:red-monster'},negated=false)=>
  resolveCreatureSwapResolution(state,resolution(state,id),choices,negated);
const inventory=state=>tagInventory(state).map(card=>card.uid+'='+card.id).sort();
const moveMonsterToGrave=(state,team,uid)=>{
  const list=state.core.players[team].monsters,index=list.findIndex(card=>card.uid===uid);
  assert.notEqual(index,-1);const [card]=list.splice(index,1);state.core.players[team].grave.push(card);
  synchronizeCardLifetimes(state.core);
};

test('candidatos mostram somente monstros controlados pela equipe e incluem face-down',()=>{
  const state=makeState({monsters0:[monster('m0:blue-up'),monster('m2:blue-down',{position:'def',faceUp:false})]});
  assert.deepEqual(getCreatureSwapCandidates(state,0),['m0:blue-up','m2:blue-down']);
  assert.deepEqual(getCreatureSwapCandidates(state,1),['m1:red-monster']);
});
test('somente o representante físico ativo pode ativar a carta da própria mão',()=>{
  const state=makeState({cursor:2});
  assert.doesNotThrow(()=>planCreatureSwapActivation(state,'m2:creature-swap','active',lookup));
  assert.throws(()=>planCreatureSwapActivation(state,'m0:creature-swap','inactive',lookup));
});
test('rejeita uma fonte que não seja Creature Swap',()=>{
  const state=makeState({sourceId:'other-spell'});
  assert.throws(()=>planCreatureSwapActivation(state,sourceFor(state),'wrong-card',lookup));
});
test('rejeita ativação fora da Main Phase',()=>{
  const state=makeState();state.core.phase='battle';
  assert.throws(()=>planCreatureSwapActivation(state,sourceFor(state),'phase',lookup));
});
test('rejeita corrente ou decisão pendente',()=>{
  const chain=makeState();chain.core.chain=[{id:'chain-1'}];
  assert.throws(()=>planCreatureSwapActivation(chain,sourceFor(chain),'chain',lookup));
  const choice=makeState();choice.core.choice={actor:0,targets:['m0:blue-monster']};
  assert.throws(()=>planCreatureSwapActivation(choice,sourceFor(choice),'choice',lookup));
});
test('não ativa se uma equipe não controla monstros',()=>{
  const state=makeState({monsters1:[]});
  assert.throws(()=>planCreatureSwapActivation(state,sourceFor(state),'empty',lookup));
});
test('exige uma Spell/Trap Zone livre para ativar a Magia Normal',()=>{
  const backrow=[0,1,2].map(i=>({...ref('m0:back-'+i,'other'),setTurn:1,faceUp:true}));
  const state=makeState({backrow0:backrow});
  assert.throws(()=>planCreatureSwapActivation(state,sourceFor(state),'full-zone',lookup));
});
test('ativação move a carta da mão para backrow face-up e não escolhe alvos',()=>{
  const state=makeState(),before=inventory(state),result=activate(state,'no-target');
  assert.equal(result.plan.kind,'creature-swap-activation');
  assert.equal('targetUid' in result.plan,false);
  assert.equal('targetBinding' in result.plan,false);
  assert.equal(result.state.core.players[0].hand.some(card=>card.uid==='m0:creature-swap'),false);
  assert.equal(result.state.core.players[0].backrow.some(card=>card.uid==='m0:creature-swap'&&card.faceUp),true);
  assert.deepEqual(inventory(result.state),before);
});
test('as duas escolhas são exigidas somente na resolução',()=>{
  const activated=activate(makeState(),'choices');
  const plan=resolution(activated.state,'choices');
  assert.equal('targetUid' in plan,false);
  assert.throws(()=>resolveCreatureSwapResolution(activated.state,plan,undefined,false));
  assert.equal(activated.state.creatureSwap.pending.choices.sourceUid,'m0:creature-swap');
});
test('troca simultaneamente os dois monstros e preserva UID, dono, posição e face-up',()=>{
  const state=makeState({
    monsters0:[monster('m2:blue-partner',{owner:2,position:'def',faceUp:true})],
    monsters1:[monster('m3:red-partner',{owner:3,position:'atk',faceUp:true})]
  });
  const activated=activate(state,'simultaneous');
  const result=resolve(activated.state,'simultaneous',{team0Uid:'m2:blue-partner',team1Uid:'m3:red-partner'});
  assert.equal(result.status,'swapped');
  const blue=result.state.core.players[0].monsters[0],red=result.state.core.players[1].monsters[0];
  assert.equal(blue.uid,'m3:red-partner');assert.equal(blue.owner,3);assert.equal(blue.position,'atk');assert.equal(blue.faceUp,true);
  assert.equal(red.uid,'m2:blue-partner');assert.equal(red.owner,2);assert.equal(red.position,'def');assert.equal(red.faceUp,true);
});
test('monstro face-down pode ser escolhido e continua face-down em Defesa',()=>{
  const state=makeState({monsters0:[monster('m0:blue-down',{position:'def',faceUp:false})]});
  const activated=activate(state,'facedown');
  const result=resolve(activated.state,'facedown',{team0Uid:'m0:blue-down',team1Uid:'m1:red-monster'});
  const moved=result.state.core.players[1].monsters[0];
  assert.equal(moved.uid,'m0:blue-down');assert.equal(moved.faceUp,false);assert.equal(moved.position,'def');
});
test('não Invoca nem reinicia a identidade do monstro ao trocar controle',()=>{
  const state=makeState({monsters0:[{...monster('m0:blue'),entered:2,changed:2,attacked:1}]});
  const activated=activate(state,'no-summon');
  const result=resolve(activated.state,'no-summon',{team0Uid:'m0:blue',team1Uid:'m1:red-monster'});
  const moved=result.state.core.players[1].monsters.find(card=>card.uid==='m0:blue');
  assert.equal(moved.entered,2);assert.equal(moved.changed,2);assert.equal(moved.attacked,1);
});
test('ambos os monstros ficam bloqueados para mudança de posição até o fim do turno',()=>{
  const state=makeState();
  const result=resolve(activate(state,'lock').state,'lock');
  for(const uid of ['m0:blue-monster','m1:red-monster']){
    const monster=result.state.core.players.flatMap(player=>player.monsters).find(card=>card.uid===uid);
    assert.equal(monster.positionLockedThrough,3);
    assert.equal(legalActions(result.state.core).some(action=>action.kind==='position'&&action.card===uid),false);
  }
});
test('bloqueio de posição expira no turno seguinte',()=>{
  const result=resolve(activate(makeState(),'unlock-next').state,'unlock-next');
  const next=structuredClone(result.state);next.core.turn=4;
  const moved=next.core.players[0].monsters.find(card=>card.uid==='m1:red-monster');
  assert.equal(moved.positionLockedThrough<next.core.turn,true);
  assert.equal(moved.entered<next.core.turn&&moved.changed<next.core.turn&&moved.attacked<next.core.turn,true);
});
test('preserva um bloqueio de posição que já se estendia além do turno atual',()=>{
  const state=makeState({monsters0:[monster('m0:blue',{positionLockedThrough:8})]});
  const activated=activate(state,'long-lock');
  const result=resolve(activated.state,'long-lock',{team0Uid:'m0:blue',team1Uid:'m1:red-monster'});
  const moved=result.state.core.players[1].monsters.find(card=>card.uid==='m0:blue');
  assert.equal(moved.positionLockedThrough,8);
});
test('escolha inexistente da equipe 0 é rejeitada sem mutação parcial',()=>{
  const activated=activate(makeState(),'bad-blue'),before=JSON.stringify(activated.state);
  assert.throws(()=>resolve(activated.state,'bad-blue',{team0Uid:'missing',team1Uid:'m1:red-monster'}));
  assert.equal(JSON.stringify(activated.state),before);
});
test('escolha inexistente da equipe 1 é rejeitada sem mutação parcial',()=>{
  const activated=activate(makeState(),'bad-red'),before=JSON.stringify(activated.state);
  assert.throws(()=>resolve(activated.state,'bad-red',{team0Uid:'m0:blue-monster',team1Uid:'missing'}));
  assert.equal(JSON.stringify(activated.state),before);
});
test('não aceita selecionar a mesma identidade para as duas equipes',()=>{
  const activated=activate(makeState(),'same-uid'),before=JSON.stringify(activated.state);
  assert.throws(()=>resolve(activated.state,'same-uid',{team0Uid:'m0:blue-monster',team1Uid:'m0:blue-monster'}));
  assert.equal(JSON.stringify(activated.state),before);
});
test('negação envia Creature Swap ao GY sem trocar monstros',()=>{
  const state=makeState(),activated=activate(state,'negated');
  const result=resolveCreatureSwapResolution(activated.state,resolution(activated.state,'negated'),undefined,true);
  assert.equal(result.status,'negated');
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid==='m0:creature-swap'),true);
  assert.equal(result.state.core.players[0].monsters[0].uid,'m0:blue-monster');
  assert.equal(result.state.core.players[1].monsters[0].uid,'m1:red-monster');
});
test('se uma equipe ficar sem monstros antes da resolução, a Magia vai ao GY sem troca',()=>{
  const activated=activate(makeState(),'empty-on-resolve');
  const changed=structuredClone(activated.state);moveMonsterToGrave(changed,1,'m1:red-monster');
  const result=resolveCreatureSwapResolution(changed,resolution(changed,'empty-on-resolve'),undefined,false);
  assert.equal(result.status,'no-monsters');
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid==='m0:creature-swap'),true);
});
test('se a fonte sair do backrow antes da resolução, não executa a troca',()=>{
  const activated=activate(makeState(),'source-gone'),changed=structuredClone(activated.state);
  const [spell]=changed.core.players[0].backrow.splice(0,1);changed.core.players[0].grave.push(spell);
  synchronizeCardLifetimes(changed.core);
  const result=resolveCreatureSwapResolution(changed,resolution(changed,'source-gone'),{team0Uid:'m0:blue-monster',team1Uid:'m1:red-monster'});
  assert.equal(result.status,'source-missing');
  assert.equal(result.state.core.players[0].monsters[0].uid,'m0:blue-monster');
});
test('activationId duplicado é rejeitado enquanto a ativação está pendente',()=>{
  const activated=activate(makeState(),'duplicate');
  assert.throws(()=>planCreatureSwapActivation(activated.state,sourceFor(activated.state),'duplicate',lookup));
});
test('activationId resolvido não pode ser reutilizado',()=>{
  const result=resolve(activate(makeState(),'replay').state,'replay');
  assert.throws(()=>planCreatureSwapActivation(result.state,sourceFor(result.state),'replay',lookup));
});
test('memória pendente e replay sobrevivem ao round-trip JSON',()=>{
  const activated=activate(makeState(),'json');
  const restored=JSON.parse(JSON.stringify(activated.state));
  assert.equal(planCreatureSwapResolution(restored,'json').sourceUid,'m0:creature-swap');
  const result=resolve(restored,'json');
  const restoredAgain=JSON.parse(JSON.stringify(result.state));
  assert.throws(()=>planCreatureSwapActivation(restoredAgain,sourceFor(restoredAgain),'json',lookup));
});
test('quatro rotações mantêm representante físico, equipe e UID do dono',()=>{
  for(const cursor of [0,1,2,3]){
    const state=makeState({cursor,monsters0:[monster('m2:blue-owned',{owner:2})],monsters1:[monster('m3:red-owned',{owner:3})]});
    const activated=activate(state,'rotation-'+cursor);
    const result=resolve(activated.state,'rotation-'+cursor,{team0Uid:'m2:blue-owned',team1Uid:'m3:red-owned'});
    assert.equal(result.state.active[cursor%2],cursor);
    assert.equal(result.state.core.players[0].monsters[0].uid,'m3:red-owned');
    assert.equal(result.state.core.players[1].monsters[0].uid,'m2:blue-owned');
    assert.equal(result.state.core.players[0].monsters[0].owner,3);
    assert.equal(result.state.core.players[1].monsters[0].owner,2);
  }
});
test('3+3 zonas, Field Zone separada e Extra Deck máximo cinco são preservados',()=>{
  const field={...ref('m0:field','field'),setTurn:1,faceUp:true};
  const state=makeState({backrow0:[{...ref('m0:old-back','other'),setTurn:1,faceUp:true}],field0:field});
  const result=resolve(activate(state,'zones').state,'zones');
  assert.equal(result.state.core.players[0].backrow.length,1);
  assert.equal(result.state.core.players[0].field.uid,'m0:field');
  assert.equal(result.state.core.players[0].extra.length,5);
  assert.equal(result.state.core.players[0].monsters.length,1);
  assert.equal(result.state.core.players[1].monsters.length,1);
});
test('mão acima de seis não é descartada antes da End Phase e Deck curto não é truncado',()=>{
  const hand=[ref('m0:creature-swap',CREATURE_SWAP_ID),...refs(0,'extra-hand',7)];
  const state=makeState({hand0:hand,deck0:refs(0,'short-deck',1)});
  const result=resolve(activate(state,'hand-limit').state,'hand-limit');
  assert.equal(result.state.core.players[0].hand.length,7);
  assert.equal(result.state.core.players[0].deck.length,1);
});
test('inventário físico é conservado e nenhuma carta é concedida',()=>{
  const state=makeState(),before=inventory(state),result=resolve(activate(state,'conserve').state,'conserve');
  assert.deepEqual(inventory(result.state),before);
});
test('ativação e resolução não mutam a entrada do chamador',()=>{
  const state=makeState(),before=JSON.stringify(state),activated=activate(state,'immutable');
  const activatedSnapshot=JSON.stringify(activated.state);
  resolve(activated.state,'immutable');
  assert.equal(JSON.stringify(state),before);
  assert.equal(JSON.stringify(activated.state),activatedSnapshot);
});
test('UID físico malformado ou duplicado é rejeitado',()=>{
  const malformed=makeState({monsters0:[{...ref('blue-no-owner'),owner:0,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0}]});
  assert.throws(()=>getCreatureSwapCandidates(malformed,0));
  const duplicate=makeState({monsters0:[monster('m0:same')],monsters1:[monster('m0:same')]});
  assert.throws(()=>getCreatureSwapCandidates(duplicate,0));
});
