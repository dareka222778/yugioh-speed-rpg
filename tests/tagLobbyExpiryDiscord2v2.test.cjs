'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm470-tag-lobby-expiry-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const ui = require('../dist/tagUI');
const { handleTagComponent } = require('../dist/tagInteraction');
const { validateDiscordPayload } = require('../dist/discordPayload');

const LOBBY_MS = 5 * 60_000;
const member = (run, seat) => run + '-seat-' + seat;

function createPlayers(ids) {
  for (const id of ids) database.createPlayer(id, id);
}

function inventorySnapshot() {
  const count = table => database.db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
  return {
    playerCards: count('player_cards'),
    starterGrants: count('starter_grants'),
    decks: count('decks')
  };
}

function lockOwners(sessionId) {
  return database.db.prepare(
    'SELECT owner FROM tag_members WHERE session_id=? ORDER BY owner'
  ).all(sessionId).map(row => row.owner);
}

function components(payload) {
  return (payload.components || []).flatMap(row => row.toJSON().components || []);
}

function buttonId(payload, prefix) {
  const found = components(payload).find(component =>
    typeof component.custom_id === 'string' && component.custom_id.startsWith(prefix)
  );
  assert.ok(found, 'expected Discord button with custom ID prefix ' + prefix);
  return found.custom_id;
}

function makeInteraction(record, actor, customId) {
  const calls = [];
  const replies = [];
  return {
    id: 'm470-' + actor + '-' + record.revision,
    guildId: record.guild,
    user: { id: actor },
    customId,
    isButton: () => true,
    isStringSelectMenu: () => false,
    deferUpdate: async () => { calls.push('deferUpdate'); },
    deferReply: async options => {
      calls.push('deferReply');
      assert.ok(options && options.flags);
    },
    editReply: async payload => {
      calls.push('editReply');
      validateDiscordPayload(payload);
      replies.push(payload);
    },
    calls,
    replies
  };
}

async function acceptThroughDiscord(record, actor) {
  const customId = buttonId(ui.tagPublicMessage(record), 'tag:accept:');
  const interaction = makeInteraction(record, actor, customId);
  const refreshes = [];
  await handleTagComponent(interaction, async next => {
    validateDiscordPayload(ui.tagPublicMessage(next));
    refreshes.push(next.status);
  }, () => {});
  assert.deepEqual(interaction.calls, ['deferUpdate', 'editReply']);
  assert.deepEqual(refreshes, ['lobby']);
  return store.getTag(record.id);
}

function createLobby(run, ids) {
  return store.createTagLobby(ids, run + '-guild', run + '-channel', 'classic-loan');
}

test('a partially accepted lobby stays open one millisecond before its five-minute deadline, then expires once and is published', async () => {
  const ids = [0, 1, 2, 3].map(seat => member('m470-boundary', seat));
  createPlayers(ids);
  const beforeInventory = inventorySnapshot();
  let record = createLobby('m470-boundary', ids);
  record = await acceptThroughDiscord(record, ids[2]);
  assert.equal(record.status, 'lobby');
  assert.equal(record.revision, 1);
  assert.deepEqual(lockOwners(record.id), [ids[0], ids[2]]);

  store.setTagMessage(record.id, 'm470-public-message', record.channel);
  const base = Date.now() - LOBBY_MS;
  database.db.prepare('UPDATE tag_sessions SET updated=? WHERE id=?').run(base, record.id);
  const updated = store.getTag(record.id, base);
  const deadline = store.tagDeadline(updated);
  assert.equal(deadline, base + LOBBY_MS);

  const beforeDeadline = store.getTag(record.id, deadline - 1);
  assert.equal(beforeDeadline.status, 'lobby');
  assert.equal(beforeDeadline.revision, 1);
  assert.deepEqual(lockOwners(record.id), [ids[0], ids[2]]);

  const expired = store.getTag(record.id, deadline);
  assert.equal(expired.status, 'expired');
  assert.equal(expired.revision, 2);
  assert.equal(expired.state, null);
  assert.deepEqual(lockOwners(record.id), []);
  for (const id of ids) assert.equal(store.currentTag(id), undefined);

  const publicPayload = ui.tagPublicMessage(expired);
  validateDiscordPayload(publicPayload);
  assert.ok(JSON.stringify(publicPayload).includes('Prazo esgotado'));

  const due = store.dueTags();
  assert.ok(due.some(item => item.id === record.id && item.status === 'expired' && item.revision === 2),
    'dueTags must schedule the expired public lobby for refresh');
  store.markTagPublished(record.id, expired.revision);
  assert.equal(store.dueTags().some(item => item.id === record.id), false,
    'a published expiry revision must not be queued again');

  const repeated = store.getTag(record.id, deadline + 60_000);
  assert.equal(repeated.status, 'expired');
  assert.equal(repeated.revision, 2, 'expiry must be idempotent');
  assert.deepEqual(inventorySnapshot(), beforeInventory);
});

test('an accept button rendered before the deadline cannot restore an expired lobby or reacquire its host lock', async () => {
  const ids = [0, 1, 2, 3].map(seat => member('m470-stale', seat));
  createPlayers(ids);
  const beforeInventory = inventorySnapshot();
  const lobby = createLobby('m470-stale', ids);
  const staleAcceptId = buttonId(ui.tagPublicMessage(lobby), 'tag:accept:');
  assert.deepEqual(lockOwners(lobby.id), [ids[0]]);

  const base = Date.now() - LOBBY_MS;
  database.db.prepare('UPDATE tag_sessions SET updated=? WHERE id=?').run(base, lobby.id);
  const actor = ids[1];
  const interaction = makeInteraction(lobby, actor, staleAcceptId);
  await assert.rejects(
    handleTagComponent(interaction, async () => assert.fail('expired acceptance must not refresh as a live lobby'), () => {}),
    /Convite atualizado ou encerrado/
  );

  const expired = store.getTag(lobby.id, base + LOBBY_MS + 1);
  assert.equal(expired.status, 'expired');
  assert.equal(expired.revision, lobby.revision + 1);
  assert.deepEqual(interaction.calls, ['deferUpdate']);
  assert.deepEqual(lockOwners(lobby.id), []);
  for (const id of ids) assert.equal(store.currentTag(id), undefined);
  assert.deepEqual(inventorySnapshot(), beforeInventory);
});

after(() => {
  database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
