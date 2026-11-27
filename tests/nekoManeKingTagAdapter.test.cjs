const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  NEKO_MANE_KING_ID,
  createNekoManeKingSession,
  assertNekoManeKingSession,
  captureNekoManeKingEvent,
  resolveNekoManeKingTrigger,
} = require('../dist/nekoManeKingTagAdapter');
const { RULES_PROFILE } = require('../dist/rulesProfile');

const baseEvent = (overrides = {}) => ({
  eventId: 'event-1',
  activationId: 'activation-1',
  cardId: NEKO_MANE_KING_ID,
  sourceUid: 'm0:physical-uid-1',
  fromZone: 'monster',
  toZone: 'grave',
  ownerSeat: 0,
  possessorTeam: 0,
  sourceControllerTeam: 0,
  turnTeam: 1,
  turnSeat: 1,
  effectControllerTeam: 1,
  cause: 'card-effect',
  chainResolved: true,
  turnNumber: 7,
  phase: 'battle',
  ...overrides,
});

function capture(overrides = {}, session = createNekoManeKingSession()) {
  const event = baseEvent(overrides);
  return { ...captureNekoManeKingEvent(session, event), event };
}

function noTrigger(overrides, label) {
  const original = createNekoManeKingSession();
  const result = captureNekoManeKingEvent(original, baseEvent(overrides));
  assert.equal(result.trigger, null, label);
  assert.equal(result.session.seenEvents[baseEvent(overrides).eventId], true);
  assert.deepEqual(original, createNekoManeKingSession(), 'capture never mutates its input session');
  return result.session;
}

test('Neko Mane King triggers only after an opponent-effect send to GY during the possessor team opponent turn', () => {
  const { trigger, session } = capture();
  assert.ok(trigger);
  assert.equal(trigger.cardId, '11021521');
  assert.equal(trigger.mandatory, true);
  assert.equal(trigger.operation, 'become-end-phase');
  assert.equal(trigger.ownerSeat, 0);
  assert.equal(trigger.ownerTeam, 0);
  assert.equal(trigger.possessorTeam, 0);
  assert.equal(trigger.turnTeam, 1);
  assert.equal(trigger.turnSeat, 1);
  assert.equal(session.pending['activation-1'].sourceUid, 'm0:physical-uid-1');
  assertNekoManeKingSession(session);
});

test('the card can be sent from a private hand, Deck or banished zone; physical owner remains distinct', () => {
  for (const [zone, seat] of [['hand', 2], ['deck', 0], ['banished', 2]]) {
    const { trigger } = capture({
      eventId: 'event-' + zone, activationId: 'activation-' + zone,
      sourceUid: 'm' + seat + ':physical-' + zone, ownerSeat: seat,
      fromZone: zone, sourceControllerTeam: undefined,
      possessorTeam: 0, turnTeam: 1, turnSeat: 3, effectControllerTeam: 1,
    });
    assert.ok(trigger, 'source should trigger: ' + zone);
    assert.equal(trigger.ownerSeat, seat);
    assert.equal(trigger.ownerTeam, 0);
  }
});

test('a stolen Neko Mane King uses the team possessing it at the send event, not its physical owner', () => {
  const { trigger } = capture({
    ownerSeat: 2,
    sourceUid: 'm2:stolen-uid',
    possessorTeam: 1,
    sourceControllerTeam: 1,
    turnTeam: 0,
    turnSeat: 0,
    effectControllerTeam: 0,
  });
  assert.ok(trigger);
  assert.equal(trigger.ownerTeam, 0);
  assert.equal(trigger.possessorTeam, 1);
  assert.equal(trigger.turnTeam, 0);
  assert.equal(trigger.effectControllerTeam, 0);
});

test('it does not trigger on its own turn', () => {
  noTrigger({ turnTeam: 0, turnSeat: 0, effectControllerTeam: 1 }, 'own turn is not eligible');
});

test('it does not trigger when the sending effect belongs to the possessing team', () => {
  noTrigger({ effectControllerTeam: 0 }, 'own-team effect is not eligible');
});

test('battle destruction is not an opponent card effect', () => {
  noTrigger({ cause: 'battle' }, 'battle is not eligible');
});

test('rule-based movement is not an opponent card effect', () => {
  noTrigger({ cause: 'rule' }, 'rule movement is not eligible');
});

test('sending the card to a destination other than GY does not trigger', () => {
  noTrigger({ toZone: 'banished' }, 'banishment is not sending to GY');
});

test('a card already in GY is not newly sent there', () => {
  noTrigger({ fromZone: 'grave', sourceControllerTeam: undefined }, 'same-zone movement is not eligible');
});

test('an unresolved sending chain is not consumed; the same event can be captured after resolution', () => {
  const original = createNekoManeKingSession();
  const event = baseEvent({ chainResolved: false });
  const early = captureNekoManeKingEvent(original, event);
  assert.equal(early.trigger, null);
  assert.deepEqual(early.session, original);
  const afterChain = captureNekoManeKingEvent(early.session, { ...event, chainResolved: true });
  assert.ok(afterChain.trigger);
  assert.equal(afterChain.trigger.eventId, event.eventId);
});

test('another card cannot borrow Neko Mane King behavior', () => {
  noTrigger({ cardId: '11021522' }, 'card identity is exact');
});

test('turn team and effect controller must both oppose the possessor', () => {
  noTrigger({ turnTeam: 0, turnSeat: 0 }, 'wrong turn team');
  noTrigger({ effectControllerTeam: 0 }, 'wrong effect controller');
});

test('field possession is bound to the controller snapshot', () => {
  assert.throws(() => capture({ sourceControllerTeam: 1 }), /posse/);
});

test('private-zone UID owner and turn seat must be physically consistent', () => {
  assert.throws(() => capture({ sourceUid: 'm1:uid', ownerSeat: 0 }), /Assento físico/);
  assert.throws(() => capture({ turnSeat: 0 }), /Assento físico/);
});

test('invalid seat, team, zone and unsafe event keys are rejected', () => {
  assert.throws(() => capture({ ownerSeat: 4 }), /inválido/);
  assert.throws(() => capture({ possessorTeam: 2 }), /inválido/);
  assert.throws(() => capture({ fromZone: 'extra' }), /inválido/);
  assert.throws(() => capture({ eventId: 'constructor' }), /inválido/);
});

test('duplicate event IDs are rejected rather than replayed', () => {
  const first = capture();
  assert.throws(() => captureNekoManeKingEvent(first.session, first.event), /duplicado/);
});

test('duplicate activation IDs cannot create a second pending trigger', () => {
  const first = capture();
  assert.throws(() => captureNekoManeKingEvent(first.session, baseEvent({ eventId: 'event-2' })), /reutilizado/);
});

test('resolution moves to End Phase without advancing the turn or skipping End Phase procedures', () => {
  const first = capture();
  const result = resolveNekoManeKingTrigger(first.session, 'activation-1', {
    turnNumber: 7, turnSeat: 1, phase: 'battle',
  });
  assert.equal(result.resolution.status, 'end-phase');
  assert.equal(result.resolution.nextPhase, 'end');
  assert.equal(result.resolution.phaseChanged, true);
  assert.equal(result.resolution.turnAdvances, false);
  assert.equal(result.resolution.mustRunEndPhaseProcedures, true);
  assert.equal(result.session.pending['activation-1'], undefined);
  assert.ok(result.session.resolved['activation-1']);
  assert.deepEqual(first.session.pending['activation-1'].sourceUid, 'm0:physical-uid-1');
});

test('the End Phase discard rule remains active: hand 6, checked at End Phase', () => {
  assert.equal(RULES_PROFILE.handLimit, 6);
  assert.equal(RULES_PROFILE.handCheck, 'end');
  assert.equal(RULES_PROFILE.mainDeckMin, 20);
  assert.equal(RULES_PROFILE.mainDeckMax, 30);
  assert.equal(RULES_PROFILE.monsterZones, 3);
  assert.equal(RULES_PROFILE.spellTrapZones, 3);
  assert.equal(RULES_PROFILE.extraDeckMax, 5);
});

test('resolving while already in End Phase is a no-op phase transition, not a second turn end', () => {
  const first = capture();
  const result = resolveNekoManeKingTrigger(first.session, 'activation-1', {
    turnNumber: 7, turnSeat: 1, phase: 'end',
  });
  assert.equal(result.resolution.status, 'already-end-phase');
  assert.equal(result.resolution.nextPhase, 'end');
  assert.equal(result.resolution.phaseChanged, false);
  assert.equal(result.resolution.turnAdvances, false);
  assert.equal(result.resolution.mustRunEndPhaseProcedures, true);
});

test('a negated mandatory trigger does not change the phase', () => {
  const first = capture();
  const result = resolveNekoManeKingTrigger(first.session, 'activation-1', {
    turnNumber: 7, turnSeat: 1, phase: 'battle', negated: true,
  });
  assert.equal(result.resolution.status, 'negated');
  assert.equal(result.resolution.nextPhase, null);
  assert.equal(result.resolution.phaseChanged, false);
  assert.equal(result.resolution.mustRunEndPhaseProcedures, false);
});

test('resolution uses the captured trigger snapshot without re-checking the source location', () => {
  const first = capture();
  const restored = JSON.parse(JSON.stringify(first.session));
  const result = resolveNekoManeKingTrigger(restored, 'activation-1', {
    turnNumber: 7, turnSeat: 1, phase: 'main2',
  });
  assert.equal(result.resolution.status, 'end-phase');
  assert.equal(result.resolution.sourceUid, 'm0:physical-uid-1');
});

test('stale turn or physical seat cannot resolve a captured trigger', () => {
  const first = capture();
  assert.throws(() => resolveNekoManeKingTrigger(first.session, 'activation-1', {
    turnNumber: 8, turnSeat: 1, phase: 'battle',
  }), /mudou/);
  assert.throws(() => resolveNekoManeKingTrigger(first.session, 'activation-1', {
    turnNumber: 7, turnSeat: 3, phase: 'battle',
  }), /mudou/);
});

test('resolution is idempotent across retries and JSON restoration', () => {
  const first = capture();
  const once = resolveNekoManeKingTrigger(first.session, 'activation-1', {
    turnNumber: 7, turnSeat: 1, phase: 'battle',
  });
  const retry = resolveNekoManeKingTrigger(JSON.parse(JSON.stringify(once.session)), 'activation-1', {
    turnNumber: 99, turnSeat: 3, phase: 'main1',
  });
  assert.deepEqual(retry.resolution, once.resolution);
  assert.equal(Object.keys(retry.session.resolved).length, 1);
  assert.equal(Object.keys(retry.session.pending).length, 0);
});

test('an absent or already-consumed trigger cannot resolve', () => {
  assert.throws(() => resolveNekoManeKingTrigger(createNekoManeKingSession(), 'missing', {
    turnNumber: 1, turnSeat: 1, phase: 'main1',
  }), /pendente/);
});

test('adapter sessions contain no inventory or player persistence fields', () => {
  const session = createNekoManeKingSession();
  assert.equal(Object.hasOwn(session, 'inventory'), false);
  assert.equal(Object.hasOwn(session, 'players'), false);
  assert.equal(Object.hasOwn(session, 'database'), false);
  assert.equal(Object.hasOwn(session, 'grants'), false);
});