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
 database.db.close();for(const name of ['duelStore','database'])delete require.cache[require.resolve('../dist/'+name)];database=require('../dist/database');store=require('../dist/duelStore');
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
after(()=>{database.db.close();fs.rmSync(temp,{recursive:true,force:true});});
