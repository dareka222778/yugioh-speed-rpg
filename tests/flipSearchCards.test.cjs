const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getFlipSearchDefinition,
  flipSearchTargets,
  resolveFlipSearchChoice,
} = require('../dist/flipSearchCards.js');
const { searchZoneIssues } = require('../dist/searchZoneRules.js');

const CAT = '24140059';
const OWL = '23927567';
const cards = new Map([
  ['trap-a', { id: 'trap-a', kind: 'trap' }],
  ['trap-b', { id: 'trap-b', kind: 'trap' }],
  ['field-a', { id: 'field-a', kind: 'spell', field: true }],
  ['field-b', { id: 'field-b', kind: 'spell', field: true }],
  ['spell-a', { id: 'spell-a', kind: 'spell', field: false }],
]);
const getCard = id => cards.get(id);
const ref = (uid, id) => ({ uid, id });

function makeState() {
  return {
    players: [
      {
        deck: [
          ref('m0:top-trap', 'trap-a'),
          ref('m0:selected-trap', 'trap-b'),
          ref('m0:field-spell', 'field-a'),
          ref('m0:normal-spell', 'spell-a'),
        ],
        grave: [],
        hand: [],
      },
      { deck: [], grave: [], hand: [] },
    ],
    teamRotation: {
      version: 1,
      cursor: 0,
      active: [0, 1],
      reserves: {
        2: { hand: [], deck: [ref('m2:private-trap', 'trap-a')], extra: [] },
        3: { hand: [], deck: [ref('m3:private-field', 'field-b')], extra: [] },
      },
    },
  };
}

function snapshot(state) {
  return structuredClone(state);
}

test('definitions pin mandatory FLIP timing and resolution-time selection for both cards', () => {
  const cat = getFlipSearchDefinition(CAT);
  const owl = getFlipSearchDefinition(OWL);

  assert.equal(cat.name, 'A Cat of Ill Omen');
  assert.equal(owl.name, 'An Owl of Luck');
  for (const definition of [cat, owl]) {
    assert.equal(definition.trigger, 'flip');
    assert.equal(definition.activation, 'mandatory');
    assert.equal(definition.selectionTiming, 'resolution');
    assert.deepEqual(searchZoneIssues(definition.rule), []);
    assert.equal(definition.rule.from, 'deck');
    assert.equal(definition.rule.destination, 'deck-top');
    assert.equal(definition.rule.necrovalleyHandOverride, true);
  }
});

test('A Cat of Ill Omen offers only Trap Cards from the active Deck', () => {
  const state = makeState();
  assert.deepEqual(
    flipSearchTargets(state, 0, CAT, getCard).map(card => card.uid),
    ['m0:top-trap', 'm0:selected-trap'],
  );
});

test('An Owl of Luck offers only Field Spell Cards, not ordinary Spells', () => {
  const state = makeState();
  assert.deepEqual(
    flipSearchTargets(state, 0, OWL, getCard).map(card => card.uid),
    ['m0:field-spell'],
  );
});

test('Cat places the selected Trap on top when Necrovalley is absent', () => {
  const state = makeState();
  const selected = state.players[0].deck[1];
  const before = state.players[0].deck.map(card => card.uid);
  const result = resolveFlipSearchChoice(state, 0, CAT, selected.uid, 'deck-top', false, getCard);

  assert.equal(result.destination, 'deck-top');
  assert.equal(result.shuffleDeck, false);
  assert.equal(result.card, selected);
  assert.deepEqual(state.players[0].deck.map(card => card.uid), [
    'm0:selected-trap', 'm0:top-trap', 'm0:field-spell', 'm0:normal-spell',
  ]);
  assert.deepEqual(state.players[0].deck.slice(1).map(card => card.uid), before.filter(uid => uid !== selected.uid));
  assert.deepEqual(state.players[0].hand, []);
});

test('Cat may add the selected Trap to hand when Necrovalley is face-up and that option is chosen', () => {
  const state = makeState();
  const selected = state.players[0].deck[1];
  const result = resolveFlipSearchChoice(state, 0, CAT, selected.uid, 'hand', true, getCard);

  assert.equal(result.destination, 'hand');
  assert.equal(result.shuffleDeck, true);
  assert.equal(result.card, selected);
  assert.deepEqual(state.players[0].hand, [selected]);
  assert.ok(!state.players[0].deck.some(card => card.uid === selected.uid));
});

test('the optional Necrovalley branch does not force Cat to add to hand', () => {
  const state = makeState();
  const selected = state.players[0].deck[1];
  const result = resolveFlipSearchChoice(state, 0, CAT, selected.uid, 'deck-top', true, getCard);

  assert.equal(result.destination, 'deck-top');
  assert.equal(result.shuffleDeck, false);
  assert.deepEqual(state.players[0].hand, []);
  assert.equal(state.players[0].deck[0], selected);
});

test('Owl may add a Field Spell to hand instead when Necrovalley is face-up', () => {
  const state = makeState();
  const selected = state.players[0].deck[2];
  const result = resolveFlipSearchChoice(state, 0, OWL, selected.uid, 'hand', true, getCard);

  assert.equal(result.destination, 'hand');
  assert.equal(result.shuffleDeck, true);
  assert.equal(result.card, selected);
  assert.deepEqual(state.players[0].hand, [selected]);
});

test('the optional Necrovalley branch also preserves Owl deck-top choice', () => {
  const state = makeState();
  const selected = state.players[0].deck[2];
  const result = resolveFlipSearchChoice(state, 0, OWL, selected.uid, 'deck-top', true, getCard);

  assert.equal(result.destination, 'deck-top');
  assert.equal(result.shuffleDeck, false);
  assert.deepEqual(state.players[0].hand, []);
  assert.equal(state.players[0].deck[0], selected);
});

test('hand is rejected when Necrovalley is not face-up at resolution and state is unchanged', () => {
  const state = makeState();
  const before = snapshot(state);

  assert.throws(
    () => resolveFlipSearchChoice(state, 0, CAT, 'm0:selected-trap', 'hand', false, getCard),
    /requires face-up Necrovalley/,
  );
  assert.deepEqual(state, before);
});

test('the resolution-time Necrovalley state controls the alternative, not an earlier activation snapshot', () => {
  const state = makeState();
  const selected = state.players[0].deck[1];

  assert.throws(
    () => resolveFlipSearchChoice(state, 0, CAT, selected.uid, 'hand', false, getCard),
    /requires face-up Necrovalley/,
  );
  const result = resolveFlipSearchChoice(state, 0, CAT, selected.uid, 'deck-top', false, getCard);
  assert.equal(result.destination, 'deck-top');
});

test('stale or ineligible UIDs do not move any card', () => {
  const state = makeState();
  const before = snapshot(state);

  assert.equal(resolveFlipSearchChoice(state, 0, CAT, 'm0:field-spell', 'deck-top', false, getCard), null);
  assert.equal(resolveFlipSearchChoice(state, 0, CAT, 'm0:missing', 'deck-top', false, getCard), null);
  assert.deepEqual(state, before);
});

test('no matching card is a legal no-op for the mandatory FLIP effect', () => {
  const state = makeState();
  state.players[0].deck = [ref('m0:only-spell', 'spell-a')];
  const before = snapshot(state);

  assert.deepEqual(flipSearchTargets(state, 0, CAT, getCard), []);
  assert.equal(resolveFlipSearchChoice(state, 0, CAT, 'm0:only-spell', 'deck-top', false, getCard), null);
  assert.deepEqual(state, before);
});

test('2v2 partner reserves are never searched or changed', () => {
  const state = makeState();
  const beforeSeat2 = snapshot(state.teamRotation.reserves[2]);
  const beforeSeat3 = snapshot(state.teamRotation.reserves[3]);

  const catTargets = flipSearchTargets(state, 0, CAT, getCard);
  const owlTargets = flipSearchTargets(state, 0, OWL, getCard);
  assert.ok(catTargets.every(card => !card.uid.startsWith('m2:')));
  assert.ok(owlTargets.every(card => !card.uid.startsWith('m3:')));
  assert.equal(resolveFlipSearchChoice(state, 0, CAT, 'm2:private-trap', 'deck-top', false, getCard), null);
  assert.equal(resolveFlipSearchChoice(state, 0, OWL, 'm3:private-field', 'deck-top', false, getCard), null);
  assert.deepEqual(state.teamRotation.reserves[2], beforeSeat2);
  assert.deepEqual(state.teamRotation.reserves[3], beforeSeat3);
});

test('the physical UID and original card object survive a hand or deck-top move', () => {
  const handState = makeState();
  const handCard = handState.players[0].deck[1];
  const handResult = resolveFlipSearchChoice(handState, 0, CAT, handCard.uid, 'hand', true, getCard);
  assert.equal(handResult.card, handCard);
  assert.equal(handResult.card.uid, 'm0:selected-trap');

  const topState = makeState();
  const topCard = topState.players[0].deck[2];
  const topResult = resolveFlipSearchChoice(topState, 0, OWL, topCard.uid, 'deck-top', false, getCard);
  assert.equal(topResult.card, topCard);
  assert.equal(topResult.card.uid, 'm0:field-spell');
  assert.equal(topState.players[0].deck[0], topCard);
});

test('duplicate physical UIDs across Deck and Graveyard fail closed', () => {
  const state = makeState();
  state.players[0].grave.push(ref('m0:selected-trap', 'trap-b'));

  assert.throws(
    () => resolveFlipSearchChoice(state, 0, CAT, 'm0:selected-trap', 'deck-top', false, getCard),
    /more than once in source zones/,
  );
});

test('duplicate physical UIDs inside the Deck fail closed', () => {
  const state = makeState();
  state.players[0].deck.push(ref('m0:selected-trap', 'trap-b'));

  assert.throws(
    () => resolveFlipSearchChoice(state, 0, CAT, 'm0:selected-trap', 'deck-top', false, getCard),
    /more than once in source zones/,
  );
});

test('invalid physical player index is rejected', () => {
  const state = makeState();
  assert.throws(
    () => flipSearchTargets(state, 2, CAT, getCard),
    /outside the physical player seats/,
  );
});

test('unknown card IDs cannot borrow another card search rule', () => {
  const state = makeState();
  assert.equal(getFlipSearchDefinition('00000000'), undefined);
  assert.deepEqual(flipSearchTargets(state, 0, '00000000', getCard), []);
  assert.equal(resolveFlipSearchChoice(state, 0, '00000000', 'm0:selected-trap', 'deck-top', false, getCard), null);
});

test('invalid destination values fail closed before mutation', () => {
  const state = makeState();
  const before = snapshot(state);

  assert.throws(
    () => resolveFlipSearchChoice(state, 0, CAT, 'm0:selected-trap', 'grave', false, getCard),
    /Invalid FLIP search destination choice/,
  );
  assert.deepEqual(state, before);
});
