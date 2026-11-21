'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm472-tag-lobby-atomic-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');

const member = (group, seat) => group + '-seat-' + seat;
function createPlayers(ids) {
  for (const id of new Set(ids)) database.createPlayer(id, id);
}
function lockOwners(sessionId) {
  return database.db.prepare(
    'SELECT owner FROM tag_members WHERE session_id=? ORDER BY owner'
  ).all(sessionId).map(row => row.owner);
}
function economySnapshot() {
  return {
    players: database.db.prepare(
      'SELECT discord_id, dp, xp, starter_deck FROM players ORDER BY discord_id'
    ).all(),
    cards: database.db.prepare(
      'SELECT discord_id, card_key, quantity FROM player_cards ORDER BY discord_id, card_key'
    ).all(),
    grants: database.db.prepare(
      'SELECT discord_id, starter_deck, catalog_version FROM starter_grants ORDER BY discord_id'
    ).all()
  };
}
function tableCount(name) {
  return database.db.prepare('SELECT COUNT(*) AS n FROM ' + name).get().n;
}

test('a failed host-lock insert rolls back the newly created lobby and every side effect', () => {
  const ids = [0, 1, 2, 3].map(seat => member('m472-create', seat));
  createPlayers(ids);
  const beforeEconomy = economySnapshot();

  database.db.exec(`
    CREATE TRIGGER m472_fail_host_lock
    BEFORE INSERT ON tag_members
    WHEN NEW.owner = '${ids[0]}'
    BEGIN
      SELECT RAISE(ABORT, 'm472 injected host-lock failure');
    END;
  `);

  assert.throws(
    () => store.createTagLobby(ids, 'm472-guild', 'm472-channel', 'classic-loan'),
    /m472 injected host-lock failure/
  );
  assert.equal(tableCount('tag_sessions'), 0, 'session insert must roll back with the failed host lock');
  assert.equal(tableCount('tag_members'), 0, 'no orphaned participant lock may remain');
  assert.deepEqual(economySnapshot(), beforeEconomy, 'lobby creation must not change player economy or cards');

  database.db.exec('DROP TRIGGER m472_fail_host_lock');
  const created = store.createTagLobby(ids, 'm472-guild', 'm472-channel', 'classic-loan');
  assert.equal(created.status, 'lobby');
  assert.equal(created.revision, 0);
  assert.deepEqual(lockOwners(created.id), [ids[0]]);
  assert.deepEqual(economySnapshot(), beforeEconomy);
});

test('a failed lobby save rolls back the invitee lock and accepted flag together', () => {
  const ids = [0, 1, 2, 3].map(seat => member('m472-accept', seat));
  createPlayers(ids);
  const beforeEconomy = economySnapshot();
  const lobby = store.createTagLobby(ids, 'm472-guild', 'm472-channel', 'classic-loan');
  const invitee = ids[1];

  database.db.exec(`
    CREATE TRIGGER m472_fail_accept_save
    BEFORE UPDATE OF members ON tag_sessions
    WHEN OLD.id = '${lobby.id}'
    BEGIN
      SELECT RAISE(ABORT, 'm472 injected lobby-save failure');
    END;
  `);

  assert.throws(
    () => store.acceptTag(lobby.id, invitee, 'm472-guild', lobby.revision),
    /m472 injected lobby-save failure/
  );

  const afterFailure = store.getTag(lobby.id);
  assert.equal(afterFailure.status, 'lobby');
  assert.equal(afterFailure.revision, lobby.revision);
  assert.equal(afterFailure.members.find(item => item.id === invitee).accepted, false);
  assert.deepEqual(lockOwners(lobby.id), [ids[0]], 'the invitee lock must roll back with the failed save');
  assert.equal(database.db.prepare('SELECT session_id FROM tag_members WHERE owner=?').get(invitee), undefined);
  assert.deepEqual(economySnapshot(), beforeEconomy);

  database.db.exec('DROP TRIGGER m472_fail_accept_save');
  const accepted = store.acceptTag(lobby.id, invitee, 'm472-guild', lobby.revision);
  assert.equal(accepted.revision, lobby.revision + 1);
  assert.equal(accepted.members.find(item => item.id === invitee).accepted, true);
  assert.deepEqual(lockOwners(lobby.id), [ids[0], invitee]);
  assert.deepEqual(economySnapshot(), beforeEconomy);
});

test('two invitations may coexist, but one participant can acquire only one active lobby lock', () => {
  const a = [member('m472-a', 0), member('m472-shared', 1), member('m472-a', 2), member('m472-a', 3)];
  const b = [member('m472-b', 0), member('m472-shared', 1), member('m472-b', 2), member('m472-b', 3)];
  createPlayers([...a, ...b]);
  const beforeEconomy = economySnapshot();
  const sessionsBefore = tableCount('tag_sessions');

  const lobbyA = store.createTagLobby(a, 'm472-guild', 'm472-channel', 'classic-loan');
  const lobbyB = store.createTagLobby(b, 'm472-guild', 'm472-channel', 'classic-loan');
  assert.deepEqual(lockOwners(lobbyA.id), [a[0]]);
  assert.deepEqual(lockOwners(lobbyB.id), [b[0]]);

  const acceptedA = store.acceptTag(lobbyA.id, a[1], 'm472-guild', lobbyA.revision);
  assert.equal(acceptedA.members[1].accepted, true);
  assert.equal(store.currentTag(a[1]).id, lobbyA.id);

  assert.throws(
    () => store.acceptTag(lobbyB.id, b[1], 'm472-guild', lobbyB.revision),
    /já possui um duelo ou convite aberto/
  );
  const unchangedB = store.getTag(lobbyB.id);
  assert.equal(unchangedB.revision, lobbyB.revision);
  assert.equal(unchangedB.members[1].accepted, false);
  assert.deepEqual(lockOwners(lobbyB.id), [b[0]]);
  assert.deepEqual(lockOwners(lobbyA.id), [a[0], a[1]]);

  const cancelledA = store.quitTag(lobbyA.id, a[0], 'm472-guild', acceptedA.revision);
  assert.equal(cancelledA.status, 'cancelled');
  assert.deepEqual(lockOwners(lobbyA.id), [], 'cancelling a lobby must release its accepted and host locks');
  assert.equal(store.currentTag(a[1]), undefined);

  const acceptedB = store.acceptTag(lobbyB.id, b[1], 'm472-guild', unchangedB.revision);
  assert.equal(acceptedB.members[1].accepted, true);
  assert.equal(store.currentTag(b[1]).id, lobbyB.id);
  assert.deepEqual(lockOwners(lobbyB.id), [b[0], b[1]]);
  assert.equal(tableCount('tag_sessions'), sessionsBefore + 2, 'the failed cross-lobby accept must not create a duplicate session');
  assert.deepEqual(economySnapshot(), beforeEconomy, 'locks and consents must never grant collection cards');
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
