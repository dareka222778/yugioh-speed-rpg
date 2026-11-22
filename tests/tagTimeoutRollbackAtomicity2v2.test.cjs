'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm480-tag-timeout-rollback-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
let duelSerial = 0;

function createPlayingDuel() {
  const run = ++duelSerial;
  const ids = [0, 1, 2, 3].map(seat => 'm480-duel-' + run + '-seat-' + seat);
  for (const id of ids) database.createPlayer(id, id);
  let record = store.createTagLobby(ids, 'm480-guild', 'm480-channel', 'classic-loan');
  for (const id of ids.slice(1)) {
    record = store.acceptTag(record.id, id, record.guild, record.revision);
  }
  assert.equal(record.status, 'playing');
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

function inventorySnapshot(state) {
  return new Map(tag.tagInventory(state).map(card => [card.uid, card.id]));
}

function assertInventoryConserved(state, before) {
  const cards = tag.tagInventory(state);
  assert.equal(cards.length, before.size);
  assert.equal(new Set(cards.map(card => card.uid)).size, before.size);
  for (const card of cards) assert.equal(before.get(card.uid), card.id);
}

function count(sql, id) {
  return database.db.prepare(sql).get(id).n;
}

function assertRollback(record, before, inventory) {
  const after = snapshot(record);
  assert.deepEqual(after, before, 'timeout must roll back status, winner, revision, events and all locks');
  assertInventoryConserved(JSON.parse(after.row.state), inventory);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?', record.id), 4);
}

function assertSuccessfulTimeout(result, record, losingTeam, inventory) {
  assert.equal(result.status, 'finished');
  assert.equal(result.revision, record.revision + 1);
  assert.equal(result.state.core.phase, 'finished');
  assert.equal(result.state.core.winner, 'tag-team-' + (1 - losingTeam));
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?', record.id), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_transition_events WHERE session_id=?', record.id), 1);
  assertInventoryConserved(result.state, inventory);
}

test('terminal-event write failure leaves the decision timeout entirely uncommitted', () => {
  const record = createPlayingDuel();
  const losingTeam = tag.tagDecisionMember(record.state).team;
  const deadline = store.tagDeadline(record);
  const before = snapshot(record);
  const inventory = inventorySnapshot(record.state);

  database.db.exec(`
    CREATE TRIGGER m480_fail_timeout_event
    BEFORE INSERT ON tag_transition_events
    BEGIN SELECT RAISE(ABORT, 'm480 injected timeout event failure'); END;
  `);

  assert.throws(
    () => store.getTag(record.id, deadline),
    /m480 injected timeout event failure/
  );
  database.db.exec('DROP TRIGGER m480_fail_timeout_event');
  assertRollback(record, before, inventory);

  const retry = store.getTag(record.id, deadline);
  assertSuccessfulTimeout(retry, record, losingTeam, inventory);
});

test('lock-release failure rolls back timeout state and event before the same deadline is retried', () => {
  const record = createPlayingDuel();
  const losingTeam = tag.tagDecisionMember(record.state).team;
  const deadline = store.tagDeadline(record);
  const before = snapshot(record);
  const inventory = inventorySnapshot(record.state);

  database.db.exec(`
    CREATE TRIGGER m480_fail_timeout_lock_release
    BEFORE DELETE ON tag_members
    WHEN OLD.session_id = '${record.id}'
    BEGIN SELECT RAISE(ABORT, 'm480 injected timeout lock-release failure'); END;
  `);

  assert.throws(
    () => store.getTag(record.id, deadline),
    /m480 injected timeout lock-release failure/
  );
  database.db.exec('DROP TRIGGER m480_fail_timeout_lock_release');
  assertRollback(record, before, inventory);

  const retry = store.getTag(record.id, deadline);
  assertSuccessfulTimeout(retry, record, losingTeam, inventory);
  assert.equal(
    database.db.prepare('SELECT events_json FROM tag_transition_events WHERE session_id=?')
      .all(record.id).length,
    1,
    'the same deadline must produce only one terminal transition'
  );
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
