const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  collectReservations,
  safeRepositoryPath,
  validateFinalCheckpoint,
  validateRelease,
  validateReservation,
} = require('../scripts/coordination-reservation-guard.cjs');

const sharedBranch = 'feat/rea-engine-recovery-20261026';
const head = 'a'.repeat(40);
const run = (patch = {}) => ({
  runId: 'work-20261119T133015-0300-M397',
  mission: 'M397',
  priority: 'P1 — validate coordination reservations',
  state: 'reserved',
  startedAt: '2026-11-19T13:30:15-03:00',
  sharedBranch,
  sharedHeadAtStart: head,
  branch: 'feat/work-m397-coordination-reservation-guard-20261119',
  reservedFiles: [
    'scripts/coordination-reservation-guard.cjs',
    'tests/coordinationReservationGuard.test.cjs',
    '.github/workflows/coordination-reservation-guard.yml',
  ],
  ...patch,
});
const reservation = (patch = {}) => ({
  runId: 'work-20261119T120000-0300-M390',
  mission: 'M390',
  branch: 'feat/work-m390-example',
  state: 'active',
  reservedFiles: ['src/standbyFlow.ts'],
  ...patch,
});
const state = (...reservations) => ({
  sharedBranch,
  workBranches: reservations,
});

test('accepts a unique reservation with safe new files and a full shared HEAD', () => {
  const candidate = run();
  const result = validateReservation(state(reservation()), candidate);
  assert.equal(result.valid, true);
  assert.equal(result.conflicts, 0);
  assert.equal(result.protectedReservationsChecked, 1);
});

test('ignores the candidate’s own registration when state and checkpoint both record it', () => {
  const candidate = run();
  const own = {
    runId: candidate.runId,
    mission: candidate.mission,
    branch: candidate.branch,
    state: 'reserved',
    scope: candidate.reservedFiles,
  };
  const result = validateReservation(state(own), candidate);
  assert.equal(result.valid, true);
});

test('rejects a reused run ID assigned to another branch', () => {
  const candidate = run();
  assert.throws(
    () => validateReservation(state(reservation({
      runId: candidate.runId,
      branch: 'feat/work-someone-else',
      mission: candidate.mission,
    })), candidate),
    /already reserved by another branch/
  );
});

test('rejects overlap with an active reservation', () => {
  const candidate = run({ reservedFiles: ['tests/shared.test.cjs'] });
  assert.throws(
    () => validateReservation(state(reservation({ reservedFiles: ['tests/shared.test.cjs'] })), candidate),
    /Reservation overlaps protected work/
  );
});

test('treats auxiliary-owned files as protected until their owner releases them', () => {
  const candidate = run({ reservedFiles: ['src/owned-helper.ts'] });
  assert.throws(
    () => validateReservation(state(reservation({
      state: 'released-to-auxiliary-monitor-ci',
      reservedFiles: ['src/owned-helper.ts'],
    })), candidate),
    /Reservation overlaps protected work/
  );
});

test('does not block a new run because of a completed historical reservation', () => {
  const candidate = run({ reservedFiles: ['tests/old.test.cjs'] });
  const historical = reservation({ state: 'completed', reservedFiles: ['tests/old.test.cjs'] });
  const result = validateReservation(state(historical), candidate);
  assert.equal(result.valid, true);
  assert.equal(result.protectedReservationsChecked, 0);
});

test('rejects traversal, absolute paths, hidden paths and duplicate reservation paths', () => {
  for (const file of ['../outside', '/tmp/file', 'C:\\outside', 'src/../other.ts', 'src//other.ts', '.env']) {
    assert.equal(safeRepositoryPath(file), false, file);
  }
  assert.equal(safeRepositoryPath('.github/workflows/guard.yml'), true);
  assert.throws(() => validateReservation(state(), run({ reservedFiles: ['tests/a.cjs', 'tests/a.cjs'] })), /Duplicate path/);
  assert.throws(() => validateReservation(state(), run({ reservedFiles: ['../outside'] })), /Unsafe repository path/);
});

test('rejects a stale HEAD when the caller supplies the actual branch HEAD', () => {
  assert.throws(
    () => validateReservation(state(), run(), { actualHead: 'b'.repeat(40) }),
    /Stale shared HEAD/
  );
});

test('allows release of own files and rejects release of any third-party path', () => {
  const candidate = run();
  assert.equal(validateRelease(candidate, [candidate.reservedFiles[0]]).thirdPartyFilesReleased, 0);
  assert.throws(
    () => validateRelease(candidate, ['src/monsterEffects.ts']),
    /third-party reservation/
  );
  assert.throws(
    () => validateRelease(candidate, [candidate.reservedFiles[0], candidate.reservedFiles[0]]),
    /Duplicate released path/
  );
});

test('deduplicates repeated representations of the same protected reservation', () => {
  const item = reservation();
  const snapshot = {
    sharedBranch,
    activeWork: item,
    workBranches: [{ ...item }],
    concurrentReservations: [{ ...item }],
  };
  const collected = collectReservations(snapshot);
  assert.equal(collected.length, 1);
});

test('validates honest final duration, zero automatic certification and explicit production status', () => {
  const candidate = run({
    state: 'released-to-auxiliary-monitor-ci',
    endedAt: '2026-11-19T13:50:00-03:00',
    duration: {
      elapsedMinutes: 20,
      effectiveWorkMinutes: 16,
      targetEffectiveMinutes: 60,
      ciWaitExcluded: true,
    },
    catalogAtEnd: {
      certified: 969,
      newCertifications: 0,
      automaticCertifications: 0,
      inventoryGranted: 0,
    },
    productionAtEnd: {
      mergePerformed: false,
      deployPerformed: false,
    },
    reservationReleased: true,
    scopeReleasedToAuxiliary: [{
      branch: run().branch,
      files: run().reservedFiles,
    }],
  });
  const result = validateFinalCheckpoint(candidate);
  assert.equal(result.final, true);
  assert.equal(result.release.thirdPartyFilesReleased, 0);
});

test('rejects dishonest duration, automatic certification, inventory grant and unauthorized merge', () => {
  const base = run({
    endedAt: '2026-11-19T13:50:00-03:00',
    reservationReleased: true,
    duration: { elapsedMinutes: 10, effectiveWorkMinutes: 11, targetEffectiveMinutes: 60, ciWaitExcluded: true },
    catalogAtEnd: { certified: 969, newCertifications: 0, automaticCertifications: 0, inventoryGranted: 0 },
    productionAtEnd: { mergePerformed: false, deployPerformed: false },
  });
  assert.throws(() => validateFinalCheckpoint(base), /honest elapsed/);
  assert.throws(() => validateFinalCheckpoint({
    ...base,
    duration: { elapsedMinutes: 20, effectiveWorkMinutes: 10, targetEffectiveMinutes: 60, ciWaitExcluded: true },
    catalogAtEnd: { certified: 970, newCertifications: 1, automaticCertifications: 1, inventoryGranted: 0 },
  }), /automatic certification/);
  assert.throws(() => validateFinalCheckpoint({
    ...base,
    duration: { elapsedMinutes: 20, effectiveWorkMinutes: 10, targetEffectiveMinutes: 60, ciWaitExcluded: true },
    catalogAtEnd: { certified: 969, newCertifications: 0, automaticCertifications: 0, inventoryGranted: 1 },
  }), /automatic certification\/inventory grants/);
  assert.throws(() => validateFinalCheckpoint({
    ...base,
    duration: { elapsedMinutes: 20, effectiveWorkMinutes: 10, targetEffectiveMinutes: 60, ciWaitExcluded: true },
    productionAtEnd: { mergePerformed: true, deployPerformed: false },
  }), /Merge requires current authorization/);
});


test('rejects reuse of a run ID even when the earlier reservation is historical', () => {
  const candidate = run();
  const historical = reservation({
    runId: candidate.runId,
    mission: candidate.mission,
    branch: 'feat/work-previous-use',
    state: 'completed',
  });
  assert.throws(() => validateReservation(state(historical), candidate), /already reserved by another branch/);
});

test('new certifications require one behavioral attestation per card and successful gates', () => {
  const candidate = run({
    endedAt: '2026-11-19T13:50:00-03:00',
    reservationReleased: true,
    duration: { elapsedMinutes: 20, effectiveWorkMinutes: 10, targetEffectiveMinutes: 60, ciWaitExcluded: true },
    catalogAtStart: { certified: 969 },
    catalogAtEnd: { certified: 970, newCertifications: 1, automaticCertifications: 0, inventoryGranted: 0 },
    behavioralCertificationEvidence: [{
      cardId: '12345678',
      behaviorVerified: true,
      testRunId: 'engine-run-123',
    }],
    ciResults: { engineValidation: 'success', cardBatchFast: 'success', milestone1000: 'success' },
    productionAtEnd: { mergePerformed: false, deployPerformed: false },
  });
  assert.equal(validateFinalCheckpoint(candidate).final, true);
  assert.throws(() => validateFinalCheckpoint({
    ...candidate,
    behavioralCertificationEvidence: [],
  }), /behavioral test-run attestation/);
  assert.throws(() => validateFinalCheckpoint({
    ...candidate,
    catalogAtEnd: { ...candidate.catalogAtEnd, certified: 971 },
  }), /Certified-card delta/);
  assert.throws(() => validateFinalCheckpoint({
    ...candidate,
    ciResults: { engineValidation: 'failure', cardBatchFast: 'success', milestone1000: 'success' },
  }), /successful engineValidation/);
});

test('final release cannot include files outside this run even when the run is otherwise valid', () => {
  const candidate = run({
    endedAt: '2026-11-19T13:50:00-03:00',
    duration: { elapsedMinutes: 20, effectiveWorkMinutes: 10, targetEffectiveMinutes: 60, ciWaitExcluded: true },
    catalogAtEnd: { certified: 969, newCertifications: 0, automaticCertifications: 0, inventoryGranted: 0 },
    reservationReleased: true,
    productionAtEnd: { mergePerformed: false, deployPerformed: false },
    scopeReleasedToAuxiliary: [{ branch: run().branch, files: ['tests/another-agent.test.cjs'] }],
  });
  assert.throws(() => validateFinalCheckpoint(candidate), /third-party reservation/);
});
