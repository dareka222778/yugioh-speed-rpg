const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  identityTributeEligibility,
  selectIdentityTributes,
} = require('../dist/identityScopedTribute.js');

const LACOODa = '86988864';
const OTHER = '18318842';
const card = (uid, id = LACOODa, faceUp = true) => ({
  uid,
  id,
  faceUp,
  marker: 'physical:' + uid,
});
const threeCopies = () => [
  card('m0:1'),
  card('m2:1'),
  card('m0:2'),
];

test('3-Hump eligibility counts three face-up copies across the shared team field', () => {
  const field = threeCopies();
  const eligibility = identityTributeEligibility(field, 'm2:1', LACOODa, 3, 2);

  assert.ok(eligibility);
  assert.equal(eligibility.candidates.length, 3);
  assert.deepEqual(eligibility.candidates.map(c => c.uid), ['m0:1', 'm2:1', 'm0:2']);
  assert.equal(eligibility.sourceUid, 'm2:1');
  assert.equal(eligibility.tributeCount, 2);
});

test('the activating copy may be one of the two Tributes', () => {
  const field = threeCopies();
  const eligibility = identityTributeEligibility(field, 'm2:1', LACOODa, 3, 2);
  const selected = selectIdentityTributes(eligibility, ['m2:1', 'm0:2']);

  assert.ok(selected);
  assert.deepEqual(selected.map(c => c.uid), ['m2:1', 'm0:2']);
  assert.equal(selected[0], field[1]);
  assert.equal(selected[1], field[2]);
  assert.deepEqual(selected.map(c => c.marker), ['physical:m2:1', 'physical:m0:2']);
});

test('the activating copy may remain while the other two copies are Tributed', () => {
  const field = threeCopies();
  const eligibility = identityTributeEligibility(field, 'm2:1', LACOODa, 3, 2);
  const selected = selectIdentityTributes(eligibility, ['m0:1', 'm0:2']);

  assert.ok(selected);
  assert.deepEqual(selected.map(c => c.uid), ['m0:1', 'm0:2']);
  assert.equal(field[1].uid, 'm2:1');
});

test('two face-up copies are insufficient even if another monster is face-up', () => {
  const field = [card('m0:1'), card('m2:1'), card('m0:2', OTHER)];
  assert.equal(identityTributeEligibility(field, 'm0:1', LACOODa, 3, 2), null);
});

test('a face-down third copy does not satisfy the three-copy condition', () => {
  const field = [card('m0:1'), card('m2:1'), card('m0:2', LACOODa, false)];
  assert.equal(identityTributeEligibility(field, 'm0:1', LACOODa, 3, 2), null);
});

test('the activating source itself must be face-up and match the required identity', () => {
  const field = threeCopies();
  assert.equal(identityTributeEligibility(field, 'm2:1', LACOODa, 3, 2) !== null, true);
  assert.equal(identityTributeEligibility(
    [card('m0:1'), card('m2:1', LACOODa, false), card('m0:2')],
    'm2:1', LACOODa, 3, 2,
  ), null);
  assert.equal(identityTributeEligibility(
    [card('m0:1'), card('m2:1', OTHER), card('m0:2')],
    'm2:1', LACOODa, 3, 2,
  ), null);
});

test('unrelated monsters cannot be selected as payment for the identity-scoped cost', () => {
  const field = threeCopies();
  const eligibility = identityTributeEligibility(field, 'm0:1', LACOODa, 3, 2);

  assert.equal(selectIdentityTributes(eligibility, ['m0:1', 'm9:1']), null);
  assert.equal(selectIdentityTributes(eligibility, ['m0:1', 'm0:1']), null);
});

test('the selection must contain exactly two distinct eligible physical UIDs', () => {
  const eligibility = identityTributeEligibility(threeCopies(), 'm0:1', LACOODa, 3, 2);

  assert.equal(selectIdentityTributes(eligibility, ['m0:1']), null);
  assert.equal(selectIdentityTributes(eligibility, ['m0:1', 'm2:1', 'm0:2']), null);
  assert.equal(selectIdentityTributes(eligibility, []), null);
});

test('re-evaluating eligibility has no hidden once-per-turn state', () => {
  const field = threeCopies();
  const first = identityTributeEligibility(field, 'm0:1', LACOODa, 3, 2);
  const second = identityTributeEligibility(field, 'm0:1', LACOODa, 3, 2);

  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(first.candidates.map(c => c.uid), second.candidates.map(c => c.uid));
});

test('duplicate physical UIDs in the shared field are rejected as an integrity error', () => {
  assert.throws(
    () => identityTributeEligibility(
      [card('m0:1'), card('m0:1'), card('m2:1')],
      'm0:1', LACOODa, 3, 2,
    ),
    /duplicate physical UID/,
  );
});

test('invalid Tribute rule parameters fail closed', () => {
  const field = threeCopies();
  assert.throws(() => identityTributeEligibility(field, 'm0:1', LACOODa, 0, 2), /requiredCopies/);
  assert.throws(() => identityTributeEligibility(field, 'm0:1', LACOODa, 3, 0), /tributeCount/);
  assert.throws(() => identityTributeEligibility(field, 'm0:1', LACOODa, 3, 4), /tributeCount/);
});
