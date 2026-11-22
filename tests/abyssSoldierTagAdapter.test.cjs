'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  ABYSS_SOLDIER_TAG_ADAPTER,
  abyssSoldierTagCostTargets,
  payAbyssSoldierTagCost,
  abyssSoldierTagTargetViews,
  resolveAbyssSoldierTagTarget,
} = require('../dist/abyssSoldierTagAdapter.js');
const { createTokenGroup } = require('../dist/tokens.js');

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
  ['normal', { kind: 'monster', attribute: 'EARTH' }],
  ['fusion', { kind: 'monster', attribute: 'DARK', fusion: { materials: [] } }],
  ['secret-trap', { kind: 'trap' }],
  ['secret-monster', { kind: 'monster', attribute: 'DARK' }],
  ['faceup-spell', { kind: 'spell' }],
]);
const getCard = id => infos.get(id);
const getName = id => ({
  water: 'Water Spirit',
  normal: 'Goblin',
  fusion: 'Fusion',
  'secret-trap': 'Secret Trap',
  'faceup-spell': 'Face-up Spell',
}[id]);

test('Abyss Soldier TagDuel contract retains once-per-turn WATER discard and field target semantics', () => {
  assert.equal(ABYSS_SOLDIER_TAG_ADAPTER.cardId, '18318842');
  assert.equal(ABYSS_SOLDIER_TAG_ADAPTER.oncePerTurn, true);
  assert.equal(ABYSS_SOLDIER_TAG_ADAPTER.activationWindow, 'main');
  assert.deepEqual(ABYSS_SOLDIER_TAG_ADAPTER.cost, {
    kind: 'discard', count: 1, cardKind: 'monster', attribute: 'WATER',
  });
  assert.deepEqual(ABYSS_SOLDIER_TAG_ADAPTER.target.zones, ['monsters', 'backrow', 'field']);
});

test('cost candidates and payment use only the active physical representative hand', () => {
  const s = state();
  s.players[0].hand = [
    { uid: 'm0:water', id: 'water' },
    { uid: 'm0:fire', id: 'fire' },
  ];
  s.teamRotation.reserves[2].hand.push({ uid: 'm2:partner-water', id: 'water' });

  assert.deepEqual(
    abyssSoldierTagCostTargets(s, 0, 0, getCard).map(card => card.uid),
    ['m0:water'],
  );
  const paid = payAbyssSoldierTagCost(s, 0, 0, 'm0:water', getCard);
  assert.equal(paid.uid, 'm0:water');
  assert.deepEqual(s.players[0].hand.map(card => card.uid), ['m0:fire']);
  assert.deepEqual(s.players[0].grave.map(card => card.uid), ['m0:water']);
  assert.deepEqual(s.teamRotation.reserves[2].hand.map(card => card.uid), ['m2:partner-water']);
});

test('inactive partner cannot pay the cost or resolve the effect as representative', () => {
  const s = state();
  s.players[0].hand = [{ uid: 'm0:water', id: 'water' }];
  s.players[1].monsters.push({
    uid: 'm1:target', id: 'normal', owner: 1, faceUp: true, position: 'atk',
    entered: 1, changed: 1, attacked: 0, atkBoost: 0, defBoost: 0,
  });
  const before = structuredClone(s);
  assert.throws(
    () => abyssSoldierTagCostTargets(s, 0, 2, getCard),
    /representante ativo/,
  );
  assert.throws(
    () => payAbyssSoldierTagCost(s, 0, 2, 'm0:water', getCard),
    /representante ativo/,
  );
  assert.throws(
    () => resolveAbyssSoldierTagTarget(s, 0, 2, 'm1:target', getCard),
    /representante ativo/,
  );
  assert.deepEqual(s, before);
});

test('face-down field targets are redacted and their names are never requested', () => {
  const s = state();
  s.players[1].backrow.push({ uid: 'm3:hidden-trap', id: 'secret-trap', setTurn: 1, faceUp: false });
  s.players[1].monsters.push({ uid: 'm3:hidden-monster', id: 'secret-monster', owner: 1, faceUp: false, position: 'def', entered: 1, changed: 1, attacked: 0, atkBoost: 0, defBoost: 0 });
  s.players[0].field = { uid: 'm0:hidden-field', id: 'secret-trap', setTurn: 1, faceUp: false };
  s.players[0].backrow.push({ uid: 'm0:faceup-spell', id: 'faceup-spell', setTurn: 1, faceUp: true });
  const lookedUp = [];
  const views = abyssSoldierTagTargetViews(s, id => {
    lookedUp.push(id);
    return getName(id);
  });

  const hidden = views.find(view => view.uid === 'm3:hidden-trap');
  assert.deepEqual(hidden, {
    uid: 'm3:hidden-trap',
    label: 'Carta oculta',
    controller: 1,
    ownerTeam: 1,
    zone: 'backrow',
    visibility: 'hidden',
  });
  assert.equal(Object.hasOwn(hidden, 'id'), false);
  assert.equal(lookedUp.includes('secret-trap'), false);

  const hiddenMonster = views.find(view => view.uid === 'm3:hidden-monster');
  assert.equal(hiddenMonster.label, 'Carta oculta');
  assert.equal(hiddenMonster.visibility, 'hidden');
  assert.equal(Object.hasOwn(hiddenMonster, 'id'), false);
  assert.equal(lookedUp.includes('secret-monster'), false);

  const hiddenField = views.find(view => view.uid === 'm0:hidden-field');
  assert.equal(hiddenField.label, 'Carta oculta');
  assert.equal(hiddenField.visibility, 'hidden');
  assert.equal(Object.hasOwn(hiddenField, 'id'), false);

  const visible = views.find(view => view.uid === 'm0:faceup-spell');
  assert.equal(visible.label, 'Face-up Spell');
  assert.equal(visible.visibility, 'public');
  assert.deepEqual(lookedUp, ['faceup-spell']);
});

test("a stolen monster returns to the inactive physical owner's private hand", () => {
  const s = state();
  s.players[1].monsters.push({
    uid: 'm2:stolen', id: 'normal', owner: 0, faceUp: true, position: 'atk',
    entered: 1, changed: 1, attacked: 0, atkBoost: 0, defBoost: 0,
  });
  const result = resolveAbyssSoldierTagTarget(s, 0, 0, 'm2:stolen', getCard);
  assert.equal(result.controller, 1);
  assert.equal(result.ownerTeam, 0);
  assert.equal(result.destination, 'hand');
  assert.deepEqual(s.teamRotation.reserves[2].hand, [{ uid: 'm2:stolen', id: 'normal' }]);
  assert.deepEqual(s.players[1].monsters, []);
});

test("a Fusion monster returns to its physical owner's Extra Deck", () => {
  const s = state();
  s.players[1].monsters.push({
    uid: 'm3:fusion', id: 'fusion', owner: 1, faceUp: true, position: 'atk',
    entered: 1, changed: 1, attacked: 0, atkBoost: 0, defBoost: 0,
  });
  const result = resolveAbyssSoldierTagTarget(s, 0, 0, 'm3:fusion', getCard);
  assert.equal(result.destination, 'extra');
  assert.deepEqual(s.teamRotation.reserves[3].extra, [{ uid: 'm3:fusion', id: 'fusion' }]);
});

test('a Token leaves the field instead of entering a private hand', () => {
  const s = state();
  s.resolverVersion = 'engine-v9';
  const [token] = createTokenGroup(s, 0, 1, 'def');
  const result = resolveAbyssSoldierTagTarget(s, 0, 0, token.uid, getCard);
  assert.equal(result.destination, 'removed');
  assert.deepEqual(s.players[0].monsters, []);
  assert.equal(s.tokenLedger.entries[0].status, 'removed');
});

test('a stale or missing target is rejected without mutating field zones', () => {
  const s = state();
  s.players[0].monsters.push({
    uid: 'm0:target', id: 'normal', owner: 0, faceUp: true, position: 'atk',
    entered: 1, changed: 1, attacked: 0, atkBoost: 0, defBoost: 0,
  });
  const before = structuredClone(s);
  assert.throws(
    () => resolveAbyssSoldierTagTarget(s, 0, 0, 'missing', getCard),
    /não está no campo/,
  );
  assert.deepEqual(s, before);
});
