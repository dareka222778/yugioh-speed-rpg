const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AMEBA_CARD_ID,
  prepareAmebaControlChangeBurn,
  recordAmebaControlChangeEvent,
  teamOfAmebaSeat,
} = require('../dist/amebaControlChange');

const event = (overrides = {}) => ({
  eventId: 'control-change-001',
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

test('routes 2000 damage to the team receiving control', () => {
  const result = prepareAmebaControlChangeBurn(event());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.plan, {
    eventId: 'control-change-001',
    sourceUid: 'm2:ameba',
    physicalOwnerSeat: 2,
    fromTeam: 'even',
    recipientSeat: 1,
    recipientTeam: 'odd',
    damage: 2000,
    oncePerTurnLimit: false,
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

test('allows a later, distinct control-change event to trigger again', () => {
  const first = prepareAmebaControlChangeBurn(event({ eventId: 'event-a' }));
  const second = prepareAmebaControlChangeBurn(event({
    eventId: 'event-b',
    previousControllerSeat: 1,
    newControllerSeat: 2,
  }));
  assert.equal(first.eligible, true);
  assert.equal(second.eligible, true);
});

test('prevents replay of an already processed event ID', () => {
  assert.deepEqual(prepareAmebaControlChangeBurn(event(), ['control-change-001']), {
    eligible: false, reason: 'duplicate-event',
  });
});

test('records a receipt immutably and idempotently', () => {
  const original = ['event-0'];
  const next = recordAmebaControlChangeEvent(original, 'event-1');
  assert.deepEqual(original, ['event-0']);
  assert.deepEqual(next, ['event-0', 'event-1']);
  assert.deepEqual(recordAmebaControlChangeEvent(next, 'event-1'), next);
});

test('rejects a corrupted persisted ledger with duplicate IDs', () => {
  assert.throws(() => recordAmebaControlChangeEvent(['x', 'x'], 'y'), /Duplicate event/);
});

test('does not mutate the event or processed-event ledger', () => {
  const e = event();
  const ledger = ['prior-event'];
  const before = structuredClone({ e, ledger });
  prepareAmebaControlChangeBurn(e, ledger);
  assert.deepEqual({ e, ledger }, before);
});

test('rejects malformed seat and missing event identifiers', () => {
  assert.throws(() => prepareAmebaControlChangeBurn(event({ newControllerSeat: 4 })), /new controller/);
  assert.throws(() => prepareAmebaControlChangeBurn(event({ eventId: '' })), /event ID/);
});

test('caps the replay ledger to a bounded size', () => {
  const ledger = Array.from({ length: 4096 }, (_, index) => `event-${index}`);
  assert.throws(() => recordAmebaControlChangeEvent(ledger, 'event-overflow'), /ledger limit/);
});
