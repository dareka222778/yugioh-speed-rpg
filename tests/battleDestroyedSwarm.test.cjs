const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BATTLE_DESTROYED_SWARM_CARD_IDS,
  scheduleBattleDestroyedSwarmEffect,
  resolveBattleDestroyedSwarmEffect
} = require('../dist/battleDestroyedSwarm');

function schedule(overrides = {}) {
  return {
    eventId: 'battle-trigger-01',
    cardId: '22567609',
    sourceUid: 'destroyed-source-01',
    sourceGraveEpoch: 5,
    sourcePhysicalOwnerSeat: 2,
    controllerSeatAtDestruction: 0,
    destroyedByBattle: true,
    sentToGraveyard: true,
    phase: 'damage-step-end',
    turn: 8,
    ...overrides
  };
}

function event(overrides = {}) {
  const result = scheduleBattleDestroyedSwarmEffect(schedule());
  assert.equal(result.ok, true);
  return { ...result.event, ...overrides };
}

function candidates(cardId = '22567609', controllerSeat = 0, count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    uid: 'deck-copy-' + (i + 1),
    cardId,
    physicalOwnerSeat: controllerSeat,
    zone: 'deck'
  }));
}

test('the family contains Nimble Momonga and Giant Germ', () => {
  assert.deepEqual(BATTLE_DESTROYED_SWARM_CARD_IDS, ['22567609', '95178994']);
});

test('Nimble Momonga triggers only when battle-destroyed and sent to the GY', () => {
  const result = scheduleBattleDestroyedSwarmEffect(schedule());
  assert.equal(result.ok, true);
  assert.equal(result.event.triggerLocation, 'grave');
  assert.equal(result.event.triggerWindow, 'damage-step-end');
});

test('Giant Germ uses the same battle-destruction trigger window', () => {
  const result = scheduleBattleDestroyedSwarmEffect(schedule({ cardId: '95178994' }));
  assert.equal(result.ok, true);
  assert.equal(result.event.cardId, '95178994');
});

test('destruction by effect does not trigger either card', () => {
  assert.deepEqual(
    scheduleBattleDestroyedSwarmEffect(schedule({ destroyedByBattle: false })),
    { ok: false, reason: 'not-battle-destroyed-to-graveyard' }
  );
});

test('battle destruction without being sent to the GY does not trigger', () => {
  assert.deepEqual(
    scheduleBattleDestroyedSwarmEffect(schedule({ sentToGraveyard: false })),
    { ok: false, reason: 'not-battle-destroyed-to-graveyard' }
  );
});

test('the trigger is captured at the Damage Step End window', () => {
  assert.deepEqual(
    scheduleBattleDestroyedSwarmEffect(schedule({ phase: 'damage-calculation' })),
    { ok: false, reason: 'wrong-window' }
  );
});

test('the Graveyard trigger is mandatory, non-targeting and creates a chain link', () => {
  const result = scheduleBattleDestroyedSwarmEffect(schedule());
  assert.equal(result.ok, true);
  assert.equal(result.event.mandatoryTrigger, true);
  assert.equal(result.event.targets, false);
  assert.equal(result.event.chainLinkRequired, true);
});

test('a negated trigger does not create an event', () => {
  assert.deepEqual(
    scheduleBattleDestroyedSwarmEffect(schedule({ effectNegated: true })),
    { ok: false, reason: 'effect-negated' }
  );
});

test('duplicate event IDs and duplicate physical GY instances are rejected', () => {
  const first = scheduleBattleDestroyedSwarmEffect(schedule());
  assert.equal(first.ok, true);
  assert.deepEqual(
    scheduleBattleDestroyedSwarmEffect(schedule({ eventId: 'battle-trigger-02' }), [first.event]),
    { ok: false, reason: 'duplicate-event' }
  );
});

test('Nimble Momonga gains 1000 LP for its controller team before optional summons', () => {
  const result = resolveBattleDestroyedSwarmEffect(
    event(),
    candidates('22567609', 0, 3),
    3,
    []
  );
  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.lifePointChange, { kind: 'gain', amount: 1000, team: 0 });
  assert.deepEqual(result.resolutionSteps, ['life-point-change', 'optional-special-summon']);
});

test('Giant Germ inflicts 500 damage on the opposing team before optional summons', () => {
  const result = resolveBattleDestroyedSwarmEffect(
    event({ cardId: '95178994' }),
    candidates('95178994', 0, 3),
    3,
    []
  );
  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.lifePointChange, { kind: 'damage', amount: 500, team: 1 });
  assert.deepEqual(result.resolutionSteps, ['life-point-change', 'optional-special-summon']);
});

test('Nimble Momonga can summon any selected number up to Deck copies and zones face-down Defense', () => {
  const result = resolveBattleDestroyedSwarmEffect(
    event(),
    candidates('22567609', 0, 3),
    2,
    ['deck-copy-1', 'deck-copy-3']
  );
  assert.equal(result.status, 'resolved');
  assert.equal(result.maxSummons, 2);
  assert.equal(result.summons.length, 2);
  assert.ok(result.summons.every(x => x.position === 'face-down-defense'));
});

test('Giant Germ can summon any selected number in face-up Attack Position', () => {
  const result = resolveBattleDestroyedSwarmEffect(
    event({ cardId: '95178994' }),
    candidates('95178994', 0, 3),
    3,
    ['deck-copy-1', 'deck-copy-2', 'deck-copy-3']
  );
  assert.equal(result.status, 'resolved');
  assert.equal(result.summons.length, 3);
  assert.ok(result.summons.every(x => x.position === 'face-up-attack'));
});

test('the optional summon can be declined while the mandatory LP operation still resolves', () => {
  const result = resolveBattleDestroyedSwarmEffect(event(), candidates(), 3, []);
  assert.equal(result.status, 'resolved');
  assert.equal(result.lifePointChange.amount, 1000);
  assert.deepEqual(result.summons, []);
});

test('the shared three Monster Zones cap the number of summoned copies', () => {
  const result = resolveBattleDestroyedSwarmEffect(event(), candidates(), 3, [
    'deck-copy-1',
    'deck-copy-2',
    'deck-copy-3'
  ]);
  assert.equal(result.status, 'resolved');
  assert.equal(result.maxSummons, 3);
  assert.equal(result.summons.length, 3);
});

test('zero available Monster Zones do not prevent the LP operation', () => {
  const result = resolveBattleDestroyedSwarmEffect(event(), candidates(), 0, []);
  assert.equal(result.status, 'resolved');
  assert.equal(result.lifePointChange.amount, 1000);
  assert.equal(result.maxSummons, 0);
  assert.deepEqual(result.summons, []);
});

test('summons must come from the effect controller Deck, not the partner Deck', () => {
  const partnerDeck = candidates('22567609', 2, 1);
  assert.deepEqual(
    resolveBattleDestroyedSwarmEffect(event(), partnerDeck, 3, ['deck-copy-1']),
    { status: 'invalid-selection', eventId: 'battle-trigger-01', reason: 'invalid-context' }
  );
});

test('the source card physical owner may differ from the effect controller', () => {
  const result = resolveBattleDestroyedSwarmEffect(
    event({ sourcePhysicalOwnerSeat: 2, controllerSeatAtDestruction: 0, controllerTeam: 0, opponentTeam: 1 }),
    candidates('22567609', 0, 1),
    1,
    ['deck-copy-1']
  );
  assert.equal(result.status, 'resolved');
  assert.equal(result.summons[0].physicalOwnerSeat, 0);
  assert.equal(result.summons[0].controllerSeat, 0);
  assert.equal(result.summons[0].team, 0);
});

test('duplicate summon selections are rejected', () => {
  assert.deepEqual(
    resolveBattleDestroyedSwarmEffect(event(), candidates(), 3, ['deck-copy-1', 'deck-copy-1']),
    { status: 'invalid-selection', eventId: 'battle-trigger-01', reason: 'duplicate-selection' }
  );
});

test('a selected UID not present in the controller Deck is rejected', () => {
  assert.deepEqual(
    resolveBattleDestroyedSwarmEffect(event(), candidates(), 3, ['not-in-deck']),
    { status: 'invalid-selection', eventId: 'battle-trigger-01', reason: 'not-in-controller-deck' }
  );
});

test('summon selections cannot exceed the current shared zone capacity', () => {
  assert.deepEqual(
    resolveBattleDestroyedSwarmEffect(event(), candidates(), 1, ['deck-copy-1', 'deck-copy-2']),
    { status: 'invalid-selection', eventId: 'battle-trigger-01', reason: 'zone-capacity-or-deck-limit' }
  );
});

test('effect negation prevents both the LP operation and the optional summons', () => {
  assert.deepEqual(
    resolveBattleDestroyedSwarmEffect(event(), candidates(), 3, ['deck-copy-1'], true),
    { status: 'negated', eventId: 'battle-trigger-01' }
  );
});

test('the source may leave the GY after its trigger is captured without changing the event snapshot', () => {
  const pending = event();
  const before = structuredClone(pending);
  const result = resolveBattleDestroyedSwarmEffect(pending, candidates(), 1, ['deck-copy-1']);
  assert.equal(result.status, 'resolved');
  assert.deepEqual(pending, before);
});

test('invalid context and candidate records are rejected', () => {
  assert.deepEqual(
    scheduleBattleDestroyedSwarmEffect(schedule({ sourceGraveEpoch: -1 })),
    { ok: false, reason: 'invalid-context' }
  );
  assert.deepEqual(
    resolveBattleDestroyedSwarmEffect(event(), [
      { uid: 'deck-copy-1', cardId: '95178994', physicalOwnerSeat: 0, zone: 'deck' }
    ], 3, []),
    { status: 'invalid-selection', eventId: 'battle-trigger-01', reason: 'invalid-context' }
  );
});

test('the helper does not mutate the trigger event or Deck candidates', () => {
  const pending = event();
  const deck = candidates();
  const beforeEvent = structuredClone(pending);
  const beforeDeck = structuredClone(deck);
  resolveBattleDestroyedSwarmEffect(pending, deck, 2, ['deck-copy-1']);
  assert.deepEqual(pending, beforeEvent);
  assert.deepEqual(deck, beforeDeck);
});
