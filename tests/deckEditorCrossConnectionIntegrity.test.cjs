'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm488-deck-cross-connection-'));
const databasePath = path.join(folder, 'isolated.sqlite');
process.env.DATABASE_PATH = databasePath;
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const databaseA = require('../dist/database');
const decksA = require('../dist/decks');
const { starterContents } = require('../dist/cardCatalog');
const { getPlayableCard } = require('../dist/effectRegistry');

function loadSecondConnection() {
  const databaseModule = require.resolve('../dist/database');
  const decksModule = require.resolve('../dist/decks');
  delete require.cache[decksModule];
  delete require.cache[databaseModule];
  const database = require('../dist/database');
  const decks = require('../dist/decks');
  return { database, decks };
}

const second = loadSecondConnection();
const databaseB = second.database;
const decksB = second.decks;
const starter = starterContents.warrior;

function seedOwner(owner) {
  databaseA.createPlayer(owner, owner);
  assert.equal(starter.reduce((sum, item) => sum + item.quantity, 0), 20);
  const insert = databaseA.db.prepare(
    'INSERT INTO player_cards(discord_id, card_key, quantity) VALUES(?,?,?)'
  );
  for (const item of starter) {
    assert.ok(getPlayableCard(item.id), 'fixture card must already be enabled: ' + item.id);
    insert.run(owner, item.id, item.quantity);
  }
}

function fillDeck(api, owner, slot) {
  let deck = api.openDeck(owner, slot);
  for (const item of starter) {
    deck = api.changeDeck(owner, slot, item.id, item.quantity, deck.revision);
  }
  assert.equal(deck.total, 20);
  assert.deepEqual(deck.errors, []);
  return deck;
}

function snapshot(owner) {
  return {
    player: databaseA.db.prepare('SELECT * FROM players WHERE discord_id=?').get(owner),
    collection: databaseA.db.prepare(
      'SELECT card_key, quantity FROM player_cards WHERE discord_id=? ORDER BY card_key'
    ).all(owner),
    grants: databaseA.db.prepare(
      'SELECT * FROM starter_grants WHERE discord_id=?'
    ).all(owner),
    decks: databaseA.db.prepare(
      'SELECT * FROM decks WHERE discord_id=? ORDER BY slot'
    ).all(owner),
    deckCards: databaseA.db.prepare(
      'SELECT slot, card_key, quantity FROM deck_cards WHERE discord_id=? ORDER BY slot, card_key'
    ).all(owner)
  };
}

test('a second SQLite connection rejects stale Deck edits, renames and activations without any side effect', () => {
  const owner = 'm488-cross-connection-stale';
  seedOwner(owner);
  const filled = fillDeck(decksA, owner, 1);
  const active = decksA.activateDeck(owner, 1, filled.revision);
  assert.equal(active.active, 1);

  // Simulate a second bot worker holding a Discord panel rendered at this revision.
  const stalePanel = decksB.openDeck(owner, 1);
  assert.equal(stalePanel.revision, active.revision);
  assert.equal(stalePanel.active, 1);

  const target = active.items.find(item => item.quantity > 0);
  assert.ok(target);
  const changed = decksA.changeDeck(owner, 1, target.card_key, -1, active.revision);
  assert.equal(changed.total, 19);
  assert.equal(changed.active, 0);

  const beforeStaleActions = snapshot(owner);
  assert.throws(
    () => decksB.changeDeck(owner, 1, target.card_key, -1, stalePanel.revision),
    /Esse painel ficou antigo/
  );
  assert.throws(
    () => decksB.renameDeck(owner, 1, 'Nome obsoleto', stalePanel.revision),
    /Esse painel ficou antigo/
  );
  assert.throws(
    () => decksB.activateDeck(owner, 1, stalePanel.revision),
    /Esse painel ficou antigo/
  );

  assert.deepEqual(snapshot(owner), beforeStaleActions,
    'all stale actions must preserve player, collection, grants, deck rows and card rows');
  assert.equal(
    databaseB.db.prepare('SELECT revision FROM decks WHERE discord_id=? AND slot=1').get(owner).revision,
    changed.revision,
    'the second connection must observe the committed revision'
  );
  assert.equal(databaseA.db.prepare(
    'SELECT COUNT(*) AS n FROM starter_grants WHERE discord_id=?'
  ).get(owner).n, 0, 'the isolated fixture must not create starter grants');
});

test('activating another slot from a second connection preserves the one-active-deck invariant', () => {
  const owner = 'm488-cross-connection-active';
  seedOwner(owner);
  const inventoryBefore = databaseA.getCollection(owner);
  const first = fillDeck(decksA, owner, 1);
  const secondDeck = fillDeck(decksB, owner, 2);

  const activeFirst = decksA.activateDeck(owner, 1, first.revision);
  assert.equal(activeFirst.active, 1);
  const activeSecond = decksB.activateDeck(owner, 2, secondDeck.revision);
  assert.equal(activeSecond.active, 1);

  assert.equal(decksA.openDeck(owner, 1).active, 0);
  assert.equal(decksA.openDeck(owner, 2).active, 1);
  assert.equal(databaseA.db.prepare(
    'SELECT COUNT(*) AS n FROM decks WHERE discord_id=? AND active=1'
  ).get(owner).n, 1);
  assert.deepEqual(databaseA.getCollection(owner), inventoryBefore,
    'Deck slots may share owned cards; editing never consumes the collection');
  assert.equal(databaseA.db.prepare(
    'SELECT COUNT(*) AS n FROM starter_grants WHERE discord_id=?'
  ).get(owner).n, 0);
});

after(() => {
  if (databaseB.db.open) databaseB.db.close();
  if (databaseA.db.open) databaseA.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
