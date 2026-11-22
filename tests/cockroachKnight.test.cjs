const test = require('node:test');
const assert = require('node:assert/strict');
const {
  COCKROACH_KNIGHT_ID,
  scheduleCockroachKnightTopdeckReturn,
  resolveCockroachKnightTopdeckReturn
} = require('../dist/cockroachKnight');

function schedule(overrides = {}) {
  return {
    eventId: 'send-01',
    cardId: COCKROACH_KNIGHT_ID,
    uid: 'cockroach-physical-01',
    physicalOwnerSeat: 2,
    controllerSeatAtSend: 0,
    sourceZoneAtSend: 'monster',
    graveEpoch: 4,
    sendTurn: 9,
    sendPhase: 'damage-step',
    ...overrides
  };
}

function event(overrides = {}) {
  const result = scheduleCockroachKnightTopdeckReturn(schedule());
  assert.equal(result.ok, true);
  return { ...result.event, ...overrides };
}

function current(overrides = {}) {
  return {
    uid: 'cockroach-physical-01',
    physicalOwnerSeat: 2,
    graveEpoch: 4,
    zone: 'grave',
    ...overrides
  };
}

test('a field-to-GY send creates a mandatory trigger event in the Graveyard', () => {
  const result = scheduleCockroachKnightTopdeckReturn(schedule());
  assert.equal(result.ok, true);
  assert.equal(result.event.triggerLocation, 'grave');
  assert.equal(result.event.mandatory, true);
  assert.equal(result.event.targets, false);
  assert.equal(result.event.chainLinkRequired, true);
});

test('sending the card from the hand also triggers the effect', () => {
  const result = scheduleCockroachKnightTopdeckReturn(schedule({ sourceZoneAtSend: 'hand' }));
  assert.equal(result.ok, true);
});

test('sending the card from the Deck also triggers the effect', () => {
  const result = scheduleCockroachKnightTopdeckReturn(schedule({ sourceZoneAtSend: 'deck' }));
  assert.equal(result.ok, true);
});

test('sending the card from banished to the GY triggers the effect', () => {
  const result = scheduleCockroachKnightTopdeckReturn(schedule({ sourceZoneAtSend: 'banished' }));
  assert.equal(result.ok, true);
});

test('the effect can trigger during the Damage Step', () => {
  const result = scheduleCockroachKnightTopdeckReturn(schedule({ sendPhase: 'damage-step' }));
  assert.equal(result.ok, true);
});

test('the effect can trigger outside the Damage Step as well', () => {
  const result = scheduleCockroachKnightTopdeckReturn(schedule({ sendPhase: 'main' }));
  assert.equal(result.ok, true);
});

test('a card already in the GY is not a new send event', () => {
  assert.deepEqual(
    scheduleCockroachKnightTopdeckReturn(schedule({ sourceZoneAtSend: 'grave' })),
    { ok: false, reason: 'not-sent-to-graveyard' }
  );
});

test('the effect does not trigger for a different card identity', () => {
  assert.deepEqual(
    scheduleCockroachKnightTopdeckReturn(schedule({ cardId: '00000000' })),
    { ok: false, reason: 'wrong-card' }
  );
});

test('a negated effect does not create a trigger event', () => {
  assert.deepEqual(
    scheduleCockroachKnightTopdeckReturn(schedule({ effectNegated: true })),
    { ok: false, reason: 'effect-negated' }
  );
});

test('the same physical card and grave epoch cannot create duplicate events', () => {
  const first = scheduleCockroachKnightTopdeckReturn(schedule());
  assert.equal(first.ok, true);
  assert.deepEqual(
    scheduleCockroachKnightTopdeckReturn(schedule({ eventId: 'send-02' }), [first.event]),
    { ok: false, reason: 'duplicate-event' }
  );
});

test('the card returns to the top of its physical owner Deck, not the controller Deck', () => {
  const result = resolveCockroachKnightTopdeckReturn(event(), current());
  assert.deepEqual(result, {
    status: 'return-to-deck-top',
    eventId: 'send-01',
    plan: {
      uid: 'cockroach-physical-01',
      fromZone: 'grave',
      toZone: 'deck-top',
      physicalOwnerSeat: 2,
      destinationDeckSeat: 2,
      shuffleDeck: false,
      mandatory: true,
      targets: false
    }
  });
});

test('the Deck is not shuffled after returning the card to its top', () => {
  const result = resolveCockroachKnightTopdeckReturn(event(), current());
  assert.equal(result.status, 'return-to-deck-top');
  assert.equal(result.plan.shuffleDeck, false);
});

test('the effect cannot return the card if it left the GY before resolution', () => {
  assert.deepEqual(
    resolveCockroachKnightTopdeckReturn(event(), current({ zone: 'banished' })),
    { status: 'skipped', eventId: 'send-01', reason: 'left-graveyard' }
  );
});

test('a card that left and re-entered the GY with a new epoch is a different instance', () => {
  assert.deepEqual(
    resolveCockroachKnightTopdeckReturn(event(), current({ graveEpoch: 5 })),
    { status: 'skipped', eventId: 'send-01', reason: 'physical-instance-changed' }
  );
});

test('the physical owner is preserved if the card was controlled by a teammate', () => {
  const result = resolveCockroachKnightTopdeckReturn(
    event({ controllerSeatAtSend: 0, physicalOwnerSeat: 2 }),
    current({ physicalOwnerSeat: 2 })
  );
  assert.equal(result.status, 'return-to-deck-top');
  assert.equal(result.plan.destinationDeckSeat, 2);
});

test('an event cannot move a card to a different physical owner Deck', () => {
  assert.deepEqual(
    resolveCockroachKnightTopdeckReturn(event(), current({ physicalOwnerSeat: 0 })),
    { status: 'skipped', eventId: 'send-01', reason: 'physical-owner-changed' }
  );
});

test('effect negation at resolution prevents the top-deck move', () => {
  assert.deepEqual(
    resolveCockroachKnightTopdeckReturn(event(), current(), true),
    { status: 'skipped', eventId: 'send-01', reason: 'effect-negated' }
  );
});

test('invalid send metadata is rejected', () => {
  assert.deepEqual(
    scheduleCockroachKnightTopdeckReturn(schedule({ graveEpoch: -1 })),
    { ok: false, reason: 'invalid-context' }
  );
  assert.deepEqual(
    scheduleCockroachKnightTopdeckReturn(schedule({ physicalOwnerSeat: 4 })),
    { ok: false, reason: 'invalid-context' }
  );
});

test('scheduling and resolution do not mutate the card snapshot or event', () => {
  const send = schedule();
  const beforeSend = structuredClone(send);
  const scheduled = scheduleCockroachKnightTopdeckReturn(send);
  assert.equal(scheduled.ok, true);
  assert.deepEqual(send, beforeSend);

  const pending = event();
  const beforeEvent = structuredClone(pending);
  const snapshot = current();
  const beforeSnapshot = structuredClone(snapshot);
  resolveCockroachKnightTopdeckReturn(pending, snapshot);
  assert.deepEqual(pending, beforeEvent);
  assert.deepEqual(snapshot, beforeSnapshot);
});
