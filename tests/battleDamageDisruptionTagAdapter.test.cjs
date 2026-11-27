const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagInventory}=require('../dist/tagDuel');
const {enabledCardIds,engineCard}=require('../dist/effectRegistry');
const {randomIndex}=require('../dist/duelRandom');
const {
 ROBBIN_GOBLIN_ID,ROBBIN_GOBLIN_KONAMI_CID,ROBBIN_ZOMBIE_ID,ROBBIN_ZOMBIE_KONAMI_CID,
 lookupBattleDamageEffect,createBattleDamageDisruptionAdapter,assertBattleDamageRules
}=require('../dist/battleDamageDisruptionTagAdapter');
function unique(kind,count){
 const seen=new Set();
 return enabledCardIds.filter(id=>{const card=engineCard(id);if(!card||card.kind!==kind||card.fusion)return false;const name=card.englishName||card.name;if(seen.has(name))return false;seen.add(name);return true;}).slice(0,count);
}
const monsterIds=unique('monster',8),spellIds=unique('spell',6),trapIds=unique('trap',8),fusionIds=enabledCardIds.filter(id=>!!engineCard(id)?.fusion).slice(0,5);
assert.equal(monsterIds.length,8);assert.equal(spellIds.length,6);assert.ok(trapIds.length>=6);assert.equal(fusionIds.length,5);
const deck=[...monsterIds,...spellIds,...trapIds.slice(0,6)];assert.equal(deck.length,20);
const fixture={goblin:trapIds[0],zombie:trapIds[1],other:trapIds[2]};
function lookup(id){if(id===fixture.goblin)return {kind:'trap',effect:'robbin-goblin'};if(id===fixture.zombie)return {kind:'trap',effect:'robbin-zombie'};return undefined;}
const adapter=createBattleDamageDisruptionAdapter(lookup);
function setup(seed='m665-battle-damage',first=2){
 const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...deck],extra:[...fusionIds]}));
 const duel=createTagDuel(players,{classic:true,first,seed});
 return {session:adapter.createSession(duel),adapter};
}
function holder(duel,seat){const team=seat%2;return duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];}
function take(duel,seat,id){
 const held=holder(duel,seat);
 for(const zone of ['hand','deck','extra']){const list=held[zone]||[],index=list.findIndex(card=>card.id===id);if(index>=0)return list.splice(index,1)[0];}
 throw new Error('Fixture card not found: '+id);
}
function deploy(session,team,id,seat=session.duel.active[team]){
 const card=take(session.duel,seat,id),monster={...card,position:'atk',faceUp:true,entered:session.duel.core.turn,changed:session.duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:team};
 session.duel.core.players[team].monsters.push(monster);return monster;
}
function setSource(session,team,effect='goblin',seat=session.duel.active[team],options={}){
 const id=effect==='goblin'?fixture.goblin:effect==='zombie'?fixture.zombie:fixture.other,card=take(session.duel,seat,id);
 const source={...card,setTurn:options.setTurn??session.duel.core.turn-1,faceUp:options.faceUp??true,resolved:options.resolved??true};
 session.duel.core.players[team].backrow.push(source);return source;
}
function eventFor(session,monster,eventId='damage-1',damage=500,overrides={}){
 session.duel.core.phase='battle';
 return {eventId,attackerUid:monster.uid,attackerSeat:session.duel.active[0],damagedSeat:session.duel.active[1],damage,turn:session.duel.core.turn,...overrides};
}
function prepare(session,effect='goblin'){
 const source=setSource(session,0,effect),monster=deploy(session,0,monsterIds[0]),registered=adapter.registerSource(session,0,source.uid);
 return {source,monster,registered};
}
function inventory(duel){return new Map(tagInventory(duel).filter(c=>c.entityKind!=='token').map(c=>[c.uid,c.id]));}
function assertInventoryEqual(before,duel){const after=inventory(duel);assert.equal(after.size,before.size);for(const [uid,id]of before)assert.equal(after.get(uid),id);}
function grave(duel,team){return duel.core.players[team].grave;}
function capture(session,monster,id='damage-1',damage=500,overrides={}){return adapter.captureBattleDamage(session,eventFor(session,monster,id,damage,overrides));}

test('M665 identities and Konami database references are explicit and distinct',()=>{
 assert.equal(ROBBIN_GOBLIN_ID,'88279736');assert.equal(ROBBIN_GOBLIN_KONAMI_CID,4876);
 assert.equal(ROBBIN_ZOMBIE_ID,'83258273');assert.equal(ROBBIN_ZOMBIE_KONAMI_CID,5920);
 assert.deepEqual(lookupBattleDamageEffect(ROBBIN_GOBLIN_ID),{kind:'trap',effect:'robbin-goblin'});
 assert.deepEqual(lookupBattleDamageEffect(ROBBIN_ZOMBIE_ID),{kind:'trap',effect:'robbin-zombie'});
 assert.equal(lookupBattleDamageEffect('00000000'),undefined);
});
test('baseline 2v2 preserves Deck 20–30, Extra 5, 3+3 zones and End Phase hand limit',()=>{
 const {session}=setup();assertBattleDamageRules(session.duel);
 assert.equal(session.duel.mode,'tag-classic');assert.equal(session.duel.core.players.length,2);
 assert.deepEqual(session.duel.active,[2,3]);assert.ok(session.duel.reserves['0']);assert.ok(session.duel.reserves['1']);
});
test('a continuous Trap must be face-up, resolved and set before this turn',()=>{
 for(const options of [{faceUp:false},{resolved:false},{setTurn:1}]){
  const {session}=setup(),source=setSource(session,0,'goblin',session.duel.active[0],options);
  assert.throws(()=>adapter.registerSource(session,0,source.uid),/ativada e resolvida/);
 }
});
test('unknown Trap and missing source cannot be registered as Robbin cards',()=>{
 const {session}=setup(),source=setSource(session,0,'other');
 assert.throws(()=>adapter.registerSource(session,0,source.uid),/não pertence à família Robbin/);
 assert.throws(()=>adapter.registerSource(session,0,'m2:not-on-field'),/não está na Zona/);
});
test('Robbin Goblin triggers only for positive battle damage',()=>{
 const {session}=setup(),{monster}=prepare(session,'goblin'),before=holder(session.duel,session.duel.active[1]).hand.map(c=>c.uid);
 const result=capture(session,monster,'zero-damage',0);
 assert.deepEqual(result.activationIds,[]);assert.equal(result.replayed,false);
 assert.deepEqual(holder(session.duel,session.duel.active[1]).hand.map(c=>c.uid),before);
});
test('Robbin Goblin discards one deterministic random card from the physical damaged seat',()=>{
 const {session}=setup('m665-goblin-deterministic'),{monster}=prepare(session,'goblin');
 const recipient=session.duel.active[1],target=holder(session.duel,recipient),partner=holder(session.duel,1);
 const partnerBefore=partner.hand.map(c=>c.uid),before=inventory(session.duel),random=structuredClone(session.duel.core.random);
 const expected=target.hand[randomIndex(random,target.hand.length)].uid,initialSize=target.hand.length;
 const captured=capture(session,monster,'goblin-hit',700);assert.equal(captured.activationIds.length,1);
 const result=adapter.resolveTrigger(session,captured.activationIds[0]);
 assert.equal(result.effect,'robbin-goblin');assert.equal(result.targetSeat,recipient);assert.equal(result.applied,true);assert.equal(result.destination,'grave');
 assert.equal(holder(session.duel,recipient).hand.length,initialSize-1);assert.ok(grave(session.duel,1).some(c=>c.uid===expected));
 assert.deepEqual(holder(session.duel,1).hand.map(c=>c.uid),partnerBefore);assert.equal(JSON.stringify(result).includes(expected),false);
 assertInventoryEqual(before,session.duel);
});
test('Robbin Goblin uses the persisted HMAC stream, not Math.random',()=>{
 function run(){
  const {session}=setup('m665-repeatable'),{monster}=prepare(session,'goblin'),target=holder(session.duel,session.duel.active[1]),random=structuredClone(session.duel.core.random);
  const expected=target.hand[randomIndex(random,target.hand.length)].uid,captured=capture(session,monster,'repeatable-hit',300);
  adapter.resolveTrigger(session,captured.activationIds[0]);return grave(session.duel,1).find(c=>c.uid===expected)?.uid;
 }
 assert.equal(run(),run());
});
test('Robbin Zombie sends the top card of the damaged physical Deck to the shared Graveyard',()=>{
 const {session}=setup(),{monster}=prepare(session,'zombie'),recipient=session.duel.active[1],target=holder(session.duel,recipient),partner=holder(session.duel,1);
 const expected=target.deck[0].uid,partnerTop=partner.deck[0].uid,before=inventory(session.duel),initialSize=target.deck.length;
 const captured=capture(session,monster,'zombie-hit',450),result=adapter.resolveTrigger(session,captured.activationIds[0]);
 assert.equal(result.effect,'robbin-zombie');assert.equal(result.applied,true);assert.equal(result.targetSeat,recipient);
 assert.equal(holder(session.duel,recipient).deck.length,initialSize-1);assert.ok(grave(session.duel,1).some(c=>c.uid===expected));
 assert.equal(holder(session.duel,1).deck[0].uid,partnerTop);assertInventoryEqual(before,session.duel);
});
test('the active defender seat is bound at damage time; its partner private hand stays untouched',()=>{
 const {session}=setup(),{monster}=prepare(session,'goblin'),partnerBefore=holder(session.duel,1).hand.map(c=>c.uid);
 const captured=capture(session,monster,'seat-bound',200);adapter.resolveTrigger(session,captured.activationIds[0]);
 assert.deepEqual(holder(session.duel,1).hand.map(c=>c.uid),partnerBefore);assert.equal(grave(session.duel,1).length,1);
 assert.equal(session.duel.active[1],3);
});
test('a source removed after trigger capture no longer resolves its continuous effect',()=>{
 const {session}=setup(),{source,monster}=prepare(session,'goblin'),captured=capture(session,monster,'source-removed',500),before=inventory(session.duel);
 const index=session.duel.core.players[0].backrow.findIndex(c=>c.uid===source.uid),removed=session.duel.core.players[0].backrow.splice(index,1)[0];
 session.duel.core.players[0].grave.push(removed);
 const result=adapter.resolveTrigger(session,captured.activationIds[0]);
 assert.equal(result.negation,'source-inactive');assert.equal(result.applied,false);assertInventoryEqual(before,session.duel);
});
test('a source flipped face-down after trigger capture does not resolve',()=>{
 const {session}=setup(),{source,monster}=prepare(session,'zombie'),captured=capture(session,monster,'source-facedown',500);
 session.duel.core.players[0].backrow.find(c=>c.uid===source.uid).faceUp=false;
 const result=adapter.resolveTrigger(session,captured.activationIds[0]);assert.equal(result.negation,'source-inactive');assert.equal(result.applied,false);
});
test('a negated continuous source does not resolve its queued trigger',()=>{
 const {session}=setup(),{source,monster}=prepare(session,'goblin'),captured=capture(session,monster,'source-negated',500);
 adapter.setSourceNegated(session,source.uid,true);
 const result=adapter.resolveTrigger(session,captured.activationIds[0]);assert.equal(result.negation,'source-inactive');assert.equal(result.applied,false);
});
test('activation negation and effect negation consume the trigger without moving a card',()=>{
 for(const negation of ['activation','effect']){
  const {session}=setup(),{monster}=prepare(session,'goblin'),before=inventory(session.duel),captured=capture(session,monster,'negated-'+negation,400);
  const handBefore=holder(session.duel,session.duel.active[1]).hand.map(c=>c.uid),result=adapter.resolveTrigger(session,captured.activationIds[0],negation);
  assert.equal(result.negation,negation);assert.equal(result.applied,false);assert.deepEqual(holder(session.duel,session.duel.active[1]).hand.map(c=>c.uid),handBefore);assertInventoryEqual(before,session.duel);
 }
});
test('event capture is idempotent and rejects reuse with different damage',()=>{
 const {session}=setup(),{monster}=prepare(session,'goblin'),event=eventFor(session,monster,'same-event',500);
 const first=adapter.captureBattleDamage(session,event),second=adapter.captureBattleDamage(session,event);
 assert.equal(first.replayed,false);assert.equal(second.replayed,true);assert.deepEqual(second.activationIds,first.activationIds);
 assert.throws(()=>adapter.captureBattleDamage(session,{...event,damage:501}),/reutilizado/);
});
test('a resolved trigger replays safely after JSON restoration without a second discard',()=>{
 const {session}=setup(),{monster}=prepare(session,'goblin'),captured=capture(session,monster,'restore-once',500),result=adapter.resolveTrigger(session,captured.activationIds[0]);
 const restored=JSON.parse(JSON.stringify(session)),replay=adapter.resolveTrigger(restored,captured.activationIds[0]);
 assert.equal(result.applied,true);assert.equal(replay.replayed,true);assert.equal(grave(restored.duel,1).length,1);
});
test('two active Robbin sources create independent mandatory triggers for one damage event',()=>{
 const {session}=setup(),goblin=setSource(session,0,'goblin'),zombie=setSource(session,0,'zombie'),monster=deploy(session,0,monsterIds[0]);
 adapter.registerSource(session,0,goblin.uid);adapter.registerSource(session,0,zombie.uid);
 const captured=capture(session,monster,'both-sources',600);assert.equal(captured.activationIds.length,2);
 assert.equal(holder(session.duel,session.duel.active[1]).hand.length,4);
 assert.equal(holder(session.duel,session.duel.active[1]).deck.length,deck.length-4);
 for(const id of captured.activationIds)adapter.resolveTrigger(session,id);
 assert.equal(holder(session.duel,session.duel.active[1]).hand.length,3);
 assert.equal(holder(session.duel,session.duel.active[1]).deck.length,deck.length-5);assert.equal(grave(session.duel,1).length,2);
});
test('an opponent-controlled Robbin source does not trigger for this team damage',()=>{
 const {session}=setup(),source=setSource(session,1,'goblin',session.duel.active[1]),monster=deploy(session,0,monsterIds[0]);
 adapter.registerSource(session,1,source.uid);const result=capture(session,monster,'opponent-source',500);assert.deepEqual(result.activationIds,[]);
});
test('inactive partner seats cannot be substituted for the active damage recipient',()=>{
 const {session}=setup(),{monster}=prepare(session,'goblin');
 assert.throws(()=>capture(session,monster,'wrong-defender',500,{damagedSeat:1}),/assentos ativos/);
});
test('an inactive partner cannot claim to be the attacking seat',()=>{
 const {session}=setup(),{monster}=prepare(session,'goblin');
 assert.throws(()=>capture(session,monster,'wrong-attacker',500,{attackerSeat:0}),/assentos ativos/);
});
test('face-down or Defense Position monsters cannot forge a battle-damage event',()=>{
 for(const change of [{faceUp:false},{position:'def'}]){
  const {session}=setup(),{monster}=prepare(session,'goblin');Object.assign(monster,change);
  assert.throws(()=>capture(session,monster,'invalid-attacker-'+Object.keys(change)[0],100),/monstro face-up em Ataque/);
 }
});
test('negative/fractional damage and stale-turn events are rejected',()=>{
 const {session}=setup(),{monster}=prepare(session,'goblin');
 assert.throws(()=>capture(session,monster,'negative',-1),/Dano, fase ou turno/);
 assert.throws(()=>capture(session,monster,'fractional',1.5),/Dano, fase ou turno/);
 assert.throws(()=>capture(session,monster,'stale',100,{turn:session.duel.core.turn+1}),/Dano, fase ou turno/);
});
test('an empty defending hand resolves Robbin Goblin without inventing a discard',()=>{
 const {session}=setup(),{monster}=prepare(session,'goblin'),target=holder(session.duel,session.duel.active[1]);
 session.duel.core.players[1].grave.push(...target.hand.splice(0));
 const before=inventory(session.duel),captured=capture(session,monster,'empty-hand',300),result=adapter.resolveTrigger(session,captured.activationIds[0]);
 assert.equal(result.negation,'none');assert.equal(result.applied,false);assert.equal(result.destination,'none');assertInventoryEqual(before,session.duel);
});
test('an empty defending Deck resolves Robbin Zombie without milling a card',()=>{
 const {session}=setup(),{monster}=prepare(session,'zombie'),target=holder(session.duel,session.duel.active[1]);
 session.duel.core.players[1].grave.push(...target.deck.splice(0));
 const before=inventory(session.duel),captured=capture(session,monster,'empty-deck',300),result=adapter.resolveTrigger(session,captured.activationIds[0]);
 assert.equal(result.negation,'none');assert.equal(result.applied,false);assertInventoryEqual(before,session.duel);
});
test('Robbin Goblin applies only its own discard and does not enforce the End Phase limit early',()=>{
 const {session}=setup(),{monster}=prepare(session,'goblin'),target=holder(session.duel,session.duel.active[1]);
 target.hand.push(...target.deck.splice(0,4));assert.equal(target.hand.length,8);
 const captured=capture(session,monster,'hand-overflow',250);adapter.resolveTrigger(session,captured.activationIds[0]);
 assert.equal(holder(session.duel,session.duel.active[1]).hand.length,7);assert.equal(grave(session.duel,1).length,1);assertBattleDamageRules(session.duel);
});
test('Robbin Zombie does not touch the separate Field Zone',()=>{
 const {session}=setup(),{monster}=prepare(session,'zombie'),fieldOwner=session.duel.active[1],fieldCard=take(session.duel,fieldOwner,spellIds[0]);
 session.duel.core.players[1].field={...fieldCard,setTurn:session.duel.core.turn-1,faceUp:true,resolved:true};
 const fieldUid=session.duel.core.players[1].field.uid,captured=capture(session,monster,'field-isolated',500);
 adapter.resolveTrigger(session,captured.activationIds[0]);assert.equal(session.duel.core.players[1].field.uid,fieldUid);
});
test('the adapter enforces the three Monster Zones',()=>{
 const {session}=setup();for(let i=0;i<4;i++)deploy(session,0,monsterIds[i]);
 assert.throws(()=>assertBattleDamageRules(session.duel));
});
test('the adapter enforces the three Spell/Trap Zones',()=>{
 const {session}=setup();for(let i=0;i<4;i++){const card=take(session.duel,2,trapIds[i]);session.duel.core.players[0].backrow.push({...card,setTurn:0,faceUp:false});}
 assert.throws(()=>assertBattleDamageRules(session.duel));
});
test('a registered source is idempotent but cannot change its physical identity',()=>{
 const {session}=setup(),source=setSource(session,0,'goblin');
 const first=adapter.registerSource(session,0,source.uid),second=adapter.registerSource(session,0,source.uid);assert.deepEqual(second,first);
});
