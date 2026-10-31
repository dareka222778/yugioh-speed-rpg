const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');process.env.DATABASE_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'tag-training-')),'game.sqlite');const {db,createPlayer,getPlayer,getCollection}=require('../dist/database'),s=require('../dist/tagStore'),t=require('../dist/tagDuel'),{chooseNPC}=require('../dist/duelStore'),{decisionPlayer}=require('../dist/duelEngine'),{validateDiscordPayload}=require('../dist/discordPayload'),ui=require('../dist/tagUI');
test('solo 2v2 training plays three NPCs automatically, persists each decision and finishes with no economy changes',()=>{
 for(const source of ['yugi','joey','kaiba']){const owner='solo-'+source;createPlayer(owner,owner);const before=getPlayer(owner),collection=getCollection(owner);let r=s.runTagBots(s.createTagTraining(owner,'g','c',source).id),steps=0;const cards=new Map(t.tagInventory(r.state).map(c=>[c.uid,c.id]));assert.equal(r.members.filter(p=>p.automated).length,3);// Finished training removes the member lock immediately, even if the NPCs finish before the human's first action.
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(r.id).n,r.status==='playing'?1:0);
 while(r.status==='playing'){assert.equal(t.tagDecisionMember(r.state).id,owner);assert.ok(!s.isTagBotDecision(r));const a=chooseNPC(r.state.core,r.state.core.players[decisionPlayer(r.state.core)].id),index=t.tagActions(r.state,owner).findIndex(x=>JSON.stringify(x)===JSON.stringify(a));assert.ok(index>=0);r=s.runTagBots(s.actTag(r.id,owner,'g',r.revision,index).id);r=s.getTag(r.id);if(++steps>500)throw Error('Budget');for(const c of t.tagInventory(r.state))assert.equal(cards.get(c.uid),c.id);validateDiscordPayload(ui.tagPublicMessage(r));validateDiscordPayload(ui.tagPrivateMessage(r,owner));}
 assert.equal(s.currentTag(owner),undefined);assert.deepEqual(getPlayer(owner),before);assert.deepEqual(getCollection(owner),collection);assert.ok(r.revision>steps);}
});
test('a restart with a pending NPC decision resumes before the next human panel and never spends player assets',()=>{
 const owner='restart-solo';createPlayer(owner,owner);let r=s.createTagTraining(owner,'g','c');
 // This test requires a saved automated decision, not a random full opening.
 // Other tests cover genuine random openings, including legitimate early wins.
 const {getNPC}=require('../dist/npcContent'),styles=['yugi','kaiba','yugi','joey'];
 r.state=t.createTagDuel(r.members.map((p,i)=>({...p,cards:getNPC(styles[i]).cards,extra:getNPC(styles[i]).extra})),{classic:true,first:1,seed:'mission6-pending-npc'});
 db.prepare('UPDATE tag_sessions SET state=? WHERE id=?').run(JSON.stringify(r.state),r.id);r=s.getTag(r.id);
 // The opening seat and the NPCs' set cards are randomized. Ending the human
 // Main Phase can legitimately open a response window that still needs the
 // human to pass before the next automated decision becomes pending.
 for(let attempt=0;attempt<12&&!s.isTagBotDecision(r);attempt++){
  const actions=t.tagActions(r.state,owner),index=actions.findIndex(a=>a.kind==='end'||a.kind==='pass');
  assert.ok(index>=0,'human can finish or pass the current response window');
  r=s.actTag(r.id,owner,r.guild,r.revision,index);
 }
 assert.ok(s.isTagBotDecision(r),'a saved automated decision must be pending before restart');
 s.setTagMessage(r.id,'arena');s.markTagPublished(r.id,r.revision);assert.ok(s.dueTags().some(x=>x.id===r.id),'pending bot remains due even if arena was published');const before=getPlayer(owner);delete require.cache[require.resolve('../dist/tagStore')];const reopened=require('../dist/tagStore').runTagBots(r.id);assert.ok(!s.isTagBotDecision(reopened));assert.ok(reopened.revision>r.revision);assert.deepEqual(getPlayer(owner),before);
});
test('training validates profile, chosen style, owned deck and reservation before inserting a session',()=>{
 const count=()=>db.prepare('SELECT COUNT(*) AS n FROM tag_sessions').get().n;let n=count();assert.throws(()=>s.createTagTraining('absent','g','c'),/perfil/);assert.equal(count(),n);createPlayer('bad-style','Test');assert.throws(()=>s.createTagTraining('bad-style','g','c','unknown'),/desconhecido/);assert.equal(count(),n);assert.throws(()=>s.createTagTraining('bad-style','g','c','meu_deck'),/Ative/);assert.equal(count(),n);
 const r=s.createTagTraining('bad-style','g','c');assert.throws(()=>s.createTagTraining('bad-style','g','c'),/aberto/);s.quitTag(r.id,'bad-style','g',r.revision);assert.equal(s.currentTag('bad-style'),undefined);
});
