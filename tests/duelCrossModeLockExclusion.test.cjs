'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m536-cross-mode-lock-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const decks=require('../dist/decks');
const duel=require('../dist/duelStore');
const tag=require('../dist/tagStore');
const {handleDuelComponent}=require('../dist/duelInteraction');
const {handleTagComponent}=require('../dist/tagInteraction');
const {validateDiscordPayload}=require('../dist/discordPayload');

const GUILD='m536-guild',CHANNEL='m536-channel';
function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
  const active=duel.activeCards(id);
  assert.equal(active.cards.length,20);
  assert.ok(active.extra.length<=5);
}
function createGroup(prefix){
  const ids=['a','b','c','d','e'].map(s=>prefix+'-'+s);
  for(const id of ids)createDuelist(id);
  return ids;
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,database.db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function button(actor,customId){
  const calls=[];
  return {
    id:'m536-'+calls.length,customId,guildId:GUILD,user:{id:actor},values:[],calls,
    isButton:()=>true,isStringSelectMenu:()=>false,
    async deferUpdate(){calls.push('deferUpdate');},
    async deferReply(payload){calls.push('deferReply');validateDiscordPayload(payload);},
    async editReply(payload){calls.push('editReply');validateDiscordPayload(payload);},
    async reply(payload){calls.push('reply');validateDiscordPayload(payload);},
    async followUp(payload){calls.push('followUp');validateDiscordPayload(payload);}
  };
}
function count(table,where,value){
  return database.db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE '+where).get(value).n;
}

test('a TagDuel host lock blocks the invited 1v1 Accept; cancelling the lobby releases the mode for that same Accept',async()=>{
  const [owner,host,c,d,e]=createGroup('m536-one');
  const beforeAssets=assetSnapshot();
  const invitation=duel.challenge(owner,host,GUILD,CHANNEL);
  const lobby=tag.createTagLobby([host,c,d,e],GUILD,CHANNEL,'classic-loan');

  assert.equal(duel.currentDuel(owner).id,invitation.id);
  assert.equal(duel.currentDuel(host),undefined,'the invited 1v1 opponent is not locked until Accept');
  assert.equal(tag.currentTag(host).id,lobby.id);
  assert.equal(count('duel_members','owner=?',owner),1);
  assert.equal(count('duel_members','owner=?',host),0);
  assert.equal(count('tag_members','owner=?',host),1);

  const staleAccept=button(host,`duel:accept:${invitation.id}:${invitation.revision}`);
  let duelRefreshes=0;
  await assert.rejects(
    ()=>handleDuelComponent(staleAccept,{refreshArena:async()=>{duelRefreshes++;}}),
    /reservado em um 2v2/
  );
  assert.deepEqual(staleAccept.calls,['deferUpdate'],'the real Discord handler acknowledges, then fails closed');
  assert.equal(duelRefreshes,0);
  const stillPending=duel.getDuel(invitation.id);
  const stillLobby=tag.getTag(lobby.id);
  assert.equal(stillPending.status,'pending');
  assert.equal(stillPending.revision,invitation.revision);
  assert.equal(stillPending.state,null,'a rejected Accept never creates DuelState');
  assert.equal(stillLobby.status,'lobby');
  assert.equal(stillLobby.revision,lobby.revision);
  assert.equal(stillLobby.members.find(p=>p.id===host).accepted,true);
  assert.equal(count('duel_members','owner=?',host),0);
  assert.equal(count('tag_members','owner=?',host),1);

  const cancelled=tag.quitTag(lobby.id,host,GUILD,lobby.revision);
  assert.equal(cancelled.status,'cancelled');
  assert.equal(tag.currentTag(host),undefined);
  assert.equal(count('tag_members','owner=?',host),0);

  const freshAccept=button(host,`duel:accept:${invitation.id}:${invitation.revision}`);
  await handleDuelComponent(freshAccept,{refreshArena:async record=>{duelRefreshes++;assert.equal(record.status,'playing');}});
  assert.deepEqual(freshAccept.calls,['deferUpdate','followUp']);
  assert.equal(duelRefreshes,1);
  assert.equal(duel.getDuel(invitation.id).status,'playing');
  assert.equal(duel.currentDuel(owner).id,invitation.id);
  assert.equal(duel.currentDuel(host).id,invitation.id);
  assert.equal(tag.currentTag(host),undefined);
  assert.equal(count('duel_members','owner=?',host),1);
  assert.equal(count('tag_members','owner=?',host),0);
  assert.deepEqual(assetSnapshot(),beforeAssets,'cross-mode rejection/cancel/Accept never grants or changes player inventory');
});

test('a pending 1v1 creator lock blocks TagDuel Accept; declining the invite releases the member for that same Accept',async()=>{
  const [host,owner,c,d,e]=createGroup('m536-two');
  const beforeAssets=assetSnapshot();
  const lobby=tag.createTagLobby([host,owner,c,d],GUILD,CHANNEL,'classic-loan');
  const invitation=duel.challenge(owner,e,GUILD,CHANNEL);

  assert.equal(tag.currentTag(host).id,lobby.id);
  assert.equal(tag.currentTag(owner),undefined,'a pending TagDuel invitee is not locked until Accept');
  assert.equal(duel.currentDuel(owner).id,invitation.id);
  assert.equal(count('tag_members','owner=?',owner),0);
  assert.equal(count('duel_members','owner=?',owner),1);

  const blockedAccept=button(owner,`tag:accept:${lobby.id}:${lobby.revision}`);
  let tagRefreshes=0;
  const panels={public:async()=>({content:'2v2 atualizado',allowedMentions:{parse:[]}})};
  await assert.rejects(
    ()=>handleTagComponent(blockedAccept,async record=>{tagRefreshes++;assert.equal(record.id,lobby.id);},()=>{},panels),
    /já possui um duelo ou convite aberto/
  );
  assert.deepEqual(blockedAccept.calls,['deferUpdate'],'the real Discord handler acknowledges, then fails closed');
  assert.equal(tagRefreshes,0);
  const stillLobby=tag.getTag(lobby.id);
  const stillPending=duel.getDuel(invitation.id);
  assert.equal(stillLobby.status,'lobby');
  assert.equal(stillLobby.revision,lobby.revision);
  assert.equal(stillLobby.members.find(p=>p.id===owner).accepted,false);
  assert.equal(stillPending.status,'pending');
  assert.equal(stillPending.revision,invitation.revision);
  assert.equal(count('tag_members','owner=?',owner),0);
  assert.equal(count('duel_members','owner=?',owner),1);

  const declined=duel.declineChallenge(invitation.id,owner,GUILD);
  assert.equal(declined.status,'declined');
  assert.equal(duel.currentDuel(owner),undefined);
  assert.equal(count('duel_members','owner=?',owner),0);

  const freshAccept=button(owner,`tag:accept:${lobby.id}:${lobby.revision}`);
  await handleTagComponent(freshAccept,async record=>{tagRefreshes++;assert.equal(record.revision,lobby.revision+1);},()=>{},panels);
  assert.deepEqual(freshAccept.calls,['deferUpdate','editReply']);
  assert.equal(tagRefreshes,1);
  const accepted=tag.getTag(lobby.id);
  assert.equal(accepted.status,'lobby');
  assert.equal(accepted.revision,lobby.revision+1);
  assert.equal(accepted.members.find(p=>p.id===owner).accepted,true);
  assert.equal(tag.currentTag(owner).id,lobby.id);
  assert.equal(duel.currentDuel(owner),undefined);
  assert.equal(count('tag_members','owner=?',owner),1);
  assert.equal(count('duel_members','owner=?',owner),0);

  const cancelled=tag.quitTag(lobby.id,host,GUILD,accepted.revision);
  assert.equal(cancelled.status,'cancelled');
  assert.equal(tag.currentTag(host),undefined);
  assert.equal(tag.currentTag(owner),undefined);
  assert.deepEqual(assetSnapshot(),beforeAssets,'decline/TagDuel Accept never changes player inventory');
});

after(()=>{
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
