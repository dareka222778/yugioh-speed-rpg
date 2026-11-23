'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm465-owned-deck-seat-matrix-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const decks = require('../dist/decks');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const ui = require('../dist/tagUI');
const { getCard } = require('../dist/collection');
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
  const main = deck.items
    .filter(item => !getCard(item.card_key)?.fusion)
    .flatMap(item => Array(item.quantity).fill(item.card_key));
  const extra = deck.items
    .filter(item => getCard(item.card_key)?.fusion)
    .flatMap(item => Array(item.quantity).fill(item.card_key));
  assert.ok(deck.total >= 20 && deck.total <= 30);
  assert.ok(deck.extraTotal <= 5);
  assert.equal(main.length, deck.total);
  assert.equal(extra.length, deck.extraTotal);
  return {
    player: { id, name: id, cards: main, extra },
    expected: {
      ids: new Set([...main, ...extra]),
      total: main.length + extra.length
    }
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

function assertPhysicalInventory(state, ids, expectedBySeat) {
  tag.assertTagDuel(state);
  const inventory = tag.tagInventory(state);
  assert.equal(new Set(inventory.map(card => card.uid)).size, inventory.length);
  assert.equal(inventory.length, expectedBySeat.reduce((sum, item) => sum + item.total, 0));

  for (let seat = 0; seat < 4; seat++) {
    const held = physicalSeat(state, seat);
    assert.ok(held, 'physical seat ' + seat + ' must have a deck/hand record');
    const cards = [...held.deck, ...held.hand, ...(held.extra ?? [])];
    assert.equal(cards.length, expectedBySeat[seat].total);
    assert.ok(cards.every(card => card.uid.startsWith('m' + seat + ':')),
      'all cards held by physical seat ' + seat + ' must retain its UID prefix');
    assert.ok(cards.every(card => expectedBySeat[seat].ids.has(card.id)),
      'physical seat ' + seat + ' must retain only cards from its own active deck');

    const privateHand = tag.tagMemberHand(state, ids[seat]);
    assert.deepEqual(
      privateHand.map(card => card.uid).sort(),
      held.hand.map(card => card.uid).sort()
    );
    assert.ok(privateHand.every(card => card.uid.startsWith('m' + seat + ':')));
  }
}

test('classic-owned lobby rejects a member without an active deck atomically and starts without TagDuel inventory mutation', () => {
  const ids = ['m465-owned-0', 'm465-owned-1', 'm465-owned-2', 'm465-owned-3'];
  setupOwnedDeck(ids[0], 'warrior');
  database.createPlayer(ids[1], ids[1]);
  setupOwnedDeck(ids[2], 'dragon');
  setupOwnedDeck(ids[3], 'spellcaster');

  let record = store.createTagLobby(ids, 'm465-guild', 'm465-channel', 'classic-owned');
  assert.equal(record.status, 'lobby');
  assert.equal(record.members[0].accepted, true);
  assert.equal(record.members[1].accepted, false);

  const beforeRejectedConsent = snapshotPlayerDeckData();
  assert.throws(
    () => store.acceptTag(record.id, ids[1], record.guild, record.revision),
    /Ative um deck válido primeiro/
  );

  record = store.getTag(record.id);
  assert.equal(record.revision, 0);
  assert.equal(record.members[1].accepted, false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE owner=?').get(ids[1]).n, 0);
  assert.equal(snapshotPlayerDeckData(), beforeRejectedConsent,
    'failed consent must roll back the temporary deck row and every player/deck/inventory write');

  setupOwnedDeck(ids[1], 'warrior');
  const beforeMatch = snapshotPlayerDeckData();
  for (const id of ids.slice(1)) record = store.acceptTag(record.id, id, record.guild, record.revision);

  assert.equal(record.status, 'playing');
  assert.equal(record.state.mode, 'tag-classic');
  assert.equal(record.members.every(member => member.accepted), true);
  assert.equal(tag.tagInventory(record.state).length, 80);
  assert.equal(snapshotPlayerDeckData(), beforeMatch,
    'starting a classic-owned TagDuel must not grant, consume, or rewrite player inventory/decks');

  const publicPayload = ui.tagPublicMessage(record);
  validateDiscordPayload(publicPayload);
  const publicText = JSON.stringify(publicPayload);
  for (let seat = 0; seat < 4; seat++) {
    const hand = tag.tagMemberHand(record.state, ids[seat]);
    assert.ok(hand.every(card => card.uid.startsWith('m' + seat + ':')));
    for (const card of hand) assert.equal(publicText.includes(card.uid), false);
    validateDiscordPayload(ui.tagPrivateMessage(record, ids[seat]));
  }
});

test('all four initial-seat rotations draw from the incoming physical member deck and preserve every owned deck', () => {
  const ids = ['m465-rotation-0', 'm465-rotation-1', 'm465-rotation-2', 'm465-rotation-3'];
  const starterTypes = ['warrior', 'spellcaster', 'dragon', 'warrior'];
  const loadouts = ids.map((id, seat) => {
    setupOwnedDeck(id, starterTypes[seat]);
    return deckLoadout(id);
  });
  const players = loadouts.map(item => item.player);
  const expectedBySeat = loadouts.map(item => item.expected);
  const baseline = snapshotPlayerDeckData();

  for (const first of [0, 1, 2, 3]) {
    let state = tag.createTagDuel(players, {
      classic: true,
      first,
      seed: 'm465-owned-seat-rotation-' + first
    });
    assertOwnerRules(state);
    assertPhysicalInventory(state, ids, expectedBySeat);
    const inventoryBefore = tag.tagInventory(state).map(card => card.uid).sort();

    for (let turn = 0; turn < 4; turn++) {
      const outgoing = tag.tagDecisionMember(state);
      const outgoingSeat = ids.indexOf(outgoing.id);
      assert.equal(outgoingSeat, (first + turn) % 4);
      const incomingSeat = (outgoingSeat + 1) % 4;
      const incomingDeck = physicalSeat(state, incomingSeat).deck;
      const expectedDrawUid = incomingDeck[0]?.uid;
      assert.ok(expectedDrawUid, 'incoming physical member must have a card to draw');

      const handsBefore = ids.map(id =>
        tag.tagMemberHand(state, id).map(card => card.uid).sort()
      );
      const end = tag.tagActions(state, outgoing.id).find(action => action.kind === 'end');
      assert.ok(end, 'outgoing physical member must have a legal End Phase action');
      state = tag.stepTagDuel(state, outgoing.id, end);

      for (let guard = 0; state.core.phase === 'response'; guard++) {
        assert.ok(guard < 20, 'response chain must terminate');
        const responder = tag.tagDecisionMember(state);
        const pass = tag.tagActions(state, responder.id).find(action => action.kind === 'pass');
        assert.ok(pass, 'an empty response window must be passable');
        state = tag.stepTagDuel(state, responder.id, pass);
      }

      assert.equal(tag.tagDecisionMember(state).id, ids[incomingSeat]);
      const handsAfter = ids.map(id =>
        tag.tagMemberHand(state, id).map(card => card.uid).sort()
      );
      for (let seat = 0; seat < 4; seat++) {
        if (seat === incomingSeat) {
          assert.equal(handsAfter[seat].length, handsBefore[seat].length + 1);
          assert.ok(handsAfter[seat].includes(expectedDrawUid),
            'the draw must come from physical seat ' + incomingSeat + ', not its teammate');
        } else {
          assert.deepEqual(handsAfter[seat], handsBefore[seat],
            'only the incoming physical member hand may change on this draw');
        }
      }

      assert.deepEqual(tag.tagInventory(state).map(card => card.uid).sort(), inventoryBefore);
      assertPhysicalInventory(state, ids, expectedBySeat);
      assertOwnerRules(state);
    }
  }

  assert.equal(snapshotPlayerDeckData(), baseline,
    'creating and rotating TagDuel states must not mutate the four source deck records or collections');
});

after(() => {
  if (db.open) db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
