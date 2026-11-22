'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm481-tag-lobby-expiry-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
let lobbySerial = 0;

function createLobby() {
  const run = ++lobbySerial;
  const ids = [0, 1, 2, 3].map(seat => 'm481-lobby-' + run + '-seat-' + seat);
  for (const id of ids) database.createPlayer(id, id);
  const record = store.createTagLobby(ids, 'm481-guild', 'm481-channel', 'classic-loan');
  assert.equal(record.status, 'lobby');
  assert.equal(record.members.filter(member => member.accepted).length, 1);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?')
    .get(record.id).n, 1, 'only the accepted host owns a lock before expiry');
  return record;
}

function snapshot(record) {
  return {
    row: database.db.prepare('SELECT * FROM tag_sessions WHERE id=?').get(record.id),
    events: database.db.prepare(
      'SELECT revision,events_json FROM tag_transition_events WHERE session_id=? ORDER BY revision'
    ).all(record.id),
    locks: database.db.prepare(
      'SELECT owner,session_id FROM tag_members WHERE session_id=? ORDER BY owner'
    ).all(record.id),
    players: database.db.prepare('SELECT * FROM players ORDER BY discord_id').all(),
    cards: database.db.prepare('SELECT * FROM player_cards').all()
      .map(row => JSON.stringify(row)).sort()
  };
}

function count(sql, id) {
  return database.db.prepare(sql).get(id).n;
}

function assertRollback(record, before) {
  assert.deepEqual(
    snapshot(record),
    before,
    'failed expiry must preserve the original lobby row, revision, events, host lock and player data'
  );
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?', record.id), 1);
}

test('session-update failure leaves the lobby and host lock intact until retry', () => {
  const record = createLobby();
  const deadline = store.tagDeadline(record);
  const before = snapshot(record);

  database.db.exec(`
    CREATE TRIGGER m481_fail_expiry_update
    BEFORE UPDATE ON tag_sessions
    WHEN OLD.id = '${record.id}' AND NEW.status = 'expired'
    BEGIN SELECT RAISE(ABORT, 'm481 injected expiry update failure'); END;
  `);

  assert.throws(
    () => store.getTag(record.id, deadline),
    /m481 injected expiry update failure/
  );
  database.db.exec('DROP TRIGGER m481_fail_expiry_update');
  assertRollback(record, before);

  const expired = store.getTag(record.id, deadline);
  assert.equal(expired.status, 'expired');
  assert.equal(expired.revision, record.revision + 1);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?', record.id), 0);
  const after = snapshot(record);
  assert.deepEqual(after.players, before.players);
  assert.deepEqual(after.cards, before.cards);
});

test('host-lock deletion failure rolls back the expiry row before retry', () => {
  const record = createLobby();
  const deadline = store.tagDeadline(record);
  const before = snapshot(record);

  database.db.exec(`
    CREATE TRIGGER m481_fail_expiry_lock_release
    BEFORE DELETE ON tag_members
    WHEN OLD.session_id = '${record.id}'
    BEGIN SELECT RAISE(ABORT, 'm481 injected expiry lock-release failure'); END;
  `);

  assert.throws(
    () => store.getTag(record.id, deadline),
    /m481 injected expiry lock-release failure/
  );
  database.db.exec('DROP TRIGGER m481_fail_expiry_lock_release');
  assertRollback(record, before);

  const expired = store.getTag(record.id, deadline);
  assert.equal(expired.status, 'expired');
  assert.equal(expired.revision, record.revision + 1);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?', record.id), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_transition_events WHERE session_id=?', record.id), 0);
  const after = snapshot(record);
  assert.deepEqual(after.players, before.players);
  assert.deepEqual(after.cards, before.cards);
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
