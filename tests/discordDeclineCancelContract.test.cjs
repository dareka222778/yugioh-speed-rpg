'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m551-discord-decline-cancel-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const decks=require('../dist/decks');
const duel=require('../dist/duelStore');
const tag=require('../dist/tagStore');
const duelUI=require('../dist/duelUI');
const tagUI=require('../dist/tagUI');
const {handleDuelComponent}=require('../dist/duelInteraction');
const {handleTagComponent}=require('../dist/tagInteraction');
const {validateDiscordPayload}=require('../dist/discordPayload');
const db=database.db;
const GUILD='m551-guild',CHANNEL='m551-channel';
let serial=0;

function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  const deck=decks.openDeck(id);
  assert.equal(deck.total,20);
  assert.ok(deck.extraTotal<=5);
  assert.equal(decks.activateDeck(id,1).errors.length,0);
  assert.equal(duel.activeCards(id).cards.length,20);
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function count(table,owner){
  return db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE owner=?').get(owner).n;
}
function components(payload){
  return payload.components.flatMap(row=>row.toJSON().components);
}
function makeInteraction(customId,userId){
  const calls={deferUpdate:0,deferReply:[],editReply:[],reply:[],followUp:[]};
  return {
    calls,
    interaction:{
      id:'m551-interaction-'+(++serial),customId,guildId:GUILD,user:{id:userId},
      values:[],isButton:()=>true,isStringSelectMenu:()=>false,
      deferUpdate:async()=>{calls.deferUpdate++;},
      deferReply:async options=>{calls.deferReply.push(options);},
      editReply:async payload=>{calls.editReply.push(payload);},
      reply:async payload=>{calls.reply.push(payload);},
      followUp:async payload=>{calls.followUp.push(payload);}
    }
  };
}

test('1v1 decline button uses the real component handler, releases the owner lock and removes invitation controls',async()=>{
  const owner='m551-duel-owner',opponent='m551-duel-opponent';
  createDuelist(owner);createDuelist(opponent);
  const invite=duel.challenge(owner,opponent,GUILD,CHANNEL);
  const beforeAssets=assetSnapshot();
  const invitationPayload=duelUI.invitationMessage(invite);
  validateDiscordPayload(invitationPayload);
  const declineId='duel:decline:'+invite.id+':'+invite.revision;
  const decline=components(invitationPayload).find(component=>component.custom_id===declineId);
  assert.ok(decline,'the public invitation must expose the canonical decline component');
  assert.equal(count('duel_members',owner),1);
  assert.equal(count('duel_members',opponent),0);

  const delivered=makeInteraction(decline.custom_id,opponent);
  const refreshed=[];
  await handleDuelComponent(delivered.interaction,{refreshArena:async record=>refreshed.push(record)});
  assert.equal(delivered.calls.deferUpdate,1);
  assert.equal(refreshed.length,1);
  assert.equal(refreshed[0].status,'declined');
  assert.equal(count('duel_members',owner),0);
  assert.equal(count('duel_members',opponent),0);
  const terminal=duelUI.duelPublicMessage(refreshed[0]);
  validateDiscordPayload(terminal);
  assert.equal(terminal.components.length,0,'a terminal invitation must not retain active controls');

  await assert.rejects(
    handleDuelComponent(makeInteraction(decline.custom_id,opponent).interaction,{refreshArena:async()=>{}}),
    /Não é possível cancelar esse convite/
  );
  assert.equal(duel.getDuel(invite.id).status,'declined');
  assert.equal(count('duel_members',owner),0);
  assert.equal(assetSnapshot(),beforeAssets,'decline and stale replay cannot alter collections, grants or Decks');
});

test('TagDuel lobby cancel button uses the real component handler and releases the host physical lock',async()=>{
  const ids=['host','seat-1','seat-2','seat-3'].map(part=>'m551-tag-'+part);
  for(const id of ids)createDuelist(id);
  const lobby=tag.createTagLobby(ids,GUILD,CHANNEL,'classic-loan');
  const beforeAssets=assetSnapshot();
  const lobbyPayload=tagUI.tagPublicMessage(lobby);
  validateDiscordPayload(lobbyPayload);
  const cancelId='tag:cancel:'+lobby.id+':'+lobby.revision;
  const cancel=components(lobbyPayload).find(component=>component.custom_id===cancelId);
  assert.ok(cancel,'the public lobby must expose the canonical cancel component');
  assert.equal(count('tag_members',ids[0]),1);

  const delivered=makeInteraction(cancel.custom_id,ids[0]);
  const refreshed=[],deferred=[];
  await handleTagComponent(delivered.interaction,async record=>refreshed.push(record),kind=>deferred.push(kind));
  assert.equal(delivered.calls.deferUpdate,1);
  assert.deepEqual(deferred,['update']);
  assert.equal(delivered.calls.editReply.length,1);
  assert.equal(refreshed.length,1);
  assert.equal(refreshed[0].status,'cancelled');
  assert.equal(count('tag_members',ids[0]),0);
  for(const id of ids){
    assert.equal(count('tag_members',id),0);
    assert.equal(count('duel_members',id),0);
  }
  validateDiscordPayload(delivered.calls.editReply[0]);
  assert.equal(delivered.calls.editReply[0].components.length,0,'cancelled lobby payload must have no active controls');

  await assert.rejects(
    handleTagComponent(makeInteraction(cancel.custom_id,ids[0]).interaction,async()=>{},()=>{}),
    /Partida atualizada ou encerrada/
  );
  assert.equal(tag.getTag(lobby.id).status,'cancelled');
  for(const id of ids)assert.equal(count('tag_members',id),0);
  assert.equal(assetSnapshot(),beforeAssets,'TagDuel cancel and stale replay cannot alter collections, grants or Decks');
});

after(()=>{
  if(db?.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
