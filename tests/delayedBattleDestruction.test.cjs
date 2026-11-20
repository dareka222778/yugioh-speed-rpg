const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DELAYED_BATTLE_DESTRUCTION_CARD_IDS,
  scheduleDelayedBattleDestruction,
  resolveDelayedBattleDestruction
} = require('../dist/delayedBattleDestruction');

function schedule(overrides = {}) {
  return {
    eventId: 'event-01',
    sourceCardId: '86100785',
    sourceUid: 'source-uid',
    sourceTeam: 0,
    targetUid: 'target-uid',
    targetEpoch: 3,
    targetPhysicalOwnerSeat: 1,
    targetControllerSeat: 1,
    attackTurn: 7,
    phase: 'damage-calculation-complete',
    targetWasMonsterAtAttack: true,
    sourceEffectWasFaceUp: true,
    ...overrides
  };
}

function event(overrides = {}) {
  const result = scheduleDelayedBattleDestruction(schedule(), []);
  assert.equal(result.ok, true);
  return { ...result.event, ...overrides };
}

function target(overrides = {}) {
  return {
    uid: 'target-uid',
    epoch: 3,
    physicalOwnerSeat: 1,
    controllerSeat: 1,
    zone: 'monster',
    faceUp: true,
    ...overrides
  };
}

test('Zone Eater and Swordsman share the fifth-turn all-turns schedule', () => {
  assert.deepEqual(DELAYED_BATTLE_DESTRUCTION_CARD_IDS, ['86100785', '85255550', '13599884']);
  for (const sourceCardId of ['86100785', '85255550']) {
    const result = scheduleDelayedBattleDestruction(schedule({ sourceCardId }));
    assert.equal(result.ok, true);
    assert.equal(result.event.dueTurn, 11);
    assert.equal(result.event.turnCountMode, 'all-turns-fifth');
    assert.equal(result.event.triggerRole, 'attacker');
  }
});

test('Steel Scorpion counts the attack turn as the opponent first turn and resolves on the opponent third turn', () => {
  const result = scheduleDelayedBattleDestruction(schedule({
    sourceCardId: '13599884',
    sourceTeam: 0,
    targetControllerSeat: 1,
    targetRace: 'Warrior'
  }));
  assert.equal(result.ok, true);
  assert.equal(result.event.dueTurn, 11);
  assert.equal(result.event.turnCountMode, 'opponent-turn-third');
  assert.equal(result.event.triggerRole, 'defender');
});

test('the attack turn is counted as the first turn in the global sequence', () => {
  const result = scheduleDelayedBattleDestruction(schedule({ attackTurn: 20 }));
  assert.equal(result.ok, true);
  assert.equal(result.event.dueTurn, 24);
});

test('the delayed effect is scheduled even if the source was destroyed by battle', () => {
  const result = scheduleDelayedBattleDestruction(schedule({ sourceDestroyedByBattle: true }));
  assert.equal(result.ok, true);
  assert.equal(result.event.sourceUid, 'source-uid');
});

test('the effect is scheduled only after damage calculation', () => {
  assert.deepEqual(
    scheduleDelayedBattleDestruction(schedule({ phase: 'damage-step-start' })),
    { ok: false, reason: 'wrong-window' }
  );
});

test('the attack snapshot must identify a monster target', () => {
  assert.deepEqual(
    scheduleDelayedBattleDestruction(schedule({ targetWasMonsterAtAttack: false })),
    { ok: false, reason: 'invalid-context' }
  );
});

test('the target must be controlled by the opposing team', () => {
  assert.deepEqual(
    scheduleDelayedBattleDestruction(schedule({ targetControllerSeat: 2 })),
    { ok: false, reason: 'target-not-opponent-monster' }
  );
});

test('control ownership and physical ownership are kept separate', () => {
  const result = scheduleDelayedBattleDestruction(schedule({
    targetControllerSeat: 1,
    targetPhysicalOwnerSeat: 2
  }));
  assert.equal(result.ok, true);
  assert.equal(result.event.targetControllerTeamAtAttack, 1);
  assert.equal(result.event.targetPhysicalOwnerTeam, 0);
});

test('Steel Scorpion does not schedule against a Machine attacker', () => {
  assert.deepEqual(
    scheduleDelayedBattleDestruction(schedule({
      sourceCardId: '13599884',
      targetControllerSeat: 1,
      targetRace: 'Machine'
    })),
    { ok: false, reason: 'steel-scorpion-requires-non-machine-target' }
  );
});

test('Steel Scorpion requires the attacking monster race for its non-Machine condition', () => {
  assert.deepEqual(
    scheduleDelayedBattleDestruction(schedule({
      sourceCardId: '13599884',
      targetControllerSeat: 1
    })),
    { ok: false, reason: 'invalid-context' }
  );
});

test('the source effect must have been face-up at its trigger window', () => {
  assert.deepEqual(
    scheduleDelayedBattleDestruction(schedule({ sourceEffectWasFaceUp: false })),
    { ok: false, reason: 'source-not-face-up' }
  );
});

test('a negated source effect does not schedule delayed destruction', () => {
  assert.deepEqual(
    scheduleDelayedBattleDestruction(schedule({ effectNegated: true })),
    { ok: false, reason: 'effect-negated' }
  );
});

test('unsupported card identities are rejected', () => {
  assert.deepEqual(
    scheduleDelayedBattleDestruction(schedule({ sourceCardId: '00000000' })),
    { ok: false, reason: 'unsupported-source' }
  );
});

test('duplicate event IDs cannot schedule the same attack twice', () => {
  const first = scheduleDelayedBattleDestruction(schedule());
  assert.equal(first.ok, true);
  assert.deepEqual(
    scheduleDelayedBattleDestruction(schedule(), [first.event]),
    { ok: false, reason: 'duplicate-event' }
  );
});

test('a pending event waits before its due turn', () => {
  assert.deepEqual(
    resolveDelayedBattleDestruction(event(), 10, 'end', target()),
    { status: 'waiting' }
  );
});

test('the due turn waits until the End Phase', () => {
  assert.deepEqual(
    resolveDelayedBattleDestruction(event(), 11, 'main', target()),
    { status: 'waiting' }
  );
});

test('the fifth turn End Phase destroys the same physical target without a chain block', () => {
  assert.deepEqual(
    resolveDelayedBattleDestruction(event(), 11, 'end', target()),
    {
      status: 'destroy',
      eventId: 'event-01',
      targetUid: 'target-uid',
      graveyardTeam: 1,
      chainBlockCreated: false
    }
  );
});

test('face-down targets remain eligible for the scheduled destruction', () => {
  const result = resolveDelayedBattleDestruction(event(), 11, 'end', target({ faceUp: false }));
  assert.equal(result.status, 'destroy');
});

test('a target that left the Monster Zone is not destroyed later', () => {
  assert.deepEqual(
    resolveDelayedBattleDestruction(event(), 11, 'end', target({ zone: 'grave' })),
    { status: 'skipped', eventId: 'event-01', reason: 'target-left-monster-zone' }
  );
});

test('a target that left and re-entered with a new epoch is not mistaken for the old instance', () => {
  assert.deepEqual(
    resolveDelayedBattleDestruction(event(), 11, 'end', target({ epoch: 4 })),
    { status: 'skipped', eventId: 'event-01', reason: 'target-instance-changed' }
  );
});

test('a target that changed control but kept the same physical identity is still destroyed', () => {
  const result = resolveDelayedBattleDestruction(
    event(),
    11,
    'end',
    target({ controllerSeat: 0, faceUp: false })
  );
  assert.equal(result.status, 'destroy');
  assert.equal(result.graveyardTeam, 1);
});

test('the Graveyard destination follows the physical owner team, not the controller team', () => {
  const e = event({ targetPhysicalOwnerSeat: 2, targetPhysicalOwnerTeam: 0 });
  const result = resolveDelayedBattleDestruction(e, 11, 'end', target({ physicalOwnerSeat: 2, controllerSeat: 0 }));
  assert.equal(result.status, 'destroy');
  assert.equal(result.graveyardTeam, 0);
});

test('an event cannot destroy a different physical owner identity', () => {
  assert.deepEqual(
    resolveDelayedBattleDestruction(event(), 11, 'end', target({ physicalOwnerSeat: 3 })),
    { status: 'skipped', eventId: 'event-01', reason: 'physical-owner-changed' }
  );
});

test('events past their due turn expire instead of destroying late', () => {
  assert.deepEqual(
    resolveDelayedBattleDestruction(event(), 12, 'end', target()),
    { status: 'expired', eventId: 'event-01' }
  );
});

test('invalid turns and corrupted event timing are rejected', () => {
  assert.deepEqual(
    resolveDelayedBattleDestruction(event(), 0, 'end', target()),
    { status: 'invalid-event', eventId: 'event-01' }
  );
  assert.deepEqual(
    resolveDelayedBattleDestruction(event({ dueTurn: 12 }), 11, 'end', target()),
    { status: 'invalid-event', eventId: 'event-01' }
  );
});

test('scheduling and resolution do not mutate the attack snapshot, event or target', () => {
  const attack = schedule();
  const beforeAttack = structuredClone(attack);
  const scheduled = scheduleDelayedBattleDestruction(attack);
  assert.equal(scheduled.ok, true);
  assert.deepEqual(attack, beforeAttack);

  const pending = event();
  const beforeEvent = structuredClone(pending);
  const current = target();
  const beforeTarget = structuredClone(current);
  resolveDelayedBattleDestruction(pending, 11, 'end', current);
  assert.deepEqual(pending, beforeEvent);
  assert.deepEqual(current, beforeTarget);
});
