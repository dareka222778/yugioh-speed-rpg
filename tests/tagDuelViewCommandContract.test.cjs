'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m500-tag-private-view-'));
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
    {id:'m500-human',name:'Human',accepted:true},
    {id:'m500-bot-1',name:'Yugi',accepted:true,automated:true},
    {id:'m500-bot-2',name:'Kaiba',accepted:true,automated:true},
    {id:'m500-bot-3',name:'Joey',accepted:true,automated:true}
  ];
  const decks=['yugi','kaiba','joey','yugi'].map(name=>getNPC(name));
  const state=tag.createTagDuel(members.map((member,index)=>({
    id:member.id,name:member.name,cards:[...decks[index].cards],extra:[...decks[index].extra??[]]
  })),{classic:true,first:0,seed:'m500-private-view'});
  assert.equal(tag.tagDecisionMember(state).id,'m500-human');
  const id='m500-private-view';
  db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m500-guild','m500-channel','m500-message',0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  db.prepare('INSERT INTO tag_members(owner,session_id) VALUES(?,?)').run('m500-human',id);
  return store.getTag(id);
}

test('/dupla ver is ephemeral, resolves only the authenticated member session and selects that member private hand',()=>{
  const commandStart=source.indexOf("new SlashCommandBuilder().setName('dupla')");
  const commandEnd=source.indexOf("new SlashCommandBuilder().setName('ajuda')",commandStart);
  const command=source.slice(commandStart,commandEnd);
  assert.match(command,/addSubcommand\(c=>c\.setName\('ver'\)/,'/dupla ver must remain registered');

  const handlerStart=source.indexOf("if(i.isChatInputCommand()&&i.commandName==='dupla')");
  const handlerEnd=source.indexOf("if(i.isChatInputCommand()&&['ajuda','regras']",handlerStart);
  const handler=source.slice(handlerStart,handlerEnd);
  assert.match(handler,/deferReply\(sub==='convidar'\|\|sub==='campo'\|\|sub==='treino'\?\{\}:\{flags:MessageFlags\.Ephemeral\}\)/,
    '/dupla ver must be ephemeral');
  assert.match(handler,/if\(sub==='ver'\|\|sub==='campo'\)\{\s*const existing=currentTag\(id\)/,
    'the handler must locate the authenticated user session');
  assert.match(handler,/if\(existing\.guild!==i\.guildId\)throw Error\('Abra o 2v2 no servidor de origem\.'\)/,
    'a session must not be viewed from another guild');
  assert.match(handler,/else await i\.editReply\(r\.state\?await visualTagPrivate\(r,id\):tagPublicMessage\(r\)\)/,
    'a playing duel must render the private hand for the authenticated user ID, not a caller-selected target');
  assert.equal(handler.includes("getUser('alvo'"),false);
  assert.equal(handler.includes("getUser('jogador'"),false);

  const record=makeRecord();
  const owner='m500-human';
  assert.equal(store.currentTag(owner).id,record.id);
  assert.equal(store.currentTag('m500-outsider'),undefined);
  const revision=record.revision;
  const stateBefore=JSON.stringify(record.state);
  const inventoryBefore=new Map(tag.tagInventory(record.state).map(card=>[card.uid,card.id]));
  assert.equal(inventoryBefore.size,tag.tagInventory(record.state).length);

  const privatePayload=ui.tagPrivateMessage(record,owner);
  validateDiscordPayload(privatePayload);
  const privateText=JSON.stringify(privatePayload);
  for(let seat=1;seat<4;seat++){
    for(const card of tag.tagMemberHand(record.state,'m500-bot-'+seat)){
      assert.ok(!privateText.includes(card.uid),'private panel for human leaked bot seat '+seat+' UID '+card.uid);
    }
  }
  const publicPayload=ui.tagPublicMessage(record);
  validateDiscordPayload(publicPayload);
  const publicText=JSON.stringify(publicPayload);
  for(const member of record.members){
    for(const card of tag.tagMemberHand(record.state,member.id)){
      assert.ok(!publicText.includes(card.uid),'public board leaked private hand UID '+card.uid);
    }
  }
  assert.equal(store.getTag(record.id).revision,revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),stateBefore);
  assert.equal(tag.tagInventory(store.getTag(record.id).state).length,inventoryBefore.size);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_sessions').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members').get().n,1);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
