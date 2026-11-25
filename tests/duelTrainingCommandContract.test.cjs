'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m505-duel-training-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const db=database.db;
const decks=require('../dist/decks');
const store=require('../dist/duelStore');
const ui=require('../dist/duelUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const source=fs.readFileSync(path.join(__dirname,'../src/index.ts'),'utf8');

const guild='m505-guild',channel='m505-channel';
function player(id,withDeck){
  database.createPlayer(id,'Player '+id);
  if(withDeck){
    database.chooseStarterDeck(id,'warrior');
    decks.openDeck(id);
    decks.activateDeck(id,1);
  }
  return {player:database.getPlayer(id),collection:database.getCollection(id),deck:withDeck?decks.openDeck(id,1):null};
}
function commandAndHandler(){
  const commandStart=source.indexOf("new SlashCommandBuilder().setName('duelo')");
  const commandEnd=source.indexOf('];',commandStart);
  const command=source.slice(commandStart,commandEnd);
  const handlerStart=source.indexOf("if(i.isChatInputCommand()&&i.commandName==='duelo')");
  const handlerEnd=source.indexOf("if((i.isButton()||i.isStringSelectMenu()||i.isModalSubmit())&&i.customId.startsWith('deck:')",handlerStart);
  return {command,handler:source.slice(handlerStart,handlerEnd)};
}
function assertPublicPayload(record){
  const payload=ui.duelPublicMessage(record);
  validateDiscordPayload(payload);
  const text=JSON.stringify(payload.embeds.map(embed=>embed.toJSON()));
  for(const player of record.state.players){
    for(const card of player.hand)assert.ok(!text.includes(card.uid),'public training panel leaked a private hand UID');
    for(const card of player.deck)assert.ok(!text.includes(card.uid),'public training panel leaked Deck order');
  }
  return payload;
}

test('/duelo treino, treino_fusao and laboratorio are registered and routed to the intended mode',()=>{
  const {command,handler}=commandAndHandler();
  for(const name of ['treino','treino_fusao','laboratorio']){
    assert.ok(command.includes("setName('"+name+"')"),'missing /duelo '+name);
  }
  assert.match(handler,/if\(action==='treino'\|\|action==='treino_fusao'\|\|action==='laboratorio'\|\|action==='desafiar'\)/);
  assert.match(handler,/if\(action==='treino'\|\|action==='treino_fusao'\|\|action==='laboratorio'\)r=createTraining\(id,i\.guildId,i\.channelId,action!=='treino'\)/,
    'standard training must use the active Deck; fusion/lab modes must use the fixed laboratory loadout');
  assert.match(handler,/const message=await i\.editReply\(await arenaPayload\(r\)\);setDuelMessage\(r\.id,message\.channelId,message\.id,r\.revision\)/,
    'training must publish its arena and persist the actual message revision');
});

test('standard /duelo treino requires a valid active Deck and does not grant cards, economy, or rewards',()=>{
  const owner='m505-standard';
  const before=player(owner,true);
  const record=store.createTraining(owner,guild,channel,false);
  assert.equal(record.status,'playing');
  assert.equal(record.state.fixedOpening,false);
  assert.equal(record.state.encounter,undefined);
  assert.equal(record.state.reward,undefined);
  assert.ok(record.state.players[1].id.startsWith('npc-'));
  assert.equal(record.state.players[0].deck.length+record.state.players[0].hand.length,20);
  assert.equal(record.state.players[1].deck.length+record.state.players[1].hand.length,20);
  assert.equal(store.currentDuel(owner).id,record.id);
  assertPublicPayload(record);
  assert.deepEqual(database.getPlayer(owner),before.player);
  assert.deepEqual(database.getCollection(owner),before.collection);
  assert.deepEqual(decks.openDeck(owner,1).items.map(item=>item.card_key),before.deck.items.map(item=>item.card_key));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE owner=?').get(owner).n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts').get().n,0);

  const noDeck='m505-no-deck';
  player(noDeck,false);
  assert.throws(()=>store.createTraining(noDeck,guild,channel,false),/Ative um deck válido/);
  assert.equal(store.currentDuel(noDeck),undefined);
});

test('/duelo treino_fusao and /duelo laboratorio use fixed test loadout without requiring or modifying a collection',()=>{
  const owner='m505-laboratory';
  const before=player(owner,false);
  const record=store.createTraining(owner,guild,channel,true);
  assert.equal(record.status,'playing');
  assert.equal(record.state.fixedOpening,true);
  assert.equal(record.state.encounter,undefined);
  assert.equal(record.state.reward,undefined);
  assert.ok(record.state.players[1].id.startsWith('npc-'));
  assert.equal(record.state.players[0].deck.length+record.state.players[0].hand.length,24);
  assert.equal(record.state.players[0].extra.length,1);
  assert.equal(record.state.players[0].extra[0].id,'45231177');
  assert.equal(store.currentDuel(owner).id,record.id);
  assertPublicPayload(record);
  assert.deepEqual(database.getPlayer(owner),before.player);
  assert.deepEqual(database.getCollection(owner),before.collection);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE owner=?').get(owner).n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts').get().n,0);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
