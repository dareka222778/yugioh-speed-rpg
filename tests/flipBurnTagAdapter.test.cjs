const test=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagNormalCardIds,tagInventory}=require('../dist/tagDuel.js');
const {enabledCardIds,getDuelCard}=require('../dist/effectRegistry.js');
const {prepareFlipBurnTrigger,resolveFlipBurn,assertFlipBurnPhysicalRules}=require('../dist/flipBurnTagAdapter.js');

const IDS={desKoala:tagNormalCardIds[0],princessOfTsurugi:tagNormalCardIds[1]};
const SPELL_ID=enabledCardIds.find(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field);
const TRAP_ID=enabledCardIds.find(id=>getDuelCard(id)?.kind==='trap');
const FIELD_ID=enabledCardIds.find(id=>getDuelCard(id)?.kind==='spell'&&getDuelCard(id)?.field===true);
assert.ok(tagNormalCardIds.length>=20,'fixture precisa de pelo menos 20 monstros normais');
assert.ok(SPELL_ID,'fixture precisa de uma Magia habilitada');
assert.ok(TRAP_ID,'fixture precisa de uma Armadilha habilitada');
assert.ok(FIELD_ID,'fixture precisa de uma Magia de Campo habilitada');

function makeDuel(){
 const players=Array.from({length:4},(_,seat)=>({id:'m'+seat,name:'Duelista '+seat,cards:tagNormalCardIds.slice(0,20)}));
 return createTagDuel(players,{seed:'m586-flip-burn',first:0,classic:true});
}
function privateZone(duel,seat,zone){
 const team=seat%2;
 if(duel.active[team]===seat)return duel.core.players[team][zone];
 return duel.reserves[String(seat)][zone];
}
function putMonster(duel,ownerSeat,controllerTeam,id){
 const ref=privateZone(duel,ownerSeat,'deck').pop();
 assert.ok(ref);
 ref.id=id;
 const monster={...ref,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0};
 duel.core.players[controllerTeam].monsters.push(monster);
 return monster;
}
function putGrave(duel,ownerSeat,id){
 const ref=privateZone(duel,ownerSeat,'deck').pop();
 assert.ok(ref);
 ref.id=id;
 duel.core.players[ownerSeat%2].grave.push(ref);
 return ref;
}
function putBackrow(duel,ownerSeat,team,id,faceUp){
 const ref=privateZone(duel,ownerSeat,'deck').pop();
 assert.ok(ref);
 ref.id=id;
 duel.core.players[team].backrow.push({...ref,setTurn:duel.core.turn,faceUp});
 return ref;
}
function putField(duel,ownerSeat,team){
 const ref=privateZone(duel,ownerSeat,'deck').pop();
 assert.ok(ref);
 ref.id=FIELD_ID;
 duel.core.players[team].field={...ref,setTurn:duel.core.turn,faceUp:true};
 return ref;
}
function moveDeckToHand(duel,seat){
 const ref=privateZone(duel,seat,'deck').pop();
 assert.ok(ref);
 privateZone(duel,seat,'hand').push(ref);
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
function makePlan(duel,source,controllerTeam,cause='flip-summon'){
 const plan=prepareFlipBurnTrigger(duel,eventFor(duel,source,controllerTeam,cause),IDS);
 assert.ok(plan);
 return plan;
}
function signature(duel){
 return tagInventory(duel).map(card=>card.uid+'|'+card.id).sort();
}

test('FLIP dispara por Flip Summon, batalha e efeito, não apenas por uma origem',()=>{
 for(const cause of ['flip-summon','battle','card-effect']){
  const duel=makeDuel();
  const source=putMonster(duel,0,0,IDS.desKoala);
  const plan=makePlan(duel,source,0,cause);
  assert.equal(plan.cause,cause);
 }
});

test('evento que não virou uma carta face-down é rejeitado',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.desKoala);
 assert.equal(prepareFlipBurnTrigger(duel,eventFor(duel,source,0,'flip-summon',{wasFaceDown:false}),IDS),null);
 assert.equal(prepareFlipBurnTrigger(duel,eventFor(duel,source,0,'flip-summon',{faceUp:false}),IDS),null);
 assert.equal(prepareFlipBurnTrigger(duel,eventFor(duel,source,0,'flip-summon',{turn:duel.core.turn+1}),IDS),null);
});

test('evento de efeito só é aceito quando a identidade física coincide',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.desKoala);
 const wrong=eventFor(duel,source,0,'card-effect',{sourceId:'99999999'});
 assert.equal(prepareFlipBurnTrigger(duel,wrong,IDS),null);
 assert.equal(prepareFlipBurnTrigger(duel,eventFor(duel,source,1),IDS),null);
});

test('Des Koala conta a mão do representante adversário ativo na resolução',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.desKoala);
 const plan=makePlan(duel,source,0);
 const activeOpponent=duel.active[1];
 const inactiveOpponent=[1,3].find(seat=>seat!==activeOpponent);
 for(let i=0;i<3;i++)moveDeckToHand(duel,activeOpponent);
 for(let i=0;i<4;i++)moveDeckToHand(duel,inactiveOpponent);
 assert.equal(privateZone(duel,activeOpponent,'hand').length,7);
 assert.equal(privateZone(duel,inactiveOpponent,'hand').length,8);
 const before=signature(duel);
 const result=resolveFlipBurn(duel,plan,{cardIds:IDS});
 assert.equal(result.damage,2800);
 assert.equal(result.countedCards,7);
 assert.equal(result.state.core.players[1].lp,1200);
 assert.equal(privateZone(result.state,activeOpponent,'hand').length,7);
 assert.equal(privateZone(result.state,inactiveOpponent,'hand').length,8);
 assert.deepEqual(signature(result.state),before);
});

test('mão acima de seis não é descartada antes da End Phase',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.desKoala);
 const plan=makePlan(duel,source,0);
 const activeOpponent=duel.active[1];
 for(let i=0;i<3;i++)moveDeckToHand(duel,activeOpponent);
 const result=resolveFlipBurn(duel,plan,{cardIds:IDS});
 assert.equal(result.state.core.phase,'main');
 assert.equal(privateZone(result.state,activeOpponent,'hand').length,7);
});

test('Princess of Tsurugi conta backrow face-up/face-down e Field Zone separada',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.princessOfTsurugi);
 const plan=makePlan(duel,source,0);
 putBackrow(duel,1,1,SPELL_ID,false);
 putBackrow(duel,1,1,TRAP_ID,true);
 putBackrow(duel,3,1,SPELL_ID,false);
 putField(duel,1,1);
 putBackrow(duel,0,0,TRAP_ID,true);
 putBackrow(duel,2,0,SPELL_ID,false);
 putBackrow(duel,0,0,TRAP_ID,false);
 putField(duel,0,0);
 const result=resolveFlipBurn(duel,plan,{cardIds:IDS});
 assert.equal(result.countedCards,4);
 assert.equal(result.damage,2000);
 assert.equal(result.state.core.players[1].lp,2000);
 assert.equal(result.state.core.players[0].lp,4000);
 assert.equal(result.state.core.players[1].backrow.length,3);
 assert.ok(result.state.core.players[1].field);
});

test('Princess ignora as Magias/Armadilhas da própria equipe',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.princessOfTsurugi);
 const plan=makePlan(duel,source,0);
 putBackrow(duel,1,1,SPELL_ID,true);
 putBackrow(duel,0,0,TRAP_ID,true);
 putBackrow(duel,2,0,SPELL_ID,false);
 const result=resolveFlipBurn(duel,plan,{cardIds:IDS});
 assert.equal(result.countedCards,1);
 assert.equal(result.damage,500);
 assert.equal(result.state.core.players[1].lp,3500);
});

test('negação impede dano e não altera LP',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.desKoala);
 const plan=makePlan(duel,source,0);
 const opponent=duel.active[1];
 moveDeckToHand(duel,opponent);
 const result=resolveFlipBurn(duel,plan,{cardIds:IDS,negated:true});
 assert.equal(result.negated,true);
 assert.equal(result.damage,0);
 assert.equal(result.countedCards,0);
 assert.equal(result.state.core.players[1].lp,4000);
});

test('um Flip Effect que já chegou ao Cemitério ainda pode resolver',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,1,0,IDS.desKoala);
 const event=eventFor(duel,source,0,'battle');
 moveSourceToOwnerGrave(duel,source);
 const plan=prepareFlipBurnTrigger(duel,event,IDS);
 assert.ok(plan);
 assert.equal(plan.ownerTeam,1);
 assert.equal(plan.controllerTeam,0);
 const result=resolveFlipBurn(duel,plan,{cardIds:IDS});
 assert.equal(result.damage,1600);
 assert.equal(result.state.core.players[1].lp,2400);
});

test('o efeito continua apontado ao oponente do controlador capturado após saída do campo',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,1,0,IDS.princessOfTsurugi);
 const plan=makePlan(duel,source,0,'card-effect');
 putBackrow(duel,1,1,SPELL_ID,true);
 moveSourceToOwnerGrave(duel,source);
 const result=resolveFlipBurn(duel,plan,{cardIds:IDS});
 assert.equal(result.affectedTeam,1);
 assert.equal(result.damage,500);
 assert.equal(result.state.core.players[1].lp,3500);
});

test('plano de outro turno é rejeitado sem dano',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.desKoala);
 const plan=makePlan(duel,source,0);
 const stale={...plan,turn:plan.turn-1};
 assert.equal(resolveFlipBurn(duel,stale,{cardIds:IDS}),null);
});

test('UID, dono físico e equipe controladora são validados separadamente',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,1,0,IDS.desKoala);
 const plan=makePlan(duel,source,0);
 assert.equal(plan.ownerSeat,1);
 assert.equal(plan.ownerTeam,1);
 assert.equal(plan.controllerTeam,0);
 const tampered={...plan,ownerSeat:3};
 assert.equal(resolveFlipBurn(duel,tampered,{cardIds:IDS}),null);
});

test('dano letal encerra o duelo e atribui vitória à equipe controladora',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.princessOfTsurugi);
 const plan=makePlan(duel,source,0);
 putBackrow(duel,1,1,SPELL_ID,true);
 duel.core.players[1].lp=500;
 const result=resolveFlipBurn(duel,plan,{cardIds:IDS});
 assert.equal(result.damage,500);
 assert.equal(result.state.core.phase,'finished');
 assert.equal(result.state.core.winner,'tag-team-0');
 assert.equal(result.state.core.reason,'pontos de vida');
});

test('conserva a assinatura completa do inventário e não concede cartas',()=>{
 const duel=makeDuel();
 const source=putMonster(duel,0,0,IDS.desKoala);
 const plan=makePlan(duel,source,0);
 const before=signature(duel);
 const result=resolveFlipBurn(duel,plan,{cardIds:IDS});
 assert.deepEqual(signature(result.state),before);
 assert.equal(tagInventory(result.state).length,tagInventory(duel).length);
});

test('a validação rejeita deck físico abaixo de 20 sem alterar a regra de mão',()=>{
 const duel=makeDuel();
 privateZone(duel,0,'deck').pop();
 assert.throws(()=>assertFlipBurnPhysicalRules(duel),/Deck principal físico/);
});

test('o limite de três Zonas de Magias/Armadilhas é preservado',()=>{
 const duel=makeDuel();
 for(let i=0;i<3;i++)putBackrow(duel,0,0,i%2?TRAP_ID:SPELL_ID,true);
 assertFlipBurnPhysicalRules(duel);
 putBackrow(duel,0,0,TRAP_ID,false);
 assert.throws(()=>assertFlipBurnPhysicalRules(duel));
});
