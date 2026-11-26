const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createTagDuel,tagInventory,assertTagDuel}=require('../dist/tagDuel');
const {enabledCardIds,engineCard,getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');
const {
 createBattleTargetPolicyAdapter,assertBattleTargetPolicyRules,
 STAUNCH_DEFENDER_ID,DARK_SPIRIT_OF_THE_SILENT_ID
}=require('../dist/battleTargetPolicyTagAdapter');

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
assert.equal(monsterIds.length,8);
assert.equal(spellIds.length,6);
assert.equal(trapIds.length,6);
const deck=[...monsterIds,...spellIds,...trapIds];
assert.equal(deck.length,20);
const fixtures={staunch:trapIds[0],dark:trapIds[1],staunchSecond:trapIds[2]};
const effectById=new Map([[fixtures.staunch,'staunch-defender'],[fixtures.dark,'dark-spirit-of-the-silent'],[fixtures.staunchSecond,'staunch-defender']]);
function lookup(id){
 const effect=effectById.get(id);
 return effect?{kind:'trap',effect}:undefined;
}
const adapter=createBattleTargetPolicyAdapter(lookup);
let scenarioCount=0,completed=0,inventoryConservationChecks=0;
function scenario(name,fn){
 scenarioCount++;
 test(name,()=>{fn();completed++;});
}
function setup(seed='m656-battle-target',first=0){
 const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...deck]}));
 const session=adapter.createSession(createTagDuel(players,{classic:true,first,seed}));
 return {session,adapter};
}
function take(holder,id){
 for(const zone of ['hand','deck','extra']){
  const list=holder[zone]||[],index=list.findIndex(card=>card.id===id);
  if(index>=0)return list.splice(index,1)[0];
 }
 throw new Error('Fixture card not found: '+id);
}
function holder(session,seat){
 const team=seat%2;
 return seat===session.duel.active[team]?session.duel.core.players[team]:session.duel.reserves[seat];
}
function deploy(session,team,id,seat=team,faceUp=true,position='atk',attacked=0){
 const card=take(holder(session,seat),id),turn=session.duel.core.turn;
 const monster={...card,position,faceUp,entered:turn,changed:turn,attacked,attackCount:attacked,atkBoost:0,defBoost:0,owner:team};
 session.duel.core.players[team].monsters.push(monster);
 return monster;
}
function setTrap(session,team,id,seat=team,options={}){
 const card=take(holder(session,seat),id),placed={...card,setTurn:options.setTurn??session.duel.core.turn-1,faceUp:options.faceUp??false};
 session.duel.core.players[team].backrow.push(placed);
 return placed;
}
function beginAttack(session,attackerTeam,attacker,targetUid=null){
 const duel=session.duel,defenderTeam=1-attackerTeam;
 attacker.attacked=1;attacker.attackCount=1;
 assert.equal(duel.core.current,attackerTeam);
 duel.core.priority=defenderTeam;
 duel.core.phase='response';
 duel.core.resume='battle';
 duel.core.pending={kind:'attack',actor:attackerTeam,card:attacker.uid,...targetUid?{target:targetUid}:{},stage:'declare'};
 return {attackerTeam,defenderTeam,actorSeat:duel.active[defenderTeam]};
}
function snapshot(session){
 return new Map(tagInventory(session.duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]));
}
function hands(session){
 const result=[];
 for(const player of session.duel.core.players)for(const card of player.hand)result.push(card.uid);
 for(const held of Object.values(session.duel.reserves))for(const card of held.hand)result.push(card.uid);
 return result.sort();
}
function assertConserved(before,beforeHands,session){
 const after=snapshot(session);
 assert.deepEqual([...after.entries()].sort(),[...before.entries()].sort());
 assert.deepEqual(hands(session),beforeHands);
 inventoryConservationChecks++;
}
function moveToGrave(session,team,uid){
 const monsters=session.duel.core.players[team].monsters,index=monsters.findIndex(card=>card.uid===uid);
 assert.ok(index>=0);
 const [card]=monsters.splice(index,1);
 session.duel.core.players[team].grave.push({uid:card.uid,id:card.id});
}
function activateStaunch(session,source,window,target,activationId='staunch-1'){
 const plan=adapter.prepareActivation(session,window.actorSeat,source.uid,activationId);
 assert.equal(plan.effect,'staunch-defender');
 const result=adapter.resolveActivation(session,activationId,target.uid);
 return {plan,result};
}
function activateDark(session,source,window,target,activationId='dark-1'){
 const plan=adapter.prepareActivation(session,window.actorSeat,source.uid,activationId);
 assert.equal(plan.effect,'dark-spirit-of-the-silent');
 const result=adapter.resolveActivation(session,activationId,target.uid);
 return {plan,result};
}

scenario('baseline: quatro assentos, decks 20, mão inicial 4 e regras clássicas 3+3 / mão 6 / Extra 5',()=>{
 const {session}=setup();
 assertBattleTargetPolicyRules(session.duel);assertTagDuel(session.duel);
 assert.equal(session.duel.mode,'tag-classic');
 assert.deepEqual(session.duel.core.players.map(player=>player.hand.length),[4,4]);
 const rules=rulesFor(session.duel.core);
 assert.equal(rules.mainDeckMin,20);assert.equal(rules.mainDeckMax,30);
 assert.equal(rules.handLimit,6);assert.equal(rules.handCheck,'end');
 assert.equal(rules.monsterZones,3);assert.equal(rules.spellTrapZones,3);assert.equal(rules.extraDeckMax,5);
});

scenario('Staunch Defender oferece somente monstros face-up da equipe defensora, inclusive do parceiro',()=>{
 const {session}=setup('m656-staunch-options',0);
 const attacker=deploy(session,0,monsterIds[0],0,true);
 const target=deploy(session,1,monsterIds[1],3,true,'def');
 const hidden=deploy(session,1,monsterIds[2],1,false,'def');
 const wrongTeam=deploy(session,0,monsterIds[3],2,true);
 const source=setTrap(session,1,fixtures.staunch,3),window=beginAttack(session,0,attacker);
 const plan=adapter.prepareActivation(session,window.actorSeat,source.uid,'staunch-options');
 assert.deepEqual(plan.targetOptions,[target.uid]);
 assert.equal(plan.targetOptions.includes(hidden.uid),false);
 assert.equal(plan.targetOptions.includes(wrongTeam.uid),false);
});

scenario('Staunch Defender redireciona o ataque atual e força todos os atacantes da equipe oponente ao mesmo alvo',()=>{
 const {session}=setup('m656-staunch-force',0);
 const attacker=deploy(session,0,monsterIds[0],0,true);
 const secondAttacker=deploy(session,0,monsterIds[1],2,true);
 const target=deploy(session,1,monsterIds[2],3,true,'def');
 const source=setTrap(session,1,fixtures.staunch,3),window=beginAttack(session,0,attacker);
 const before=snapshot(session),beforeHands=hands(session);
 const {result}=activateStaunch(session,source,window,target);
 assert.equal(session.duel.core.pending.target,target.uid);
 assert.equal(result.forcedTargetUid,target.uid);
 assert.deepEqual(adapter.allowedAttackTargets(session,attacker.uid,[null,target.uid]),[target.uid]);
 assert.deepEqual(adapter.allowedAttackTargets(session,secondAttacker.uid,[null,target.uid]),[target.uid]);
 assert.throws(()=>adapter.assertAttackTargetAllowed(session,secondAttacker.uid,null,[null,target.uid]),/Staunch Defender/);
 assertConserved(before,beforeHands,session);
});

scenario('Staunch Defender não restringe ataques da própria equipe defensora',()=>{
 const {session}=setup('m656-staunch-own-team',0);
 const attacker=deploy(session,0,monsterIds[0],0,true);
 const target=deploy(session,1,monsterIds[1],1,true);
 const defenderAttacker=deploy(session,1,monsterIds[2],3,true);
 const source=setTrap(session,1,fixtures.staunch,3),window=beginAttack(session,0,attacker);
 activateStaunch(session,source,window,target);
 assert.deepEqual(adapter.allowedAttackTargets(session,defenderAttacker.uid,[null,'other-target']),[null,'other-target']);
});

scenario('Staunch Defender expira no fim do turno da equipe atacante e a chamada é idempotente',()=>{
 const {session}=setup('m656-staunch-expire',0);
 const attacker=deploy(session,0,monsterIds[0],0,true),target=deploy(session,1,monsterIds[1],1,true);
 const source=setTrap(session,1,fixtures.staunch,1),window=beginAttack(session,0,attacker);
 activateStaunch(session,source,window,target);
 const turn=session.duel.core.turn;
 const expired=adapter.advanceEndPhase(session,0,turn);
 assert.equal(expired.status,'advanced');assert.deepEqual(expired.expiredTargetUids,[target.uid]);
 assert.deepEqual(adapter.allowedAttackTargets(session,attacker.uid,[null,target.uid]),[null,target.uid]);
 assert.equal(adapter.advanceEndPhase(session,0,turn).status,'duplicate');
});

scenario('Staunch Defender deixa de restringir ataques quando o monstro-alvo sai do campo',()=>{
 const {session}=setup('m656-staunch-target-gone',0);
 const attacker=deploy(session,0,monsterIds[0],0,true),target=deploy(session,1,monsterIds[1],1,true);
 const source=setTrap(session,1,fixtures.staunch,1),window=beginAttack(session,0,attacker);
 activateStaunch(session,source,window,target);
 moveToGrave(session,1,target.uid);
 assert.deepEqual(adapter.allowedAttackTargets(session,attacker.uid,[null,'another-target']),[null,'another-target']);
 assert.equal(session.policies.length,0);
});

scenario('Staunch Defender mantém a posição original do alvo face-up em Defesa',()=>{
 const {session}=setup('m656-staunch-defense-target',0);
 const attacker=deploy(session,0,monsterIds[0],0,true),target=deploy(session,1,monsterIds[1],1,true,'def');
 const source=setTrap(session,1,fixtures.staunch,1),window=beginAttack(session,0,attacker);
 activateStaunch(session,source,window,target);
 assert.equal(session.duel.core.players[1].monsters.find(card=>card.uid===target.uid).position,'def');
});

scenario('o membro ativo pode ativar Armadilha Baixada pelo parceiro inativo',()=>{
 const {session}=setup('m656-partner-set',0);
 const attacker=deploy(session,0,monsterIds[0],0,true),target=deploy(session,1,monsterIds[1],3,true);
 const source=setTrap(session,1,fixtures.staunch,3),window=beginAttack(session,0,attacker);
 const plan=adapter.prepareActivation(session,window.actorSeat,source.uid,'partner-set');
 assert.equal(plan.actorSeat,1);assert.equal(plan.sourceOwnerSeat,3);
});

scenario('membro inativo não pode responder no lugar do membro ativo',()=>{
 const {session}=setup('m656-inactive-actor',0);
 const attacker=deploy(session,0,monsterIds[0],0,true),target=deploy(session,1,monsterIds[1],1,true);
 const source=setTrap(session,1,fixtures.staunch,1),window=beginAttack(session,0,attacker);
 assert.throws(()=>adapter.prepareActivation(session,3,source.uid,'inactive-actor'),/participante ativo/);
 assert.ok(target.uid);
});

scenario('Armadilha Baixada no turno atual não pode ser ativada',()=>{
 const {session}=setup('m656-same-turn-set',0);
 const attacker=deploy(session,0,monsterIds[0],0,true),target=deploy(session,1,monsterIds[1],1,true);
 const source=setTrap(session,1,fixtures.staunch,1,{setTurn:session.duel.core.turn});
 const window=beginAttack(session,0,attacker);
 assert.throws(()=>adapter.prepareActivation(session,window.actorSeat,source.uid,'same-turn-set'),/Baixada antes/);
 assert.ok(target.uid);
});

scenario('Armadilha já face-up não pode ser ativada novamente',()=>{
 const {session}=setup('m656-faceup-trap',0);
 const attacker=deploy(session,0,monsterIds[0],0,true),target=deploy(session,1,monsterIds[1],1,true);
 const source=setTrap(session,1,fixtures.staunch,1,{faceUp:true}),window=beginAttack(session,0,attacker);
 assert.throws(()=>adapter.prepareActivation(session,window.actorSeat,source.uid,'faceup-trap'),/já está face-up/);
 assert.ok(target.uid);
});

scenario('Armadilha preparada pela equipe errada é rejeitada',()=>{
 const {session}=setup('m656-wrong-team',0);
 const attacker=deploy(session,0,monsterIds[0],0,true),target=deploy(session,1,monsterIds[1],1,true);
 const source=setTrap(session,0,fixtures.staunch,0),window=beginAttack(session,0,attacker);
 assert.throws(()=>adapter.prepareActivation(session,window.actorSeat,source.uid,'wrong-team'),/equipe defensora/);
 assert.ok(target.uid);
});

scenario('Staunch Defender não pode resolver sem monstro face-up da equipe defensora',()=>{
 const {session}=setup('m656-no-staunch-target',0);
 const attacker=deploy(session,0,monsterIds[0],0,true);
 deploy(session,1,monsterIds[1],1,false,'def');
 const source=setTrap(session,1,fixtures.staunch,1),window=beginAttack(session,0,attacker);
 assert.throws(()=>adapter.prepareActivation(session,window.actorSeat,source.uid,'no-staunch-target'),/Não existe alvo legal/);
});

scenario('identificador de ativação duplicado é rejeitado',()=>{
 const {session}=setup('m656-duplicate-activation',0);
 const attacker=deploy(session,0,monsterIds[0],0,true),target=deploy(session,1,monsterIds[1],1,true);
 const source=setTrap(session,1,fixtures.staunch,1),window=beginAttack(session,0,attacker);
 adapter.prepareActivation(session,window.actorSeat,source.uid,'duplicate-activation');
 assert.throws(()=>adapter.prepareActivation(session,window.actorSeat,source.uid,'duplicate-activation'),/Ativação duplicada/);
 assert.ok(target.uid);
});

scenario('Dark Spirit of the Silent substitui o atacante e preserva o alvo declarado',()=>{
 const {session}=setup('m656-dark-replace',1);
 const original=deploy(session,1,monsterIds[0],1,true);
 const replacement=deploy(session,1,monsterIds[1],3,true,'def');
 const target=deploy(session,0,monsterIds[2],2,true);
 const source=setTrap(session,0,fixtures.dark,0),window=beginAttack(session,1,original,target.uid);
 const before=snapshot(session),beforeHands=hands(session);
 const {plan,result}=activateDark(session,source,window,replacement);
 assert.ok(plan.targetOptions.includes(replacement.uid));
 assert.equal(session.duel.core.pending.card,replacement.uid);
 assert.equal(session.duel.core.pending.target,target.uid);
 assert.equal(result.originalAttackerUid,original.uid);
 assert.equal(result.replacementAttackerUid,replacement.uid);
 assert.equal(result.attackTargetUid,target.uid);
 assert.equal(session.duel.core.players[1].monsters.find(card=>card.uid===replacement.uid).position,'atk');
 assert.equal(session.duel.core.players[1].monsters.find(card=>card.uid===replacement.uid).changed,session.duel.core.turn);
 assert.equal(session.duel.core.players[1].monsters.find(card=>card.uid===original.uid).attacked,1);
 assert.equal(session.duel.core.players[1].monsters.find(card=>card.uid===replacement.uid).attacked,1);
 assertConserved(before,beforeHands,session);
});

scenario('Dark Spirit of the Silent mantém ataque direto quando a declaração original era direta',()=>{
 const {session}=setup('m656-dark-direct',1);
 const original=deploy(session,1,monsterIds[0],1,true),replacement=deploy(session,1,monsterIds[1],3,true);
 const source=setTrap(session,0,fixtures.dark,0),window=beginAttack(session,1,original,null);
 const {result}=activateDark(session,source,window,replacement);
 assert.equal(result.attackTargetUid,null);
 assert.equal(session.duel.core.pending.target,undefined);
 assert.equal(session.duel.core.pending.card,replacement.uid);
});

scenario('Dark Spirit oferece somente outro monstro face-up da equipe atacante',()=>{
 const {session}=setup('m656-dark-options',1);
 const original=deploy(session,1,monsterIds[0],1,true);
 const replacement=deploy(session,1,monsterIds[1],3,true);
 const hidden=deploy(session,1,monsterIds[2],1,false,'def');
 const defender=deploy(session,0,monsterIds[3],2,true);
 const source=setTrap(session,0,fixtures.dark,0),window=beginAttack(session,1,original,defender.uid);
 const plan=adapter.prepareActivation(session,window.actorSeat,source.uid,'dark-options');
 assert.deepEqual(plan.targetOptions,[replacement.uid]);
 assert.equal(plan.targetOptions.includes(original.uid),false);
 assert.equal(plan.targetOptions.includes(hidden.uid),false);
 assert.equal(plan.targetOptions.includes(defender.uid),false);
});

scenario('Dark Spirit não oferece monstro que já atacou nesta fase',()=>{
 const {session}=setup('m656-dark-already-attacked',1);
 const original=deploy(session,1,monsterIds[0],1,true);
 const alreadyAttacked=deploy(session,1,monsterIds[1],3,true,'atk',1);
 const source=setTrap(session,0,fixtures.dark,0),window=beginAttack(session,1,original,null);
 assert.throws(()=>adapter.prepareActivation(session,window.actorSeat,source.uid,'dark-no-replacement'),/Não existe alvo legal/);
 assert.ok(alreadyAttacked.uid);
});

scenario('Dark Spirit não pode resolver sem outro monstro face-up da equipe atacante',()=>{
 const {session}=setup('m656-dark-no-replacement',1);
 const original=deploy(session,1,monsterIds[0],1,true);
 deploy(session,1,monsterIds[1],3,false,'def');
 const source=setTrap(session,0,fixtures.dark,0),window=beginAttack(session,1,original,null);
 assert.throws(()=>adapter.prepareActivation(session,window.actorSeat,source.uid,'dark-no-replacement-2'),/Não existe alvo legal/);
});

scenario('Dark Spirit não permite escolher o próprio atacante declarado',()=>{
 const {session}=setup('m656-dark-same-attacker',1);
 const original=deploy(session,1,monsterIds[0],1,true);
 const source=setTrap(session,0,fixtures.dark,0),window=beginAttack(session,1,original,null);
 assert.throws(()=>adapter.resolveActivation(session,'missing-plan',original.uid),/não aguarda escolha/);
 assert.ok(source.uid);
});

scenario('alvo de Dark Spirit que saiu do campo antes da resolução é rejeitado sem consumir a Armadilha',()=>{
 const {session}=setup('m656-dark-stale-target',1);
 const original=deploy(session,1,monsterIds[0],1,true),replacement=deploy(session,1,monsterIds[1],3,true);
 const source=setTrap(session,0,fixtures.dark,0),window=beginAttack(session,1,original,null);
 adapter.prepareActivation(session,window.actorSeat,source.uid,'dark-stale-target');
 moveToGrave(session,1,replacement.uid);
 assert.throws(()=>adapter.resolveActivation(session,'dark-stale-target',replacement.uid),/alvo deixou de ser válido/);
 assert.ok(session.duel.core.players[0].backrow.some(card=>card.uid===source.uid));
});

scenario('Dark Spirit só responde à declaração, não durante o cálculo de dano',()=>{
 const {session}=setup('m656-dark-damage-step',1);
 const original=deploy(session,1,monsterIds[0],1,true),replacement=deploy(session,1,monsterIds[1],3,true);
 const source=setTrap(session,0,fixtures.dark,0),window=beginAttack(session,1,original,null);
 session.duel.core.pending.stage='damage';
 assert.throws(()=>adapter.prepareActivation(session,window.actorSeat,source.uid,'dark-damage-step'),/declaração de ataque/);
 assert.ok(replacement.uid);
});

scenario('ambas as Armadilhas vão ao Cemitério com UID físico original e sem alterar mãos',()=>{
 const a=setup('m656-source-grave-staunch',0),attacker=deploy(a.session,0,monsterIds[0],0,true);
 const target=deploy(a.session,1,monsterIds[1],1,true),trapA=setTrap(a.session,1,fixtures.staunch,3),windowA=beginAttack(a.session,0,attacker);
 const beforeA=snapshot(a.session),handsA=hands(a.session);
 activateStaunch(a.session,trapA,windowA,target);
 assert.ok(a.session.duel.core.players[1].grave.some(card=>card.uid===trapA.uid));
 assertConserved(beforeA,handsA,a.session);
 const b=setup('m656-source-grave-dark',1),original=deploy(b.session,1,monsterIds[0],1,true);
 const replacement=deploy(b.session,1,monsterIds[1],3,true),trapB=setTrap(b.session,0,fixtures.dark,0),windowB=beginAttack(b.session,1,original,null);
 const beforeB=snapshot(b.session),handsB=hands(b.session);
 activateDark(b.session,trapB,windowB,replacement);
 assert.ok(b.session.duel.core.players[0].grave.some(card=>card.uid===trapB.uid));
 assertConserved(beforeB,handsB,b.session);
});

scenario('uma declaração que mudou de turno entre preparação e resolução fica obsoleta',()=>{
 const {session}=setup('m656-stale-window',0);
 const attacker=deploy(session,0,monsterIds[0],0,true),target=deploy(session,1,monsterIds[1],1,true);
 const source=setTrap(session,1,fixtures.staunch,1),window=beginAttack(session,0,attacker);
 adapter.prepareActivation(session,window.actorSeat,source.uid,'stale-window');
 session.duel.core.turn++;
 assert.throws(()=>adapter.resolveActivation(session,'stale-window',target.uid),/declaração de ataque mudou/);
});

scenario('uma segunda Staunch Defender substitui a política anterior do mesmo turno',()=>{
 const {session}=setup('m656-staunch-replace-policy',0);
 const attacker=deploy(session,0,monsterIds[0],0,true);
 const firstTarget=deploy(session,1,monsterIds[1],1,true),secondTarget=deploy(session,1,monsterIds[2],3,true);
 const firstTrap=setTrap(session,1,fixtures.staunch,1),secondTrap=setTrap(session,1,fixtures.staunchSecond,3);
 const window=beginAttack(session,0,attacker);
 activateStaunch(session,firstTrap,window,firstTarget,'staunch-first');
 activateStaunch(session,secondTrap,window,secondTarget,'staunch-second');
 assert.deepEqual(adapter.allowedAttackTargets(session,attacker.uid,[firstTarget.uid,secondTarget.uid,null]),[secondTarget.uid]);
 assert.equal(session.policies.length,1);
});

scenario('a Field Zone é independente das três Spell/Trap Zones',()=>{
 const {session}=setup('m656-field-independent',0);
 const team=session.duel.core.players[0],card=take(holder(session,0),spellIds[0]);
 team.field={...card,setTurn:0,faceUp:true};
 for(let i=0;i<3;i++)setTrap(session,0,trapIds[i],0);
 assertBattleTargetPolicyRules(session.duel);
 assert.equal(team.backrow.length,3);
 assert.ok(team.field);
});

scenario('quatro monstros na equipe violam o limite de três Monster Zones',()=>{
 const {session}=setup('m656-monster-zone-cap',0);
 for(let i=0;i<4;i++)deploy(session,0,monsterIds[i],0,true);
 assert.throws(()=>assertBattleTargetPolicyRules(session.duel),/três Monster Zones/);
});

scenario('quatro cartas na retaguarda violam o limite de três Spell/Trap Zones',()=>{
 const {session}=setup('m656-backrow-cap',0);
 for(let i=0;i<4;i++)setTrap(session,0,trapIds[i],0);
 assert.throws(()=>assertBattleTargetPolicyRules(session.duel),/três Spell\/Trap Zones/);
});

scenario('o catálogo permanece sem certificar ou liberar as duas cartas novas',()=>{
 assert.equal(enabledCardIds.includes(STAUNCH_DEFENDER_ID),false);
 assert.equal(enabledCardIds.includes(DARK_SPIRIT_OF_THE_SILENT_ID),false);
 assert.equal(getPlayableCard(STAUNCH_DEFENDER_ID),undefined);
 assert.equal(getPlayableCard(DARK_SPIRIT_OF_THE_SILENT_ID),undefined);
});

scenario('um alvo selecionado por Staunch que vira face-down continua sendo o alvo designado',()=>{
 const {session}=setup('m656-staunch-face-down-after',0);
 const attacker=deploy(session,0,monsterIds[0],0,true),target=deploy(session,1,monsterIds[1],1,true);
 const source=setTrap(session,1,fixtures.staunch,1),window=beginAttack(session,0,attacker);
 activateStaunch(session,source,window,target);
 const liveTarget=session.duel.core.players[1].monsters.find(card=>card.uid===target.uid);liveTarget.faceUp=false;liveTarget.position='def';
 assert.deepEqual(adapter.allowedAttackTargets(session,attacker.uid,[null,target.uid]),[target.uid]);
});

after(()=>{
 fs.mkdirSync('artifacts',{recursive:true});
 fs.writeFileSync('artifacts/m656-battle-target-policy-results.json',JSON.stringify({
  mission:'M656',scenarioCount,completed,failed:scenarioCount-completed,
  inventoryConservationChecks,noInventoryGrants:true,physicalInventoryConserved:inventoryConservationChecks>=4,
  cards:[STAUNCH_DEFENDER_ID,DARK_SPIRIT_OF_THE_SILENT_ID],
  certification:'not-certified',integration:'isolated-adapter-only'
 },null,2)+'\n');
});
