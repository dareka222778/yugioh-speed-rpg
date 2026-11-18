const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  searchZoneIssues,
  searchZoneTargets,
  resolveSearchZoneSelection,
} = require('../dist/searchZoneRules.js');

const definitions = new Map([
  ['trap-a', { id: 'trap-a', kind: 'trap' }],
  ['trap-b', { id: 'trap-b', kind: 'trap' }],
  ['field-a', { id: 'field-a', kind: 'spell', field: true }],
  ['spell-a', { id: 'spell-a', kind: 'spell', field: false }],
]);
const getCard = id => definitions.get(id);
const ref = (uid, id) => ({ uid, id });
const state = () => ({
  players: [
    {
      deck: [ref('m0:top', 'trap-a'), ref('m0:selected', 'trap-b'), ref('m0:bottom', 'trap-a'), ref('m0:field', 'field-a'), ref('m0:spell', 'spell-a')],
      grave: [ref('m0:grave', 'trap-a')],
      hand: [],
    },
    { deck: [], grave: [], hand: [] },
  ],
});

const catRule = {
  from: 'deck',
  filter: { kind: 'trap' },
  destination: 'deck-top',
  necrovalleyHandOverride: true,
};
const owlRule = {
  from: 'deck',
  filter: { kind: 'spell', field: true },
  destination: 'deck-top',
};

test('A Cat of Ill Omen rule accepts deck-top with a Necrovalley hand override', () => {
  assert.deepEqual(searchZoneIssues(catRule), []);
  const s = state();
  const targets = searchZoneTargets(s, 0, catRule, getCard);
  assert.deepEqual(targets.map(c => c.uid), ['m0:top', 'm0:selected', 'm0:bottom', 'm0:grave'].filter(uid => uid !== 'm0:grave'));
});

test('deck-top resolution places the selected Trap at index zero and does not shuffle', () => {
  const s = state();
  const before = s.players[0].deck.map(c => c.uid);
  const result = resolveSearchZoneSelection(s, 0, 'm0:selected', catRule, getCard, undefined, false);

  assert.ok(result);
  assert.equal(result.destination, 'deck-top');
  assert.equal(result.source, 'deck');
  assert.equal(result.shuffleDeck, false);
  assert.equal(s.players[0].deck[0].uid, 'm0:selected');
  assert.deepEqual(s.players[0].deck.slice(1).map(c => c.uid), before.filter(uid => uid !== 'm0:selected'));
  assert.deepEqual(s.players[0].hand, []);
});

test('face-up Necrovalley replaces the deck-top destination with a hand add', () => {
  const s = state();
  const before = s.players[0].deck.map(c => c.uid);
  const result = resolveSearchZoneSelection(s, 0, 'm0:selected', catRule, getCard, undefined, true);

  assert.ok(result);
  assert.equal(result.destination, 'hand');
  assert.equal(result.shuffleDeck, true);
  assert.deepEqual(s.players[0].hand.map(c => c.uid), ['m0:selected']);
  assert.deepEqual(s.players[0].deck.map(c => c.uid), before.filter(uid => uid !== 'm0:selected'));
});

test('An Owl of Luck filters Field Spells and places the chosen Field Spell on top', () => {
  const s = state();
  const targets = searchZoneTargets(s, 0, owlRule, getCard);
  assert.deepEqual(targets.map(c => c.uid), ['m0:field']);

  const result = resolveSearchZoneSelection(s, 0, 'm0:field', owlRule, getCard);
  assert.ok(result);
  assert.equal(result.destination, 'deck-top');
  assert.equal(result.shuffleDeck, false);
  assert.equal(s.players[0].deck[0].uid, 'm0:field');
  assert.ok(!s.players[0].hand.some(c => c.uid === 'm0:field'));
});

test('a card searched from the Graveyard can be placed on top without shuffling the Deck', () => {
  const s = state();
  const rule = { from: 'grave', filter: { kind: 'trap' }, destination: 'deck-top' };
  const result = resolveSearchZoneSelection(s, 0, 'm0:grave', rule, getCard);

  assert.ok(result);
  assert.equal(result.source, 'grave');
  assert.equal(result.destination, 'deck-top');
  assert.equal(result.shuffleDeck, false);
  assert.equal(s.players[0].deck[0].uid, 'm0:grave');
  assert.deepEqual(s.players[0].grave, []);
});

test('an ineligible or stale UID is rejected without mutating any zone', () => {
  const s = state();
  const snapshot = structuredClone(s.players[0]);
  assert.equal(resolveSearchZoneSelection(s, 0, 'm0:spell', catRule, getCard), null);
  assert.equal(resolveSearchZoneSelection(s, 0, 'm0:missing', catRule, getCard), null);
  assert.deepEqual(s.players[0], snapshot);
});

test('legacy search rules default to adding to hand and request a Deck shuffle', () => {
  const s = state();
  const rule = { from: 'deck', filter: { kind: 'trap' } };
  const result = resolveSearchZoneSelection(s, 0, 'm0:selected', rule, getCard);

  assert.ok(result);
  assert.equal(result.destination, 'hand');
  assert.equal(result.shuffleDeck, true);
  assert.deepEqual(s.players[0].hand.map(c => c.uid), ['m0:selected']);
});

test('duplicate physical UIDs across source zones are rejected', () => {
  const s = state();
  s.players[0].grave.push(ref('m0:selected', 'trap-b'));
  assert.throws(
    () => resolveSearchZoneSelection(s, 0, 'm0:selected', catRule, getCard),
    /more than one source zone/,
  );
});

test('invalid destination and invalid Necrovalley override combinations are rejected', () => {
  assert.deepEqual(searchZoneIssues({ from: 'deck', filter: { kind: 'trap' }, destination: 'grave' }), ['invalid-search-destination']);
  assert.deepEqual(searchZoneIssues({ from: 'deck', filter: { kind: 'trap' }, necrovalleyHandOverride: true }), ['invalid-search-destination']);
  assert.deepEqual(searchZoneIssues({ from: 'deck', filter: { kind: 'trap' }, destination: 'deck-top', necrovalleyHandOverride: true }), []);
});
