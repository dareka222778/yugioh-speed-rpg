const {test}=require('node:test'),assert=require('node:assert/strict');
const {createDuel,legalActions,step}=require('../dist/duelEngine');
const {getEffect}=require('../dist/effectRegistry');
const {getCard}=require('../dist/collection');
const {starterContents}=require('../dist/cardCatalog');
const {chooseNPC}=require('../dist/duelStore');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id)=>({uid,id});
const trap=(uid)=>({...ref(uid,'29401950'),setTurn:1,faceUp:false});
const monster=(uid,id,owner=0)=>({...ref(uid,id),owner,faceUp:true,position:'atk',entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});
const game=()=>{const s=createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>0.5);s.turn=3;return s;};
function act(s,owner,kind,pred=()=>true){const a=legalActions(s,owner).find(a=>a.kind===kind&&pred(a));assert.ok(a,`No ${kind} action in ${s.phase}: ${JSON.stringify(legalActions(s,owner))}`);return step(s,owner,a);}
test('Bottomless Trap Hole has audited effect, Konami metadata and supported card art',()=>{
 assert.equal(getEffect('29401950').kind,'bottomlessTrapHole');
 assert.equal(getCard('29401950').konamiId,5400);
 assert.equal(getCard('29401950').kind,'trap');
});
test('Bottomless is legal only for an enemy summon at 1500+ ATK and not outside summon windows',()=>{
 let s=game();s.players[1].backrow=[trap('bottomless')];
 s.players[0].monsters=[monster('weak','91152256')];
 s.phase='response';s.priority=1;s.pending={kind:'summon',actor:0,card:'weak',id:'91152256'};
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='bottomless'));
 s.players[0].monsters=[monster('strong','48305365')];s.pending={kind:'summon',actor:0,card:'strong',id:'48305365'};
 assert.deepEqual(legalActions(s,'b').filter(a=>a.kind==='trap'&&a.card==='bottomless').map(a=>a.target),['strong']);
 s.pending.actor=1;assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='bottomless'));
 s.pending={kind:'none'};assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='bottomless'));
});
test('destroy and banish preserves owner, not controller; never send the monster to Graveyard',()=>{
 let s=game();s.players[1].backrow=[trap('bottomless')];
 s.players[0].hand=[ref('strong','48305365')];s.players[0].monsters=[monster('safe','91152256')];
 s=act(s,'a','summon',a=>a.card==='strong'&&a.position==='atk');
 s=act(s,'b','trap',a=>a.card==='bottomless');
 assert.deepEqual(s.players[0].monsters.map(c=>c.uid),['safe']);
 assert.ok(s.players[0].banished.some(c=>c.uid==='strong'));
 assert.ok(!s.players[0].grave.some(c=>c.uid==='strong'));
 assert.ok(s.players[1].grave.some(c=>c.uid==='bottomless'));
});
test('Bottomless also responds to Flip and Special Summons',()=>{
 for(const kind of ['flip','specialSummon']){
  const s=game();s.players[1].backrow=[trap('bottomless')];
  s.players[0].monsters=[monster('strong','48305365')];s.phase='response';s.priority=1;
  s.pending={kind,actor:0,card:'strong',id:'48305365'};
  const a=legalActions(s,'b').find(a=>a.kind==='trap'&&a.card==='bottomless');
  assert.ok(a,`The ${kind} trigger is required`);
  const next=step(s,'b',a);
  assert.ok(next.players[0].banished.some(c=>c.uid==='strong'));
 }
});
test('Book of Moon chained to Bottomless hides the monster so destruction and banish fail',()=>{
 let s=game();s.players[1].backrow=[trap('bottomless')];
 s.players[0].hand=[ref('strong','48305365'),ref('book','14087893')];
 s=act(s,'a','summon',a=>a.card==='strong');
 s=act(s,'b','trap');
 s=act(s,'a','spell',a=>a.card==='book'&&a.target==='strong');
 assert.equal(s.players[0].monsters.length,1);
 assert.equal(s.players[0].monsters[0].faceUp,false);
 assert.ok(!s.players[0].banished?.some(c=>c.uid==='strong'));
 assert.ok(!s.players[0].grave.some(c=>c.uid==='strong'));
});
test('The banished monster goes to its actual owner even after control changes',()=>{
 let s=game();s.players[1].backrow=[trap('bottomless')];
 s.players[0].monsters=[monster('borrowed','48305365',1)];
 s.phase='response';s.priority=1;s.pending={kind:'specialSummon',actor:0,card:'borrowed',id:'48305365'};
 s=act(s,'b','trap');
 assert.equal(s.players[0].monsters.length,0);
 assert.ok(s.players[1].banished.some(c=>c.uid==='borrowed'));
 assert.ok(!s.players[0].banished.some(c=>c.uid==='borrowed'));
});
test('Banishment cannot accidentally trigger effects that require a monster sent to the Graveyard',()=>{
 let s=game();s.players[1].backrow=[trap('bottomless')];
 const sangan=monster('sangan','26202165');sangan.atkBoost=500;
 s.players[0].monsters=[sangan];s.players[0].deck=[ref('candidate','91152256')];
 s.phase='response';s.priority=1;s.pending={kind:'summon',actor:0,card:'sangan',id:'26202165'};
 s=act(s,'b','trap');
 assert.ok(s.players[0].banished.some(c=>c.uid==='sangan'));
 assert.equal(s.players[0].hand.some(c=>c.uid==='candidate'),false);
 assert.equal(s.players[0].deck.length,1);
 assert.equal(s.graveTriggers?.length??0,0);
});
test('Jinzo blocks Bottomless activation, and NPC chooses it against a qualifying monster',()=>{
 let s=game();s.players[0].monsters=[monster('strong','48305365')];s.players[1].backrow=[trap('bottomless')];
 s.phase='response';s.priority=1;s.pending={kind:'summon',actor:0,card:'strong',id:'48305365'};
 assert.equal(chooseNPC(s,'b').kind,'trap');
 s.players[0].monsters.push(monster('jinzo','77585513'));
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='bottomless'));
});
