'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m510-tag-create-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
let serial=0;

function createPlayers(count=4){
  const ids=Array.from({length:count},(_,seat)=>`m510-run-${++serial}-seat-${seat}`);
  for(const id of ids)database.createPlayer(id,id);
  return ids;
}
function count(table){
  return database.db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
}
function economySnapshot(){
  return {
    players:database.db.prepare('SELECT discord_id,dp,xp,starter_deck FROM players ORDER BY discord_id').all(),
    cards:database.db.prepare('SELECT discord_id,card_key,quantity FROM player_cards ORDER BY discord_id,card_key').all(),
    grants:database.db.prepare('SELECT discord_id,starter_deck,catalog_version FROM starter_grants ORDER BY discord_id').all()
  };
}

test('M510 a failed host-lock insert rolls back the just-created 2v2 lobby and permits one clean retry',()=>{
  const ids=createPlayers(4);
  const before={sessions:count('tag_sessions'),locks:count('tag_members'),economy:economySnapshot()};
  database.db.exec(`
    CREATE TRIGGER m510_abort_host_lock
    BEFORE INSERT ON tag_members
    WHEN NEW.owner='${ids[0]}'
    BEGIN SELECT RAISE(ABORT,'m510 injected host-lock failure'); END;
  `);

  assert.throws(
    ()=>store.createTagLobby(ids,'m510-guild','m510-channel','normal'),
    /m510 injected host-lock failure/
  );
  assert.equal(count('tag_sessions'),before.sessions,'the lobby row must roll back with the failed host lock');
  assert.equal(count('tag_members'),before.locks,'no orphan participant lock may remain');
  for(const id of ids)assert.equal(store.currentTag(id),undefined);
  assert.deepEqual(economySnapshot(),before.economy);

  database.db.exec('DROP TRIGGER m510_abort_host_lock');
  const created=store.createTagLobby(ids,'m510-guild','m510-channel','normal');
  assert.equal(created.status,'lobby');
  assert.equal(created.state,null);
  assert.equal(created.revision,0);
  assert.deepEqual(created.members.map(member=>member.accepted),[true,false,false,false]);
  assert.equal(count('tag_sessions'),before.sessions+1);
  assert.equal(count('tag_members'),before.locks+1);
  assert.equal(store.currentTag(ids[0]).id,created.id);
  for(const id of ids.slice(1))assert.equal(store.currentTag(id),undefined);
  assert.deepEqual(economySnapshot(),before.economy,'creating a borrowed-deck lobby does not grant or mutate player inventory');
});

test('M510 a participant already locked by a lobby cannot be reused to create a second session',()=>{
  const firstIds=createPlayers(4);
  const secondIds=[firstIds[0],...createPlayers(3)];
  const first=store.createTagLobby(firstIds,'m510-first-guild','m510-first-channel','normal');
  const before={sessions:count('tag_sessions'),locks:count('tag_members'),economy:economySnapshot()};

  assert.throws(
    ()=>store.createTagLobby(secondIds,'m510-second-guild','m510-second-channel','normal'),
    /já possui um duelo ou convite aberto/
  );
  assert.equal(count('tag_sessions'),before.sessions,'the rejected second lobby must not leave an orphan session');
  assert.equal(count('tag_members'),before.locks,'the first lobby keeps exactly its original host lock');
  assert.equal(store.currentTag(firstIds[0]).id,first.id);
  for(const id of firstIds.slice(1))assert.equal(store.currentTag(id),undefined);
  for(const id of secondIds.slice(1))assert.equal(store.currentTag(id),undefined);
  assert.deepEqual(economySnapshot(),before.economy);
});

after(()=>{
  if(database.db.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
