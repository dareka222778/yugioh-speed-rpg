'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm467-tag-consent-snapshot-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const decks = require('../dist/decks');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const ui = require('../dist/tagUI');
const { getCard } = require('../dist/collection');
const { getPlayableCard } = require('../dist/effectRegistry');
const { rulesFor } = require('../dist/rulesProfile');
const { validateDiscordPayload } = require('../dist/discordPayload');
const db = database.db;

function setupOwnedDeck(id, starter) {
  database.createPlayer(id, id);
  assert.equal(database.chooseStarterDeck(id, starter), true);
  const deck = decks.openDeck(id, 1);
  assert.equal(deck.errors.length, 0);
  assert.equal(decks.activateDeck(id, 1).active, 1);
  return decks.openDeck(id, 1);
}

function addCollectionCard(owner, cardId) {
  assert.ok(getCard(cardId));
  assert.ok(getPlayableCard(cardId));
  db.prepare('INSERT INTO player_cards(discord_id,card_key,quantity) VALUES(?,?,1) ON CONFLICT(discord_id,card_key) DO UPDATE SET quantity=quantity+1')
    .run(owner, cardId);
}

function swapDeckCard(owner, removeId, addId) {
  addCollectionCard(owner, addId);
  const added = decks.changeDeck(owner, 1, addId, 1);
  assert.equal(added.errors.length, 0);
  const removed = decks.changeDeck(owner, 1, removeId, -1);
  assert.equal(removed.errors.length, 0);
  assert.equal(removed.total, 20);
  assert.equal(removed.active, 1);
  return decks.openDeck(owner, 1);
}

function deckLoadout(id) {
  const deck = decks.openDeck(id, 1);
  const main = deck.items.filter(item => !getCard(item.card_key)?.fusion)
    .flatMap(item => Array(item.quantity).fill(item.card_key));
  const extra = deck.items.filter(item => getCard(item.card_key)?.fusion)
    .flatMap(item => Array(item.quantity).fill(item.card_key));
  assert.equal(deck.errors.length, 0);
  assert.ok(main.length >= 20 && main.length <= 30);
  assert.ok(extra.length <= 5);
  return { main, extra };
}

function counts(ids) {
  const result = {};
  for (const id of ids) result[id] = (result[id] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function snapshotPlayerDeckData() {
  return JSON.stringify({
    players: db.prepare('SELECT discord_id,duelist_level,xp,dp,starter_deck FROM players ORDER BY discord_id').all(),
    cards: db.prepare('SELECT discord_id,card_key,quantity FROM player_cards ORDER BY discord_id,card_key').all(),
    grants: db.prepare('SELECT discord_id,starter_deck,catalog_version FROM starter_grants ORDER BY discord_id').all(),
    decks: db.prepare('SELECT discord_id,slot,name,revision,active FROM decks ORDER BY discord_id,slot').all(),
    deckCards: db.prepare('SELECT discord_id,slot,card_key,quantity FROM deck_cards ORDER BY discord_id,slot,card_key').all()
  });
}

function physicalSeat(state, seat) {
  const team = seat % 2;
  return state.active[team] === seat ? state.core.players[team] : state.reserves[seat];
}

test('classic-owned TagDuel snapshots each active deck at creation/consent time, not at later deck edits', () => {
  const ids = ['m467-snapshot-0', 'm467-snapshot-1', 'm467-snapshot-2', 'm467-snapshot-3'];
  setupOwnedDeck(ids[0], 'warrior');
  setupOwnedDeck(ids[1], 'spellcaster');
  setupOwnedDeck(ids[2], 'dragon');
  setupOwnedDeck(ids[3], 'warrior');

  // The host's deck is snapshotted when the lobby is created.
  let record = store.createTagLobby(ids, 'm467-guild', 'm467-channel', 'classic-owned');
  const hostSnapshot = counts(record.members[0].cards);
  assert.equal(hostSnapshot['91152256'], 2);
  assert.equal(hostSnapshot['93221206'] ?? 0, 0);
  swapDeckCard(ids[0], '91152256', '93221206');
  assert.equal(counts(deckLoadout(ids[0]).main)['93221206'], 1);

  // Seat 1 is snapshotted on acceptance. Its subsequent deck edit must not
  // rewrite the already-consented match loadout.
  record = store.acceptTag(record.id, ids[1], record.guild, record.revision);
  const seat1Snapshot = counts(record.members[1].cards);
  assert.equal(seat1Snapshot['93221206'], 2);
  assert.equal(seat1Snapshot['91152256'] ?? 0, 0);
  swapDeckCard(ids[1], '93221206', '91152256');

  // Seat 2 edits before consent, so the new composition is the one accepted.
  swapDeckCard(ids[2], '88819587', '93221206');
  record = store.acceptTag(record.id, ids[2], record.guild, record.revision);
  const seat2Snapshot = counts(record.members[2].cards);
  assert.equal(seat2Snapshot['93221206'], 1);
  assert.equal(seat2Snapshot['88819587'], 1);

  // Seat 3 accepts without an intervening edit.
  record = store.getTag(record.id);
  const seat3Current = deckLoadout(ids[3]);
  record = store.acceptTag(record.id, ids[3], record.guild, record.revision);
  assert.equal(record.status, 'playing');
  assert.equal(record.state.mode, 'tag-classic');

  const snapshots = record.members.map(member => counts([
    ...member.cards,
    ...(member.extra ?? [])
  ]));
  assert.deepEqual(snapshots[0], hostSnapshot);
  assert.deepEqual(snapshots[1], seat1Snapshot);
  assert.deepEqual(snapshots[2], seat2Snapshot);
  assert.deepEqual(snapshots[3], counts([...seat3Current.main, ...seat3Current.extra]));

  // The currently saved decks for seats 0 and 1 intentionally differ from
  // their consent snapshots; seats 2 and 3 match their latest consent state.
  assert.notDeepEqual(counts([...deckLoadout(ids[0]).main, ...deckLoadout(ids[0]).extra]), snapshots[0]);
  assert.notDeepEqual(counts([...deckLoadout(ids[1]).main, ...deckLoadout(ids[1]).extra]), snapshots[1]);
  assert.deepEqual(counts([...deckLoadout(ids[2]).main, ...deckLoadout(ids[2]).extra]), snapshots[2]);
  assert.deepEqual(counts([...deckLoadout(ids[3]).main, ...deckLoadout(ids[3]).extra]), snapshots[3]);

  const beforeMatchStart = snapshotPlayerDeckData();
  const inventory = tag.tagInventory(record.state);
  assert.equal(inventory.length, 80);
  assert.equal(new Set(inventory.map(card => card.uid)).size, inventory.length);

  for (let seat = 0; seat < 4; seat++) {
    const held = physicalSeat(record.state, seat);
    const physical = [...held.deck, ...held.hand, ...(held.extra ?? [])];
    assert.deepEqual(counts(physical.map(card => card.id)), snapshots[seat]);
    assert.ok(physical.every(card => card.uid.startsWith('m' + seat + ':')));
    assert.deepEqual(
      tag.tagMemberHand(record.state, ids[seat]).map(card => card.uid).sort(),
      held.hand.map(card => card.uid).sort()
    );
  }

  const rules = rulesFor(record.state.core);
  assert.deepEqual([
    rules.mainDeckMin, rules.mainDeckMax, rules.handLimit, rules.handCheck,
    rules.monsterZones, rules.spellTrapZones, rules.extraDeckMax
  ], [20, 30, 6, 'end', 3, 3, 5]);
  for (const team of record.state.core.players) {
    assert.ok(team.monsters.length <= 3);
    assert.ok(team.backrow.length <= 3);
    assert.ok((team.extra ?? []).length <= 5);
    assert.ok(Object.hasOwn(team, 'field'));
  }
  assert.equal(snapshotPlayerDeckData(), beforeMatchStart,
    'TagDuel creation must not grant, consume or rewrite player collections or deck definitions');

  const publicPayload = ui.tagPublicMessage(record);
  validateDiscordPayload(publicPayload);
  const publicText = JSON.stringify(publicPayload);
  for (const id of ids) {
    for (const card of tag.tagMemberHand(record.state, id)) {
      assert.equal(publicText.includes(card.uid), false);
    }
    validateDiscordPayload(ui.tagPrivateMessage(record, id));
  }
});

after(() => {
  if (db.open) db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
