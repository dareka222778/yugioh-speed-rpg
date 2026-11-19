const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  applyAquaSpiritPositionChange,
  canChangeBattlePosition,
} = require('../dist/battlePositionLock.js');
const {
  executePositionChange,
  positionTargets,
} = require('../dist/positionOperations.js');

const makeMonster = (uid, position = 'atk', extra = {}) => ({
  uid,
  id: '15025844',
  faceUp: true,
  position,
  entered: 1,
  changed: 0,
  attacked: 0,
  atkBoost: 0,
  defBoost: 0,
  ...extra,
});

const makeState = (turn, own = [], opposing = []) => ({
  turn,
  players: [
    { monsters: own, backrow: [], field: null, hand: [], grave: [], deck: [] },
    { monsters: opposing, backrow: [], field: null, hand: [], grave: [], deck: [] },
  ],
});

test('an unlocked monster can change battle position', () => {
  assert.equal(canChangeBattlePosition(makeMonster('m1:open'), 5), true);
});

test('a position lock includes the recorded turn and expires on the next turn', () => {
  const target = makeMonster('m1:locked', 'atk', { positionLockedThrough: 5 });

  assert.equal(canChangeBattlePosition(target, 5), false);
  assert.equal(canChangeBattlePosition(target, 6), true);
});

test('invalid turn and malformed lock values fail closed', () => {
  const target = makeMonster('m1:locked', 'atk', { positionLockedThrough: 5 });

  assert.throws(() => canChangeBattlePosition(target, 0), /turn is invalid/);
  assert.throws(() => canChangeBattlePosition(target, 1.5), /turn is invalid/);
  assert.throws(() => canChangeBattlePosition({ ...target, positionLockedThrough: 1.5 }, 5), /lock turn is invalid/);
});

test('Aqua Spirit changes only a face-up monster and locks it through the current turn', () => {
  const target = makeMonster('m1:target', 'atk');

  assert.equal(applyAquaSpiritPositionChange(target, 5, 'def'), true);
  assert.equal(target.position, 'def');
  assert.equal(target.positionLockedThrough, 5);
  assert.equal(canChangeBattlePosition(target, 5), false);
  assert.equal(canChangeBattlePosition(target, 6), true);
});

test('Aqua Spirit cannot change a face-down monster or choose its current position', () => {
  const hidden = makeMonster('m1:hidden', 'def', { faceUp: false });
  const unchanged = makeMonster('m1:unchanged', 'atk');

  assert.equal(applyAquaSpiritPositionChange(hidden, 5, 'atk'), false);
  assert.equal(hidden.position, 'def');
  assert.equal(applyAquaSpiritPositionChange(unchanged, 5, 'atk'), false);
  assert.equal(unchanged.positionLockedThrough, undefined);
});

test('Aqua Spirit cannot overwrite an existing active position lock', () => {
  const target = makeMonster('m1:locked', 'atk', { positionLockedThrough: 7 });

  assert.equal(applyAquaSpiritPositionChange(target, 5, 'def'), false);
  assert.equal(target.position, 'atk');
  assert.equal(target.positionLockedThrough, 7);
});

test('Aqua Spirit extends an expired older lock to the current turn', () => {
  const target = makeMonster('m1:old-lock', 'atk', { positionLockedThrough: 4 });

  assert.equal(applyAquaSpiritPositionChange(target, 5, 'def'), true);
  assert.equal(target.positionLockedThrough, 5);
});

test('effect target enumeration excludes a locked monster but keeps an unlocked teammate-opponent target', () => {
  const locked = makeMonster('m1:locked', 'atk', { positionLockedThrough: 5 });
  const open = makeMonster('m1:open', 'atk');
  const state = makeState(5, [], [locked, open]);

  const targets = positionTargets(state, 0, { scope: 'opponent', mode: 'def' });

  assert.deepEqual(targets.map(m => m.uid), ['m1:open']);
});

test('effect-driven position changes cannot bypass the lock', () => {
  const locked = makeMonster('m1:locked', 'atk', { positionLockedThrough: 5 });
  const open = makeMonster('m1:open', 'atk');
  const state = makeState(5, [], [locked, open]);

  const changed = executePositionChange(
    state,
    0,
    { scope: 'opponent', mode: 'switch' },
    'monster',
    undefined,
    () => {},
  );

  assert.equal(changed, 1);
  assert.equal(locked.position, 'atk');
  assert.equal(open.position, 'def');
});

test('a locked face-down target cannot be revealed by a position-changing effect', () => {
  const hidden = makeMonster('m1:hidden', 'def', { faceUp: false, positionLockedThrough: 5 });
  const state = makeState(5, [], [hidden]);

  const targets = positionTargets(state, 0, { scope: 'opponent', mode: 'reveal' });
  assert.deepEqual(targets, []);
});

test('an expired lock permits a later effect-driven position change', () => {
  const target = makeMonster('m1:expired', 'atk', { positionLockedThrough: 4 });
  const state = makeState(5, [], [target]);

  const changed = executePositionChange(
    state,
    0,
    { scope: 'opponent', mode: 'def' },
    'monster',
    undefined,
    () => {},
  );

  assert.equal(changed, 1);
  assert.equal(target.position, 'def');
});

test('position locks apply to all shared-field targets without changing the opposing team layout', () => {
  const lockedBySeat0 = makeMonster('m0:locked', 'atk', { positionLockedThrough: 5 });
  const openBySeat2 = makeMonster('m2:open', 'atk');
  const state = makeState(5, [], [lockedBySeat0, openBySeat2]);

  const targets = positionTargets(state, 0, { scope: 'opponent', mode: 'def' });

  assert.deepEqual(targets.map(m => m.uid), ['m2:open']);
  assert.equal(state.players[1].monsters.length, 2);
  assert.equal(state.players[1].monsters[0], lockedBySeat0);
  assert.equal(state.players[1].monsters[1], openBySeat2);
});
