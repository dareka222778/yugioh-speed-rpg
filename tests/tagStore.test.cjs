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
test('private one-card inspection binds owner and keeps canonical legal indices; stale carousel rejects before acknowledgement',async()=>{
 const r=playing(),actor=tag.tagDecisionMember(r.state).id,p=ui.tagCardMessage(r,actor,0);validateDiscordPayload(p);assert.throws(()=>ui.tagCardMessage(r,'outsider',0),/participa/);assert.throws(()=>ui.tagCardMessage(r,actor,99),/indisponível/);let edited;
 await handleTagComponent({guildId:'guild',user:{id:actor},customId:`tag:inspect:${r.id}:${r.revision}:${actor}`,values:['0'],deferUpdate:async()=>{},editReply:async p=>{edited=p;}},async()=>{},()=>{});assert.match(edited.embeds[0].toJSON().title,/1\/4/);
 await assert.rejects(handleTagComponent({guildId:'guild',user:{id:actor},customId:`tag:card,${actor},0:${r.id}:0`,deferUpdate:async()=>{throw Error('must not ack');}},async()=>{},()=>{}),/atualizada/);
});
test('failed/unpublished revisions survive reload and remain due until acknowledged; stale publication cannot hide a newer move',()=>{
 let r=playing();store.setTagMessage(r.id,'arena');assert.ok(store.dueTags().some(p=>p.id===r.id));store.markTagPublished(r.id,r.revision);assert.ok(!store.dueTags().some(p=>p.id===r.id));const oldRevision=r.revision,actor=tag.tagDecisionMember(r.state).id,index=tag.tagActions(r.state,actor).findIndex(a=>a.kind==='end');r=store.actTag(r.id,actor,r.guild,r.revision,index);store.markTagPublished(r.id,oldRevision);assert.ok(store.dueTags().some(p=>p.id===r.id));store.markTagPublished(r.id,r.revision);assert.ok(!store.dueTags().some(p=>p.id===r.id));store.setTagMessage(r.id,'replacement','other-channel');const reopened=store.getTag(r.id);assert.equal(reopened.channel,'other-channel');assert.equal(reopened.message,'replacement');assert.equal(reopened.public_revision,-1);
});
test('corrupt session membership fails closed without deleting the saved duel or touching collections',()=>{
 const r=playing(),state=db.prepare('SELECT state FROM tag_sessions WHERE id=?').get(r.id).state,before=snapshot();db.prepare('UPDATE tag_sessions SET members=? WHERE id=?').run('[{}]',r.id);assert.throws(()=>store.getTag(r.id),/inconsistente/);assert.equal(db.prepare('SELECT state FROM tag_sessions WHERE id=?').get(r.id).state,state);assert.equal(snapshot(),before);
 // Restore only the deliberately corrupt test row so subsequent expiry scans remain meaningful.
 db.prepare('UPDATE tag_sessions SET members=? WHERE id=?').run(JSON.stringify(r.members),r.id);
});
test('classic borrowed lobby enables effects and Extras without granting inventory; owned decks are snapshotted per consent',()=>{
 const ids=['cl-a','cl-b','cl-c','cl-d'];for(const id of ids)createPlayer(id,id);let r=store.createTagLobby(ids,'guild','channel','classic-loan'),before=snapshot();for(const id of ids.slice(1))r=store.acceptTag(r.id,id,r.guild,r.revision);assert.equal(r.state.mode,'tag-classic');assert.ok(tag.tagInventory(r.state).some(c=>require('../dist/effectRegistry').getPlayableCard(c.id).kind==='spell'));assert.ok(tag.tagInventory(r.state).some(c=>require('../dist/effectRegistry').getPlayableCard(c.id).fusion));assert.equal(snapshot(),before);store.quitTag(r.id,ids[0],r.guild,r.revision);
 const decks=require('../dist/decks'),database=require('../dist/database');for(const id of ids){database.chooseStarterDeck(id,'warrior');decks.openDeck(id);decks.activateDeck(id,1);}before=snapshot();r=store.createTagLobby(ids,'guild','channel','classic-owned');for(const id of ids.slice(1))r=store.acceptTag(r.id,id,r.guild,r.revision);assert.equal(tag.tagInventory(r.state).length,80);assert.equal(snapshot(),before);const card=decks.openDeck(ids[0]).items[0].card_key;decks.changeDeck(ids[0],1,card,-1);assert.equal(tag.tagInventory(store.getTag(r.id).state).length,80);for(const id of ids)validateDiscordPayload(ui.tagPrivateMessage(r,id));validateDiscordPayload(ui.tagPublicMessage(r));
});
test('zones show shared friendly set cards, public graveyards and only the viewers Extra, never hidden opponents',()=>{
 const ids=['z-a','z-b','z-c','z-d'];for(const id of ids)createPlayer(id,id);let r=store.createTagLobby(ids,'guild','channel','classic-loan');for(const id of ids.slice(1))r=store.acceptTag(r.id,id,r.guild,r.revision);r.state.core.players[0].backrow=[{uid:'m0:own-set',id:'77414722',faceUp:false,setTurn:0}];r.state.core.players[1].backrow=[{uid:'m1:enemy-set',id:'03819470',faceUp:false,setTurn:0}];const blue=JSON.stringify(ui.tagZonesMessage(r,ids[2])),red=JSON.stringify(ui.tagZonesMessage(r,ids[1]));assert.ok(blue.includes('Bloqueador'));assert.ok(!blue.includes('Ferramentas'));assert.ok(red.includes('Ferramentas'));assert.ok(!red.includes('Bloqueador'));validateDiscordPayload(ui.tagZonesMessage(r,ids[2]));assert.throws(()=>ui.tagZonesMessage(r,'outsider'),/participa/);
});
test('an existing pre-rules 2v2 session migrates additively and keeps its exact saved game and four locks',()=>{
 const {execFileSync}=require('node:child_process');const r=playing(),file=path.join(folder,'legacy-tag.sqlite');
 const code=`const fs=require('node:fs'),D=require('better-sqlite3'),r=JSON.parse(fs.readFileSync(0,'utf8')),d=new D(process.env.DATABASE_PATH);d.exec('CREATE TABLE tag_sessions(id TEXT PRIMARY KEY,guild TEXT NOT NULL,channel TEXT NOT NULL,message TEXT,revision INTEGER NOT NULL,updated INTEGER NOT NULL,status TEXT NOT NULL,members TEXT NOT NULL,state TEXT); CREATE TABLE tag_members(owner TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES tag_sessions(id));');d.prepare('INSERT INTO tag_sessions VALUES(?,?,?,?,?,?,?,?,?)').run(r.id,r.guild,r.channel,r.message,r.revision,r.updated,r.status,JSON.stringify(r.members),JSON.stringify(r.state));for(const p of r.members)d.prepare('INSERT INTO tag_members VALUES(?,?)').run(p.id,r.id);d.close();const store=require('./dist/tagStore'),db=require('./dist/database').db,out=store.getTag(r.id);console.log(JSON.stringify({same:JSON.stringify(out.state)===JSON.stringify(r.state),rules:out.rules,locks:db.prepare('SELECT COUNT(*) AS n FROM tag_members').get().n}));db.close();`;
 const out=JSON.parse(execFileSync(process.execPath,['-e',code],{cwd:path.resolve(__dirname,'..'),env:{...process.env,DATABASE_PATH:file},input:JSON.stringify(r),encoding:'utf8'}));assert.deepEqual(out,{same:true,rules:'normal',locks:4});
});
