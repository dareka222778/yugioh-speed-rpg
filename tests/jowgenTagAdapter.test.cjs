'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagInventory}=require('../dist/tagDuel');
const {enabledCardIds,engineCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {createJowgenAdapter,assertJowgenRules,JOWGEN_THE_SPIRITUALIST_ID}=require('../dist/jowgenTagAdapter');

function unique(kind,count){
 const seen=new Set();
 return enabledCardIds.filter(id=>{
  const card=engineCard(id);if(!card||card.kind!==kind||card.fusion)return false;
  const name=card.englishName||card.name;if(seen.has(name))return false;seen.add(name);return true;
 }).slice(0,count);
}
const fieldSpellId=enabledCardIds.find(id=>engineCard(id)?.kind==='spell'&&engineCard(id)?.field===true);
assert.ok(fieldSpellId,'a Field Spell fixture must be enabled');
const spellIds=unique('spell',10).filter(id=>id!==fieldSpellId).slice(0,5);
const trapIds=unique('trap',6);
const monsterPool=unique('monster',24);
const jowgenFixture=monsterPool[0];
const specialFixture=monsterPool[1];
const normalFixture=monsterPool[2];
const otherMonsters=monsterPool.slice(3,8);
const fillerFixtures=otherMonsters.slice(0,3);
const fusionIds=enabledCardIds.filter(id=>!!engineCard(id)?.fusion).slice(0,5);
assert.equal(spellIds.length,5);assert.equal(trapIds.length,6);assert.equal(fillerFixtures.length,3);assert.equal(fusionIds.length,5);
const deck=[jowgenFixture,specialFixture,normalFixture,...otherMonsters,spellIds[0],spellIds[1],spellIds[2],spellIds[3],spellIds[4],fieldSpellId,...trapIds];
assert.equal(deck.length,20);assert.equal(new Set(deck).size,20);

function lookup(id){
 if(id===jowgenFixture||id===JOWGEN_THE_SPIRITUALIST_ID)return {kind:'monster',effect:'jowgen',name:'Jowgen the Spiritualist'};
 const card=engineCard(id);return card?{kind:card.kind,name:card.englishName||card.name}:undefined;
}
function setup(first=0,negated=new Set(),randomIndex=length=>0,seed='m673-jowgen'){
 const players=[0,1,2,3].map(seat=>({id:'m673-seat-'+seat,name:'M673 Seat '+seat,cards:[...deck],extra:[...fusionIds]}));
 const duel=createTagDuel(players,{classic:true,first,seed});
 const adapter=createJowgenAdapter(lookup,(_duel,uid)=>negated.has(uid),randomIndex);
 const session=adapter.createSession(duel);
 return {duel,adapter,session,negated};
}
function holder(duel,seat){
 const team=seat%2;return duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
}
function take(duel,seat,id){
 const held=holder(duel,seat);
 for(const zone of ['hand','deck','extra']){
  const list=held[zone]||[],index=list.findIndex(card=>card.id===id);
  if(index>=0)return list.splice(index,1)[0];
 }
 throw new Error('Fixture card not found: '+id);
}
function deploy(s,team,id,ownerSeat=s.duel.active[team],faceUp=true){
 const card=take(s.duel,ownerSeat,id),turn=s.duel.core.turn;
 const monster={...card,position:'atk',faceUp,entered:turn,lastSummonedTurn:turn,changed:turn,attacked:0,attackCount:0,atkBoost:0,defBoost:0,owner:team};
 s.duel.core.players[team].monsters.push(monster);synchronizeCardLifetimes(s.duel.core);return monster;
}
function setMain(duel,seat=duel.cursor){
 const team=seat%2;duel.cursor=seat;duel.active[team]=seat;duel.core.current=team;duel.core.priority=team;
 duel.core.phase='main';duel.core.resume='main';duel.core.pending={kind:'none'};duel.core.chain=[];
 duel.core.turnEnding=false;duel.core.choice=undefined;duel.core.damageStep=false;
}
function record(s,monster,method='special',eventId='summon-'+monster.uid){
 return s.adapter.recordMonsterSummon(s.session,{eventId,uid:monster.uid,turn:s.duel.core.turn,method});
}
function handCard(s,seat,index=0){
 const hand=holder(s.duel,seat).hand;
 if(!hand.length)throw new Error('Fixture hand is empty');
 return hand[index];
}
function inventory(duel){
 return new Map(tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]));
}
function assertInventoryUnchanged(before,duel){
 const after=inventory(duel);assert.equal(after.size,before.size);
 for(const [uid,id] of before)assert.equal(after.get(uid),id);
}
function prepareJowgen(ownerSeat=0,randomIndex=length=>0){
 const s=setup(0,new Set(),randomIndex),jowgen=deploy(s,0,jowgenFixture,ownerSeat);
 setMain(s.duel,0);return {...s,jowgen};
}

test('Jowgen face-up bloqueia Invocação-Especial para as duas equipes',()=>{
 const s=prepareJowgen(0);
 assert.equal(s.adapter.canSpecialSummon(s.duel),false);
 assert.equal(s.adapter.canSpecialSummon(s.duel),false);
});

test('Jowgen face-down não bloqueia Invocação-Especial',()=>{
 const s=setup(0),jowgen=deploy(s,0,jowgenFixture,0,false);
 assert.equal(s.adapter.canSpecialSummon(s.duel),true);
 assert.ok(jowgen);
});

test('Jowgen com efeito negado não bloqueia Invocação-Especial',()=>{
 const negated=new Set(),s=setup(0,negated),jowgen=deploy(s,0,jowgenFixture);
 negated.add(jowgen.uid);
 assert.equal(s.adapter.canSpecialSummon(s.duel),true);
});

test('remover Jowgen do campo encerra o bloqueio contínuo',()=>{
 const s=prepareJowgen(),field=s.duel.core.players[0].monsters,index=field.findIndex(card=>card.uid===s.jowgen.uid);
 field.splice(index,1);synchronizeCardLifetimes(s.duel.core);
 assert.equal(s.adapter.canSpecialSummon(s.duel),true);
});

test('registro de Invocação distingue normal de especial e é idempotente',()=>{
 const s=setup(0),normal=deploy(s,0,normalFixture),special=deploy(s,1,specialFixture,1);
 assert.equal(record(s,normal,'normal','normal-event').replayed,false);
 assert.equal(record(s,special,'special','special-event').replayed,false);
 assert.ok(!s.session.specialSummons[normal.uid]);
 assert.ok(s.session.specialSummons[special.uid]);
 assert.equal(record(s,special,'special','special-event').replayed,true);
 assert.throws(()=>record(s,special,'normal','special-event'),/conteúdo diferente/);
});

test('o custo aleatório sai da mão privada do assento ativo, não da mão do parceiro',()=>{
 const s=prepareJowgen(2,length=>length-1),activeHand=[...holder(s.duel,0).hand],partnerHand=[...holder(s.duel,2).hand];
 const before=inventory(s.duel);
 const result=s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-private-cost',sourceUid:s.jowgen.uid,actorSeat:0,turn:s.duel.core.turn});
 assert.equal(result.costPaid,true);
 assert.equal(result.privateDiscardedUid,activeHand.at(-1).uid);
 assert.equal(holder(s.duel,0).hand.length,activeHand.length-1);
 assert.deepEqual(holder(s.duel,2).hand.map(card=>card.uid),partnerHand.map(card=>card.uid));
 assert.ok(s.duel.core.players[0].grave.some(card=>card.uid===result.privateDiscardedUid));
 assertInventoryUnchanged(before,s.duel);
});

test('Jowgen destrói especiais das duas equipes e preserva monstros Invocados-Normalmente',()=>{
 const s=prepareJowgen(),special0=deploy(s,0,specialFixture,0),special1=deploy(s,1,fillerFixtures[0],1),normal=deploy(s,0,normalFixture,0);
 record(s,special0,'special','special-team0');record(s,special1,'special','special-team1');record(s,normal,'normal','normal-team0');
 const result=s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-global-wipe',sourceUid:s.jowgen.uid,actorSeat:0,turn:s.duel.core.turn});
 const resolved=s.adapter.resolveJowgenWipe(s.session,{activationId:'jowgen-global-wipe'});
 assert.equal(resolved.status,'destroyed');
 assert.deepEqual(new Set(resolved.destroyedUids),new Set([special0.uid,special1.uid]));
 assert.ok(s.duel.core.players[0].monsters.some(card=>card.uid===normal.uid));
 assert.ok(s.duel.core.players[0].grave.some(card=>card.uid===special0.uid));
 assert.ok(s.duel.core.players[1].grave.some(card=>card.uid===special1.uid));
 assert.equal(result.privateDiscardedUid,resolved.privateDiscardedUid);
});

test('monstro especial face-down também é destruído',()=>{
 const s=prepareJowgen(),special=deploy(s,1,specialFixture,1,false);
 record(s,special,'special','special-face-down');
 const activation=s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-face-down',sourceUid:s.jowgen.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveJowgenWipe(s.session,{activationId:'jowgen-face-down'});
 assert.ok(result.destroyedUids.includes(special.uid));
 assert.ok(activation.privateDiscardedUid);
});

test('Jowgen Invocado-Especialmente também é destruído pelo próprio efeito',()=>{
 const s=setup(0),jowgen=deploy(s,0,jowgenFixture);
 record(s,jowgen,'special','jowgen-special-self');
 setMain(s.duel,0);
 s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-self',sourceUid:jowgen.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveJowgenWipe(s.session,{activationId:'jowgen-self'});
 assert.ok(result.destroyedUids.includes(jowgen.uid));
 assert.ok(s.duel.core.players[0].grave.some(card=>card.uid===jowgen.uid));
 assert.equal(s.adapter.canSpecialSummon(s.duel),true);
});

test('efeito negado mantém o descarte pago e não destrói monstros',()=>{
 const s=prepareJowgen(),special=deploy(s,1,specialFixture,1);record(s,special,'special','special-negated');
 const handBefore=holder(s.duel,0).hand.length;
 s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-effect-negated',sourceUid:s.jowgen.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveJowgenWipe(s.session,{activationId:'jowgen-effect-negated',effectNegated:true});
 assert.equal(result.status,'effect-negated');
 assert.equal(holder(s.duel,0).hand.length,handBefore-1);
 assert.ok(s.duel.core.players[1].monsters.some(card=>card.uid===special.uid));
});

test('ativação negada mantém o descarte pago e não destrói monstros',()=>{
 const s=prepareJowgen(),special=deploy(s,1,specialFixture,1);record(s,special,'special','special-activation-negated');
 s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-activation-negated',sourceUid:s.jowgen.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveJowgenWipe(s.session,{activationId:'jowgen-activation-negated',activationNegated:true});
 assert.equal(result.status,'activation-negated');
 assert.ok(s.duel.core.players[1].monsters.some(card=>card.uid===special.uid));
});

test('sem monstros especiais, o custo ainda é pago e a resolução é válida',()=>{
 const s=prepareJowgen(),handBefore=holder(s.duel,0).hand.length;
 s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-no-targets',sourceUid:s.jowgen.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveJowgenWipe(s.session,{activationId:'jowgen-no-targets'});
 assert.equal(result.status,'resolved');assert.deepEqual(result.destroyedUids,[]);
 assert.equal(holder(s.duel,0).hand.length,handBefore-1);
});

test('mão vazia impede a ativação sem gerar carta ou inventário',()=>{
 const s=prepareJowgen(),held=holder(s.duel,0),grave=s.duel.core.players[0].grave;
 grave.push(...held.hand.splice(0,held.hand.length));
 const before=inventory(s.duel);
 assert.throws(()=>s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-empty-hand',sourceUid:s.jowgen.uid,actorSeat:0,turn:s.duel.core.turn}),/mão privada/);
 assertInventoryUnchanged(before,s.duel);
});

test('efeito de Jowgen negado não pode ser ativado',()=>{
 const negated=new Set(),s=setup(0,negated),jowgen=deploy(s,0,jowgenFixture);
 negated.add(jowgen.uid);setMain(s.duel,0);
 assert.throws(()=>s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-source-negated',sourceUid:jowgen.uid,actorSeat:0,turn:s.duel.core.turn}),/negado/);
});

test('cópia física de Jowgen pertencente ao parceiro pode ser usada pela equipe ativa',()=>{
 const s=prepareJowgen(2),special=deploy(s,1,specialFixture,1);record(s,special,'special','special-opponent');
 const result=s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-partner-source',sourceUid:s.jowgen.uid,actorSeat:0,turn:s.duel.core.turn});
 assert.match(s.jowgen.uid,/^m2:/);assert.match(result.privateDiscardedUid,/^m0:/);
});

test('Jowgen continua resolvendo depois de sair do campo após ativar',()=>{
 const s=prepareJowgen(),special=deploy(s,1,specialFixture,1);record(s,special,'special','special-source-left');
 s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-left',sourceUid:s.jowgen.uid,actorSeat:0,turn:s.duel.core.turn});
 const field=s.duel.core.players[0].monsters,index=field.findIndex(card=>card.uid===s.jowgen.uid);
 const [card]=field.splice(index,1);s.duel.core.players[0].grave.push({uid:card.uid,id:card.id});
 synchronizeCardLifetimes(s.duel.core);
 const result=s.adapter.resolveJowgenWipe(s.session,{activationId:'jowgen-left'});
 assert.ok(result.destroyedUids.includes(special.uid));
});

test('histórico de especial é invalidado quando a instância sai e retorna em nova época',()=>{
 const s=setup(0),special=deploy(s,0,specialFixture);record(s,special,'special','special-epoch-one');
 const field=s.duel.core.players[0].monsters,index=field.findIndex(card=>card.uid===special.uid);
 const [card]=field.splice(index,1);s.duel.core.players[0].grave.push({uid:card.uid,id:card.id});
 synchronizeCardLifetimes(s.duel.core);
 s.duel.core.players[0].grave.splice(s.duel.core.players[0].grave.findIndex(item=>item.uid===card.uid),1);
 field.push(card);synchronizeCardLifetimes(s.duel.core);
 const before=inventory(s.duel);
 setMain(s.duel,0);
 s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-stale-history',sourceUid:deploy(s,0,jowgenFixture).uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveJowgenWipe(s.session,{activationId:'jowgen-stale-history'});
 assert.ok(!result.destroyedUids.includes(special.uid));
 assertInventoryUnchanged(before,s.duel);
});

test('ativação repetida não descarta duas cartas',()=>{
 const s=prepareJowgen(),handBefore=holder(s.duel,0).hand.length;
 const input={activationId:'jowgen-idempotent',sourceUid:s.jowgen.uid,actorSeat:0,turn:s.duel.core.turn};
 assert.equal(s.adapter.activateJowgenWipe(s.session,input).replayed,false);
 assert.equal(s.adapter.activateJowgenWipe(s.session,input).replayed,true);
 assert.equal(holder(s.duel,0).hand.length,handBefore-1);
});

test('resolução repetida é idempotente e replay divergente é rejeitado',()=>{
 const s=prepareJowgen(),special=deploy(s,1,specialFixture,1);record(s,special,'special','special-replay');
 s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-replay',sourceUid:s.jowgen.uid,actorSeat:0,turn:s.duel.core.turn});
 const input={activationId:'jowgen-replay'};
 assert.equal(s.adapter.resolveJowgenWipe(s.session,input).replayed,false);
 assert.equal(s.adapter.resolveJowgenWipe(s.session,input).replayed,true);
 assert.throws(()=>s.adapter.resolveJowgenWipe(s.session,{...input,effectNegated:true}),/resultado diferente/);
});

test('sessão pode recuperar histórico de monstros especiais persistido',()=>{
 const s=setup(0),special=deploy(s,1,specialFixture,1);
 const recovered=s.adapter.createSession(s.duel,[special.uid]);
 assert.ok(recovered.specialSummons[special.uid]);
});

test('Deck 20–30, mão 6 apenas na End Phase, zonas 3+3, Field Zone separada e Extra 5 são preservados',()=>{
 const s=setup(0);assertJowgenRules(s.duel);assert.equal(s.duel.core.players[0].extra.length,5);
 const field=take(s.duel,0,fieldSpellId);
 s.duel.core.players[0].field={...field,setTurn:0,faceUp:true};
 for(const id of spellIds.slice(0,3)){
  const card=take(s.duel,0,id);s.duel.core.players[0].backrow.push({...card,setTurn:0,faceUp:false});
 }
 assertJowgenRules(s.duel);
 const hand=holder(s.duel,0).hand,deck=holder(s.duel,0).deck;
 while(hand.length<7)hand.push(deck.shift());
 assertJowgenRules(s.duel);
});

test('nenhum efeito concede cartas; UIDs e inventário permanecem conservados',()=>{
 const s=prepareJowgen(),special=deploy(s,1,specialFixture,1);record(s,special,'special','special-conservation');
 const before=inventory(s.duel);
 s.adapter.activateJowgenWipe(s.session,{activationId:'jowgen-conservation',sourceUid:s.jowgen.uid,actorSeat:0,turn:s.duel.core.turn});
 s.adapter.resolveJowgenWipe(s.session,{activationId:'jowgen-conservation'});
 assertInventoryUnchanged(before,s.duel);
});
