const {test}=require('node:test'),assert=require('node:assert/strict');
const {createDuel,legalActions,step}=require('../dist/duelEngine');
const {starterContents}=require('../dist/cardCatalog');
const {getCard}=require('../dist/collection');
const {getEffect}=require('../dist/effectRegistry');
const {chooseNPC}=require('../dist/duelStore');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id)=>({uid,id});
const back=(uid,id='56120475')=>({...ref(uid,id),faceUp:false,setTurn:1});
const mon=(uid,id='91152256',owner=0)=>({...ref(uid,id),owner,faceUp:true,position:'atk',entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});
const game=()=>{const s=createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);s.turn=3;s.current=0;s.phase='battle';s.players[0].monsters=[mon('attacker')];s.players[1].backrow=[back('armor')];return s;};
function use(s,actor,kind,pred=()=>true){const a=legalActions(s,actor).find(a=>a.kind===kind&&pred(a));assert.ok(a,`No ${kind} legal in ${s.phase}: ${JSON.stringify(legalActions(s,actor))}`);return step(s,actor,a);}
test('Sakuretsu Armor is an audited and registered targeted normal trap',()=>{assert.equal(getEffect('56120475').kind,'sakuretsuArmor');assert.equal(getCard('56120475').konamiId,5799);});
test('Sakuretsu Armor only activates when an opponent declares an attack and targets that attacking instance',()=>{
 let s=game();s.phase='main';assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='armor'));
 s.phase='response';s.priority=1;s.pending={kind:'attack',actor:0,card:'attacker',stage:'damage'};
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='armor'));
 s.pending.stage='declare';
 assert.deepEqual(legalActions(s,'b').filter(a=>a.kind==='trap'&&a.card==='armor').map(a=>a.target),['attacker']);
 s.pending.actor=1;
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='armor'));
});
test('Sakuretsu destroys only the attacking monster before damage, preserving other Attack Position monsters',()=>{
 let s=game();s.players[0].monsters.push(mon('safe'));s.players[1].monsters=[mon('defender','15025844',1)];
 s=use(s,'a','attack',a=>a.card==='attacker'&&a.target==='defender');
 s=use(s,'b','trap',a=>a.card==='armor'&&a.target==='attacker');
 assert.deepEqual(s.players[0].monsters.map(m=>m.uid),['safe']);
 assert.equal(s.players[1].monsters.length,1);
 assert.equal(s.players[1].lp,4000);
 assert.ok(s.players[0].grave.some(c=>c.uid==='attacker'));
 assert.ok(s.players[1].grave.some(c=>c.uid==='armor'));
});
test('Book of Moon chains to Sakuretsu Armor, making its target invalid without destroying the attacker',()=>{
 let s=game();s.players[0].hand=[ref('book','14087893')];
 s=use(s,'a','attack');
 s=use(s,'b','trap',a=>a.card==='armor');
 s=use(s,'a','spell',a=>a.card==='book'&&a.target==='attacker');
 assert.equal(s.players[0].monsters.length,1);
 assert.equal(s.players[0].monsters[0].faceUp,false);
 assert.equal(s.players[0].monsters[0].position,'def');
 assert.equal(s.players[1].lp,4000);
 assert.ok(s.players[1].grave.some(c=>c.uid==='armor'));
});
test('Seven Tools negates Sakuretsu before it destroys attacker',()=>{
 let s=game();s.players[0].backrow=[back('seven','03819470')];
 s=use(s,'a','attack');
 s=use(s,'b','trap',a=>a.card==='armor');
 s=use(s,'a','trap',a=>a.card==='seven');
 assert.equal(s.players[0].lp,3000);
 assert.equal(s.players[0].monsters.length,1);
 assert.ok(s.players[0].grave.some(c=>c.uid==='seven'));
});
test('Sakuretsu destruction is effect-based and cannot trigger Mystic Tomato battle recruitment',()=>{
 let s=game();s.players[0].monsters=[mon('attacker','83011277')];s.players[0].deck=[ref('recruit','11384280')];
 s=use(s,'a','attack');
 s=use(s,'b','trap',a=>a.card==='armor');
 assert.ok(s.players[0].grave.some(c=>c.uid==='attacker'));
 assert.equal(s.players[0].deck.length,1);
 assert.equal(s.choice,undefined);
});
test('NPC selects Sakuretsu Armor when the opponent declares attack',()=>{
 let s=game();s.phase='response';s.priority=1;
 s.pending={kind:'attack',actor:0,card:'attacker',stage:'declare'};
 const action=chooseNPC(s,'b');
 assert.equal(action.kind,'trap');assert.equal(action.card,'armor');
});
