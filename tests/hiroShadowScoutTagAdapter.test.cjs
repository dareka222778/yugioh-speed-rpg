const test=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagNormalCardIds,tagInventory}=require('../dist/tagDuel.js');
const {enabledCardIds,getDuelCard}=require('../dist/effectRegistry.js');
const {prepareHiroShadowScoutTrigger,resolveHiroShadowScout,assertHiroPhysicalRules}=require('../dist/hiroShadowScoutTagAdapter.js');

const CARD_ID=tagNormalCardIds[0];
const MONSTER_ID=tagNormalCardIds[1];
const SPELL_ID=enabledCardIds.find(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field);
const TRAP_ID=enabledCardIds.find(id=>getDuelCard(id)?.kind==='trap');
const FIELD_ID=enabledCardIds.find(id=>getDuelCard(id)?.kind==='spell'&&getDuelCard(id)?.field===true);
assert.ok(tagNormalCardIds.length>=20);
assert.ok(SPELL_ID);
assert.ok(TRAP_ID);
assert.ok(FIELD_ID);

function makeDuel(){
 const players=Array.from({length:4},(_,seat)=>({id:'m'+seat,name:'Duelista '+seat,cards:tagNormalCardIds.slice(0,20)}));
 return createTagDuel(players,{seed:'m587-hiro-shadow-scout',first:0,classic:true});
}
function privateZone(duel,seat,zone){
 const team=seat%2;
 if(duel.active[team]===seat)return duel.core.players[team][zone];
 return duel.reserves[String(seat)][zone];
}
function putSource(duel,ownerSeat,controllerTeam){
 const ref=privateZone(duel,ownerSeat,'deck').pop();
 assert.ok(ref);
 ref.id=CARD_ID;
 const source={...ref,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0};
 duel.core.players[controllerTeam].monsters.push(source);
 return source;
}
function moveSourceToOwnerGrave(duel,source){
 const controller=duel.core.players.findIndex(team=>team.monsters.some(monster=>monster.uid===source.uid));
 if(controller>=0)duel.core.players[controller].monsters=duel.core.players[controller].monsters.filter(monster=>monster.uid!==source.uid);
 const owner=Number(/^m([0-3]):/.exec(source.uid)[1])%2;
 duel.core.players[owner].grave.push({uid:source.uid,id:source.id});
}
function eventFor(duel,source,controllerTeam,cause='flip-summon',overrides={}){
 return {id:'hiro-flip:'+source.uid+':'+cause,kind:'flip-face-up',sourceUid:source.uid,sourceId:source.id,controllerTeam,turn:duel.core.turn,cause,wasFaceDown:true,faceUp:true,...overrides};
}
function makePlan(duel,source,controllerTeam,cause='flip-summon'){
 const plan=prepareHiroShadowScoutTrigger(duel,eventFor(duel,source,controllerTeam,cause),CARD_ID);
 assert.ok(plan);
 return plan;
}
function signature(duel){
 return tagInventory(duel).map(card=>card.uid+'|'+card.id).sort();
}
function setTop(deck,ids){
 assert.ok(deck.length>=ids.length);
 for(let i=0;i<ids.length;i++)deck[i].id=ids[i];
}

test('FLIP aceita Flip Summon, batalha e efeito de carta',()=>{
 for(const cause of ['flip-summon','battle','card-effect']){
  const duel=makeDuel();
  const source=putSource(duel,0,0);
  const plan=makePlan(duel,source,0,cause);
  assert.equal(plan.cause,cause);
 }
});

test('evento sem transição real face-down para face-up é rejeitado',()=>{
 const duel=makeDuel();
 const source=putSource(duel,0,0);
 assert.equal(prepareHiroShadowScoutTrigger(duel,eventFor(duel,source,0,'flip-summon',{wasFaceDown:false}),CARD_ID),null);
 assert.equal(prepareHiroShadowScoutTrigger(duel,eventFor(duel,source,0,'flip-summon',{faceUp:false}),CARD_ID),null);
 assert.equal(prepareHiroShadowScoutTrigger(duel,eventFor(duel,source,0,'flip-summon',{turn:duel.core.turn+1}),CARD_ID),null);
});

test('evento não pode trocar a identidade física da fonte',()=>{
 const duel=makeDuel();
 const source=putSource(duel,0,0);
 assert.equal(prepareHiroShadowScoutTrigger(duel,eventFor(duel,source,0,'card-effect',{sourceId:'99999999'}),CARD_ID),null);
 assert.equal(prepareHiroShadowScoutTrigger(duel,eventFor(duel,source,1),CARD_ID),null);
});

test('compra três do topo do Deck ativo e descarta somente Spell Cards',()=>{
 const duel=makeDuel();
 const source=putSource(duel,0,0);
 const plan=makePlan(duel,source,0);
 const activeOpponent=duel.active[1];
 const inactiveOpponent=[1,3].find(seat=>seat!==activeOpponent);
 const deck=privateZone(duel,activeOpponent,'deck');
 setTop(deck,[SPELL_ID,TRAP_ID,MONSTER_ID]);
 const top=deck.slice(0,3).map(card=>({uid:card.uid,id:card.id}));
 const inactiveBefore=privateZone(duel,inactiveOpponent,'deck').map(card=>card.uid);
 const handBefore=privateZone(duel,activeOpponent,'hand').length;
 const result=resolveHiroShadowScout(duel,plan,{cardId:CARD_ID});
 assert.deepEqual(result.revealedCards.map(card=>card.uid),top.map(card=>card.uid));
 assert.deepEqual(result.revealedCards.map(card=>card.id),[SPELL_ID,TRAP_ID,MONSTER_ID]);
 assert.deepEqual(result.discardedSpellUids,[top[0].uid]);
 assert.deepEqual(result.keptUids,[top[1].uid,top[2].uid]);
 assert.equal(privateZone(result.state,activeOpponent,'hand').length,handBefore+2);
 assert.equal(privateZone(result.state,activeOpponent,'deck').length,deck.length-3);
 assert.deepEqual(privateZone(result.state,inactiveOpponent,'deck').map(card=>card.uid),inactiveBefore);
 assert.ok(result.state.core.players[1].grave.some(card=>card.uid===top[0].uid));
 assert.ok(privateZone(result.state,activeOpponent,'hand').some(card=>card.uid===top[1].uid));
 assert.ok(privateZone(result.state,activeOpponent,'hand').some(card=>card.uid===top[2].uid));
});

test('Spell Cards vão ao Cemitério compartilhado da equipe adversária',()=>{
 const duel=makeDuel();
 const source=putSource(duel,0,0);
 const plan=makePlan(duel,source,0);
 const activeOpponent=duel.active[1];
 const deck=privateZone(duel,activeOpponent,'deck');
 setTop(deck,[SPELL_ID,SPELL_ID,SPELL_ID]);
 const spellUids=deck.slice(0,3).map(card=>card.uid);
 const result=resolveHiroShadowScout(duel,plan,{cardId:CARD_ID});
 assert.deepEqual(result.discardedSpellUids,spellUids);
 assert.equal(result.state.core.players[1].grave.filter(card=>spellUids.includes(card.uid)).length,3);
 assert.equal(privateZone(result.state,activeOpponent,'hand').length,4);
});

test('Armadilhas e monstros revelados permanecem na mão privada',()=>{
 const duel=makeDuel();
 const source=putSource(duel,0,0);
 const plan=makePlan(duel,source,0);
 const activeOpponent=duel.active[1];
 setTop(privateZone(duel,activeOpponent,'deck'),[TRAP_ID,MONSTER_ID,TRAP_ID]);
 const result=resolveHiroShadowScout(duel,plan,{cardId:CARD_ID});
 assert.equal(result.discardedSpellUids.length,0);
 assert.equal(result.keptUids.length,3);
 assert.equal(privateZone(result.state,activeOpponent,'hand').length,7);
});

test('mão acima de seis não é descartada antes da End Phase',()=>{
 const duel=makeDuel();
 const source=putSource(duel,0,0);
 const plan=makePlan(duel,source,0);
 const activeOpponent=duel.active[1];
 for(let i=0;i<2;i++){
  const ref=privateZone(duel,activeOpponent,'deck').shift();
  privateZone(duel,activeOpponent,'hand').push(ref);
 }
 setTop(privateZone(duel,activeOpponent,'deck'),[TRAP_ID,MONSTER_ID,TRAP_ID]);
 const result=resolveHiroShadowScout(duel,plan,{cardId:CARD_ID});
 assert.equal(privateZone(result.state,activeOpponent,'hand').length,9);
 assert.equal(result.state.core.phase,'main');
});

test('Magia de Campo comprada também é descartada como Spell Card',()=>{
 const duel=makeDuel();
 const source=putSource(duel,0,0);
 const plan=makePlan(duel,source,0);
 const activeOpponent=duel.active[1];
 const deck=privateZone(duel,activeOpponent,'deck');
 setTop(deck,[FIELD_ID,TRAP_ID,MONSTER_ID]);
 const fieldUid=deck[0].uid;
 const result=resolveHiroShadowScout(duel,plan,{cardId:CARD_ID});
 assert.ok(result.discardedSpellUids.includes(fieldUid));
 assert.ok(result.state.core.players[1].grave.some(card=>card.uid===fieldUid));
});

test('Deck com menos de três cartas causa deck-out sem compra parcial',()=>{
 const duel=makeDuel();
 const source=putSource(duel,0,0);
 const plan=makePlan(duel,source,0);
 const activeOpponent=duel.active[1];
 const deck=privateZone(duel,activeOpponent,'deck');
 const hand=privateZone(duel,activeOpponent,'hand');
 hand.push(...deck.splice(0,deck.length-2));
 assert.equal(deck.length,2);
 const result=resolveHiroShadowScout(duel,plan,{cardId:CARD_ID});
 assert.equal(result.deckOut,true);
 assert.equal(result.revealedCards.length,0);
 assert.equal(privateZone(result.state,activeOpponent,'deck').length,2);
 assert.equal(result.state.core.phase,'finished');
 assert.equal(result.state.core.winner,'tag-team-0');
 assert.equal(result.state.core.reason,'não conseguiu comprar 3 cartas');
});

test('negação evita compra e não causa deck-out mesmo com Deck insuficiente',()=>{
 const duel=makeDuel();
 const source=putSource(duel,0,0);
 const plan=makePlan(duel,source,0);
 const activeOpponent=duel.active[1];
 const deck=privateZone(duel,activeOpponent,'deck');
 privateZone(duel,activeOpponent,'hand').push(...deck.splice(0,deck.length-2));
 const result=resolveHiroShadowScout(duel,plan,{cardId:CARD_ID,negated:true});
 assert.equal(result.negated,true);
 assert.equal(result.deckOut,false);
 assert.equal(result.revealedCards.length,0);
 assert.equal(result.state.core.phase,'main');
 assert.equal(privateZone(result.state,activeOpponent,'deck').length,2);
});

test('Flip Effect já no Cemitério ainda pode criar o gatilho',()=>{
 const duel=makeDuel();
 const source=putSource(duel,1,0);
 const event=eventFor(duel,source,0,'battle');
 moveSourceToOwnerGrave(duel,source);
 const plan=prepareHiroShadowScoutTrigger(duel,event,CARD_ID);
 assert.ok(plan);
 assert.equal(plan.ownerTeam,1);
 assert.equal(plan.controllerTeam,0);
});

test('fonte que sai do campo depois da ativação não muda o oponente afetado',()=>{
 const duel=makeDuel();
 const source=putSource(duel,1,0);
 const plan=makePlan(duel,source,0,'card-effect');
 moveSourceToOwnerGrave(duel,source);
 const activeOpponent=duel.active[1];
 setTop(privateZone(duel,activeOpponent,'deck'),[TRAP_ID,MONSTER_ID,TRAP_ID]);
 const result=resolveHiroShadowScout(duel,plan,{cardId:CARD_ID});
 assert.equal(result.affectedTeam,1);
 assert.equal(result.activeOpponentSeat,activeOpponent);
 assert.equal(result.keptUids.length,3);
});

test('plano de outro turno é rejeitado',()=>{
 const duel=makeDuel();
 const source=putSource(duel,0,0);
 const plan=makePlan(duel,source,0);
 assert.equal(resolveHiroShadowScout(duel,{...plan,turn:plan.turn-1},{cardId:CARD_ID}),null);
});

test('UIDs e inventário são conservados após compra e descarte',()=>{
 const duel=makeDuel();
 const source=putSource(duel,0,0);
 const plan=makePlan(duel,source,0);
 setTop(privateZone(duel,duel.active[1],'deck'),[SPELL_ID,TRAP_ID,MONSTER_ID]);
 const before=signature(duel);
 const result=resolveHiroShadowScout(duel,plan,{cardId:CARD_ID});
 assert.deepEqual(signature(result.state),before);
 assert.equal(tagInventory(result.state).length,tagInventory(duel).length);
});

test('validação rejeita deck principal físico abaixo de vinte',()=>{
 const duel=makeDuel();
 privateZone(duel,0,'deck').pop();
 assert.throws(()=>assertHiroPhysicalRules(duel),/Deck principal físico/);
});

test('limite de três Zonas de Magias/Armadilhas é mantido',()=>{
 const duel=makeDuel();
 for(let i=0;i<3;i++){
  const ref=privateZone(duel,0,'deck').pop();
  ref.id=i===1?TRAP_ID:SPELL_ID;
  duel.core.players[0].backrow.push({...ref,setTurn:duel.core.turn,faceUp:true});
 }
 assertHiroPhysicalRules(duel);
 const extra=privateZone(duel,0,'deck').pop();
 extra.id=TRAP_ID;
 duel.core.players[0].backrow.push({...extra,setTurn:duel.core.turn,faceUp:false});
 assert.throws(()=>assertHiroPhysicalRules(duel));
});
