const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'tag-store-'));process.env.DATABASE_PATH=path.join(folder,'game.sqlite');
const {db,createPlayer}=require('../dist/database'),store=require('../dist/tagStore'),tag=require('../dist/tagDuel'),ui=require('../dist/tagUI'),{validateDiscordPayload}=require('../dist/discordPayload'),{handleTagComponent}=require('../dist/tagInteraction');
let serial=0;function lobby(){const ids=[0,1,2,3].map(i=>`u-${++serial}-${i}`);for(const id of ids)createPlayer(id,id);return store.createTagLobby(ids,'guild','channel');}
function playing(){let r=lobby();for(const member of r.members.filter(m=>!m.accepted))r=store.acceptTag(r.id,member.id,'guild',r.revision);return r;}
function snapshot(){return JSON.stringify({players:db.prepare('SELECT * FROM players ORDER BY discord_id').all(),cards:db.prepare('SELECT * FROM player_cards').all()});}
test('four consents persist, roles alternate by team, no economy or collection mutation; reopening survives module reload',()=>{
 let r=lobby(),before=snapshot();assert.equal(r.members.filter(m=>m.accepted).length,1);const deadline=store.tagDeadline(r);assert.throws(()=>store.acceptTag(r.id,'outsider','guild',r.revision),/participa/);assert.throws(()=>store.acceptTag(r.id,r.members[1].id,'elsewhere',r.revision),/participa/);
 r=store.acceptTag(r.id,r.members[1].id,'guild',r.revision);assert.equal(store.tagDeadline(r),deadline);assert.throws(()=>store.acceptTag(r.id,r.members[2].id,'guild',0),/atualizado/);
 for(const m of r.members.slice(2))r=store.acceptTag(r.id,m.id,'guild',r.revision);assert.equal(r.status,'playing');assert.equal(tag.tagInventory(r.state).length,120);assert.equal(snapshot(),before);
 delete require.cache[require.resolve('../dist/tagStore')];const reopened=require('../dist/tagStore').getTag(r.id);assert.deepEqual(reopened.state,r.state);assert.deepEqual(reopened.state.members.map(p=>p.team),[0,1,0,1]);
});
test('atomic legal moves reject duplicate revisions, other participants, another guild, and preserve all cards',()=>{
 let r=playing(),actor=tag.tagDecisionMember(r.state).id;const index=tag.tagActions(r.state,actor).findIndex(a=>a.kind==='summon');const before=tag.tagInventory(r.state).map(c=>c.uid).sort();assert.throws(()=>store.actTag(r.id,'outsider','guild',r.revision,index),/participa/);
 const revision=r.revision;r=store.actTag(r.id,actor,'guild',revision,index);assert.throws(()=>store.actTag(r.id,actor,'guild',revision,index),/desatualizado/);assert.deepEqual(tag.tagInventory(r.state).map(c=>c.uid).sort(),before);
});
test('lobbies expire without extending on consent; decision timeout loses for the correct team and releases all seats',()=>{
 let r=lobby();r=store.getTag(r.id,r.updated+5*60000);assert.equal(r.status,'expired');for(const m of r.members)assert.equal(store.currentTag(m.id),undefined);
 r=playing();const losing=tag.tagDecisionMember(r.state).team;r=store.getTag(r.id,r.updated+30*60000);assert.equal(r.state.core.winner,'tag-team-'+(1-losing));for(const m of r.members)assert.equal(store.currentTag(m.id),undefined);
});
test('any teammate can concede, including inactive partner, and all buttons disappear when finished',()=>{
 let r=playing(),actor=r.members.find(p=>p.id!==tag.tagDecisionMember(r.state).id).id,team=r.state.members.find(p=>p.id===actor).team;r=store.quitTag(r.id,actor,'guild',r.revision);assert.equal(r.state.core.winner,'tag-team-'+(1-team));assert.deepEqual(ui.tagPublicMessage(r).components,[]);assert.deepEqual(ui.tagPrivateMessage(r,actor).components,[]);
});
test('all public/private payloads fit Discord; hidden hands and set cards never appear in the public payload',()=>{
 let r=playing();validateDiscordPayload(ui.tagPublicMessage(r));for(const m of r.members)validateDiscordPayload(ui.tagPrivateMessage(r,m.id));assert.throws(()=>ui.tagPrivateMessage(r,'outsider'),/participantes/);
 const actor=tag.tagDecisionMember(r.state).id,a=tag.tagActions(r.state,actor).findIndex(a=>a.kind==='summon'&&a.position==='set');if(a>=0)r=store.actTag(r.id,actor,'guild',r.revision,a);const text=JSON.stringify(ui.tagPublicMessage(r));for(const ref of tag.tagInventory(r.state))assert.ok(!text.includes(ref.uid));assert.ok(!text.includes('"hand":'));
});
test('2v2 reservation blocks 1v1 and another lobby; rollback never partially reserves another player',()=>{
 const r=lobby();assert.throws(()=>store.createTagLobby(r.members.map(m=>m.id),'guild','channel'),/aberto/);const {createTraining}=require('../dist/duelStore');assert.throws(()=>createTraining(r.members[0].id,'guild','channel'),/2v2/);
 const fresh=['fresh-a','fresh-b','fresh-c'];for(const id of fresh)createPlayer(id,id);assert.throws(()=>store.createTagLobby([fresh[0],r.members[1].id,...fresh.slice(1)],'guild','channel'),/aberto/);assert.equal(store.currentTag(fresh[0]),undefined);
});
test('transport acknowledges before mutation, refreshes after private failure, and prevents stealing a private panel',async()=>{
 let r=playing(),actor=tag.tagDecisionMember(r.state).id,index=tag.tagActions(r.state,actor).findIndex(a=>a.kind==='end'),refreshed=false,ack=false;
 const i={guildId:'guild',user:{id:actor},customId:`tag:act:${r.id}:${r.revision}:${actor}`,values:[String(index)],deferUpdate:async()=>{ack=true;assert.equal(store.getTag(r.id).revision,r.revision);},editReply:async()=>{throw Error('network');}};
 await assert.rejects(handleTagComponent(i,async next=>{refreshed=true;assert.equal(next.revision,r.revision+1);},()=>{}),/network/);assert.ok(ack&&refreshed);
 await assert.rejects(handleTagComponent({...i,customId:`tag:page,someone-else,0:${r.id}:${r.revision}`},async()=>{},()=>{}),/própria/);
});
