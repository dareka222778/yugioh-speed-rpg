'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm487-deck-editor-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const { starterContents } = require('../dist/cardCatalog');
const { getPlayableCard } = require('../dist/effectRegistry');
const { openDeck, changeDeck, activateDeck, renameDeck } = require('../dist/decks');
const { deckMessage, deckCardMessage, getDeckCardIndex } = require('../dist/deckUI');
const { validateDiscordPayload } = require('../dist/discordPayload');

function seedOwner(owner, starterKey) {
  database.createPlayer(owner, owner);
  const rows = starterContents[starterKey];
  assert.ok(Array.isArray(rows) && rows.reduce((sum, item) => sum + item.quantity, 0) === 20);
  for (const item of rows) {
    assert.ok(getPlayableCard(item.id), 'fixture card must already be enabled: ' + item.id);
    database.db.prepare(
      'INSERT INTO player_cards(discord_id, card_key, quantity) VALUES(?,?,?)'
    ).run(owner, item.id, item.quantity);
  }
}

function fillDeck(owner, slot, starterKey = 'warrior') {
  let deck = openDeck(owner, slot);
  for (const item of starterContents[starterKey]) {
    deck = changeDeck(owner, slot, item.id, item.quantity, deck.revision);
  }
  assert.equal(deck.total, 20);
  assert.deepEqual(deck.errors, []);
  return deck;
}

function snapshot(owner) {
  return {
    player: database.db.prepare('SELECT * FROM players WHERE discord_id=?').get(owner),
    cards: database.db.prepare(
      'SELECT card_key, quantity FROM player_cards WHERE discord_id=? ORDER BY card_key'
    ).all(owner),
    grants: database.db.prepare(
      'SELECT * FROM starter_grants WHERE discord_id=? ORDER BY discord_id'
    ).all(owner),
    decks: database.db.prepare(
      'SELECT * FROM decks WHERE discord_id=? ORDER BY slot'
    ).all(owner),
    deckCards: database.db.prepare(
      'SELECT slot, card_key, quantity FROM deck_cards WHERE discord_id=? ORDER BY slot, card_key'
    ).all(owner)
  };
}

function activeCount(owner) {
  return database.db.prepare(
    'SELECT COUNT(*) AS n FROM decks WHERE discord_id=? AND active=1'
  ).get(owner).n;
}

function componentIds(payload) {
  return (payload.components ?? []).flatMap(row =>
    row.toJSON().components.map(component => component.custom_id).filter(Boolean)
  );
}

test('stale Discord revisions cannot edit, rename or reactivate a deck', () => {
  const owner = 'm487-stale-owner';
  seedOwner(owner, 'warrior');
  const filled = fillDeck(owner, 1);
  const active = activateDeck(owner, 1, filled.revision);
  assert.equal(active.active, 1);
  assert.equal(active.total, 20);
  assert.ok(active.revision > filled.revision);

  const before = snapshot(owner);
  const staleRevision = filled.revision;
  const cardId = starterContents.warrior[0].id;

  assert.throws(
    () => changeDeck(owner, 1, cardId, 1, staleRevision),
    /Esse painel ficou antigo/
  );
  assert.throws(
    () => renameDeck(owner, 1, 'Nome vindo de painel antigo', staleRevision),
    /Esse painel ficou antigo/
  );
  assert.throws(
    () => activateDeck(owner, 1, staleRevision),
    /Esse painel ficou antigo/
  );

  assert.deepEqual(snapshot(owner), before,
    'stale actions must not change revision, active slot, deck rows or collection');
  assert.equal(activeCount(owner), 1);
});

test('editing an active deck below twenty Main Deck cards deactivates only that slot', () => {
  const owner = 'm487-invalidated-owner';
  seedOwner(owner, 'warrior');
  const filled = fillDeck(owner, 1);
  const active = activateDeck(owner, 1, filled.revision);
  const inventoryBefore = database.getCollection(owner);
  const oneCopy = starterContents.warrior.find(item => item.quantity === 1);
  assert.ok(oneCopy, 'fixture must contain a single-copy card');

  const edited = changeDeck(owner, 1, oneCopy.id, -1, active.revision);
  assert.equal(edited.total, 19);
  assert.ok(edited.errors.some(error => error.includes('Use 20 a 30 cartas')));
  assert.equal(edited.active, 0);
  assert.equal(activeCount(owner), 0);
  assert.deepEqual(database.getCollection(owner), inventoryBefore,
    'removing a card from a Deck must not consume collection inventory');
});

test('only one of three Deck slots can be active and an invalid slot cannot displace it', () => {
  const owner = 'm487-active-slot-owner';
  seedOwner(owner, 'warrior');

  const first = activateDeck(owner, 1, fillDeck(owner, 1).revision);
  assert.equal(first.active, 1);

  const secondFilled = fillDeck(owner, 2);
  const second = activateDeck(owner, 2, secondFilled.revision);
  assert.equal(second.active, 1);
  assert.equal(openDeck(owner, 1).active, 0);
  assert.equal(activeCount(owner), 1);

  openDeck(owner, 3);
  const before = snapshot(owner);
  assert.throws(() => activateDeck(owner, 3), /Deck inválido/);
  assert.deepEqual(snapshot(owner), before,
    'failed activation must leave the previously active Deck and all slots unchanged');
  assert.equal(openDeck(owner, 2).active, 1);
  assert.equal(openDeck(owner, 3).active, 0);
  assert.equal(activeCount(owner), 1);
  assert.throws(() => openDeck(owner, 4), /Escolha um espaço de 1 a 3/);
});

test('Deck Discord panels are owner-bound and never expose another player collection', () => {
  const ownerA = 'm487-ui-owner-a';
  const ownerB = 'm487-ui-owner-b';
  seedOwner(ownerA, 'warrior');
  seedOwner(ownerB, 'spellcaster');
  const inventoryA = database.getCollection(ownerA);
  const inventoryB = database.getCollection(ownerB);
  const idsA = new Set(inventoryA.map(item => item.card_key));
  const onlyB = starterContents.spellcaster.find(item => !idsA.has(item.id));
  assert.ok(onlyB, 'the second fixture must contain at least one card absent from owner A');

  const panelA = deckMessage(ownerA, 1);
  const panelB = deckMessage(ownerB, 1);
  validateDiscordPayload(panelA);
  validateDiscordPayload(panelB);

  const customA = componentIds(panelA);
  const customB = componentIds(panelB);
  assert.ok(customA.length > 0 && customB.length > 0);
  assert.ok(customA.every(id => id.split(':')[2] === ownerA),
    'every A control must be bound to A');
  assert.ok(customB.every(id => id.split(':')[2] === ownerB),
    'every B control must be bound to B');
  assert.equal(JSON.stringify(panelA).includes(onlyB.id), false,
    'A public/private editor payload must not contain B-only card identity');
  assert.throws(
    () => getDeckCardIndex(ownerA, 1, onlyB.id),
    /não pertence à sua coleção/
  );

  const ownIndex = getDeckCardIndex(ownerB, 1, onlyB.id);
  const { cardId, ...cardPanel } = deckCardMessage(ownerB, 1, ownIndex);
  assert.equal(cardId, onlyB.id);
  validateDiscordPayload(cardPanel);
  assert.equal(JSON.stringify(cardPanel).includes(ownerA), false);

  assert.deepEqual(database.getCollection(ownerA), inventoryA);
  assert.deepEqual(database.getCollection(ownerB), inventoryB);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM starter_grants').get().n, 0,
    'the isolated fixtures must not create starter grants');
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
