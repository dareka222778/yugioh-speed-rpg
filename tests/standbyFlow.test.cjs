const {test}=require('node:test'),assert=require('node:assert/strict');
const e=require('../dist/duelEngine'),{scheduleStandbyTask}=require('../dist/standbyFlow'),{assertDuelState}=require('../dist/duelIntegrity'),{starterContents}=require('../dist/cardCatalog');
const cards=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id)),game=()=>e.createDuel([{id:'a',name:'A',cards},{id:'b',name:'B',cards}],()=>.5);
const task=(id='wait',optional=false)=>({id,turn:2,actor:1,optional,costLP:100,options:[{id:'recover',label:'Recuperar 200 PV',operations:[{kind:'gainLP',player:'self',amount:200}]}]});
function begin(s){s=e.step(s,'a',{kind:'end'});for(let n=0;s.phase==='response';n++){assert.ok(n<20);s=e.step(s,s.players[e.decisionPlayer(s)].id,{kind:'pass'});}return s;}
const restore=s=>{const r=JSON.parse(JSON.stringify(s));assertDuelState(r);return r;};
test('REA-P03: mandatory Standby choice suspends after exactly one draw and restores without phase skipping',()=>{
 let s=begin(scheduleStandbyTask(game(),task()));assert.equal(s.phase,'choice');assert.equal(s.choice.source,'standby');assert.equal(s.players[1].hand.length,5);assert.equal(s.turn,2);
 const raw=JSON.stringify(s);assert.throws(()=>e.step(s,'b',{kind:'end'}),/inválida/);assert.throws(()=>e.step(s,'b',{kind:'choose',target:'__skip__'}),/inválida/);assert.equal(JSON.stringify(s),raw);
 s=e.step(restore(s),'b',{kind:'choose',target:'recover'});assert.equal(s.phase,'main');assert.equal(s.players[1].lp,4100);assert.equal(s.players[1].hand.length,5);assert.equal(s.standby.completed.length,1);
 assert.throws(()=>e.step(restore(s),'b',{kind:'choose',target:'recover'}),/inválida/);
});
test('optional decline is explicit, free and resumes the next mandatory decision',()=>{
 let s=scheduleStandbyTask(scheduleStandbyTask(game(),task('optional',true)),task('mandatory'));s=begin(s);assert.ok(e.legalActions(s,'b').some(a=>a.target==='__skip__'));
 s=e.step(restore(s),'b',{kind:'choose',target:'__skip__'});assert.equal(s.players[1].lp,4000);assert.equal(s.phase,'choice');assert.equal(s.standby.active.id,'mandatory');
 s=e.step(restore(s),'b',{kind:'choose',target:'recover'});assert.deepEqual(s.standby.completed.map(r=>r.outcome),['declined','chosen']);
});
test('paid Standby activation opens a response chain and restores its root without paying again',()=>{
 let s=begin(scheduleStandbyTask(game(),task()));s.players[0].backrow.push({uid:'jar',id:'83968380',faceUp:false,setTurn:0});const hand=s.players[0].hand.length;
 s=e.step(s,'b',{kind:'choose',target:'recover'});assert.equal(s.phase,'response');assert.equal(s.players[1].lp,3900);
 const action=e.legalActions(s,'a').find(a=>a.kind==='trap'&&a.card==='jar');assert.ok(action);s=e.step(restore(s),'a',action);
 for(let n=0;s.phase==='response';n++){assert.ok(n<20);s=e.step(restore(s),s.players[e.decisionPlayer(s)].id,{kind:'pass'});}
 assert.equal(s.players[1].lp,4100);assert.equal(s.players[0].hand.length,hand+1);assert.equal(s.standby.completed.length,1);
});
test('invalid continuations, duplicated scheduling and reserved choices fail without modifying input',()=>{
 const s=game(),raw=JSON.stringify(s);for(const bad of [{...task(),options:[]},{...task(),options:[{...task().options[0],id:'__skip__'}]},{...task(),costLP:-1}])assert.throws(()=>scheduleStandbyTask(s,bad));assert.equal(JSON.stringify(s),raw);
 const queued=scheduleStandbyTask(s,task());assert.throws(()=>scheduleStandbyTask(queued,task()),/já agendada/);
 const broken=begin(queued);broken.standby.active.id='unknown';assert.throws(()=>assertDuelState(broken),/Espera/);
});
test('unpayable mandatory work cancels explicitly and a duel ending cancels unprocessed work',()=>{
 let s=game();s.players[1].lp=100;s=begin(scheduleStandbyTask(s,task()));assert.equal(s.phase,'main');assert.equal(s.standby.completed[0].outcome,'cancelled');assert.equal(s.players[1].lp,100);
 s=scheduleStandbyTask(game(),task());s=e.step(s,'a',{kind:'concede'});assert.equal(s.standby.completed[0].outcome,'cancelled');
});
