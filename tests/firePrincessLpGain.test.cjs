const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  FIRE_PRINCESS_CARD_ID,
  resolveFirePrincessLpGain,
} = require('../dist/firePrincessLpGain.js');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'evidence', 'm403-fire-princess-lp-gain.json'),
  'utf8',
));

const princess = (overrides = {}) => ({
  uid: 's0:fire-princess-1',
  cardId: FIRE_PRINCESS_CARD_ID,
  physicalOwnerSeat: 0,
  controllerTeam: 0,
  zone: 'monster',
  faceUp: true,
  effectNegated: false,
  ...overrides,
});

const input = (overrides = {}) => ({
  eventId: 'lp-event-1',
  gainingTeam: 0,
  opposingTeam: 1,
  lpGained: 1200,
  teamLifePointsAfterGain: [5200, 4000],
  firePrincesses: [princess()],
  ...overrides,
});

test('one eligible Fire Princess inflicts exactly 500 damage after a positive LP gain', () => {
  const result = resolveFirePrincessLpGain(input());
  assert.equal(result.triggered, true);
  assert.equal(result.triggerCount, 1);
  assert.equal(result.requestedDamage, 500);
  assert.equal(result.appliedDamage, 500);
  assert.deepEqual(result.teamLifePointsAfterDamage, [5200, 3500]);
});

test('damage is fixed at 500 and is not multiplied by the amount of LP gained', () => {
  const result = resolveFirePrincessLpGain(input({ lpGained: 5000 }));
  assert.equal(result.requestedDamage, 500);
});

test('two eligible copies each inflict 500 damage for the same LP gain event', () => {
  const result = resolveFirePrincessLpGain(input({
    firePrincesses: [princess(), princess({ uid: 's2:fire-princess-2', physicalOwnerSeat: 2 })],
  }));
  assert.equal(result.triggerCount, 2);
  assert.equal(result.requestedDamage, 1000);
  assert.deepEqual(result.teamLifePointsAfterDamage, [5200, 3000]);
});

test('three eligible copies inflict 1500 damage in total', () => {
  const result = resolveFirePrincessLpGain(input({
    firePrincesses: [
      princess(),
      princess({ uid: 's2:fire-princess-2', physicalOwnerSeat: 2 }),
      princess({ uid: 's0:fire-princess-3' }),
    ],
  }));
  assert.equal(result.triggerCount, 3);
  assert.equal(result.requestedDamage, 1500);
});

test('team 0 LP gain damages team 1 only', () => {
  const result = resolveFirePrincessLpGain(input({
    teamLifePointsAfterGain: [6000, 2600],
  }));
  assert.deepEqual(result.teamLifePointsAfterDamage, [6000, 2100]);
});

test('team 1 LP gain damages team 0 only', () => {
  const result = resolveFirePrincessLpGain(input({
    gainingTeam: 1,
    opposingTeam: 0,
    teamLifePointsAfterGain: [2600, 6000],
    firePrincesses: [princess({ physicalOwnerSeat: 1, controllerTeam: 1 })],
  }));
  assert.deepEqual(result.teamLifePointsAfterDamage, [2100, 6000]);
  assert.equal(result.recipientTeam, 0);
});

test('does not trigger when the opposing team gains LP', () => {
  const result = resolveFirePrincessLpGain(input({
    gainingTeam: 1,
    opposingTeam: 0,
  }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'no-eligible-fire-princess');
  assert.deepEqual(result.teamLifePointsAfterDamage, [5200, 4000]);
});

test('does not trigger when the LP gain amount is zero', () => {
  const result = resolveFirePrincessLpGain(input({ lpGained: 0 }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'no-lp-gain');
  assert.equal(result.requestedDamage, 0);
});

test('does not trigger for a face-down Fire Princess', () => {
  const result = resolveFirePrincessLpGain(input({
    firePrincesses: [princess({ faceUp: false })],
  }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'no-eligible-fire-princess');
});

test('does not trigger for a Fire Princess in the Graveyard', () => {
  const result = resolveFirePrincessLpGain(input({
    firePrincesses: [princess({ zone: 'graveyard' })],
  }));
  assert.equal(result.triggered, false);
});

test('does not trigger for a Fire Princess in the hand', () => {
  const result = resolveFirePrincessLpGain(input({
    firePrincesses: [princess({ zone: 'hand' })],
  }));
  assert.equal(result.triggered, false);
});

test('does not trigger when Fire Princess effect is negated', () => {
  const result = resolveFirePrincessLpGain(input({
    firePrincesses: [princess({ effectNegated: true })],
  }));
  assert.equal(result.triggered, false);
});

test('ignores non-Fire Princess monsters on the field', () => {
  const result = resolveFirePrincessLpGain(input({
    firePrincesses: [princess({ cardId: '12345678' })],
  }));
  assert.equal(result.triggered, false);
});

test('does not trigger when no Fire Princess is controlled by the gaining team', () => {
  const result = resolveFirePrincessLpGain(input({
    firePrincesses: [princess({ controllerTeam: 1, physicalOwnerSeat: 1 })],
  }));
  assert.equal(result.triggered, false);
});

test('uses controller team rather than physical owner seat', () => {
  const result = resolveFirePrincessLpGain(input({
    firePrincesses: [princess({ physicalOwnerSeat: 3, controllerTeam: 0 })],
  }));
  assert.equal(result.triggered, true);
  assert.equal(result.triggerSources[0].physicalOwnerSeat, 3);
  assert.equal(result.recipientTeam, 1);
});

test('two physical owners on the gaining team each trigger their own copy', () => {
  const result = resolveFirePrincessLpGain(input({
    firePrincesses: [
      princess({ physicalOwnerSeat: 0 }),
      princess({ uid: 's2:fire-princess-2', physicalOwnerSeat: 2 }),
    ],
  }));
  assert.equal(result.triggerCount, 2);
  assert.deepEqual(result.triggerSources.map(x => x.physicalOwnerSeat), [0, 2]);
});

test('does not replay an already processed LP gain event', () => {
  const result = resolveFirePrincessLpGain(input({ processedEventIds: ['lp-event-1'] }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'duplicate-event');
  assert.equal(result.requestedDamage, 0);
  assert.deepEqual(result.teamLifePointsAfterDamage, [5200, 4000]);
});

test('has no once-per-turn restriction across distinct LP gain events', () => {
  const first = resolveFirePrincessLpGain(input({ eventId: 'lp-event-1' }));
  const second = resolveFirePrincessLpGain(input({
    eventId: 'lp-event-2',
    teamLifePointsAfterGain: first.teamLifePointsAfterDamage,
  }));
  assert.equal(first.appliedDamage, 500);
  assert.equal(second.appliedDamage, 500);
  assert.deepEqual(second.teamLifePointsAfterDamage, [5200, 3000]);
});

test('clamps opposing team LP at zero and reports excess damage', () => {
  const result = resolveFirePrincessLpGain(input({
    firePrincesses: [
      princess(),
      princess({ uid: 's2:fire-princess-2', physicalOwnerSeat: 2 }),
      princess({ uid: 's0:fire-princess-3' }),
    ],
    teamLifePointsAfterGain: [5200, 600],
  }));
  assert.equal(result.requestedDamage, 1500);
  assert.equal(result.appliedDamage, 600);
  assert.equal(result.overkillDamage, 900);
  assert.deepEqual(result.teamLifePointsAfterDamage, [5200, 0]);
});

test('does not mutate the input LP tuple or Fire Princess snapshots', () => {
  const teamLifePointsAfterGain = [5200, 4000];
  const firePrincesses = [princess()];
  const beforeLP = [...teamLifePointsAfterGain];
  const beforeCards = JSON.stringify(firePrincesses);
  const result = resolveFirePrincessLpGain(input({ teamLifePointsAfterGain, firePrincesses }));
  assert.deepEqual(teamLifePointsAfterGain, beforeLP);
  assert.equal(JSON.stringify(firePrincesses), beforeCards);
  assert.notEqual(result.teamLifePointsAfterDamage, teamLifePointsAfterGain);
});

test('rejects a blank event ID', () => {
  assert.throws(() => resolveFirePrincessLpGain(input({ eventId: ' ' })), /eventId is required/);
});

test('rejects identical gaining and opposing teams', () => {
  assert.throws(
    () => resolveFirePrincessLpGain(input({ gainingTeam: 0, opposingTeam: 0 })),
    /must differ/,
  );
});

test('rejects negative, fractional, or unsafe LP gain amounts', () => {
  for (const lpGained of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => resolveFirePrincessLpGain(input({ lpGained })), /non-negative safe integer/);
  }
});

test('rejects invalid seat and team data in a Fire Princess snapshot', () => {
  assert.throws(
    () => resolveFirePrincessLpGain(input({ firePrincesses: [princess({ physicalOwnerSeat: 4 })] })),
    /seat from 0 to 3/,
  );
  assert.throws(
    () => resolveFirePrincessLpGain(input({ firePrincesses: [princess({ controllerTeam: 2 })] })),
    /team 0 or 1/,
  );
});

test('rejects duplicate physical UIDs in the field snapshot', () => {
  assert.throws(
    () => resolveFirePrincessLpGain(input({
      firePrincesses: [princess(), princess({ physicalOwnerSeat: 2 })],
    })),
    /duplicate physical UID/,
  );
});

test('rejects invalid zone and non-boolean visibility/negation flags', () => {
  assert.throws(
    () => resolveFirePrincessLpGain(input({ firePrincesses: [princess({ zone: 'field' })] })),
    /invalid Fire Princess zone/,
  );
  assert.throws(
    () => resolveFirePrincessLpGain(input({ firePrincesses: [princess({ faceUp: undefined })] })),
    /flags must be boolean/,
  );
  assert.throws(
    () => resolveFirePrincessLpGain(input({ firePrincesses: [princess({ effectNegated: 0 })] })),
    /flags must be boolean/,
  );
});

test('rejects malformed team LP tuple and processed event list', () => {
  assert.throws(
    () => resolveFirePrincessLpGain(input({ teamLifePointsAfterGain: [5200] })),
    /exactly two team totals/,
  );
  assert.throws(
    () => resolveFirePrincessLpGain(input({ processedEventIds: 'lp-event-1' })),
    /processedEventIds must be an array/,
  );
});

test('M403 evidence is official-source-linked and remains uncertified', () => {
  assert.equal(evidence.mission, 'M403');
  assert.equal(evidence.card.id, '64752646');
  assert.equal(evidence.card.konamiDatabaseCid, 5197);
  assert.equal(evidence.card.officialTextVerified, true);
  assert.match(evidence.card.officialSourceUrl, /cid=5197/);
  assert.equal(evidence.card.firstTcgRelease, '2003-03-01');
  assert.equal(evidence.validation.certificationStatus, 'not-certified');
  assert.equal(evidence.validation.automaticCertification, false);
});
