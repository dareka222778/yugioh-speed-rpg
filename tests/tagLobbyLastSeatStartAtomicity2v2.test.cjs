'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm476-last-seat-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const { rulesFor } = require('../dist/rulesProfile');

const ids = [0, 1, 2, 3].map(seat => 'm476-seat-' + seat);
function lockOwners(sessionId) {
  return database.db.prepare(
    'SELECT owner FROM tag_members WHERE session_id=? ORDER BY owner'
  ).all(sessionId).map(row => row.owner);
}
function economySnapshot() {
  return {
    players: database.db.prepare('SELECT discord_id,dp,xp,starter_deck FROM players ORDER BY discord_id').all(),
    cards: database.db.prepare('SELECT discord_id,card_key,quantity FROM player_cards ORDER BY discord_id,card_key').all(),
    grants: database.db.prepare('SELECT discord_id,starter_deck,catalog_version FROM starter_grants ORDER BY discord_id').all()
  };
}

test('a failed fourth acceptance rolls back consent, lock, revision and lobby-to-playing state together', () => {
  for (const id of ids) database.createPlayer(id, id);
  const beforeEconomy = economySnapshot();
  let lobby = store.createTagLobby(ids, 'm476-guild', 'm476-channel', 'classic-loan');
  assert.equal(lobby.status, 'lobby');
  assert.equal(lobby.revision, 0);
  assert.deepEqual(lockOwners(lobby.id), [ids[0]]);

  lobby = store.acceptTag(lobby.id, ids[1], lobby.guild, lobby.revision);
  lobby = store.acceptTag(lobby.id, ids[2], lobby.guild, lobby.revision);
  const beforeLastAcceptance = store.getTag(lobby.id);
  assert.equal(beforeLastAcceptance.status, 'lobby');
  assert.equal(beforeLastAcceptance.revision, 2);
  assert.equal(beforeLastAcceptance.state, null);
  assert.deepEqual(lockOwners(lobby.id), ids.slice(0, 3).sort());

  database.db.exec(`
    CREATE TRIGGER m476_fail_lobby_start
    BEFORE UPDATE OF status ON tag_sessions
    WHEN OLD.id = '${lobby.id}' AND NEW.status = 'playing'
    BEGIN
      SELECT RAISE(ABORT, 'm476 injected lobby-start persistence failure');
    END;
  `);

  assert.throws(
    () => store.acceptTag(lobby.id, ids[3], lobby.guild, beforeLastAcceptance.revision),
    /m476 injected lobby-start persistence failure/
  );

  const afterFailure = store.getTag(lobby.id);
  assert.equal(afterFailure.status, 'lobby');
  assert.equal(afterFailure.revision, beforeLastAcceptance.revision);
  assert.equal(afterFailure.state, null, 'a failed start must not persist a partial TagDuel');
  assert.equal(afterFailure.members.find(member => member.id === ids[3]).accepted, false);
  assert.deepEqual(lockOwners(lobby.id), ids.slice(0, 3).sort(),
    'the fourth participant lock must roll back with the failed lobby start');
  assert.equal(database.db.prepare('SELECT session_id FROM tag_members WHERE owner=?').get(ids[3]), undefined);
  assert.deepEqual(economySnapshot(), beforeEconomy);

  database.db.exec('DROP TRIGGER m476_fail_lobby_start');
  const started = store.acceptTag(lobby.id, ids[3], lobby.guild, afterFailure.revision);
  assert.equal(started.status, 'playing');
  assert.equal(started.revision, afterFailure.revision + 1);
  assert.ok(started.state);
  tag.assertTagDuel(started.state);
  assert.deepEqual(lockOwners(lobby.id), [...ids].sort());
  const rules = rulesFor(started.state.core);
  assert.deepEqual([
    rules.mainDeckMin, rules.mainDeckMax, rules.handLimit, rules.handCheck,
    rules.monsterZones, rules.spellTrapZones, rules.extraDeckMax
  ], [20, 30, 6, 'end', 3, 3, 5]);
  assert.deepEqual(economySnapshot(), beforeEconomy, 'starting the lobby must not grant collection cards');
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
