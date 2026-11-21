const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SOLEMN_WISHES_CARD_ID,
  SOLEMN_WISHES_GAIN_PER_DRAW_EVENT,
  resolveSolemnWishesDrawGain,
} = require('../dist/solemnWishesDrawGain.js');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'evidence', 'm406-solemn-wishes-draw-lp.json'),
  'utf8',
));

const wishes = (overrides = {}) => ({
  uid: 's0:backrow:solemn-wishes-1',
  cardId: SOLEMN_WISHES_CARD_ID,
  physicalOwnerSeat: 0,
  controllerTeam: 0,
  zone: 'backrow',
  faceUp: true,
  effectNegated: false,
  ...overrides,
});

const input = (overrides = {}) => ({
  eventId: 'turn-1:team-0:draw-1',
  drawingTeam: 0,
  drawCount: 1,
  teamLifePointsBefore: [4000, 4000],
  solemnWishes: [wishes()],
  processedEventIds: [],
  ...overrides,
});

test('gains 500 LP when its controller team draws one card', () => {
  const result = resolveSolemnWishesDrawGain(input());
  assert.equal(result.triggered, true);
  assert.equal(result.reason, 'resolved');
  assert.equal(result.lpGained, 500);
  assert.equal(result.gainingTeam, 0);
  assert.equal(result.opposingTeam, 1);
  assert.deepEqual(result.teamLifePointsAfterGain, [4500, 4000]);
});

test('gains only 500 LP for one draw event that draws multiple cards', () => {
  const result = resolveSolemnWishesDrawGain(input({ drawCount: 3 }));
  assert.equal(result.lpGained, 500);
  assert.deepEqual(result.teamLifePointsAfterGain, [4500, 4000]);
});

test('stacks 500 LP once per eligible face-up copy, not once per card drawn', () => {
  const result = resolveSolemnWishesDrawGain(input({
    drawCount: 5,
    solemnWishes: [
      wishes(),
      wishes({ uid: 's2:backrow:solemn-wishes-2', physicalOwnerSeat: 2 }),
    ],
  }));
  assert.equal(result.triggerCount, 2);
  assert.equal(result.lpGained, 1000);
  assert.deepEqual(result.teamLifePointsAfterGain, [5000, 4000]);
});

test('routes LP to team 1 and leaves team 0 unchanged', () => {
  const result = resolveSolemnWishesDrawGain(input({
    drawingTeam: 1,
    teamLifePointsBefore: [2500, 3500],
    solemnWishes: [wishes({ physicalOwnerSeat: 1, controllerTeam: 1 })],
  }));
  assert.equal(result.gainingTeam, 1);
  assert.equal(result.opposingTeam, 0);
  assert.deepEqual(result.teamLifePointsAfterGain, [2500, 4000]);
});

test('uses current controller team rather than physical owner seat', () => {
  const result = resolveSolemnWishesDrawGain(input({
    solemnWishes: [wishes({ physicalOwnerSeat: 2, controllerTeam: 0 })],
  }));
  assert.equal(result.triggerSources[0].physicalOwnerSeat, 2);
  assert.equal(result.gainingTeam, 0);
  assert.deepEqual(result.teamLifePointsAfterGain, [4500, 4000]);
});

test('does not trigger for a copy controlled by the opposing team', () => {
  const result = resolveSolemnWishesDrawGain(input({
    solemnWishes: [wishes({ physicalOwnerSeat: 1, controllerTeam: 1 })],
  }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'no-eligible-copy');
  assert.deepEqual(result.teamLifePointsAfterGain, [4000, 4000]);
});

test('does not trigger while the Continuous Trap remains Set', () => {
  const result = resolveSolemnWishesDrawGain(input({
    solemnWishes: [wishes({ faceUp: false })],
  }));
  assert.equal(result.triggered, false);
});

test('does not trigger after the card leaves the Spell/Trap Zone', () => {
  const result = resolveSolemnWishesDrawGain(input({
    solemnWishes: [wishes({ zone: 'graveyard' })],
  }));
  assert.equal(result.triggered, false);
});

test('does not trigger while the Continuous Trap effect is negated', () => {
  const result = resolveSolemnWishesDrawGain(input({
    solemnWishes: [wishes({ effectNegated: true })],
  }));
  assert.equal(result.triggered, false);
});

test('does not gain LP when no card was drawn', () => {
  const result = resolveSolemnWishesDrawGain(input({ drawCount: 0 }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'no-draw');
  assert.equal(result.lpGained, 0);
});

test('one draw event is consumed once even if it draws several cards', () => {
  const first = resolveSolemnWishesDrawGain(input({ drawCount: 4 }));
  const retry = resolveSolemnWishesDrawGain(input({
    drawCount: 4,
    teamLifePointsBefore: first.teamLifePointsAfterGain,
    processedEventIds: ['turn-1:team-0:draw-1'],
  }));
  assert.equal(first.lpGained, 500);
  assert.equal(retry.triggered, false);
  assert.equal(retry.reason, 'duplicate-event');
  assert.deepEqual(retry.teamLifePointsAfterGain, [4500, 4000]);
});

test('separate draw events in the same turn each gain LP', () => {
  const first = resolveSolemnWishesDrawGain(input({ eventId: 'turn-1:team-0:draw-1' }));
  const second = resolveSolemnWishesDrawGain(input({
    eventId: 'turn-1:team-0:draw-2',
    teamLifePointsBefore: first.teamLifePointsAfterGain,
    processedEventIds: ['turn-1:team-0:draw-1'],
  }));
  assert.equal(first.lpGained, 500);
  assert.equal(second.lpGained, 500);
  assert.deepEqual(second.teamLifePointsAfterGain, [5000, 4000]);
});

test('multiple eligible copies on the shared team backrow all trigger', () => {
  const result = resolveSolemnWishesDrawGain(input({
    solemnWishes: [
      wishes({ uid: 'seat-0-copy', physicalOwnerSeat: 0 }),
      wishes({ uid: 'seat-2-copy', physicalOwnerSeat: 2 }),
    ],
  }));
  assert.equal(result.triggerCount, 2);
  assert.deepEqual(result.triggerSources.map((source) => source.physicalOwnerSeat), [0, 2]);
});

test('does not mutate the input LP tuple or card snapshots', () => {
  const teamLifePointsBefore = [4000, 3000];
  const solemnWishes = [wishes()];
  const beforeLP = [...teamLifePointsBefore];
  const beforeCards = JSON.stringify(solemnWishes);
  const result = resolveSolemnWishesDrawGain(input({ teamLifePointsBefore, solemnWishes }));
  assert.deepEqual(teamLifePointsBefore, beforeLP);
  assert.equal(JSON.stringify(solemnWishes), beforeCards);
  assert.notEqual(result.teamLifePointsAfterGain, teamLifePointsBefore);
});

test('does not cap Life Points at 8000', () => {
  const result = resolveSolemnWishesDrawGain(input({
    teamLifePointsBefore: [7900, 4000],
  }));
  assert.equal(result.lpGained, 500);
  assert.deepEqual(result.teamLifePointsAfterGain, [8400, 4000]);
});

test('returns the LP-gain event fields expected by Fire Princess', () => {
  const result = resolveSolemnWishesDrawGain(input());
  assert.equal(result.eventId, 'turn-1:team-0:draw-1');
  assert.equal(result.gainingTeam, 0);
  assert.equal(result.opposingTeam, 1);
  assert.equal(result.lpGained, 500);
  assert.deepEqual(result.teamLifePointsAfterGain, [4500, 4000]);
});

test('rejects a different card ID', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({
      solemnWishes: [wishes({ cardId: '00000000' })],
    })),
    /35346968/,
  );
});

test('rejects a blank physical UID', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({
      solemnWishes: [wishes({ uid: ' ' })],
    })),
    /stable identifier/,
  );
});

test('rejects duplicate physical UIDs in the backrow snapshot', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({
      solemnWishes: [
        wishes(),
        wishes({ physicalOwnerSeat: 2 }),
      ],
    })),
    /duplicate physical UID/,
  );
});

test('rejects physical owner seats outside the four-seat 2v2 table', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({
      solemnWishes: [wishes({ physicalOwnerSeat: 4 })],
    })),
    /seat from 0 to 3/,
  );
});

test('rejects invalid controller team identifiers', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({
      solemnWishes: [wishes({ controllerTeam: 2 })],
    })),
    /team 0 or 1/,
  );
});

test('rejects an invalid drawing team', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({ drawingTeam: 2 })),
    /drawingTeam must be team 0 or 1/,
  );
});

test('rejects unsupported backrow zones', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({
      solemnWishes: [wishes({ zone: 'field' })],
    })),
    /invalid Solemn Wishes zone/,
  );
});

test('rejects non-boolean visibility or negation flags', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({
      solemnWishes: [wishes({ faceUp: undefined })],
    })),
    /flags must be boolean/,
  );
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({
      solemnWishes: [wishes({ effectNegated: 0 })],
    })),
    /flags must be boolean/,
  );
});

test('rejects a blank draw event ID', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({ eventId: ' ' })),
    /stable identifier/,
  );
});

test('rejects negative, fractional, or unsafe draw counts', () => {
  for (const drawCount of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => resolveSolemnWishesDrawGain(input({ drawCount })),
      /non-negative safe integer/,
    );
  }
});

test('rejects a malformed two-team LP tuple', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({ teamLifePointsBefore: [4000] })),
    /exactly two team totals/,
  );
});

test('rejects negative, fractional, or unsafe team Life Points', () => {
  for (const teamLifePointsBefore of [[-1, 4000], [4000.5, 4000], [Number.MAX_SAFE_INTEGER + 1, 4000]]) {
    assert.throws(
      () => resolveSolemnWishesDrawGain(input({ teamLifePointsBefore })),
      /non-negative safe integer/,
    );
  }
});

test('rejects a gain that would overflow the safe integer range', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({
      teamLifePointsBefore: [Number.MAX_SAFE_INTEGER - 100, 4000],
    })),
    /safe integer range/,
  );
});

test('rejects more than six Solemn Wishes snapshots, preserving the 3+3 backrow bound', () => {
  const solemnWishes = Array.from({ length: 7 }, (_, index) => wishes({
    uid: 'copy-' + index,
    physicalOwnerSeat: index % 4,
  }));
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({ solemnWishes })),
    /at most six/,
  );
});

test('rejects a non-array processed event list', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({ processedEventIds: 'turn-1:team-0:draw-1' })),
    /must be an array/,
  );
});

test('rejects duplicate processed event IDs', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({
      processedEventIds: ['turn-1:team-0:draw-1', 'turn-1:team-0:draw-1'],
    })),
    /must not contain duplicates/,
  );
});

test('rejects an invalid processed event ID', () => {
  assert.throws(
    () => resolveSolemnWishesDrawGain(input({ processedEventIds: [' '] })),
    /stable identifier/,
  );
});

test('M406 evidence matches the official Konami text and first TCG printing, and remains uncertified', () => {
  assert.equal(evidence.mission, 'M406');
  assert.equal(evidence.card.id, SOLEMN_WISHES_CARD_ID);
  assert.equal(evidence.card.konamiDatabaseCid, 5125);
  assert.equal(evidence.card.officialTextVerified, true);
  assert.match(evidence.card.officialSourceUrl, /cid=5125/);
  assert.equal(evidence.card.firstTcgRelease, '2002-10-20');
  assert.equal(evidence.validation.certificationStatus, 'not-certified');
  assert.equal(evidence.validation.automaticCertification, false);
  assert.equal(SOLEMN_WISHES_GAIN_PER_DRAW_EVENT, 500);
});
