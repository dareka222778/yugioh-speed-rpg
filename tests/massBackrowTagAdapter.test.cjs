'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagInventory,tagNormalCardIds}=require('../dist/tagDuel');
const {enabledCardIds,getDuelCard,getEffect,engineCard,getPlayableCard,getCardStatus}=require('../dist/effectRegistry');
const {
 HARPIES_FEATHER_DUSTER_ID,HEAVY_STORM_ID,GIANT_TRUNADE_ID,
 createMassBackrowAdapter,assertMassBackrowRules
}=require('../dist/massBackrowTagAdapter');

function unique(kind,count){
 const seen=new Set();
 return enabledCardIds.filter(id=>{
  const card=getDuelCard(id);if(!card||card.kind!==kind||card.fusion)return false;
  const name=card.englishName||card.name;if(seen.has(name))return false;seen.add(name);return true;
 }).slice(0,count);
}
const deck=tagNormalCardIds.slice(0,20);
const fixtureSpells=unique('spell',10).filter(id=>getDuelCard(id)?.field!==true).slice(0,7);
const fixtureTraps=unique('trap',8);
const fieldSpellId=enabledCardIds.find(id=>getDuelCard(id)?.kind==='spell'&&getDuelCard(id)?.field===true);
const fusionIds=enabledCardIds.filter(id=>!!getDuelCard(id)?.fusion).slice(0,5);
assert.equal(deck.length,20);assert.ok(fixtureSpells.length>=7);assert.ok(fixtureTraps.length>=4);
assert.ok(fieldSpellId);assert.equal(fusionIds.length,5);

const sourceIds={
 'harpie-feather-duster':fixtureSpells[0],
 'heavy-storm':fixtureSpells[1],
 'giant-trunade':fixtureSpells[2]
};
const sourceEffects=Object.fromEntries(Object.entries(sourceIds).map(([effect,id])=>[id,effect]));
function lookup(id){
 if(sourceEffects[id])return {kind:'spell',effect:sourceEffects[id]};
 const card=getDuelCard(id);return card?{kind:card.kind}:undefined;
}
function makeDuel(first=0){
 const players=[0,1,2,3].map(seat=>({
  id:'m674-seat-'+seat,name:'M674 Seat '+seat,cards:[...deck],extra:[...fusionIds]
 }));
 const duel=createTagDuel(players,{seed:'m674-mass-backrow',first,classic:true});
 duel.core.turn=3;duel.cursor=first;duel.active[first%2]=first;
 duel.core.current=first%2;duel.core.priority=first%2;duel.core.phase='main';duel.core.resume='main';
 duel.core.pending={kind:'none'};duel.core.chain=[];duel.core.passes=0;duel.core.damageStep=false;
 duel.core.turnEnding=false;duel.core.handFlow=undefined;duel.core.choice=undefined;
 return duel;
}
function privateZone(duel,seat,zone){
 const team=seat%2;return duel.active[team]===seat?duel.core.players[team][zone]:duel.reserves[String(seat)][zone];
}
function takeHand(duel,seat,id){
 const hand=privateZone(duel,seat,'hand'),card=hand.shift();
 assert.ok(card,'fixture needs a card in the physical hand');card.id=id;return card;
}
function putHandCard(duel,seat,id){
 const card=privateZone(duel,seat,'hand')[0];
 assert.ok(card,'fixture needs a card in the physical hand');card.id=id;return card.uid;
}
function placeBackrow(duel,ownerSeat,controllerTeam,id,faceUp=false){
 const card=takeHand(duel,ownerSeat,id);
 duel.core.players[controllerTeam].backrow.push({...card,faceUp,setTurn:0});
 return card.uid;
}
function placeField(duel,ownerSeat,controllerTeam,id,faceUp=true){
 const card=takeHand(duel,ownerSeat,id);
 duel.core.players[controllerTeam].field={...card,faceUp,setTurn:0};
 return card.uid;
}
function inventory(duel){
 return tagInventory(duel).filter(card=>card.entityKind!=='token')
  .map(card=>card.uid+'|'+card.id).sort();
}
function setup(effect,options={}){
 const duel=makeDuel(options.first??0),activeSeat=duel.cursor,activeTeam=activeSeat%2;
 const sourceUid=putHandCard(duel,activeSeat,sourceIds[effect]);
 const sourceHandBefore=privateZone(duel,activeSeat,'hand').length;
 const adapter=createMassBackrowAdapter(lookup,options.onLeaveField);
 const session=adapter.createSession(duel);
 const activationId=options.activationId||'m674-'+effect+'-activation';
 const activation=adapter.activate(session,{activationId,sourceUid,actorSeat:activeSeat,turn:duel.core.turn});
 return {duel:session.duel,adapter,session,activation,activationId,sourceUid,activeSeat,activeTeam,sourceHandBefore};
}
function resolve(s,options={}){
 const result=s.adapter.resolve(s.session,{activationId:s.activationId,...options});
 s.duel=s.session.duel;
 return result;
}
function location(duel,uid){
 for(const team of [0,1]){
  const index=duel.core.players[team].backrow.findIndex(card=>card.uid===uid);
  if(index>=0)return {team,zone:'backrow',index,card:duel.core.players[team].backrow[index]};
  if(duel.core.players[team].field?.uid===uid)return {team,zone:'field',card:duel.core.players[team].field};
 }
 return null;
}
function moveToOwnerHand(duel,uid){
 const found=location(duel,uid);assert.ok(found);
 const [card]=found.zone==='backrow'
  ?duel.core.players[found.team].backrow.splice(found.index,1)
  :[duel.core.players[found.team].field];
 if(found.zone==='field')duel.core.players[found.team].field=null;
 privateZone(duel,Number(/^m([0-3]):/.exec(uid)[1]),'hand').push(card);
}
function partnerSeat(seat){return (seat+2)%4;}

test('os três IDs já possuem certificação engine-v9; o adapter não cria certificações duplicadas',()=>{
 for(const id of [HARPIES_FEATHER_DUSTER_ID,HEAVY_STORM_ID,GIANT_TRUNADE_ID]){
  assert.ok(engineCard(id),'factual metadata is present');
  assert.ok(getPlayableCard(id),'card is already admitted by the engine');
  assert.equal(getCardStatus(id)?.stage,'certified');
 }
});

test('Harpie ativa da mão física do jogador ativo e ocupa uma Spell/Trap Zone compartilhada',()=>{
 const s=setup('harpie-feather-duster');
 assert.equal(s.activation.effect,'harpie-feather-duster');assert.equal(s.activation.replayed,false);
 assert.equal(privateZone(s.duel,s.activeSeat,'hand').length,s.sourceHandBefore-1);
 assert.ok(s.duel.core.players[s.activeTeam].backrow.some(card=>card.uid===s.sourceUid&&card.faceUp));
});

test('não permite ativar uma Magia da mão privada do parceiro',()=>{
 const duel=makeDuel(0),partner=partnerSeat(0),sourceUid=putHandCard(duel,partner,sourceIds['heavy-storm']);
 const adapter=createMassBackrowAdapter(lookup),session=adapter.createSession(duel);
 assert.throws(()=>adapter.activate(session,{activationId:'partner-hand',sourceUid,actorSeat:0,turn:duel.core.turn}),/mão privada/);
});

test('rejeita ativação fora da Main Phase',()=>{
 const duel=makeDuel(0),sourceUid=putHandCard(duel,0,sourceIds['heavy-storm']);
 duel.core.phase='battle';
 const adapter=createMassBackrowAdapter(lookup),session=adapter.createSession(duel);
 assert.throws(()=>adapter.activate(session,{activationId:'wrong-phase',sourceUid,actorSeat:0,turn:duel.core.turn}),/Main Phase/);
});

test('rejeita ativação quando as três Spell/Trap Zones já estão ocupadas',()=>{
 const duel=makeDuel(0);
 for(let i=0;i<3;i++)placeBackrow(duel,0,0,fixtureSpells[3+i],false);
 const sourceUid=putHandCard(duel,0,sourceIds['heavy-storm']);
 const adapter=createMassBackrowAdapter(lookup),session=adapter.createSession(duel);
 assert.throws(()=>adapter.activate(session,{activationId:'full-backrow',sourceUid,actorSeat:0,turn:duel.core.turn}),/Zone livre/);
});

test('rejeita fonte que não seja uma das três Magias de varredura',()=>{
 const duel=makeDuel(0),sourceUid=putHandCard(duel,0,fixtureTraps[0]);
 const adapter=createMassBackrowAdapter(lookup),session=adapter.createSession(duel);
 assert.throws(()=>adapter.activate(session,{activationId:'not-a-sweep',sourceUid,actorSeat:0,turn:duel.core.turn}),/fonte não é/);
});

test('Harpie destrói a backrow e a Field Zone oponentes, inclusive cartas face-down, mas preserva a própria equipe',()=>{
 const s=setup('harpie-feather-duster');
 const own=placeBackrow(s.duel,partnerSeat(s.activeSeat),s.activeTeam,fixtureTraps[0],false);
 const ownField=placeField(s.duel,partnerSeat(s.activeSeat),s.activeTeam,fieldSpellId,false);
 const enemy=placeBackrow(s.duel,1-s.activeTeam,1-s.activeTeam,fixtureSpells[3],false);
 const enemyField=placeField(s.duel,1-s.activeTeam,1-s.activeTeam,fieldSpellId,true);
 const before=inventory(s.duel),result=resolve(s);
 assert.deepEqual(result.destroyedUids.sort(),[enemy,enemyField].sort());
 assert.ok(location(s.duel,own));assert.ok(location(s.duel,ownField));
 assert.ok(s.duel.core.players[(Number(/^m([0-3]):/.exec(enemy)[1]))%2].grave.some(card=>card.uid===enemy));
 assert.ok(s.duel.core.players[(Number(/^m([0-3]):/.exec(enemyField)[1]))%2].grave.some(card=>card.uid===enemyField));
 assert.deepEqual(inventory(s.duel),before);
});

test('Heavy Storm destrói as duas backrows e as duas Field Zones, mas não destrói a si mesma',()=>{
 const s=setup('heavy-storm');
 const own=placeBackrow(s.duel,partnerSeat(s.activeSeat),s.activeTeam,fixtureTraps[0],true);
 const enemy=placeBackrow(s.duel,1-s.activeTeam,1-s.activeTeam,fixtureSpells[3],false);
 const ownField=placeField(s.duel,partnerSeat(s.activeSeat),s.activeTeam,fieldSpellId,true);
 const enemyField=placeField(s.duel,1-s.activeTeam,1-s.activeTeam,fieldSpellId,false);
 const before=inventory(s.duel),result=resolve(s);
 assert.deepEqual(new Set(result.destroyedUids),new Set([own,enemy,ownField,enemyField]));
 assert.ok(s.duel.core.players[s.activeTeam].grave.some(card=>card.uid===s.sourceUid));
 assert.deepEqual(inventory(s.duel),before);
});

test('Giant Trunade devolve backrow e Field Zone às mãos privadas dos proprietários físicos',()=>{
 const s=setup('giant-trunade');
 const own=placeBackrow(s.duel,partnerSeat(s.activeSeat),s.activeTeam,fixtureTraps[0],true);
 const enemy=placeBackrow(s.duel,1-s.activeTeam,1-s.activeTeam,fixtureSpells[3],false);
 const ownField=placeField(s.duel,partnerSeat(s.activeSeat),s.activeTeam,fieldSpellId,true);
 const enemyField=placeField(s.duel,1-s.activeTeam,1-s.activeTeam,fieldSpellId,false);
 const result=resolve(s);
 assert.equal(result.returnedCount,4);assert.deepEqual(result.destroyedUids,[]);
 for(const uid of [own,enemy,ownField,enemyField]){
  const seat=Number(/^m([0-3]):/.exec(uid)[1]);
  assert.ok(privateZone(s.duel,seat,'hand').some(card=>card.uid===uid));
 }
 assert.ok(s.duel.core.players[s.activeTeam].grave.some(card=>card.uid===s.sourceUid));
});

test('Harpie e Heavy Storm incluem cartas face-down e face-up sem revelar identidades no recibo',()=>{
 const a=setup('harpie-feather-duster'),hidden=placeBackrow(a.duel,1-a.activeTeam,1-a.activeTeam,fixtureTraps[0],false);
 const r=resolve(a);assert.ok(r.destroyedUids.includes(hidden));
 assert.equal('returnedUids' in r,false);
 const b=setup('heavy-storm'),visible=placeBackrow(b.duel,1-b.activeTeam,1-b.activeTeam,fixtureSpells[3],true);
 assert.ok(resolve(b).destroyedUids.includes(visible));
});

test('Field Zone é separada e pode coexistir com três Spell/Trap Zones',()=>{
 const duel=makeDuel(0);
 for(let i=0;i<3;i++)placeBackrow(duel,0,0,fixtureSpells[3+i],false);
 placeField(duel,partnerSeat(0),0,fieldSpellId,true);
 assertMassBackrowRules(duel);
 assert.equal(duel.core.players[0].backrow.length,3);
 assert.ok(duel.core.players[0].field);
});

test('carta roubada destruída vai ao Cemitério da equipe do proprietário físico',()=>{
 const s=setup('heavy-storm'),stolen=placeBackrow(s.duel,0,1-s.activeTeam,fixtureSpells[3],true);
 const ownerTeam=0;
 const result=resolve(s);
 assert.ok(result.destroyedUids.includes(stolen));
 assert.ok(s.duel.core.players[ownerTeam].grave.some(card=>card.uid===stolen));
 assert.ok(!s.duel.core.players[1-s.activeTeam].grave.some(card=>card.uid===stolen));
});

test('carta roubada devolvida vai à mão privada do proprietário, não do controlador',()=>{
 const s=setup('giant-trunade'),stolen=placeBackrow(s.duel,0,1-s.activeTeam,fixtureSpells[3],true);
 const result=resolve(s),ownerHand=privateZone(s.duel,0,'hand'),controllerHand=privateZone(s.duel,s.duel.active[1-s.activeTeam],'hand');
 assert.equal(result.returnedCount,1);
 assert.ok(ownerHand.some(card=>card.uid===stolen));
 assert.ok(!controllerHand.some(card=>card.uid===stolen));
});

test('varredura não-direcionada inclui carta que entrou no campo depois da ativação',()=>{
 const s=setup('heavy-storm');
 const late=placeBackrow(s.duel,1-s.activeTeam,1-s.activeTeam,fixtureSpells[3],false);
 assert.ok(resolve(s).destroyedUids.includes(late));
});

test('carta que deixa o campo antes da resolução não é retargeted nem movida novamente',()=>{
 const s=setup('heavy-storm'),target=placeBackrow(s.duel,1-s.activeTeam,1-s.activeTeam,fixtureSpells[3],false);
 moveToOwnerHand(s.duel,target);
 const result=resolve(s);
 assert.ok(!result.destroyedUids.includes(target));
 assert.ok(privateZone(s.duel,Number(/^m([0-3]):/.exec(target)[1]),'hand').some(card=>card.uid===target));
});

test('ativação negada não varre o campo e envia a Magia ativada ao Cemitério',()=>{
 const s=setup('heavy-storm'),target=placeBackrow(s.duel,1-s.activeTeam,1-s.activeTeam,fixtureSpells[3],false);
 const result=resolve(s,{activationNegated:true});
 assert.equal(result.status,'activation-negated');assert.equal(result.destroyedUids.length,0);
 assert.ok(location(s.duel,target));assert.ok(s.duel.core.players[s.activeTeam].grave.some(card=>card.uid===s.sourceUid));
});

test('efeito negado não varre o campo e envia a Magia ativada ao Cemitério',()=>{
 const s=setup('harpie-feather-duster'),target=placeBackrow(s.duel,1-s.activeTeam,1-s.activeTeam,fixtureSpells[3],false);
 const result=resolve(s,{effectNegated:true});
 assert.equal(result.status,'effect-negated');assert.ok(location(s.duel,target));
});

test('efeito continua resolvendo se a fonte sair do campo após ativar',()=>{
 const s=setup('heavy-storm'),target=placeBackrow(s.duel,1-s.activeTeam,1-s.activeTeam,fixtureSpells[3],false);
 const source=location(s.duel,s.sourceUid);assert.ok(source);
 s.duel.core.players[source.team].backrow.splice(s.duel.core.players[source.team].backrow.findIndex(card=>card.uid===s.sourceUid),1);
 s.duel.core.players[s.activeTeam].grave.push({uid:s.sourceUid,id:source.card.id});
 const result=resolve(s);
 assert.ok(result.destroyedUids.includes(target));
 assert.equal(s.duel.core.players[s.activeTeam].grave.filter(card=>card.uid===s.sourceUid).length,1);
});

test('ativação repetida com o mesmo ID não duplica a fonte',()=>{
 const s=setup('giant-trunade'),before=privateZone(s.duel,s.activeSeat,'hand').length;
 const replay=s.adapter.activate(s.session,{activationId:s.activationId,sourceUid:s.sourceUid,actorSeat:s.activeSeat,turn:s.duel.core.turn});
 assert.equal(replay.replayed,true);assert.equal(privateZone(s.duel,s.activeSeat,'hand').length,before);
 assert.equal(s.duel.core.players[s.activeTeam].backrow.filter(card=>card.uid===s.sourceUid).length,1);
});

test('resolução repetida é idempotente e replay divergente é rejeitado',()=>{
 const s=setup('heavy-storm'),target=placeBackrow(s.duel,1-s.activeTeam,1-s.activeTeam,fixtureSpells[3],false);
 const first=resolve(s),second=resolve(s);
 assert.equal(first.replayed,false);assert.equal(second.replayed,true);
 assert.deepEqual(second.destroyedUids,first.destroyedUids);
 assert.throws(()=>resolve(s,{effectNegated:true}),/resultado diferente/);
 assert.ok(first.destroyedUids.includes(target));
});

test('callback de saída recebe razão, controlador e proprietário físico',()=>{
 const events=[],s=setup('giant-trunade',{onLeaveField:(_duel,event)=>events.push(event)});
 const stolen=placeBackrow(s.duel,0,1-s.activeTeam,fixtureSpells[3],false);
 resolve(s);
 const event=events.find(item=>item.uid===stolen);
 assert.ok(event);assert.equal(event.reason,'return');assert.equal(event.ownerSeat,0);
 assert.equal(event.controllerTeam,1-s.activeTeam);
});

test('Deck 20–30, mão 6 somente na End Phase, zonas 3+3, Field Zone separada e Extra 5',()=>{
 const duel=makeDuel(0);assertMassBackrowRules(duel);assert.equal(duel.core.players[0].extra.length,5);
 const hand=privateZone(duel,0,'hand'),deckCards=privateZone(duel,0,'deck');
 while(hand.length<7)hand.push(deckCards.shift());
 for(let i=0;i<3;i++)placeBackrow(duel,0,0,fixtureSpells[3+i],false);
 placeField(duel,partnerSeat(0),0,fieldSpellId,true);
 assertMassBackrowRules(duel);
});

test('inventário e UIDs permanecem conservados sem concessões automáticas',()=>{
 const s=setup('heavy-storm'),target=placeBackrow(s.duel,1-s.activeTeam,1-s.activeTeam,fixtureSpells[3],false);
 const before=inventory(s.duel);resolve(s);
 assert.deepEqual(inventory(s.duel),before);assert.ok(s.duel.core.players[0].grave.some(card=>card.uid===target)||s.duel.core.players[1].grave.some(card=>card.uid===target));
});

test('assento ou turno divergente é rejeitado sem mutação',()=>{
 const duel=makeDuel(0),sourceUid=putHandCard(duel,0,sourceIds['heavy-storm']);
 const adapter=createMassBackrowAdapter(lookup),session=adapter.createSession(duel);
 assert.throws(()=>adapter.activate(session,{activationId:'wrong-seat',sourceUid,actorSeat:2,turn:duel.core.turn}),/Main Phase/);
 assert.throws(()=>adapter.activate(session,{activationId:'wrong-turn',sourceUid,actorSeat:0,turn:duel.core.turn+1}),/Main Phase/);
});
