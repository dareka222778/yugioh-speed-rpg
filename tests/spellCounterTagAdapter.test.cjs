'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagInventory}=require('../dist/tagDuel');
const {enabledCardIds,engineCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
 ROYAL_MAGICAL_LIBRARY_ID,SKILLED_DARK_MAGICIAN_ID,SKILLED_WHITE_MAGICIAN_ID,
 DARK_MAGICIAN_ID,BUSTER_BLADER_ID,createSpellCounterAdapter,assertSpellCounterRules
}=require('../dist/spellCounterTagAdapter');

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
assert.ok(enabledCardIds.includes(DARK_MAGICIAN_ID),'Dark Magician must be a certified fixture');
assert.ok(enabledCardIds.includes(BUSTER_BLADER_ID),'Buster Blader must be a certified fixture');
const sourcePool=unique('monster',20).filter(id=>id!==DARK_MAGICIAN_ID&&id!==BUSTER_BLADER_ID);
const sourceIds=sourcePool.slice(0,3);
const fillerMonsters=sourcePool.slice(3,6);
const fieldSpellId=enabledCardIds.find(id=>engineCard(id)?.kind==='spell'&&engineCard(id)?.field===true);
assert.ok(fieldSpellId,'a Field Spell fixture must be enabled');
const spellIds=unique('spell',10).filter(id=>id!==fieldSpellId).slice(0,5);
const trapIds=unique('trap',6);
const fusionIds=enabledCardIds.filter(id=>!!engineCard(id)?.fusion).slice(0,5);
assert.equal(sourceIds.length,3);
assert.equal(fillerMonsters.length,3);
assert.equal(spellIds.length,5);
assert.equal(trapIds.length,6);
assert.equal(fusionIds.length,5);
const deck=[DARK_MAGICIAN_ID,BUSTER_BLADER_ID,...sourceIds,...fillerMonsters,...spellIds,fieldSpellId,...trapIds];
assert.equal(deck.length,20);
assert.equal(new Set(deck).size,20);

const fixture={
 library:sourceIds[0],skilledDark:sourceIds[1],skilledWhite:sourceIds[2],
 darkMagician:DARK_MAGICIAN_ID,busterBlader:BUSTER_BLADER_ID
};
function lookup(id){
 if(id===fixture.library)return {kind:'monster',effect:'royal-library',name:'Royal Magical Library',atk:0,defense:2000,level:4};
 if(id===fixture.skilledDark)return {kind:'monster',effect:'skilled-dark',name:'Skilled Dark Magician',atk:1900,defense:1700,level:4};
 if(id===fixture.skilledWhite)return {kind:'monster',effect:'skilled-white',name:'Skilled White Magician',atk:1700,defense:1900,level:4};
 const card=engineCard(id);
 return card?{kind:card.kind,name:card.englishName||card.name,atk:card.atk,defense:card.defense,level:card.level}:undefined;
}
function setup(first=0,negated=new Set(),seed='m672-spell-counter'){
 const players=[0,1,2,3].map(seat=>({id:'m672-seat-'+seat,name:'M672 Seat '+seat,cards:[...deck],extra:[...fusionIds]}));
 const duel=createTagDuel(players,{classic:true,first,seed});
 const adapter=createSpellCounterAdapter(lookup,(_duel,uid)=>negated.has(uid));
 const session=adapter.createSession(duel);
 return {duel,adapter,session,negated};
}
function holder(duel,seat){
 const team=seat%2;
 return duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
}
function take(duel,seat,id){
 const held=holder(duel,seat);
 for(const zone of ['hand','deck','extra']){
  const list=held[zone]||[],index=list.findIndex(card=>card.id===id);
  if(index>=0)return list.splice(index,1)[0];
 }
 throw new Error('Fixture card not found: '+id);
}
function deploy(session,team,id,ownerSeat=session.duel.active[team],faceUp=true){
 const card=take(session.duel,ownerSeat,id),turn=session.duel.core.turn;
 const monster={...card,position:'atk',faceUp,entered:turn,lastSummonedTurn:turn,changed:turn,attacked:0,atkBoost:0,defBoost:0,owner:team};
 session.duel.core.players[team].monsters.push(monster);
 synchronizeCardLifetimes(session.duel.core);
 return monster;
}
function sendSpellToGrave(duel,seat,index){
 const card=take(duel,seat,spellIds[index]);
 duel.core.players[seat%2].grave.push(card);
 return card;
}
function resolveSpell(session,seat,index,flags={}){
 const card=sendSpellToGrave(session.duel,seat,index);
 return session.adapter.onSpellResolved(session.session,{
  eventId:flags.eventId||('spell-'+seat+'-'+index),
  spellUid:card.uid,spellId:card.id,activatingSeat:seat,activationZone:flags.activationZone||'hand',turn:session.duel.core.turn,
  resolved:flags.resolved===undefined?true:flags.resolved,
  ...(flags.activationNegated!==undefined?{activationNegated:flags.activationNegated}:{}),
  ...(flags.effectNegated!==undefined?{effectNegated:flags.effectNegated}:{})
 });
}
function fillCounters(session,uid,count=3,seat=session.duel.cursor){
 for(let i=0;i<count;i++)resolveSpell(session,seat,i);
 return session.adapter.counterCount(session.session,uid);
}
function setMain(duel,seat=duel.cursor){
 const team=seat%2;
 duel.cursor=seat;duel.active[team]=seat;duel.core.current=team;duel.core.priority=team;
 duel.core.phase='main';duel.core.resume='main';duel.core.pending={kind:'none'};duel.core.chain=[];
 duel.core.turnEnding=false;duel.core.choice=undefined;duel.core.damageStep=false;
}
function moveTargetToHand(duel,seat,id){
 const card=take(duel,seat,id);holder(duel,seat).hand.push(card);return card;
}
function moveTargetToDeck(duel,seat,id){
 const card=take(duel,seat,id);holder(duel,seat).deck.push(card);return card;
}
function moveTargetToTeamGrave(duel,seat,id){
 const card=take(duel,seat,id);duel.core.players[seat%2].grave.push(card);return card;
}
function inventory(duel){
 return new Map(tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]));
}
function assertInventoryUnchanged(before,duel){
 const after=inventory(duel);assert.equal(after.size,before.size);
 for(const [uid,id] of before)assert.equal(after.get(uid),id);
}
function prepareLibrary(first=0,ownerSeat=first){
 const setupState=setup(first),source=deploy(setupState,first%2,fixture.library,ownerSeat);
 fillCounters(setupState,source.uid,3,first);
 setMain(setupState.duel,first);
 return {...setupState,source};
}
function prepareSkilled(effect='dark',first=0,ownerSeat=first){
 const setupState=setup(first),id=effect==='dark'?fixture.skilledDark:fixture.skilledWhite;
 const source=deploy(setupState,first%2,id,ownerSeat);
 fillCounters(setupState,source.uid,3,first);
 setMain(setupState.duel,first);
 return {...setupState,source};
}

test('cada Magia só gera contador depois de resolver e alcança fontes das duas equipes',()=>{
 const s=setup(0),library=deploy(s,0,fixture.library,0),dark=deploy(s,1,fixture.skilledDark,1),white=deploy(s,0,fixture.skilledWhite,2);
 const before=inventory(s.duel);
 const result=resolveSpell(s,0,0);
 assert.deepEqual(new Set(result.addedUids),new Set([library.uid,dark.uid,white.uid]));
 resolveSpell(s,1,1);
 assert.equal(s.adapter.counterCount(s.session,library.uid),2);
 assert.equal(s.adapter.counterCount(s.session,dark.uid),2);
 assert.equal(s.adapter.counterCount(s.session,white.uid),2);
 assertInventoryUnchanged(before,s.duel);
});

test('ativação de Magia negada não gera contador; efeito negado após resolução ainda conta',()=>{
 const s=setup(0),library=deploy(s,0,fixture.library);
 resolveSpell(s,0,0,{resolved:false,activationNegated:true});
 assert.equal(s.adapter.counterCount(s.session,library.uid),0);
 resolveSpell(s,0,1,{effectNegated:true});
 assert.equal(s.adapter.counterCount(s.session,library.uid),1);
});

test('o contador respeita o máximo de três e não acumula acima do limite',()=>{
 const s=setup(0),library=deploy(s,0,fixture.library);
 fillCounters(s,library.uid,3,0);
 resolveSpell(s,0,3);
 resolveSpell(s,0,4);
 assert.equal(s.adapter.counterCount(s.session,library.uid),3);
});

test('evento repetido é idempotente e não concede um segundo contador',()=>{
 const s=setup(0),library=deploy(s,0,fixture.library),card=sendSpellToGrave(s.duel,0,0);
 const event={eventId:'spell-replay',spellUid:card.uid,spellId:card.id,activatingSeat:0,activationZone:'hand',turn:s.duel.core.turn,resolved:true};
 assert.equal(s.adapter.onSpellResolved(s.session,event).replayed,false);
 assert.equal(s.adapter.onSpellResolved(s.session,event).replayed,true);
 assert.equal(s.adapter.counterCount(s.session,library.uid),1);
 assert.throws(()=>s.adapter.onSpellResolved(s.session,{...event,spellId:spellIds[1]}),/conteúdo diferente/);
});

test('efeito de Magia ativado do Cemitério não é tratado como ativação de Card de Magia',()=>{
 const s=setup(0),library=deploy(s,0,fixture.library),card=sendSpellToGrave(s.duel,0,0);
 assert.throws(()=>s.adapter.onSpellResolved(s.session,{eventId:'spell-from-grave',spellUid:card.uid,spellId:card.id,activatingSeat:0,activationZone:'grave',turn:s.duel.core.turn,resolved:true}),/zona de ativação/);
 assert.equal(s.adapter.counterCount(s.session,library.uid),0);
});

test('fonte face-down não recebe contador',()=>{
 const s=setup(0),library=deploy(s,0,fixture.library,0,false);
 resolveSpell(s,0,0);
 assert.equal(s.adapter.counterCount(s.session,library.uid),0);
});

test('fonte com efeito negado não recebe novos contadores',()=>{
 const negated=new Set(),s=setup(0,negated),library=deploy(s,0,fixture.library);
 negated.add(library.uid);
 resolveSpell(s,0,0);
 assert.equal(s.adapter.counterCount(s.session,library.uid),0);
});

test('sair do campo remove contadores e retornar cria uma nova época sem herdar marcadores',()=>{
 const s=setup(0),library=deploy(s,0,fixture.library);
 fillCounters(s,library.uid,2,0);
 const field=s.duel.core.players[0].monsters;
 const index=field.findIndex(card=>card.uid===library.uid);
 const [card]=field.splice(index,1);s.duel.core.players[0].grave.push({uid:card.uid,id:card.id});
 synchronizeCardLifetimes(s.duel.core);
 s.duel.core.players[0].grave.splice(s.duel.core.players[0].grave.findIndex(item=>item.uid===card.uid),1);
 field.push(card);synchronizeCardLifetimes(s.duel.core);
 assert.equal(s.adapter.counterCount(s.session,library.uid),0);
});

test('a Biblioteca exige três marcadores antes de ativar',()=>{
 const s=setup(0),library=deploy(s,0,fixture.library);
 fillCounters(s,library.uid,2,0);setMain(s.duel,0);
 assert.throws(()=>s.adapter.activateLibraryDraw(s.session,{activationId:'lib-short',sourceUid:library.uid,actorSeat:0,turn:s.duel.core.turn}),/três/);
});

test('Biblioteca remove três marcadores como custo e compra para a mão privada do assento ativo',()=>{
 const s=prepareLibrary(0,2),activeHand=holder(s.duel,0).hand.length,partnerHand=holder(s.duel,2).hand.length;
 const before=inventory(s.duel);
 const activation=s.adapter.activateLibraryDraw(s.session,{activationId:'lib-draw',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 assert.equal(activation.costPaid,3);
 assert.equal(s.adapter.counterCount(s.session,s.source.uid),0);
 const result=s.adapter.resolveLibraryDraw(s.session,{activationId:'lib-draw'});
 assert.equal(result.status,'drawn');assert.ok(result.drawnUid);
 assert.equal(holder(s.duel,0).hand.length,activeHand+1);
 assert.equal(holder(s.duel,2).hand.length,partnerHand);
 assertInventoryUnchanged(before,s.duel);
});

test('a negação do efeito da Biblioteca não devolve os três marcadores pagos',()=>{
 const s=prepareLibrary(),hand=holder(s.duel,0).hand.length;
 s.adapter.activateLibraryDraw(s.session,{activationId:'lib-negated',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveLibraryDraw(s.session,{activationId:'lib-negated',effectNegated:true});
 assert.equal(result.status,'effect-negated');assert.equal(s.adapter.counterCount(s.session,s.source.uid),0);
 assert.equal(holder(s.duel,0).hand.length,hand);
});

test('Biblioteca resolve mesmo se a fonte sair do campo após ativar',()=>{
 const s=prepareLibrary(),before=holder(s.duel,0).hand.length;
 s.adapter.activateLibraryDraw(s.session,{activationId:'lib-source-left',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 const field=s.duel.core.players[0].monsters,index=field.findIndex(card=>card.uid===s.source.uid);
 const [source]=field.splice(index,1);s.duel.core.players[0].grave.push({uid:source.uid,id:source.id});
 synchronizeCardLifetimes(s.duel.core);
 const result=s.adapter.resolveLibraryDraw(s.session,{activationId:'lib-source-left'});
 assert.equal(result.status,'drawn');assert.equal(holder(s.duel,0).hand.length,before+1);
});

test('Biblioteca paga o custo mesmo quando a ativação é negada',()=>{
 const s=prepareLibrary();
 s.adapter.activateLibraryDraw(s.session,{activationId:'lib-activation-negated',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveLibraryDraw(s.session,{activationId:'lib-activation-negated',activationNegated:true});
 assert.equal(result.status,'activation-negated');assert.equal(s.adapter.counterCount(s.session,s.source.uid),0);
});

test('Biblioteca sem Deck não cria carta nem altera inventário',()=>{
 const s=prepareLibrary(),deck=holder(s.duel,0).deck,grave=s.duel.core.players[0].grave;
 grave.push(...deck.splice(0,deck.length));
 const before=inventory(s.duel);
 s.adapter.activateLibraryDraw(s.session,{activationId:'lib-empty',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveLibraryDraw(s.session,{activationId:'lib-empty'});
 assert.equal(result.status,'deck-empty');assertInventoryUnchanged(before,s.duel);
});

test('a mão pode passar de seis durante a resolução; o descarte continua reservado à End Phase',()=>{
 const s=prepareLibrary(),hand=holder(s.duel,0).hand,deck=holder(s.duel,0).deck;
 while(hand.length<7)hand.push(deck.shift());
 const before=inventory(s.duel);
 s.adapter.activateLibraryDraw(s.session,{activationId:'lib-overflow',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 s.adapter.resolveLibraryDraw(s.session,{activationId:'lib-overflow'});
 assert.equal(hand.length,8);assertInventoryUnchanged(before,s.duel);
});

test('Skilled Dark Magician tributa a si mesmo e Invoca Dark Magician da mão do assento ativo',()=>{
 const s=prepareSkilled('dark',0,2),target=moveTargetToHand(s.duel,0,fixture.darkMagician),before=inventory(s.duel);
 s.adapter.activateSkilledSummon(s.session,{activationId:'dark-hand',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 assert.ok(s.duel.core.players[0].grave.some(card=>card.uid===s.source.uid));
 const result=s.adapter.resolveSkilledSummon(s.session,{activationId:'dark-hand',targetUid:target.uid});
 assert.equal(result.status,'summoned');assert.equal(result.targetFrom,'hand');
 assert.ok(s.duel.core.players[0].monsters.some(card=>card.uid===target.uid&&card.id===fixture.darkMagician));
 assertInventoryUnchanged(before,s.duel);
});

test('Skilled Dark Magician pode Invocar Dark Magician do Deck físico do assento ativo',()=>{
 const s=prepareSkilled('dark'),target=moveTargetToDeck(s.duel,0,fixture.darkMagician);
 s.adapter.activateSkilledSummon(s.session,{activationId:'dark-deck',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveSkilledSummon(s.session,{activationId:'dark-deck',targetUid:target.uid});
 assert.equal(result.status,'summoned');assert.equal(result.targetFrom,'deck');
});

test('Skilled White Magician pode Invocar Buster Blader do Cemitério compartilhado do parceiro',()=>{
 const s=prepareSkilled('white',0,0),target=moveTargetToTeamGrave(s.duel,2,fixture.busterBlader);
 s.adapter.activateSkilledSummon(s.session,{activationId:'white-partner-grave',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveSkilledSummon(s.session,{activationId:'white-partner-grave',targetUid:target.uid});
 assert.equal(result.status,'summoned');assert.equal(result.targetFrom,'grave');
 assert.ok(s.duel.core.players[0].monsters.some(card=>card.uid===target.uid));
 assert.match(target.uid,/^m2:/);
});

test('Mago Habilidoso não acessa a mão privada do parceiro',()=>{
 const s=prepareSkilled('white'),target=moveTargetToHand(s.duel,2,fixture.busterBlader);
 s.adapter.activateSkilledSummon(s.session,{activationId:'white-partner-hand',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveSkilledSummon(s.session,{activationId:'white-partner-hand',targetUid:target.uid});
 assert.equal(result.status,'no-target');
 assert.ok(holder(s.duel,2).hand.some(card=>card.uid===target.uid));
});

test('Mago Habilidoso não acessa o Cemitério da equipe adversária',()=>{
 const s=prepareSkilled('dark'),target=moveTargetToTeamGrave(s.duel,1,fixture.darkMagician);
 s.adapter.activateSkilledSummon(s.session,{activationId:'dark-opponent-grave',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveSkilledSummon(s.session,{activationId:'dark-opponent-grave',targetUid:target.uid});
 assert.equal(result.status,'no-target');
 assert.ok(s.duel.core.players[1].grave.some(card=>card.uid===target.uid));
});

test('a falta de espaço após o custo não ultrapassa as três Monster Zones',()=>{
 const s=prepareSkilled('dark'),extra1=deploy(s,0,fillerMonsters[0]),extra2=deploy(s,0,fillerMonsters[1]);
 const target=moveTargetToHand(s.duel,0,fixture.darkMagician);
 s.adapter.activateSkilledSummon(s.session,{activationId:'dark-full-zone',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 deploy(s,0,fillerMonsters[2]);
 assert.equal(s.duel.core.players[0].monsters.length,3);
 const result=s.adapter.resolveSkilledSummon(s.session,{activationId:'dark-full-zone',targetUid:target.uid});
 assert.equal(result.status,'zone-full');assert.equal(s.duel.core.players[0].monsters.length,3);
 assert.ok(holder(s.duel,0).hand.some(card=>card.uid===target.uid));
 assert.ok(extra1.uid&&extra2.uid);
});

test('a negação do efeito do Mago Habilidoso não devolve o Tributo nem os marcadores',()=>{
 const s=prepareSkilled('dark'),target=moveTargetToHand(s.duel,0,fixture.darkMagician);
 s.adapter.activateSkilledSummon(s.session,{activationId:'dark-negated',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveSkilledSummon(s.session,{activationId:'dark-negated',targetUid:target.uid,effectNegated:true});
 assert.equal(result.status,'effect-negated');
 assert.ok(s.duel.core.players[0].grave.some(card=>card.uid===s.source.uid));
 assert.ok(holder(s.duel,0).hand.some(card=>card.uid===target.uid));
});

test('a ativação negada do Mago Habilidoso mantém o Tributo já pago',()=>{
 const s=prepareSkilled('white'),target=moveTargetToHand(s.duel,0,fixture.busterBlader);
 s.adapter.activateSkilledSummon(s.session,{activationId:'white-activation-negated',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveSkilledSummon(s.session,{activationId:'white-activation-negated',targetUid:target.uid,activationNegated:true});
 assert.equal(result.status,'activation-negated');
 assert.ok(s.duel.core.players[0].grave.some(card=>card.uid===s.source.uid));
});

test('sem alvo legal, o Mago Habilidoso não revela mãos de outros assentos',()=>{
 const s=prepareSkilled('dark');
 s.adapter.activateSkilledSummon(s.session,{activationId:'dark-no-target',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 const result=s.adapter.resolveSkilledSummon(s.session,{activationId:'dark-no-target'});
 assert.equal(result.status,'no-target');
});

test('o Tributo conserva a propriedade física do parceiro que controla a fonte',()=>{
 const s=prepareSkilled('dark',0,2);
 s.adapter.activateSkilledSummon(s.session,{activationId:'dark-owner-partner',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 const grave=s.duel.core.players[0].grave.find(card=>card.uid===s.source.uid);
 assert.ok(grave);assert.match(grave.uid,/^m2:/);
});

test('a Biblioteca pode ser usada pelo assento ativo sobre a cópia física do parceiro',()=>{
 const s=prepareLibrary(0,2),beforeActive=holder(s.duel,0).hand.length,beforePartner=holder(s.duel,2).hand.length;
 s.adapter.activateLibraryDraw(s.session,{activationId:'lib-partner-owned',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 s.adapter.resolveLibraryDraw(s.session,{activationId:'lib-partner-owned'});
 assert.equal(holder(s.duel,0).hand.length,beforeActive+1);
 assert.equal(holder(s.duel,2).hand.length,beforePartner);
});

test('ativação da Biblioteca repetida não paga os marcadores duas vezes',()=>{
 const s=prepareLibrary();
 const input={activationId:'lib-idempotent',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn};
 assert.equal(s.adapter.activateLibraryDraw(s.session,input).replayed,false);
 assert.equal(s.adapter.activateLibraryDraw(s.session,input).replayed,true);
 assert.equal(s.adapter.counterCount(s.session,s.source.uid),0);
});

test('ativação do Mago Habilidoso repetida não tributa uma segunda carta',()=>{
 const s=prepareSkilled('dark'),before=inventory(s.duel);
 const input={activationId:'dark-idempotent',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn};
 assert.equal(s.adapter.activateSkilledSummon(s.session,input).replayed,false);
 assert.equal(s.adapter.activateSkilledSummon(s.session,input).replayed,true);
 assertInventoryUnchanged(before,s.duel);
 assert.equal(s.duel.core.players[0].grave.filter(card=>card.uid===s.source.uid).length,1);
});

test('resolução repetida de Invocação-Especial é idempotente',()=>{
 const s=prepareSkilled('white'),target=moveTargetToHand(s.duel,0,fixture.busterBlader);
 s.adapter.activateSkilledSummon(s.session,{activationId:'white-replay',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 const input={activationId:'white-replay',targetUid:target.uid};
 assert.equal(s.adapter.resolveSkilledSummon(s.session,input).replayed,false);
 assert.equal(s.adapter.resolveSkilledSummon(s.session,input).replayed,true);
 assert.equal(s.duel.core.players[0].monsters.filter(card=>card.uid===target.uid).length,1);
});

test('regras físicas preservam Deck 20–30, Extra 5, zonas 3+3 e Field Zone separada',()=>{
 const s=setup(0);
 assertSpellCounterRules(s.duel);
 assert.equal(s.duel.core.players[0].extra.length,5);
 const fieldCard=take(s.duel,0,fieldSpellId);
 s.duel.core.players[0].field={...fieldCard,setTurn:0,faceUp:true};
 for(const id of spellIds.slice(1,4)){
  const card=take(s.duel,0,id);s.duel.core.players[0].backrow.push({...card,setTurn:0,faceUp:false});
 }
 assertSpellCounterRules(s.duel);
});

test('o adapter não concede inventário e mantém UIDs após contador, compra e Invocação',()=>{
 const s=prepareSkilled('dark'),target=moveTargetToHand(s.duel,0,fixture.darkMagician),before=inventory(s.duel);
 resolveSpell(s,0,3);
 s.adapter.activateSkilledSummon(s.session,{activationId:'dark-conservation',sourceUid:s.source.uid,actorSeat:0,turn:s.duel.core.turn});
 s.adapter.resolveSkilledSummon(s.session,{activationId:'dark-conservation',targetUid:target.uid});
 assertInventoryUnchanged(before,s.duel);
});
