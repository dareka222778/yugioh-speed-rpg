const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createTagDuel,tagInventory,tagNormalCardIds}=require('../dist/tagDuel');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
 NIGHTMARE_WHEEL_ID,SHADOW_SPELL_ID,createTargetedContinuousTrapAdapter,assertTargetedContinuousTrapRules
}=require('../dist/targetedContinuousTrapTagAdapter');

const enabled=getEnabledCardIds();
const trapIds=enabled.filter(id=>getDuelCard(id)?.kind==='trap');
const [trapA,trapB,trapC]=trapIds;
const normalIds=tagNormalCardIds.slice(0,17);
assert.ok(trapA&&trapB&&trapC,'O catálogo-base precisa fornecer três Armadilhas físicas para fixtures isoladas.');
assert.equal(normalIds.length,17);
const fieldId=enabled.find(id=>getDuelCard(id)?.kind==='spell');
const jinzoId=enabled.find(id=>getDuelCard(id)?.name==='Jinzo');
assert.ok(fieldId&&jinzoId,'Fixtures precisam de uma Magia de Campo e Jinzo habilitados.');
const mainDeck=[...normalIds.slice(0,15),trapA,trapB,trapC,fieldId,jinzoId];
const players=()=>[
 {id:'p0',name:'Azul A',cards:[...mainDeck],extra:[]},
 {id:'p1',name:'Vermelho A',cards:[...mainDeck],extra:[]},
 {id:'p2',name:'Azul B',cards:[...mainDeck],extra:[]},
 {id:'p3',name:'Vermelho B',cards:[...mainDeck],extra:[]}
];
function baseDuel(){
 return createTagDuel(players(),{seed:'m684-targeted-continuous-traps',first:0,classic:true});
}
function setMainWindow(duel,team,turn=duel.core.turn){
 duel.core.turn=turn;duel.cursor=duel.active[team];duel.core.current=team;duel.core.priority=team;duel.core.phase='main';
 duel.core.turnEnding=undefined;duel.core.damageStep=undefined;
 if(duel.core.teamRotation){duel.core.teamRotation.cursor=duel.cursor;duel.core.teamRotation.active=duel.active;duel.core.teamRotation.reserves=duel.reserves;}
}
function takePhysical(duel,seat,id){
 const team=seat%2,held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
 for(const pool of [held.hand,held.deck,held.extra??[]]){
  const index=pool.findIndex(card=>card.id===id);
  if(index>=0)return pool.splice(index,1)[0];
 }
 throw new Error('Carta física indisponível para o assento '+seat+': '+id);
}
function placeMonster(duel,seat,id,options={}){
 const card=takePhysical(duel,seat,id),monster={
  ...card,position:options.position??'atk',faceUp:options.faceUp??true,entered:duel.core.turn,
  changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:seat%2
 };
 duel.core.players[seat%2].monsters.push(monster);synchronizeCardLifetimes(duel.core);return monster;
}
function placeBackrow(duel,seat,id,options={}){
 const card=takePhysical(duel,seat,id),backrow={
  ...card,setTurn:options.setTurn??0,faceUp:options.faceUp??false,resolved:options.resolved??false
 };
 duel.core.players[seat%2].backrow.push(backrow);synchronizeCardLifetimes(duel.core);return backrow;
}
function moveMonsterToGrave(duel,uid){
 for(const team of [0,1]){
  const index=duel.core.players[team].monsters.findIndex(monster=>monster.uid===uid);
  if(index<0)continue;
  const [monster]=duel.core.players[team].monsters.splice(index,1);
  const ownerSeat=Number(/^m([0-3]):/.exec(uid)?.[1]);
  duel.core.players[ownerSeat%2].grave.push({uid:monster.uid,id:monster.id});synchronizeCardLifetimes(duel.core);return;
 }
 throw new Error('Monstro não encontrado: '+uid);
}
function reviveMonsterFromGrave(duel,uid,controllerTeam){
 const ownerSeat=Number(/^m([0-3]):/.exec(uid)?.[1]),ownerTeam=ownerSeat%2;
 const grave=duel.core.players[ownerTeam].grave,index=grave.findIndex(card=>card.uid===uid);
 if(index<0)throw new Error('Monstro não encontrado no Cemitério.');
 const [card]=grave.splice(index,1);
 duel.core.players[controllerTeam].monsters.push({...card,position:'atk',faceUp:true,entered:duel.core.turn,
  changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:ownerTeam});
 synchronizeCardLifetimes(duel.core);
}
function moveBackrowToGrave(duel,uid){
 for(const team of [0,1]){
  const index=duel.core.players[team].backrow.findIndex(card=>card.uid===uid);
  if(index<0)continue;
  const [card]=duel.core.players[team].backrow.splice(index,1);
  const ownerSeat=Number(/^m([0-3]):/.exec(uid)?.[1]);
  duel.core.players[ownerSeat%2].grave.push({uid:card.uid,id:card.id});synchronizeCardLifetimes(duel.core);return;
 }
 throw new Error('Armadilha não encontrada: '+uid);
}
function makeAdapter(overrides={}){
 const mapping=new Map([[trapA,'nightmare-wheel'],[trapB,'shadow-spell'],[trapC,'nightmare-wheel'],...Object.entries(overrides)]);
 return createTargetedContinuousTrapAdapter(id=>{
  const effect=mapping.get(id);return effect?{kind:'trap',effect}:undefined;
 });
}
function setup(effect,options={}){
 const duel=baseDuel(),sourceSeat=options.sourceSeat??0,targetSeat=options.targetSeat??1;
 const sourceId=options.sourceId??(effect==='nightmare-wheel'?trapA:trapB);
 const source=placeBackrow(duel,sourceSeat,sourceId,{setTurn:options.setTurn??0});
 const target=placeMonster(duel,targetSeat,normalIds[options.targetIndex??0],{faceUp:options.faceUp??true,position:options.position??'atk'});
 setMainWindow(duel,sourceSeat%2);
 const adapter=makeAdapter(options.lookupOverrides??{}),session=adapter.createSession(duel);
 const activation=adapter.activate(session,{activationId:'activation-1',sourceUid:source.uid,targetUid:target.uid,actorSeat:duel.active[sourceSeat%2]});
 const resolution=options.resolveOptions===false?undefined:adapter.resolve(session,'activation-1',options.resolveOptions??{});
 return {adapter,session,source,target,activation,resolution};
}
function physicalInventory(duel){
 return new Map(tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]));
}
function standby(session,adapter,team=0,eventId){
 const turn=team===session.duel.core.current?session.duel.core.turn:session.duel.core.turn+1;
 setMainWindow(session.duel,team,turn);
 return adapter.resolveStandbyPhase(session,{eventId:eventId??('turn-'+turn+'-team-'+team+'-standby'),turn:session.duel.core.turn,controllerTeam:team,phase:'standby'});
}

test('baseline: duas cartas novas permanecem fora do catálogo e da certificação',()=>{
 assert.equal(getDuelCard(NIGHTMARE_WHEEL_ID),undefined);
 assert.equal(getDuelCard(SHADOW_SPELL_ID),undefined);
 assert.equal(getDuelCard(trapA)?.kind,'trap');
 assert.equal(getDuelCard(trapB)?.kind,'trap');
 assert.equal(getDuelCard(trapC)?.kind,'trap');
});

test('regras clássicas 2v2: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5',()=>{
 const duel=baseDuel();assert.doesNotThrow(()=>assertTargetedContinuousTrapRules(duel));
 assert.equal(duel.core.players[0].monsters.length,0);assert.equal(duel.core.players[0].backrow.length,0);
 assert.equal(duel.core.players[0].field,null);
});

test('mão pode passar de seis durante resolução; limite é verificado apenas na End Phase',()=>{
 const duel=baseDuel(),player=duel.core.players[0];
 while(player.hand.length<7)player.hand.push(player.deck.pop());
 synchronizeCardLifetimes(duel.core);
 assert.doesNotThrow(()=>assertTargetedContinuousTrapRules(duel));
});

test('Field Zone é separada das três Spell/Trap Zones',()=>{
 const duel=baseDuel();
 placeBackrow(duel,0,trapA);placeBackrow(duel,0,trapB);placeBackrow(duel,0,trapC);
 const card=takePhysical(duel,0,fieldId);
 duel.core.players[0].field={...card,setTurn:0,faceUp:true,resolved:true};
 synchronizeCardLifetimes(duel.core);
 assert.equal(duel.core.players[0].backrow.length,3);
 assert.doesNotThrow(()=>assertTargetedContinuousTrapRules(duel));
});

test('quatro cartas na mesma Spell/Trap Zone group são rejeitadas',()=>{
 const duel=baseDuel();placeBackrow(duel,0,trapA);placeBackrow(duel,0,trapB);placeBackrow(duel,0,trapC);
 const extra=takePhysical(duel,2,normalIds[0]);
 duel.core.players[0].backrow.push({...extra,setTurn:0,faceUp:false});
 synchronizeCardLifetimes(duel.core);
 assert.throws(()=>assertTargetedContinuousTrapRules(duel),/limite de zonas/);
});

test('quatro monstros na mesma equipe são rejeitados',()=>{
 const duel=baseDuel();
 for(let i=0;i<4;i++)placeMonster(duel,0,normalIds[i]);
 assert.throws(()=>assertTargetedContinuousTrapRules(duel),/limite de zonas/);
});

test('Shadow Spell exige alvo adversário face-up',()=>{
 const duel=baseDuel(),source=placeBackrow(duel,0,trapB,{setTurn:0});
 const target=placeMonster(duel,1,normalIds[0],{faceUp:false,position:'def'});
 setMainWindow(duel,0);const adapter=makeAdapter(),session=adapter.createSession(duel);
 assert.throws(()=>adapter.activate(session,{activationId:'face-down',sourceUid:source.uid,targetUid:target.uid,actorSeat:0}),/face para cima/);
});

test('Nightmare Wheel pode mirar monstro adversário face-down e bloqueia mudança de posição',()=>{
 const setupResult=setup('nightmare-wheel',{faceUp:false,position:'def'});
 assert.equal(setupResult.resolution.status,'active');
 assert.equal(setupResult.adapter.isAttackBlocked(setupResult.session,setupResult.target.uid),true);
 assert.equal(setupResult.adapter.canChangeBattlePosition(setupResult.session,setupResult.target.uid),false);
});

test('Shadow Spell bloqueia ataque/posição e reduz 700 ATK',()=>{
 const s=setup('shadow-spell');
 assert.equal(s.resolution.status,'active');
 assert.equal(s.adapter.isAttackBlocked(s.session,s.target.uid),true);
 assert.equal(s.adapter.canChangeBattlePosition(s.session,s.target.uid),false);
 assert.equal(s.adapter.atkModifier(s.session,s.target.uid),-700);
});

test('Nightmare Wheel bloqueia ataque/posição sem modificar ATK',()=>{
 const s=setup('nightmare-wheel');
 assert.equal(s.adapter.isAttackBlocked(s.session,s.target.uid),true);
 assert.equal(s.adapter.canChangeBattlePosition(s.session,s.target.uid),false);
 assert.equal(s.adapter.atkModifier(s.session,s.target.uid),0);
});

test('efeitos não ficam ativos antes da resolução da ativação',()=>{
 const duel=baseDuel(),source=placeBackrow(duel,0,trapA,{setTurn:0}),target=placeMonster(duel,1,normalIds[0]);
 setMainWindow(duel,0);const adapter=makeAdapter(),session=adapter.createSession(duel);
 adapter.activate(session,{activationId:'pending',sourceUid:source.uid,targetUid:target.uid,actorSeat:0});
 assert.equal(adapter.isAttackBlocked(session,target.uid),false);
 assert.equal(session.duel.core.players[0].backrow.find(c=>c.uid===source.uid).resolved,false);
});

test('ativação é idempotente e não duplica cartas físicas',()=>{
 const s=setup('nightmare-wheel'),before=physicalInventory(s.session.duel);
 const again=s.adapter.activate(s.session,{activationId:'activation-1',sourceUid:s.source.uid,targetUid:s.target.uid,actorSeat:0});
 assert.equal(again.sourceUid,s.source.uid);
 assert.deepEqual(physicalInventory(s.session.duel),before);
});

test('ID de ativação não pode ser reutilizado com alvo diferente',()=>{
 const s=setup('nightmare-wheel'),other=placeMonster(s.session.duel,3,normalIds[1]);
 assert.throws(()=>s.adapter.activate(s.session,{activationId:'activation-1',sourceUid:s.source.uid,targetUid:other.uid,actorSeat:0}),/reutilizado/);
});

test('somente o assento ativo da equipe controladora pode ativar',()=>{
 const duel=baseDuel(),source=placeBackrow(duel,0,trapA,{setTurn:0}),target=placeMonster(duel,1,normalIds[0]);
 setMainWindow(duel,0);const adapter=makeAdapter(),session=adapter.createSession(duel);
 assert.throws(()=>adapter.activate(session,{activationId:'wrong-seat',sourceUid:source.uid,targetUid:target.uid,actorSeat:2}),/assento ativo/);
});

test('alvo precisa pertencer à equipe adversária',()=>{
 const duel=baseDuel(),source=placeBackrow(duel,0,trapA,{setTurn:0}),target=placeMonster(duel,2,normalIds[0]);
 setMainWindow(duel,0);const adapter=makeAdapter(),session=adapter.createSession(duel);
 assert.throws(()=>adapter.activate(session,{activationId:'same-team',sourceUid:source.uid,targetUid:target.uid,actorSeat:0}),/equipe adversária/);
});

test('Armadilha Baixada no turno atual não pode ser ativada',()=>{
 const duel=baseDuel(),source=placeBackrow(duel,0,trapA,{setTurn:duel.core.turn}),target=placeMonster(duel,1,normalIds[0]);
 setMainWindow(duel,0);const adapter=makeAdapter(),session=adapter.createSession(duel);
 assert.throws(()=>adapter.activate(session,{activationId:'same-turn',sourceUid:source.uid,targetUid:target.uid,actorSeat:0}),/turno anterior/);
});

test('ativação negada envia a Armadilha ao Cemitério do proprietário físico',()=>{
 const s=setup('nightmare-wheel',{sourceSeat:2,resolveOptions:{activationNegated:true}});
 assert.equal(s.resolution.status,'activation-negated');
 assert.ok(s.session.duel.core.players[0].grave.some(c=>c.uid===s.source.uid));
 assert.ok(!s.session.duel.core.players[0].backrow.some(c=>c.uid===s.source.uid));
});

test('efeito negado deixa a Armadilha face-up, mas sem política ativa',()=>{
 const s=setup('shadow-spell',{resolveOptions:{effectNegated:true}});
 const source=s.session.duel.core.players[0].backrow.find(c=>c.uid===s.source.uid);
 assert.equal(s.resolution.status,'effect-negated');
 assert.equal(source.faceUp,true);assert.equal(source.resolved,false);
 assert.equal(s.adapter.isAttackBlocked(s.session,s.target.uid),false);
});

test('Jinzo suprime efeito contínuo já ativado e a política retorna quando ele sai',()=>{
 const s=setup('nightmare-wheel',{resolveOptions:false});
 const jinzo=placeMonster(s.session.duel,0,jinzoId);
 const resolution=s.adapter.resolve(s.session,'activation-1');
 assert.equal(resolution.status,'active');
 assert.equal(s.adapter.isAttackBlocked(s.session,s.target.uid),false);
 assert.ok(physicalInventory(s.session.duel).has(s.source.uid));
 moveMonsterToGrave(s.session.duel,jinzo.uid);
 assert.equal(s.adapter.isAttackBlocked(s.session,s.target.uid),true,'o efeito deve retornar quando Jinzo sair do campo.');
});


test('cláusula de autodestruição também fica suspensa enquanto Jinzo nega Armadilhas',()=>{
 const s=setup('nightmare-wheel',{resolveOptions:false});
 const jinzo=placeMonster(s.session.duel,0,jinzoId);
 s.adapter.resolve(s.session,'activation-1');
 moveMonsterToGrave(s.session.duel,s.target.uid);
 assert.equal(s.adapter.reconcileTargets(s.session),0);
 assert.ok(s.session.duel.core.players[0].backrow.some(card=>card.uid===s.source.uid));
 moveMonsterToGrave(s.session.duel,jinzo.uid);
 assert.equal(s.adapter.reconcileTargets(s.session),1);
 assert.ok(s.session.duel.core.players[0].grave.some(card=>card.uid===s.source.uid));
});

test('Jinzo impede novas ativações de Armadilha',()=>{
 const duel=baseDuel(),source=placeBackrow(duel,0,trapA,{setTurn:0}),target=placeMonster(duel,1,normalIds[0]);
 placeMonster(duel,0,jinzoId);setMainWindow(duel,0);
 const adapter=makeAdapter(),session=adapter.createSession(duel);
 assert.throws(()=>adapter.activate(session,{activationId:'jinzo-block',sourceUid:source.uid,targetUid:target.uid,actorSeat:0}),/bloqueada/);
});

test('alvo que deixa o campo destrói Nightmare Wheel e envia-a ao dono',()=>{
 const s=setup('nightmare-wheel',{sourceSeat:2});moveMonsterToGrave(s.session.duel,s.target.uid);
 assert.equal(s.adapter.reconcileTargets(s.session),1);
 assert.equal(s.session.resolutions['activation-1'].status,'target-left-field');
 assert.ok(s.session.duel.core.players[0].grave.some(c=>c.uid===s.source.uid));
});

test('alvo que sai e retorna com o mesmo UID não mantém o vínculo antigo',()=>{
 const s=setup('shadow-spell');moveMonsterToGrave(s.session.duel,s.target.uid);
 reviveMonsterFromGrave(s.session.duel,s.target.uid,1);
 assert.equal(s.adapter.reconcileTargets(s.session),1);
 assert.equal(s.session.resolutions['activation-1'].status,'target-left-field');
 assert.equal(s.adapter.atkModifier(s.session,s.target.uid),0);
});

test('se a própria Armadilha sair do campo, o efeito cessa sem retarget',()=>{
 const s=setup('nightmare-wheel');moveBackrowToGrave(s.session.duel,s.source.uid);
 assert.equal(s.adapter.reconcileTargets(s.session),0);
 assert.equal(s.session.resolutions['activation-1'].status,'source-left-field');
 assert.equal(s.adapter.isAttackBlocked(s.session,s.target.uid),false);
});

test('resolução repetida é idempotente',()=>{
 const s=setup('nightmare-wheel'),again=s.adapter.resolve(s.session,'activation-1');
 assert.equal(again.status,'active');assert.equal(again.replayed,true);
});

test('Nightmare Wheel causa 500 LP apenas na Standby do controlador',()=>{
 const s=setup('nightmare-wheel');
 const before=s.session.duel.core.players[1].lp;
 const receipt=standby(s.session,s.adapter,0);
 assert.equal(receipt.status,'applied');assert.equal(receipt.damageTotal,500);
 assert.equal(s.session.duel.core.players[1].lp,before-500);
});

test('Standby da equipe adversária não causa dano de Nightmare Wheel',()=>{
 const s=setup('nightmare-wheel'),before=s.session.duel.core.players[1].lp;
 const receipt=standby(s.session,s.adapter,1);
 assert.equal(receipt.status,'no-trigger');assert.equal(s.session.duel.core.players[1].lp,before);
});

test('Nightmare Wheel não causa dano se o alvo deixou o campo',()=>{
 const s=setup('nightmare-wheel');moveMonsterToGrave(s.session.duel,s.target.uid);
 const before=s.session.duel.core.players[1].lp,receipt=standby(s.session,s.adapter,0);
 assert.equal(receipt.status,'no-trigger');assert.equal(s.session.duel.core.players[1].lp,before);
 assert.ok(s.session.duel.core.players[0].grave.some(c=>c.uid===s.source.uid));
});

test('Nightmare Wheel continua ligado ao UID após mudança de controle',()=>{
 const s=setup('nightmare-wheel');
 const monster=s.session.duel.core.players[1].monsters.find(m=>m.uid===s.target.uid);
 s.session.duel.core.players[1].monsters=s.session.duel.core.players[1].monsters.filter(m=>m.uid!==s.target.uid);
 s.session.duel.core.players[0].monsters.push(monster);synchronizeCardLifetimes(s.session.duel.core);
 assert.equal(s.adapter.isAttackBlocked(s.session,s.target.uid),true);
 const before=s.session.duel.core.players[1].lp,receipt=standby(s.session,s.adapter,0);
 assert.equal(receipt.damageTotal,500);assert.equal(s.session.duel.core.players[1].lp,before-500);
});

test('duas Nightmare Wheels resolvem 500 LP cada na mesma Standby',()=>{
 const duel=baseDuel(),sourceA=placeBackrow(duel,0,trapA,{setTurn:0}),sourceB=placeBackrow(duel,2,trapC,{setTurn:0});
 const targetA=placeMonster(duel,1,normalIds[0]),targetB=placeMonster(duel,3,normalIds[1]);
 setMainWindow(duel,0);const adapter=makeAdapter(),session=adapter.createSession(duel);
 adapter.activate(session,{activationId:'wheel-a',sourceUid:sourceA.uid,targetUid:targetA.uid,actorSeat:0});
 adapter.activate(session,{activationId:'wheel-b',sourceUid:sourceB.uid,targetUid:targetB.uid,actorSeat:0});
 adapter.resolve(session,'wheel-a');adapter.resolve(session,'wheel-b');
 const before=session.duel.core.players[1].lp,receipt=standby(session,adapter,0);
 assert.equal(receipt.entries.length,2);assert.equal(receipt.damageTotal,1000);
 assert.equal(session.duel.core.players[1].lp,before-1000);
 assert.ok(session.duel.core.players[0].backrow.some(c=>c.uid===sourceB.uid));
});

test('duas Shadow Spells acumulam redução de 700 ATK cada',()=>{
 const duel=baseDuel(),sourceA=placeBackrow(duel,0,trapB,{setTurn:0}),sourceB=placeBackrow(duel,2,trapC,{setTurn:0});
 const target=placeMonster(duel,1,normalIds[0]);setMainWindow(duel,0);
 const adapter=makeAdapter({[trapC]:'shadow-spell'}),session=adapter.createSession(duel);
 adapter.activate(session,{activationId:'shadow-a',sourceUid:sourceA.uid,targetUid:target.uid,actorSeat:0});
 adapter.activate(session,{activationId:'shadow-b',sourceUid:sourceB.uid,targetUid:target.uid,actorSeat:0});
 adapter.resolve(session,'shadow-a');adapter.resolve(session,'shadow-b');
 assert.equal(adapter.atkModifier(session,target.uid),-1400);
 assert.equal(adapter.isAttackBlocked(session,target.uid),true);
});

test('Nightmare Wheel não reduz ATK e Shadow Spell não gera dano de Standby',()=>{
 const s=setup('shadow-spell'),before=s.session.duel.core.players[1].lp;
 const receipt=standby(s.session,s.adapter,0);
 assert.equal(receipt.status,'no-trigger');assert.equal(s.session.duel.core.players[1].lp,before);
});

test('dano que zera LP encerra o duelo e dá vitória à equipe da Armadilha',()=>{
 const s=setup('nightmare-wheel');s.session.duel.core.players[1].lp=300;
 const receipt=standby(s.session,s.adapter,0);
 assert.equal(receipt.status,'duel-ended');assert.equal(receipt.damageTotal,300);
 assert.equal(s.session.duel.core.phase,'finished');assert.equal(s.session.duel.core.winner,s.session.duel.core.players[0].id);
});

test('ID de Standby repetido não aplica o dano duas vezes',()=>{
 const s=setup('nightmare-wheel'),first=standby(s.session,s.adapter,0,'same-standby');
 const after=s.session.duel.core.players[1].lp,second=s.adapter.resolveStandbyPhase(s.session,{eventId:'same-standby',turn:1,controllerTeam:0,phase:'standby'});
 assert.equal(first.damageTotal,500);assert.equal(second.replayed,true);
 assert.equal(s.session.duel.core.players[1].lp,after);
});

test('janela de Standby de outro turno/equipe é rejeitada',()=>{
 const s=setup('nightmare-wheel');setMainWindow(s.session.duel,1);
 assert.throws(()=>s.adapter.resolveStandbyPhase(s.session,{eventId:'wrong-team',turn:1,controllerTeam:0,phase:'standby'}),/Standby/);
});

test('inventário físico permanece idêntico após ativação, resolução e Standby',()=>{
 const s=setup('nightmare-wheel'),before=physicalInventory(s.session.duel);
 standby(s.session,s.adapter,0);
 assert.deepEqual(physicalInventory(s.session.duel),before);
});

test('fixtures não concedem cartas e preservam a propriedade física do assento 2',()=>{
 const s=setup('nightmare-wheel',{sourceSeat:2});
 assert.match(s.source.uid,/^m2:/);assert.equal(s.activation.sourceSeat,2);assert.equal(s.activation.actorSeat,0);
 moveMonsterToGrave(s.session.duel,s.target.uid);s.adapter.reconcileTargets(s.session);
 const moved=s.session.duel.core.players[0].grave.find(card=>card.uid===s.source.uid);
 assert.ok(moved);assert.match(moved.uid,/^m2:/);
});
