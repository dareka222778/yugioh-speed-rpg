'use strict';
// Fixture note: classic TagDuel starts with four cards in each physical hand.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createTagDuel,tagInventory,tagNormalCardIds}=require('../dist/tagDuel');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
 JAR_ROBBER_ID,JAR_ROBBER_KONAMI_CID,AVATAR_OF_THE_POT_ID,AVATAR_OF_THE_POT_KONAMI_CID,
 POT_OF_GREED_ID,POT_OF_GREED_KONAMI_CID,createExactPotSynergyLookups,createPotSynergyLedger,
 capturePotSynergyEvent,resolvePotSynergyEvent,assertPotSynergyRules
}=require('../dist/potOfGreedSynergyTagAdapter');

const enabled=getEnabledCardIds();
const traps=enabled.filter(id=>getDuelCard(id)?.kind==='trap');
const spells=enabled.filter(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field);
const monsters=enabled.filter(id=>getDuelCard(id)?.kind==='monster'&&!tagNormalCardIds.includes(id));
const [trapA,trapB,trapC]=traps;
const [jarPlaceholder,potPlaceholder]=spells;
const avatarPlaceholder=monsters[0];
const normalIds=tagNormalCardIds.slice(0,14);
assert.ok(trapA&&trapB&&trapC&&jarPlaceholder&&potPlaceholder&&avatarPlaceholder);
assert.equal(normalIds.length,14);
const deck=[...normalIds,trapA,trapB,trapC,jarPlaceholder,potPlaceholder,avatarPlaceholder];
assert.equal(deck.length,20);
const lookups={
 jarRobber:id=>id===jarPlaceholder,
 avatarOfThePot:id=>id===avatarPlaceholder,
 potOfGreed:id=>id===potPlaceholder
};
const players=()=>[
 {id:'p0',name:'Azul A',cards:[...deck],extra:[]},
 {id:'p1',name:'Vermelho A',cards:[...deck],extra:[]},
 {id:'p2',name:'Azul B',cards:[...deck],extra:[]},
 {id:'p3',name:'Vermelho B',cards:[...deck],extra:[]}
];
function base(first=0){return createTagDuel(players(),{seed:'m693-pot-synergy',first,classic:true});}
function holder(duel,seat){
 const team=seat%2,held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
 if(!held)throw new Error('Assento físico indisponível: '+seat);return held;
}
function take(duel,seat,id){
 const held=holder(duel,seat);
 for(const pool of [held.deck,held.hand,held.extra??[]]){
  const i=pool.findIndex(card=>card.id===id);if(i>=0)return pool.splice(i,1)[0];
 }
 throw new Error('Carta física indisponível: '+seat+'/'+id);
}
function placeJar(duel,seat,location='hand'){
 const card=take(duel,seat,jarPlaceholder);
 if(location==='hand')holder(duel,seat).hand.push(card);
 else duel.core.players[seat%2].backrow.push({...card,setTurn:duel.core.turn-1,faceUp:true,resolved:false});
 synchronizeCardLifetimes(duel.core);return card;
}
function placePot(duel,seat,location='hand',{setThisTurn=false}={}){
 const card=take(duel,seat,potPlaceholder);
 if(location==='hand')holder(duel,seat).hand.push(card);
 else duel.core.players[seat%2].backrow.push({...card,setTurn:setThisTurn?duel.core.turn:duel.core.turn-1,faceUp:true,resolved:false});
 synchronizeCardLifetimes(duel.core);return card;
}
function placeAvatar(duel,seat,{faceUp=true,position='atk'}={}){
 const card=take(duel,seat,avatarPlaceholder);
 const monster={...card,position,faceUp,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:seat%2};
 duel.core.players[seat%2].monsters.push(monster);synchronizeCardLifetimes(duel.core);return monster;
}
function commitCost(duel,seat,cost){
 const held=holder(duel,seat),index=held.hand.findIndex(card=>card.uid===cost.uid);
 if(index<0)throw new Error('Custo não está na mão física.');
 duel.core.players[seat%2].grave.push(held.hand.splice(index,1)[0]);synchronizeCardLifetimes(duel.core);
}
function potActivation(duel,seat,pot,{eventId='pot-act-1',sequence=1,phase='main1',sourceLocation='hand'}={}){
 return {eventId,sequence,actorSeat:seat,phase,sourceUid:pot.uid,sourceLocation};
}
function jarResponse(pot,{responseId='jar-resp-1',sequence=2,jarActorSeat=pot.actorSeat,jarSourceUid,jarSourceLocation='hand',chainIndex=2,previousLinkId=pot.eventId}={}){
 return {kind:'jar-robber-response',responseId,sequence,potActivation:pot,jarActorSeat,jarSourceUid,jarSourceLocation,chainIndex,previousLinkId};
}
function avatarEvent(duel,seat,avatar,cost,{eventId='avatar-1',sequence=1,phase='main1'}={}){
 return {kind:'avatar-of-the-pot-activation',eventId,sequence,actorSeat:seat,phase,avatarUid:avatar.uid,costUid:cost.uid};
}
function applyPlan(duel,plan){
 if(!plan||!plan.actualDrawCount)return;
 const held=holder(duel,plan.recipientSeat);
 assert.equal(held.deck.length,plan.deckCountAtPlan,'Deck físico mudou antes da resolução');
 assert.equal(held.hand.length,plan.handCountAtPlan,'Mão física mudou antes da resolução');
 held.hand.push(...held.deck.splice(0,plan.actualDrawCount));synchronizeCardLifetimes(duel.core);
}
function moveDeckToGrave(duel,seat,keep){
 const held=holder(duel,seat),rest=held.deck.splice(keep);
 duel.core.players[seat%2].grave.push(...rest);synchronizeCardLifetimes(duel.core);
}
function removeAvatarToGrave(duel,avatar){
 const team=Number(avatar.uid[1])%2,player=duel.core.players[team],i=player.monsters.findIndex(card=>card.uid===avatar.uid);
 player.grave.push(player.monsters.splice(i,1)[0]);synchronizeCardLifetimes(duel.core);
}

test('candidate IDs stay unadmitted; Pot of Greed is only an existing prerequisite',()=>{
 assert.equal(JAR_ROBBER_ID,'33784505');assert.equal(JAR_ROBBER_KONAMI_CID,5674);
 assert.equal(AVATAR_OF_THE_POT_ID,'99284890');assert.equal(AVATAR_OF_THE_POT_KONAMI_CID,5960);
 assert.equal(POT_OF_GREED_ID,'55144522');assert.equal(POT_OF_GREED_KONAMI_CID,4844);
 assert.equal(getDuelCard(JAR_ROBBER_ID),undefined);assert.equal(getDuelCard(AVATAR_OF_THE_POT_ID),undefined);
 assert.ok(getDuelCard(POT_OF_GREED_ID));
 assert.equal(createExactPotSynergyLookups().jarRobber(JAR_ROBBER_ID),true);
 assert.equal(createExactPotSynergyLookups().avatarOfThePot(AVATAR_OF_THE_POT_ID),true);
});
test('classic rules preserve physical Deck 20–30, hand 6 at End Phase, 3+3 zones and Extra 5',()=>{
 assert.equal(assertPotSynergyRules(base()),undefined);
});
test('Jar Robber responds directly to Pot of Greed, negates its effect (not activation), and draws 1',()=>{
 const duel=base(),pot=placePot(duel,0),jar=placeJar(duel,0),activation=potActivation(duel,0,pot);
 const event=jarResponse(activation,{jarSourceUid:jar.uid}),ledger=createPotSynergyLedger();
 const captured=capturePotSynergyEvent(duel,ledger,event,lookups);assert.equal(captured.status,'pending-resolution');
 const resolved=resolvePotSynergyEvent(duel,captured.ledger,{eventId:event.responseId,effectNegated:false},lookups);
 assert.equal(resolved.status,'resolved');assert.equal(resolved.plan.negatesEffectOfActivationId,activation.eventId);
 assert.equal(resolved.plan.negatesActivation,false);assert.equal(resolved.plan.recipientSeat,0);
 const before=holder(duel,0).hand.length;applyPlan(duel,resolved.plan);assert.equal(holder(duel,0).hand.length,before+1);
});
test('a set Jar Robber on the opposing team can respond on the Pot activator turn',()=>{
 const duel=base(),pot=placePot(duel,0),jar=placeJar(duel,1,'backrow'),activation=potActivation(duel,0,pot);
 const event=jarResponse(activation,{jarActorSeat:duel.active[1],jarSourceUid:jar.uid,jarSourceLocation:'backrow'});
 const captured=capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups);
 const resolved=resolvePotSynergyEvent(duel,captured.ledger,{eventId:event.responseId,effectNegated:false},lookups);
 assert.equal(resolved.plan.recipientSeat,1);
});
test('a Jar Robber in hand cannot be activated by the non-turn team',()=>{
 const duel=base(),pot=placePot(duel,0),jar=placeJar(duel,1),activation=potActivation(duel,0,pot);
 const event=jarResponse(activation,{jarActorSeat:duel.active[1],jarSourceUid:jar.uid});
 assert.throws(()=>capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups),/mão só pode ser ativado/);
});
test('Jar Robber must be chain link 2 directly over the Pot of Greed activation',()=>{
 const duel=base(),pot=placePot(duel,0),jar=placeJar(duel,0),activation=potActivation(duel,0,pot);
 assert.throws(()=>capturePotSynergyEvent(duel,createPotSynergyLedger(),jarResponse(activation,{jarSourceUid:jar.uid,chainIndex:3}),lookups),/diretamente/);
 assert.throws(()=>capturePotSynergyEvent(duel,createPotSynergyLedger(),jarResponse(activation,{jarSourceUid:jar.uid,previousLinkId:'other-link'}),lookups),/diretamente/);
});
test('one Pot of Greed activation cannot receive a second Jar Robber response',()=>{
 const duel=base(),pot=placePot(duel,0),jarA=placeJar(duel,0),jarB=placeJar(duel,0),activation=potActivation(duel,0,pot);
 const first=jarResponse(activation,{jarSourceUid:jarA.uid});
 const captured=capturePotSynergyEvent(duel,createPotSynergyLedger(),first,lookups);
 const resolved=resolvePotSynergyEvent(duel,captured.ledger,{eventId:first.responseId,effectNegated:false},lookups);
 const second=jarResponse(activation,{responseId:'jar-resp-2',sequence:3,jarSourceUid:jarB.uid});
 assert.throws(()=>capturePotSynergyEvent(duel,resolved.ledger,second,lookups),/já recebeu resposta/);
});
test('a negated Jar Robber effect neither draws nor negates Pot of Greed',()=>{
 const duel=base(),pot=placePot(duel,0),jar=placeJar(duel,0),activation=potActivation(duel,0,pot),event=jarResponse(activation,{jarSourceUid:jar.uid});
 const captured=capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups);
 const resolved=resolvePotSynergyEvent(duel,captured.ledger,{eventId:event.responseId,effectNegated:true},lookups);
 assert.equal(resolved.status,'effect-negated');assert.equal(resolved.plan,null);
});
test('Jar Robber with an empty Deck still negates Pot of Greed and reports deck-out',()=>{
 const duel=base(),pot=placePot(duel,0),jar=placeJar(duel,0),activation=potActivation(duel,0,pot),event=jarResponse(activation,{jarSourceUid:jar.uid});
 moveDeckToGrave(duel,0,0);
 const captured=capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups);
 const resolved=resolvePotSynergyEvent(duel,captured.ledger,{eventId:event.responseId,effectNegated:false},lookups);
 assert.equal(resolved.status,'deck-out');assert.equal(resolved.plan.actualDrawCount,0);
 assert.equal(resolved.plan.negatesEffectOfActivationId,activation.eventId);
});
test('a Normal Spell Pot of Greed can be activated from a Set backrow in the same turn',()=>{
 const duel=base(),pot=placePot(duel,0,'backrow',{setThisTurn:true}),jar=placeJar(duel,0);
 const activation=potActivation(duel,0,pot,{sourceLocation:'backrow'});
 const event=jarResponse(activation,{jarSourceUid:jar.uid});
 assert.equal(capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups).status,'pending-resolution');
});
test('Pot of Greed activation must be in Main Phase and use a physical Pot source',()=>{
 const duel=base(),pot=placePot(duel,0),jar=placeJar(duel,0),activation=potActivation(duel,0,pot,{phase:'battle'});
 assert.throws(()=>capturePotSynergyEvent(duel,createPotSynergyLedger(),jarResponse(activation,{jarSourceUid:jar.uid}),lookups),/Main Phase/);
 const wrong={...activation,sourceUid:jar.uid};
 assert.throws(()=>capturePotSynergyEvent(duel,createPotSynergyLedger(),jarResponse(wrong,{jarSourceUid:jar.uid}),lookups),/Pot of Greed/);
});
test('Avatar of the Pot sends Pot of Greed from the active physical hand as cost, then draws 3',()=>{
 const duel=base(),avatar=placeAvatar(duel,0),cost=take(duel,0,potPlaceholder),event=avatarEvent(duel,0,avatar,cost);
 holder(duel,0).hand.push(cost);
 const captured=capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups);
 assert.equal(captured.status,'pending-resolution');commitCost(duel,0,cost);
 const resolved=resolvePotSynergyEvent(duel,captured.ledger,{eventId:event.eventId,effectNegated:false},lookups);
 assert.equal(resolved.status,'resolved');assert.equal(resolved.plan.requestedDrawCount,3);
 assert.equal(resolved.plan.actualDrawCount,3);assert.equal(resolved.plan.costUid,cost.uid);
 assert.equal(resolved.plan.costCommitted,true);assert.ok(duel.core.players[0].grave.some(card=>card.uid===cost.uid));
 const before=holder(duel,0).hand.length;applyPlan(duel,resolved.plan);assert.equal(holder(duel,0).hand.length,before+3);
});
test('Avatar cannot pay Pot of Greed from a reserve teammate hand',()=>{
 const duel=base(),avatar=placeAvatar(duel,0),cost=take(duel,2,potPlaceholder),event=avatarEvent(duel,0,avatar,cost);
 holder(duel,2).hand.push(cost);
 assert.throws(()=>capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups),/mão privada do assento ativo/);
});
test('Avatar requires an actual Pot of Greed cost card, not another Spell',()=>{
 const duel=base(),avatar=placeAvatar(duel,0),wrong=take(duel,0,jarPlaceholder);
 holder(duel,0).hand.push(wrong);
 const event=avatarEvent(duel,0,avatar,wrong);
 assert.throws(()=>capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups),/Pot of Greed/);
});
test('Avatar must be face-up on its team field and can activate in face-up Defense Position',()=>{
 const duel=base(),avatar=placeAvatar(duel,0,{position:'def'}),cost=take(duel,0,potPlaceholder);
 holder(duel,0).hand.push(cost);
 const event=avatarEvent(duel,0,avatar,cost);
 assert.equal(capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups).status,'pending-resolution');
});
test('Avatar owned by a reserve teammate still uses the active teammate private hand and Deck',()=>{
 const duel=base(2),avatar=placeAvatar(duel,0),reserveCost=take(duel,0,potPlaceholder);
 holder(duel,0).hand.push(reserveCost);
 const invalid=avatarEvent(duel,2,avatar,reserveCost,{eventId:'avatar-reserve',sequence:1});
 assert.throws(()=>capturePotSynergyEvent(duel,createPotSynergyLedger(),invalid,lookups),/mão privada do assento ativo/);
 const activeCost=take(duel,2,potPlaceholder);holder(duel,2).hand.push(activeCost);
 const activeEvent=avatarEvent(duel,2,avatar,activeCost,{eventId:'avatar-active',sequence:1});
 assert.equal(capturePotSynergyEvent(duel,createPotSynergyLedger(),activeEvent,lookups).status,'pending-resolution');
 assert.equal(Number(avatar.uid[1]),0);
});
test('Avatar cost remains in the GY even when its effect is negated',()=>{
 const duel=base(),avatar=placeAvatar(duel,0),cost=take(duel,0,potPlaceholder);
 holder(duel,0).hand.push(cost);
 const event=avatarEvent(duel,0,avatar,cost),captured=capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups);
 commitCost(duel,0,cost);
 const resolved=resolvePotSynergyEvent(duel,captured.ledger,{eventId:event.eventId,effectNegated:true},lookups);
 assert.equal(resolved.status,'effect-negated');assert.equal(resolved.plan,null);
 assert.ok(duel.core.players[0].grave.some(card=>card.uid===cost.uid));
});
test('Avatar effect still resolves after its monster leaves the field, because the cost was paid at activation',()=>{
 const duel=base(),avatar=placeAvatar(duel,0),cost=take(duel,0,potPlaceholder);
 holder(duel,0).hand.push(cost);
 const event=avatarEvent(duel,0,avatar,cost),captured=capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups);
 commitCost(duel,0,cost);removeAvatarToGrave(duel,avatar);
 const resolved=resolvePotSynergyEvent(duel,captured.ledger,{eventId:event.eventId,effectNegated:false},lookups);
 assert.equal(resolved.status,'resolved');assert.equal(resolved.plan.actualDrawCount,3);
});
test('Avatar draws as many as possible then reports deck-out when fewer than three remain',()=>{
 const duel=base(),avatar=placeAvatar(duel,0),cost=take(duel,0,potPlaceholder);
 holder(duel,0).hand.push(cost);moveDeckToGrave(duel,0,2);
 const event=avatarEvent(duel,0,avatar,cost),captured=capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups);
 commitCost(duel,0,cost);
 const resolved=resolvePotSynergyEvent(duel,captured.ledger,{eventId:event.eventId,effectNegated:false},lookups);
 assert.equal(resolved.status,'deck-out');assert.equal(resolved.plan.actualDrawCount,2);assert.equal(resolved.plan.deckOut,true);
 applyPlan(duel,resolved.plan);assert.equal(holder(duel,0).deck.length,0);
});
test('Avatar with no cards in Deck reports deck-out without inventing cards',()=>{
 const duel=base(),avatar=placeAvatar(duel,0),cost=take(duel,0,potPlaceholder);
 holder(duel,0).hand.push(cost);moveDeckToGrave(duel,0,0);
 const event=avatarEvent(duel,0,avatar,cost),captured=capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups);
 commitCost(duel,0,cost);
 const resolved=resolvePotSynergyEvent(duel,captured.ledger,{eventId:event.eventId,effectNegated:false},lookups);
 assert.equal(resolved.status,'deck-out');assert.equal(resolved.plan.actualDrawCount,0);
});
test('Avatar does not discard to the six-card hand limit until the End Phase',()=>{
 const duel=base(),avatar=placeAvatar(duel,0),cost=take(duel,0,potPlaceholder);
 holder(duel,0).hand.push(cost);holder(duel,0).hand.push(...holder(duel,0).deck.splice(0,1));
 const event=avatarEvent(duel,0,avatar,cost),captured=capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups);
 commitCost(duel,0,cost);
 const resolved=resolvePotSynergyEvent(duel,captured.ledger,{eventId:event.eventId,effectNegated:false},lookups);
 applyPlan(duel,resolved.plan);assert.equal(holder(duel,0).hand.length,8);
 assert.equal(require('../dist/rulesProfile').rulesFor(duel.core).handCheck,'end');
});
test('event capture and resolution are idempotent and reject changed payload/choice',()=>{
 const duel=base(),avatar=placeAvatar(duel,0),cost=take(duel,0,potPlaceholder);
 holder(duel,0).hand.push(cost);
 const event=avatarEvent(duel,0,avatar,cost),ledger=createPotSynergyLedger();
 const first=capturePotSynergyEvent(duel,ledger,event,lookups);
 assert.equal(capturePotSynergyEvent(duel,first.ledger,event,lookups).status,'pending-resolution');
 commitCost(duel,0,cost);
 const resolved=resolvePotSynergyEvent(duel,first.ledger,{eventId:event.eventId,effectNegated:false},lookups);
 assert.equal(resolvePotSynergyEvent(duel,resolved.ledger,{eventId:event.eventId,effectNegated:false},lookups).status,'duplicate');
 assert.throws(()=>resolvePotSynergyEvent(duel,resolved.ledger,{eventId:event.eventId,effectNegated:true},lookups),/negação diferente/);
 assert.throws(()=>capturePotSynergyEvent(duel,first.ledger,{...event,phase:'main2'},lookups),/conteúdo diferente/);
});
test('event sequences must be strictly increasing',()=>{
 const duel=base(),avatar=placeAvatar(duel,0),cost=take(duel,0,potPlaceholder);
 holder(duel,0).hand.push(cost);
 const event=avatarEvent(duel,0,avatar,cost,{sequence:2}),first=capturePotSynergyEvent(duel,createPotSynergyLedger(),event,lookups);
 commitCost(duel,0,cost);
 const resolved=resolvePotSynergyEvent(duel,first.ledger,{eventId:event.eventId,effectNegated:true},lookups);
 const next={...event,eventId:'avatar-lower',sequence:2};
 assert.throws(()=>capturePotSynergyEvent(duel,resolved.ledger,next,lookups),/estritamente crescente/);
});
test('invalid Deck size, Monster Zone count and Extra Deck size are rejected',()=>{
 const short=base();short.core.players[0].deck.pop();assert.throws(()=>assertPotSynergyRules(short),/20–30/);
 const crowded=base();for(let i=0;i<4;i++){const card=take(crowded,0,normalIds[i]);crowded.core.players[0].monsters.push({...card,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,owner:0});}
 assert.throws(()=>assertPotSynergyRules(crowded),/três Monster Zones/);
 const extra=base();for(let i=0;i<6;i++)extra.core.players[0].extra.push(take(extra,0,normalIds[i]));
 assert.throws(()=>assertPotSynergyRules(extra),/Extra Deck físico excedeu cinco/);
});
