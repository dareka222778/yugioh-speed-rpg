const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'duel-integrity-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const e=require('../dist/duelEngine'),integrity=require('../dist/duelIntegrity'),{starterContents}=require('../dist/cardCatalog'),db=require('../dist/database'),store=require('../dist/duelStore');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const game=()=>e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);
test('old version-1 snapshots without the optional new zones/turn metadata remain usable',()=>{
 const s=game();for(const p of s.players){delete p.extra;delete p.banished;delete p.field;}delete s.turnEnding;integrity.assertDuelState(JSON.parse(JSON.stringify(s)));const a=e.legalActions(s,'a')[0];const n=e.step(s,'a',a);integrity.assertDuelTransition(s,n);
});
test('contracts reject duplicate UIDs, unknown cards, malformed costs/stats and zone overflow',()=>{
 const faults=[s=>s.players[0].hand.push(s.players[0].hand[0]),s=>s.players[0].hand[0].id='unknown',s=>s.players[0].lp=-1,s=>s.players[0].lp=NaN,s=>s.version=2,s=>s.current=8,s=>s.phase='invalid',s=>s.priority=-1,s=>s.players[1].id='a',s=>s.chain=[{actor:4,card:'x',id:'91152256',target:''}],s=>s.graveTriggers=[{actor:4,card:'x',id:'91152256'}],s=>{s.phase='choice';s.choice={actor:1,targets:[]};},s=>s.players[0].backrow=[0,1,2,3].map(i=>({uid:'back'+i,id:'17814387',faceUp:false,setTurn:1}))];
 for(const change of faults){const s=game();change(s);assert.throws(()=>integrity.assertDuelState(s),/inválido/);}
});
test('transition contract rejects losing, duplicating, changing a card or changing players',()=>{
 for(const change of [s=>s.players[0].hand.pop(),s=>s.players[0].hand.push({uid:'new',id:'91152256'}),s=>s.players[0].hand[0].id='48305365',s=>s.players[0].id='new-player']){const s=game(),n=structuredClone(s);change(n);assert.throws(()=>integrity.assertDuelTransition(s,n),/inválido/);}
});
test('zone transfer of a stolen card is valid globally, not misclassified as a per-player loss',()=>{
 const s=game(),n=structuredClone(s);const c=n.players[0].hand.pop();n.players[1].grave.push(c);integrity.assertDuelTransition(s,n);
});
test('invalid saved state never mutates SQLite or pays a reward',()=>{
 const s=game();s.encounter={npcId:'joey'};s.players[0].hand.push(s.players[0].hand[0]);const raw=JSON.stringify(s);
 db.db.prepare('INSERT INTO duels(id,guild_id,channel_id,status,revision,updated,state) VALUES(?,?,?,?,?,?,?)').run('corrupt','g','c','playing',2,Date.now(),raw);
 assert.throws(()=>store.getDuel('corrupt'),/inválido/);assert.throws(()=>store.performDuelAction('corrupt','a','g',2,{kind:'concede'}),/inválido/);
 assert.equal(db.db.prepare('SELECT state FROM duels WHERE id=?').get('corrupt').state,raw);assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM npc_results').get().n,0);
});
test('invalid JSON and missing playing-state fail without erasing the stored record',()=>{
 for(const [id,raw]of [['bad-json','{'],['missing',null]]){db.db.prepare('INSERT INTO duels(id,guild_id,channel_id,status,revision,updated,state) VALUES(?,?,?,?,?,?,?)').run(id,'g','c','playing',0,Date.now(),raw);assert.throws(()=>store.getDuel(id),/inválid/);assert.equal(db.db.prepare('SELECT state FROM duels WHERE id=?').get(id).state,raw);}
});
test('constructor and timeout boundaries reject malformed input without changing valid snapshots',()=>{
 assert.throws(()=>e.validateDuelCards(null),/20 a 30/);assert.throws(()=>e.createDuel(null),/inválidos/);assert.throws(()=>e.createDuel([{id:'',name:'A',cards:basic},{id:'b',name:'B',cards:basic}]),/inválidos/);assert.throws(()=>e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],42),/Sorteio/);
 const s=game(),copy=JSON.stringify(s),expired=e.timeoutDuel(s);assert.equal(expired.phase,'finished');integrity.assertDuelTransition(s,expired);assert.equal(JSON.stringify(s),copy);
 const bad=structuredClone(s);bad.version=999;assert.throws(()=>e.timeoutDuel(bad),/inválido/);
});
after(()=>{db.db.close();fs.rmSync(temp,{recursive:true,force:true});});
test('temporary control needs a paired, valid deadline but legacy monsters need no new metadata',()=>{
 const s=game();s.turn=3;
 const borrowed={uid:'borrowed',id:'91152256',owner:1,faceUp:true,position:'atk',entered:2,changed:2,attacked:0,atkBoost:0,defBoost:0,returnTo:1,returnTurn:3};
 s.players[0].monsters=[borrowed];
 assert.doesNotThrow(()=>integrity.assertDuelState(s));
 for(const corrupt of [
  m=>{m.returnTurn=NaN;},m=>{m.returnTurn=Infinity;},m=>{m.returnTurn='3';},
  m=>{m.returnTurn=-1;},m=>{m.returnTurn=3.5;},m=>{m.returnTurn=4;},
  m=>{m.returnTurn=2;},m=>{delete m.returnTurn;},m=>{delete m.returnTo;}
 ]){
  const damaged=structuredClone(s);corrupt(damaged.players[0].monsters[0]);
  assert.throws(()=>integrity.assertDuelState(damaged),/prazo de devolução/);
 }
 const legacy=structuredClone(s);delete legacy.players[0].monsters[0].returnTurn;delete legacy.players[0].monsters[0].returnTo;
 assert.doesNotThrow(()=>integrity.assertDuelState(legacy));
});
