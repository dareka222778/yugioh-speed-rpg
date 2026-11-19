const { test } = require('node:test');
const assert = require('node:assert/strict');

const { typedDiscardTargets, payTypedDiscardCost } = require('../dist/typedDiscard.js');
const { fieldCardTargets, returnFieldCardToOwner } = require('../dist/fieldCardReturn.js');
const { createTokenGroup } = require('../dist/tokens.js');
const {
  ABYSS_SOLDIER_ID,
  ABYSS_SOLDIER_PLAN,
  abyssSoldierDiscardTargets,
  abyssSoldierFieldTargets,
  payAbyssSoldierDiscard,
  resolveAbyssSoldierTarget,
} = require('../dist/abyssSoldier.js');

function player(id) {
  return {
    id, name: id, lp: 8000, deck: [], hand: [], monsters: [], backrow: [],
    grave: [], extra: [], banished: [], field: null, summoned: false,
  };
}
function state() {
  return {
    players: [player('team0'), player('team1')],
    turn: 1,
    teamRotation: {
      version: 1,
      cursor: 0,
      active: [0, 1],
      reserves: {
        2: { hand: [], deck: [], extra: [] },
        3: { hand: [], deck: [], extra: [] },
      },
    },
    cardLifetimes: {},
  };
}
const infos = new Map([
  ['water', { kind: 'monster', attribute: 'WATER' }],
  ['fire', { kind: 'monster', attribute: 'FIRE' }],
  ['water-spell', { kind: 'spell', attribute: 'WATER' }],
  ['normal', { kind: 'monster', attribute: 'EARTH' }],
  ['fusion', { kind: 'monster', attribute: 'DARK', fusion: { materials: [] } }],
  ['spell', { kind: 'spell' }],
  ['trap', { kind: 'trap' }],
  ['field', { kind: 'spell', field: true }],
]);
const getCard = id => infos.get(id);

test('Abyss Soldier plan preserves the once-per-turn WATER discard and field-card target', () => {
  assert.equal(ABYSS_SOLDIER_ID, '18318842');
  assert.equal(ABYSS_SOLDIER_PLAN.oncePerTurn, true);
  assert.deepEqual(ABYSS_SOLDIER_PLAN.cost, {
    kind: 'discard', count: 1, cardKind: 'monster', attribute: 'WATER',
  });
  assert.deepEqual(ABYSS_SOLDIER_PLAN.target, { kind: 'fieldCard', count: 1 });
});

test('typed discard candidates include only WATER monsters in the active representative hand', () => {
  const s = state();
  s.players[0].hand = [
    { uid: 'm0:water', id: 'water' },
    { uid: 'm0:fire', id: 'fire' },
    { uid: 'm0:spell', id: 'water-spell' },
  ];
  s.teamRotation.reserves[2].hand.push({ uid: 'm2:partner-water', id: 'water' });
  const targets = typedDiscardTargets(s, 0, 'WATER', getCard);
  assert.deepEqual(targets.map(value => value.uid), ['m0:water']);
});

test('Abyss Soldier adapter exposes the same filtered cost candidates', () => {
  const s = state();
  s.players[0].hand = [
    { uid: 'm0:water', id: 'water' },
    { uid: 'm0:normal', id: 'normal' },
  ];
  assert.deepEqual(abyssSoldierDiscardTargets(s, 0, getCard).map(value => value.uid), ['m0:water']);
});

test('typed discard pays by UID, preserves identity and sends the cost to the shared Graveyard', () => {
  const s = state();
  s.players[0].hand = [{ uid: 'm0:water', id: 'water' }];
  const paid = payTypedDiscardCost(s, 0, 'm0:water', 'WATER', getCard);
  assert.deepEqual(paid, { uid: 'm0:water', id: 'water' });
  assert.deepEqual(s.players[0].hand, []);
  assert.deepEqual(s.players[0].grave, [{ uid: 'm0:water', id: 'water' }]);
  assert.equal(s.cardLifetimes['m0:water'].zone, 'grave');
  assert.equal(s.cardLifetimes['m0:water'].epoch, 1);
});

test('Abyss Soldier adapter pays only the WATER monster selected from the active hand', () => {
  const s = state();
  s.players[0].hand = [{ uid: 'm0:water', id: 'water' }];
  s.teamRotation.reserves[2].hand.push({ uid: 'm2:partner-water', id: 'water' });
  payAbyssSoldierDiscard(s, 0, 'm0:water', getCard);
  assert.deepEqual(s.players[0].grave.map(value => value.uid), ['m0:water']);
  assert.deepEqual(s.teamRotation.reserves[2].hand.map(value => value.uid), ['m2:partner-water']);
});

test('typed discard rejects non-WATER monsters and WATER non-monsters without mutation', () => {
  const s = state();
  s.players[0].hand = [
    { uid: 'm0:fire', id: 'fire' },
    { uid: 'm0:spell', id: 'water-spell' },
  ];
  const before = structuredClone(s);
  assert.throws(() => payTypedDiscardCost(s, 0, 'm0:fire', 'WATER', getCard), /Custo inválido/);
  assert.throws(() => payTypedDiscardCost(s, 0, 'm0:spell', 'WATER', getCard), /Custo inválido/);
  assert.deepEqual(s.players[0].hand, before.players[0].hand);
  assert.deepEqual(s.players[0].grave, []);
});

test('typed discard cannot spend an inactive partner private hand card', () => {
  const s = state();
  s.teamRotation.reserves[2].hand.push({ uid: 'm2:partner-water', id: 'water' });
  assert.deepEqual(typedDiscardTargets(s, 0, 'WATER', getCard), []);
  assert.throws(() => payTypedDiscardCost(s, 0, 'm2:partner-water', 'WATER', getCard), /Custo inválido/);
});

test('field-card target enumeration covers both teams and all three field zones', () => {
  const s = state();
  s.players[0].monsters.push({ uid: 'm0:monster', id: 'normal', owner: 0, faceUp: true, position: 'atk', entered: 1, changed: 1, attacked: 0, atkBoost: 0, defBoost: 0 });
  s.players[0].backrow.push({ uid: 'm2:spell', id: 'spell', setTurn: 1, faceUp: false });
  s.players[1].monsters.push({ uid: 'm3:stolen', id: 'normal', owner: 0, faceUp: true, position: 'atk', entered: 1, changed: 1, attacked: 0, atkBoost: 0, defBoost: 0 });
  s.players[1].backrow.push({ uid: 'm3:trap', id: 'trap', setTurn: 1, faceUp: false });
  s.players[1].field = { uid: 'm3:field', id: 'field', setTurn: 1, faceUp: true, resolved: true };
  assert.deepEqual(
    fieldCardTargets(s).map(value => [value.uid, value.controller, value.zone]),
    [
      ['m0:monster', 0, 'monsters'],
      ['m2:spell', 0, 'backrow'],
      ['m3:stolen', 1, 'monsters'],
      ['m3:trap', 1, 'backrow'],
      ['m3:field', 1, 'field'],
    ],
  );
  assert.equal(abyssSoldierFieldTargets(s).length, 5);
});

test("ordinary monster returns to its physical owner's active hand", () => {
  const s = state();
  s.players[0].monsters.push({ uid: 'm0:monster', id: 'normal', owner: 0, faceUp: true, position: 'atk', entered: 1, changed: 1, attacked: 0, atkBoost: 0, defBoost: 0 });
  const result = returnFieldCardToOwner(s, 'm0:monster', getCard);
  assert.equal(result.destination, 'hand');
  assert.deepEqual(s.players[0].hand, [{ uid: 'm0:monster', id: 'normal' }]);
  assert.deepEqual(s.players[0].monsters, []);
});

test("stolen monster returns to the inactive physical owner's reserved hand", () => {
  const s = state();
  s.players[1].monsters.push({ uid: 'm2:stolen', id: 'normal', owner: 0, faceUp: true, position: 'atk', entered: 1, changed: 1, attacked: 0, atkBoost: 0, defBoost: 0 });
  const result = resolveAbyssSoldierTarget(s, 'm2:stolen', getCard);
  assert.equal(result.controller, 1);
  assert.equal(result.ownerTeam, 0);
  assert.deepEqual(s.teamRotation.reserves[2].hand, [{ uid: 'm2:stolen', id: 'normal' }]);
  assert.deepEqual(s.players[1].monsters, []);
});

test("Fusion monster returns to its physical owner's Extra Deck", () => {
  const s = state();
  s.players[1].monsters.push({ uid: 'm3:fusion', id: 'fusion', owner: 1, faceUp: true, position: 'atk', entered: 1, changed: 1, attacked: 0, atkBoost: 0, defBoost: 0 });
  const result = returnFieldCardToOwner(s, 'm3:fusion', getCard);
  assert.equal(result.destination, 'extra');
  assert.deepEqual(s.teamRotation.reserves[3].extra, [{ uid: 'm3:fusion', id: 'fusion' }]);
});

test('backrow card returns to the physical owner private hand', () => {
  const s = state();
  s.players[0].backrow.push({ uid: 'm2:spell', id: 'spell', setTurn: 1, faceUp: false });
  const result = returnFieldCardToOwner(s, 'm2:spell', getCard);
  assert.equal(result.destination, 'hand');
  assert.deepEqual(s.teamRotation.reserves[2].hand, [{ uid: 'm2:spell', id: 'spell' }]);
});

test('Field Spell returns to the physical owner private hand', () => {
  const s = state();
  s.players[1].field = { uid: 'm3:field', id: 'field', setTurn: 1, faceUp: true, resolved: true };
  const result = returnFieldCardToOwner(s, 'm3:field', getCard);
  assert.equal(result.destination, 'hand');
  assert.deepEqual(s.teamRotation.reserves[3].hand, [{ uid: 'm3:field', id: 'field' }]);
  assert.equal(s.players[1].field, null);
});

test('invalid field target is rejected before any zone is mutated', () => {
  const s = state();
  s.players[0].monsters.push({ uid: 'm0:monster', id: 'normal', owner: 0, faceUp: true, position: 'atk', entered: 1, changed: 1, attacked: 0, atkBoost: 0, defBoost: 0 });
  const before = structuredClone(s);
  assert.throws(() => returnFieldCardToOwner(s, 'missing', getCard), /não está no campo/);
  assert.deepEqual(s.players[0].monsters, before.players[0].monsters);
  assert.deepEqual(s.players[0].hand, before.players[0].hand);
});


test('a Token targeted by Abyss Soldier leaves the field and is recorded as returned', () => {
  const s = state();
  s.resolverVersion = 'engine-v9';
  const [token] = createTokenGroup(s, 0, 1, 'def');
  const result = returnFieldCardToOwner(s, token.uid, getCard);
  assert.equal(result.destination, 'removed');
  assert.deepEqual(s.players[0].monsters, []);
  assert.equal(s.tokenLedger.entries[0].status, 'removed');
  assert.deepEqual(s.tokenLedger.events[1], { kind: 'removed', uid: token.uid, cause: 'return' });
});
