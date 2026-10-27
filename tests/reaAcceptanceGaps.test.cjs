const {test}=require('node:test'),assert=require('node:assert/strict');
const e=require('../dist/duelEngine'),{starterContents}=require('../dist/cardCatalog');
const {assertDuelState,assertDuelTransition}=require('../dist/duelIntegrity'),{transitionEvents}=require('../dist/duelTransitions');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const game=()=>e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);
test('REA-P04: phase advancement rejects unresolved response and choice without mutation',()=>{
 for(const phase of ['response','choice']){const s=game();s.phase=phase;if(phase==='choice')s.choice={actor:0,targets:['x']};const before=JSON.stringify(s);
  assert.throws(()=>e.step(s,'a',{kind:'end'}),/inválida/);assert.equal(JSON.stringify(s),before);
 }
});
// Executed gap probes remain TODO, never counted as accepted mechanics.
test('REA-P03: persisted mandatory Standby choice',{todo:'No Standby phase or certified Standby effect exists'},()=>{
 const s=game();s.phase='standby';s.choice={actor:0,targets:['x']};assert.doesNotThrow(()=>assertDuelState(JSON.parse(JSON.stringify(s))));
});
test('REA-T01: explicit token creation conserves physical and economic cards',{todo:'Tokens are deliberately unsupported; conservation currently rejects creation'},()=>{
 const before=game(),after=structuredClone(before);after.players[0].monsters.push({uid:'token',id:'token',entityKind:'token',position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});assert.doesNotThrow(()=>assertDuelTransition(before,after));
});
test('REA-E01: same-action leave and return emits two durable causal movements',{todo:'Transition journal persists summaries; intra-action causal movement instrumentation remains required'},()=>{
 const before=game(),after=structuredClone(before),c=after.players[0].hand.shift();before.players[0].hand.shift();const monster={...c,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};before.players[0].monsters.push({...monster});after.players[0].monsters.push({...monster});
 after.players[0].grave.push(after.players[0].monsters.pop());after.players[0].monsters.push(after.players[0].grave.pop());
 assert.equal(transitionEvents(before,after).filter(event=>event.type==='cardMoved'&&event.uid===c.uid).length,2);
});
test('REA-L02: pending snapshots select archived effect definitions after module upgrades',{todo:'Rules versions are supported, but an archive of effect resolvers is not implemented'},()=>{
 assert.equal(typeof require('../dist/effectRegistry').getArchivedDefinitionResolver,'function');
});
