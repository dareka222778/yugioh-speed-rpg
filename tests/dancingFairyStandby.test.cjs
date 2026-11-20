const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DANCING_FAIRY_CARD_ID,
  DANCING_FAIRY_STANDBY_GAIN,
  resolveDancingFairyStandbyGain,
} = require('../dist/dancingFairyStandby.js');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'evidence', 'm405-dancing-fairy-standby-lp.json'),
  'utf8',
));

const fairy = (overrides = {}) => ({
  uid: 's0:monster:dancing-fairy-1',
  cardId: DANCING_FAIRY_CARD_ID,
  physicalOwnerSeat: 0,
  controllerTeam: 0,
  zone: 'monster',
  faceUp: true,
  position: 'defense',
  effectNegated: false,
  ...overrides,
});

const input = (overrides = {}) => ({
  eventId: 'turn-1:team-0:standby',
  activeTeam: 0,
  teamLifePointsBefore: [4000, 4000],
  dancingFairies: [fairy()],
  processedEventIds: [],
  ...overrides,
});

test('gains exactly 1000 LP when Dancing Fairy remains face-up in Defense Position during its controller team Standby Phase', () => {
  const result = resolveDancingFairyStandbyGain(input());
  assert.equal(result.triggered, true);
  assert.equal(result.reason, 'resolved');
  assert.equal(result.triggerCount, 1);
  assert.equal(result.requestedGain, 1000);
  assert.equal(result.appliedGain, 1000);
  assert.equal(result.recipientTeam, 0);
  assert.deepEqual(result.teamLifePointsAfter, [5000, 4000]);
});

test('routes the gain to team 1 without changing team 0 LP', () => {
  const result = resolveDancingFairyStandbyGain(input({
    activeTeam: 1,
    teamLifePointsBefore: [2700, 3500],
    dancingFairies: [fairy({ physicalOwnerSeat: 1, controllerTeam: 1 })],
  }));
  assert.equal(result.recipientTeam, 1);
  assert.deepEqual(result.teamLifePointsAfter, [2700, 4500]);
});

test('stacks one 1000 LP gain for each eligible copy on the shared team field', () => {
  const result = resolveDancingFairyStandbyGain(input({
    dancingFairies: [
      fairy(),
      fairy({ uid: 's2:monster:dancing-fairy-2', physicalOwnerSeat: 2 }),
    ],
  }));
  assert.equal(result.triggerCount, 2);
  assert.equal(result.requestedGain, 2000);
  assert.deepEqual(result.teamLifePointsAfter, [6000, 4000]);
});

test('uses the current controller team rather than the physical owner seat', () => {
  const result = resolveDancingFairyStandbyGain(input({
    dancingFairies: [fairy({ physicalOwnerSeat: 2, controllerTeam: 0 })],
  }));
  assert.equal(result.triggerSources[0].physicalOwnerSeat, 2);
  assert.equal(result.recipientTeam, 0);
  assert.deepEqual(result.teamLifePointsAfter, [5000, 4000]);
});

test('does not trigger for a copy controlled by the opposing team', () => {
  const result = resolveDancingFairyStandbyGain(input({
    dancingFairies: [fairy({ physicalOwnerSeat: 1, controllerTeam: 1 })],
  }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'no-eligible-copy');
  assert.deepEqual(result.teamLifePointsAfter, [4000, 4000]);
});

test('does not trigger while the copy is in face-up Attack Position', () => {
  const result = resolveDancingFairyStandbyGain(input({
    dancingFairies: [fairy({ position: 'attack' })],
  }));
  assert.equal(result.triggered, false);
});

test('does not trigger while the copy is face-down in Defense Position', () => {
  const result = resolveDancingFairyStandbyGain(input({
    dancingFairies: [fairy({ faceUp: false })],
  }));
  assert.equal(result.triggered, false);
});

test('does not trigger if the copy left the Monster Zone before resolution', () => {
  const result = resolveDancingFairyStandbyGain(input({
    dancingFairies: [fairy({ zone: 'graveyard' })],
  }));
  assert.equal(result.triggered, false);
});

test('does not trigger while the effect is negated', () => {
  const result = resolveDancingFairyStandbyGain(input({
    dancingFairies: [fairy({ effectNegated: true })],
  }));
  assert.equal(result.triggered, false);
});

test('ignores eligible-looking copies controlled by the other team during this Standby Phase', () => {
  const result = resolveDancingFairyStandbyGain(input({
    activeTeam: 0,
    dancingFairies: [
      fairy(),
      fairy({ uid: 's1:monster:dancing-fairy-2', physicalOwnerSeat: 1, controllerTeam: 1 }),
    ],
  }));
  assert.equal(result.triggerCount, 1);
  assert.deepEqual(result.teamLifePointsAfter, [5000, 4000]);
});

test('allows a new Standby Phase event to resolve again after an earlier event was processed', () => {
  const first = resolveDancingFairyStandbyGain(input({ eventId: 'turn-1:team-0:standby' }));
  const second = resolveDancingFairyStandbyGain(input({
    eventId: 'turn-3:team-0:standby',
    teamLifePointsBefore: first.teamLifePointsAfter,
    processedEventIds: ['turn-1:team-0:standby'],
  }));
  assert.equal(first.appliedGain, 1000);
  assert.equal(second.appliedGain, 1000);
  assert.deepEqual(second.teamLifePointsAfter, [6000, 4000]);
});

test('does not replay the same Standby Phase event ID', () => {
  const result = resolveDancingFairyStandbyGain(input({
    processedEventIds: ['turn-1:team-0:standby'],
  }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'duplicate-event');
  assert.equal(result.requestedGain, 0);
  assert.deepEqual(result.teamLifePointsAfter, [4000, 4000]);
});

test('preserves each physical UID and owner in the trigger receipt', () => {
  const result = resolveDancingFairyStandbyGain(input({
    dancingFairies: [
      fairy({ uid: 'seat-0-copy', physicalOwnerSeat: 0 }),
      fairy({ uid: 'seat-2-copy', physicalOwnerSeat: 2 }),
    ],
  }));
  assert.deepEqual(result.triggerSources.map((source) => source.uid), ['seat-0-copy', 'seat-2-copy']);
  assert.deepEqual(result.triggerSources.map((source) => source.physicalOwnerSeat), [0, 2]);
});

test('does not mutate the input LP tuple or card snapshots', () => {
  const teamLifePointsBefore = [4000, 3000];
  const dancingFairies = [fairy()];
  const beforeLP = [...teamLifePointsBefore];
  const beforeCards = JSON.stringify(dancingFairies);
  const result = resolveDancingFairyStandbyGain(input({ teamLifePointsBefore, dancingFairies }));
  assert.deepEqual(teamLifePointsBefore, beforeLP);
  assert.equal(JSON.stringify(dancingFairies), beforeCards);
  assert.notEqual(result.teamLifePointsAfter, teamLifePointsBefore);
});

test('does not cap Life Points at 8000; it applies the printed gain exactly', () => {
  const result = resolveDancingFairyStandbyGain(input({
    teamLifePointsBefore: [7900, 4000],
  }));
  assert.equal(result.appliedGain, 1000);
  assert.deepEqual(result.teamLifePointsAfter, [8900, 4000]);
});

test('rejects an incorrect source card ID', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({
      dancingFairies: [fairy({ cardId: '00000000' })],
    })),
    /90925163/,
  );
});

test('rejects a blank physical UID', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({ dancingFairies: [fairy({ uid: ' ' })] })),
    /stable identifier/,
  );
});

test('rejects duplicate physical UIDs in the field snapshot', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({
      dancingFairies: [
        fairy(),
        fairy({ physicalOwnerSeat: 2 }),
      ],
    })),
    /duplicate physical UID/,
  );
});

test('rejects physical owner seats outside the four-seat 2v2 table', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({
      dancingFairies: [fairy({ physicalOwnerSeat: 4 })],
    })),
    /seat from 0 to 3/,
  );
});

test('rejects invalid controller team identifiers', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({
      dancingFairies: [fairy({ controllerTeam: 2 })],
    })),
    /team 0 or 1/,
  );
});

test('rejects an invalid active team', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({ activeTeam: 2 })),
    /activeTeam must be team 0 or 1/,
  );
});

test('rejects unsupported card locations', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({
      dancingFairies: [fairy({ zone: 'field' })],
    })),
    /invalid Dancing Fairy zone/,
  );
});

test('rejects invalid battle positions', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({
      dancingFairies: [fairy({ position: 'set' })],
    })),
    /position must be attack or defense/,
  );
});

test('rejects non-boolean visibility or negation flags', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({
      dancingFairies: [fairy({ faceUp: undefined })],
    })),
    /flags must be boolean/,
  );
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({
      dancingFairies: [fairy({ effectNegated: 0 })],
    })),
    /flags must be boolean/,
  );
});

test('rejects a blank event ID', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({ eventId: ' ' })),
    /stable identifier/,
  );
});

test('rejects a malformed two-team LP tuple', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({ teamLifePointsBefore: [4000] })),
    /exactly two team totals/,
  );
});

test('rejects negative, fractional, or unsafe team Life Points', () => {
  for (const teamLifePointsBefore of [[-1, 4000], [4000.5, 4000], [Number.MAX_SAFE_INTEGER + 1, 4000]]) {
    assert.throws(
      () => resolveDancingFairyStandbyGain(input({ teamLifePointsBefore })),
      /non-negative safe integer/,
    );
  }
});

test('rejects a gain that would overflow the safe integer range', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({
      teamLifePointsBefore: [Number.MAX_SAFE_INTEGER - 500, 4000],
    })),
    /safe integer range/,
  );
});

test('rejects more than six Dancing Fairy snapshots, preserving the 3+3 monster-zone bound', () => {
  const dancingFairies = Array.from({ length: 7 }, (_, index) => fairy({
    uid: 'copy-' + index,
    physicalOwnerSeat: index % 4,
  }));
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({ dancingFairies })),
    /at most six/,
  );
});

test('rejects a non-array processed event list', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({ processedEventIds: 'turn-1:team-0:standby' })),
    /must be an array/,
  );
});

test('rejects duplicate processed event IDs', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({
      processedEventIds: ['turn-1:team-0:standby', 'turn-1:team-0:standby'],
    })),
    /must not contain duplicates/,
  );
});

test('rejects an invalid processed event ID', () => {
  assert.throws(
    () => resolveDancingFairyStandbyGain(input({ processedEventIds: [' '] })),
    /stable identifier/,
  );
});

test('M405 evidence matches the official Konami card text and remains uncertified', () => {
  assert.equal(evidence.mission, 'M405');
  assert.equal(evidence.card.id, DANCING_FAIRY_CARD_ID);
  assert.equal(evidence.card.konamiDatabaseCid, 5201);
  assert.equal(evidence.card.officialTextVerified, true);
  assert.match(evidence.card.officialSourceUrl, /cid=5201/);
  assert.equal(evidence.card.firstTcgRelease, '2003-03-01');
  assert.equal(evidence.validation.certificationStatus, 'not-certified');
  assert.equal(evidence.validation.automaticCertification, false);
  assert.equal(DANCING_FAIRY_STANDBY_GAIN, 1000);
});
