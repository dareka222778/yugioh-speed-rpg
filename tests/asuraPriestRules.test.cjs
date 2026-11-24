const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  ASURA_PRIEST_ID,
  eligibleAsuraPriestTargets,
  recordAsuraPriestTargetAttack,
  asuraPriestSummonAllowed,
  shouldReturnAsuraPriestAtEndPhase
} = require('../dist/asuraPriestRules');

const field = [
  { uid: 'opp-1-face-up', controller: 1, zone: 'monster', faceUp: true },
  { uid: 'opp-3-face-down', controller: 3, zone: 'monster', faceUp: false },
  { uid: 'ally-2', controller: 2, zone: 'monster', faceUp: true },
  { uid: 'opp-backrow', controller: 1, zone: 'spell-trap', faceUp: false },
  { uid: 'opp-field', controller: 3, zone: 'field', faceUp: true }
];

function context(patch = {}) {
  return {
    cardId: ASURA_PRIEST_ID,
    attackerUid: 'asura-0',
    attackerSeat: 0,
    turn: 7,
    opponentSeats: [1, 3],
    opponentMonsters: field,
    ledger: null,
    ...patch
  };
}

test('Asura Priest can attack monsters controlled by both opposing seats', () => {
  assert.deepEqual(
    eligibleAsuraPriestTargets(context()),
    ['opp-1-face-up', 'opp-3-face-down']
  );
});

test('face-down opposing monsters remain eligible; allies and non-monster zones do not', () => {
  const targets = eligibleAsuraPriestTargets(context());
  assert.ok(targets.includes('opp-3-face-down'));
  assert.ok(!targets.includes('ally-2'));
  assert.ok(!targets.includes('opp-backrow'));
  assert.ok(!targets.includes('opp-field'));
});

test('one physical opposing target can be attacked only once per turn', () => {
  const first = recordAsuraPriestTargetAttack(context(), 'opp-1-face-up');
  assert.equal(first.ok, true);
  const next = context({ ledger: first.ledger });
  assert.deepEqual(eligibleAsuraPriestTargets(next), ['opp-3-face-down']);
  assert.deepEqual(
    recordAsuraPriestTargetAttack(next, 'opp-1-face-up'),
    { ok: false, reason: 'already-attacked' }
  );
});

test('a newly summoned opposing monster becomes eligible after earlier targets were attacked', () => {
  const first = recordAsuraPriestTargetAttack(context(), 'opp-1-face-up');
  const expanded = context({
    ledger: first.ledger,
    opponentMonsters: [...field, {
      uid: 'opp-new',
      controller: 1,
      zone: 'monster',
      faceUp: true
    }]
  });
  assert.deepEqual(eligibleAsuraPriestTargets(expanded), ['opp-3-face-down', 'opp-new']);
});

test('the target ledger resets on a new turn', () => {
  const first = recordAsuraPriestTargetAttack(context(), 'opp-1-face-up');
  const nextTurn = context({ turn: 8, ledger: first.ledger });
  assert.deepEqual(
    eligibleAsuraPriestTargets(nextTurn),
    ['opp-1-face-up', 'opp-3-face-down']
  );
});

test('different Asura Priest instances have independent target ledgers', () => {
  const first = recordAsuraPriestTargetAttack(context(), 'opp-1-face-up');
  const otherAttacker = context({ attackerUid: 'asura-2', attackerSeat: 2, opponentSeats: [1, 3], ledger: first.ledger });
  assert.deepEqual(
    eligibleAsuraPriestTargets(otherAttacker),
    ['opp-1-face-up', 'opp-3-face-down']
  );
});

test('duplicate target UIDs in a malformed field are returned only once', () => {
  const duplicated = context({
    opponentMonsters: [...field, { ...field[0] }]
  });
  assert.deepEqual(
    eligibleAsuraPriestTargets(duplicated),
    ['opp-1-face-up', 'opp-3-face-down']
  );
});

test('invalid attacker identity, seats, or turn cannot expose targets', () => {
  assert.deepEqual(eligibleAsuraPriestTargets(context({ cardId: '00000000' })), []);
  assert.deepEqual(eligibleAsuraPriestTargets(context({ attackerUid: '' })), []);
  assert.deepEqual(eligibleAsuraPriestTargets(context({ attackerSeat: 4 })), []);
  assert.deepEqual(eligibleAsuraPriestTargets(context({ turn: Number.MAX_SAFE_INTEGER + 1 })), []);
  assert.deepEqual(eligibleAsuraPriestTargets(context({ opponentSeats: [0, 3] })), []);
  assert.deepEqual(eligibleAsuraPriestTargets(context({ opponentSeats: [1, 1] })), []);
});

test('attack recording rejects wrong card and target outside current opposing field', () => {
  assert.deepEqual(
    recordAsuraPriestTargetAttack(context({ cardId: '00000000' }), 'opp-1-face-up'),
    { ok: false, reason: 'wrong-card' }
  );
  assert.deepEqual(
    recordAsuraPriestTargetAttack(context(), 'ally-2'),
    { ok: false, reason: 'target-not-eligible' }
  );
  assert.deepEqual(
    recordAsuraPriestTargetAttack(context(), ''),
    { ok: false, reason: 'target-not-eligible' }
  );
});

test('attack recording is immutable and preserves earlier attackers', () => {
  const original = context();
  const first = recordAsuraPriestTargetAttack(original, 'opp-1-face-up');
  assert.equal(first.ok, true);
  assert.equal(original.ledger, null);
  const second = recordAsuraPriestTargetAttack(
    context({ ledger: first.ledger }),
    'opp-3-face-down'
  );
  assert.equal(second.ok, true);
  assert.deepEqual(first.ledger.byAttacker['asura-0'], ['opp-1-face-up']);
  assert.deepEqual(second.ledger.byAttacker['asura-0'], ['opp-1-face-up', 'opp-3-face-down']);
});

test('Asura Priest cannot be Special Summoned but may be Normal or Flip Summoned', () => {
  assert.equal(asuraPriestSummonAllowed(ASURA_PRIEST_ID, 'normal'), true);
  assert.equal(asuraPriestSummonAllowed(ASURA_PRIEST_ID, 'flip'), true);
  assert.equal(asuraPriestSummonAllowed(ASURA_PRIEST_ID, 'special'), false);
  assert.equal(asuraPriestSummonAllowed('00000000', 'special'), true);
});

test('Spirit return is due in the End Phase of the Normal Summon turn', () => {
  assert.equal(shouldReturnAsuraPriestAtEndPhase({
    cardId: ASURA_PRIEST_ID,
    turn: 7,
    phase: 'end',
    inMonsterZone: true,
    normalSummonedTurn: 7
  }), true);
});

test('Spirit return is due in the End Phase of the turn it was flipped face-up', () => {
  assert.equal(shouldReturnAsuraPriestAtEndPhase({
    cardId: ASURA_PRIEST_ID,
    turn: 7,
    phase: 'end',
    inMonsterZone: true,
    flippedFaceUpTurn: 7
  }), true);
});

test('Spirit return is not due in another turn, phase, zone, or for another card', () => {
  const base = {
    cardId: ASURA_PRIEST_ID,
    turn: 7,
    phase: 'end',
    inMonsterZone: true,
    normalSummonedTurn: 6,
    flippedFaceUpTurn: null
  };
  assert.equal(shouldReturnAsuraPriestAtEndPhase({ ...base, turn: 8 }), false);
  assert.equal(shouldReturnAsuraPriestAtEndPhase({ ...base, phase: 'main' }), false);
  assert.equal(shouldReturnAsuraPriestAtEndPhase({ ...base, inMonsterZone: false }), false);
  assert.equal(shouldReturnAsuraPriestAtEndPhase({ ...base, cardId: '00000000' }), false);
});
