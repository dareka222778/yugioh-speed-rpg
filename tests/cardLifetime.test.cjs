const {test}=require('node:test'),assert=require('node:assert/strict');
const e=require('../dist/duelEngine'),{starterContents}=require('../dist/cardCatalog');
const lifetime=require('../dist/cardLifetime'),{assertDuelState}=require('../dist/duelIntegrity');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
function game(){const s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);s.turn=3;return s;}
function restore(s){const restored=JSON.parse(JSON.stringify(s));assertDuelState(restored);return restored;}
test('REA-I02: a returned UID is a new zone incarnation, including after JSON restore',()=>{
 const s=game(),card=s.players[0].hand[0];const binding=lifetime.bindTarget(s,card.uid);
 s.players[0].hand.shift();s.players[0].grave.push(card);lifetime.synchronizeCardLifetimes(s);
 s.players[0].grave.pop();s.players[0].hand.unshift(card);lifetime.synchronizeCardLifetimes(s);
 assert.equal(lifetime.targetBindingValid(restore(s),binding),false);assert.equal(s.cardLifetimes[card.uid].epoch,2);
});
test('zone identity survives controller changes and legacy snapshots remain accepted',()=>{
 const s=game(),card=s.players[0].hand.shift();s.players[0].monsters.push({...card,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
 const binding=lifetime.bindTarget(s,card.uid);s.players[1].monsters.push(s.players[0].monsters.pop());
 assert.equal(lifetime.targetBindingValid(restore(s),binding),true);delete s.cardLifetimes;assert.doesNotThrow(()=>assertDuelState(s));
});
test('REA-I02: actual Book root ignores an original monster that left and returned while pending',()=>{
 let s=game();s.players[0].hand=[{uid:'book',id:'14087893'}];s.players[1].monsters=[{uid:'victim',id:'91152256',owner:1,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0}];
 s.players[1].backrow=[{uid:'response-book',id:'14087893',faceUp:false,setTurn:0}];
 s=e.step(s,'a',e.legalActions(s,'a').find(a=>a.kind==='spell'&&a.target==='victim'));assert.ok(s.pending.targetBinding);
 // Model two zone operations during an intervening effect; each operation is checkpointed.
 const victim=s.players[1].monsters.pop();s.players[1].grave.push({uid:victim.uid,id:victim.id});lifetime.synchronizeCardLifetimes(s);
 s.players[1].grave.pop();s.players[1].monsters.push(victim);lifetime.synchronizeCardLifetimes(s);
 while(s.phase==='response')s=e.step(restore(s),s.players[e.decisionPlayer(s)].id,{kind:'pass'});
 assert.equal(s.players[1].monsters[0].faceUp,true);assert.equal(s.players[0].grave.filter(c=>c.uid==='book').length,1);
});
test('unknown choice continuation and malformed target bindings fail closed',()=>{
 const s=game();s.phase='choice';s.choice={actor:0,targets:['x'],source:'future-unknown'};
 assert.throws(()=>assertDuelState(s),/continuação/);
 const bad=game();bad.cardLifetimes={x:{zone:'grave',epoch:-1}};assert.throws(()=>assertDuelState(bad),/identidade/);
 const target=game();target.pending={kind:'spell',actor:0,card:'x',id:'14087893',target:'victim',targetBinding:{uid:'other',zone:'monsters',epoch:0}};assert.throws(()=>assertDuelState(target),/alvo/);
});
