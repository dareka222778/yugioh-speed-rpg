const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createTagDuel,tagInventory,tagNormalCardIds,assertTagDuel}=require('../dist/tagDuel');
const {enabledCardIds,engineCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {sendMonsterToGrave}=require('../dist/monsterExit');
const {createDrawPhaseSkipAdapter,assertDrawPhaseSkipRules,nextDrawTurnForSeat,nextOpponentDrawSeat,
 OFFERINGS_TO_THE_DOOMED_ID,TIME_SEAL_ID}=require('../dist/drawPhaseSkipTagAdapter');

function unique(kind,predicate,count=100){
 const seen=new Set();
 return enabledCardIds.filter(id=>{
  const card=engineCard(id);
  if(!card||card.kind!==kind||card.fusion||!predicate(card))return false;
  const name=card.englishName||card.name;
  if(seen.has(name))return false;seen.add(name);return true;
 }).slice(0,count);
}
const monsters=tagNormalCardIds.slice(0,8).map(engineCard).filter(Boolean);
const otherSpells=unique('spell',card=>card.id!=='66788016',4);
const otherTraps=unique('trap',card=>card.id!=='04206964',2);
assert.equal(monsters.length,8);assert.equal(otherSpells.length,4);assert.equal(otherTraps.length,2);
const OFFER_FIXTURE='66788016',TIME_FIXTURE='04206964';
const deck=[...monsters.map(card=>card.id),OFFER_FIXTURE,OFFER_FIXTURE,OFFER_FIXTURE,
 ...otherSpells.map(card=>card.id),TIME_FIXTURE,TIME_FIXTURE,TIME_FIXTURE,...otherTraps.map(card=>card.id)];
assert.equal(deck.length,20);
const fixtureEffects=new Map([[OFFER_FIXTURE,'offerings'],[TIME_FIXTURE,'time-seal']]);
function lookup(id){const effect=fixtureEffects.get(id);return effect?{kind:effect==='offerings'?'spell':'trap',effect}:undefined;}
const adapter=createDrawPhaseSkipAdapter(lookup);
let scenarioCount=0,completed=0,inventoryChecks=0;
function scenario(name,fn){scenarioCount++;test(name,()=>{fn();completed++;});}
function players(){return [0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...deck]}));}
function setup(first=0,seed='m660-draw-skip'){
 const duel=createTagDuel(players(),{classic:true,first,seed});
 duel.core.turn=first+1;
 const session=adapter.createSession(duel);
 return {session,adapter};
}
function holder(session,seat){
 const team=seat%2;
 return seat===session.duel.active[team]?session.duel.core.players[team]:session.duel.reserves[seat];
}
function take(session,seat,id){
 const source=holder(session,seat);
 for(const zone of ['hand','deck','extra']){
  const list=source[zone]||[],index=list.findIndex(card=>card.id===id);
  if(index>=0)return list.splice(index,1)[0];
 }
 throw new Error('Fixture card not found: '+id+' seat '+seat);
}
function ensureInHand(session,seat,id,count=1){
 const source=holder(session,seat);
 while(source.hand.filter(card=>card.id===id).length<count){
  const index=source.deck.findIndex(card=>card.id===id);
  if(index<0)break;
  source.hand.push(source.deck.splice(index,1)[0]);
 }
 synchronizeCardLifetimes(session.duel.core);
 assert.ok(source.hand.filter(card=>card.id===id).length>=count,'fixture spell/trap in physical hand');
}
function sourceToGrave(session,seat,id){
 const team=seat%2,card=take(session,seat,id);
 session.duel.core.players[team].grave.push(card);
 synchronizeCardLifetimes(session.duel.core);assertTagDuel(session.duel);
 return card;
}
function deploy(session,seat,id){
 const team=seat%2,ref=take(session,seat,id),turn=session.duel.core.turn;
 const monster={...ref,owner:team,position:'atk',faceUp:true,entered:turn-1,changed:turn-1,attacked:0,atkBoost:0,defBoost:0};
 session.duel.core.players[team].monsters.push(monster);
 synchronizeCardLifetimes(session.duel.core);assertTagDuel(session.duel);
 return monster;
}
function prepareOfferings(session,sourceSeat,targetUid,zone='hand',activationId='offer-1',setTurn){
 const team=sourceSeat%2;
 if(zone==='hand')ensureInHand(session,sourceSeat,OFFER_FIXTURE,1);
 const source=sourceToGrave(session,sourceSeat,OFFER_FIXTURE);
 const receipt={activationId,sourceUid:source.uid,controllerTeam:team,actorSeat:session.duel.active[team],
  turn:session.duel.core.turn,activationZone:zone,targetUid,setTurn};
 const plan=adapter.prepare(session,receipt);
 return {source,receipt,plan};
}
function prepareTimeSeal(session,sourceSeat,activationId='seal-1',setTurn=session.duel.core.turn-1){
 const team=sourceSeat%2,source=sourceToGrave(session,sourceSeat,TIME_FIXTURE);
 const receipt={activationId,sourceUid:source.uid,controllerTeam:team,actorSeat:session.duel.active[team],
  turn:session.duel.core.turn,activationZone:'set',setTurn};
 const plan=adapter.prepare(session,receipt);
 return {source,receipt,plan};
}
function inventory(session){
 return new Map(tagInventory(session.duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]));
}
function hands(session){
 const all=[];
 for(const player of session.duel.core.players)for(const card of player.hand)all.push(card.uid);
 for(const held of Object.values(session.duel.reserves))for(const card of held.hand)all.push(card.uid);
 return all.sort();
}
function assertConserved(before,beforeHands,session){
 assert.deepEqual([...inventory(session).entries()].sort(),[...before.entries()].sort());
 assert.deepEqual(hands(session),beforeHands);inventoryChecks++;
}
function safeResolve(session,activationId,negated=false){
 const before=inventory(session),beforeHands=hands(session);
 const result=adapter.resolve(session,activationId,negated);
 assertConserved(before,beforeHands,session);return result;
}
function atDrawBoundary(session,seat,turn){
 const duel=createTagDuel(players(),{classic:true,first:seat,seed:'m660-draw-boundary'});
 duel.core.turn=turn;session.duel=duel;assertTagDuel(duel);
}
function catalogSnapshot(){
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','catalog/engine-v9/manifest.json'),'utf8'));
 const revision=manifest.revisions.find(item=>item.id===manifest.current);
 const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'..','catalog/engine-v9',revision.file),'utf8'));
 return {count:catalog.cards.length,ids:new Set(catalog.cards.map(card=>card.id)),revision:manifest.current};
}

scenario('baseline preserva deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5',()=>{
 const {session}=setup();assertDrawPhaseSkipRules(session.duel);assertTagDuel(session.duel);
 const rules=require('../dist/rulesProfile').rulesFor(session.duel.core);
 assert.equal(rules.mainDeckMin,20);assert.equal(rules.mainDeckMax,30);assert.equal(rules.handLimit,6);
 assert.equal(rules.handCheck,'end');assert.equal(rules.monsterZones,3);assert.equal(rules.spellTrapZones,3);assert.equal(rules.extraDeckMax,5);
});
scenario('Offerings destrói monstro face-up e agenda o próximo Draw Phase do ativador físico',()=>{
 const {session}=setup(0),target=deploy(session,1,monsters[0].id);
 const {plan}=prepareOfferings(session,0,target.uid);
 assert.equal(plan.skipSeat,0);assert.equal(plan.dueTurn,session.duel.core.turn+4);
 const before=inventory(session),beforeHands=hands(session),result=safeResolve(session,plan.activationId);
 assert.equal(result.status,'destroyed');assert.equal(result.destroyedUid,target.uid);
 assert.ok(session.duel.core.players[1].grave.some(card=>card.uid===target.uid));
 assert.deepEqual(session.skipDrawBySeat['0'],[plan.dueTurn]);assertConserved(before,beforeHands,session);
});
scenario('Offerings setado no turno anterior pode ser ativado no turno do adversário',()=>{
 const {session}=setup(1),target=deploy(session,1,monsters[1].id);
 const {plan}=prepareOfferings(session,2,target.uid,'set','offer-set',session.duel.core.turn-1);
 assert.equal(plan.actorSeat,2);assert.equal(plan.skipSeat,2);assert.equal(plan.dueTurn,session.duel.core.turn+1);
 const result=safeResolve(session,plan.activationId);assert.equal(result.status,'destroyed');
});
scenario('Offerings continua aplicando skip mesmo se o alvo sair do campo antes da resolução',()=>{
 const {session}=setup(0),target=deploy(session,1,monsters[0].id);
 const {plan}=prepareOfferings(session,0,target.uid);
 assert.equal(sendMonsterToGrave(session.duel.core,target.uid,false,'destroy'),true);assertTagDuel(session.duel);
 const result=safeResolve(session,plan.activationId);
 assert.equal(result.status,'target-lost');assert.deepEqual(session.skipDrawBySeat['0'],[plan.dueTurn]);
});
scenario('Offerings não destrói alvo que saiu e voltou com nova época de identidade',()=>{
 const {session}=setup(0),target=deploy(session,1,monsters[0].id);
 const {plan}=prepareOfferings(session,0,target.uid);
 sendMonsterToGrave(session.duel.core,target.uid,false,'destroy');
 const grave=session.duel.core.players[1].grave,index=grave.findIndex(card=>card.uid===target.uid);
 const [card]=grave.splice(index,1);session.duel.core.players[1].monsters.push(card);
 synchronizeCardLifetimes(session.duel.core);assertTagDuel(session.duel);
 const result=safeResolve(session,plan.activationId);
 assert.equal(result.status,'target-lost');assert.ok(session.duel.core.players[1].monsters.some(card=>card.uid===target.uid));
 assert.deepEqual(session.skipDrawBySeat['0'],[plan.dueTurn]);
});
scenario('Offerings aceita alvo face-up do próprio lado',()=>{
 const {session}=setup(0),target=deploy(session,0,monsters[0].id);
 const {plan}=prepareOfferings(session,0,target.uid);
 const result=safeResolve(session,plan.activationId);assert.equal(result.status,'destroyed');
 assert.ok(session.duel.core.players[0].grave.some(card=>card.uid===target.uid));
});
scenario('Offerings recusa alvo face-down',()=>{
 const {session}=setup(0),target=deploy(session,1,monsters[0].id);target.faceUp=false;
 synchronizeCardLifetimes(session.duel.core);
 assert.throws(()=>prepareOfferings(session,0,target.uid),/face-up/);
});
scenario('Offerings negado não destrói nem agenda skip',()=>{
 const {session}=setup(0),target=deploy(session,1,monsters[0].id);
 const {plan}=prepareOfferings(session,0,target.uid);
 const result=safeResolve(session,plan.activationId,true);
 assert.equal(result.status,'negated');assert.equal(session.duel.core.players[1].monsters.some(card=>card.uid===target.uid),true);
 assert.deepEqual(session.skipDrawBySeat['0'],[]);
});
scenario('Offerings da mão não pode usar carta física do parceiro',()=>{
 const {session}=setup(0),target=deploy(session,1,monsters[0].id);
 assert.throws(()=>prepareOfferings(session,2,target.uid,'hand','offer-private'),/mão/);
});
scenario('Offerings setado não pode ser ativado no mesmo turno',()=>{
 const {session}=setup(0),target=deploy(session,1,monsters[0].id);
 assert.throws(()=>prepareOfferings(session,0,target.uid,'set','offer-same-turn',session.duel.core.turn),/mesmo turno/);
});
scenario('Offerings rejeita recibo de turno obsoleto',()=>{
 const {session}=setup(1),target=deploy(session,0,monsters[0].id);
 const {receipt}=prepareOfferings(session,1,target.uid);
 assert.throws(()=>adapter.prepare(session,{...receipt,activationId:'old',turn:receipt.turn-1}),/obsoleta/);
});
scenario('Time Seal no turno do controlador pula o próximo Draw Phase do adversário',()=>{
 const {session}=setup(2),{plan}=prepareTimeSeal(session,2,'seal-own');
 assert.equal(plan.skipSeat,3);assert.equal(plan.dueTurn,session.duel.core.turn+1);
 const result=safeResolve(session,plan.activationId);assert.equal(result.status,'scheduled');
 assert.deepEqual(session.skipDrawBySeat['3'],[plan.dueTurn]);
});
scenario('Time Seal no turno adversário pula o próximo Draw Phase da equipe adversária após a rotação',()=>{
 const {session}=setup(1),{plan}=prepareTimeSeal(session,2,'seal-opponent');
 assert.equal(plan.skipSeat,3);assert.equal(plan.dueTurn,session.duel.core.turn+2);
 safeResolve(session,plan.activationId);
 assert.deepEqual(session.skipDrawBySeat['3'],[plan.dueTurn]);
});
scenario('Time Seal de uma equipe no turno da outra calcula o próximo assento físico correto',()=>{
 const {session}=setup(2),{plan}=prepareTimeSeal(session,3,'seal-team1');
 assert.equal(plan.controllerTeam,1);assert.equal(plan.actorSeat,3);
 assert.equal(plan.skipSeat,0);assert.equal(plan.dueTurn,session.duel.core.turn+2);
 safeResolve(session,plan.activationId);
});
scenario('Time Seal no turno próprio aponta para o próximo assento da equipe adversária',()=>{
 const {session}=setup(3),{plan}=prepareTimeSeal(session,3,'seal-own-team1');
 assert.equal(plan.skipSeat,0);assert.equal(plan.dueTurn,session.duel.core.turn+1);
 safeResolve(session,plan.activationId);
});
scenario('Time Seal não pode ser ativado da mão',()=>{
 const {session}=setup(0),source=sourceToGrave(session,0,TIME_FIXTURE);
 assert.throws(()=>adapter.prepare(session,{activationId:'seal-hand',sourceUid:source.uid,controllerTeam:0,
  actorSeat:0,turn:session.duel.core.turn,activationZone:'hand'}),/Trap setada/);
});
scenario('Time Seal não pode ser ativado no turno em que foi setado',()=>{
 const {session}=setup(0);
 assert.throws(()=>prepareTimeSeal(session,0,'seal-same-turn',session.duel.core.turn),/mesmo turno/);
});
scenario('Time Seal negado não agenda Draw Phase',()=>{
 const {session}=setup(0),{plan}=prepareTimeSeal(session,0,'seal-negated');
 const result=safeResolve(session,plan.activationId,true);
 assert.equal(result.status,'negated');assert.deepEqual(session.skipDrawBySeat['1'],[]);
});
scenario('Time Seal rejeita assento ativador que não é o ativo da equipe',()=>{
 const {session}=setup(0),source=sourceToGrave(session,0,TIME_FIXTURE);
 assert.throws(()=>adapter.prepare(session,{activationId:'seal-wrong-seat',sourceUid:source.uid,controllerTeam:0,
  actorSeat:2,turn:session.duel.core.turn,activationZone:'set',setTurn:session.duel.core.turn-1}),/membro ativo/);
});
scenario('recusa fonte que não está no Cemitério da equipe proprietária',()=>{
 const {session}=setup(0),source=take(session,0,OFFER_FIXTURE);
 assert.throws(()=>adapter.prepare(session,{activationId:'source-not-grave',sourceUid:source.uid,controllerTeam:0,
  actorSeat:0,turn:session.duel.core.turn,activationZone:'hand',targetUid:'m1:missing'}),/Cemitério/);
});
scenario('recusa equipe controladora incompatível com proprietário físico',()=>{
 const {session}=setup(0),source=sourceToGrave(session,2,OFFER_FIXTURE);
 assert.throws(()=>adapter.prepare(session,{activationId:'wrong-team',sourceUid:source.uid,controllerTeam:1,
  actorSeat:1,turn:session.duel.core.turn,activationZone:'set',setTurn:session.duel.core.turn-1,targetUid:'m1:missing'}),/equipe proprietária/);
});
scenario('ID de ativação não pode ser reutilizado',()=>{
 const {session}=setup(0),target=deploy(session,1,monsters[0].id);
 const {receipt}=prepareOfferings(session,0,target.uid,'hand','same-activation');
 assert.throws(()=>adapter.prepare(session,{...receipt,targetUid:target.uid}),/reutilizado/);
});
scenario('a fonte pode sair do Cemitério após ativação sem cancelar o skip',()=>{
 const {session}=setup(0),{source,plan}=prepareTimeSeal(session,0,'seal-source-leaves');
 const grave=session.duel.core.players[0].grave,index=grave.findIndex(card=>card.uid===source.uid);
 const [card]=grave.splice(index,1);session.duel.core.players[0].banished.push(card);
 synchronizeCardLifetimes(session.duel.core);assertTagDuel(session.duel);
 const result=safeResolve(session,plan.activationId);
 assert.equal(result.status,'scheduled');assert.deepEqual(session.skipDrawBySeat['1'],[plan.dueTurn]);
});
scenario('duas cópias de Time Seal para o mesmo próximo Draw Phase não acumulam skips',()=>{
 const {session}=setup(0);
 const first=prepareTimeSeal(session,0,'seal-one'),second=prepareTimeSeal(session,0,'seal-two');
 safeResolve(session,first.plan.activationId);safeResolve(session,second.plan.activationId);
 assert.deepEqual(session.skipDrawBySeat['1'],[first.plan.dueTurn]);
});
scenario('skip é consumido uma única vez no Draw Phase físico correto',()=>{
 const {session}=setup(0),{plan}=prepareTimeSeal(session,0,'seal-consume');
 safeResolve(session,plan.activationId);
 atDrawBoundary(session,plan.skipSeat,plan.dueTurn);
 assert.equal(adapter.consumeDrawSkip(session,plan.skipSeat,plan.dueTurn),true);
 assert.equal(adapter.consumeDrawSkip(session,plan.skipSeat,plan.dueTurn),false);
 assert.deepEqual(adapter.scheduledDrawSkips(session)[String(plan.skipSeat)],[]);
});
scenario('assento parceiro não consome skip destinado ao jogador físico ativador',()=>{
 const {session}=setup(0),target=deploy(session,1,monsters[0].id);
 const {plan}=prepareOfferings(session,0,target.uid);
 safeResolve(session,plan.activationId);
 const partner=(plan.skipSeat+2)%4;
 atDrawBoundary(session,partner,plan.dueTurn-2);
 assert.equal(adapter.consumeDrawSkip(session,partner,plan.dueTurn-2),false);
 atDrawBoundary(session,plan.skipSeat,plan.dueTurn);
 assert.equal(adapter.consumeDrawSkip(session,plan.skipSeat,plan.dueTurn),true);
});
scenario('consumo antecipado não remove skip agendado para turno futuro',()=>{
 const {session}=setup(0),{plan}=prepareTimeSeal(session,0,'seal-early');
 safeResolve(session,plan.activationId);
 atDrawBoundary(session,plan.skipSeat,plan.dueTurn-1);
 assert.equal(adapter.consumeDrawSkip(session,plan.skipSeat,plan.dueTurn-1),false);
 assert.deepEqual(adapter.scheduledDrawSkips(session)[String(plan.skipSeat)],[plan.dueTurn]);
});
scenario('Offerings do membro ativo usa o próximo Draw Phase desse assento, quatro turnos depois',()=>{
 const {session}=setup(0),target=deploy(session,1,monsters[0].id);
 const {plan}=prepareOfferings(session,0,target.uid);
 assert.equal(nextDrawTurnForSeat(session.duel,0),plan.dueTurn);
 assert.equal(plan.dueTurn,session.duel.core.turn+4);
});
scenario('Time Seal calcula o próximo Draw Phase da equipe adversária sem confundir parceiro',()=>{
 const {session}=setup(1),{plan}=prepareTimeSeal(session,2,'seal-rotation');
 assert.equal(nextOpponentDrawSeat(session.duel,0),3);
 assert.equal(plan.skipSeat,3);assert.notEqual(plan.skipSeat,2);
});
scenario('skip de Draw Phase não altera a mão privada nem concede cartas',()=>{
 const {session}=setup(0),target=deploy(session,1,monsters[0].id);
 const {plan}=prepareOfferings(session,0,target.uid);
 const before=inventory(session),beforeHands=hands(session);
 safeResolve(session,plan.activationId);
 assertConserved(before,beforeHands,session);assert.equal(inventory(session).size,80);
});
scenario('as três Monster Zones, três Spell/Trap Zones, Field Zone e Extra 5 permanecem independentes',()=>{
 const {session}=setup(0);assertDrawPhaseSkipRules(session.duel);
 assert.equal(session.duel.core.players[0].monsters.length,0);
 assert.equal(session.duel.core.players[0].backrow.length,0);
 assert.equal(session.duel.core.players[0].field??null,null);
 assert.equal(session.duel.core.players[0].extra.length,0);
});
scenario('Offerings e Time Seal permanecem fora do catálogo até integração e certificação por comportamento',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','catalog/engine-v9/manifest.json'),'utf8'));
 const revision=manifest.revisions.find(item=>item.id===manifest.current);
 const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'..','catalog/engine-v9',revision.file),'utf8'));
 const ids=new Set(catalog.cards.map(card=>card.id));
 assert.equal(catalog.cards.length,969);assert.equal(ids.has(OFFERINGS_TO_THE_DOOMED_ID),false);
 assert.equal(ids.has(TIME_SEAL_ID),false);
});
after(()=>{
 const snapshot=catalogSnapshot();
 const evidence={mission:'M660',passed:completed===scenarioCount,scenarioCount,completed,inventoryChecks,
  certifiedCardsBefore:969,certifiedCardsAfter:snapshot.count,newCertifications:0,inventoryGrants:0,
  centralResolverIntegrated:false,drawPhaseHookIntegrated:false,discordLiveValidated:false,productionChanged:false,
  catalogRevision:snapshot.revision,cardIds:[OFFERINGS_TO_THE_DOOMED_ID,TIME_SEAL_ID]};
 fs.mkdirSync('artifacts',{recursive:true});
 fs.writeFileSync(path.join('artifacts','m660-draw-phase-skip-results.json'),JSON.stringify(evidence,null,2)+'\n');
});
