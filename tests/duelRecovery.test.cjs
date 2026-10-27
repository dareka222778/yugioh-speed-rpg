const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'duel-recovery-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
let database=require('../dist/database'),store=require('../dist/duelStore');const decks=require('../dist/decks');
for(const id of ['recover-a','recover-b']){database.createPlayer(id,id);database.chooseStarterDeck(id,'warrior');decks.openDeck(id);decks.activateDeck(id,1);}
function start(){const invite=store.challenge('recover-a','recover-b','g','c');return store.acceptChallenge(invite.id,'recover-b','g',0);}
function finish(r){if(r.status==='playing')store.performDuelAction(r.id,'recover-a','g',r.revision,{kind:'concede'});}
test('REA-A03/R01: durable receipt survives reopen and returns current state without repeating action',()=>{
 const before=start(),actor=before.state.players[before.state.current].id;
 const committed=store.performDuelAction(before.id,actor,'g',before.revision,0,'interaction-recovery');
 const events=store.duelEventsAt(before.id,committed.revision);assert.deepEqual(events,committed.events);
 database.db.close();for(const filename of Object.keys(require.cache))if(filename.startsWith(path.resolve(__dirname,'../dist')+path.sep))delete require.cache[filename];database=require('../dist/database');store=require('../dist/duelStore');
 const replay=store.performDuelAction(before.id,actor,'g',before.revision,0,'interaction-recovery');
 assert.equal(replay.receipt.replayed,true);assert.equal(replay.receipt.committedRevision,committed.revision);assert.deepEqual(replay.state,committed.state);assert.equal(replay.revision,committed.revision);
 for(const [who,guild,index] of [['outsider','g',0],[actor,'other',0],[actor,'g',1]])assert.throws(()=>store.performDuelAction(before.id,who,guild,before.revision,index,'interaction-recovery'),/outra solicitação/);
 assert.throws(()=>store.performDuelAction(before.id,actor,'g',before.revision,0,'another-request'),/antigo/);
 finish(replay);
 const terminal=store.performDuelAction(before.id,actor,'g',before.revision,0,'interaction-recovery');assert.equal(terminal.status,'finished');assert.equal(terminal.receipt.committedRevision,committed.revision);
});
test('REA-R01/R02: receipt write failure rolls back state, membership and event journal',()=>{
 const before=start();database.db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON duel_action_receipts BEGIN SELECT RAISE(ABORT,'receipt failure'); END");
 assert.throws(()=>store.performDuelAction(before.id,'recover-a','g',before.revision,{kind:'concede'},'failure-request'),/receipt failure/);
 assert.deepEqual(store.getDuel(before.id),before);assert.ok(store.currentDuel('recover-a'));assert.deepEqual(store.duelEventsAt(before.id,before.revision+1),[]);
 database.db.exec('DROP TRIGGER fail_receipt');
 const committed=store.performDuelAction(before.id,'recover-a','g',before.revision,{kind:'concede'},'failure-request');assert.equal(committed.status,'finished');assert.equal(committed.receipt.replayed,false);
});
test('REA-R02: active unpublished revisions are retried and stale acknowledgments cannot hide updates',()=>{
 const before=start();store.setDuelMessage(before.id,'c','m');
 const actor=before.state.players[before.state.current].id;const next=store.performDuelAction(before.id,actor,'g',before.revision,0,'publication-request');
 assert.ok(store.expireDueDuels().some(r=>r.id===before.id));store.markDuelPublished(before.id,before.revision);
 assert.ok(store.expireDueDuels().some(r=>r.id===before.id));store.markDuelPublished(before.id,next.revision);
 assert.ok(!store.expireDueDuels().some(r=>r.id===before.id));finish(next);
});
test('REA-E01: intermediate activation movements are durable and not duplicated by receipt replay',()=>{
 const before=start();before.state.turn=3;before.state.players[before.state.current].hand.push({uid:'causal-pot',id:'55144522'});
 database.db.prepare('UPDATE duels SET state=? WHERE id=?').run(JSON.stringify(before.state),before.id);
 const actor=before.state.players[before.state.current].id,index=require('../dist/duelEngine').legalActions(before.state,actor).findIndex(a=>a.kind==='spell'&&a.card==='causal-pot');assert.ok(index>=0);
 const committed=store.performDuelAction(before.id,actor,'g',before.revision,index,'causal-request');
 const events=store.duelEventsAt(before.id,committed.revision),moves=events.filter(x=>x.type==='cardMoved'&&x.uid==='causal-pot');
 assert.deepEqual(moves.map(x=>[x.from,x.to]),[['hand','backrow'],['backrow','grave']]);
 store.performDuelAction(before.id,actor,'g',before.revision,index,'causal-request');assert.deepEqual(store.duelEventsAt(before.id,committed.revision),events);finish(committed);
});
test('REA-A01: independent SQLite writers from one revision commit at most one action',async()=>{
 const before=start(),{spawn}=require('node:child_process');
 const writer=actor=>new Promise((resolve,reject)=>{const script="const s=require('./dist/duelStore');try{const r=s.performDuelAction(process.argv[1],process.argv[2],'g',Number(process.argv[3]),{kind:'concede'},process.argv[4]);console.log(JSON.stringify({ok:true,revision:r.revision}));}catch(e){console.log(JSON.stringify({ok:false,error:e.message}));}";
  const child=spawn(process.execPath,['-e',script,before.id,actor,String(before.revision),'race-'+actor],{cwd:path.resolve(__dirname,'..'),env:{...process.env,DATABASE_PATH:path.join(temp,'game.sqlite')},stdio:['ignore','pipe','pipe']});let output='',errors='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>errors+=d);child.on('error',reject);child.on('close',code=>{try{if(code!==0)throw Error(errors);resolve(JSON.parse(output));}catch(e){reject(e);}});
 });
 const results=await Promise.all(['recover-a','recover-b'].map(writer));assert.equal(results.filter(r=>r.ok).length,1);assert.equal(store.getDuel(before.id).revision,before.revision+1);
 assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts WHERE duel_id=?').get(before.id).n,1);
});
after(()=>{database.db.close();fs.rmSync(temp,{recursive:true,force:true});});
