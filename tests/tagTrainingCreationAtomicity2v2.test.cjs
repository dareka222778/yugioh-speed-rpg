'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm482-tag-training-atomicity-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
let ownerSerial = 0;

function createOwner() {
  const owner = 'm482-training-owner-' + (++ownerSerial);
  database.createPlayer(owner, owner);
  return owner;
}

function snapshot() {
  return {
    sessions: database.db.prepare('SELECT * FROM tag_sessions ORDER BY id').all(),
    locks: database.db.prepare('SELECT * FROM tag_members ORDER BY owner').all(),
    players: database.db.prepare('SELECT * FROM players ORDER BY discord_id').all(),
    cards: database.db.prepare('SELECT * FROM player_cards').all()
      .map(row => JSON.stringify(row)).sort()
  };
}

function count(sql, value) {
  return database.db.prepare(sql).get(value).n;
}

function assertSuccessfulTraining(record, owner, before) {
  assert.equal(record.status, 'playing');
  assert.ok(record.state);
  assert.equal(record.members.filter(member => member.id === owner).length, 1);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_sessions WHERE id=?', record.id), 1);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?', record.id), 1);
  assert.equal(database.db.prepare('SELECT owner FROM tag_members WHERE session_id=?')
    .get(record.id).owner, owner);
  assert.equal(store.currentTag(owner).id, record.id);
  const inventory = tag.tagInventory(record.state);
  assert.equal(new Set(inventory.map(card => card.uid)).size, inventory.length);
  const after = snapshot();
  assert.deepEqual(after.players, before.players);
  assert.deepEqual(after.cards, before.cards);
}

test('training-session insert failure leaves no orphan session or participant lock', () => {
  const owner = createOwner();
  const before = snapshot();

  database.db.exec(`
    CREATE TRIGGER m482_fail_training_session
    BEFORE INSERT ON tag_sessions
    BEGIN SELECT RAISE(ABORT, 'm482 injected training-session failure'); END;
  `);

  assert.throws(
    () => store.createTagTraining(owner, 'm482-guild', 'm482-channel'),
    /m482 injected training-session failure/
  );
  database.db.exec('DROP TRIGGER m482_fail_training_session');
  assert.deepEqual(snapshot(), before);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_sessions WHERE status=?', 'playing'), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_members WHERE owner=?', owner), 0);

  const retry = store.createTagTraining(owner, 'm482-guild', 'm482-channel');
  assertSuccessfulTraining(retry, owner, before);
});

test('human-lock insert failure rolls back the training session and permits one safe retry', () => {
  const owner = createOwner();
  const before = snapshot();

  database.db.exec(`
    CREATE TRIGGER m482_fail_training_lock
    BEFORE INSERT ON tag_members
    WHEN NEW.owner = '${owner}'
    BEGIN SELECT RAISE(ABORT, 'm482 injected training-lock failure'); END;
  `);

  assert.throws(
    () => store.createTagTraining(owner, 'm482-guild', 'm482-channel'),
    /m482 injected training-lock failure/
  );
  database.db.exec('DROP TRIGGER m482_fail_training_lock');
  assert.deepEqual(snapshot(), before);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_sessions WHERE status=?', 'playing'), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_members WHERE owner=?', owner), 0);

  const retry = store.createTagTraining(owner, 'm482-guild', 'm482-channel');
  assertSuccessfulTraining(retry, owner, before);
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
