const {test}=require('node:test'),assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {swapTeamSeat}=require('../dist/teamRotation');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
 createBattleDestructionRetaliationAdapter
}=require('../dist/battleDestructionRetaliationTagAdapter');

const normal=tag.tagNormalCardIds.slice(0,10);
const alias={yomi:normal[0],helpoemer:normal[1],target:normal[2]};
const lookup=id=>id===alias.yomi?{kind:'monster',effect:'yomi-ship'}:
 id===alias.helpoemer?{kind:'monster',effect:'helpoemer'}:undefined;
const adapter=createBattleDestructionRetaliationAdapter(lookup);
const deck=normal.flatMap(id=>[id,id]);
function game(first=1){
 const duel=tag.createTagDuel([0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:deck})),
  {seed:'m679-battle-destruction-'+first,classic:true,first});
 duel.core.phase='battle';duel.core.resume='battle';
 return duel;
}
function holder(duel,seat){
 const team=seat%2;
 return duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
}
function take(duel,seat,id){
 const h=holder(duel,seat),card=h.deck.pop();assert.ok(card);
 return {...card,id};
}
function putGrave(duel,seat,id){
 const card=take(duel,seat,id);duel.core.players[seat%2].grave.push(card);return card;
}
function deploy(duel,seat,id){
 const card=take(duel,seat,id),monster={...card,owner:seat%2,position:'atk',faceUp:true,
  entered:duel.core.turn,changed:0,attacked:0,atkBoost:0,defBoost:0};
 duel.core.players[seat%2].monsters.push(monster);return monster;
}
function event(duel,source,destroyer,eventId='battle-1',overrides={}){
 return {eventId,destroyedUid:source.uid,destroyerUid:destroyer.uid,battleSeat:duel.cursor,
  turn:duel.core.turn,destroyedByBattle:true,sentToGrave:true,...overrides};
}
function moveToNextOpponentSeat(duel,seat,turn){
 duel.cursor=seat;duel.core.teamRotation.cursor=seat;duel.core.current=seat%2;
 swapTeamSeat(duel.core,seat);duel.core.turn=turn;duel.core.phase='battle';duel.core.resume='battle';
 tag.assertTagDuel(duel);
}
function inventory(duel){
 return tag.tagInventory(duel).filter(c=>c.entityKind!=='token').map(c=>[c.uid,c.id]).sort((a,b)=>a[0].localeCompare(b[0]));
}

test('Yomi Ship destroys the exact battle destroyer and preserves its physical UID/owner across 2v2 seats',()=>{
 for(const destroyerSeat of [1,3]){
  const duel=game(destroyerSeat),source=putGrave(duel,2,alias.yomi),destroyer=deploy(duel,destroyerSeat,alias.target);
  const before=inventory(duel),session=adapter.createSession(duel);
  const captured=adapter.capture(session,event(session.duel,source,destroyer,'yomi-'+destroyerSeat));
  assert.equal(captured.accepted,true);assert.equal(captured.activationIds.length,1);
  const result=adapter.resolveYomiShip(session,captured.activationIds[0]);
  assert.equal(result.status,'destroyed');
  assert.ok(session.duel.core.players[0].grave.some(c=>c.uid===source.uid));
  assert.ok(session.duel.core.players[1].grave.some(c=>c.uid===destroyer.uid));
  assert.equal(session.duel.core.players[1].monsters.some(c=>c.uid===destroyer.uid),false);
  assert.deepEqual(inventory(session.duel),before);
  tag.assertTagDuel(JSON.parse(JSON.stringify(session.duel)));
 }
});

test('Yomi Ship rejects destruction by effect, replacement destinations and same-team events',()=>{
 const duel=game(1),source=putGrave(duel,0,alias.yomi),destroyer=deploy(duel,1,alias.target),session=adapter.createSession(duel);
 assert.equal(adapter.capture(session,event(session.duel,source,destroyer,'effect-destroy',{destroyedByBattle:false})).reason,'not-battle-destruction');
 assert.equal(adapter.capture(session,event(session.duel,source,destroyer,'not-sent',{sentToGrave:false})).reason,'not-battle-destruction');
 assert.equal(adapter.capture(session,event(session.duel,source,destroyer,'same-team',{destroyerUid:'m0:forged'})).reason,'same-team');
 session.duel.core.players[0].grave=session.duel.core.players[0].grave.filter(c=>c.uid!==source.uid);
 session.duel.core.players[0].banished.push(source);
 assert.equal(adapter.capture(session,event(session.duel,source,destroyer,'banished')).reason,'not-in-grave');
});

test('Yomi Ship requires its source to remain in the same Graveyard instance and respects effect negation',()=>{
 const duel=game(1),source=putGrave(duel,0,alias.yomi),destroyer=deploy(duel,1,alias.target),session=adapter.createSession(duel);
 const captured=adapter.capture(session,event(session.duel,source,destroyer,'yomi-stale'));
 assert.equal(captured.accepted,true);
 const grave=session.duel.core.players[0].grave;
 const moved=grave.splice(grave.findIndex(c=>c.uid===source.uid),1)[0];
 session.duel.core.players[0].banished.push(moved);
 assert.equal(adapter.resolveYomiShip(session,captured.activationIds[0]).status,'source-left-grave');

 const second=game(1),source2=putGrave(second,0,alias.yomi),destroyer2=deploy(second,1,alias.target),session2=adapter.createSession(second);
 const cap2=adapter.capture(session2,event(session2.duel,source2,destroyer2,'yomi-negated'));
 assert.equal(adapter.resolveYomiShip(session2,cap2.activationIds[0],{negated:true}).status,'negated');
 assert.ok(session2.duel.core.players[1].monsters.some(c=>c.uid===destroyer2.uid));
});

test('Yomi Ship does not retarget after the destroyer leaves and re-enters its zone',()=>{
 const duel=game(1),source=putGrave(duel,0,alias.yomi),destroyer=deploy(duel,1,alias.target),session=adapter.createSession(duel);
 const captured=adapter.capture(session,event(session.duel,source,destroyer,'yomi-epoch'));
 const p=session.duel.core.players[1],index=p.monsters.findIndex(c=>c.uid===destroyer.uid);
 const left=p.monsters.splice(index,1)[0];p.grave.push(left);synchronizeCardLifetimes(session.duel.core);
 const returned=p.grave.splice(p.grave.findIndex(c=>c.uid===destroyer.uid),1)[0];
 p.monsters.push({...returned,position:'atk',faceUp:true,entered:session.duel.core.turn,changed:0,attacked:0,atkBoost:0,defBoost:0});
 synchronizeCardLifetimes(session.duel.core);
 assert.equal(adapter.resolveYomiShip(session,captured.activationIds[0]).status,'destroyer-left-field');
 assert.equal(session.duel.core.players[1].monsters.length,1);
});

test('Yomi Ship event capture is idempotent and rejects an event ID with altered facts',()=>{
 const duel=game(1),source=putGrave(duel,0,alias.yomi),destroyer=deploy(duel,1,alias.target),session=adapter.createSession(duel);
 const original=event(session.duel,source,destroyer,'yomi-idempotent');
 const first=adapter.capture(session,original),again=adapter.capture(session,original);
 assert.equal(first.accepted,true);assert.equal(again.replayed,true);
 assert.throws(()=>adapter.capture(session,{...original,destroyerUid:'m1:other'}),/reutilizado/);
 const result=adapter.resolveYomiShip(session,first.activationIds[0]);
 assert.equal(adapter.resolveYomiShip(session,first.activationIds[0]).replayed,true);
 assert.equal(result.status,'destroyed');
});

test('Helpoemer discards only from the opponent active physical hand using persisted HMAC randomness',()=>{
 const duel=game(3),source=putGrave(duel,2,alias.helpoemer),destroyer=deploy(duel,3,alias.target);
 const session=adapter.createSession(duel),captured=adapter.capture(session,event(session.duel,source,destroyer,'helpoemer-first'));
 assert.equal(captured.accepted,true);
 const activeBefore=session.duel.core.players[1].hand.map(c=>c.uid),partnerBefore=session.duel.reserves['1'].hand.map(c=>c.uid);
 const counterBefore=session.duel.core.random.counter;
 const result=adapter.resolveHelpoemerBattlePhaseEnd(session,{kind:'opponent-battle-phase-end',eventId:'bp-end-1',team:1,activeSeat:3,turn:1});
 assert.equal(result.length,1);assert.equal(result[0].status,'discarded');
 assert.equal(session.duel.core.players[1].hand.length,activeBefore.length-1);
 assert.deepEqual(session.duel.reserves['1'].hand.map(c=>c.uid),partnerBefore);
 assert.equal(session.duel.core.random.counter,counterBefore+1);
 assert.ok(session.duel.core.players[1].grave.some(c=>activeBefore.includes(c.uid)));
 assert.equal(JSON.stringify(tag.publicTagDuel(session.duel)).includes(activeBefore[0]),false);
 const restored=JSON.parse(JSON.stringify(session)),afterCounter=restored.duel.core.random.counter;
 const replay=adapter.resolveHelpoemerBattlePhaseEnd(restored,{kind:'opponent-battle-phase-end',eventId:'bp-end-1',team:1,activeSeat:3,turn:1});
 assert.equal(replay[0].replayed,true);assert.equal(restored.duel.core.random.counter,afterCounter);
});

test('Helpoemer triggers again on each later opponent Battle Phase while its same instance remains in the GY',()=>{
 const duel=game(3),source=putGrave(duel,2,alias.helpoemer),destroyer=deploy(duel,3,alias.target);
 const session=adapter.createSession(duel);adapter.capture(session,event(session.duel,source,destroyer,'helpoemer-repeat'));
 const first=adapter.resolveHelpoemerBattlePhaseEnd(session,{kind:'opponent-battle-phase-end',eventId:'bp-turn-1',team:1,activeSeat:3,turn:1});
 assert.equal(first[0].status,'discarded');
 moveToNextOpponentSeat(session.duel,1,3);
 const second=adapter.resolveHelpoemerBattlePhaseEnd(session,{kind:'opponent-battle-phase-end',eventId:'bp-turn-3',team:1,activeSeat:1,turn:3});
 assert.equal(second[0].status,'discarded');
 assert.ok(session.duel.core.players[1].grave.filter(c=>c.uid!==source.uid).length>=2);
});

test('Helpoemer does not trigger during its owner team Battle Phase',()=>{
 const duel=game(1),source=putGrave(duel,0,alias.helpoemer),destroyer=deploy(duel,1,alias.target);
 const session=adapter.createSession(duel);adapter.capture(session,event(session.duel,source,destroyer,'helpoemer-team'));
 session.duel.cursor=0;session.duel.core.teamRotation.cursor=0;session.duel.core.current=0;swapTeamSeat(session.duel.core,0);
 const own=adapter.resolveHelpoemerBattlePhaseEnd(session,{kind:'opponent-battle-phase-end',eventId:'own-phase',team:0,activeSeat:0,turn:1});
 assert.equal(own.length,0);
});

test('Helpoemer must remain in the GY; moving it out and back does not revive its old trigger instance',()=>{
 const duel=game(3),source=putGrave(duel,2,alias.helpoemer),destroyer=deploy(duel,3,alias.target);
 const session=adapter.createSession(duel);adapter.capture(session,event(session.duel,source,destroyer,'helpoemer-stale'));
 const grave=session.duel.core.players[0].grave,moved=grave.splice(grave.findIndex(c=>c.uid===source.uid),1)[0];
 session.duel.core.players[0].banished.push(moved);synchronizeCardLifetimes(session.duel.core);
 session.duel.core.players[0].grave.push(session.duel.core.players[0].banished.pop());
 synchronizeCardLifetimes(session.duel.core);
 const result=adapter.resolveHelpoemerBattlePhaseEnd(session,{kind:'opponent-battle-phase-end',eventId:'bp-stale',team:1,activeSeat:3,turn:1});
 assert.equal(result[0].status,'source-left-grave');
 assert.equal(session.duel.core.players[1].hand.length,4);
});

test('Helpoemer stacks for multiple copies without exposing discarded card identity in receipts',()=>{
 const duel=game(3),sourceA=putGrave(duel,0,alias.helpoemer),sourceB=putGrave(duel,2,alias.helpoemer);
 const destroyerA=deploy(duel,3,alias.target),destroyerB=deploy(duel,3,alias.target);
 const session=adapter.createSession(duel);
 adapter.capture(session,event(session.duel,sourceA,destroyerA,'helpoemer-copy-a'));
 adapter.capture(session,event(session.duel,sourceB,destroyerB,'helpoemer-copy-b'));
 const before=session.duel.core.players[1].hand.length;
 const results=adapter.resolveHelpoemerBattlePhaseEnd(session,{kind:'opponent-battle-phase-end',eventId:'bp-stack',team:1,activeSeat:3,turn:1});
 assert.equal(results.length,2);assert.ok(results.every(r=>r.status==='discarded'));
 assert.equal(session.duel.core.players[1].hand.length,before-2);
 assert.ok(results.every(r=>!Object.hasOwn(r,'discardedUid')&&!Object.hasOwn(r,'discardedCardId')));
});

test('Helpoemer uses the active physical hand, not the inactive partner, even when active hand is empty',()=>{
 const duel=game(3),source=putGrave(duel,2,alias.helpoemer),destroyer=deploy(duel,3,alias.target);
 const session=adapter.createSession(duel);adapter.capture(session,event(session.duel,source,destroyer,'helpoemer-empty'));
 const active=session.duel.core.players[1],partnerBefore=session.duel.reserves['1'].hand.map(c=>c.uid);
 active.deck.push(...active.hand.splice(0));
 const result=adapter.resolveHelpoemerBattlePhaseEnd(session,{kind:'opponent-battle-phase-end',eventId:'bp-empty',team:1,activeSeat:3,turn:1});
 assert.equal(result[0].status,'empty-hand');
 assert.deepEqual(session.duel.reserves['1'].hand.map(c=>c.uid),partnerBefore);
});

test('Helpoemer does not impose the hand limit before End Phase and cannot be Special Summoned from the GY',()=>{
 const duel=game(3),source=putGrave(duel,2,alias.helpoemer),destroyer=deploy(duel,3,alias.target);
 const session=adapter.createSession(duel);adapter.capture(session,event(session.duel,source,destroyer,'helpoemer-overflow'));
 const hand=session.duel.core.players[1].hand;
 hand.push(...session.duel.core.players[1].deck.splice(0,3));
 assert.equal(hand.length,7);
 assert.equal(adapter.canSpecialSummonFromGraveyard(alias.helpoemer),false);
 assert.equal(adapter.canSpecialSummonFromGraveyard(alias.yomi),true);
 const result=adapter.resolveHelpoemerBattlePhaseEnd(session,{kind:'opponent-battle-phase-end',eventId:'bp-overflow',team:1,activeSeat:3,turn:1});
 assert.equal(result[0].status,'discarded');
 assert.equal(session.duel.core.players[1].hand.length,6);
});

test('Invalid Battle Phase windows and missing HMAC state are rejected without mutating inventory',()=>{
 const duel=game(3),source=putGrave(duel,2,alias.helpoemer),destroyer=deploy(duel,3,alias.target);
 const session=adapter.createSession(duel);adapter.capture(session,event(session.duel,source,destroyer,'helpoemer-invalid'));
 const before=inventory(session.duel);
 assert.throws(()=>adapter.resolveHelpoemerBattlePhaseEnd(session,{kind:'opponent-battle-phase-end',eventId:'bad-window',team:1,activeSeat:1,turn:1}),/janela|Battle Phase/i);
 assert.deepEqual(inventory(session.duel),before);
 const noRandom=JSON.parse(JSON.stringify(session));delete noRandom.duel.core.random;
 assert.throws(()=>adapter.resolveHelpoemerBattlePhaseEnd(noRandom,{kind:'opponent-battle-phase-end',eventId:'no-random',team:1,activeSeat:3,turn:1}),/HMAC/);
});
