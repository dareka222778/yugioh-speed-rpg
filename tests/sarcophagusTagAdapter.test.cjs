'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createTagDuel,tagInventory,tagNormalCardIds,stepTagDuel,tagDecisionMember}=require('../dist/tagDuel');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
 THE_FIRST_SARCOPHAGUS_ID,THE_FIRST_SARCOPHAGUS_KONAMI_CID,
 THE_SECOND_SARCOPHAGUS_ID,THE_SECOND_SARCOPHAGUS_KONAMI_CID,
 THE_THIRD_SARCOPHAGUS_ID,THE_THIRD_SARCOPHAGUS_KONAMI_CID,
 SPIRIT_OF_THE_PHARAOH_ID,SPIRIT_OF_THE_PHARAOH_KONAMI_CID,
 createSarcophagusLedger,createExactSarcophagusLookups,assertSarcophagusRules,
 assertSarcophagusCardPlacement,assertSpiritOfPharaohSummonMethod,
 captureSarcophagusEndPhase,resolveSarcophagusEndPhase,cleanupSarcophagusAfterLeave,
 resolveSpiritOfPharaohTrigger,sarcophagusProgress
}=require('../dist/sarcophagusTagAdapter');

const enabled=getEnabledCardIds();
const traps=enabled.filter(id=>getDuelCard(id)?.kind==='trap');
const spells=enabled.filter(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field);
const monsters=enabled.filter(id=>getDuelCard(id)?.kind==='monster'&&!getDuelCard(id)?.fusion&&!tagNormalCardIds.includes(id));
const zombieNormals=tagNormalCardIds.filter(id=>{
 const card=getDuelCard(id);
 return card?.kind==='monster'&&card.monsterType==='normal'&&card.race==='Zombie'&&card.level<=2;
});
const nonZombieNormal=tagNormalCardIds.find(id=>{
 const card=getDuelCard(id);
 return card?.kind==='monster'&&card.monsterType==='normal'&&card.race!=='Zombie';
});
const [firstA,fillerA,fillerB,fillerC,firstB]=traps;
const [secondPlaceholder,thirdPlaceholder]=spells;
const spiritPlaceholder=monsters[0];
assert.ok(firstA&&fillerA&&fillerB&&fillerC&&firstB&&secondPlaceholder&&thirdPlaceholder&&spiritPlaceholder);
assert.ok(zombieNormals.length>=4,'A suíte exige quatro Monstros Normais Zumbi de Nível 2 ou menos.');
assert.ok(nonZombieNormal,'A suíte exige um monstro Normal não Zumbi.');
const normalDeck=[...zombieNormals.slice(0,4),...tagNormalCardIds.filter(id=>!zombieNormals.includes(id)).slice(0,8)];
const deck=[...normalDeck,firstA,fillerA,fillerB,fillerC,firstB,secondPlaceholder,thirdPlaceholder,spiritPlaceholder];
assert.equal(normalDeck.length,12);
assert.equal(deck.length,20);
const lookups={
 first:id=>id===firstA||id===firstB,
 second:id=>id===secondPlaceholder,
 third:id=>id===thirdPlaceholder,
 spirit:id=>id===spiritPlaceholder
};
const players=()=>[
 {id:'p0',name:'Azul A',cards:[...deck],extra:[]},
 {id:'p1',name:'Vermelho A',cards:[...deck],extra:[]},
 {id:'p2',name:'Azul B',cards:[...deck],extra:[]},
 {id:'p3',name:'Vermelho B',cards:[...deck],extra:[]}
];
function base(first=1){return createTagDuel(players(),{seed:'m694-sarcophagus',first,classic:true});}
function endCurrentTurn(duel){
 return stepTagDuel(duel,tagDecisionMember(duel).id,{kind:'end'});
}
function advanceToNextOpponentEndPhase(duel){return endCurrentTurn(endCurrentTurn(duel));}
function holder(duel,seat){
 const team=seat%2,held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
 if(!held)throw new Error('Assento físico indisponível: '+seat);return held;
}
function take(duel,seat,id){
 const held=holder(duel,seat);
 for(const pool of [held.hand,held.deck,held.extra??[]]){
  const index=pool.findIndex(card=>card.id===id);
  if(index>=0)return pool.splice(index,1)[0];
 }
 throw new Error('Carta física indisponível: '+seat+'/'+id);
}
function moveToHand(duel,seat,id){
 const held=holder(duel,seat);
 if(held.hand.some(card=>card.id===id))return held.hand.find(card=>card.id===id);
 const card=take(duel,seat,id);held.hand.push(card);synchronizeCardLifetimes(duel.core);return card;
}
function moveToDeck(duel,seat,id){
 const held=holder(duel,seat);
 if(held.deck.some(card=>card.id===id))return held.deck.find(card=>card.id===id);
 const card=take(duel,seat,id);held.deck.push(card);synchronizeCardLifetimes(duel.core);return card;
}
function moveToGrave(duel,seat,id){
 const card=take(duel,seat,id);duel.core.players[seat%2].grave.push(card);synchronizeCardLifetimes(duel.core);return card;
}
function moveToTeamGrave(duel,seat,team,id){
 const card=take(duel,seat,id);duel.core.players[team].grave.push(card);synchronizeCardLifetimes(duel.core);return card;
}
function placeFirst(duel,seat=0,id=firstA){
 const card=take(duel,seat,id),team=seat%2;
 duel.core.players[team].backrow.push({...card,setTurn:duel.core.turn-1,faceUp:true,resolved:true});
 synchronizeCardLifetimes(duel.core);return card;
}
function placeFiller(duel,seat,id){
 const card=take(duel,seat,id),team=seat%2;
 duel.core.players[team].backrow.push({...card,setTurn:duel.core.turn-1,faceUp:true,resolved:true});
 synchronizeCardLifetimes(duel.core);return card;
}
function endEvent(duel,sourceUid,{eventId='end-1',sequence=1,actorSeat=duel.cursor,negatedSourceUids}={}){
 return {kind:'sarcophagus-end-phase',eventId,sequence,turn:duel.core.turn,actorSeat,phase:'end',sourceUid,
  ...(negatedSourceUids?{negatedSourceUids}:{})};
}
function choosePiece(capture,location='hand'){
 const list=location==='hand'?capture.candidate.handUids:capture.candidate.deckUids;
 assert.ok(list.length,'A peça escolhida deve existir na zona privada selecionada.');
 return list[0];
}
function chooseSpirit(duel,seat=duel.active[0],location='deck'){
 const held=holder(duel,seat),pool=location==='hand'?held.hand:held.deck;
 const card=pool.find(item=>item.id===spiritPlaceholder);
 assert.ok(card,'Spirit of the Pharaoh precisa estar na zona privada selecionada.');
 return card.uid;
}
function zombiesInGrave(duel,team=0){
 return duel.core.players[team].grave.filter(card=>{
  const info=getDuelCard(card.id);
  return info?.kind==='monster'&&info.monsterType==='normal'&&info.race==='Zombie'&&info.level<=2;
 }).map(card=>card.uid);
}
function addMonster(duel,seat,id){
 const card=take(duel,seat,id),team=seat%2;
 duel.core.players[team].monsters.push({...card,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,
  attacked:0,atkBoost:0,defBoost:0,owner:team});
 synchronizeCardLifetimes(duel.core);return card;
}
function assertInventoryConserved(before,after){
 assert.equal(after.length,before.length,'Nenhuma carta física pode ser criada ou perdida.');
 assert.deepEqual(after.map(c=>c.uid).sort(),before.map(c=>c.uid).sort());
}

test('candidate identities are exact, absent from engine-v9, and retain official Konami IDs',()=>{
 assert.equal(THE_FIRST_SARCOPHAGUS_ID,'31076103');assert.equal(THE_FIRST_SARCOPHAGUS_KONAMI_CID,6063);
 assert.equal(THE_SECOND_SARCOPHAGUS_ID,'04081094');assert.equal(THE_SECOND_SARCOPHAGUS_KONAMI_CID,6062);
 assert.equal(THE_THIRD_SARCOPHAGUS_ID,'78697395');assert.equal(THE_THIRD_SARCOPHAGUS_KONAMI_CID,6061);
 assert.equal(SPIRIT_OF_THE_PHARAOH_ID,'25343280');assert.equal(SPIRIT_OF_THE_PHARAOH_KONAMI_CID,6024);
 for(const id of [THE_FIRST_SARCOPHAGUS_ID,THE_SECOND_SARCOPHAGUS_ID,THE_THIRD_SARCOPHAGUS_ID,SPIRIT_OF_THE_PHARAOH_ID]){
  assert.equal(getDuelCard(id),undefined,'Apenas adapter isolado não certifica nem habilita a carta.');
 }
 assert.equal(assertSarcophagusRules(base()),undefined);
 assert.equal(tagInventory(base()).length,80);
});
test('owner rules stay intact: Deck 20–30, hand 6 at End Phase, 3+3 zones and Extra 5',()=>{
 const duel=base();
 assert.equal(assertSarcophagusRules(duel),undefined);
 assert.equal(duel.core.players[0].backrow.length,0);
 const invalid=structuredClone(duel),moved=invalid.core.players[0].deck.splice(0,4);
 invalid.core.players[0].backrow.push(...moved.map(card=>({...card,setTurn:0,faceUp:true})));
 synchronizeCardLifetimes(invalid.core);
 assert.throws(()=>assertSarcophagusRules(invalid),/limite de zonas/i);
});
test('Second and Third Sarcophagus cannot be activated or placed manually; Spirit cannot be summoned by another method',()=>{
 assert.throws(()=>assertSarcophagusCardPlacement(secondPlaceholder,'normal',lookups),/só pode ser colocado/);
 assert.throws(()=>assertSarcophagusCardPlacement(thirdPlaceholder,'normal',lookups),/só pode ser colocado/);
 assert.equal(assertSarcophagusCardPlacement(secondPlaceholder,'first-sarcophagus-effect',lookups),undefined);
 assert.equal(assertSarcophagusCardPlacement(firstA,'normal',lookups),undefined);
 assert.throws(()=>assertSpiritOfPharaohSummonMethod('normal'),/só pode ser Invocado/);
 assert.throws(()=>assertSpiritOfPharaohSummonMethod('other-effect'),/só pode ser Invocado/);
 assert.equal(assertSpiritOfPharaohSummonMethod('first-sarcophagus-effect'),undefined);
});
test('The First Sarcophagus triggers only in the opposing physical End Phase',()=>{
 const sameTeam=base(0),sameTeamFirst=placeFirst(sameTeam,0);
 assert.throws(()=>captureSarcophagusEndPhase(sameTeam,createSarcophagusLedger(),endEvent(sameTeam,sameTeamFirst.uid,{actorSeat:0}),lookups),/equipe oponente/);
 const duel=base(),first=placeFirst(duel,0);
 assert.throws(()=>captureSarcophagusEndPhase(duel,createSarcophagusLedger(),{...endEvent(duel,first.uid),phase:'main1'},lookups),/End Phase/);
 const captured=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first.uid),lookups);
 assert.equal(captured.status,'pending-resolution');assert.equal(captured.candidate.controllerTeam,0);
 assert.equal(captured.candidate.recipientSeat,duel.active[0]);
});
test('the active teammate private hand supplies the next piece even when another teammate owns First Sarcophagus',()=>{
 const duel=base(),first=placeFirst(duel,0),recipient=duel.active[0];
 const second=moveToHand(duel,duel.active[0],secondPlaceholder);
 const captured=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first.uid),lookups);
 assert.equal(captured.candidate.recipientSeat,recipient);
 assert.ok(captured.candidate.handUids.includes(second.uid));
 assert.ok(!captured.candidate.handUids.includes(first.uid));
 const resolved=resolveSarcophagusEndPhase(duel,captured.ledger,{
  eventId:'end-1',sourceUid:first.uid,pieceUid:second.uid,sourceLocation:'hand'
 },lookups);
 assert.equal(resolved.resolution.status,'placed');
 assert.ok(resolved.state.core.players[0].backrow.some(card=>card.uid===second.uid&&card.faceUp));
 assert.ok(!holder(resolved.state,resolved.state.active[0]).hand.some(card=>card.uid===second.uid));
});
test('Second is placed from hand, face-up, without shuffling the Deck',()=>{
 const duel=base(),first=placeFirst(duel,0),second=moveToHand(duel,duel.active[0],secondPlaceholder);
 const beforeCounter=duel.core.random.counter,ledger=createSarcophagusLedger();
 const captured=captureSarcophagusEndPhase(duel,ledger,endEvent(duel,first.uid),lookups);
 const resolved=resolveSarcophagusEndPhase(duel,captured.ledger,{
  eventId:'end-1',sourceUid:first.uid,pieceUid:choosePiece(captured,'hand'),sourceLocation:'hand'
 },lookups);
 assert.equal(resolved.resolution.status,'placed');assert.equal(resolved.resolution.placedUid,second.uid);
 assert.equal(resolved.resolution.shuffled,false);assert.equal(resolved.state.core.random.counter,beforeCounter);
 assert.deepEqual(sarcophagusProgress(resolved.state,0,lookups),{first:true,second:true,third:false,nextPiece:'third',complete:false});
});
test('Third from Deck completes the three-card set, sends all Sarcophagi to GY, shuffles, and summons Spirit of the Pharaoh',()=>{
 const duel=base(),first=placeFirst(duel,0);
 const second=moveToHand(duel,duel.active[0],secondPlaceholder);
 const secondCapture=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first.uid),lookups);
 const afterSecond=resolveSarcophagusEndPhase(duel,secondCapture.ledger,{
  eventId:'end-1',sourceUid:first.uid,pieceUid:second.uid,sourceLocation:'hand'
 },lookups);
 const nextTurn=advanceToNextOpponentEndPhase(afterSecond.state);
 const third=moveToDeck(nextTurn,nextTurn.active[0],thirdPlaceholder);
 moveToDeck(nextTurn,nextTurn.active[0],spiritPlaceholder);
 const beforeCounter=nextTurn.core.random.counter;
 const thirdCapture=captureSarcophagusEndPhase(nextTurn,afterSecond.resolution.ledger,
  endEvent(nextTurn,first.uid,{eventId:'end-2',sequence:2}),lookups);
 const resolved=resolveSarcophagusEndPhase(nextTurn,thirdCapture.ledger,{
  eventId:'end-2',sourceUid:first.uid,pieceUid:choosePiece(thirdCapture,'deck'),sourceLocation:'deck',
  spiritUid:chooseSpirit(nextTurn,nextTurn.active[0],'deck'),spiritLocation:'deck'
 },lookups);
 assert.equal(resolved.resolution.status,'summoned');assert.equal(resolved.resolution.placedUid,third.uid);
 assert.ok(resolved.resolution.shuffled);assert.ok(resolved.state.core.random.counter>beforeCounter);
 assert.equal(resolved.resolution.sentToGraveyardUids.length,3);
 assert.equal(resolved.state.core.players[0].backrow.filter(card=>lookups.first(card.id)||lookups.second(card.id)||lookups.third(card.id)).length,0);
 assert.equal(resolved.state.core.players[0].grave.filter(card=>lookups.first(card.id)||lookups.second(card.id)||lookups.third(card.id)).length,3);
 const spirit=resolved.state.core.players[0].monsters.find(card=>card.uid===resolved.resolution.summonedUid);
 assert.ok(spirit&&lookups.spirit(spirit.id)&&spirit.faceUp&&spirit.owner===0);
 assert.equal(resolved.resolution.ledger.spiritSummons.length,1);
});
test('Spirit of the Pharaoh can revive only eligible normal Zombies and is capped by the three Monster Zones',()=>{
 const duel=base(),first=placeFirst(duel,0),second=moveToHand(duel,duel.active[0],secondPlaceholder);
 const c1=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first.uid),lookups);
 const r1=resolveSarcophagusEndPhase(duel,c1.ledger,{eventId:'end-1',sourceUid:first.uid,pieceUid:second.uid,sourceLocation:'hand'},lookups);
 const nextTurn=advanceToNextOpponentEndPhase(r1.state);
 moveToDeck(nextTurn,nextTurn.active[0],thirdPlaceholder);moveToDeck(nextTurn,nextTurn.active[0],spiritPlaceholder);
 const c2=captureSarcophagusEndPhase(nextTurn,r1.resolution.ledger,endEvent(nextTurn,first.uid,{eventId:'end-2',sequence:2}),lookups);
 const r2=resolveSarcophagusEndPhase(nextTurn,c2.ledger,{eventId:'end-2',sourceUid:first.uid,
  pieceUid:choosePiece(c2,'deck'),sourceLocation:'deck',spiritUid:chooseSpirit(nextTurn,nextTurn.active[0],'deck'),spiritLocation:'deck'},lookups);
 const zombieA=moveToGrave(r2.state,0,zombieNormals[0]),zombieB=moveToTeamGrave(r2.state,1,0,zombieNormals[1]);
 const targets=zombiesInGrave(r2.state).filter(uid=>uid===zombieA.uid||uid===zombieB.uid);
 const before=tagInventory(r2.state);
 const spiritEvent={kind:'spirit-of-pharaoh-trigger',eventId:'spirit-trigger-1',sequence:3,actorSeat:r2.state.active[0],
  spiritUid:r2.resolution.summonedUid,targetUids:targets};
 const effect=resolveSpiritOfPharaohTrigger(r2.state,r2.resolution.ledger,spiritEvent,lookups);
 assert.equal(effect.resolution.status,'resolved');assert.equal(effect.resolution.summonedUids.length,2);
 assert.equal(effect.state.core.players[0].monsters.length,3);
 const revivedOpposingOwner=effect.state.core.players[0].monsters.find(card=>card.uid===zombieB.uid);
 assert.equal(revivedOpposingOwner.owner,1,'A carta invocada preserva a equipe proprietária original.');
 assertInventoryConserved(before,tagInventory(effect.state));
 assert.equal(resolveSpiritOfPharaohTrigger(effect.state,effect.resolution.ledger,spiritEvent,lookups).resolution.status,'duplicate');
 assert.throws(()=>resolveSpiritOfPharaohTrigger(effect.state,effect.resolution.ledger,{...spiritEvent,targetUids:[]},lookups),/alvos.*mudaram/i);
 assert.throws(()=>resolveSpiritOfPharaohTrigger(r2.state,r2.resolution.ledger,{
  kind:'spirit-of-pharaoh-trigger',eventId:'spirit-trigger-overflow',sequence:3,actorSeat:r2.state.active[0],
  spiritUid:r2.resolution.summonedUid,targetUids:[...targets,targets[0]]
 },lookups),/Alvos Spirit of the Pharaoh inválido|limite de quatro alvos ou as Monster Zones/);
});
test('Spirit of the Pharaoh rejects non-Zombie Normal Monsters',()=>{
 const duel=base(),first=placeFirst(duel,0),second=moveToHand(duel,duel.active[0],secondPlaceholder);
 const c1=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first.uid),lookups);
 const r1=resolveSarcophagusEndPhase(duel,c1.ledger,{eventId:'end-1',sourceUid:first.uid,pieceUid:second.uid,sourceLocation:'hand'},lookups);
 const nextTurn=advanceToNextOpponentEndPhase(r1.state);
 moveToDeck(nextTurn,nextTurn.active[0],thirdPlaceholder);moveToDeck(nextTurn,nextTurn.active[0],spiritPlaceholder);
 const c2=captureSarcophagusEndPhase(nextTurn,r1.resolution.ledger,endEvent(nextTurn,first.uid,{eventId:'end-2',sequence:2}),lookups);
 const r2=resolveSarcophagusEndPhase(nextTurn,c2.ledger,{eventId:'end-2',sourceUid:first.uid,
  pieceUid:choosePiece(c2,'deck'),sourceLocation:'deck',spiritUid:chooseSpirit(nextTurn,nextTurn.active[0],'deck'),spiritLocation:'deck'},lookups);
 const nonZombie=moveToGrave(r2.state,0,nonZombieNormal);
 assert.throws(()=>resolveSpiritOfPharaohTrigger(r2.state,r2.resolution.ledger,{
  kind:'spirit-of-pharaoh-trigger',eventId:'bad-zombie',sequence:3,actorSeat:r2.state.active[0],
  spiritUid:r2.resolution.summonedUid,targetUids:[nonZombie.uid]
 },lookups),/Monstros Normais Zumbi/);
});
test('if no Spirit of the Pharaoh exists in the private hand/Deck, the three Sarcophagi still leave the field and no card is invented',()=>{
 const duel=base(),first=placeFirst(duel,0),second=moveToHand(duel,duel.active[0],secondPlaceholder);
 const c1=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first.uid),lookups);
 const r1=resolveSarcophagusEndPhase(duel,c1.ledger,{eventId:'end-1',sourceUid:first.uid,pieceUid:second.uid,sourceLocation:'hand'},lookups);
 const nextTurn=advanceToNextOpponentEndPhase(r1.state);
 moveToDeck(nextTurn,nextTurn.active[0],thirdPlaceholder);moveToGrave(nextTurn,nextTurn.active[0],spiritPlaceholder);
 const c2=captureSarcophagusEndPhase(nextTurn,r1.resolution.ledger,endEvent(nextTurn,first.uid,{eventId:'end-2',sequence:2}),lookups);
 const before=tagInventory(nextTurn);
 const r2=resolveSarcophagusEndPhase(nextTurn,c2.ledger,{eventId:'end-2',sourceUid:first.uid,
  pieceUid:choosePiece(c2,'deck'),sourceLocation:'deck'},lookups);
 assert.equal(r2.resolution.status,'placed');assert.equal(r2.resolution.summonedUid,null);
 assert.equal(r2.resolution.sentToGraveyardUids.length,3);
 assertInventoryConserved(before,tagInventory(r2.state));
 assert.ok(!r2.state.core.players[0].monsters.some(card=>lookups.spirit(card.id)));
});
test('if the summon is negated after the Sarcophagi are paid, the Spirit remains in the private Deck',()=>{
 const duel=base(),first=placeFirst(duel,0),second=moveToHand(duel,duel.active[0],secondPlaceholder);
 const c1=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first.uid),lookups);
 const r1=resolveSarcophagusEndPhase(duel,c1.ledger,{eventId:'end-1',sourceUid:first.uid,pieceUid:second.uid,sourceLocation:'hand'},lookups);
 const nextTurn=advanceToNextOpponentEndPhase(r1.state);
 moveToDeck(nextTurn,nextTurn.active[0],thirdPlaceholder);moveToDeck(nextTurn,nextTurn.active[0],spiritPlaceholder);
 const c2=captureSarcophagusEndPhase(nextTurn,r1.resolution.ledger,endEvent(nextTurn,first.uid,{eventId:'end-2',sequence:2}),lookups);
 const spiritUid=chooseSpirit(nextTurn,nextTurn.active[0],'deck');
 const r2=resolveSarcophagusEndPhase(nextTurn,c2.ledger,{eventId:'end-2',sourceUid:first.uid,
  pieceUid:choosePiece(c2,'deck'),sourceLocation:'deck',spiritUid,spiritLocation:'deck',summonEffectNegated:true},lookups);
 assert.equal(r2.resolution.status,'summon-negated');
 assert.ok(holder(r2.state,r2.state.active[0]).deck.some(card=>card.uid===spiritUid));
 assert.equal(r2.state.core.players[0].backrow.filter(card=>lookups.first(card.id)||lookups.second(card.id)||lookups.third(card.id)).length,0);
});
test('a full three-card Spell/Trap backrow blocks placement without creating a fourth zone',()=>{
 const duel=base(),first=placeFirst(duel,0);
 placeFiller(duel,0,fillerA);placeFiller(duel,0,fillerB);
 assert.equal(duel.core.players[0].backrow.length,3);
 const captured=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first.uid),lookups);
 assert.equal(captured.status,'zone-full');assert.equal(captured.candidate,null);
 assert.equal(duel.core.players[0].backrow.length,3);
});
test('when the leaving Sarcophagus is banished, every remaining Sarcophagus is sent to the GY and the banished card stays banished',()=>{
 const duel=base(),first=placeFirst(duel,0),second=take(duel,0,secondPlaceholder);
 duel.core.players[0].backrow.push({...second,setTurn:duel.core.turn,faceUp:true,resolved:true});
 const index=duel.core.players[0].backrow.findIndex(card=>card.uid===first.uid);
 const [banished]=duel.core.players[0].backrow.splice(index,1);
 duel.core.players[0].banished.push({uid:banished.uid,id:banished.id});
 synchronizeCardLifetimes(duel.core);
 const cleaned=cleanupSarcophagusAfterLeave(duel,first.uid,0,lookups);
 assert.equal(cleaned.state.core.players[0].backrow.filter(card=>lookups.first(card.id)||lookups.second(card.id)||lookups.third(card.id)).length,0);
 assert.ok(cleaned.state.core.players[0].banished.some(card=>card.uid===first.uid));
 assert.ok(cleaned.state.core.players[0].grave.some(card=>card.uid===second.uid));
 assert.deepEqual(cleanupSarcophagusAfterLeave(cleaned.state,first.uid,0,lookups).movedUids,[]);
});
test('multiple First Sarcophagus copies cannot bypass the three backrow slots',()=>{
 const duel=base(),first1=placeFirst(duel,0,firstA),first2=placeFirst(duel,2,firstB);
 moveToDeck(duel,duel.active[0],secondPlaceholder);
 const c1=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first1.uid),lookups);
 const r1=resolveSarcophagusEndPhase(duel,c1.ledger,{eventId:'end-1',sourceUid:first1.uid,
  pieceUid:choosePiece(c1,'deck'),sourceLocation:'deck'},lookups);
 const nextTurn=advanceToNextOpponentEndPhase(r1.state);
 const c2=captureSarcophagusEndPhase(nextTurn,r1.resolution.ledger,endEvent(nextTurn,first2.uid,{eventId:'end-2',sequence:2}),lookups);
 assert.equal(c2.status,'zone-full');assert.equal(c2.candidate,null);
 assert.equal(nextTurn.core.players[0].backrow.length,3);
});
test('the same First Sarcophagus cannot resolve twice in one turn; event and choice replay are idempotent',()=>{
 const duel=base(),first=placeFirst(duel,0),ledger=createSarcophagusLedger();
 moveToDeck(duel,duel.active[0],secondPlaceholder);
 const captured=captureSarcophagusEndPhase(duel,ledger,endEvent(duel,first.uid),lookups);
 const choice={eventId:'end-1',sourceUid:first.uid,pieceUid:choosePiece(captured,'deck'),sourceLocation:'deck'};
 const resolved=resolveSarcophagusEndPhase(duel,captured.ledger,choice,lookups);
 assert.equal(resolveSarcophagusEndPhase(resolved.state,resolved.resolution.ledger,choice,lookups).resolution.status,'duplicate');
 assert.throws(()=>captureSarcophagusEndPhase(resolved.state,resolved.resolution.ledger,
  endEvent(resolved.state,first.uid,{eventId:'end-2',sequence:2}),lookups),/já usou seu efeito/);
 assert.throws(()=>resolveSarcophagusEndPhase(resolved.state,resolved.resolution.ledger,
  {...choice,pieceUid:holder(resolved.state,resolved.state.active[0]).deck[0].uid},lookups),/não está pendente|mudou/);
});
test('a negated First Sarcophagus does not place a piece and cannot be recaptured',()=>{
 const duel=base(),first=placeFirst(duel,0);
 assert.throws(()=>captureSarcophagusEndPhase(duel,createSarcophagusLedger(),
  endEvent(duel,first.uid,{negatedSourceUids:[first.uid]}),lookups),/está negado/);
});
test('no target in the private hand/Deck does not create a Sarcophagus card',()=>{
 const duel=base(),first=placeFirst(duel,0);
 moveToGrave(duel,duel.active[0],secondPlaceholder);
 const captured=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first.uid),lookups);
 assert.equal(captured.status,'no-target');assert.equal(captured.candidate,null);
 assert.equal(duel.core.players[0].backrow.length,1);
});
test('a full Monster Zone prevents the Spirit summon after the three Sarcophagi are sent to the GY',()=>{
 const duel=base(),first=placeFirst(duel,0),second=moveToHand(duel,duel.active[0],secondPlaceholder);
 addMonster(duel,0,normalDeck[0]);addMonster(duel,2,normalDeck[1]);addMonster(duel,0,normalDeck[2]);
 const c1=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first.uid),lookups);
 const r1=resolveSarcophagusEndPhase(duel,c1.ledger,{eventId:'end-1',sourceUid:first.uid,pieceUid:second.uid,sourceLocation:'hand'},lookups);
 const nextTurn=advanceToNextOpponentEndPhase(r1.state);
 moveToDeck(nextTurn,nextTurn.active[0],thirdPlaceholder);moveToDeck(nextTurn,nextTurn.active[0],spiritPlaceholder);
 const c2=captureSarcophagusEndPhase(nextTurn,r1.resolution.ledger,endEvent(nextTurn,first.uid,{eventId:'end-2',sequence:2}),lookups);
 const spiritUid=chooseSpirit(nextTurn,nextTurn.active[0],'deck');
 const r2=resolveSarcophagusEndPhase(nextTurn,c2.ledger,{eventId:'end-2',sourceUid:first.uid,
  pieceUid:choosePiece(c2,'deck'),sourceLocation:'deck',spiritUid,spiritLocation:'deck'},lookups);
 assert.equal(r2.resolution.status,'no-monster-zone');assert.equal(r2.resolution.summonedUid,null);
 assert.ok(holder(r2.state,r2.state.active[0]).deck.some(card=>card.uid===spiritUid));
 assert.equal(r2.state.core.players[0].monsters.length,3);
});

test('a stolen First Sarcophagus resolves for its controller team while preserving the physical owner',()=>{
 const duel=base(),stolen=take(duel,1,firstA);
 duel.core.players[0].backrow.push({...stolen,setTurn:duel.core.turn-1,faceUp:true,resolved:true});
 const second=moveToHand(duel,duel.active[0],secondPlaceholder);
 synchronizeCardLifetimes(duel.core);
 const captured=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,stolen.uid),lookups);
 assert.equal(captured.candidate.controllerTeam,0);assert.equal(captured.candidate.recipientSeat,duel.active[0]);
 const resolved=resolveSarcophagusEndPhase(duel,captured.ledger,{
  eventId:'end-1',sourceUid:stolen.uid,pieceUid:second.uid,sourceLocation:'hand'
 },lookups);
 assert.equal(resolved.resolution.status,'placed');
 assert.ok(resolved.state.core.players[0].backrow.some(card=>card.uid===second.uid));
 assert.equal(stolen.uid.split(':')[0],'m1');
 const cleaned=cleanupSarcophagusAfterLeave(resolved.state,stolen.uid,0,lookups);
 assert.ok(cleaned.state.core.players[0].grave.some(card=>card.uid===second.uid));
 assert.ok(cleaned.state.core.players[0].grave.some(card=>card.uid===stolen.uid));
});
test('the First Sarcophagus effect can be negated without moving either card',()=>{
 const duel=base(),first=placeFirst(duel,0),second=moveToHand(duel,duel.active[0],secondPlaceholder);
 const captured=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first.uid),lookups);
 const resolved=resolveSarcophagusEndPhase(duel,captured.ledger,{
  eventId:'end-1',sourceUid:first.uid,pieceUid:second.uid,sourceLocation:'hand',effectNegated:true
 },lookups);
 assert.equal(resolved.resolution.status,'effect-negated');
 assert.ok(holder(resolved.state,resolved.state.active[0]).hand.some(card=>card.uid===second.uid));
 assert.ok(!resolved.state.core.players[0].backrow.some(card=>card.uid===second.uid));
 assert.throws(()=>captureSarcophagusEndPhase(resolved.state,resolved.resolution.ledger,
  endEvent(resolved.state,first.uid,{eventId:'end-2',sequence:2}),lookups),/já usou seu efeito/);
});
test('capture and resolution replays are idempotent and reject changed choices',()=>{
 const duel=base(),first=placeFirst(duel,0),second=moveToDeck(duel,duel.active[0],secondPlaceholder);
 const event=endEvent(duel,first.uid);
 const captured=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),event,lookups);
 assert.equal(captureSarcophagusEndPhase(duel,captured.ledger,event,lookups).status,'duplicate');
 const choice={eventId:'end-1',sourceUid:first.uid,pieceUid:second.uid,sourceLocation:'deck'};
 const resolved=resolveSarcophagusEndPhase(duel,captured.ledger,choice,lookups);
 assert.equal(resolveSarcophagusEndPhase(resolved.state,resolved.resolution.ledger,choice,lookups).resolution.status,'duplicate');
 assert.throws(()=>resolveSarcophagusEndPhase(resolved.state,resolved.resolution.ledger,
  {...choice,pieceUid:holder(resolved.state,resolved.state.active[0]).deck[0].uid},lookups),/mudou/);
});
test('a pending resolution is rejected if the First Sarcophagus leaves the field before choice resolution',()=>{
 const duel=base(),first=placeFirst(duel,0),second=moveToDeck(duel,duel.active[0],secondPlaceholder);
 const captured=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first.uid),lookups);
 const changed=structuredClone(duel),index=changed.core.players[0].backrow.findIndex(card=>card.uid===first.uid);
 const [removed]=changed.core.players[0].backrow.splice(index,1);changed.core.players[0].grave.push({uid:removed.uid,id:removed.id});
 synchronizeCardLifetimes(changed.core);
 assert.throws(()=>resolveSarcophagusEndPhase(changed,captured.ledger,{
  eventId:'end-1',sourceUid:first.uid,pieceUid:second.uid,sourceLocation:'deck'
 },lookups),/Estado físico mudou/);
});

test('all transitions conserve physical cards and never grant inventory',()=>{
 const duel=base(),before=tagInventory(duel),first=placeFirst(duel,0),second=moveToHand(duel,duel.active[0],secondPlaceholder);
 const c1=captureSarcophagusEndPhase(duel,createSarcophagusLedger(),endEvent(duel,first.uid),lookups);
 const r1=resolveSarcophagusEndPhase(duel,c1.ledger,{eventId:'end-1',sourceUid:first.uid,pieceUid:second.uid,sourceLocation:'hand'},lookups);
 assertInventoryConserved(before,tagInventory(r1.state));
});
