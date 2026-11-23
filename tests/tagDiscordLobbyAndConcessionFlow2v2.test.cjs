'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm484-tag-discord-flow-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const { handleTagComponent } = require('../dist/tagInteraction');
const { tagPublicMessage, tagPrivateMessage } = require('../dist/tagUI');
let fixtureSerial = 0;

function createLobby() {
  const run = ++fixtureSerial;
  const ids = [0, 1, 2, 3].map(seat => 'm484-lobby-' + run + '-seat-' + seat);
  for (const id of ids) database.createPlayer(id, id);
  return store.createTagLobby(ids, 'm484-guild', 'm484-channel', 'classic-loan');
}

function createPlayingDuel() {
  const run = ++fixtureSerial;
  const ids = [0, 1, 2, 3].map(seat => 'm484-duel-' + run + '-seat-' + seat);
  for (const id of ids) database.createPlayer(id, id);
  let record = store.createTagLobby(ids, 'm484-guild', 'm484-channel', 'classic-loan');
  for (const id of ids.slice(1)) {
    record = store.acceptTag(record.id, id, record.guild, record.revision);
  }
  assert.equal(record.status, 'playing');
  return record;
}

function componentIds(payload) {
  return payload.components.flatMap(row => row.components).map(component => component.data.custom_id);
}

function fakeInteraction(customId, userId, beforeDefer) {
  const result = { deferred: false, edits: [], followUps: [] };
  const interaction = {
    id: 'm484-interaction-' + (++fixtureSerial),
    customId,
    guildId: 'm484-guild',
    user: { id: userId },
    async deferUpdate() {
      if (beforeDefer) beforeDefer();
      result.deferred = true;
    },
    async editReply(payload) {
      assert.equal(result.deferred, true, 'Discord acknowledgement must precede panel edits');
      result.edits.push(payload);
      return payload;
    },
    async followUp(payload) {
      result.followUps.push(payload);
      return payload;
    }
  };
  return { interaction, result };
}

test('public lobby cancel button defers before mutation and republishes the cancelled state', async () => {
  const record = createLobby();
  const actor = record.members[0].id;
  const publicBefore = tagPublicMessage(record);
  const cancelId = componentIds(publicBefore).find(id => id.startsWith('tag:cancel:'));
  assert.ok(cancelId, 'public lobby panel must expose a cancel/decline button');

  const { interaction, result } = fakeInteraction(cancelId, actor, () => {
    assert.equal(store.getTag(record.id).status, 'lobby', 'the lobby must still be active at acknowledgement');
  });
  const deferred = [];
  const refreshed = [];
  await handleTagComponent(
    interaction,
    async next => { refreshed.push(next); },
    kind => deferred.push(kind),
    { public: async next => tagPublicMessage(next) }
  );

  const after = store.getTag(record.id);
  assert.equal(after.status, 'cancelled');
  assert.equal(after.revision, record.revision + 1);
  assert.deepEqual(deferred, ['update']);
  assert.equal(result.edits.length, 1);
  assert.equal(result.edits[0].components.length, 0);
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0].status, 'cancelled');
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?')
    .get(record.id).n, 0);
});

test('private quit→confirm sequence uses the emitted confirmation ID and refreshes the finished duel', async () => {
  const record = createPlayingDuel();
  const active = tag.tagDecisionMember(record.state);
  const actor = active.id;
  const privateBefore = tagPrivateMessage(record, actor);
  const quitId = componentIds(privateBefore).find(id => id.startsWith('tag:quit,'));
  assert.ok(quitId, 'private hand panel must expose a team-concession control');

  const quit = fakeInteraction(quitId, actor, () => {
    assert.equal(store.getTag(record.id).status, 'playing', 'opening confirmation must not concede');
  });
  const quitDeferred = [];
  await handleTagComponent(
    quit.interaction,
    async () => { throw new Error('quit prompt must not refresh the duel'); },
    kind => quitDeferred.push(kind),
    { public: async next => tagPublicMessage(next), private: async (next, owner) => tagPrivateMessage(next, owner) }
  );

  assert.deepEqual(quitDeferred, ['update']);
  assert.equal(store.getTag(record.id).status, 'playing');
  assert.equal(quit.result.edits.length, 1);
  const confirmId = componentIds(quit.result.edits[0]).find(id => id.startsWith('tag:confirm,'));
  assert.ok(confirmId, 'confirmation prompt must emit a scoped confirm custom_id');

  const confirm = fakeInteraction(confirmId, actor, () => {
    assert.equal(store.getTag(record.id).status, 'playing', 'confirm acknowledgement precedes concession');
  });
  const confirmDeferred = [];
  const refreshed = [];
  await handleTagComponent(
    confirm.interaction,
    async next => { refreshed.push(next); },
    kind => confirmDeferred.push(kind),
    { public: async next => tagPublicMessage(next), private: async (next, owner) => tagPrivateMessage(next, owner) }
  );

  const after = store.getTag(record.id);
  assert.equal(after.status, 'finished');
  assert.equal(after.revision, record.revision + 1);
  assert.equal(after.state.core.winner, 'tag-team-' + (1 - active.team));
  assert.deepEqual(confirmDeferred, ['update']);
  assert.equal(confirm.result.edits.length, 1);
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0].status, 'finished');
  assert.equal(confirm.result.edits[0].components.length, 0, 'finished private panel must not expose live actions');
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?')
    .get(record.id).n, 0);
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
