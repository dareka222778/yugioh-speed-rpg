const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WICKED_WORM_BEAST_ID,
  planWickedWormBeastEndPhaseReturn
} = require('../dist/wickedWormBeast');

function input(overrides = {}) {
  return {
    cardId: WICKED_WORM_BEAST_ID,
    uid: 'physical-card-01',
    physicalOwnerSeat: 0,
    controllerSeat: 1,
    activeSeat: 3,
    turn: 7,
    phase: 'end',
    zone: 'monster',
    faceUp: true,
    effectNegated: false,
    ...overrides
  };
}

test('returns a face-up copy during its controller team End Phase', () => {
  const result = planWickedWormBeastEndPhaseReturn(input());
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan, {
    uid: 'physical-card-01',
    fromZone: 'monster',
    toZone: 'hand',
    physicalOwnerSeat: 0,
    physicalOwnerTeam: 0,
    controllerTeam: 1
  });
});

test('routes the card to its physical owner, not the controlling teammate', () => {
  const result = planWickedWormBeastEndPhaseReturn(input({
    physicalOwnerSeat: 2,
    controllerSeat: 1,
    activeSeat: 3
  }));
  assert.equal(result.ok, true);
  assert.equal(result.plan.physicalOwnerSeat, 2);
  assert.equal(result.plan.physicalOwnerTeam, 0);
});

test('either active seat of the controller team represents that team End Phase', () => {
  const result = planWickedWormBeastEndPhaseReturn(input({
    physicalOwnerSeat: 0,
    controllerSeat: 0,
    activeSeat: 2
  }));
  assert.equal(result.ok, true);
  assert.equal(result.plan.controllerTeam, 0);
});

test('does not return during the other team End Phase', () => {
  const result = planWickedWormBeastEndPhaseReturn(input({
    controllerSeat: 0,
    activeSeat: 1
  }));
  assert.deepEqual(result, { ok: false, reason: 'not-controller-team-end-phase' });
});

test('requires the End Phase', () => {
  assert.deepEqual(
    planWickedWormBeastEndPhaseReturn(input({ phase: 'main' })),
    { ok: false, reason: 'not-end-phase' }
  );
});

test('requires the card to remain in a Monster Zone', () => {
  assert.deepEqual(
    planWickedWormBeastEndPhaseReturn(input({ zone: 'grave' })),
    { ok: false, reason: 'not-on-field' }
  );
});

test('requires the card to be face-up', () => {
  assert.deepEqual(
    planWickedWormBeastEndPhaseReturn(input({ faceUp: false })),
    { ok: false, reason: 'not-face-up' }
  );
});

test('does not resolve while the card effect is negated', () => {
  assert.deepEqual(
    planWickedWormBeastEndPhaseReturn(input({ effectNegated: true })),
    { ok: false, reason: 'effect-negated' }
  );
});

test('rejects a different card identity', () => {
  assert.deepEqual(
    planWickedWormBeastEndPhaseReturn(input({ cardId: '00000000' })),
    { ok: false, reason: 'wrong-card' }
  );
});

test('the same physical UID cannot be returned twice in one turn', () => {
  const result = planWickedWormBeastEndPhaseReturn(input({
    ledger: { turn: 7, returnedUids: ['physical-card-01'] }
  }));
  assert.deepEqual(result, { ok: false, reason: 'already-returned' });
});

test('a new turn resets the per-turn UID ledger', () => {
  const result = planWickedWormBeastEndPhaseReturn(input({
    turn: 8,
    ledger: { turn: 7, returnedUids: ['physical-card-01'] }
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.ledger, { turn: 8, returnedUids: ['physical-card-01'] });
});

test('rejects invalid seats, turns and malformed ledgers', () => {
  assert.deepEqual(
    planWickedWormBeastEndPhaseReturn(input({ physicalOwnerSeat: 4 })),
    { ok: false, reason: 'invalid-context' }
  );
  assert.deepEqual(
    planWickedWormBeastEndPhaseReturn(input({ turn: 0 })),
    { ok: false, reason: 'invalid-context' }
  );
  assert.deepEqual(
    planWickedWormBeastEndPhaseReturn(input({
      ledger: { turn: 7, returnedUids: ['duplicate', 'duplicate'] }
    })),
    { ok: false, reason: 'invalid-context' }
  );
});

test('planning is immutable and does not move or grant the card', () => {
  const state = input();
  const before = structuredClone(state);
  const result = planWickedWormBeastEndPhaseReturn(state);
  assert.equal(result.ok, true);
  assert.deepEqual(state, before);
  assert.equal(result.plan.toZone, 'hand');
  assert.equal(result.plan.uid, state.uid);
});
