'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m506-duel-invitation-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const db=database.db;
const decks=require('../dist/decks');
const store=require('../dist/duelStore');
const ui=require('../dist/duelUI');
const {handleDuelComponent}=require('../dist/duelInteraction');
const {MessageFlags}=require('discord.js');
const {validateDiscordPayload}=require('../dist/discordPayload');

const guild='m506-guild',channel='m506-channel';
let sequence=0;
function player(id){
  database.createPlayer(id,'Player '+id);
  database.chooseStarterDeck(id,'warrior');
  decks.openDeck(id);
  decks.activateDeck(id,1);
  return {player:database.getPlayer(id),collection:database.getCollection(id),deck:decks.openDeck(id,1)};
}
function invitation(prefix){
  const owner=prefix+'-owner',opponent=prefix+'-opponent',outsider=prefix+'-outsider';
  const ownerData=player(owner),opponentData=player(opponent),outsiderData=player(outsider);
  const record=store.challenge(owner,opponent,guild,channel);
  return {owner,opponent,outsider,ownerData,opponentData,outsiderData,record};
}
function makeInteraction(customId,userId,guildId=guild){
  const calls={deferUpdate:0,deferReply:[],editReply:[],reply:[],followUp:[]};
  const interaction={
    id:'m506-interaction-'+(++sequence),customId,guildId,user:{id:userId},values:[],
    isButton:()=>true,isStringSelectMenu:()=>false,
    deferUpdate:async()=>{calls.deferUpdate++;},
    deferReply:async options=>{calls.deferReply.push(options);},
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
function buttons(payload){
  return payload.components.flatMap(row=>row.toJSON().components).map(button=>button.custom_id);
}

test('duel:accept accepts only the invited player in the source guild and persists the 1v1 session',async()=>{
  const data=invitation('m506-accept');
  const invitePayload=ui.invitationMessage(data.record);
  validateDiscordPayload(invitePayload);
  const [acceptId,declineId]=buttons(invitePayload);
  assert.equal(acceptId,'duel:accept:'+data.record.id+':'+data.record.revision);
  assert.equal(declineId,'duel:decline:'+data.record.id+':'+data.record.revision);

  const outsider=makeInteraction(acceptId,data.outsider);
  await assert.rejects(deliver(outsider.interaction),/convidado/);
  assert.equal(outsider.calls.deferUpdate,1);
  assert.equal(outsider.calls.followUp.length,0);
  assert.equal(store.getDuel(data.record.id).status,'pending');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(data.record.id).n,1);

  const owner=makeInteraction(acceptId,data.owner);
  await assert.rejects(deliver(owner.interaction),/convidado/);
  assert.equal(owner.calls.followUp.length,0);
  assert.equal(store.getDuel(data.record.id).status,'pending');

  const wrongGuild=makeInteraction(acceptId,data.opponent,'m506-other-guild');
  await assert.rejects(deliver(wrongGuild.interaction),/outro servidor/);
  assert.equal(wrongGuild.calls.deferUpdate,0);

  const stale=makeInteraction('duel:accept:'+data.record.id+':'+(data.record.revision+1),data.opponent);
  await assert.rejects(deliver(stale.interaction),/expirou/);
  assert.equal(stale.calls.followUp.length,0);
  assert.equal(store.getDuel(data.record.id).status,'pending');

  let refreshed=0;
  const accepted=makeInteraction(acceptId,data.opponent);
  await deliver(accepted.interaction,{refreshArena:async record=>{
    refreshed++;
    assert.equal(record.status,'playing');
  }});
  assert.equal(accepted.calls.deferUpdate,1);
  assert.equal(accepted.calls.followUp.length,1);
  validateDiscordPayload(accepted.calls.followUp[0]);
  assert.equal(accepted.calls.followUp[0].flags,MessageFlags.Ephemeral);
  assert.equal(refreshed,1);
  const started=store.getDuel(data.record.id);
  assert.equal(started.status,'playing');
  assert.equal(started.revision,data.record.revision+1);
  assert.deepEqual(started.state.players.map(p=>p.id),[data.owner,data.opponent]);
  assert.equal(store.currentDuel(data.owner).id,data.record.id);
  assert.equal(store.currentDuel(data.opponent).id,data.record.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(data.record.id).n,2);

  assert.deepEqual(database.getPlayer(data.owner),data.ownerData.player);
  assert.deepEqual(database.getCollection(data.owner),data.ownerData.collection);
  assert.deepEqual(database.getPlayer(data.opponent),data.opponentData.player);
  assert.deepEqual(database.getCollection(data.opponent),data.opponentData.collection);
  assert.deepEqual(database.getPlayer(data.outsider),data.outsiderData.player);
  assert.deepEqual(database.getCollection(data.outsider),data.outsiderData.collection);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts').get().n,0);
});

test('duel:decline updates the invitation and releases the creator lock without touching collections',async()=>{
  const data=invitation('m506-decline');
  const payload=ui.invitationMessage(data.record);
  validateDiscordPayload(payload);
  const declineId=buttons(payload)[1];
  const beforeOwnerDeck=data.ownerData.deck.items.map(item=>item.card_key);
  const beforeOpponentDeck=data.opponentData.deck.items.map(item=>item.card_key);
  let refreshed=0;
  const decline=makeInteraction(declineId,data.opponent);
  await deliver(decline.interaction,{refreshArena:async record=>{
    refreshed++;
    assert.equal(record.status,'declined');
  }});
  assert.equal(decline.calls.deferUpdate,1);
  assert.equal(decline.calls.followUp.length,0);
  assert.equal(refreshed,1);
  const closed=store.getDuel(data.record.id);
  assert.equal(closed.status,'declined');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(data.record.id).n,0);
  assert.equal(store.currentDuel(data.owner),undefined);
  assert.equal(store.currentDuel(data.opponent),undefined);
  assert.deepEqual(decks.openDeck(data.owner,1).items.map(item=>item.card_key),beforeOwnerDeck);
  assert.deepEqual(decks.openDeck(data.opponent,1).items.map(item=>item.card_key),beforeOpponentDeck);
  assert.deepEqual(database.getPlayer(data.owner),data.ownerData.player);
  assert.deepEqual(database.getCollection(data.owner),data.ownerData.collection);
  assert.deepEqual(database.getPlayer(data.opponent),data.opponentData.player);
  assert.deepEqual(database.getCollection(data.opponent),data.opponentData.collection);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
