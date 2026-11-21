'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm478-tag-action-rollback-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
let duelSerial = 0;

function createPlayingDuel() {
  const run = ++duelSerial;
  const ids = [0, 1, 2, 3].map(seat => 'm478-duel-' + run + '-seat-' + seat);
  for (const id of ids) database.createPlayer(id, id);
  let record = store.createTagLobby(ids, 'm478-guild', 'm478-channel', 'classic-loan');
  for (const id of ids.slice(1)) {
    record = store.acceptTag(record.id, id, record.guild, record.revision);
  }
  assert.equal(record.status, 'playing');
  return record;
}

function activeEndAction(record) {
  const actor = tag.tagDecisionMember(record.state).id;
  const actions = tag.tagActions(record.state, actor);
  const index = actions.findIndex(action => action.kind === 'end');
  assert.notEqual(index, -1, 'End Turn must be a legal action for the active seat');
  return { actor, index };
}

function count(sql, id) {
  return database.db.prepare(sql).get(id).n;
}

function snapshot(record) {
  const row = database.db.prepare('SELECT * FROM tag_sessions WHERE id=?').get(record.id);
  return {
    row,
    events: database.db.prepare(
      'SELECT revision,events_json FROM tag_transition_events WHERE session_id=? ORDER BY revision'
    ).all(record.id),
    receipts: database.db.prepare(
      'SELECT * FROM tag_action_receipts WHERE duel_id=? ORDER BY request_id'
    ).all(record.id),
    locks: database.db.prepare(
      'SELECT owner,session_id FROM tag_members WHERE session_id=? ORDER BY owner'
    ).all(record.id),
    players: database.db.prepare('SELECT * FROM players ORDER BY discord_id').all(),
    cards: database.db.prepare('SELECT * FROM player_cards').all()
      .map(row => JSON.stringify(row)).sort()
  };
}

function assertPhysicalInventory(state, before) {
  const cards = tag.tagInventory(state);
  assert.equal(cards.length, before.size);
  assert.equal(new Set(cards.map(card => card.uid)).size, before.size);
  for (const card of cards) assert.equal(before.get(card.uid), card.id);
}

function inventorySnapshot(state) {
  return new Map(tag.tagInventory(state).map(card => [card.uid, card.id]));
}

function assertRollback(record, before, inventory) {
  const after = snapshot(record);
  assert.deepEqual(after, before, 'session, events, receipts, locks and player collections must roll back together');
  assertPhysicalInventory(JSON.parse(after.row.state), inventory);
  assert.equal(count(
    'SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?', record.id
  ), 4, 'all four participant locks must remain intact');
}

test('transition-event insert failure rolls back the action and allows the same request to retry', () => {
  const record = createPlayingDuel();
  const { actor, index } = activeEndAction(record);
  const requestId = 'm478-transition-retry';
  const before = snapshot(record);
  const inventory = inventorySnapshot(record.state);

  database.db.exec(`
    CREATE TRIGGER m478_fail_transition_insert
    BEFORE INSERT ON tag_transition_events
    BEGIN SELECT RAISE(ABORT, 'm478 injected transition-event failure'); END;
  `);

  assert.throws(
    () => store.actTag(record.id, actor, record.guild, record.revision, index, requestId),
    /m478 injected transition-event failure/
  );
  database.db.exec('DROP TRIGGER m478_fail_transition_insert');
  assertRollback(record, before, inventory);

  const retry = store.actTag(record.id, actor, record.guild, record.revision, index, requestId);
  assert.equal(retry.revision, record.revision + 1);
  assert.deepEqual(retry.receipt, {
    requestId,
    committedRevision: record.revision + 1,
    replayed: false
  });
  assert.equal(count(
    'SELECT COUNT(*) AS n FROM tag_transition_events WHERE session_id=?', record.id
  ), 1);
  assert.equal(count(
    'SELECT COUNT(*) AS n FROM tag_action_receipts WHERE duel_id=?', record.id
  ), 1);
  assertPhysicalInventory(retry.state, inventory);
});

test('action-receipt insert failure rolls back state and events before a safe retry', () => {
  const record = createPlayingDuel();
  const { actor, index } = activeEndAction(record);
  const requestId = 'm478-receipt-retry';
  const before = snapshot(record);
  const inventory = inventorySnapshot(record.state);

  database.db.exec(`
    CREATE TRIGGER m478_fail_receipt_insert
    BEFORE INSERT ON tag_action_receipts
    BEGIN SELECT RAISE(ABORT, 'm478 injected receipt failure'); END;
  `);

  assert.throws(
    () => store.actTag(record.id, actor, record.guild, record.revision, index, requestId),
    /m478 injected receipt failure/
  );
  database.db.exec('DROP TRIGGER m478_fail_receipt_insert');
  assertRollback(record, before, inventory);

  const retry = store.actTag(record.id, actor, record.guild, record.revision, index, requestId);
  assert.equal(retry.revision, record.revision + 1);
  assert.deepEqual(retry.receipt, {
    requestId,
    committedRevision: record.revision + 1,
    replayed: false
  });
  const eventCount = count(
    'SELECT COUNT(*) AS n FROM tag_transition_events WHERE session_id=?', record.id
  );
  assert.equal(eventCount, 1, 'a retry must persist exactly one transition event');
  assert.equal(count(
    'SELECT COUNT(*) AS n FROM tag_action_receipts WHERE duel_id=?', record.id
  ), 1, 'a retry must persist exactly one idempotency receipt');

  const replay = store.actTag(record.id, actor, record.guild, record.revision, index, requestId);
  assert.equal(replay.revision, retry.revision);
  assert.equal(replay.receipt.replayed, true);
  assert.equal(count(
    'SELECT COUNT(*) AS n FROM tag_transition_events WHERE session_id=?', record.id
  ), eventCount);
  assertPhysicalInventory(replay.state, inventory);
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
