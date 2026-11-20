const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BERSERK_GORILLA_ID,
  DARK_ZEBRA_ID,
  planDarkZebraStandbyPosition,
  planBerserkGorillaRule
} = require('../dist/positionRulesFamily');

function zebra(overrides = {}) {
  return {
    cardId: DARK_ZEBRA_ID,
    uid: 'dark-zebra-uid',
    controllerSeat: 0,
    turn: 5,
    phase: 'standby',
    faceUp: true,
    position: 'attack',
    teamControlledCardCount: 1,
    ...overrides
  };
}

function gorilla(overrides = {}) {
  return {
    cardId: BERSERK_GORILLA_ID,
    uid: 'berserk-gorilla-uid',
    faceUp: true,
    position: 'attack',
    canAttack: true,
    ...overrides
  };
}

test('Dark Zebra changes to Defense when it is the only card controlled by its team', () => {
  assert.deepEqual(planDarkZebraStandbyPosition(zebra()), {
    ok: true,
    action: 'set-defense',
    team: 0,
    uid: 'dark-zebra-uid',
    changed: true,
    position: 'defense',
    positionChangeLockedForTurn: 5,
    countsPartnerControlledCards: true
  });
});

test('a partner-controlled card also prevents Dark Zebra from being the only card', () => {
  const result = planDarkZebraStandbyPosition(zebra({ controllerSeat: 2, teamControlledCardCount: 2 }));
  assert.deepEqual(result, {
    ok: true,
    action: 'no-change',
    reason: 'another-team-card-is-controlled',
    team: 0,
    uid: 'dark-zebra-uid'
  });
});

test('any other team-controlled card, including a Spell/Trap, prevents the position change', () => {
  const result = planDarkZebraStandbyPosition(zebra({ teamControlledCardCount: 2 }));
  assert.equal(result.ok, true);
  assert.equal(result.action, 'no-change');
});

test('Dark Zebra locks the position for the turn even if already in Defense Position', () => {
  const result = planDarkZebraStandbyPosition(zebra({ position: 'defense' }));
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.positionChangeLockedForTurn, 5);
});

test('Dark Zebra does not apply while face-down', () => {
  assert.deepEqual(
    planDarkZebraStandbyPosition(zebra({ faceUp: false })),
    { ok: false, reason: 'not-face-up' }
  );
});

test('Dark Zebra only checks during the Standby Phase', () => {
  assert.deepEqual(
    planDarkZebraStandbyPosition(zebra({ phase: 'main' })),
    { ok: false, reason: 'not-standby-phase' }
  );
});

test('negating Dark Zebra prevents the automatic position change and lock', () => {
  assert.deepEqual(
    planDarkZebraStandbyPosition(zebra({ effectNegated: true })),
    { ok: false, reason: 'effect-negated' }
  );
});

test('the shared 3+3+Field layout bounds the controlled-card count at seven', () => {
  assert.deepEqual(
    planDarkZebraStandbyPosition(zebra({ teamControlledCardCount: 8 })),
    { ok: false, reason: 'invalid-context' }
  );
});

test('Berserk Gorilla destroys itself when face-up in Defense Position', () => {
  assert.deepEqual(planBerserkGorillaRule(gorilla({ position: 'defense' })), {
    ok: true,
    action: 'destroy-self',
    uid: 'berserk-gorilla-uid',
    timing: 'state-check',
    chainLinkCreated: false
  });
});

test('Berserk Gorilla does not destroy itself while face-down in Defense Position', () => {
  assert.deepEqual(
    planBerserkGorillaRule(gorilla({ faceUp: false, position: 'defense' })),
    { ok: true, action: 'no-effect', uid: 'berserk-gorilla-uid', reason: 'face-down' }
  );
});

test('Berserk Gorilla must attack if at least one legal attack is available', () => {
  assert.deepEqual(planBerserkGorillaRule(gorilla()), {
    ok: true,
    action: 'must-attack',
    uid: 'berserk-gorilla-uid',
    requiredBefore: 'battle-phase-end',
    targetSelection: 'player-choice'
  });
});

test('Berserk Gorilla does not force an illegal attack when no attack is available', () => {
  assert.deepEqual(
    planBerserkGorillaRule(gorilla({ canAttack: false })),
    { ok: true, action: 'no-forced-attack', uid: 'berserk-gorilla-uid', reason: 'cannot-legally-attack' }
  );
});

test('negating Berserk Gorilla disables both continuous rules', () => {
  assert.deepEqual(
    planBerserkGorillaRule(gorilla({ position: 'defense', effectNegated: true })),
    { ok: true, action: 'no-effect', uid: 'berserk-gorilla-uid', reason: 'effect-negated' }
  );
});

test('Berserk Gorilla does not choose an attack target automatically', () => {
  const result = planBerserkGorillaRule(gorilla());
  assert.equal(result.ok, true);
  assert.equal(result.action, 'must-attack');
  assert.equal(result.targetSelection, 'player-choice');
});

test('both helpers reject an unrelated card identity', () => {
  assert.deepEqual(
    planDarkZebraStandbyPosition(zebra({ cardId: '00000000' })),
    { ok: false, reason: 'wrong-card' }
  );
  assert.deepEqual(
    planBerserkGorillaRule(gorilla({ cardId: '00000000' })),
    { ok: false, reason: 'wrong-card' }
  );
});

test('invalid seats, turns and UIDs are rejected', () => {
  assert.deepEqual(
    planDarkZebraStandbyPosition(zebra({ controllerSeat: 4 })),
    { ok: false, reason: 'invalid-context' }
  );
  assert.deepEqual(
    planDarkZebraStandbyPosition(zebra({ turn: 0 })),
    { ok: false, reason: 'invalid-context' }
  );
  assert.deepEqual(
    planBerserkGorillaRule(gorilla({ uid: '' })),
    { ok: false, reason: 'invalid-context' }
  );
});

test('the planning helpers do not mutate their inputs', () => {
  const z = zebra();
  const g = gorilla();
  const beforeZ = structuredClone(z);
  const beforeG = structuredClone(g);
  planDarkZebraStandbyPosition(z);
  planBerserkGorillaRule(g);
  assert.deepEqual(z, beforeZ);
  assert.deepEqual(g, beforeG);
});
