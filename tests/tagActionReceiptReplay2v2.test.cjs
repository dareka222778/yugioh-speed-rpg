'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm475-tag-receipt-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');

const ids = [0, 1, 2, 3].map(seat => 'm475-seat-' + seat);
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

test('duplicate Discord action receipt replays one committed revision and rejects request-ID reuse', () => {
  for (const id of ids) database.createPlayer(id, id);
  const lobby = store.createTagLobby(ids, 'm475-guild', 'm475-channel', 'classic-loan');
  let record = lobby;
  for (const id of ids.slice(1)) record = store.acceptTag(record.id, id, record.guild, record.revision);
  assert.equal(record.status, 'playing');

  const actor = tag.tagDecisionMember(record.state).id;
  const actions = tag.tagActions(record.state, actor);
  const index = actions.findIndex(action => action.kind === 'end');
  assert.notEqual(index, -1, 'End Turn must be a legal action for the active seat');
  const beforeInventory = inventorySnapshot(record.state);
  const beforeTurn = record.state.core.turn;
  const beforeRevision = record.revision;
  const requestId = 'm475-discord-interaction-unique';

  const first = store.actTag(record.id, actor, record.guild, beforeRevision, index, requestId);
  assert.equal(first.revision, beforeRevision + 1);
  assert.equal(first.state.core.turn, beforeTurn + 1);
  assert.deepEqual(first.receipt, {
    requestId,
    committedRevision: beforeRevision + 1,
    replayed: false
  });
  const eventsAfterFirst = store.tagEventsAt(record.id, first.revision);
  assert.ok(eventsAfterFirst.length > 0);
  const eventRowsAfterFirst = count(
    'SELECT COUNT(*) AS n FROM tag_transition_events WHERE session_id=?', record.id
  );

  const replay = store.actTag(record.id, actor, record.guild, beforeRevision, index, requestId);
  assert.equal(replay.revision, first.revision, 'replay must return the already committed revision');
  assert.equal(replay.state.core.turn, beforeTurn + 1, 'replay must not end a second turn');
  assert.deepEqual(replay.receipt, {
    requestId,
    committedRevision: first.revision,
    replayed: true
  });
  assert.deepEqual(replay.state, first.state);
  assert.deepEqual(store.tagEventsAt(record.id, replay.revision), eventsAfterFirst);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_transition_events WHERE session_id=?', record.id),
    eventRowsAfterFirst, 'replay must not append another transition event');
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_action_receipts WHERE duel_id=?', record.id), 1);

  const currentBeforeConflict = store.getTag(record.id);
  assert.throws(
    () => store.actTag(record.id, actor, record.guild, beforeRevision, index + 1, requestId),
    /já utilizado por outra solicitação/
  );
  const otherActor = ids.find(id => id !== actor);
  assert.throws(
    () => store.actTag(record.id, otherActor, record.guild, beforeRevision, index, requestId),
    /já utilizado por outra solicitação/
  );
  const currentAfterConflict = store.getTag(record.id);
  assert.equal(currentAfterConflict.revision, currentBeforeConflict.revision);
  assert.deepEqual(currentAfterConflict.state, currentBeforeConflict.state);
  assertInventoryConserved(currentAfterConflict.state, beforeInventory);
  assert.equal(count('SELECT COUNT(*) AS n FROM tag_action_receipts WHERE duel_id=?', record.id), 1);
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
