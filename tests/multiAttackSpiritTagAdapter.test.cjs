const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagInventory}=require('../dist/tagDuel');
const {enabledCardIds,engineCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
 MATAZA_THE_ZAPPER_ID,MATAZA_THE_ZAPPER_KONAMI_CID,ASURA_PRIEST_ID,ASURA_PRIEST_KONAMI_CID,
 lookupMultiAttackSpiritEffect,createMultiAttackSpiritAdapter,assertMultiAttackSpiritRules
}=require('../dist/multiAttackSpiritTagAdapter');

function unique(kind,count){
 const seen=new Set();
 return enabledCardIds.filter(id=>{
  const card=engineCard(id);if(!card||card.kind!==kind||card.fusion)return false;
  const name=card.englishName||card.name;if(seen.has(name))return false;seen.add(name);return true;
 }).slice(0,count);
}
const monsterIds=unique('monster',8),spellIds=unique('spell',6),trapIds=unique('trap',6);
const fusionIds=enabledCardIds.filter(id=>!!engineCard(id)?.fusion).slice(0,5);
assert.equal(monsterIds.length,8);assert.equal(spellIds.length,6);assert.equal(trapIds.length,6);assert.equal(fusionIds.length,5);
const deck=[...monsterIds,...spellIds,...trapIds];
assert.equal(deck.length,20);
const fixture={mataza:monsterIds[0],asura:monsterIds[1],target1:monsterIds[2],target2:monsterIds[3],target3:monsterIds[4],other:monsterIds[5]};
function lookup(id){
 if(id===fixture.mataza)return {kind:'monster',effect:'mataza-second-attack'};
 if(id===fixture.asura)return {kind:'monster',effect:'asura-all-monsters'};
 return undefined;
}
const adapter=createMultiAttackSpiritAdapter(lookup);
function setup(seed='m671-multi-attack-spirit',first=2){
 const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...deck],extra:[...fusionIds]}));
 const duel=createTagDuel(players,{classic:true,first,seed});
 return {session:adapter.createSession(duel),adapter};
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
function deploy(session,team,id,seat=session.duel.active[team],options={}){
 const card=take(session.duel,seat,id),turn=session.duel.core.turn;
 const monster={...card,position:options.position??'atk',faceUp:options.faceUp??true,entered:turn,changed:turn,attacked:0,atkBoost:0,defBoost:0,owner:team};
 session.duel.core.players[team].monsters.push(monster);return monster;
}
function attack(session,attacker,target,eventId,overrides={}){
 const duel=session.duel,team=duel.core.players.findIndex(p=>p.monsters.some(m=>m.uid===attacker.uid));
 duel.core.phase='battle';
 return adapter.declareAttack(session,{eventId,attackerUid:attacker.uid,attackerSeat:duel.active[team],turn:duel.core.turn,...target?{targetUid:target.uid}:{direct:true},...overrides});
}
function inventory(duel){return new Map(tagInventory(duel).filter(c=>c.entityKind!=='token').map(c=>[c.uid,c.id]));}
function assertInventoryEqual(before,duel){
 const after=inventory(duel);assert.equal(after.size,before.size);
 for(const [uid,id]of before)assert.equal(after.get(uid),id);
}
function activateSeat(duel,team,incoming){
 const outgoing=duel.active[team];if(outgoing===incoming)return;
 const current=duel.core.players[team],next=duel.reserves[String(incoming)];
 assert.ok(next,'A zona física do participante de entrada precisa existir.');
 duel.reserves[String(outgoing)]={deck:current.deck,hand:current.hand,extra:current.extra};
 current.deck=next.deck;current.hand=next.hand;current.extra=next.extra;
 delete duel.reserves[String(incoming)];
 duel.active[team]=incoming;duel.cursor=incoming;duel.core.current=team;
 duel.core.teamRotation.active=[duel.active[0],duel.active[1]];
 duel.core.teamRotation.cursor=incoming;duel.core.teamRotation.reserves=duel.reserves;
}
function moveToGrave(duel,team,monster){
 duel.core.players[team].monsters=duel.core.players[team].monsters.filter(m=>m.uid!==monster.uid);
 duel.core.players[team].grave.push({uid:monster.uid,id:monster.id});
 synchronizeCardLifetimes(duel.core);
}
function summonSpirit(session,seat=session.duel.active[0],kind='normal'){
 const monster=deploy(session,seat%2,fixture.asura,seat);
 return {monster,receipt:adapter.recordSpiritSummon(session,{eventId:'summon-'+kind+'-'+monster.uid,uid:monster.uid,controllerSeat:seat,turn:session.duel.core.turn,kind})};
}

test('M671 card identities, Konami CIDs and default lookups are explicit',()=>{
 assert.equal(MATAZA_THE_ZAPPER_ID,'22609617');assert.equal(MATAZA_THE_ZAPPER_KONAMI_CID,5898);
 assert.equal(ASURA_PRIEST_ID,'02134346');assert.equal(ASURA_PRIEST_KONAMI_CID,5381);
 assert.deepEqual(lookupMultiAttackSpiritEffect(MATAZA_THE_ZAPPER_ID),{kind:'monster',effect:'mataza-second-attack'});
 assert.deepEqual(lookupMultiAttackSpiritEffect(ASURA_PRIEST_ID),{kind:'monster',effect:'asura-all-monsters'});
 assert.equal(lookupMultiAttackSpiritEffect('00000000'),undefined);
});

test('classic 2v2 baseline preserves Deck 20–30, Extra 5, zones 3+3 and Field Zone separation',()=>{
 const {session}=setup();assertMultiAttackSpiritRules(session.duel);
 assert.equal(session.duel.mode,'tag-classic');assert.deepEqual(session.duel.active,[2,3]);
 for(const player of session.duel.core.players){assert.ok(player.monsters.length<=3);assert.ok(player.backrow.length<=3);}
});

test('attack declarations require the active physical seat and the real Battle Phase',()=>{
 const {session}=setup(),mataza=deploy(session,0,fixture.mataza);
 session.duel.core.phase='main';
 assert.throws(()=>attack(session,mataza,null,'bad-phase'),/fase ou turno/);
 session.duel.core.phase='battle';
 assert.throws(()=>attack(session,mataza,null,'bad-seat',{attackerSeat:0}),/representante físico ativo/);
});

test('Mataza can declare exactly two attacks in one Battle Phase',()=>{
 const {session}=setup(),mataza=deploy(session,0,fixture.mataza);
 const a=attack(session,mataza,null,'mataza-direct-1'),b=attack(session,mataza,null,'mataza-direct-2'),c=attack(session,mataza,null,'mataza-direct-3');
 assert.equal(a.allowed,true);assert.equal(b.allowed,true);assert.equal(c.allowed,false);assert.equal(c.reason,'attack-limit');
 assert.equal(c.attacksUsed,2);
});

test('Mataza may attack the same monster twice because its text grants a second attack',()=>{
 const {session}=setup(),mataza=deploy(session,0,fixture.mataza),target=deploy(session,1,fixture.target1);
 assert.equal(attack(session,mataza,target,'mataza-same-target-1').allowed,true);
 assert.equal(attack(session,mataza,target,'mataza-same-target-2').allowed,true);
 assert.equal(attack(session,mataza,target,'mataza-same-target-3').reason,'attack-limit');
});

test('Mataza cannot declare a direct attack while the opposing team still controls a monster',()=>{
 const {session}=setup(),mataza=deploy(session,0,fixture.mataza);deploy(session,1,fixture.target1);
 const result=attack(session,mataza,null,'mataza-direct-blocked');
 assert.equal(result.allowed,false);assert.equal(result.reason,'opponent-monsters-remain');
});

test('Mataza attack allowance resets on the next turn',()=>{
 const {session}=setup(),mataza=deploy(session,0,fixture.mataza);
 assert.equal(attack(session,mataza,null,'mataza-turn-1a').allowed,true);
 assert.equal(attack(session,mataza,null,'mataza-turn-1b').allowed,true);
 session.duel.core.turn++;session.duel.core.phase='battle';
 const next=attack(session,mataza,null,'mataza-turn-2a');
 assert.equal(next.allowed,true);assert.equal(next.attacksUsed,1);
});

test('Mataza face-up control cannot switch',()=>{
 const {session}=setup(),mataza=deploy(session,0,fixture.mataza);
 assert.equal(adapter.canChangeControl(session,mataza.uid),false);
});

test('Mataza control may change while it is face-down',()=>{
 const {session}=setup(),mataza=deploy(session,0,fixture.mataza,session.duel.active[0],{faceUp:false,position:'def'});
 assert.equal(adapter.canChangeControl(session,mataza.uid),true);
});

test('the Mataza control lock does not affect unrelated monsters',()=>{
 const {session}=setup(),other=deploy(session,0,fixture.other);
 assert.equal(adapter.canChangeControl(session,other.uid),true);
});

test('Asura Priest can attack each opposing monster once, including face-down Defense monsters',()=>{
 const {session}=setup(),asura=deploy(session,0,fixture.asura);
 const targets=[
  deploy(session,1,fixture.target1,session.duel.active[1],{faceUp:false,position:'def'}),
  deploy(session,1,fixture.target2),
  deploy(session,1,fixture.target3)
 ];
 for(let i=0;i<targets.length;i++)assert.equal(attack(session,asura,targets[i],'asura-target-'+i).allowed,true);
 const duplicate=attack(session,asura,targets[0],'asura-target-duplicate');
 assert.equal(duplicate.allowed,false);assert.equal(duplicate.reason,'target-already-attacked');
});

test('Asura may attack a monster again only after that physical instance leaves and returns',()=>{
 const {session}=setup(),asura=deploy(session,0,fixture.asura),target=deploy(session,1,fixture.target1);
 assert.equal(attack(session,asura,target,'asura-epoch-first').allowed,true);
 moveToGrave(session.duel,1,target);
 const returned={...target,position:'atk',faceUp:true,entered:session.duel.core.turn,changed:session.duel.core.turn,attacked:0,atkBoost:0,defBoost:0};
 session.duel.core.players[1].grave=session.duel.core.players[1].grave.filter(c=>c.uid!==target.uid);
 session.duel.core.players[1].monsters.push(returned);synchronizeCardLifetimes(session.duel.core);
 const second=attack(session,asura,returned,'asura-epoch-second');
 assert.equal(second.allowed,true);
});

test('Asura cannot attack directly while any opposing monster remains',()=>{
 const {session}=setup(),asura=deploy(session,0,fixture.asura);deploy(session,1,fixture.target1);
 const result=attack(session,asura,null,'asura-direct-with-monster');
 assert.equal(result.allowed,false);assert.equal(result.reason,'opponent-monsters-remain');
});

test('Asura cannot attack directly after it has attacked a monster, even if that monster leaves',()=>{
 const {session}=setup(),asura=deploy(session,0,fixture.asura),target=deploy(session,1,fixture.target1);
 assert.equal(attack(session,asura,target,'asura-monster-first').allowed,true);
 moveToGrave(session.duel,1,target);
 const result=attack(session,asura,null,'asura-direct-after-monster');
 assert.equal(result.allowed,false);assert.equal(result.reason,'direct-after-monster');
});

test('Asura may attack directly once when the opposing field is empty',()=>{
 const {session}=setup(),asura=deploy(session,0,fixture.asura);
 const first=attack(session,asura,null,'asura-direct-first'),second=attack(session,asura,null,'asura-direct-second');
 assert.equal(first.allowed,true);assert.equal(second.allowed,false);assert.equal(second.reason,'direct-already-used');
});

test('Asura may attack a newly summoned monster after an earlier direct attack',()=>{
 const {session}=setup(),asura=deploy(session,0,fixture.asura);
 assert.equal(attack(session,asura,null,'asura-direct-before-summon').allowed,true);
 const target=deploy(session,1,fixture.target1);
 assert.equal(attack(session,asura,target,'asura-target-after-direct').allowed,true);
});

test('Asura Priest is not eligible for Special Summon',()=>{
 assert.equal(adapter.canSpecialSummon(fixture.asura),false);
 assert.throws(()=>adapter.assertSummonAllowed(fixture.asura,'special'),/não pode ser Invocado-Especialmente/);
 assert.equal(adapter.assertSummonAllowed(fixture.asura,'normal'),true);
});

test('a successful Normal Summon registers Asura return for that turn',()=>{
 const {session}=setup(),{monster,receipt}=summonSpirit(session);
 assert.equal(receipt.kind,'normal');assert.equal(receipt.ownerSeat,session.duel.active[0]);
 assert.equal(session.spiritSummons[monster.uid].turn,session.duel.core.turn);
});

test('a successful Flip Summon registers the same End Phase return',()=>{
 const {session}=setup(),seat=session.duel.active[0];
 const monster=deploy(session,0,fixture.asura,seat,{faceUp:false,position:'def'});
 monster.faceUp=true;monster.changed=session.duel.core.turn;
 const receipt=adapter.recordSpiritSummon(session,{eventId:'asura-flip-'+monster.uid,uid:monster.uid,controllerSeat:seat,turn:session.duel.core.turn,kind:'flip'});
 assert.equal(receipt.kind,'flip');
});

test('Asura returns to its inactive physical owner hand even after control changes to the other team',()=>{
 const {session}=setup('m671-spirit-owner-return',0),{monster}=summonSpirit(session,0,'normal');
 session.duel.core.players[0].monsters=session.duel.core.players[0].monsters.filter(m=>m.uid!==monster.uid);
 session.duel.core.players[1].monsters.push(monster);synchronizeCardLifetimes(session.duel.core);
 activateSeat(session.duel,0,2);
 session.duel.core.turnEnding=true;
 const before=inventory(session.duel),end=adapter.beginSpiritEndPhase(session,'asura-end-owner',session.duel.core.turn);
 assert.equal(end.activationIds.length,1);
 const result=adapter.resolveSpiritReturn(session,end.activationIds[0]);
 assert.equal(result.applied,true);assert.equal(result.reason,'returned');
 assert.ok(session.duel.reserves['0'].hand.some(c=>c.uid===monster.uid));
 assert.equal(session.duel.core.players[0].hand.some(c=>c.uid===monster.uid),false);
 assert.equal(session.duel.core.players[1].monsters.some(c=>c.uid===monster.uid),false);
 assertInventoryEqual(before,session.duel);
});

test('Asura does not return if it is face-down when its End Phase effect resolves',()=>{
 const {session}=setup(),{monster}=summonSpirit(session);
 session.duel.core.turnEnding=true;
 const end=adapter.beginSpiritEndPhase(session,'asura-end-face-down',session.duel.core.turn);
 monster.faceUp=false;
 const result=adapter.resolveSpiritReturn(session,end.activationIds[0]);
 assert.equal(result.applied,false);assert.equal(result.reason,'not-face-up');
 assert.ok(session.duel.core.players[0].monsters.some(c=>c.uid===monster.uid));
});

test('Asura does not return if it left the field before its End Phase effect resolves',()=>{
 const {session}=setup(),{monster}=summonSpirit(session);
 session.duel.core.turnEnding=true;
 const end=adapter.beginSpiritEndPhase(session,'asura-end-left-field',session.duel.core.turn);
 moveToGrave(session.duel,0,monster);
 const result=adapter.resolveSpiritReturn(session,end.activationIds[0]);
 assert.equal(result.applied,false);assert.equal(result.reason,'not-on-field');
});

test('Asura return can be negated without moving the physical card',()=>{
 const {session}=setup(),{monster}=summonSpirit(session);
 session.duel.core.turnEnding=true;
 const end=adapter.beginSpiritEndPhase(session,'asura-end-negated',session.duel.core.turn);
 const result=adapter.resolveSpiritReturn(session,end.activationIds[0],true);
 assert.equal(result.applied,false);assert.equal(result.reason,'negated');
 assert.ok(session.duel.core.players[0].monsters.some(c=>c.uid===monster.uid));
});

test('End Phase activation and Spirit return receipts are idempotent',()=>{
 const {session}=setup(),{monster}=summonSpirit(session);
 session.duel.core.turnEnding=true;
 const first=adapter.beginSpiritEndPhase(session,'asura-end-idempotent',session.duel.core.turn);
 const replay=adapter.beginSpiritEndPhase(session,'asura-end-idempotent',session.duel.core.turn);
 assert.equal(replay.replayed,true);assert.deepEqual(replay.activationIds,first.activationIds);
 const resolved=adapter.resolveSpiritReturn(session,first.activationIds[0]);
 const repeated=adapter.resolveSpiritReturn(session,first.activationIds[0]);
 assert.equal(resolved.applied,true);assert.equal(repeated.replayed,true);assert.equal(repeated.uid,monster.uid);
});

test('a second End Phase event ID for the same turn is rejected',()=>{
 const {session}=setup();summonSpirit(session);
 session.duel.core.turnEnding=true;
 adapter.beginSpiritEndPhase(session,'asura-end-one',session.duel.core.turn);
 assert.throws(()=>adapter.beginSpiritEndPhase(session,'asura-end-two',session.duel.core.turn),/outro evento/);
});

test('a repeated attack event is idempotent and does not consume another attack',()=>{
 const {session}=setup(),mataza=deploy(session,0,fixture.mataza);
 const event={eventId:'mataza-idempotent',attackerUid:mataza.uid,attackerSeat:session.duel.active[0],turn:session.duel.core.turn,direct:true};
 session.duel.core.phase='battle';
 const first=adapter.declareAttack(session,event),replay=adapter.declareAttack(session,event);
 assert.equal(first.allowed,true);assert.equal(replay.replayed,true);assert.equal(replay.attacksUsed,1);
});

test('reusing an attack event ID with a different target is rejected',()=>{
 const {session}=setup(),mataza=deploy(session,0,fixture.mataza),a=deploy(session,1,fixture.target1),b=deploy(session,1,fixture.target2);
 attack(session,mataza,a,'mataza-conflicting-event');
 assert.throws(()=>attack(session,mataza,b,'mataza-conflicting-event'),/dados diferentes/);
});

test('the adapter accepts a seven-card hand during the turn and never discards early',()=>{
 const {session}=setup(),seat=session.duel.active[0],held=holder(session.duel,seat);
 while(held.hand.length<7)held.hand.push(held.deck.shift());
 assert.equal(held.hand.length,7);assertMultiAttackSpiritRules(session.duel);
});

test('Spirit return preserves every physical UID and never grants inventory',()=>{
 const {session}=setup(),{monster}=summonSpirit(session),before=inventory(session.duel);
 session.duel.core.turnEnding=true;
 const end=adapter.beginSpiritEndPhase(session,'asura-inventory-preserved',session.duel.core.turn);
 adapter.resolveSpiritReturn(session,end.activationIds[0]);
 assertInventoryEqual(before,session.duel);
 assert.equal(tagInventory(session.duel).filter(c=>c.uid===monster.uid).length,1);
});
