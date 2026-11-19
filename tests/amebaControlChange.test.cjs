const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AMEBA_CARD_ID,
  prepareAmebaControlChangeBurn,
  recordAmebaControlChangeEvent,
  recordAmebaFaceUpSession,
  teamOfAmebaSeat,
} = require('../dist/amebaControlChange');

const event = (overrides = {}) => ({
  eventId: 'control-change-001',
  faceUpSessionId: 'ameba-face-up-epoch-7',
  sourceUid: 'm2:ameba',
  cardId: AMEBA_CARD_ID,
  physicalOwnerSeat: 2,
  previousControllerSeat: 0,
  newControllerSeat: 1,
  faceUpAtChange: true,
  ...overrides,
});

test('maps physical seats 0/2 and 1/3 to their shared teams', () => {
  assert.deepEqual([0, 1, 2, 3].map(teamOfAmebaSeat), ['even', 'odd', 'even', 'odd']);
});

test('routes 2000 damage to the team receiving control and records face-up epoch', () => {
  const result = prepareAmebaControlChangeBurn(event());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.plan, {
    eventId: 'control-change-001',
    faceUpSessionId: 'ameba-face-up-epoch-7',
    sourceUid: 'm2:ameba',
    physicalOwnerSeat: 2,
    fromTeam: 'even',
    recipientSeat: 1,
    recipientTeam: 'odd',
    damage: 2000,
    oncePerFaceUpPeriod: true,
  });
});

test('routes damage correctly when the even team receives control', () => {
  const result = prepareAmebaControlChangeBurn(event({
    previousControllerSeat: 3,
    newControllerSeat: 2,
    physicalOwnerSeat: 1,
  }));
  assert.equal(result.eligible, true);
  assert.equal(result.plan.recipientTeam, 'even');
  assert.equal(result.plan.recipientSeat, 2);
});

test('uses the new controller team, not the physical owner team', () => {
  const result = prepareAmebaControlChangeBurn(event({
    physicalOwnerSeat: 0,
    previousControllerSeat: 1,
    newControllerSeat: 2,
  }));
  assert.equal(result.eligible, true);
  assert.equal(result.plan.physicalOwnerSeat, 0);
  assert.equal(result.plan.recipientTeam, 'even');
});

test('does not trigger if Ameba was face-down when control changed', () => {
  assert.deepEqual(prepareAmebaControlChangeBurn(event({ faceUpAtChange: false })), {
    eligible: false, reason: 'not-face-up-at-control-change',
  });
});

test('does not trigger when the effect was negated at the event', () => {
  assert.deepEqual(prepareAmebaControlChangeBurn(event({ effectNegated: true })), {
    eligible: false, reason: 'effect-negated',
  });
});

test('does not trigger for a different card identity', () => {
  assert.deepEqual(prepareAmebaControlChangeBurn(event({ cardId: '13026402' })), {
    eligible: false, reason: 'wrong-card',
  });
});

test('does not trigger when the same seat remains controller', () => {
  assert.deepEqual(prepareAmebaControlChangeBurn(event({ newControllerSeat: 0 })), {
    eligible: false, reason: 'controller-did-not-change',
  });
});

test('does not treat a partner-to-partner seat handoff as a team control change', () => {
  assert.deepEqual(prepareAmebaControlChangeBurn(event({
    previousControllerSeat: 0,
    newControllerSeat: 2,
  })), { eligible: false, reason: 'control-remained-within-team' });
  assert.deepEqual(prepareAmebaControlChangeBurn(event({
    previousControllerSeat: 1,
    newControllerSeat: 3,
  })), { eligible: false, reason: 'control-remained-within-team' });
});

test('only one qualifying control change can resolve during one face-up period', () => {
  const first = prepareAmebaControlChangeBurn(event({ eventId: 'event-a' }));
  assert.equal(first.eligible, true);
  const second = prepareAmebaControlChangeBurn(event({
    eventId: 'event-b',
    previousControllerSeat: 1,
    newControllerSeat: 2,
  }), ['event-a'], ['ameba-face-up-epoch-7']);
  assert.deepEqual(second, { eligible: false, reason: 'already-used-this-face-up-period' });
});

test('turning face-down and face-up again creates a fresh once-while-face-up period', () => {
  const nextPeriod = prepareAmebaControlChangeBurn(event({
    eventId: 'event-c',
    faceUpSessionId: 'ameba-face-up-epoch-8',
    previousControllerSeat: 1,
    newControllerSeat: 2,
  }), ['event-a'], ['ameba-face-up-epoch-7']);
  assert.equal(nextPeriod.eligible, true);
  assert.equal(nextPeriod.plan.faceUpSessionId, 'ameba-face-up-epoch-8');
});

test('prevents replay of an already processed event ID', () => {
  assert.deepEqual(prepareAmebaControlChangeBurn(event(), ['control-change-001']), {
    eligible: false, reason: 'duplicate-event',
  });
});

test('records event receipts immutably and idempotently', () => {
  const original = ['event-0'];
  const next = recordAmebaControlChangeEvent(original, 'event-1');
  assert.deepEqual(original, ['event-0']);
  assert.deepEqual(next, ['event-0', 'event-1']);
  assert.deepEqual(recordAmebaControlChangeEvent(next, 'event-1'), next);
});

test('records once-per-face-up receipts independently', () => {
  const original = ['epoch-0'];
  const next = recordAmebaFaceUpSession(original, 'epoch-1');
  assert.deepEqual(original, ['epoch-0']);
  assert.deepEqual(next, ['epoch-0', 'epoch-1']);
  assert.deepEqual(recordAmebaFaceUpSession(next, 'epoch-1'), next);
});

test('rejects corrupted persisted ledgers with duplicate IDs', () => {
  assert.throws(() => recordAmebaControlChangeEvent(['x', 'x'], 'y'), /Duplicate entry/);
  assert.throws(() => recordAmebaFaceUpSession(['x', 'x'], 'y'), /Duplicate entry/);
});

test('does not mutate the event or either replay ledger', () => {
  const e = event();
  const events = ['prior-event'];
  const sessions = ['prior-session'];
  const before = structuredClone({ e, events, sessions });
  prepareAmebaControlChangeBurn(e, events, sessions);
  assert.deepEqual({ e, events, sessions }, before);
});

test('rejects malformed seat and missing event identifiers', () => {
  assert.throws(() => prepareAmebaControlChangeBurn(event({ newControllerSeat: 4 })), /new controller/);
  assert.throws(() => prepareAmebaControlChangeBurn(event({ eventId: '' })), /event ID/);
  assert.throws(() => prepareAmebaControlChangeBurn(event({ faceUpSessionId: '' })), /face-up session ID/);
});

test('caps both persisted ledgers to a bounded size', () => {
  const events = Array.from({ length: 4096 }, (_, index) => `event-${index}`);
  const sessions = Array.from({ length: 4096 }, (_, index) => `session-${index}`);
  assert.throws(() => recordAmebaControlChangeEvent(events, 'event-overflow'), /ledger limit/);
  assert.throws(() => recordAmebaFaceUpSession(sessions, 'session-overflow'), /ledger limit/);
});
