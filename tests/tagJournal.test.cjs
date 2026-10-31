const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tag-journal-'));process.env.DATABASE_PATH=path.join(dir,'game.sqlite');
const database=require('../dist/database'),store=require('../dist/tagStore'),tag=require('../dist/tagDuel'),{projectTransitionEvents}=require('../dist/duelTransitions');
for(const id of ['a','b','c','d'])database.createPlayer(id,id);
test('2v2 causal journal preserves activation moves and private recipient identity transactionally',()=>{
 let r=store.createTagLobby(['a','b','c','d'],'g','c','classic-loan');for(const member of ['b','c','d'])r=store.acceptTag(r.id,member,'g',r.revision);
 r.state.core.turn=3;const member=tag.tagDecisionMember(r.state),team=member.team,seat=r.state.active[team],uid=`m${seat}:pot`;
 r.state.core.players[team].hand.push({uid,id:'55144522'});database.db.prepare('UPDATE tag_sessions SET state=? WHERE id=?').run(JSON.stringify(r.state),r.id);
 const index=tag.tagActions(r.state,member.id).findIndex(a=>a.kind==='spell'&&a.card===uid);assert.ok(index>=0);
 database.db.exec("CREATE TRIGGER fail_tag_journal BEFORE INSERT ON tag_transition_events BEGIN SELECT RAISE(ABORT,'journal failure'); END");assert.throws(()=>store.actTag(r.id,member.id,'g',r.revision,index,'journal-request'),/journal failure/);assert.equal(store.getTag(r.id).revision,r.revision);assert.deepEqual(store.tagEventsAt(r.id,r.revision+1),[]);
 database.db.exec('DROP TRIGGER fail_tag_journal');const committed=store.actTag(r.id,member.id,'g',r.revision,index,'journal-request'),events=store.tagEventsAt(r.id,committed.revision);
 assert.ok(events.some(e=>e.type==='cardMoved'&&e.uid===uid&&e.from==='hand'&&e.to==='backrow'));
 store.actTag(r.id,member.id,'g',r.revision,index,'journal-request');assert.deepEqual(store.tagEventsAt(r.id,committed.revision),events);
 // A randomly dealt Quick-Play may keep the activation waiting for responses.
 // Draw privacy belongs to the revision that actually resolves Pot, not its emission.
 let resolved=committed,allEvents=[...events];for(let n=0;resolved.state.core.phase==='response';n++){
  assert.ok(n<12,'response budget');const actor=tag.tagDecisionMember(resolved.state).id,pass=tag.tagActions(resolved.state,actor).findIndex(a=>a.kind==='pass');assert.ok(pass>=0);resolved=store.actTag(r.id,actor,'g',resolved.revision,pass);allEvents.push(...store.tagEventsAt(r.id,resolved.revision));
 }
 const privateEvents=allEvents.filter(e=>e.visibility==='private');assert.ok(privateEvents.length>0);assert.ok(privateEvents.every(e=>e.player===member.id));assert.ok(projectTransitionEvents(allEvents,'spectator').every(e=>e.visibility==='public'));
 store.quitTag(r.id,member.id,'g',resolved.revision);
});
after(()=>{database.db.close();fs.rmSync(dir,{recursive:true,force:true});});
