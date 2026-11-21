const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  THREE_HUMP_LACOODA_ID,
  prepareThreeHumpLacooda,
  payThreeHumpLacoodaCost,
  resolveThreeHumpLacoodaDraw,
} = require('../dist/threeHumpLacooda.js');

const card = (uid, ownerSeat, id = THREE_HUMP_LACOODA_ID, faceUp = true) => ({
  uid, id, ownerSeat, faceUp, controllerTeam: 0,
});
const ref = (uid, ownerSeat, id = 'deck-card') => ({ uid, id, ownerSeat });

function makeState({ activeSeat = 2, activeTeam = 0, deckCount = 4, handCount = 0 } = {}) {
  return {
    field: [
      card('m0:lacooda-a', 0),
      card('m2:lacooda-b', 2),
      card('m0:lacooda-c', 0),
    ],
    grave: [],
    seats: {
      0: { deck: Array.from({ length: 4 }, (_, i) => ref('m0:d' + i, 0)), hand: [] },
      1: { deck: Array.from({ length: 4 }, (_, i) => ref('m1:d' + i, 1)), hand: [] },
      2: {
        deck: Array.from({ length: deckCount }, (_, i) => ref('m2:d' + i, 2)),
        hand: Array.from({ length: handCount }, (_, i) => ref('m2:h' + i, 2)),
      },
      3: { deck: Array.from({ length: 4 }, (_, i) => ref('m3:d' + i, 3)), hand: [] },
    },
    activeSeat, activeTeam,
  };
}
function snapshot(state) { return structuredClone(state); }
function prepareAndPay(state, selected = ['m2:lacooda-b', 'm0:lacooda-c']) {
  const activation = prepareThreeHumpLacooda(state, 'm0:lacooda-a');
  assert.ok(activation);
  return { activation, paid: payThreeHumpLacoodaCost(state, activation, selected) };
}

test('requires three face-up copies on the controlling team field', () => {
  const state = makeState();
  const activation = prepareThreeHumpLacooda(state, 'm0:lacooda-a');
  assert.deepEqual(activation.eligibleUids, ['m0:lacooda-a', 'm2:lacooda-b', 'm0:lacooda-c']);
});
test('shared field may contain physical copies owned by both teammates', () => {
  const state = makeState();
  const activation = prepareThreeHumpLacooda(state, 'm2:lacooda-b');
  assert.deepEqual(activation.eligibleUids.map(uid => uid.startsWith('m2:') ? 2 : 0), [0, 2, 0]);
});
test('activating copy may be one of the two Tributes', () => {
  const state = makeState();
  const { paid } = prepareAndPay(state, ['m0:lacooda-a', 'm2:lacooda-b']);
  assert.ok(paid);
  assert.deepEqual(state.field.map(c => c.uid), ['m0:lacooda-c']);
  assert.deepEqual(state.grave.map(c => c.uid), ['m0:lacooda-a', 'm2:lacooda-b']);
});
test('activating copy may remain while the other two are Tributed', () => {
  const state = makeState();
  const { paid } = prepareAndPay(state, ['m2:lacooda-b', 'm0:lacooda-c']);
  assert.ok(paid);
  assert.deepEqual(state.field.map(c => c.uid), ['m0:lacooda-a']);
  assert.deepEqual(state.grave.map(c => c.uid), ['m2:lacooda-b', 'm0:lacooda-c']);
});
test('two face-up copies are insufficient', () => {
  const state = makeState(); state.field.pop();
  assert.equal(prepareThreeHumpLacooda(state, 'm0:lacooda-a'), null);
});
test('a face-down third copy does not satisfy activation', () => {
  const state = makeState(); state.field[2] = card('m0:lacooda-c', 0, THREE_HUMP_LACOODA_ID, false);
  assert.equal(prepareThreeHumpLacooda(state, 'm0:lacooda-a'), null);
});
test('source must be a face-up 3-Hump Lacooda', () => {
  const state = makeState();
  assert.equal(prepareThreeHumpLacooda(state, 'm9:missing'), null);
  state.field[0] = card('m0:lacooda-a', 0, 'other-monster', true);
  assert.equal(prepareThreeHumpLacooda(state, 'm0:lacooda-a'), null);
});
test('fewer than three cards in active physical Deck prevents activation', () => {
  const state = makeState({ deckCount: 2 });
  assert.equal(prepareThreeHumpLacooda(state, 'm0:lacooda-a'), null);
});
test('exactly two selected UIDs must come from activation candidates', () => {
  const state = makeState();
  const activation = prepareThreeHumpLacooda(state, 'm0:lacooda-a');
  const before = snapshot(state);
  assert.equal(payThreeHumpLacoodaCost(state, activation, ['m0:lacooda-a']), null);
  assert.equal(payThreeHumpLacoodaCost(state, activation, ['m0:lacooda-a', 'm2:lacooda-b', 'm0:lacooda-c']), null);
  assert.equal(payThreeHumpLacoodaCost(state, activation, ['m0:lacooda-a', 'm9:other']), null);
  assert.deepEqual(state, before);
});
test('duplicate selected UIDs cannot pay the Tribute cost', () => {
  const state = makeState();
  const activation = prepareThreeHumpLacooda(state, 'm0:lacooda-a');
  const before = snapshot(state);
  assert.equal(payThreeHumpLacoodaCost(state, activation, ['m0:lacooda-a', 'm0:lacooda-a']), null);
  assert.deepEqual(state, before);
});
test('draws three from active seat Deck, not partner or opponent Decks', () => {
  const state = makeState();
  const { paid } = prepareAndPay(state); assert.ok(paid);
  const activeTop = [...state.seats[2].deck.slice(0, 3)];
  const other = { 0: state.seats[0].deck.map(c => c.uid), 1: state.seats[1].deck.map(c => c.uid), 3: state.seats[3].deck.map(c => c.uid) };
  const result = resolveThreeHumpLacoodaDraw(state, paid);
  assert.equal(result.activeSeat, 2);
  assert.deepEqual(result.drawn, activeTop);
  assert.deepEqual(state.seats[2].hand.slice(-3), activeTop);
  assert.deepEqual(state.seats[0].deck.map(c => c.uid), other[0]);
  assert.deepEqual(state.seats[1].deck.map(c => c.uid), other[1]);
  assert.deepEqual(state.seats[3].deck.map(c => c.uid), other[3]);
});
test('drawn cards retain physical owner and original object identity', () => {
  const state = makeState(); const first = state.seats[2].deck[0];
  const { paid } = prepareAndPay(state);
  const result = resolveThreeHumpLacoodaDraw(state, paid);
  assert.equal(result.drawn[0], first);
  assert.equal(result.drawn[0].ownerSeat, 2);
  assert.equal(state.seats[2].hand.at(-3), first);
});
test('hand may exceed six during effect; discard is deferred to End Phase', () => {
  const state = makeState({ handCount: 6 });
  const { paid } = prepareAndPay(state);
  const result = resolveThreeHumpLacoodaDraw(state, paid);
  assert.equal(result.handSizeAfter, 9);
  assert.equal(state.seats[2].hand.length, 9);
  assert.equal(result.drawn.length, 3);
});
test('effect negation does not refund Tributes and does not draw', () => {
  const state = makeState(); const { paid } = prepareAndPay(state);
  const deckBefore = state.seats[2].deck.map(c => c.uid);
  const result = resolveThreeHumpLacoodaDraw(state, paid, true);
  assert.equal(result.negated, true);
  assert.equal(result.costPaid, true);
  assert.deepEqual(result.drawn, []);
  assert.deepEqual(state.seats[2].deck.map(c => c.uid), deckBefore);
  assert.equal(state.field.length, 1);
  assert.equal(state.grave.length, 2);
});
test('if another chain link reduces Deck below three, draws what remains and reports deck-out', () => {
  const state = makeState(); const { paid } = prepareAndPay(state);
  state.seats[2].deck.splice(2);
  const result = resolveThreeHumpLacoodaDraw(state, paid);
  assert.equal(result.drawn.length, 2);
  assert.equal(result.deckOut, true);
  assert.equal(state.seats[2].deck.length, 0);
});
test('physical draw seat is captured at activation, not silently changed by partner rotation', () => {
  const state = makeState(); const { paid } = prepareAndPay(state);
  state.activeSeat = 0;
  const seat2Before = state.seats[2].deck.slice(0, 3);
  const seat0Before = state.seats[0].deck.map(c => c.uid);
  const result = resolveThreeHumpLacoodaDraw(state, paid);
  assert.equal(result.activeSeat, 2);
  assert.deepEqual(result.drawn, seat2Before);
  assert.deepEqual(state.seats[0].deck.map(c => c.uid), seat0Before);
});
test('a paid cost can resolve only once', () => {
  const state = makeState(); const { paid } = prepareAndPay(state);
  const first = resolveThreeHumpLacoodaDraw(state, paid);
  const handAfterFirst = state.seats[2].hand.map(c => c.uid);
  const second = resolveThreeHumpLacoodaDraw(state, paid);
  assert.ok(first); assert.equal(second, null);
  assert.deepEqual(state.seats[2].hand.map(c => c.uid), handAfterFirst);
});
test('duplicate physical UIDs across any team zone fail closed before mutation', () => {
  const state = makeState(); state.seats[2].deck.push(ref('m0:lacooda-a', 2));
  const before = snapshot(state);
  assert.throws(() => prepareThreeHumpLacooda(state, 'm0:lacooda-a'), /duplicate physical UID/);
  assert.deepEqual(state, before);
});
test('private Deck cards must retain the owner seat of that Deck', () => {
  const state = makeState(); state.seats[2].deck[0] = ref('m0:wrong-owner', 0);
  assert.throws(() => prepareThreeHumpLacooda(state, 'm0:lacooda-a'), /owned by another physical seat/);
});
test('active seat must belong to the field controller team', () => {
  const state = makeState({ activeSeat: 2, activeTeam: 1 });
  assert.throws(() => prepareThreeHumpLacooda(state, 'm0:lacooda-a'), /does not belong to the controlling team/);
});
test('only the controlling team shared field is accepted', () => {
  const state = makeState(); state.field[1] = { ...state.field[1], controllerTeam: 1 };
  assert.throws(() => prepareThreeHumpLacooda(state, 'm0:lacooda-a'), /only this team controlled Monster Zones/);
});
test('shared Graveyard retains original physical owners of Tributed cards', () => {
  const state = makeState(); const { paid } = prepareAndPay(state);
  assert.ok(paid);
  assert.deepEqual(state.grave.map(c => c.ownerSeat), [2, 0]);
});
test('a changed field cannot partially pay a stale Tribute menu', () => {
  const state = makeState(); const activation = prepareThreeHumpLacooda(state, 'm0:lacooda-a');
  state.field.pop(); const before = snapshot(state);
  assert.equal(payThreeHumpLacoodaCost(state, activation, ['m2:lacooda-b', 'm0:lacooda-c']), null);
  assert.deepEqual(state, before);
});
