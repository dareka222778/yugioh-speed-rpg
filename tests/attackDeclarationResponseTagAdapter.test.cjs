const test=require('node:test');
const assert=require('node:assert/strict');
const {
 createAttackDeclarationResponseAdapter,MAGIC_CYLINDER_ID,DRAINING_SHIELD_ID,NEGATE_ATTACK_ID
}=require('../dist/attackDeclarationResponseTagAdapter');
const {createTagDuel,tagNormalCardIds,tagInventory}=require('../dist/tagDuel');
const {getDuelCard,getEffect,getEnabledCardIds}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {atk}=require('../dist/duelEngine');
const {RULES_PROFILE}=require('../dist/rulesProfile');

const enabled=getEnabledCardIds();
const jinzoId=enabled.find(id=>getMonsterEffect(id)?.operation?.kind==='negateTraps');
const royalDecreeId=enabled.find(id=>{
 const effect=getEffect(id);return effect?.kind==='continuous'&&effect.rules?.some(rule=>rule.kind==='negateTraps');
});
const fieldSpellId=enabled.find(id=>getEffect(id)?.kind==='field');
const counterTrapId=enabled.find(id=>{
 const effect=getEffect(id);return !!effect&&getActivationModel(effect)?.speed===3;
});
const normalSpellId='55144522';
const attackerId=enabled.find(id=>{
 const card=getDuelCard(id);return card?.kind==='monster'&&card.monsterType==='effect'&&card.atk>=1000&&id!==jinzoId&&card.race!=='Fiend';
});
const trapFixtures=enabled.filter(id=>{
 const card=getDuelCard(id),effect=getEffect(id);
 return card?.kind==='trap'&&id!==royalDecreeId&&id!==counterTrapId&&effect?.kind!=='continuous'&&getActivationModel(effect)?.speed!==3;
}).slice(0,3);
const fusionIds=enabled.filter(id=>getDuelCard(id)?.fusion).slice(0,6);
assert.ok(jinzoId,'Jinzo precisa estar habilitada.');
assert.ok(royalDecreeId,'Royal Decree precisa estar habilitada.');
assert.ok(fieldSpellId,'Uma Magia de Campo precisa estar habilitada.');
assert.ok(counterTrapId,'Uma Counter Trap precisa estar habilitada.');
assert.equal(getDuelCard(normalSpellId)?.kind,'spell');
assert.ok(attackerId,'Um monstro de efeito com ATK >= 1000 precisa estar habilitado.');
assert.equal(trapFixtures.length,3,'Três Armadilhas físicas precisam estar habilitadas.');
assert.ok(fusionIds.length>=6,'Seis Fusões precisam estar habilitadas.');
const special=new Set([jinzoId,royalDecreeId,fieldSpellId,counterTrapId,normalSpellId,attackerId,...trapFixtures]);
const normalIds=tagNormalCardIds.filter(id=>!special.has(id)).slice(0,12);
assert.equal(normalIds.length,12);
const mainDeck=[...normalIds,attackerId,...trapFixtures,counterTrapId,royalDecreeId,fieldSpellId,normalSpellId];
assert.equal(mainDeck.length,20);
assert.equal(new Set(mainDeck).size,20);
const effectByFixture=new Map([
 [trapFixtures[0],{effect:'magic-cylinder',speed:2}],
 [trapFixtures[1],{effect:'draining-shield',speed:2}],
 [trapFixtures[2],{effect:'negate-attack',speed:3}]
]);
const lookup=id=>{
 const meta=effectByFixture.get(id);
 return meta?{kind:'trap',...meta}:undefined;
};
const adapter=createAttackDeclarationResponseAdapter(lookup);
const players=[
 {id:'p0',name:'Defesa Azul',cards:mainDeck},
 {id:'p1',name:'Ataque Vermelho',cards:mainDeck},
 {id:'p2',name:'Parceiro Azul',cards:mainDeck},
 {id:'p3',name:'Parceiro Vermelho',cards:mainDeck}
];
function makeDuel(extra=[]){
 return createTagDuel(players.map(player=>({...player,extra})),{seed:'m683-attack-response',first:1,classic:true});
}
function holderFor(duel,seat){
 const team=seat%2;return duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
}
function takePhysical(duel,seat,id){
 const holder=holderFor(duel,seat);
 for(const zone of ['hand','deck','extra']){
  const list=holder[zone];if(!Array.isArray(list))continue;
  const index=list.findIndex(card=>card.id===id);
  if(index>=0)return list.splice(index,1)[0];
 }
 throw new Error('Fixture físico ausente: '+seat+'/'+id);
}
function placeMonster(duel,seat,id,{faceUp=true,position='atk'}={}){
 const card=takePhysical(duel,seat,id);
 duel.core.players[seat%2].monsters.push({...card,position,faceUp,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:seat%2});
 synchronizeCardLifetimes(duel.core);return card.uid;
}
function placeBackrow(duel,seat,id,{faceUp=false,resolved=false,setTurn=0}={}){
 const card=takePhysical(duel,seat,id);
 duel.core.players[seat%2].backrow.push({...card,setTurn,faceUp,resolved});
 synchronizeCardLifetimes(duel.core);return card.uid;
}
function placeField(duel,seat,id){
 const card=takePhysical(duel,seat,id);
 duel.core.players[seat%2].field={...card,setTurn:0,faceUp:true,resolved:true};
 synchronizeCardLifetimes(duel.core);return card.uid;
}
function moveMonsterToGrave(duel,uid){
 for(let team=0;team<2;team++){
  const index=duel.core.players[team].monsters.findIndex(m=>m.uid===uid);
  if(index>=0){
   const [monster]=duel.core.players[team].monsters.splice(index,1);
   const owner=Number(/^m([0-3]):/.exec(uid)?.[1]??team);
   duel.core.players[owner%2].grave.push({uid:monster.uid,id:monster.id});
   synchronizeCardLifetimes(duel.core);return;
  }
 }
 throw new Error('Atacante não encontrado para mover ao Cemitério.');
}
function moveBackrowToGrave(duel,uid){
 for(let team=0;team<2;team++){
  const index=duel.core.players[team].backrow.findIndex(card=>card.uid===uid);
  if(index>=0){
   const [card]=duel.core.players[team].backrow.splice(index,1);
   const owner=Number(/^m([0-3]):/.exec(uid)?.[1]??team);
   duel.core.players[owner%2].grave.push({uid:card.uid,id:card.id});
   synchronizeCardLifetimes(duel.core);return;
  }
 }
 throw new Error('Armadilha não encontrada para mover ao Cemitério.');
}
function setAttackWindow(duel,attackerUid,attackerTeam=1,defenderTeam=0){
 duel.core.current=attackerTeam;duel.core.phase='response';duel.core.resume='battle';duel.core.priority=defenderTeam;duel.core.passes=0;
 duel.core.pending={kind:'attack',actor:attackerTeam,card:attackerUid,stage:'declare',cancelled:false};
 duel.cursor=duel.active[defenderTeam];duel.core.teamRotation.cursor=duel.cursor;
}
function makeAttack(effect='magic-cylinder'){
 const duel=makeDuel();
 const attackerUid=placeMonster(duel,1,attackerId);
 const fixtureIndex=effect==='magic-cylinder'?0:effect==='draining-shield'?1:2;
 const sourceUid=placeBackrow(duel,0,trapFixtures[fixtureIndex]);
 setAttackWindow(duel,attackerUid,1,0);
 return {session:adapter.createSession(duel),attackerUid,sourceUid,attackId:'attack-'+effect};
}
function activate(row,activationId='activation-1',actorSeat=0){
 return adapter.activate(row.session,{activationId,attackId:row.attackId,sourceUid:row.sourceUid,targetUid:row.attackerUid,actorSeat});
}
function resolve(row,activationId='activation-1',options={}){
 return adapter.resolve(row.session,activationId,options);
}

test('IDs, CIDs e limites de certificação são explícitos e não ativam cards importados',()=>{
 assert.equal(MAGIC_CYLINDER_ID,'62279055');
 assert.equal(DRAINING_SHIELD_ID,'43250041');
 assert.equal(NEGATE_ATTACK_ID,'14315573');
 assert.equal(getDuelCard(MAGIC_CYLINDER_ID),undefined);
 assert.equal(getDuelCard(DRAINING_SHIELD_ID),undefined);
 assert.equal(getDuelCard(NEGATE_ATTACK_ID),undefined);
 assert.equal(RULES_PROFILE.mainDeckMin,20);
 assert.equal(RULES_PROFILE.mainDeckMax,30);
 assert.equal(RULES_PROFILE.handLimit,6);
 assert.equal(RULES_PROFILE.handCheck,'end');
 assert.equal(RULES_PROFILE.monsterZones,3);
 assert.equal(RULES_PROFILE.spellTrapZones,3);
 assert.equal(RULES_PROFILE.extraDeckMax,5);
});

test('TagDuel preserva quatro assentos, duas equipes e Extra Deck 5',()=>{
 const duel=makeDuel(fusionIds.slice(0,5));
 const before=tagInventory(duel).map(card=>[card.uid,card.id]).sort();
 const session=adapter.createSession(duel);
 assert.equal(session.duel.members.length,4);
 assert.deepEqual(session.duel.active,[0,1]);
 assert.deepEqual(tagInventory(session.duel).map(card=>[card.uid,card.id]).sort(),before);
 assert.throws(()=>makeDuel(fusionIds.slice(0,6)),/Deck Adicional|máximo/i);
});

test('Deck Principal 20–30 e mão 6 só na End Phase',()=>{
 const duel=makeDuel();
 const short=structuredClone(duel);short.core.players[0].deck.pop();
 assert.throws(()=>adapter.createSession(short));
 const seven=structuredClone(duel);
 while(seven.core.players[0].hand.length<7)seven.core.players[0].hand.push(seven.core.players[0].deck.pop());
 assert.doesNotThrow(()=>adapter.createSession(seven));
});

test('Field Zone não consome uma das três Spell/Trap Zones',()=>{
 const duel=makeDuel();
 for(let i=0;i<3;i++)placeBackrow(duel,0,trapFixtures[i]);
 placeField(duel,0,fieldSpellId);
 assert.doesNotThrow(()=>adapter.createSession(duel));
 const fourth=structuredClone(duel);placeBackrow(fourth,0,counterTrapId);
 assert.throws(()=>adapter.createSession(fourth),/zona|Spell\/Trap/i);
});

test('Magic Cylinder nega o ataque e causa dano igual ao ATK atual do atacante',()=>{
 const row=makeAttack('magic-cylinder');activate(row);
 const attacker=row.session.duel.core.players[1].monsters.find(m=>m.uid===row.attackerUid);
 attacker.atkBoost=350;
 const expected=atk(attacker,row.session.duel.core),lp=row.session.duel.core.players[1].lp;
 const result=resolve(row);
 assert.equal(result.status,'attack-negated');
 assert.equal(result.attackNegated,true);
 assert.equal(result.endBattle,false);
 assert.equal(result.amount,expected);
 assert.equal(result.damageTeam,1);
 assert.equal(row.session.duel.core.players[1].lp,lp-expected);
 assert.equal(row.session.duel.core.pending.cancelled,true);
 assert.equal(row.session.duel.core.pending.endBattle,false);
 assert.equal(row.session.duel.core.players[0].grave.some(card=>card.uid===row.sourceUid),true);
});

test('Draining Shield nega o ataque e recupera LP igual ao ATK atual',()=>{
 const row=makeAttack('draining-shield');activate(row);
 const attacker=row.session.duel.core.players[1].monsters.find(m=>m.uid===row.attackerUid);
 attacker.atkBoost=250;
 const expected=atk(attacker,row.session.duel.core),lp=row.session.duel.core.players[0].lp;
 const result=resolve(row);
 assert.equal(result.status,'attack-negated');
 assert.equal(result.attackNegated,true);
 assert.equal(result.endBattle,false);
 assert.equal(result.amount,expected);
 assert.equal(result.gainTeam,0);
 assert.equal(row.session.duel.core.players[0].lp,lp+expected);
 assert.equal(row.session.duel.core.pending.cancelled,true);
});

test('Negate Attack nega o ataque e encerra a Battle Phase sem dano ou cura',()=>{
 const row=makeAttack('negate-attack');activate(row);
 const lp0=row.session.duel.core.players[0].lp,lp1=row.session.duel.core.players[1].lp;
 const result=resolve(row);
 assert.equal(result.status,'attack-negated');
 assert.equal(result.attackNegated,true);
 assert.equal(result.endBattle,true);
 assert.equal(result.amount,0);
 assert.equal(row.session.duel.core.pending.cancelled,true);
 assert.equal(row.session.duel.core.pending.endBattle,true);
 assert.equal(row.session.duel.core.players[0].lp,lp0);
 assert.equal(row.session.duel.core.players[1].lp,lp1);
});

test('Magic Cylinder causa dano e encerra o duelo se o LP do atacante zerar',()=>{
 const row=makeAttack('magic-cylinder');activate(row);
 row.session.duel.core.players[1].lp=100;
 const result=resolve(row);
 assert.equal(result.status,'attack-negated');
 assert.equal(row.session.duel.core.phase,'finished');
 assert.equal(row.session.duel.core.winner,row.session.duel.core.players[0].id);
 assert.equal(result.damageTeam,1);
});

test('Royal Decree permite a ativação, mas nega o efeito da Armadilha',()=>{
 const row=makeAttack('magic-cylinder');
 placeBackrow(row.session.duel,1,royalDecreeId,{faceUp:true,resolved:true});
 assert.doesNotThrow(()=>activate(row,'decree-response'));
 const result=resolve(row,'decree-response');
 assert.equal(result.status,'effect-negated');
 assert.equal(row.session.duel.core.pending.cancelled,false);
});

test('Jinzo impede ativação de Armadilha antes de qualquer resposta',()=>{
 const row=makeAttack('magic-cylinder');
 placeMonster(row.session.duel,1,jinzoId);
 assert.throws(()=>activate(row,'jinzo-block'),/bloqueada/i);
 assert.equal(row.session.duel.core.players[0].backrow.find(card=>card.uid===row.sourceUid).faceUp,false);
});

test('Armadilha baixada no turno atual não pode responder ao ataque',()=>{
 const row=makeAttack('magic-cylinder');
 row.session.duel.core.players[0].backrow.find(card=>card.uid===row.sourceUid).setTurn=1;
 assert.throws(()=>activate(row,'same-turn'),/turno anterior/i);
});

test('não responde ao próprio ataque nem fora da janela de declaração',()=>{
 const duel=makeDuel();
 const attackerUid=placeMonster(duel,1,attackerId);
 const sourceUid=placeBackrow(duel,1,trapFixtures[0]);
 setAttackWindow(duel,attackerUid,1,1);
 const own={session:adapter.createSession(duel),attackerUid,sourceUid,attackId:'own-attack'};
 assert.throws(()=>activate(own,'own-attack',1));
 const other=makeAttack('magic-cylinder');
 other.session.duel.core.pending.stage='damage';
 assert.throws(()=>activate(other,'damage-window'));
});

test('Spell Speed 2 não responde a uma Counter Trap, mas Negate Attack (Spell Speed 3) pode',()=>{
 const row=makeAttack('magic-cylinder');
 const counterUid=placeBackrow(row.session.duel,1,counterTrapId,{faceUp:true,resolved:false});
 row.session.duel.core.chain=[{actor:1,card:counterUid,id:counterTrapId,target:row.attackerUid}];
 assert.throws(()=>activate(row,'speed-two'),/Counter Trap/i);
 const counterResponse=makeAttack('negate-attack');
 const linkUid=placeBackrow(counterResponse.session.duel,1,counterTrapId,{faceUp:true,resolved:false});
 counterResponse.session.duel.core.chain=[{actor:1,card:linkUid,id:counterTrapId,target:counterResponse.attackerUid}];
 assert.doesNotThrow(()=>activate(counterResponse,'speed-three'));
});

test('alvo que deixa o campo antes da resolução invalida a resposta e envia a Armadilha ao Cemitério',()=>{
 const row=makeAttack('magic-cylinder');activate(row);
 moveMonsterToGrave(row.session.duel,row.attackerUid);
 const result=resolve(row);
 assert.equal(result.status,'target-left-field');
 assert.equal(row.session.duel.core.players[0].grave.some(card=>card.uid===row.sourceUid),true);
});

test('fonte que deixa o campo antes da resolução não produz dano nem cancela ataque',()=>{
 const row=makeAttack('magic-cylinder');activate(row);
 moveBackrowToGrave(row.session.duel,row.sourceUid);
 const result=resolve(row);
 assert.equal(result.status,'source-left-field');
 assert.equal(row.session.duel.core.pending.cancelled,false);
});

test('ataque já negado não gera dano nem cura adicionais',()=>{
 const row=makeAttack('draining-shield');activate(row);
 row.session.duel.core.pending.cancelled=true;
 const lp=row.session.duel.core.players[0].lp;
 const result=resolve(row);
 assert.equal(result.status,'attack-already-negated');
 assert.equal(row.session.duel.core.players[0].lp,lp);
});

test('negação de ativação ou de efeito não aplica dano/cura e envia a Armadilha ao Cemitério',()=>{
 const activation=makeAttack('magic-cylinder');activate(activation);
 const negated=resolve(activation,'activation-1',{activationNegated:true});
 assert.equal(negated.status,'activation-negated');
 assert.equal(activation.session.duel.core.pending.cancelled,false);
 const effect=makeAttack('draining-shield');activate(effect);
 const effectNegated=resolve(effect,'activation-1',{effectNegated:true});
 assert.equal(effectNegated.status,'effect-negated');
 assert.equal(effect.session.duel.core.pending.cancelled,false);
});

test('ativação e resolução são idempotentes e IDs não podem ser reutilizados com fatos diferentes',()=>{
 const row=makeAttack('magic-cylinder');
 const first=activate(row,'stable-id');
 assert.deepEqual(activate(row,'stable-id'),first);
 const result=resolve(row,'stable-id');
 assert.equal(resolve(row,'stable-id').replayed,true);
 assert.equal(result.status,'attack-negated');
 assert.throws(()=>adapter.activate(row.session,{activationId:'stable-id',attackId:'different',sourceUid:row.sourceUid,targetUid:row.attackerUid,actorSeat:0}),/reutilizado/i);
});

test('UID/epoch impede aplicar resposta a outro monstro que reutilize a zona',()=>{
 const row=makeAttack('magic-cylinder');activate(row);
 moveMonsterToGrave(row.session.duel,row.attackerUid);
 const replacement=placeMonster(row.session.duel,1,normalIds[0]);
 assert.notEqual(replacement,row.attackerUid);
 assert.equal(resolve(row).status,'target-left-field');
});

test('respostas não concedem cartas e preservam todos os UIDs e proprietários físicos',()=>{
 const row=makeAttack('draining-shield');
 const before=tagInventory(row.session.duel).map(card=>[card.uid,card.id]).sort();
 activate(row);resolve(row);
 assert.deepEqual(tagInventory(row.session.duel).map(card=>[card.uid,card.id]).sort(),before);
 assert.equal(row.session.duel.core.players[0].grave.some(card=>card.uid===row.sourceUid),true);
});

test('mão acima de seis durante a resolução não é descartada antecipadamente',()=>{
 const row=makeAttack('negate-attack');
 while(row.session.duel.core.players[0].hand.length<7)row.session.duel.core.players[0].hand.push(row.session.duel.core.players[0].deck.pop());
 assert.doesNotThrow(()=>adapter.createSession(row.session.duel));
 assert.equal(row.session.duel.core.phase,'response');
});
