const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagInventory}=require('../dist/tagDuel');
const {enabledCardIds,engineCard}=require('../dist/effectRegistry');
const {
 GRAVEKEEPERS_SERVANT_ID,GRAVEKEEPERS_SERVANT_KONAMI_CID,lookupGravekeeperServantEffect,
 createGravekeeperServantAdapter,assertGravekeeperServantRules
}=require('../dist/gravekeeperServantTagAdapter');

function unique(kind,count){
 const seen=new Set();
 return enabledCardIds.filter(id=>{
  const card=engineCard(id);if(!card||card.kind!==kind||card.fusion)return false;
  const name=card.englishName||card.name;if(seen.has(name))return false;seen.add(name);return true;
 }).slice(0,count);
}
const monsterIds=unique('monster',8),spellIds=unique('spell',6),trapIds=unique('trap',8);
const fusionIds=enabledCardIds.filter(id=>!!engineCard(id)?.fusion).slice(0,5);
assert.equal(monsterIds.length,8);assert.equal(spellIds.length,6);assert.ok(trapIds.length>=6);assert.equal(fusionIds.length,5);
const deck=[...monsterIds,...spellIds,...trapIds.slice(0,6)];assert.equal(deck.length,20);
const fixture={servantA:spellIds[0],servantB:spellIds[1],other:spellIds[2]};
function lookup(id){
 if(id===fixture.servantA||id===fixture.servantB)return {kind:'spell',effect:'gravekeepers-servant'};
 return undefined;
}
function makeAdapter(canSend=()=>true){return createGravekeeperServantAdapter(lookup,canSend);}
function setup(seed='m667-gravekeeper',first=2,canSend=()=>true){
 const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...deck],extra:[...fusionIds]}));
 const duel=createTagDuel(players,{classic:true,first,seed}),adapter=makeAdapter(canSend);
 return {session:adapter.createSession(duel),adapter};
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
function setSource(session,team=1,which='a',seat=session.duel.active[team],options={}){
 const id=which==='a'?fixture.servantA:which==='b'?fixture.servantB:fixture.other,card=take(session.duel,seat,id);
 const source={...card,setTurn:options.setTurn??session.duel.core.turn,faceUp:options.faceUp??true,resolved:options.resolved??true};
 session.duel.core.players[team].backrow.push(source);return source;
}
function deploy(session,team=0,id=monsterIds[0],seat=session.duel.active[team]){
 const card=take(session.duel,seat,id);
 const monster={...card,position:'atk',faceUp:true,entered:session.duel.core.turn,changed:session.duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:team};
 session.duel.core.players[team].monsters.push(monster);return monster;
}
function eventFor(session,monster,eventId='attack-1',overrides={}){
 session.duel.core.phase='battle';
 return {eventId,attackerUid:monster.uid,attackerSeat:session.duel.cursor,turn:session.duel.core.turn,...overrides};
}
function register(session,adapter,team=1,which='a',seat=session.duel.active[team],options={}){
 const source=setSource(session,team,which,seat,options);adapter.registerSource(session,team,source.uid);return source;
}
function inventory(duel){return new Map(tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]));}
function assertInventoryEqual(before,duel){
 const after=inventory(duel);assert.equal(after.size,before.size);
 for(const [uid,id]of before)assert.equal(after.get(uid),id);
}
function grave(duel,team){return duel.core.players[team].grave;}
function capture(session,adapter,monster,id='attack-1',overrides={}){return adapter.captureAttackDeclaration(session,eventFor(session,monster,id,overrides));}

test('M667 identity and official database reference are explicit',()=>{
 assert.equal(GRAVEKEEPERS_SERVANT_ID,'16762927');assert.equal(GRAVEKEEPERS_SERVANT_KONAMI_CID,4893);
 assert.deepEqual(lookupGravekeeperServantEffect(GRAVEKEEPERS_SERVANT_ID),{kind:'spell',effect:'gravekeepers-servant'});
 assert.equal(lookupGravekeeperServantEffect('00000000'),undefined);
});
test('baseline 2v2 preserves Deck 20–30, Extra 5, zones 3+3 and End Phase hand limit',()=>{
 const {session}=setup();assertGravekeeperServantRules(session.duel);
 assert.equal(session.duel.mode,'tag-classic');assert.deepEqual(session.duel.active,[2,3]);
 assert.ok(session.duel.reserves['0']);assert.ok(session.duel.reserves['1']);
});
test('a Continuous Spell may tax attacks immediately after it resolves this turn',()=>{
 const {session,adapter}=setup(),source=register(session,adapter,1,'a',session.duel.active[1],{setTurn:session.duel.core.turn});
 const monster=deploy(session),top=holder(session.duel,session.duel.active[0]).deck[0].uid;
 const result=capture(session,adapter,monster,'same-turn');
 assert.equal(result.allowed,true);assert.equal(result.reason,'paid');assert.deepEqual(result.paidUids,[top]);
 assert.ok(grave(session.duel,0).some(card=>card.uid===top));assert.ok(source);
});
test('only a face-up and resolved Gravekeeper source can be registered',()=>{
 for(const options of [{faceUp:false},{resolved:false}]){
  const {session,adapter}=setup(),source=setSource(session,1,'a',session.duel.active[1],options);
  assert.throws(()=>adapter.registerSource(session,1,source.uid),/face-up e resolvida/);
 }
});
test('unknown Spell and absent source cannot be registered as Gravekeeper',()=>{
 const {session,adapter}=setup(),source=setSource(session,1,'other');
 assert.throws(()=>adapter.registerSource(session,1,source.uid),/não pertence à família Gravekeeper/);
 assert.throws(()=>adapter.registerSource(session,1,'m3:not-on-field'),/não pertence à família Gravekeeper/);
});
test('one opposing source sends the top card of the active physical attacker Deck to shared GY',()=>{
 const {session,adapter}=setup(),source=register(session,adapter),monster=deploy(session);
 const activeSeat=session.duel.active[0],top=holder(session.duel,activeSeat).deck[0],before=inventory(session.duel);
 const result=capture(session,adapter,monster,'one-source');
 assert.equal(result.sourceCount,1);assert.equal(result.requiredCards,1);assert.equal(result.allowed,true);
 assert.equal(result.paidUids[0],top.uid);assert.ok(grave(session.duel,0).some(card=>card.uid===top.uid));
 assertInventoryEqual(before,session.duel);assert.ok(source);
});
test('the active representative pays even when the attacking monster belongs physically to the partner',()=>{
 const {session,adapter}=setup(),activeSeat=session.duel.active[0],partnerSeat=0;
 register(session,adapter);const monster=deploy(session,0,monsterIds[1],partnerSeat);
 const activeTop=holder(session.duel,activeSeat).deck[0].uid,partnerTop=holder(session.duel,partnerSeat).deck[0].uid;
 const result=capture(session,adapter,monster,'partner-monster');
 assert.deepEqual(result.paidUids,[activeTop]);assert.equal(holder(session.duel,partnerSeat).deck[0].uid,partnerTop);
 assert.ok(grave(session.duel,0).some(card=>card.uid===activeTop));
});
test('a source controlled by the attacking team does not tax its own attacks',()=>{
 const {session,adapter}=setup();register(session,adapter,0,'a',session.duel.active[0]);
 const monster=deploy(session),top=holder(session.duel,session.duel.active[0]).deck[0].uid;
 const result=capture(session,adapter,monster,'own-source');
 assert.equal(result.allowed,true);assert.equal(result.reason,'no-active-source');assert.deepEqual(result.paidUids,[]);
 assert.equal(holder(session.duel,session.duel.active[0]).deck[0].uid,top);
});
test('two opposing copies are cumulative and require two top cards',()=>{
 const {session,adapter}=setup();register(session,adapter,1,'a');register(session,adapter,1,'b');
 const monster=deploy(session),top=holder(session.duel,session.duel.active[0]).deck.slice(0,2).map(card=>card.uid);
 const result=capture(session,adapter,monster,'two-sources');
 assert.equal(result.sourceCount,2);assert.equal(result.requiredCards,2);assert.deepEqual(result.paidUids,top);
 assert.ok(top.every(uid=>grave(session.duel,0).some(card=>card.uid===uid)));
});
test('only opposing-team copies count when both teams control a source',()=>{
 const {session,adapter}=setup();register(session,adapter,0,'a',session.duel.active[0]);register(session,adapter,1,'b');
 const monster=deploy(session),result=capture(session,adapter,monster,'both-teams');
 assert.equal(result.sourceCount,1);assert.equal(result.requiredCards,1);
});
test('insufficient active physical Deck blocks the attack without moving cards',()=>{
 const {session,adapter}=setup();register(session,adapter,1,'a');register(session,adapter,1,'b');
 const monster=deploy(session),seat=session.duel.active[0],held=holder(session.duel,seat),removed=held.deck.splice(1);
 grave(session.duel,0).push(...removed);
 const top=held.deck.map(card=>card.uid),before=inventory(session.duel);
 const result=capture(session,adapter,monster,'insufficient');
 assert.equal(result.allowed,false);assert.equal(result.reason,'insufficient-deck');assert.deepEqual(result.paidUids,[]);
 assert.deepEqual(held.deck.map(card=>card.uid),top);assertInventoryEqual(before,session.duel);
});
test('a replacement that cannot send the top card to GY blocks payment without mutation',()=>{
 const {session,adapter}=setup('m667-replacement',2,()=>false);register(session,adapter,1);
 const monster=deploy(session),held=holder(session.duel,session.duel.active[0]),top=held.deck.map(card=>card.uid),before=inventory(session.duel);
 const result=capture(session,adapter,monster,'replacement');
 assert.equal(result.allowed,false);assert.equal(result.reason,'destination-replaced');
 assert.deepEqual(held.deck.map(card=>card.uid),top);assertInventoryEqual(before,session.duel);
});
test('the attack cost remains paid if a later response negates the attack',()=>{
 const {session,adapter}=setup();register(session,adapter,1);const monster=deploy(session);
 const result=capture(session,adapter,monster,'negated-later');
 session.duel.core.phase='response';
 assert.equal(result.allowed,true);assert.equal(result.reason,'paid');
 assert.ok(result.paidUids.every(uid=>grave(session.duel,0).some(card=>card.uid===uid)));
});
test('a negated continuous source does not tax a new declaration',()=>{
 const {session,adapter}=setup(),source=register(session,adapter,1);
 adapter.setSourceNegated(session,source.uid,true);
 const monster=deploy(session),result=capture(session,adapter,monster,'negated-source');
 assert.equal(result.allowed,true);assert.equal(result.reason,'no-active-source');assert.deepEqual(result.paidUids,[]);
});
test('a source that leaves the backrow no longer taxes attacks',()=>{
 const {session,adapter}=setup(),source=register(session,adapter,1);
 const backrow=session.duel.core.players[1].backrow,index=backrow.findIndex(card=>card.uid===source.uid);
 grave(session.duel,1).push(...backrow.splice(index,1));
 const monster=deploy(session),result=capture(session,adapter,monster,'removed-source');
 assert.equal(result.reason,'no-active-source');assert.deepEqual(result.paidUids,[]);
});
test('a registered source turned face-down no longer taxes attacks',()=>{
 const {session,adapter}=setup(),source=register(session,adapter,1);
 source.faceUp=false;const monster=deploy(session),result=capture(session,adapter,monster,'set-source');
 assert.equal(result.reason,'no-active-source');assert.deepEqual(result.paidUids,[]);
});
test('a registered source whose resolution is negated no longer taxes attacks',()=>{
 const {session,adapter}=setup(),source=register(session,adapter,1);
 source.resolved=false;const monster=deploy(session),result=capture(session,adapter,monster,'unresolved-source');
 assert.equal(result.reason,'no-active-source');assert.deepEqual(result.paidUids,[]);
});
test('source negation can be lifted without registering a duplicate copy',()=>{
 const {session,adapter}=setup(),source=register(session,adapter,1);
 adapter.setSourceNegated(session,source.uid,true);adapter.setSourceNegated(session,source.uid,false);
 const monster=deploy(session),result=capture(session,adapter,monster,'negation-lifted');
 assert.equal(result.reason,'paid');assert.equal(result.sourceCount,1);
});
test('source removal clears its active and negated registration',()=>{
 const {session,adapter}=setup(),source=register(session,adapter,1);
 adapter.setSourceNegated(session,source.uid,true);assert.equal(adapter.removeSource(session,source.uid),true);
 assert.equal(adapter.removeSource(session,source.uid),false);
 assert.equal(session.negatedSources[source.uid],undefined);
});
test('a physical source cannot be registered from another team backrow',()=>{
 const {session,adapter}=setup(),source=setSource(session,1);
 assert.throws(()=>adapter.registerSource(session,0,source.uid),/não pertence à família Gravekeeper/);
});
test('attack declaration is bound to the active physical seat',()=>{
 const {session,adapter}=setup(),monster=deploy(session);
 assert.throws(()=>adapter.captureAttackDeclaration(session,{...eventFor(session,monster,'wrong-seat'),attackerSeat:0}),/representante físico ativo/);
});
test('only a monster controlled by the active team may declare this event',()=>{
 const {session,adapter}=setup(),opponent=deploy(session,1,monsterIds[2],session.duel.active[1]);
 assert.throws(()=>adapter.captureAttackDeclaration(session,eventFor(session,opponent,'wrong-team')),/equipe ativa/);
});
test('stale turn and non-Battle Phase events are rejected',()=>{
 const {session,adapter}=setup(),monster=deploy(session),event=eventFor(session,monster,'stale-turn',{turn:session.duel.core.turn-1});
 assert.throws(()=>adapter.captureAttackDeclaration(session,event),/fase ou turno/);
 const {session:other,adapter:otherAdapter}=setup(),otherMonster=deploy(other),wrongPhase=eventFor(other,otherMonster,'wrong-phase');
 other.duel.core.phase='main';
 assert.throws(()=>otherAdapter.captureAttackDeclaration(other,wrongPhase),/fase ou turno/);
});
test('an identical event replay returns the stored receipt without paying twice',()=>{
 const {session,adapter}=setup();register(session,adapter,1);const monster=deploy(session);
 const first=capture(session,adapter,monster,'replay'),deckAfter=holder(session.duel,session.duel.active[0]).deck.map(card=>card.uid);
 const replay=adapter.captureAttackDeclaration(session,eventFor(session,monster,'replay'));
 assert.equal(first.replayed,false);assert.equal(replay.replayed,true);assert.deepEqual(replay.paidUids,first.paidUids);
 assert.deepEqual(holder(session.duel,session.duel.active[0]).deck.map(card=>card.uid),deckAfter);
});
test('a stored event can be replayed after the response window without revalidation',()=>{
 const {session,adapter}=setup();register(session,adapter,1);const monster=deploy(session);
 const first=capture(session,adapter,monster,'late-replay'),replayEvent=eventFor(session,monster,'late-replay');session.duel.core.phase='response';
 const replay=adapter.captureAttackDeclaration(session,replayEvent);
 assert.equal(replay.replayed,true);assert.deepEqual(replay.paidUids,first.paidUids);
});
test('an event ID cannot be reused for another attacker',()=>{
 const {session,adapter}=setup();register(session,adapter,1);const firstMonster=deploy(session,0,monsterIds[0]),secondMonster=deploy(session,0,monsterIds[1]);
 capture(session,adapter,firstMonster,'reused-id');
 assert.throws(()=>adapter.captureAttackDeclaration(session,eventFor(session,secondMonster,'reused-id')),/reutilizado/);
});
test('a source in the opponent team taxes any eligible monster, not only its owner',()=>{
 const {session,adapter}=setup();register(session,adapter,1);const monster=deploy(session,0,monsterIds[3],0);
 const result=capture(session,adapter,monster,'partner-source');
 assert.equal(result.allowed,true);assert.equal(result.reason,'paid');
});
test('the card sent from the top retains its physical owner UID in the shared Graveyard',()=>{
 const {session,adapter}=setup();register(session,adapter,1);const seat=session.duel.active[0],monster=deploy(session),top=holder(session.duel,seat).deck[0];
 const result=capture(session,adapter,monster,'owner-uid');
 assert.equal(result.paidUids[0],top.uid);assert.match(top.uid,new RegExp('^m'+seat+':'));
 assert.ok(grave(session.duel,0).some(card=>card.uid===top.uid));
});
test('inventory identity and quantity are conserved after payment',()=>{
 const {session,adapter}=setup();register(session,adapter,1);const monster=deploy(session),before=inventory(session.duel);
 capture(session,adapter,monster,'inventory');assertInventoryEqual(before,session.duel);
});
test('a seven-card hand is preserved; this adapter never enforces the End Phase limit early',()=>{
 const {session,adapter}=setup();register(session,adapter,1);const seat=session.duel.active[0],monster=deploy(session),held=holder(session.duel,seat);
 held.hand.push(held.deck.shift());const handBefore=held.hand.map(card=>card.uid);
 capture(session,adapter,monster,'hand-limit');
 assert.deepEqual(held.hand.map(card=>card.uid),handBefore);
});
test('the attacker team Deck is used when the turn is led by the other team',()=>{
 const {session,adapter}=setup('m667-team-one',3);register(session,adapter,0,'a',session.duel.active[0]);
 const monster=deploy(session,1,monsterIds[4]),seat=session.duel.active[1],top=holder(session.duel,seat).deck[0].uid;
 const result=capture(session,adapter,monster,'team-one');
 assert.equal(result.attackerSeat,seat);assert.deepEqual(result.paidUids,[top]);assert.ok(grave(session.duel,1).some(card=>card.uid===top));
});
test('main Deck lower bound is checked against physical inventory',()=>{
 const {session}=setup(),held=holder(session.duel,session.duel.active[0]);held.deck.pop();
 assert.throws(()=>assertGravekeeperServantRules(session.duel),/fora de 20–30/);
});
test('Extra Deck above five is rejected without changing any player inventory',()=>{
 const {session}=setup(),extra=session.duel.core.players[0].extra,card=extra[0];
 extra.push({...card,uid:card.uid+':overflow'});
 assert.throws(()=>assertGravekeeperServantRules(session.duel),/excedeu cinco/);
});
test('fourth Monster Zone and fourth Spell/Trap Zone are rejected',()=>{
 const {session}=setup(),monster=deploy(session),card=take(session.duel,session.duel.active[0],monsterIds[5]);
 session.duel.core.players[0].monsters.push({...monster,...card,uid:card.uid,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});
 assert.throws(()=>assertGravekeeperServantRules(session.duel),/mais de três Monster Zones/);
 const {session:other}=setup(),source=setSource(other,1),held=holder(other.duel,other.duel.active[1]),fill=take(other.duel,other.duel.active[1],spellIds[3]);
 other.duel.core.players[1].backrow.push({...fill,setTurn:1,faceUp:false,resolved:false},{...fill,uid:fill.uid+':extra',setTurn:1,faceUp:false,resolved:false},{...source,uid:source.uid+':extra',setTurn:1,faceUp:false,resolved:false});
 assert.throws(()=>assertGravekeeperServantRules(other.duel),/mais de três Spell\/Trap Zones/);
});
test('session survives JSON serialization with active source and receipts',()=>{
 const {session,adapter}=setup();register(session,adapter,1);const monster=deploy(session);
 capture(session,adapter,monster,'json');const restored=JSON.parse(JSON.stringify(session));
 assert.doesNotThrow(()=>adapter.captureAttackDeclaration(restored,eventFor(restored,monster,'json')));
});

test('prototype keys cannot poison the idempotency receipt ledger',()=>{
 const {session,adapter}=setup(),monster=deploy(session);
 assert.throws(()=>adapter.captureAttackDeclaration(session,eventFor(session,monster,'__proto__')),/Identificador de ataque inválido/);
 assert.equal(Object.prototype.hasOwnProperty.call(session.receipts,'__proto__'),false);
});
