const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuel,legalActions,step}=require('../dist/duelEngine');
const {starterContents}=require('../dist/cardCatalog');
const {getCard}=require('../dist/collection');
const {getEffect}=require('../dist/effectRegistry');
const {chooseNPC}=require('../dist/duelStore');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id)=>({uid,id});
const mon=(uid,id='91152256',owner=0,position='atk')=>({...ref(uid,id),owner,faceUp:true,position,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const back=(uid,id='44095762')=>({...ref(uid,id),faceUp:false,setTurn:1});
const game=()=>{const s=createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);s.turn=3;s.current=0;s.phase='battle';s.players[0].monsters=[mon('attacker')];s.players[1].backrow=[back('mirror')];return s;};
function play(s,actor,kind,check=()=>true){
 const legal=legalActions(s,actor),a=legal.find(a=>a.kind===kind&&check(a));
 assert.ok(a,`Missing ${kind} in ${s.phase} for ${actor}: ${JSON.stringify(legal)}`);
 return step(s,actor,a);
}
test('Força do Espelho is a registered playable Normal Trap with correct card details',()=>{
 assert.equal(getEffect('44095762').kind,'mirrorForce');
 assert.equal(getCard('44095762').name,'Força do Espelho');
 assert.equal(getCard('44095762').konamiId,4887);
});
test('Mirror Force is only activatable in response to an opponent attack declaration',()=>{
 let s=game();s.phase='main';
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='mirror'));
 s.phase='response';s.priority=1;s.pending={kind:'summon',actor:0,card:'attacker'};
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='mirror'));
 s.pending={kind:'attack',actor:0,card:'attacker',stage:'damage'};
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='mirror'));
 s.pending={kind:'attack',actor:0,card:'attacker',stage:'declare'};
 assert.ok(legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='mirror'));
 s.pending.actor=1;
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='mirror'));
});
test('a direct attack is prevented if Mirror Force destroys the attacking monster',()=>{
 let s=game();
 s=play(s,'a','attack',a=>!a.target);
 assert.equal(s.phase,'response');
 s=play(s,'b','trap',a=>a.card==='mirror');
 assert.equal(s.players[0].monsters.length,0);
 assert.ok(s.players[0].grave.some(c=>c.uid==='attacker'));
 assert.equal(s.players[1].lp,4000);
 assert.ok(s.players[1].grave.some(c=>c.uid==='mirror'));
});
test('Mirror Force destroys all enemy Attack Position monsters, not Defense monsters or allies',()=>{
 let s=game();
 s.players[0].monsters.push(mon('attacker-two'),mon('defender-ours','91152256',0,'def'));
 s.players[1].monsters=[mon('defender-theirs','91152256',1,'def')];
 s=play(s,'a','attack',a=>a.card==='attacker'&&a.target==='defender-theirs');
 s=play(s,'b','trap',a=>a.card==='mirror');
 assert.deepEqual(s.players[0].monsters.map(c=>c.uid),['defender-ours']);
 assert.deepEqual(s.players[1].monsters.map(c=>c.uid),['defender-theirs']);
 assert.equal(s.players[0].grave.filter(c=>['attacker','attacker-two'].includes(c.uid)).length,2);
});
test('Seven Tools of the Bandit negates Mirror Force in the chain, with 1000 LP cost',()=>{
 let s=game();s.players[0].backrow=[back('seven','03819470')];
 s=play(s,'a','attack');
 s=play(s,'b','trap',a=>a.card==='mirror');
 assert.equal(s.phase,'response');
 s=play(s,'a','trap',a=>a.card==='seven');
 assert.equal(s.players[0].lp,3000);
 assert.ok(s.players[0].monsters.some(c=>c.uid==='attacker'));
 assert.ok(s.players[1].grave.some(c=>c.uid==='mirror'));
 assert.ok(s.players[0].grave.some(c=>c.uid==='seven'));
});
test('MST destroying activated Mirror Force does not negate its effect',()=>{
 let s=game();s.players[0].hand=[ref('mst','05318639')];
 s=play(s,'a','attack');
 s=play(s,'b','trap',a=>a.card==='mirror');
 assert.equal(s.phase,'response');
 assert.ok(legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='mst'&&a.target==='mirror'));
 s=play(s,'a','spell',a=>a.card==='mst'&&a.target==='mirror');
 assert.equal(s.players[0].monsters.length,0);
 assert.equal(s.players[1].lp,4000);
 assert.ok(s.players[0].grave.some(c=>c.uid==='mst'));
 assert.ok(s.players[1].grave.some(c=>c.uid==='mirror'));
});
test('Mirror Force destruction is by effect, not battle, and does not recruit Mystic Tomato',()=>{
 let s=game();s.players[0].monsters.push(mon('tomato','83011277'));
 s.players[0].deck=[ref('eligible','11384280')];
 s=play(s,'a','attack');
 s=play(s,'b','trap',a=>a.card==='mirror');
 assert.equal(s.players[0].monsters.length,0);
 assert.equal(s.players[0].hand.length,4);
 assert.equal(s.players[0].deck.length,1);
 assert.equal(s.choice,undefined);
});
test('NPC chooses Mirror Force to counter an enemy attack',()=>{
 let s=game();s.phase='response';s.priority=1;
 s.pending={kind:'attack',actor:0,card:'attacker',stage:'declare'};
 const a=chooseNPC(s,'b');assert.equal(a.kind,'trap');assert.equal(a.card,'mirror');
});
