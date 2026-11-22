'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { starterContents, cards } = require('../dist/cardCatalog');
const { engineCatalog, getPlayableCard } = require('../dist/effectRegistry');
const { tagLoanDeck } = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const { tagNormalCardIds } = tag;
const { RULES_PROFILE, rulesFor } = require('../dist/rulesProfile');

const deck20 = starterContents.warrior.flatMap(card => Array(card.quantity).fill(card.id));
const deck30 = tagLoanDeck();
const additionalMainId = tagNormalCardIds.find(id => !deck30.includes(id));
assert.ok(additionalMainId, 'the enabled Normal pool must contain an eleventh distinct Main Deck card');
const deck31 = [...deck30, additionalMainId];
const fusionIds = [...new Set(engineCatalog
  .filter(card => card.kind === 'monster' && card.monsterType === 'fusion' && getPlayableCard(card.id))
  .map(card => card.id))];
assert.ok(fusionIds.length >= 6, 'the enabled engine catalog must provide six distinct Fusion identities');
const extra5 = fusionIds.slice(0, 5);
const extra6 = fusionIds.slice(0, 6);

function players(main, extra=[]) {
  return [0, 1, 2, 3].map(seat => ({
    id: 'm486-seat-' + seat,
    name: 'Seat ' + seat,
    cards: [...main],
    extra: [...extra]
  }));
}

function assertFieldShape(state, expectedExtra) {
  tag.assertTagDuel(state);
  assert.equal(state.members.length, 4);
  assert.equal(state.core.players.length, 2);
  for (const team of state.core.players) {
    assert.ok(team.monsters.length <= 3, 'each team may occupy at most three Monster Zones');
    assert.ok(team.backrow.length <= 3, 'each team may occupy at most three Spell/Trap Zones');
    assert.equal(team.field, null, 'Field Zone is separate from the three backrow slots');
    assert.equal(team.extra.length, expectedExtra);
  }
  const inventory = tag.tagInventory(state);
  assert.equal(new Set(inventory.map(card => card.uid)).size, inventory.length);
}

test('classic 2v2 accepts 20/30 Main Decks and exactly five enabled Fusions while preserving 3+3+Field layout', () => {
  assert.equal(RULES_PROFILE.mainDeckMin, 20);
  assert.equal(RULES_PROFILE.mainDeckMax, 30);
  assert.equal(RULES_PROFILE.extraDeckMax, 5);
  assert.equal(RULES_PROFILE.copiesPerCard, 3);
  assert.equal(RULES_PROFILE.monsterZones, 3);
  assert.equal(RULES_PROFILE.spellTrapZones, 3);
  assert.equal(RULES_PROFILE.handLimit, 6);

  const minimum = tag.createTagDuel(players(deck20), { classic: true, seed: 'm486-minimum', first: 0 });
  assert.equal(minimum.core.players[0].deck.length + minimum.core.players[0].hand.length, 20);
  assert.equal(rulesFor(minimum.core).handLimit, 6);
  assertFieldShape(minimum, 0);

  const maximum = tag.createTagDuel(players(deck30, extra5), { classic: true, seed: 'm486-maximum', first: 0 });
  assert.equal(maximum.core.players[0].deck.length + maximum.core.players[0].hand.length, 30);
  assertFieldShape(maximum, 5);
});

test('classic 2v2 rejects 19/31 Main Deck cards and a sixth distinct Fusion', () => {
  assert.equal(deck20.length, 20);
  assert.equal(deck30.length, 30);
  assert.equal(deck31.length, 31);
  assert.equal(extra5.length, 5);
  assert.equal(extra6.length, 6);
  assert.throws(
    () => tag.createTagDuel(players(deck30.slice(0, 19)), { classic: true, seed: 'm486-19' }),
    /20|30|Deck|baralho/i
  );
  assert.throws(
    () => tag.createTagDuel(players(deck31), { classic: true, seed: 'm486-31' }),
    /20|30|Deck|baralho/i
  );
  assert.throws(
    () => tag.createTagDuel(players(deck30, extra6), { classic: true, seed: 'm486-extra-6' }),
    /Deck Adicional: máximo de 5 cartas/
  );
});
