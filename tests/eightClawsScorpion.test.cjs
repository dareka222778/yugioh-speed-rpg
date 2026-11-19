'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  EIGHT_CLAWS_SCORPION_ID,
  EIGHT_CLAWS_SCORPION_DAMAGE_CALCULATION_ATK,
  canEightClawsScorpionSetItself,
  setEightClawsScorpionFaceDown,
  eightClawsScorpionDamageCalculationAtk,
} = require('../dist/eightClawsScorpion.js');

function scorpion(overrides = {}) {
  return {
    uid: 'm0:scorpion',
    id: EIGHT_CLAWS_SCORPION_ID,
    faceUp: true,
    position: 'atk',
    changed: 1,
    ...overrides,
  };
}
function damage(overrides = {}) {
  return {
    sourceCardId: EIGHT_CLAWS_SCORPION_ID,
    sourceUid: 'm0:scorpion',
    attackerUid: 'm0:scorpion',
    sourceFaceUp: true,
    target: { uid: 'm1:hidden-defender', faceUp: false, position: 'def' },
    targetWasFaceDownDefense: true,
    step: 'calculation',
    ...overrides,
  };
}

test('Eight-Claws Scorpion may turn itself face-down in Defense during Main Phase', () => {
  assert.equal(canEightClawsScorpionSetItself(scorpion(), 'main', 2), true);
});

test('the position effect preserves UID/owner metadata and records the once-per-turn use', () => {
  const source = scorpion({ owner: 0, marker: 'physical-card' });
  const next = setEightClawsScorpionFaceDown(source, 'main', 2);
  assert.equal(next.faceUp, false);
  assert.equal(next.position, 'def');
  assert.equal(next.uid, source.uid);
  assert.equal(next.owner, 0);
  assert.equal(next.marker, 'physical-card');
  assert.equal(next.changed, 2);
  assert.equal(next.effectUsedTurn, 2);
  assert.equal(source.faceUp, true);
  assert.equal(source.position, 'atk');
  assert.equal(source.effectUsedTurn, undefined);
});

test('the position effect is not offered outside Main Phase or while already face-down', () => {
  assert.equal(canEightClawsScorpionSetItself(scorpion(), 'battle', 2), false);
  assert.equal(canEightClawsScorpionSetItself(scorpion(), 'end', 2), false);
  assert.equal(canEightClawsScorpionSetItself(scorpion({ faceUp: false }), 'main', 2), false);
});

test('the effect is once per turn and cannot bypass an explicit position lock', () => {
  assert.equal(canEightClawsScorpionSetItself(
    scorpion({ effectUsedTurn: 2 }), 'main', 2,
  ), false);
  assert.equal(canEightClawsScorpionSetItself(
    scorpion({ positionLockedThrough: 2 }), 'main', 2,
  ), false);
  assert.equal(canEightClawsScorpionSetItself(
    scorpion({ positionLockedThrough: 1 }), 'main', 2,
  ), true);
});

test('the position effect respects effect negation and rejects another card identity', () => {
  assert.equal(canEightClawsScorpionSetItself(scorpion(), 'main', 2, true), false);
  assert.equal(canEightClawsScorpionSetItself(
    scorpion({ id: 'not-scorpion' }), 'main', 2,
  ), false);
});

test('invalid turn and negation inputs are rejected', () => {
  assert.throws(() => canEightClawsScorpionSetItself(scorpion(), 'main', 0), /positive safe integer/);
  assert.throws(() => canEightClawsScorpionSetItself(scorpion(), 'main', 2, 'false'), /negation state/);
  assert.throws(() => canEightClawsScorpionSetItself(
    scorpion({ positionLockedThrough: 'later' }), 'main', 2,
  ), /metadata is invalid/);
});

test('the Scorpion ATK override is exactly 2400 only during Damage Calculation', () => {
  assert.equal(eightClawsScorpionDamageCalculationAtk(damage()), 2400);
  assert.equal(EIGHT_CLAWS_SCORPION_DAMAGE_CALCULATION_ATK, 2400);
});

test('the ATK value is a fixed override, not an additive 2400 bonus', () => {
  const currentAtk = 300;
  const result = eightClawsScorpionDamageCalculationAtk(damage());
  assert.equal(result, 2400);
  assert.notEqual(result, currentAtk + 2400);
});

test('the target may be revealed during calculation if it was face-down Defense at declaration', () => {
  assert.equal(eightClawsScorpionDamageCalculationAtk(damage({
    target: { uid: 'm1:revealed-defender', faceUp: true, position: 'def' },
    targetWasFaceDownDefense: true,
  })), 2400);
  assert.equal(eightClawsScorpionDamageCalculationAtk(damage({
    targetWasFaceDownDefense: false,
  })), null);
});

test('face-up Defense and face-down Attack at declaration do not qualify', () => {
  assert.equal(eightClawsScorpionDamageCalculationAtk(damage({
    target: { uid: 'm1:face-up-def', faceUp: true, position: 'def' },
    targetWasFaceDownDefense: false,
  })), null);
  assert.equal(eightClawsScorpionDamageCalculationAtk(damage({
    target: { uid: 'm1:face-down-atk', faceUp: false, position: 'atk' },
    targetWasFaceDownDefense: false,
  })), null);
});

test('the override is absent before Damage Calculation', () => {
  for (const step of ['declare', 'damage']) {
    assert.equal(eightClawsScorpionDamageCalculationAtk(damage({ step })), null);
  }
});

test('the effect applies only when Scorpion itself is the attacking monster', () => {
  assert.equal(eightClawsScorpionDamageCalculationAtk(damage({
    attackerUid: 'm2:other-attacker',
  })), null);
  assert.equal(eightClawsScorpionDamageCalculationAtk(damage({
    sourceFaceUp: false,
  })), null);
});

test('effect negation and unrelated card identities suppress the override', () => {
  assert.equal(eightClawsScorpionDamageCalculationAtk(damage({
    effectsNegated: true,
  })), null);
  assert.equal(eightClawsScorpionDamageCalculationAtk(damage({
    sourceCardId: 'not-scorpion',
  })), null);
});

test('the target cannot be the source monster itself', () => {
  assert.equal(eightClawsScorpionDamageCalculationAtk(damage({
    target: { uid: 'm0:scorpion', faceUp: false, position: 'def' },
  })), null);
});

test('malformed Damage Calculation payloads fail closed', () => {
  assert.throws(() => eightClawsScorpionDamageCalculationAtk(damage({
    target: { uid: '', faceUp: false, position: 'def' },
  })), /input is invalid/);
  assert.throws(() => eightClawsScorpionDamageCalculationAtk(damage({
    step: 'battle',
  })), /input is invalid/);
});
