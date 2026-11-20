const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  canEightClawsScorpionFlipDown,
  resolveEightClawsScorpionDamageCalculation,
} = require('../dist/eightClawsScorpion.js');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'evidence', 'm400-eight-claws-scorpion.json'),
  'utf8',
));

test('8-Claws Scorpion can use its self-flip during a legal position-change window', () => {
  assert.equal(canEightClawsScorpionFlipDown({
    sourceFaceUp: true,
    effectNegated: false,
    usedThisTurn: false,
    legalPositionChangeWindow: true,
  }), true);
});

test('8-Claws Scorpion cannot self-flip while already face-down', () => {
  assert.equal(canEightClawsScorpionFlipDown({
    sourceFaceUp: false,
    effectNegated: false,
    usedThisTurn: false,
    legalPositionChangeWindow: true,
  }), false);
});

test('8-Claws Scorpion self-flip is unavailable while its effect is negated', () => {
  assert.equal(canEightClawsScorpionFlipDown({
    sourceFaceUp: true,
    effectNegated: true,
    usedThisTurn: false,
    legalPositionChangeWindow: true,
  }), false);
});

test('8-Claws Scorpion self-flip is once per turn', () => {
  assert.equal(canEightClawsScorpionFlipDown({
    sourceFaceUp: true,
    effectNegated: false,
    usedThisTurn: true,
    legalPositionChangeWindow: true,
  }), false);
});

test('8-Claws Scorpion self-flip does not bypass a closed position-change window', () => {
  assert.equal(canEightClawsScorpionFlipDown({
    sourceFaceUp: true,
    effectNegated: false,
    usedThisTurn: false,
    legalPositionChangeWindow: false,
  }), false);
});

test('8-Claws Scorpion becomes 2400 ATK only while attacking face-down Defense', () => {
  const result = resolveEightClawsScorpionDamageCalculation({
    baseAtk: 300,
    isAttacking: true,
    targetFaceUp: false,
    targetPosition: 'def',
    effectNegated: false,
  });
  assert.equal(result.calculatedAtk, 2400);
  assert.equal(result.persistentAtk, 300);
  assert.equal(result.temporary, true);
  assert.equal(result.clearAfterDamageCalculation, true);
});

test('8-Claws Scorpion does not gain 2400 ATK against face-up Defense', () => {
  const result = resolveEightClawsScorpionDamageCalculation({
    baseAtk: 300,
    isAttacking: true,
    targetFaceUp: true,
    targetPosition: 'def',
    effectNegated: false,
  });
  assert.equal(result.calculatedAtk, 300);
  assert.equal(result.temporary, false);
});

test('8-Claws Scorpion does not gain 2400 ATK against an Attack Position target', () => {
  const result = resolveEightClawsScorpionDamageCalculation({
    baseAtk: 300,
    isAttacking: true,
    targetFaceUp: false,
    targetPosition: 'atk',
    effectNegated: false,
  });
  assert.equal(result.calculatedAtk, 300);
  assert.equal(result.temporary, false);
});

test('8-Claws Scorpion does not gain 2400 ATK while defending', () => {
  const result = resolveEightClawsScorpionDamageCalculation({
    baseAtk: 300,
    isAttacking: false,
    targetFaceUp: false,
    targetPosition: 'def',
    effectNegated: false,
  });
  assert.equal(result.calculatedAtk, 300);
  assert.equal(result.temporary, false);
});

test('8-Claws Scorpion loses the temporary calculation bonus when its effect is negated', () => {
  const result = resolveEightClawsScorpionDamageCalculation({
    baseAtk: 300,
    isAttacking: true,
    targetFaceUp: false,
    targetPosition: 'def',
    effectNegated: true,
  });
  assert.equal(result.calculatedAtk, 300);
  assert.equal(result.persistentAtk, 300);
  assert.equal(result.temporary, false);
});

test('the 2400 calculation never mutates the source monster or its persistent ATK', () => {
  const source = { uid: 'm0:scorpion', atk: 300, atkBoost: 0 };
  const before = JSON.stringify(source);
  const result = resolveEightClawsScorpionDamageCalculation({
    baseAtk: source.atk + source.atkBoost,
    isAttacking: true,
    targetFaceUp: false,
    targetPosition: 'def',
    effectNegated: false,
  });
  assert.equal(result.calculatedAtk, 2400);
  assert.equal(JSON.stringify(source), before);
});

test('8-Claws Scorpion preserves any existing calculated base ATK when the condition is absent', () => {
  const result = resolveEightClawsScorpionDamageCalculation({
    baseAtk: 850,
    isAttacking: true,
    targetFaceUp: true,
    targetPosition: 'def',
    effectNegated: false,
  });
  assert.equal(result.calculatedAtk, 850);
  assert.equal(result.persistentAtk, 850);
});

test('8-Claws Scorpion rejects negative and unsafe ATK inputs', () => {
  assert.throws(() => resolveEightClawsScorpionDamageCalculation({
    baseAtk: -1,
    isAttacking: true,
    targetFaceUp: false,
    targetPosition: 'def',
    effectNegated: false,
  }), /non-negative safe integer/);
  assert.throws(() => resolveEightClawsScorpionDamageCalculation({
    baseAtk: Number.MAX_SAFE_INTEGER + 1,
    isAttacking: true,
    targetFaceUp: false,
    targetPosition: 'def',
    effectNegated: false,
  }), /non-negative safe integer/);
});

test('M400 evidence records the official source and keeps the card uncertified', () => {
  assert.equal(evidence.mission, 'M400');
  assert.equal(evidence.card.id, '14261867');
  assert.equal(evidence.card.sourceVerified, true);
  assert.match(evidence.card.officialSourceUrl, /^https:\/\/www\.db\.yugioh-card\.com\//);
  assert.equal(evidence.card.historicalEligibility, 'pending OCG/TCG first-release audit');
  assert.equal(evidence.card.certificationStatus, 'not-certified');
  assert.equal(evidence.card.automaticCertification, false);
});
