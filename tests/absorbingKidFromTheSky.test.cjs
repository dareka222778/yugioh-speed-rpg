const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ABSORBING_KID_FROM_THE_SKY_CARD_ID,
  GUARDIAN_ANGEL_JOAN_CARD_ID,
  resolveAbsorbingKidFromTheSkyBattleGain,
  resolveGuardianAngelJoanBattleGain,
} = require('../dist/absorbingKidFromTheSky.js');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'evidence', 'm402-absorbing-kid-from-the-sky.json'),
  'utf8',
));

const input = (overrides = {}) => ({
  sourceCardId: ABSORBING_KID_FROM_THE_SKY_CARD_ID,
  sourceUid: 's0:monster-1',
  sourcePhysicalOwnerSeat: 0,
  sourceControllerTeam: 0,
  sourceFaceUpWhenDestroying: true,
  sourceBattleRole: 'attacker',
  destroyedMonsterUid: 's1:monster-2',
  destroyedMonsterLevel: 4,
  destroyerUid: 's0:monster-1',
  destroyedByBattle: true,
  destination: 'graveyard',
  teamLifePoints: [4000, 4000],
  ...overrides,
});

test('gains 300 LP per Level after destroying a monster by battle and sending it to the Graveyard', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input());
  assert.equal(result.triggered, true);
  assert.equal(result.reason, 'resolved');
  assert.equal(result.gainAmount, 1200);
  assert.equal(result.recipientTeam, 0);
  assert.deepEqual(result.teamLifePoints, [5200, 4000]);
});

test('uses the destroyed monster Level at the time of the battle event', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({ destroyedMonsterLevel: 7 }));
  assert.equal(result.gainAmount, 2100);
  assert.deepEqual(result.teamLifePoints, [6100, 4000]);
});

test('supports the minimum classic monster Level', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({ destroyedMonsterLevel: 1 }));
  assert.equal(result.gainAmount, 300);
});

test('supports Level 12 without capping the printed multiplier', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({ destroyedMonsterLevel: 12 }));
  assert.equal(result.gainAmount, 3600);
});

test('can trigger when Absorbing Kid is the attacker', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({ sourceBattleRole: 'attacker' }));
  assert.equal(result.triggered, true);
});

test('can trigger when Absorbing Kid is the defender that destroys the attacker', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({
    sourceBattleRole: 'defender',
    destroyedMonsterUid: 's1:attacking-monster',
  }));
  assert.equal(result.triggered, true);
  assert.equal(result.gainAmount, 1200);
});

test('adds recovery to team 0 and leaves team 1 unchanged', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({
    sourceControllerTeam: 0,
    teamLifePoints: [3500, 2700],
  }));
  assert.deepEqual(result.teamLifePoints, [4700, 2700]);
});

test('adds recovery to team 1 and leaves team 0 unchanged', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({
    sourceControllerTeam: 1,
    teamLifePoints: [3500, 2700],
  }));
  assert.deepEqual(result.teamLifePoints, [3500, 3900]);
  assert.equal(result.recipientTeam, 1);
});

test('uses current controller team rather than physical owner seat', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({
    sourcePhysicalOwnerSeat: 0,
    sourceControllerTeam: 1,
    teamLifePoints: [4000, 2000],
  }));
  assert.equal(result.sourcePhysicalOwnerSeat, 0);
  assert.equal(result.recipientTeam, 1);
  assert.deepEqual(result.teamLifePoints, [4000, 3200]);
});

test('does not trigger if the source was not face-up when it destroyed the monster', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({
    sourceFaceUpWhenDestroying: false,
  }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'source-not-face-up');
  assert.equal(result.gainAmount, 0);
  assert.deepEqual(result.teamLifePoints, [4000, 4000]);
});

test('does not trigger for a monster destroyed by an effect rather than battle', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({ destroyedByBattle: false }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'not-destroyed-by-battle');
});

test('does not trigger when another monster caused the destruction', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({
    destroyerUid: 's2:other-monster',
  }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'different-destroyer');
});

test('does not trigger if the destroyed monster was banished instead of sent to the Graveyard', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({ destination: 'banished' }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'not-sent-to-graveyard');
});

test('does not trigger if a replacement effect sends the destroyed monster to the hand', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({ destination: 'hand' }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'not-sent-to-graveyard');
});

test('does not trigger if a replacement effect sends the destroyed monster back to the Deck', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({ destination: 'deck' }));
  assert.equal(result.triggered, false);
});

test('does not trigger if the destroyed monster is returned to the Extra Deck', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({ destination: 'extraDeck' }));
  assert.equal(result.triggered, false);
});

test('does not trigger when no battle destruction occurred and the target remains on the field', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({
    destroyedByBattle: false,
    destination: 'field',
  }));
  assert.equal(result.triggered, false);
});

test('has no once-per-turn restriction: separate successful battle events each recover LP', () => {
  const first = resolveAbsorbingKidFromTheSkyBattleGain(input({ destroyedMonsterUid: 's1:first' }));
  const second = resolveAbsorbingKidFromTheSkyBattleGain(input({
    destroyedMonsterUid: 's1:second',
    teamLifePoints: first.teamLifePoints,
  }));
  assert.equal(first.gainAmount, 1200);
  assert.equal(second.gainAmount, 1200);
  assert.deepEqual(second.teamLifePoints, [6400, 4000]);
});

test('preserves source physical ownership and destroyed monster UID in the result', () => {
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({
    sourcePhysicalOwnerSeat: 3,
    sourceControllerTeam: 0,
    destroyedMonsterUid: 's1:owned-by-opponent',
  }));
  assert.equal(result.sourcePhysicalOwnerSeat, 3);
  assert.equal(result.destroyedMonsterUid, 's1:owned-by-opponent');
});

test('does not mutate the input team Life Points tuple', () => {
  const teamLifePoints = [4000, 3000];
  const before = [...teamLifePoints];
  const result = resolveAbsorbingKidFromTheSkyBattleGain(input({ teamLifePoints }));
  assert.deepEqual(teamLifePoints, before);
  assert.notEqual(result.teamLifePoints, teamLifePoints);
});

test('rejects a different source card ID', () => {
  assert.throws(
    () => resolveAbsorbingKidFromTheSkyBattleGain(input({ sourceCardId: '00000000' })),
    /49771608/,
  );
});

test('rejects blank physical UIDs', () => {
  assert.throws(() => resolveAbsorbingKidFromTheSkyBattleGain(input({ sourceUid: ' ' })), /sourceUid is required/);
  assert.throws(() => resolveAbsorbingKidFromTheSkyBattleGain(input({ destroyedMonsterUid: '' })), /destroyedMonsterUid is required/);
  assert.throws(() => resolveAbsorbingKidFromTheSkyBattleGain(input({ destroyerUid: '' })), /destroyerUid is required/);
});

test('rejects a source and destroyed monster sharing the same physical UID', () => {
  assert.throws(
    () => resolveAbsorbingKidFromTheSkyBattleGain(input({ destroyedMonsterUid: 's0:monster-1' })),
    /different physical UIDs/,
  );
});

test('rejects physical owner seats outside the four-seat 2v2 table', () => {
  assert.throws(
    () => resolveAbsorbingKidFromTheSkyBattleGain(input({ sourcePhysicalOwnerSeat: 4 })),
    /seat from 0 to 3/,
  );
});

test('rejects invalid team identifiers', () => {
  assert.throws(
    () => resolveAbsorbingKidFromTheSkyBattleGain(input({ sourceControllerTeam: 2 })),
    /team 0 or 1/,
  );
});

test('rejects invalid destroyed monster Levels', () => {
  for (const destroyedMonsterLevel of [0, 13, 1.5, Number.NaN]) {
    assert.throws(
      () => resolveAbsorbingKidFromTheSkyBattleGain(input({ destroyedMonsterLevel })),
      /Level must be an integer from 1 to 12/,
    );
  }
});

test('rejects negative, fractional, or unsafe team Life Points', () => {
  assert.throws(
    () => resolveAbsorbingKidFromTheSkyBattleGain(input({ teamLifePoints: [-1, 4000] })),
    /non-negative safe integer/,
  );
  assert.throws(
    () => resolveAbsorbingKidFromTheSkyBattleGain(input({ teamLifePoints: [4000.5, 4000] })),
    /non-negative safe integer/,
  );
});

test('rejects a recovery that would overflow the safe integer range', () => {
  assert.throws(
    () => resolveAbsorbingKidFromTheSkyBattleGain(input({
      destroyedMonsterLevel: 12,
      teamLifePoints: [Number.MAX_SAFE_INTEGER - 100, 4000],
    })),
    /safe integer range/,
  );
});

test('rejects an invalid battle role or destination', () => {
  assert.throws(
    () => resolveAbsorbingKidFromTheSkyBattleGain(input({ sourceBattleRole: 'spectator' })),
    /attacker or defender/,
  );
  assert.throws(
    () => resolveAbsorbingKidFromTheSkyBattleGain(input({ destination: 'unknown' })),
    /invalid battle destination/,
  );
});

test('rejects malformed team Life Points shape', () => {
  assert.throws(
    () => resolveAbsorbingKidFromTheSkyBattleGain(input({ teamLifePoints: [4000] })),
    /exactly two team totals/,
  );
});

test('M402 evidence is official-source-linked and remains uncertified', () => {
  assert.equal(evidence.mission, 'M402');
  assert.equal(evidence.card.id, '49771608');
  assert.equal(evidence.card.konamiDatabaseCid, 6034);
  assert.equal(evidence.card.officialTextVerified, true);
  assert.match(evidence.card.officialSourceUrl, /cid=6034/);
  assert.equal(evidence.card.firstTcgRelease, '2004-06-01');
  assert.equal(evidence.card.historicalEligibility, 'eligible-before-2004-09-30');
  assert.equal(evidence.validation.certificationStatus, 'not-certified');
  assert.equal(evidence.validation.automaticCertification, false);
});

const joanInput = (overrides = {}) => ({
  ...input({
    sourceCardId: GUARDIAN_ANGEL_JOAN_CARD_ID,
    sourceUid: 's0:joan-1',
    destroyedMonsterUid: 's1:destroyed-joan-target',
    destroyerUid: 's0:joan-1',
  }),
  destroyedMonsterOriginalAtk: 1800,
  ...overrides,
});

test('Guardian Angel Joan gains the destroyed monster original ATK after battle destruction to the Graveyard', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput());
  assert.equal(result.triggered, true);
  assert.equal(result.gainAmount, 1800);
  assert.deepEqual(result.teamLifePoints, [5800, 4000]);
});

test('Guardian Angel Joan uses original ATK rather than a temporary current ATK', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput({
    destroyedMonsterOriginalAtk: 2500,
    destroyedMonsterCurrentAtk: 400,
  }));
  assert.equal(result.gainAmount, 2500);
});

test('Guardian Angel Joan may trigger for a monster with 0 original ATK', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput({ destroyedMonsterOriginalAtk: 0 }));
  assert.equal(result.triggered, true);
  assert.equal(result.gainAmount, 0);
  assert.equal(result.recipientTeam, 0);
  assert.deepEqual(result.teamLifePoints, [4000, 4000]);
});

test('Guardian Angel Joan routes recovery to team 0 only', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput({
    sourceControllerTeam: 0,
    teamLifePoints: [3100, 2900],
  }));
  assert.deepEqual(result.teamLifePoints, [4900, 2900]);
});

test('Guardian Angel Joan routes recovery to team 1 only', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput({
    sourceControllerTeam: 1,
    teamLifePoints: [3100, 2900],
  }));
  assert.deepEqual(result.teamLifePoints, [3100, 4700]);
  assert.equal(result.recipientTeam, 1);
});

test('Guardian Angel Joan uses controller team rather than the physical owner seat', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput({
    sourcePhysicalOwnerSeat: 0,
    sourceControllerTeam: 1,
    teamLifePoints: [4000, 2000],
  }));
  assert.equal(result.sourcePhysicalOwnerSeat, 0);
  assert.deepEqual(result.teamLifePoints, [4000, 3800]);
});

test('Guardian Angel Joan can recover when it is the defending monster that destroys the attacker', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput({ sourceBattleRole: 'defender' }));
  assert.equal(result.triggered, true);
  assert.equal(result.sourceBattleRole, 'defender');
});

test('a Set Guardian Angel Joan that is face-up when battle destruction is established can trigger', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput({
    sourceBattleRole: 'defender',
    sourceFaceUpWhenDestroying: true,
    wasSetAtBattleStart: true,
  }));
  assert.equal(result.triggered, true);
});

test('Guardian Angel Joan does not trigger while it is still face-down at destruction', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput({ sourceFaceUpWhenDestroying: false }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'source-not-face-up');
  assert.deepEqual(result.teamLifePoints, [4000, 4000]);
});

test('Guardian Angel Joan does not trigger for effect destruction', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput({ destroyedByBattle: false }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'not-destroyed-by-battle');
});

test('Guardian Angel Joan does not trigger if another monster destroyed the target', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput({ destroyerUid: 's2:other' }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'different-destroyer');
});

test('Guardian Angel Joan does not trigger if the destroyed monster was banished', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput({ destination: 'banished' }));
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'not-sent-to-graveyard');
});

test('Guardian Angel Joan does not trigger if the destroyed monster was returned to the hand', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput({ destination: 'hand' }));
  assert.equal(result.triggered, false);
});

test('Guardian Angel Joan has no once-per-turn restriction across distinct battle events', () => {
  const first = resolveGuardianAngelJoanBattleGain(joanInput({ destroyedMonsterUid: 's1:first' }));
  const second = resolveGuardianAngelJoanBattleGain(joanInput({
    destroyedMonsterUid: 's1:second',
    teamLifePoints: first.teamLifePoints,
  }));
  assert.deepEqual(second.teamLifePoints, [7600, 4000]);
});

test('Guardian Angel Joan does not mutate the input team Life Points tuple', () => {
  const teamLifePoints = [4000, 2500];
  const before = [...teamLifePoints];
  const result = resolveGuardianAngelJoanBattleGain(joanInput({ teamLifePoints }));
  assert.deepEqual(teamLifePoints, before);
  assert.notEqual(result.teamLifePoints, teamLifePoints);
});

test('Guardian Angel Joan rejects a different card ID', () => {
  assert.throws(
    () => resolveGuardianAngelJoanBattleGain(joanInput({ sourceCardId: ABSORBING_KID_FROM_THE_SKY_CARD_ID })),
    /68007326/,
  );
});

test('Guardian Angel Joan rejects negative, fractional, or unsafe original ATK', () => {
  for (const destroyedMonsterOriginalAtk of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => resolveGuardianAngelJoanBattleGain(joanInput({ destroyedMonsterOriginalAtk })),
      /non-negative safe integer/,
    );
  }
});

test('Guardian Angel Joan preserves the physical owner seat and target UID', () => {
  const result = resolveGuardianAngelJoanBattleGain(joanInput({
    sourcePhysicalOwnerSeat: 3,
    destroyedMonsterUid: 's1:physical-target-uid',
  }));
  assert.equal(result.sourcePhysicalOwnerSeat, 3);
  assert.equal(result.destroyedMonsterUid, 's1:physical-target-uid');
});

test('Guardian Angel Joan rejects unsafe resulting team Life Points', () => {
  assert.throws(
    () => resolveGuardianAngelJoanBattleGain(joanInput({
      destroyedMonsterOriginalAtk: 2000,
      teamLifePoints: [Number.MAX_SAFE_INTEGER - 100, 4000],
    })),
    /safe integer range/,
  );
});

test('M402 evidence includes Guardian Angel Joan with official CID and no certification', () => {
  assert.equal(evidence.relatedCards[0].id, '68007326');
  assert.equal(evidence.relatedCards[0].konamiDatabaseCid, 5899);
  assert.equal(evidence.relatedCards[0].officialTextVerified, true);
  assert.match(evidence.relatedCards[0].officialSourceUrl, /cid=5899/);
  assert.equal(evidence.relatedCards[0].firstTcgRelease, '2004-03-01');
  assert.equal(evidence.validation.certificationStatus, 'not-certified');
  assert.equal(evidence.validation.automaticCertification, false);
});
