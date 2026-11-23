'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m502-duel-concession-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const {db}=require('../dist/database');
const store=require('../dist/duelStore');
const engine=require('../dist/duelEngine');
const ui=require('../dist/duelUI');
const {handleDuelComponent}=require('../dist/duelInteraction');
const {MessageFlags}=require('discord.js');
const {starterContents}=require('../dist/cardCatalog');
const {validateDiscordPayload}=require('../dist/discordPayload');
const source=fs.readFileSync(path.join(__dirname,'../src/index.ts'),'utf8');

const guild='m502-guild';
let sequence=0;
const cards=style=>starterContents[style].flatMap(card=>Array(card.quantity).fill(card.id));

function seed(id){
  const owner=id+'-owner';
  const opponent=id+'-opponent';
  const state=engine.createDuel([
    {id:owner,name:'Duelista Azul',cards:cards('warrior')},
    {id:opponent,name:'Duelista Vermelho',cards:cards('spellcaster')}
  ],()=>0.5);
  const revision=7;
  db.prepare(
    'INSERT INTO duels(id,guild_id,channel_id,message_id,status,revision,updated,state,invite) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,'m502-channel',null,'playing',revision,Date.now(),JSON.stringify(state),null);
  db.prepare('INSERT INTO duel_members(owner,duel_id) VALUES(?,?)').run(owner,id);
  db.prepare('INSERT INTO duel_members(owner,duel_id) VALUES(?,?)').run(opponent,id);
  return {id,state,revision,owner,opponent};
}

function inventory(state){
  const rows=[];
  for(const player of state.players){
    for(const zone of ['deck','hand','monsters','backrow','grave','extra','banished']){
      for(const card of player[zone]??[])rows.push([player.id,zone,card.uid,card.id].join(':'));
    }
    if(player.field)rows.push([player.id,'field',player.field.uid,player.field.id].join(':'));
  }
  return rows.sort();
}

function makeInteraction(customId,userId){
  const calls={reply:[],deferReply:[],deferUpdate:0,editReply:[],followUp:[]};
  const interaction={
    id:'m502-interaction-'+(++sequence),
    customId,guildId:guild,user:{id:userId},values:[],
    isButton:()=>true,
    isStringSelectMenu:()=>false,
    deferReply:async options=>{calls.deferReply.push(options);},
    deferUpdate:async()=>{calls.deferUpdate++;},
    editReply:async payload=>{calls.editReply.push(payload);},
    reply:async payload=>{calls.reply.push(payload);},
    followUp:async payload=>{calls.followUp.push(payload);}
  };
  return {interaction,calls};
}

async function deliver(interaction,extra={}){
  return handleDuelComponent(interaction,{
    refreshArena:async()=>{},
    privatePayload:async(record,viewer)=>ui.duelPrivateMessage(record,viewer),
    ...extra
  });
}

function buttonIds(payload){
  return payload.components.flatMap(row=>row.toJSON().components).map(button=>button.custom_id);
}

test('/duelo sair is registered, ephemeral, confirmed, and rejects a stale quit panel',async()=>{
  const commandStart=source.indexOf("new SlashCommandBuilder().setName('duelo')");
  const commandEnd=source.indexOf('];',commandStart);
  const command=source.slice(commandStart,commandEnd);
  assert.match(command,/addSubcommand\(c=>c\.setName\('sair'\)/,'/duelo sair must remain registered');

  const handlerStart=source.indexOf("if(i.isChatInputCommand()&&i.commandName==='duelo')");
  const handlerEnd=source.indexOf("if((i.isButton()||i.isStringSelectMenu()||i.isModalSubmit())&&i.customId.startsWith('deck:')",handlerStart);
  const handler=source.slice(handlerStart,handlerEnd);
  assert.match(handler,/await deferReply\(action==='ver'\|\|action==='sair'\?\{flags:MessageFlags\.Ephemeral\}:\{\}\)/,
    '/duelo sair must be answered privately');
  assert.match(handler,/if\(action==='sair'\)\{if\(r\.status==='pending'\)\{const closed=declineChallenge/,
    'a pending invite must be cancelled through the existing store transition');
  assert.match(handler,/else await i\.editReply\(quitMessage\(r\)\)/,
    'an active duel must request explicit confirmation instead of conceding immediately');

  const record=seed('m502-confirmation');
  const originalInventory=inventory(record.state);
  const stale=makeInteraction('duel:quit:'+record.id+':'+(record.revision-1),record.owner);
  await assert.rejects(deliver(stale.interaction),/painel ficou antigo/i);
  assert.equal(stale.calls.reply.length,0,'stale quit buttons must not open a fresh confirmation');

  const current=makeInteraction('duel:quit:'+record.id+':'+record.revision,record.owner);
  await deliver(current.interaction);
  assert.equal(current.calls.reply.length,1);
  const confirmation=current.calls.reply[0];
  validateDiscordPayload(confirmation);
  assert.equal(confirmation.flags,MessageFlags.Ephemeral);
  assert.equal(confirmation.content,'Desistir encerra o duelo. Confirma?');
  assert.deepEqual(buttonIds(confirmation),[
    'duel:confirm:'+record.id+':'+record.revision,
    'duel:open:'+record.id+':'+record.revision
  ]);

  const after=store.getDuel(record.id);
  assert.equal(after.status,'playing','opening confirmation must not concede');
  assert.equal(after.revision,record.revision);
  assert.deepEqual(inventory(after.state),originalInventory);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(record.id).n,2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_transition_events WHERE duel_id=?').get(record.id).n,0);
});

test('only a physical duel participant can open the private concession confirmation',async()=>{
  const record=seed('m502-outsider');
  const outsider=makeInteraction('duel:quit:'+record.id+':'+record.revision,'m502-outsider');
  await assert.rejects(deliver(outsider.interaction),/Só participantes podem abrir o painel privado/);
  assert.equal(outsider.calls.reply.length,0);
  const after=store.getDuel(record.id);
  assert.equal(after.status,'playing');
  assert.equal(after.revision,record.revision);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(record.id).n,2);
});

test('the Continue button reopens only the authenticated participant private hand',async()=>{
  const record=seed('m502-continue');
  const quit=makeInteraction('duel:quit:'+record.id+':'+record.revision,record.owner);
  await deliver(quit.interaction);
  const continueId=buttonIds(quit.calls.reply[0])[1];
  const continuation=makeInteraction(continueId,record.owner);
  await deliver(continuation.interaction);
  assert.equal(continuation.calls.deferReply[0].flags,MessageFlags.Ephemeral);
  const panel=continuation.calls.editReply[0];
  validateDiscordPayload(panel);
  assert.ok(panel.embeds[0].toJSON().title.includes('Duelista Azul'));
  const serialized=JSON.stringify(panel);
  for(const card of record.state.players[1].hand){
    assert.ok(!serialized.includes(card.uid),'private hand exposed opponent UID '+card.uid);
  }
  const after=store.getDuel(record.id);
  assert.equal(after.status,'playing');
  assert.equal(after.revision,record.revision);
});

test('a stale confirmation cannot concede; the store revision is checked before persistence',async()=>{
  const record=seed('m502-stale-confirm');
  const quit=makeInteraction('duel:quit:'+record.id+':'+record.revision,record.owner);
  await deliver(quit.interaction);
  const confirmId=buttonIds(quit.calls.reply[0])[0];
  db.prepare('UPDATE duels SET revision=revision+1 WHERE id=?').run(record.id);
  const staleConfirm=makeInteraction(confirmId,record.owner);
  await assert.rejects(deliver(staleConfirm.interaction),/painel ficou antigo/i);
  assert.equal(staleConfirm.calls.deferUpdate,1);
  assert.equal(staleConfirm.calls.editReply.length,0);
  const after=store.getDuel(record.id);
  assert.equal(after.status,'playing');
  assert.equal(after.revision,record.revision+1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(record.id).n,2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_transition_events WHERE duel_id=?').get(record.id).n,0);
});

test('a fresh explicit confirmation finishes the duel, persists duelFinished, and releases both memberships',async()=>{
  const record=seed('m502-fresh-confirm');
  const originalInventory=inventory(record.state);
  const quit=makeInteraction('duel:quit:'+record.id+':'+record.revision,record.owner);
  await deliver(quit.interaction);
  const confirmId=buttonIds(quit.calls.reply[0])[0];
  const confirmation=makeInteraction(confirmId,record.owner);
  let refreshed=0;
  await deliver(confirmation.interaction,{refreshArena:async finished=>{
    refreshed++;
    assert.equal(finished.status,'finished');
  }});
  assert.equal(confirmation.calls.deferUpdate,1);
  assert.equal(confirmation.calls.editReply[0].content,'Desistência registrada.');
  assert.equal(refreshed,1);

  const after=store.getDuel(record.id);
  assert.equal(after.status,'finished');
  assert.equal(after.state.phase,'finished');
  assert.equal(after.state.winner,record.opponent);
  assert.match(after.state.reason,/desist/i);
  assert.deepEqual(inventory(after.state),originalInventory,'concession must not move, grant, or duplicate physical cards');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(record.id).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_transition_events WHERE duel_id=?').get(record.id).n,1);
  const events=JSON.parse(db.prepare('SELECT events_json FROM duel_transition_events WHERE duel_id=?').get(record.id).events_json);
  assert.ok(events.some(event=>event.type==='duelFinished'&&event.winner===record.opponent));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts WHERE duel_id=?').get(record.id).n,1);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
