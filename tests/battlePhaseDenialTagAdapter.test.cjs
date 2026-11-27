'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagInventory,tagNormalCardIds}=require('../dist/tagDuel');
const {enabledCardIds,engineCard,getDuelCard}=require('../dist/effectRegistry');
const {
 THREATENING_ROAR_ID,SCRAP_IRON_SCARECROW_ID,
 createBattlePhaseDenialAdapter,assertBattlePhaseDenialRules
}=require('../dist/battlePhaseDenialTagAdapter');

function unique(kind,count){
 const seen=new Set();
 return enabledCardIds.filter(id=>{
  const card=engineCard(id);
  if(!card||card.kind!==kind||card.fusion)return false;
  const name=card.englishName||card.name;
  if(seen.has(name))return false;
  seen.add(name);return true;
 }).slice(0,count);
}
const monsterIds=unique('monster',8),spellIds=unique('spell',6),trapIds=unique('trap',6);
assert.equal(monsterIds.length,8);assert.equal(spellIds.length,6);assert.equal(trapIds.length,6);
const deck=[...monsterIds,...spellIds,...trapIds];
assert.equal(deck.length,20);
const fixtures={roar:trapIds[0],scarecrow:trapIds[1],other:trapIds[2]};
const effectById=new Map([[fixtures.roar,'threatening-roar'],[fixtures.scarecrow,'scrap-iron-scarecrow']]);
function lookup(id){const effect=effectById.get(id);return effect?{kind:'trap',effect}:undefined;}
const adapter=createBattlePhaseDenialAdapter(lookup);
let scenarios=0;
function scenario(name,fn){scenarios++;test(name,fn);}
function setup(first=0){
 const players=[0,1,2,3].map(i=>({id:'m675-seat-'+i,name:'M675 Seat '+i,cards:[...deck]}));
 const duel=createTagDuel(players,{seed:'m675-battle-phase-denial',first,classic:true});
 duel.core.turn=3;duel.core.current=first%2;duel.core.priority=first%2;
 const session=adapter.createSession(duel);
 return {session,adapter};
}
function holder(session,seat){
 const team=seat%2;
 return session.duel.active[team]===seat?session.duel.core.players[team]:session.duel.reserves[String(seat)];
}
function take(session,seat,id){
 for(const zone of ['hand','deck','extra']){
  const list=holder(session,seat)[zone]||[],index=list.findIndex(card=>card.id===id);
  if(index>=0)return list.splice(index,1)[0];
 }
 throw new Error('Fixture card not found: '+id);
}
function setTrap(session,team,effect,ownerSeat=team,setTurn=session.duel.core.turn-1){
 const id=effect==='threatening-roar'?fixtures.roar:fixtures.scarecrow;
 const card=take(session,ownerSeat,id);
 const placed={...card,faceUp:false,setTurn};
 session.duel.core.players[team].backrow.push(placed);
 return placed;
}
function deployAttacker(session,team=0,seat=0){
 const card=take(session,seat,monsterIds[0]);
 const monster={...card,position:'atk',faceUp:true,entered:session.duel.core.turn,changed:session.duel.core.turn,
  attacked:1,attackCount:1,atkBoost:0,defBoost:0,owner:team};
 session.duel.core.players[team].monsters.push(monster);
 return monster;
}
function openOpponentMain(session,attackerTeam=0){
 const duel=session.duel,defenderTeam=1-attackerTeam;
 duel.core.current=attackerTeam;duel.core.priority=defenderTeam;duel.core.phase='main';duel.core.resume='main';
 duel.core.pending={kind:'none'};duel.core.chain=[];duel.core.turnEnding=false;duel.core.damageStep=false;
 return {attackerTeam,defenderTeam,actorSeat:duel.active[defenderTeam]};
}
function beginAttack(session,attackerTeam=0){
 const attacker=deployAttacker(session,attackerTeam,session.duel.active[attackerTeam]);
 const window=openOpponentMain(session,attackerTeam),duel=session.duel;
 duel.core.phase='response';duel.core.resume='battle';duel.core.pending={kind:'attack',actor:attackerTeam,card:attacker.uid,stage:'declare'};
 return {...window,attacker};
}
function findTrap(duel,team,uid){return duel.core.players[team].backrow.find(card=>card.uid===uid);}
function removeTrapToGrave(session,team,uid){
 const list=session.duel.core.players[team].backrow,index=list.findIndex(card=>card.uid===uid);
 assert.ok(index>=0);
 const [card]=list.splice(index,1);
 session.duel.core.players[team].grave.push({uid:card.uid,id:card.id});
}
function inventory(session){
 return tagInventory(session.duel).filter(card=>card.entityKind!=='token').map(card=>card.uid+'|'+card.id).sort();
}
function hands(session){
 const ids=[];
 for(const player of session.duel.core.players)for(const card of player.hand)ids.push(card.uid);
 for(const held of Object.values(session.duel.reserves))for(const card of held.hand)ids.push(card.uid);
 return ids.sort();
}
function activate(session,trap,window,id){
 return adapter.activate(session,{activationId:id,sourceUid:trap.uid,actorSeat:window.actorSeat,turn:session.duel.core.turn});
}
function resolve(session,id,options={}){return adapter.resolve(session,{activationId:id,...options});}

scenario('baseline 2v2: quatro decks 20, mão inicial privada, zonas 3+3 e Extra 5',()=>{
 const {session}=setup();
 assertBattlePhaseDenialRules(session.duel);
 assert.equal(session.duel.mode,'tag-classic');
 assert.equal(session.duel.core.players.length,2);
 assert.equal(session.duel.core.players.every(player=>player.monsters.length<=3&&player.backrow.length<=3),true);
});

scenario('Threatening Roar cria bloqueio para a equipe adversária somente no turno atual',()=>{
 const {session}=setup(),window=openOpponentMain(session,0),trap=setTrap(session,window.defenderTeam,'threatening-roar',window.actorSeat);
 const before=inventory(session),beforeHands=hands(session);
 activate(session,trap,window,'roar-main');
 const result=resolve(session,'roar-main');
 assert.equal(result.status,'attack-lock-created');
 assert.equal(adapter.canDeclareAttack(session,0,session.duel.core.turn),false);
 assert.equal(adapter.canDeclareAttack(session,1,session.duel.core.turn),true);
 assert.deepEqual(inventory(session),before);
 assert.deepEqual(hands(session),beforeHands);
 assert.ok(session.duel.core.players[window.defenderTeam].grave.some(card=>card.uid===trap.uid));
});

scenario('Threatening Roar ativada em resposta não cancela o ataque já declarado',()=>{
 const {session}=setup(),window=beginAttack(session,0),trap=setTrap(session,window.defenderTeam,'threatening-roar',window.actorSeat);
 activate(session,trap,window,'roar-response');
 const result=resolve(session,'roar-response');
 assert.equal(result.status,'attack-lock-created');
 assert.equal(session.duel.core.pending.kind,'attack');
 assert.equal(session.duel.core.pending.cancelled,undefined);
 assert.equal(adapter.canDeclareAttack(session,0,session.duel.core.turn),false);
});

scenario('bloqueio de Threatening Roar expira quando o turno muda',()=>{
 const {session}=setup(),window=openOpponentMain(session,0),trap=setTrap(session,window.defenderTeam,'threatening-roar',window.actorSeat);
 activate(session,trap,window,'roar-expiry');resolve(session,'roar-expiry');
 const turn=session.duel.core.turn;
 assert.equal(adapter.canDeclareAttack(session,0,turn),false);
 session.duel.core.turn=turn+1;
 assert.equal(adapter.canDeclareAttack(session,0,turn+1),true);
});

scenario('Scrap-Iron Scarecrow cancela somente a declaração de ataque original e se prepara novamente',()=>{
 const {session}=setup(),window=beginAttack(session,0),trap=setTrap(session,window.defenderTeam,'scrap-iron-scarecrow',window.actorSeat);
 const before=inventory(session),beforeHands=hands(session);
 activate(session,trap,window,'scarecrow-1');
 const result=resolve(session,'scarecrow-1');
 assert.equal(result.status,'attack-cancelled');
 assert.equal(session.duel.core.pending.cancelled,true);
 assert.equal(session.duel.core.pending.endBattle,undefined);
 assert.equal(findTrap(session.duel,window.defenderTeam,trap.uid).faceUp,false);
 assert.equal(findTrap(session.duel,window.defenderTeam,trap.uid).setTurn,session.duel.core.turn);
 assert.deepEqual(inventory(session),before);
 assert.deepEqual(hands(session),beforeHands);
});

scenario('Scrap-Iron Scarecrow não pode ser reativada no mesmo turno após se rebaixar',()=>{
 const {session}=setup(),window=beginAttack(session,0),trap=setTrap(session,window.defenderTeam,'scrap-iron-scarecrow',window.actorSeat);
 activate(session,trap,window,'scarecrow-same-turn');resolve(session,'scarecrow-same-turn');
 assert.throws(()=>activate(session,trap,window,'scarecrow-reuse-same-turn'),/Baixada antes/);
});

scenario('Scrap-Iron Scarecrow pode voltar a responder no próximo turno adversário',()=>{
 const {session}=setup(),window=beginAttack(session,0),trap=setTrap(session,window.defenderTeam,'scrap-iron-scarecrow',window.actorSeat);
 activate(session,trap,window,'scarecrow-next-1');resolve(session,'scarecrow-next-1');
 const nextTurn=session.duel.core.turn+1;
 session.duel.core.turn=nextTurn;session.duel.core.current=0;session.duel.core.priority=1;
 session.duel.core.phase='response';session.duel.core.resume='battle';
 session.duel.core.pending={kind:'attack',actor:0,card:window.attacker.uid,stage:'declare'};
 // A new attack declaration needs a fresh attack counter, but the same UID cannot attack twice.
 window.attacker.attacked=2;window.attacker.attackCount=2;
 const nextWindow={...window,actorSeat:session.duel.active[1]};
 const replay=activate(session,trap,nextWindow,'scarecrow-next-2');
 assert.equal(replay.replayed,false);
 assert.equal(resolve(session,'scarecrow-next-2').status,'attack-cancelled');
});

scenario('Scrap-Iron Scarecrow exige declaração de ataque, não cálculo de dano',()=>{
 const {session}=setup(),window=beginAttack(session,0),trap=setTrap(session,window.defenderTeam,'scrap-iron-scarecrow',window.actorSeat);
 session.duel.core.pending.stage='damage';
 assert.throws(()=>activate(session,trap,window,'scarecrow-damage'),/declaração de ataque/);
});

scenario('Scrap-Iron Scarecrow não pode ativar na Main Phase sem ataque declarado',()=>{
 const {session}=setup(),window=openOpponentMain(session,0),trap=setTrap(session,window.defenderTeam,'scrap-iron-scarecrow',window.actorSeat);
 assert.throws(()=>activate(session,trap,window,'scarecrow-main'),/declaração de ataque/);
});

scenario('Armadilha Baixada no turno atual não pode ativar',()=>{
 const {session}=setup(),window=openOpponentMain(session,0),trap=setTrap(session,window.defenderTeam,'threatening-roar',window.actorSeat,session.duel.core.turn);
 assert.throws(()=>activate(session,trap,window,'newly-set'),/Baixada antes/);
});

scenario('parceiro inativo não pode ativar Armadilha da própria mão privada',()=>{
 const {session}=setup(),window=openOpponentMain(session,0),partner=(window.actorSeat+2)%4;
 const trapCard=take(session,partner,fixtures.roar);
 assert.throws(()=>activate(session,{uid:trapCard.uid},window,'partner-hand'),/Spell\/Trap Zone/);
});

scenario('somente o assento ativo da equipe defensora pode responder',()=>{
 const {session}=setup(),window=beginAttack(session,0),trap=setTrap(session,window.defenderTeam,'scrap-iron-scarecrow',window.actorSeat);
 assert.throws(()=>adapter.activate(session,{activationId:'wrong-seat',sourceUid:trap.uid,actorSeat:window.attackerTeam,turn:session.duel.core.turn}),/participante ativo/);
});

scenario('Threatening Roar não pode ser ativada pela equipe cujo turno está em andamento',()=>{
 const {session}=setup(1),window=openOpponentMain(session,1),trap=setTrap(session,1,'threatening-roar',session.duel.active[1]);
 assert.throws(()=>adapter.activate(session,{activationId:'own-turn',sourceUid:trap.uid,actorSeat:session.duel.active[1],turn:session.duel.core.turn}),/equipe defensora/);
});

scenario('ataque alterado antes da resolução de Scrap-Iron não recebe retarget',()=>{
 const {session}=setup(),window=beginAttack(session,0),trap=setTrap(session,window.defenderTeam,'scrap-iron-scarecrow',window.actorSeat);
 activate(session,trap,window,'scarecrow-stale');
 session.duel.core.pending.card='m0:different-attacker';
 const before=inventory(session);
 assert.throws(()=>resolve(session,'scarecrow-stale'),/nenhum alvo substituto/);
 assert.deepEqual(inventory(session),before);
});

scenario('negação da ativação de Threatening Roar envia a Armadilha ao Cemitério sem criar bloqueio',()=>{
 const {session}=setup(),window=openOpponentMain(session,0),trap=setTrap(session,window.defenderTeam,'threatening-roar',window.actorSeat);
 activate(session,trap,window,'roar-negated');
 assert.equal(resolve(session,'roar-negated',{activationNegated:true}).status,'activation-negated');
 assert.equal(adapter.canDeclareAttack(session,0,session.duel.core.turn),true);
 assert.ok(session.duel.core.players[window.defenderTeam].grave.some(card=>card.uid===trap.uid));
});

scenario('negação do efeito de Scrap-Iron não cancela ataque e envia a fonte ao Cemitério',()=>{
 const {session}=setup(),window=beginAttack(session,0),trap=setTrap(session,window.defenderTeam,'scrap-iron-scarecrow',window.actorSeat);
 activate(session,trap,window,'scarecrow-negated');
 assert.equal(resolve(session,'scarecrow-negated',{effectNegated:true}).status,'effect-negated');
 assert.equal(session.duel.core.pending.cancelled,undefined);
 assert.ok(session.duel.core.players[window.defenderTeam].grave.some(card=>card.uid===trap.uid));
});

scenario('resolução de Threatening Roar permanece válida se a fonte sair do campo após ativar',()=>{
 const {session}=setup(),window=openOpponentMain(session,0),trap=setTrap(session,window.defenderTeam,'threatening-roar',window.actorSeat);
 activate(session,trap,window,'roar-left-field');removeTrapToGrave(session,window.defenderTeam,trap.uid);
 assert.equal(resolve(session,'roar-left-field').status,'attack-lock-created');
 assert.equal(adapter.canDeclareAttack(session,0,session.duel.core.turn),false);
 assert.equal(session.duel.core.players[window.defenderTeam].grave.filter(card=>card.uid===trap.uid).length,1);
});

scenario('resolução de Scrap-Iron continua cancelando o ataque se a fonte sair do campo após ativar',()=>{
 const {session}=setup(),window=beginAttack(session,0),trap=setTrap(session,window.defenderTeam,'scrap-iron-scarecrow',window.actorSeat);
 activate(session,trap,window,'scarecrow-left-field');removeTrapToGrave(session,window.defenderTeam,trap.uid);
 assert.equal(resolve(session,'scarecrow-left-field').status,'attack-cancelled');
 assert.equal(session.duel.core.pending.cancelled,true);
 assert.equal(session.duel.core.players[window.defenderTeam].grave.filter(card=>card.uid===trap.uid).length,1);
});

scenario('ativação repetida com o mesmo identificador é idempotente',()=>{
 const {session}=setup(),window=openOpponentMain(session,0),trap=setTrap(session,window.defenderTeam,'threatening-roar',window.actorSeat);
 activate(session,trap,window,'roar-replay');
 assert.equal(activate(session,trap,window,'roar-replay').replayed,true);
 assert.equal(session.activations['roar-replay'].sourceUid,trap.uid);
});

scenario('resolução repetida é idempotente e replay divergente é rejeitado',()=>{
 const {session}=setup(),window=openOpponentMain(session,0),trap=setTrap(session,window.defenderTeam,'threatening-roar',window.actorSeat);
 activate(session,trap,window,'roar-resolution-replay');
 const first=resolve(session,'roar-resolution-replay'),second=resolve(session,'roar-resolution-replay');
 assert.equal(first.replayed,false);assert.equal(second.replayed,true);
 assert.throws(()=>resolve(session,'roar-resolution-replay',{effectNegated:true}),/resultado diferente/);
});

scenario('sessão JSON preserva bloqueio de ataque e recibos',()=>{
 const {session}=setup(),window=openOpponentMain(session,0),trap=setTrap(session,window.defenderTeam,'threatening-roar',window.actorSeat);
 activate(session,trap,window,'roar-json');resolve(session,'roar-json');
 const restored=JSON.parse(JSON.stringify(session));
 assert.equal(adapter.canDeclareAttack(restored,0,restored.duel.core.turn),false);
 assert.equal(restored.receipts['roar-json'].status,'attack-lock-created');
});

scenario('Field Zone permanece separada das três Spell/Trap Zones e mão 7 é permitida antes da End Phase',()=>{
 const {session}=setup(),duel=session.duel;
 const field=duel.core.players[0].field;
 assert.equal(field,null);
 assert.equal(duel.core.players[0].backrow.length,0);
 const hand=duel.core.players[0].hand,deckCards=duel.core.players[0].deck;
 while(hand.length<7)hand.push(deckCards.shift());
 assertBattlePhaseDenialRules(duel);
});

scenario('inventário e UIDs são conservados sem concessões automáticas',()=>{
 const {session}=setup(),window=beginAttack(session,0),trap=setTrap(session,window.defenderTeam,'scrap-iron-scarecrow',window.actorSeat);
 const before=inventory(session);activate(session,trap,window,'scarecrow-inventory');resolve(session,'scarecrow-inventory');
 assert.deepEqual(inventory(session),before);
});

scenario('carta sem metadados habilitados não pode ser usada como fonte',()=>{
 const {session}=setup(),window=openOpponentMain(session,0),trap=setTrap(session,window.defenderTeam,'threatening-roar',window.actorSeat);
 trap.id='00000000';
 assert.throws(()=>activate(session,trap,window,'unknown-source'),/metadados habilitados/);
});
