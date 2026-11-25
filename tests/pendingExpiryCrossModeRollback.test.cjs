'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m541-pending-expiry-cross-mode-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const decks=require('../dist/decks');
const duel=require('../dist/duelStore');
const tag=require('../dist/tagStore');
const db=database.db;

const GUILD='m541-guild',CHANNEL='m541-channel';

function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
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

test('failed 120-second 1v1 invitation expiry keeps creator locked out of TagDuel until retry',()=>{
  const ids=['host','invited','ally-1','ally-2','ally-3'].map(id=>'m541-1v1-'+id);
  for(const id of ids)createDuelist(id);
  const [owner,opponent,ally1,ally2,ally3]=ids;
  const invitation=duel.challenge(owner,opponent,GUILD,CHANNEL);
  const deadline=invitation.updated+120_000;
  const beforeAssets=assetSnapshot();
  const tagMembers=[owner,ally1,ally2,ally3];

  assert.equal(count('duel_members',owner),1);
  assert.equal(count('duel_members',opponent),0);
  assert.equal(duel.getDuel(invitation.id,deadline-1).status,'pending');
  assert.throws(
    ()=>tag.createTagLobby(tagMembers,GUILD,CHANNEL,'classic-loan'),
    /duelo ou convite aberto/i
  );

  db.exec(`
    CREATE TRIGGER m541_fail_pending_duel_release
    BEFORE DELETE ON duel_members
    WHEN OLD.duel_id='${invitation.id}'
    BEGIN SELECT RAISE(ABORT,'m541 injected pending 1v1 lock-release failure'); END;
  `);

  assert.throws(
    ()=>duel.getDuel(invitation.id,deadline),
    /m541 injected pending 1v1 lock-release failure/
  );
  const rolledBack=duel.getDuel(invitation.id,deadline-1);
  assert.equal(rolledBack.status,'pending');
  assert.equal(rolledBack.revision,invitation.revision);
  assert.equal(count('duel_members',owner),1);
  assert.equal(count('duel_members',opponent),0);
  assert.throws(
    ()=>tag.createTagLobby(tagMembers,GUILD,CHANNEL,'classic-loan'),
    /duelo ou convite aberto/i,
    'rollback must preserve the creator lock and the cross-mode block'
  );
  assert.equal(assetSnapshot(),beforeAssets);

  db.exec('DROP TRIGGER m541_fail_pending_duel_release');
  const expired=duel.getDuel(invitation.id,deadline);
  assert.equal(expired.status,'expired');
  assert.equal(expired.revision,invitation.revision+1);
  assert.equal(count('duel_members',owner),0);
  assert.equal(count('duel_members',opponent),0);

  const lobby=tag.createTagLobby(tagMembers,GUILD,CHANNEL,'classic-loan');
  assert.equal(lobby.status,'lobby');
  assert.equal(count('tag_members',owner),1);
  assert.equal(assetSnapshot(),beforeAssets);
});

test('failed five-minute TagDuel lobby expiry keeps its host locked out of 1v1 until retry',()=>{
  const ids=['host','invited-1','invited-2','invited-3','opponent'].map(id=>'m541-tag-'+id);
  for(const id of ids)createDuelist(id);
  const [host,invited1,invited2,invited3,opponent]=ids;
  const lobby=tag.createTagLobby([host,invited1,invited2,invited3],GUILD,CHANNEL,'classic-loan');
  const deadline=tag.tagDeadline(lobby);
  const beforeAssets=assetSnapshot();

  assert.equal(lobby.status,'lobby');
  assert.equal(count('tag_members',host),1);
  for(const invited of [invited1,invited2,invited3])assert.equal(count('tag_members',invited),0);
  assert.equal(tag.getTag(lobby.id,deadline-1).status,'lobby');
  assert.throws(
    ()=>duel.challenge(host,opponent,GUILD,CHANNEL),
    /reservado em um 2v2/i
  );

  db.exec(`
    CREATE TRIGGER m541_fail_tag_lobby_release
    BEFORE DELETE ON tag_members
    WHEN OLD.session_id='${lobby.id}'
    BEGIN SELECT RAISE(ABORT,'m541 injected TagDuel lobby lock-release failure'); END;
  `);

  assert.throws(
    ()=>tag.getTag(lobby.id,deadline),
    /m541 injected TagDuel lobby lock-release failure/
  );
  const rolledBack=tag.getTag(lobby.id,deadline-1);
  assert.equal(rolledBack.status,'lobby');
  assert.equal(rolledBack.revision,lobby.revision);
  assert.equal(count('tag_members',host),1);
  assert.throws(
    ()=>duel.challenge(host,opponent,GUILD,CHANNEL),
    /reservado em um 2v2/i,
    'rollback must preserve the host lock and the cross-mode block'
  );
  assert.equal(assetSnapshot(),beforeAssets);

  db.exec('DROP TRIGGER m541_fail_tag_lobby_release');
  const expired=tag.getTag(lobby.id,deadline);
  assert.equal(expired.status,'expired');
  assert.equal(expired.revision,lobby.revision+1);
  assert.equal(count('tag_members',host),0);
  const invitation=duel.challenge(host,opponent,GUILD,CHANNEL);
  assert.equal(invitation.status,'pending');
  assert.equal(count('duel_members',host),1);
  assert.equal(count('tag_members',host),0);
  assert.equal(assetSnapshot(),beforeAssets);
});

after(()=>{
  if(db?.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
