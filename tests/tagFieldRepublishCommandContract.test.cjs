'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m499-tag-field-republish-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const {db}=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const ui=require('../dist/tagUI');
const {getNPC}=require('../dist/npcContent');
const {validateDiscordPayload}=require('../dist/discordPayload');
const source=fs.readFileSync(path.join(__dirname,'../src/index.ts'),'utf8');

function makeRecord(){
  const members=[
    {id:'m499-human',name:'Human',accepted:true},
    {id:'m499-bot-1',name:'Yugi',accepted:true,automated:true},
    {id:'m499-bot-2',name:'Kaiba',accepted:true,automated:true},
    {id:'m499-bot-3',name:'Joey',accepted:true,automated:true}
  ];
  const decks=['yugi','kaiba','joey','yugi'].map(name=>getNPC(name));
  const state=tag.createTagDuel(members.map((member,index)=>({
    id:member.id,name:member.name,cards:[...decks[index].cards],extra:[...decks[index].extra??[]]
  })),{classic:true,first:0,seed:'m499-field-republish'});
  assert.equal(tag.tagDecisionMember(state).id,'m499-human');
  const id='m499-field-republish';
  db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m499-source-guild','m499-old-channel','m499-old-message',0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  db.prepare('INSERT INTO tag_members(owner,session_id) VALUES(?,?)').run('m499-human',id);
  return store.getTag(id);
}

test('/dupla campo reuses the existing session and republishes the public panel in the current channel',()=>{
  const commandStart=source.indexOf("new SlashCommandBuilder().setName('dupla')");
  const commandEnd=source.indexOf("new SlashCommandBuilder().setName('ajuda')",commandStart);
  const command=source.slice(commandStart,commandEnd);
  assert.match(command,/addSubcommand\(c=>c\.setName\('campo'\)/,'the /dupla campo recovery subcommand must remain registered');

  const handlerStart=source.indexOf("if(i.isChatInputCommand()&&i.commandName==='dupla')");
  const handlerEnd=source.indexOf("if(i.isChatInputCommand()&&['ajuda','regras']",handlerStart);
  const handler=source.slice(handlerStart,handlerEnd);
  assert.match(handler,/deferReply\(sub==='convidar'\|\|sub==='campo'\|\|sub==='treino'\?\{\}:\{flags:MessageFlags\.Ephemeral\}\)/,
    '/dupla campo must publish in the channel');
  assert.match(handler,/if\(sub==='ver'\|\|sub==='campo'\)\{\s*const existing=currentTag\(id\)/,
    'campo must recover the existing player session, not create a new duel');
  assert.match(handler,/if\(sub==='campo'\)\{\s*const message=await i\.editReply\(await visualTagPublic\(r\)\);setTagMessage\(r\.id,message\.id,i\.channelId\);markTagPublished\(r\.id,r\.revision\)/,
    'campo must republish, store the current channel/message and mark the exact revision published');

  let record=makeRecord();
  assert.equal(store.currentTag('m499-human').id,record.id);
  const originalState=JSON.stringify(record.state);
  const originalRevision=record.revision;
  const originalSessions=db.prepare('SELECT COUNT(*) AS n FROM tag_sessions').get().n;
  const originalLocks=db.prepare('SELECT COUNT(*) AS n FROM tag_members').get().n;

  store.setTagMessage(record.id,'m499-first-publish','m499-channel-a');
  store.markTagPublished(record.id,record.revision);
  assert.equal(store.dueTags().some(item=>item.id===record.id),false,
    'a published current revision should leave the refresh queue');

  // A lost/replaced Discord message invalidates the public revision and must
  // become due again until the new message is confirmed at the same revision.
  store.setTagMessage(record.id,'m499-recovered-message','m499-channel-b');
  record=store.getTag(record.id);
  assert.equal(record.message,'m499-recovered-message');
  assert.equal(record.channel,'m499-channel-b');
  assert.equal(record.revision,originalRevision);
  assert.equal(db.prepare('SELECT public_revision FROM tag_sessions WHERE id=?').get(record.id).public_revision,-1);
  assert.equal(store.dueTags().some(item=>item.id===record.id),true);

  store.markTagPublished(record.id,originalRevision-1);
  assert.equal(store.dueTags().some(item=>item.id===record.id),true,
    'a stale publication receipt must not clear a newer panel revision');
  store.markTagPublished(record.id,originalRevision);
  record=store.getTag(record.id);
  assert.equal(db.prepare('SELECT public_revision FROM tag_sessions WHERE id=?').get(record.id).public_revision,originalRevision);
  assert.equal(store.dueTags().some(item=>item.id===record.id),false);
  assert.equal(store.currentTag('m499-human').id,record.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_sessions').get().n,originalSessions,
    'republishing must not create a second session');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members').get().n,originalLocks,
    'republishing must preserve the existing member lock');
  assert.equal(record.revision,originalRevision,'republishing must not mutate duel state');
  assert.equal(JSON.stringify(record.state),originalState,'republishing must not alter cards, hands, LP or turn');
  validateDiscordPayload(ui.tagPublicMessage(record));
  validateDiscordPayload(ui.tagPrivateMessage(record,'m499-human'));
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
