'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm477-tag-publish-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const ids = [0, 1, 2, 3].map(seat => 'm477-seat-' + seat);

function publishedRevision(id) {
  return database.db.prepare('SELECT public_revision FROM tag_sessions WHERE id=?').get(id).public_revision;
}
function isDue(id) {
  return store.dueTags().some(record => record.id === id);
}
function economySnapshot() {
  return {
    players: database.db.prepare('SELECT discord_id,dp,xp,starter_deck FROM players ORDER BY discord_id').all(),
    cards: database.db.prepare('SELECT discord_id,card_key,quantity FROM player_cards ORDER BY discord_id,card_key').all(),
    grants: database.db.prepare('SELECT discord_id,starter_deck,catalog_version FROM starter_grants ORDER BY discord_id').all()
  };
}

test('a stale Discord publish cannot mark a newer lobby revision as published', () => {
  for (const id of ids) database.createPlayer(id, id);
  const beforeEconomy = economySnapshot();
  const lobby = store.createTagLobby(ids, 'm477-guild', 'm477-channel', 'classic-loan');
  store.setTagMessage(lobby.id, 'm477-message-v1', 'm477-channel');

  assert.equal(publishedRevision(lobby.id), -1, 'setting a Discord message invalidates the prior publish marker');
  assert.equal(isDue(lobby.id), true, 'an unpublished lobby must enter dueTags');
  store.markTagPublished(lobby.id, lobby.revision);
  assert.equal(publishedRevision(lobby.id), lobby.revision);
  assert.equal(isDue(lobby.id), false, 'the exact current revision is now published');

  const accepted = store.acceptTag(lobby.id, ids[1], lobby.guild, lobby.revision);
  assert.equal(accepted.revision, lobby.revision + 1);
  assert.equal(publishedRevision(lobby.id), lobby.revision);
  assert.equal(isDue(lobby.id), true, 'a new action revision must be queued for Discord refresh');

  store.markTagPublished(lobby.id, lobby.revision);
  assert.equal(publishedRevision(lobby.id), lobby.revision,
    'a late callback for the old revision must not overwrite the current publish marker');
  assert.equal(isDue(lobby.id), true, 'stale publication must not hide the newer revision');

  store.markTagPublished(lobby.id, accepted.revision);
  assert.equal(publishedRevision(lobby.id), accepted.revision);
  assert.equal(isDue(lobby.id), false, 'publishing the exact current revision clears the queue');

  store.setTagMessage(lobby.id, 'm477-message-v2', 'm477-channel');
  assert.equal(publishedRevision(lobby.id), -1, 'replacing the message invalidates the old revision marker');
  assert.equal(isDue(lobby.id), true);
  store.markTagPublished(lobby.id, accepted.revision);
  assert.equal(isDue(lobby.id), false);
  assert.deepEqual(economySnapshot(), beforeEconomy, 'Discord publication bookkeeping must not alter player inventory');
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
