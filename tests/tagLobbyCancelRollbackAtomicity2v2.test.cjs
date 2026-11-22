'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm483-tag-lobby-cancel-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
let lobbySerial = 0;

function createPartiallyAcceptedLobby() {
  const run = ++lobbySerial;
  const ids = [0, 1, 2, 3].map(seat => 'm483-lobby-' + run + '-seat-' + seat);
  for (const id of ids) database.createPlayer(id, id);
  let record = store.createTagLobby(ids, 'm483-guild', 'm483-channel', 'classic-loan');
  record = store.acceptTag(record.id, ids[1], record.guild, record.revision);
  assert.equal(record.status, 'lobby');
  assert.equal(record.members.filter(member => member.accepted).length, 2);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?')
    .get(record.id).n, 2);
  return { record, actor: ids[1] };
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
    'failed cancellation must preserve lobby row, consent, revision, events and both accepted locks'
  );
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?', record.id), 2);
}

test('cancelled-status update failure keeps both accepted locks and permits a safe retry', () => {
  const { record, actor } = createPartiallyAcceptedLobby();
  const before = snapshot(record);

  database.db.exec(`
    CREATE TRIGGER m483_fail_cancel_update
    BEFORE UPDATE ON tag_sessions
    WHEN OLD.id = '${record.id}' AND NEW.status = 'cancelled'
    BEGIN SELECT RAISE(ABORT, 'm483 injected cancel update failure'); END;
  `);

  assert.throws(
    () => store.quitTag(record.id, actor, record.guild, record.revision),
    /m483 injected cancel update failure/
  );
  database.db.exec('DROP TRIGGER m483_fail_cancel_update');
  assertRollback(record, before);

  const cancelled = store.quitTag(record.id, actor, record.guild, record.revision);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.revision, record.revision + 1);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?', record.id), 0);
  const after = snapshot(record);
  assert.equal(after.events.length, 0);
  assert.deepEqual(after.players, before.players);
  assert.deepEqual(after.cards, before.cards);
});

test('accepted-lock deletion failure rolls back lobby cancellation before retry', () => {
  const { record, actor } = createPartiallyAcceptedLobby();
  const before = snapshot(record);

  database.db.exec(`
    CREATE TRIGGER m483_fail_cancel_lock_release
    BEFORE DELETE ON tag_members
    WHEN OLD.session_id = '${record.id}'
    BEGIN SELECT RAISE(ABORT, 'm483 injected cancel lock-release failure'); END;
  `);

  assert.throws(
    () => store.quitTag(record.id, actor, record.guild, record.revision),
    /m483 injected cancel lock-release failure/
  );
  database.db.exec('DROP TRIGGER m483_fail_cancel_lock_release');
  assertRollback(record, before);

  const cancelled = store.quitTag(record.id, actor, record.guild, record.revision);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.revision, record.revision + 1);
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
