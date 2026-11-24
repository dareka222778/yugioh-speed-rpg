const test=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagNormalCardIds,tagInventory}=require('../dist/tagDuel.js');
const {enabledCardIds,getDuelCard}=require('../dist/effectRegistry.js');
const {
 prepareFlipRandomTrigger,resolveDiceJar,resolveFireSorcerer,
 assertFlipRandomPhysicalRules,assertPhysicalExtraDeckCounts
}=require('../dist/flipRandomTagAdapter.js');

const IDS={diceJar:tagNormalCardIds[0],fireSorcerer:tagNormalCardIds[1]};
const SPELL_ID=enabledCardIds.find(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field);
const TRAP_ID=enabledCardIds.find(id=>getDuelCard(id)?.kind==='trap');
const FIELD_ID=enabledCardIds.find(id=>getDuelCard(id)?.kind==='spell'&&getDuelCard(id)?.field===true);
assert.ok(tagNormalCardIds.length>=22,'fixture precisa de pelo menos 22 monstros normais');
assert.ok(SPELL_ID,'fixture precisa de uma Magia habilitada');
assert.ok(TRAP_ID,'fixture precisa de uma Armadilha habilitada');
assert.ok(FIELD_ID,'fixture precisa de uma Magia de Campo habilitada');

function makeDuel(){
 const deck=tagNormalCardIds.slice(2,22);
 const players=Array.from({length:4},(_,seat)=>({id:'m'+seat,name:'Duelista '+seat,cards:[...deck]}));
 return createTagDuel(players,{seed:'m590-flip-random',first:0,classic:true});
}
function privateZone(duel,seat,zone){
 const team=seat%2;
 if(duel.active[team]===seat)return duel.core.players[team][zone];
 const reserve=duel.reserves[String(seat)];
 if(!reserve)throw new Error('Reserva física ausente.');
 return reserve[zone];
}
function putMonster(duel,ownerSeat,controllerTeam,id){
 const ref=privateZone(duel,ownerSeat,'deck').pop();
 assert.ok(ref);
 ref.id=id;
 const monster={...ref,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0};
 duel.core.players[controllerTeam].monsters.push(monster);
 return monster;
}
function moveDeckToHand(duel,seat){
 const ref=privateZone(duel,seat,'deck').pop();
 assert.ok(ref);
 privateZone(duel,seat,'hand').push(ref);
 return ref.uid;
}
function moveSourceToOwnerGrave(duel,source){
 const controller=duel.core.players.findIndex(team=>team.monsters.some(monster=>monster.uid===source.uid));
 assert.notEqual(controller,-1);
 duel.core.players[controller].monsters=duel.core.players[controller].monsters.filter(monster=>monster.uid!==source.uid);
 const owner=Number(/^m([0-3]):/.exec(source.uid)[1])%2;
 duel.core.players[owner].grave.push({uid:source.uid,id:source.id});
}
function eventFor(duel,source,controllerTeam,cause='flip-summon',overrides={}){
 return {id:'flip:'+source.uid+':'+cause,kind:'flip-face-up',sourceUid:source.uid,sourceId:source.id,controllerTeam,turn:duel.core.turn,cause,wasFaceDown:true,faceUp:true,...overrides};
}
function planFor(duel,source,controllerTeam,cause='flip-summon'){
 const plan=prepareFlipRandomTrigger(duel,eventFor(duel,source,controllerTeam,cause),IDS);
 assert.ok(plan);
 return plan;
}
function signature(duel){
 return tagInventory(duel).map(card=>card.uid+'|'+card.id).sort();
}

test('os dois adapters aceitam Flip Summon, batalha e efeito como causa de flip real',()=>{
 for(const id of [IDS.diceJar,IDS.fireSorcerer]){
  for(const cause of ['flip-summon','battle','card-effect']){
   const duel=makeDuel();
   const source=putMonster(duel,0,0,id);
   const plan=planFor(duel,source,0,cause);
   assert.equal(plan.cause,cause);
  }
 }
});

test('evento que não virou face-up ou usa turno/identidade incorretos é rejeitado',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.diceJar);
 assert.equal(prepareFlipRandomTrigger(duel,eventFor(duel,source,0,'flip-summon',{wasFaceDown:false}),IDS),null);
 assert.equal(prepareFlipRandomTrigger(duel,eventFor(duel,source,0,'flip-summon',{faceUp:false}),IDS),null);
 assert.equal(prepareFlipRandomTrigger(duel,eventFor(duel,source,0,'flip-summon',{turn:duel.core.turn+1}),IDS),null);
 assert.equal(prepareFlipRandomTrigger(duel,eventFor(duel,source,0,'flip-summon',{sourceId:'99999999'}),IDS),null);
});

test('Dice Jar rerrola empates e aplica 6000 quando o maior resultado é seis',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,2,0,IDS.diceJar);
 const plan=planFor(duel,source,0);
 assert.equal(plan.ownerSeat,2);
 assert.equal(plan.controllerSeat,0);
 const before=signature(duel);
 const result=resolveDiceJar(duel,plan,[[4,4],[6,2]],{cardIds:IDS});
 assert.ok(result);
 assert.equal(result.tiedRolls,1);
 assert.equal(result.controllerRoll,6);
 assert.equal(result.opponentRoll,2);
 assert.equal(result.loserTeam,1);
 assert.equal(result.damage,6000);
 assert.equal(result.state.core.players[1].lp,0);
 assert.equal(result.state.core.phase,'finished');
 assert.deepEqual(signature(result.state),before);
});

test('Dice Jar aplica 500 vezes o maior dado quando o vencedor não tirou seis',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.diceJar);
 const plan=planFor(duel,source,0);
 const result=resolveDiceJar(duel,plan,[[2,5]],{cardIds:IDS});
 assert.ok(result);
 assert.equal(result.loserTeam,0);
 assert.equal(result.damage,2500);
 assert.equal(result.state.core.players[0].lp,1500);
 assert.equal(result.state.core.players[1].lp,4000);
});

test('empates repetidos sem resultado e dados fora de 1–6 não alteram o duelo',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.diceJar);
 const plan=planFor(duel,source,0);
 const before=signature(duel);
 assert.equal(resolveDiceJar(duel,plan,[[2,2],[6,6]],{cardIds:IDS}),null);
 assert.equal(resolveDiceJar(duel,plan,[[0,7]],{cardIds:IDS}),null);
 assert.deepEqual(signature(duel),before);
 assert.equal(duel.core.players[0].lp,4000);
 assert.equal(duel.core.players[1].lp,4000);
});

test('negação de Dice Jar não exige dados nem altera LP',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.diceJar);
 const plan=planFor(duel,source,0);
 const result=resolveDiceJar(duel,plan,[],{cardIds:IDS,negated:true});
 assert.ok(result);
 assert.equal(result.negated,true);
 assert.equal(result.damage,0);
 assert.equal(result.state.core.players[0].lp,4000);
 assert.equal(result.state.core.players[1].lp,4000);
});

test('Fire Sorcerer bane duas cartas da mão privada do controlador ativo e causa 800 à equipe oposta',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,2,0,IDS.fireSorcerer);
 const plan=planFor(duel,source,0);
 assert.equal(plan.ownerSeat,2);
 assert.equal(plan.controllerSeat,0);
 const first=moveDeckToHand(duel,0);
 const second=moveDeckToHand(duel,0);
 const third=moveDeckToHand(duel,0);
 const partnerCard=moveDeckToHand(duel,2);
 const opponentCard=moveDeckToHand(duel,1);
 const before=signature(duel);
 const result=resolveFireSorcerer(duel,plan,[first,second],{cardIds:IDS});
 assert.ok(result);
 assert.deepEqual(result.banishedUids.sort(),[first,second].sort());
 assert.equal(result.damage,800);
 assert.equal(result.affectedTeam,1);
 assert.equal(result.state.core.players[1].lp,3200);
 assert.ok(result.state.core.players[0].banished.some(card=>card.uid===first));
 assert.ok(result.state.core.players[0].banished.some(card=>card.uid===second));
 assert.equal(privateZone(result.state,0,'hand').length,5);
 assert.equal(privateZone(result.state,2,'hand').length,5);
 assert.equal(privateZone(result.state,1,'hand').length,5);
 assert.ok(privateZone(result.state,0,'hand').some(card=>card.uid===third));
 assert.ok(privateZone(result.state,2,'hand').some(card=>card.uid===partnerCard));
 assert.ok(privateZone(result.state,1,'hand').some(card=>card.uid===opponentCard));
 assert.deepEqual(signature(result.state),before);
});

test('Fire Sorcerer não mistura a mão do parceiro inativo com a mão do controlador',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,2,0,IDS.fireSorcerer);
 const plan=planFor(duel,source,0);
 const own=moveDeckToHand(duel,0);
 const partner=moveDeckToHand(duel,2);
 const before=signature(duel);
 assert.equal(resolveFireSorcerer(duel,plan,[own,partner],{cardIds:IDS}),null);
 assert.deepEqual(signature(duel),before);
});

test('com menos de duas cartas na mão, Fire Sorcerer resolve sem banimento parcial nem dano',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.fireSorcerer);
 const plan=planFor(duel,source,0);
 const hand=privateZone(duel,0,'hand');
 const deck=privateZone(duel,0,'deck');
 while(hand.length>1)deck.push(hand.pop());
 const only=hand[0].uid;
 const before=signature(duel);
 const result=resolveFireSorcerer(duel,plan,[],{cardIds:IDS});
 assert.ok(result);
 assert.equal(result.insufficientHand,true);
 assert.equal(result.banishedUids.length,0);
 assert.equal(result.damage,0);
 assert.equal(result.state.core.players[1].lp,4000);
 assert.ok(privateZone(result.state,0,'hand').some(card=>card.uid===only));
 assert.deepEqual(signature(result.state),before);
});

test('negação de Fire Sorcerer preserva a mão, o banimento e LP',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.fireSorcerer);
 const plan=planFor(duel,source,0);
 const first=moveDeckToHand(duel,0);
 const second=moveDeckToHand(duel,0);
 const result=resolveFireSorcerer(duel,plan,[],{cardIds:IDS,negated:true});
 assert.ok(result);
 assert.equal(result.negated,true);
 assert.equal(result.damage,0);
 assert.equal(result.state.core.players[0].banished?.length??0,0);
 assert.ok(privateZone(result.state,0,'hand').some(card=>card.uid===first));
 assert.ok(privateZone(result.state,0,'hand').some(card=>card.uid===second));
 assert.equal(result.state.core.players[1].lp,4000);
});

test('trigger de Fire Sorcerer continua resolvendo se a fonte sair do campo após o flip',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,2,0,IDS.fireSorcerer);
 const plan=planFor(duel,source,0,'battle');
 moveSourceToOwnerGrave(duel,source);
 const first=moveDeckToHand(duel,0);
 const second=moveDeckToHand(duel,0);
 const result=resolveFireSorcerer(duel,plan,[first,second],{cardIds:IDS});
 assert.ok(result);
 assert.equal(result.damage,800);
 assert.equal(result.state.core.players[0].grave.some(card=>card.uid===source.uid),true);
 assert.equal(result.state.core.players[0].banished.length,2);
});

test('dano letal de Fire Sorcerer é limitado a zero e encerra o duelo',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.fireSorcerer);
 const plan=planFor(duel,source,0);
 const first=moveDeckToHand(duel,0);
 const second=moveDeckToHand(duel,0);
 duel.core.players[1].lp=500;
 const result=resolveFireSorcerer(duel,plan,[first,second],{cardIds:IDS});
 assert.ok(result);
 assert.equal(result.state.core.players[1].lp,0);
 assert.equal(result.state.core.phase,'finished');
 assert.equal(result.state.core.winner,'tag-team-0');
 assert.equal(result.state.core.reason,'pontos de vida');
});

test('mão acima de seis permanece intacta durante Main Phase; limite é End Phase',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.diceJar);
 const plan=planFor(duel,source,0);
 for(let i=0;i<7;i++)moveDeckToHand(duel,0);
 assert.equal(privateZone(duel,0,'hand').length,11);
 const result=resolveDiceJar(duel,plan,[[3,4]],{cardIds:IDS});
 assert.ok(result);
 assert.equal(privateZone(result.state,0,'hand').length,11);
});

test('Campo separado, 3+3 zonas e Extra Deck 5 continuam protegidos',()=>{
 const duel=makeDuel();
 for(let i=0;i<3;i++){
  const ref=privateZone(duel,0,'deck').pop();
  assert.ok(ref);
  ref.id=i%2?TRAP_ID:SPELL_ID;
  duel.core.players[0].backrow.push({...ref,setTurn:duel.core.turn,faceUp:i===1});
 }
 const field=privateZone(duel,0,'deck').pop();
 assert.ok(field);
 field.id=FIELD_ID;
 duel.core.players[0].field={...field,setTurn:duel.core.turn,faceUp:true};
 assert.doesNotThrow(()=>assertFlipRandomPhysicalRules(duel));
 assert.doesNotThrow(()=>assertPhysicalExtraDeckCounts([5,5,5,5],5));
 assert.throws(()=>assertPhysicalExtraDeckCounts([6,5,5,5],5),/Deck Adicional físico excede cinco/);
 assert.throws(()=>assertPhysicalExtraDeckCounts([5,-1,5,5],5),/Contagem do Deck Adicional inválida/);
});

test('Deck físico abaixo de 20 é rejeitado sem alterar a regra de mão',()=>{
 const duel=makeDuel();
 privateZone(duel,0,'deck').pop();
 assert.throws(()=>assertFlipRandomPhysicalRules(duel),/Deck principal físico/);
});
