'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm466-tag-deck-boundaries-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const decks = require('../dist/decks');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const ui = require('../dist/tagUI');
const { getCard } = require('../dist/collection');
const { enabledCardIds, getPlayableCard } = require('../dist/effectRegistry');
const { rulesCardName } = require('../dist/cardIdentity');
const { rulesFor } = require('../dist/rulesProfile');
const { validateDiscordPayload } = require('../dist/discordPayload');
const db = database.db;

function setupOwnedDeck(id, starter) {
  database.createPlayer(id, id);
  assert.equal(database.chooseStarterDeck(id, starter), true);
  const opened = decks.openDeck(id, 1);
  assert.equal(opened.errors.length, 0);
  const active = decks.activateDeck(id, 1);
  assert.equal(active.active, 1);
  return decks.openDeck(id, 1);
}

function addOwnedDeckCard(owner, cardId) {
  assert.ok(getCard(cardId));
  assert.ok(getPlayableCard(cardId));
  db.prepare('INSERT INTO player_cards(discord_id,card_key,quantity) VALUES(?,?,1) ON CONFLICT(discord_id,card_key) DO UPDATE SET quantity=quantity+1').run(owner, cardId);
  db.prepare('INSERT INTO deck_cards(discord_id,slot,card_key,quantity) VALUES(?,1,?,1)').run(owner, cardId);
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

function deckLoadout(id) {
  const deck = decks.openDeck(id, 1);
  assert.equal(deck.errors.length, 0);
  const main = deck.items
    .filter(item => !getCard(item.card_key)?.fusion)
    .flatMap(item => Array(item.quantity).fill(item.card_key));
  const extra = deck.items
    .filter(item => getCard(item.card_key)?.fusion)
    .flatMap(item => Array(item.quantity).fill(item.card_key));
  return {
    player: { id, name: id, cards: main, extra },
    main: deck.total,
    extra: deck.extraTotal,
    ids: new Set([...main, ...extra])
  };
}

function physicalSeat(state, seat) {
  const team = seat % 2;
  return state.active[team] === seat ? state.core.players[team] : state.reserves[seat];
}

function assertOwnerRules(state) {
  const rules = rulesFor(state.core);
  assert.deepEqual([
    rules.mainDeckMin,
    rules.mainDeckMax,
    rules.handLimit,
    rules.handCheck,
    rules.monsterZones,
    rules.spellTrapZones,
    rules.extraDeckMax
  ], [20, 30, 6, 'end', 3, 3, 5]);
  for (const team of state.core.players) {
    assert.ok(team.monsters.length <= 3);
    assert.ok(team.backrow.length <= 3);
    assert.ok((team.extra ?? []).length <= 5);
    assert.ok(Object.hasOwn(team, 'field'));
  }
}

test('classic-owned lobby rejects 19/31 Main Deck and 6 Extra Deck, then accepts exact 20/30 and 5 boundaries', () => {
  const ids = ['m466-boundary-0', 'm466-boundary-1', 'm466-boundary-2', 'm466-boundary-3'];
  setupOwnedDeck(ids[0], 'warrior');
  setupOwnedDeck(ids[1], 'warrior');
  setupOwnedDeck(ids[2], 'spellcaster');
  setupOwnedDeck(ids[3], 'dragon');

  // Seat 1: make the active Main Deck invalid at 19 cards while keeping the
  // collection intact. The lobby must reject consent and roll back deactivation.
  const reduced = db.prepare('SELECT card_key,quantity FROM deck_cards WHERE discord_id=? AND slot=1 AND quantity>1 ORDER BY card_key LIMIT 1').get(ids[1]);
  assert.ok(reduced);
  db.prepare('UPDATE deck_cards SET quantity=quantity-1 WHERE discord_id=? AND slot=1 AND card_key=?')
    .run(ids[1], reduced.card_key);

  // Seat 2: add eleven distinct, owned, playable non-Fusion cards to reach 31.
  const seat2Deck = decks.openDeck(ids[2], 1);
  const existingIds = new Set(seat2Deck.items.map(item => item.card_key));
  const usedNames = new Set(seat2Deck.items.map(item => rulesCardName(getCard(item.card_key))));
  const additions = [];
  for (const id of enabledCardIds) {
    const card = getCard(id);
    if (!card || card.fusion || existingIds.has(id) || !getPlayableCard(id)) continue;
    const name = rulesCardName(card);
    if (usedNames.has(name)) continue;
    additions.push(id);
    existingIds.add(id);
    usedNames.add(name);
    if (additions.length === 11) break;
  }
  assert.equal(additions.length, 11, 'catalog must provide eleven distinct playable Main Deck cards');
  for (const id of additions) addOwnedDeckCard(ids[2], id);

  // Seat 3: add six distinct playable Fusions to exceed the Extra Deck limit.
  const extraIds = enabledCardIds.filter(id => getCard(id)?.fusion && getPlayableCard(id)).slice(0, 6);
  assert.equal(extraIds.length, 6, 'catalog must provide six playable Fusion cards');
  for (const id of extraIds) addOwnedDeckCard(ids[3], id);

  let record = store.createTagLobby(ids, 'm466-guild', 'm466-channel', 'classic-owned');
  assert.equal(record.status, 'lobby');
  assert.equal(record.revision, 0);
  const invalidSeats = [
    { seat: 1, label: '19-card Main Deck' },
    { seat: 2, label: '31-card Main Deck' },
    { seat: 3, label: '6-card Extra Deck' }
  ];

  for (const item of invalidSeats) {
    const owner = ids[item.seat];
    const before = snapshotPlayerDeckData();
    assert.throws(
      () => store.acceptTag(record.id, owner, record.guild, record.revision),
      /O deck ativo ficou inválido/
    );
    record = store.getTag(record.id);
    assert.equal(record.revision, 0, item.label + ' must not advance lobby revision');
    assert.equal(record.members[item.seat].accepted, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE owner=?').get(owner).n, 0,
      item.label + ' must not acquire a seat lock');
    assert.equal(db.prepare('SELECT active FROM decks WHERE discord_id=? AND slot=1').get(owner).active, 1,
      item.label + ' rejection must roll back automatic deck deactivation');
    assert.equal(snapshotPlayerDeckData(), before,
      item.label + ' rejection must not mutate player, collection, grant or deck rows');
  }

  // Repair each fixture to the exact accepted boundary: 20, 30 and 5.
  db.prepare('UPDATE deck_cards SET quantity=quantity+1 WHERE discord_id=? AND slot=1 AND card_key=?')
    .run(ids[1], reduced.card_key);
  db.prepare('DELETE FROM deck_cards WHERE discord_id=? AND slot=1 AND card_key=?')
    .run(ids[2], additions[10]);
  db.prepare('DELETE FROM deck_cards WHERE discord_id=? AND slot=1 AND card_key=?')
    .run(ids[3], extraIds[5]);
  for (const id of ids.slice(1)) {
    db.prepare('UPDATE decks SET revision=revision+1 WHERE discord_id=? AND slot=1').run(id);
    const deck = decks.openDeck(id, 1);
    assert.equal(deck.active, 1);
    assert.equal(deck.errors.length, 0);
  }

  const beforeMatch = snapshotPlayerDeckData();
  for (const id of ids.slice(1)) record = store.acceptTag(record.id, id, record.guild, record.revision);
  assert.equal(record.status, 'playing');
  assert.equal(record.state.mode, 'tag-classic');

  const expected = ids.map(deckLoadout);
  assert.deepEqual(expected.map(item => item.main), [20, 20, 30, 20]);
  assert.deepEqual(expected.map(item => item.extra), [0, 0, 0, 5]);
  const inventory = tag.tagInventory(record.state);
  assert.equal(inventory.length, 95);
  assert.equal(new Set(inventory.map(card => card.uid)).size, inventory.length);

  for (let seat = 0; seat < 4; seat++) {
    const held = physicalSeat(record.state, seat);
    const refs = [...held.deck, ...held.hand, ...(held.extra ?? [])];
    assert.ok(refs.every(card => card.uid.startsWith('m' + seat + ':')));
    assert.ok(refs.every(card => expected[seat].ids.has(card.id)));
    assert.equal(held.deck.length + held.hand.length, expected[seat].main);
    assert.equal((held.extra ?? []).length, expected[seat].extra);
  }
  assertOwnerRules(record.state);
  assert.equal(snapshotPlayerDeckData(), beforeMatch,
    'a valid TagDuel start must not grant, consume or rewrite the four source decks');

  const publicPayload = ui.tagPublicMessage(record);
  validateDiscordPayload(publicPayload);
  const publicText = JSON.stringify(publicPayload);
  for (const id of ids) {
    for (const card of tag.tagMemberHand(record.state, id)) {
      assert.equal(publicText.includes(card.uid), false, 'public board must not expose a private hand UID');
    }
    validateDiscordPayload(ui.tagPrivateMessage(record, id));
  }
});

after(() => {
  if (db.open) db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
