'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m503-duel-private-view-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const {db}=require('../dist/database');
const store=require('../dist/duelStore');
const engine=require('../dist/duelEngine');
const ui=require('../dist/duelUI');
const {starterContents}=require('../dist/cardCatalog');
const {validateDiscordPayload}=require('../dist/discordPayload');
const source=fs.readFileSync(path.join(__dirname,'../src/index.ts'),'utf8');

const guild='m503-guild';
const cards=style=>starterContents[style].flatMap(card=>Array(card.quantity).fill(card.id));

function seed(id){
  const owner=id+'-owner';
  const opponent=id+'-opponent';
  const state=engine.createDuel([
    {id:owner,name:'Duelista Azul',cards:cards('warrior')},
    {id:opponent,name:'Duelista Vermelho',cards:cards('spellcaster')}
  ],()=>0.5);
  state.players[1].monsters=[{
    uid:'m503-hidden-monster',id:'15025844',owner:1,faceUp:false,position:'def',
    entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0
  }];
  state.players[1].backrow=[{uid:'m503-hidden-trap',id:'44209392',setTurn:1,faceUp:false}];
  const revision=9;
  db.prepare(
    'INSERT INTO duels(id,guild_id,channel_id,message_id,status,revision,updated,state,invite) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,'m503-channel','m503-message','playing',revision,Date.now(),JSON.stringify(state),null);
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

test('/duelo ver is registered, ephemeral, authenticated, and bound to the source guild',()=>{
  const commandStart=source.indexOf("new SlashCommandBuilder().setName('duelo')");
  const commandEnd=source.indexOf('];',commandStart);
  const command=source.slice(commandStart,commandEnd);
  assert.match(command,/addSubcommand\(c=>c\.setName\('ver'\)\.setDescription\('Abra seu duelo atual e sua mão privada\.'\)/,
    '/duelo ver must remain registered without a target-user option');

  const handlerStart=source.indexOf("if(i.isChatInputCommand()&&i.commandName==='duelo')");
  const handlerEnd=source.indexOf("if((i.isButton()||i.isStringSelectMenu()||i.isModalSubmit())&&i.customId.startsWith('deck:')",handlerStart);
  const handler=source.slice(handlerStart,handlerEnd);
  assert.match(handler,/await deferReply\(action==='ver'\|\|action==='sair'\?\{flags:MessageFlags\.Ephemeral\}:\{\}\)/,
    '/duelo ver must be ephemeral');
  assert.match(handler,/const r=currentDuel\(id\);if\(!r\|\|r\.guild_id!==i\.guildId\)/,
    'the command must locate only the authenticated user session and enforce the source guild');
  assert.match(handler,/await i\.editReply\(r\.status==='pending'\?\{content:'Seu convite aguarda resposta\.',\.\.\.invitationMessage\(r\)\}:await privatePayload\(r,id\)\)/,
    'a playing duel must use the authenticated user ID for its private payload');
  assert.equal(handler.includes("getUser('alvo'"),false);
  assert.equal(handler.includes("getUser('jogador'"),false);
});

test('currentDuel resolves only member-owned sessions and never returns a stranger session',()=>{
  const record=seed('m503-membership');
  const ownerView=store.currentDuel(record.owner);
  const opponentView=store.currentDuel(record.opponent);
  assert.equal(ownerView.id,record.id);
  assert.equal(opponentView.id,record.id);
  assert.equal(store.currentDuel('m503-outsider'),undefined);
  assert.equal(ownerView.guild_id,guild);
  assert.equal(ownerView.revision,record.revision);
  assert.equal(JSON.stringify(ownerView.state),JSON.stringify(record.state));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(record.id).n,2);
});

test('private and public payloads validate while hiding every opponent hand UID and face-down identity',()=>{
  const record=seed('m503-privacy');
  const before=inventory(record.state);
  const privateOwner=ui.duelPrivateMessage(store.getDuel(record.id),record.owner);
  const privateOpponent=ui.duelPrivateMessage(store.getDuel(record.id),record.opponent);
  const publicPanel=ui.duelPublicMessage(store.getDuel(record.id));
  validateDiscordPayload(privateOwner);
  validateDiscordPayload(privateOpponent);
  validateDiscordPayload(publicPanel);

  const ownerText=JSON.stringify(privateOwner.embeds.map(embed=>embed.toJSON()));
  const opponentText=JSON.stringify(privateOpponent.embeds.map(embed=>embed.toJSON()));
  const publicText=JSON.stringify(publicPanel.embeds.map(embed=>embed.toJSON()));
  for(const card of record.state.players[1].hand){
    assert.ok(!ownerText.includes(card.uid),'owner panel leaked opponent hand UID '+card.uid);
    assert.ok(!publicText.includes(card.uid),'public panel leaked opponent hand UID '+card.uid);
  }
  for(const card of record.state.players[0].hand){
    assert.ok(!opponentText.includes(card.uid),'opponent panel leaked owner hand UID '+card.uid);
    assert.ok(!publicText.includes(card.uid),'public panel leaked owner hand UID '+card.uid);
  }
  for(const text of [ownerText,opponentText,publicText]){
    assert.ok(!text.includes('m503-hidden-monster'));
    assert.ok(!text.includes('m503-hidden-trap'));
    assert.ok(!text.includes('15025844'));
    assert.ok(!text.includes('44209392'));
  }
  assert.throws(()=>ui.duelPrivateMessage(store.getDuel(record.id),'m503-outsider'),/participantes/);
  const after=store.getDuel(record.id);
  assert.equal(after.status,'playing');
  assert.equal(after.revision,record.revision);
  assert.deepEqual(inventory(after.state),before);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(record.id).n,2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_transition_events WHERE duel_id=?').get(record.id).n,0);
});

test('private hand changes remain isolated between physical players after JSON restoration',()=>{
  const record=seed('m503-restoration');
  const loaded=store.getDuel(record.id);
  const ownerBefore=ui.duelPrivateMessage(loaded,record.owner);
  const opponentBefore=ui.duelPrivateMessage(loaded,record.opponent);
  const ownerText=JSON.stringify(ownerBefore.embeds.map(embed=>embed.toJSON()));
  const opponentText=JSON.stringify(opponentBefore.embeds.map(embed=>embed.toJSON()));
  const ownHand=loaded.state.players[0].hand.map(card=>card.uid);
  const otherHand=loaded.state.players[1].hand.map(card=>card.uid);
  assert.ok(ownHand.every(uid=>!opponentText.includes(uid)));
  assert.ok(otherHand.every(uid=>!ownerText.includes(uid)));
  assert.deepEqual(inventory(loaded.state),inventory(record.state));
  assert.equal(loaded.revision,record.revision);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
