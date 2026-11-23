'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm479-tag-quit-rollback-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
let duelSerial = 0;

function createPlayingDuel() {
  const run = ++duelSerial;
  const ids = [0, 1, 2, 3].map(seat => 'm479-duel-' + run + '-seat-' + seat);
  for (const id of ids) database.createPlayer(id, id);
  let record = store.createTagLobby(ids, 'm479-guild', 'm479-channel', 'classic-loan');
  for (const id of ids.slice(1)) {
    record = store.acceptTag(record.id, id, record.guild, record.revision);
  }
  assert.equal(record.status, 'playing');
  const active = tag.tagDecisionMember(record.state);
  const inactivePartner = record.state.members.find(member =>
    member.team === active.team && member.id !== active.id
  );
  assert.ok(inactivePartner, 'the active teammate must have an inactive physical partner');
  return { record, actor: inactivePartner.id, team: active.team };
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
  assert.deepEqual(after, before, 'quitTag must roll back status, winner, revision, events and all locks');
  assertInventoryConserved(JSON.parse(after.row.state), inventory);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?', record.id), 4);
}

function assertSuccessfulConcession(result, record, team, inventory) {
  assert.equal(result.status, 'finished');
  assert.equal(result.revision, record.revision + 1);
  assert.equal(result.state.core.phase, 'finished');
  assert.equal(result.state.core.winner, 'tag-team-' + (1 - team));
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?', record.id), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_transition_events WHERE session_id=?', record.id), 1);
  assertInventoryConserved(result.state, inventory);
}

test('transition-event write failure keeps the concession and four locks uncommitted', () => {
  const { record, actor, team } = createPlayingDuel();
  const before = snapshot(record);
  const inventory = inventorySnapshot(record.state);

  database.db.exec(`
    CREATE TRIGGER m479_fail_quit_event
    BEFORE INSERT ON tag_transition_events
    BEGIN SELECT RAISE(ABORT, 'm479 injected quit event failure'); END;
  `);

  assert.throws(
    () => store.quitTag(record.id, actor, record.guild, record.revision),
    /m479 injected quit event failure/
  );
  database.db.exec('DROP TRIGGER m479_fail_quit_event');
  assertRollback(record, before, inventory);

  const retry = store.quitTag(record.id, actor, record.guild, record.revision);
  assertSuccessfulConcession(retry, record, team, inventory);
});

test('lock-release failure rolls back the terminal session and event before retry', () => {
  const { record, actor, team } = createPlayingDuel();
  const before = snapshot(record);
  const inventory = inventorySnapshot(record.state);

  database.db.exec(`
    CREATE TRIGGER m479_fail_quit_lock_release
    BEFORE DELETE ON tag_members
    WHEN OLD.session_id = '${record.id}'
    BEGIN SELECT RAISE(ABORT, 'm479 injected lock-release failure'); END;
  `);

  assert.throws(
    () => store.quitTag(record.id, actor, record.guild, record.revision),
    /m479 injected lock-release failure/
  );
  database.db.exec('DROP TRIGGER m479_fail_quit_lock_release');
  assertRollback(record, before, inventory);

  const retry = store.quitTag(record.id, actor, record.guild, record.revision);
  assertSuccessfulConcession(retry, record, team, inventory);
  assert.equal(
    database.db.prepare('SELECT events_json FROM tag_transition_events WHERE session_id=?')
      .all(record.id).length,
    1,
    'retry must persist one terminal transition only'
  );
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
