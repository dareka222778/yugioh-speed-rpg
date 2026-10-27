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
test('REA-P03: Standby uses the persisted choice channel without inventing a second draw',()=>{
 const {scheduleStandbyTask}=require('../dist/standbyFlow');let s=scheduleStandbyTask(game(),{id:'standby',turn:2,actor:1,optional:false,options:[{id:'gain',label:'Recuperar',operations:[{kind:'gainLP',player:'self',amount:1}]}]});
 s=e.step(s,'a',{kind:'end'});assert.equal(s.choice.source,'standby');assert.equal(s.players[1].hand.length,5);assertDuelState(JSON.parse(JSON.stringify(s)));
});
test('REA-T01: explicit token creation conserves physical and economic cards',{todo:'Tokens are deliberately unsupported; conservation currently rejects creation'},()=>{
 const before=game(),after=structuredClone(before);after.players[0].monsters.push({uid:'token',id:'token',entityKind:'token',position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});assert.doesNotThrow(()=>assertDuelTransition(before,after));
});
test('REA-E01: shared physical operations expose both causal moves despite equal endpoint zones',()=>{
 const {beginCardMovementTrace,synchronizeCardLifetimes}=require('../dist/cardLifetime'),{sendMonsterToGrave}=require('../dist/monsterExit'),{specialSummonFromPile}=require('../dist/monsterEntry');
 const before=game(),c=before.players[0].hand.shift();before.players[0].monsters.push({...c,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});synchronizeCardLifetimes(before);
 const after=structuredClone(before);beginCardMovementTrace(after,before);assert.equal(sendMonsterToGrave(after,c.uid),true);assert.ok(specialSummonFromPile(after,0,0,'grave',c.uid));assertDuelTransition(before,after);
 assert.deepEqual(transitionEvents(before,after).filter(event=>event.type==='cardMoved'&&event.uid===c.uid).map(move=>[move.from,move.to]),[['monsters','grave'],['grave','monsters']]);
});
test('REA-L02: pending snapshots have an explicit immutable archived executable resolver',()=>{
 const resolver=require('../dist/resolverArchive').getArchivedDefinitionResolver('engine-v1');assert.equal(typeof resolver.step,'function');assert.equal(Object.isFrozen(resolver),true);
});
