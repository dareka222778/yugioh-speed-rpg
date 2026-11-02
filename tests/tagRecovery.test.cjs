const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tag-recovery-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const database=require('../dist/database'),store=require('../dist/tagStore'),tag=require('../dist/tagDuel');
const members=['tr-a','tr-b','tr-c','tr-d'];for(const member of members)database.createPlayer(member,member);
function start(){let r=store.createTagLobby(members,'g','c');for(const member of members.slice(1))r=store.acceptTag(r.id,member,'g',r.revision);return r;}
test('REA-A03: 2v2 receipt replay preserves state and binds participant, guild and action',()=>{
 const before=start(),actor=tag.tagDecisionMember(before.state).id;
 const committed=store.actTag(before.id,actor,'g',before.revision,0,'tag-request');
 const replay=store.actTag(before.id,actor,'g',before.revision,0,'tag-request');assert.equal(replay.receipt.replayed,true);assert.deepEqual(replay.state,committed.state);assert.equal(replay.revision,committed.revision);
 for(const [who,guild,index] of [['spectator','g',0],[actor,'other',0],[actor,'g',1]])assert.throws(()=>store.actTag(before.id,who,guild,before.revision,index,'tag-request'),/outra solicitação/);
 assert.throws(()=>store.actTag(before.id,actor,'g',before.revision,0,'tag-new-request'),/desatualizado/);
 store.quitTag(before.id,actor,'g',committed.revision);
});
test('REA-R01: 2v2 receipt failure rolls back the action and retry commits once',()=>{
 const before=start(),actor=tag.tagDecisionMember(before.state).id;
 database.db.exec("CREATE TRIGGER fail_tag_receipt BEFORE INSERT ON tag_action_receipts BEGIN SELECT RAISE(ABORT,'tag receipt failure'); END");
 assert.throws(()=>store.actTag(before.id,actor,'g',before.revision,0,'tag-failure-request'),/tag receipt failure/);assert.deepEqual(store.getTag(before.id),before);
 database.db.exec('DROP TRIGGER fail_tag_receipt');const next=store.actTag(before.id,actor,'g',before.revision,0,'tag-failure-request');assert.equal(next.revision,before.revision+1);store.quitTag(before.id,actor,'g',next.revision);
});
after(()=>{database.db.close();fs.rmSync(temp,{recursive:true,force:true});});
