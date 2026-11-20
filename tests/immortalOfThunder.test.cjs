const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  IMMORTAL_OF_THUNDER_CARD_ID,
  IMMORTAL_OF_THUNDER_FLIP_GAIN,
  IMMORTAL_OF_THUNDER_FIELD_TO_GY_LOSS,
  resolveImmortalOfThunderFlipGain,
  resolveImmortalOfThunderFieldToGraveyardLoss,
} = require('../dist/immortalOfThunder.js');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'evidence', 'm407-immortal-of-thunder.json'),
  'utf8',
));

const flipInput = (overrides = {}) => ({
  eventId: 'turn-1:team-0:immortal-flip',
  cardId: IMMORTAL_OF_THUNDER_CARD_ID,
  uid: 's0:monster:immortal-thunder-1',
  physicalOwnerSeat: 0,
  controllerTeamAtActivation: 0,
  zoneAtFlip: 'monster',
  wasFaceDown: true,
  becameFaceUp: true,
  effectNegated: false,
  teamLifePointsBefore: [4000, 4000],
  processedEventIds: [],
  ...overrides,
});

const sendInput = (overrides = {}) => ({
  eventId: 'turn-1:team-0:immortal-send',
  cardId: IMMORTAL_OF_THUNDER_CARD_ID,
  uid: 's0:monster:immortal-thunder-1',
  physicalOwnerSeat: 0,
  controllerTeamAtSend: 0,
  sourceZone: 'monster',
  destinationZone: 'graveyard',
  effectNegated: false,
  teamLifePointsBefore: [4000, 4000],
  processedEventIds: [],
  ...overrides,
});

test('FLIP effect gains exactly 3000 LP for the team controlling the card at activation', () => {
  const result = resolveImmortalOfThunderFlipGain(flipInput());
  assert.equal(result.triggered, true);
  assert.equal(result.lpGained, 3000);
  assert.equal(result.gainingTeam, 0);
  assert.equal(result.opposingTeam, 1);
  assert.deepEqual(result.teamLifePointsAfterGain, [7000, 4000]);
});

test('routes FLIP recovery to team 1 and preserves team 0 LP', () => {
  const result = resolveImmortalOfThunderFlipGain(flipInput({
    controllerTeamAtActivation: 1,
    physicalOwnerSeat: 1,
    teamLifePointsBefore: [2300, 4000],
  }));
  assert.equal(result.gainingTeam, 1);
  assert.deepEqual(result.teamLifePointsAfterGain, [2300, 7000]);
});

test('keeps physical owner separate from the controller team', () => {
  const result = resolveImmortalOfThunderFlipGain(flipInput({
    physicalOwnerSeat: 2,
    controllerTeamAtActivation: 1,
  }));
  assert.equal(result.source.physicalOwnerSeat, 2);
  assert.equal(result.source.controllerTeam, 1);
  assert.equal(result.gainingTeam, 1);
});

test('requires a real face-down to face-up transition', () => {
  const result = resolveImmortalOfThunderFlipGain(flipInput({ wasFaceDown: false }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'not-flipped');
});

test('does not trigger when the card never becomes face-up', () => {
  const result = resolveImmortalOfThunderFlipGain(flipInput({ becameFaceUp: false }));
  assert.equal(result.triggered, false);
});

test('does not trigger when the FLIP effect is negated', () => {
  const result = resolveImmortalOfThunderFlipGain(flipInput({ effectNegated: true }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'negated');
});

test('requires the flip event to originate in a Monster Zone', () => {
  assert.throws(
    () => resolveImmortalOfThunderFlipGain(flipInput({ zoneAtFlip: 'backrow' })),
    /Monster Zone/,
  );
});

test('does not replay the same FLIP event ID', () => {
  const result = resolveImmortalOfThunderFlipGain(flipInput({
    processedEventIds: ['turn-1:team-0:immortal-flip'],
  }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'duplicate-event');
});

test('allows a new FLIP event in a later turn', () => {
  const result = resolveImmortalOfThunderFlipGain(flipInput({
    eventId: 'turn-3:team-0:immortal-flip',
    processedEventIds: ['turn-1:team-0:immortal-flip'],
  }));
  assert.equal(result.triggered, true);
});

test('returns the LP-gain event contract consumed by Fire Princess', () => {
  const result = resolveImmortalOfThunderFlipGain(flipInput());
  assert.equal(result.eventId, 'turn-1:team-0:immortal-flip');
  assert.equal(result.gainingTeam, 0);
  assert.equal(result.opposingTeam, 1);
  assert.equal(result.lpGained, 3000);
  assert.deepEqual(result.teamLifePointsAfterGain, [7000, 4000]);
});

test('does not cap Life Points at 8000 for the FLIP gain', () => {
  const result = resolveImmortalOfThunderFlipGain(flipInput({
    teamLifePointsBefore: [7900, 4000],
  }));
  assert.deepEqual(result.teamLifePointsAfterGain, [10900, 4000]);
});

test('does not mutate the FLIP input LP tuple', () => {
  const teamLifePointsBefore = [4000, 3000];
  const before = [...teamLifePointsBefore];
  const result = resolveImmortalOfThunderFlipGain(flipInput({ teamLifePointsBefore }));
  assert.deepEqual(teamLifePointsBefore, before);
  assert.notEqual(result.teamLifePointsAfterGain, teamLifePointsBefore);
});

test('rejects a wrong card ID or blank UID for the FLIP event', () => {
  assert.throws(() => resolveImmortalOfThunderFlipGain(flipInput({ cardId: '00000000' })), /84926738/);
  assert.throws(() => resolveImmortalOfThunderFlipGain(flipInput({ uid: ' ' })), /stable identifier/);
});

test('rejects invalid FLIP controller team, physical owner, and boolean flags', () => {
  assert.throws(() => resolveImmortalOfThunderFlipGain(flipInput({ controllerTeamAtActivation: 2 })), /team 0 or 1/);
  assert.throws(() => resolveImmortalOfThunderFlipGain(flipInput({ physicalOwnerSeat: 4 })), /seat from 0 to 3/);
  assert.throws(() => resolveImmortalOfThunderFlipGain(flipInput({ becameFaceUp: 1 })), /flags must be boolean/);
});

test('rejects malformed FLIP LP tuples and safe-integer overflow', () => {
  assert.throws(() => resolveImmortalOfThunderFlipGain(flipInput({ teamLifePointsBefore: [4000] })), /exactly two/);
  assert.throws(() => resolveImmortalOfThunderFlipGain(flipInput({
    teamLifePointsBefore: [Number.MAX_SAFE_INTEGER - 100, 4000],
  })), /safe integer range/);
});

test('rejects invalid FLIP event IDs and duplicate processed event IDs', () => {
  assert.throws(() => resolveImmortalOfThunderFlipGain(flipInput({ eventId: ' ' })), /stable identifier/);
  assert.throws(() => resolveImmortalOfThunderFlipGain(flipInput({
    processedEventIds: ['x', 'x'],
  })), /must not contain duplicates/);
});

test('loses exactly 5000 LP when sent from the field to the Graveyard', () => {
  const result = resolveImmortalOfThunderFieldToGraveyardLoss(sendInput());
  assert.equal(result.triggered, true);
  assert.equal(result.lpLost, 5000);
  assert.equal(result.losingTeam, 0);
  assert.equal(result.opposingTeam, 1);
  assert.deepEqual(result.teamLifePointsAfterLoss, [-1000, 4000]);
});

test('routes the 5000 LP loss to team 1 when it controlled the card at send time', () => {
  const result = resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({
    controllerTeamAtSend: 1,
    physicalOwnerSeat: 0,
    teamLifePointsBefore: [4000, 6000],
  }));
  assert.equal(result.losingTeam, 1);
  assert.deepEqual(result.teamLifePointsAfterLoss, [4000, 1000]);
});

test('preserves physical owner separately from controller at send time', () => {
  const result = resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({
    physicalOwnerSeat: 2,
    controllerTeamAtSend: 1,
  }));
  assert.equal(result.source.physicalOwnerSeat, 2);
  assert.equal(result.source.controllerTeam, 1);
});

test('triggers when sent from the Monster Zone or backrow to the Graveyard', () => {
  const monster = resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({ sourceZone: 'monster' }));
  const backrow = resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({
    eventId: 'turn-1:team-0:immortal-send-backrow',
    sourceZone: 'backrow',
  }));
  assert.equal(monster.triggered, true);
  assert.equal(backrow.triggered, true);
});

test('does not trigger when the destination is not the Graveyard', () => {
  const result = resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({ destinationZone: 'banished' }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'not-sent-from-field-to-graveyard');
});

test('does not trigger when the source was not a field zone', () => {
  assert.throws(
    () => resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({ sourceZone: 'graveyard' })),
    /field zone/,
  );
});

test('does not trigger when the send-to-Graveyard effect is negated', () => {
  const result = resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({ effectNegated: true }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'negated');
});

test('does not replay the same send-to-Graveyard event ID', () => {
  const result = resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({
    processedEventIds: ['turn-1:team-0:immortal-send'],
  }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'duplicate-event');
});

test('allows a separate field-to-Graveyard event to resolve independently', () => {
  const result = resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({
    eventId: 'turn-2:team-0:immortal-send',
    processedEventIds: ['turn-1:team-0:immortal-send'],
  }));
  assert.equal(result.triggered, true);
});

test('does not cap or clamp LP loss to zero', () => {
  const result = resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({
    teamLifePointsBefore: [3000, 4000],
  }));
  assert.deepEqual(result.teamLifePointsAfterLoss, [-2000, 4000]);
});

test('composes the printed FLIP gain and field-to-Graveyard loss as distinct events', () => {
  const gain = resolveImmortalOfThunderFlipGain(flipInput());
  const loss = resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({
    teamLifePointsBefore: gain.teamLifePointsAfterGain,
    processedEventIds: gain.processedEventIds,
  }));
  assert.equal(gain.lpGained, 3000);
  assert.equal(loss.lpLost, 5000);
  assert.deepEqual(loss.teamLifePointsAfterLoss, [2000, 4000]);
});

test('rejects a wrong card ID or blank UID for the send event', () => {
  assert.throws(() => resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({ cardId: '00000000' })), /84926738/);
  assert.throws(() => resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({ uid: ' ' })), /stable identifier/);
});

test('rejects invalid send controller team, owner seat, and negation flag', () => {
  assert.throws(() => resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({ controllerTeamAtSend: 2 })), /team 0 or 1/);
  assert.throws(() => resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({ physicalOwnerSeat: 4 })), /seat from 0 to 3/);
  assert.throws(() => resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({ effectNegated: 0 })), /effectNegated must be boolean/);
});

test('rejects malformed send LP tuples and safe-integer underflow', () => {
  assert.throws(() => resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({ teamLifePointsBefore: [4000] })), /exactly two/);
  assert.throws(() => resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({
    teamLifePointsBefore: [Number.MIN_SAFE_INTEGER + 100, 4000],
  })), /safe integer range/);
});

test('rejects invalid send event IDs and duplicate processed event IDs', () => {
  assert.throws(() => resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({ eventId: ' ' })), /stable identifier/);
  assert.throws(() => resolveImmortalOfThunderFieldToGraveyardLoss(sendInput({
    processedEventIds: ['x', 'x'],
  })), /must not contain duplicates/);
});

test('M407 evidence matches the official Konami text and first TCG printing', () => {
  assert.equal(evidence.mission, 'M407');
  assert.equal(evidence.card.id, IMMORTAL_OF_THUNDER_CARD_ID);
  assert.equal(evidence.card.konamiDatabaseCid, 4468);
  assert.equal(evidence.card.officialTextVerified, true);
  assert.match(evidence.card.officialSourceUrl, /cid=4468/);
  assert.equal(evidence.card.firstTcgRelease, '2002-06-26');
  assert.equal(evidence.validation.certificationStatus, 'not-certified');
  assert.equal(evidence.validation.automaticCertification, false);
  assert.equal(IMMORTAL_OF_THUNDER_FLIP_GAIN, 3000);
  assert.equal(IMMORTAL_OF_THUNDER_FIELD_TO_GY_LOSS, 5000);
});
