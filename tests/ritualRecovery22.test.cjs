const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ritual22-native-'));process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
let d=require('../dist/database'),store=require('../dist/duelStore');
const e=require('../dist/duelEngine'),{ritualBatch22:cards,ritualEffects22:effects}=require('../dist/ritualBatch22'),decks=require('../dist/decks');
const basic=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
function setup(spell,monster){const s=e.createDuel([{id:'r22-a',name:'A',cards:basic},{id:'r22-b',name:'B',cards:basic}],undefined,0,{randomSeed:'22'.repeat(32)});s.turn=3;for(const p of s.players){p.hand=[];p.monsters=[];p.backrow=[];p.grave=[];}s.players[0].hand=[{uid:'spell',id:spell.id},{uid:'ritual',id:monster.id},{uid:'m0',id:'91152256'},{uid:'m1',id:'91152256'}];return s;}
test('Ritual family: actual NPC completes every named recipe without a choice loop or hidden opponent knowledge',()=>{
 for(const spell of cards.filter(c=>effects[c.id].kind==='ritualSummon')){const monster=cards.find(c=>c.id===effects[spell.id].ritual.monsterId);let s=setup(spell,monster);for(let n=0;!s.players[0].monsters.some(m=>m.uid==='ritual');n++){assert.ok(n<20,spell.id);const actor=s.players[e.decisionPlayer(s)].id,a=store.chooseNPC(s,actor);assert.ok(a);s=e.step(s,actor,a);}assert.equal(s.players[0].monsters[0].properlySummoned,true);}
});
test('Ritual choice survives real SQLite reopen; receipt failure rolls back Tributes and duplicate delivery never pays twice',()=>{
 for(const id of ['r22-a','r22-b']){d.createPlayer(id,id);d.chooseStarterDeck(id,'warrior');decks.openDeck(id);decks.activateDeck(id,1);}
 let row=store.challenge('r22-a','r22-b','g','c');row=store.acceptChallenge(row.id,'r22-b','g',row.revision);
 const spell=cards.find(c=>c.englishName==='Black Luster Ritual'),monster=cards.find(c=>c.id===effects[spell.id].ritual.monsterId);row.state=setup(spell,monster);d.db.prepare('UPDATE duels SET state=? WHERE id=?').run(JSON.stringify(row.state),row.id);row=store.getDuel(row.id);
 const act=(target,request)=>{const index=e.legalActions(row.state,'r22-a').findIndex(a=>target==='activate'?a.kind==='spell'&&a.card==='spell':a.kind==='choose'&&a.target===target);assert.ok(index>=0);row=store.performDuelAction(row.id,'r22-a','g',row.revision,index,request);};
 act('activate','r22-activate');act('ritual','r22-monster');act('m0','r22-m0');
 const saved=JSON.parse(JSON.stringify(row.state));d.db.close();for(const key of Object.keys(require.cache))if(key.startsWith(path.resolve(__dirname,'../dist')+path.sep))delete require.cache[key];d=require('../dist/database');store=require('../dist/duelStore');row=store.getDuel(row.id);assert.deepEqual(row.state,saved);assert.equal(row.state.players[0].grave.length,1);
 act('m1','r22-m1');act('__ritual_commit__','r22-confirm');const before=row,index=e.legalActions(row.state,'r22-a').findIndex(a=>a.kind==='choose'&&a.target==='__ritual_atk__');
 const economy=JSON.stringify(d.db.prepare('SELECT * FROM players ORDER BY discord_id').all());
 d.db.exec("CREATE TRIGGER r22_fault BEFORE INSERT ON duel_action_receipts BEGIN SELECT RAISE(ABORT,'r22 receipt failure'); END");try{assert.throws(()=>store.performDuelAction(before.id,'r22-a','g',before.revision,index,'r22-pay'),/r22 receipt failure/);assert.deepEqual(store.getDuel(before.id).state,before.state);}finally{d.db.exec('DROP TRIGGER r22_fault');}
 const done=store.performDuelAction(before.id,'r22-a','g',before.revision,index,'r22-pay'),again=store.performDuelAction(before.id,'r22-a','g',before.revision,index,'r22-pay');assert.equal(again.receipt.replayed,true);assert.deepEqual(again.state,done.state);assert.equal(done.state.players[0].grave.length,3);assert.equal(done.state.players[0].monsters.length,1);assert.equal(JSON.stringify(d.db.prepare('SELECT * FROM players ORDER BY discord_id').all()),economy);assert.deepEqual(d.db.pragma('foreign_key_check'),[]);
});
after(()=>{d.db.close();fs.rmSync(folder,{recursive:true,force:true});});
