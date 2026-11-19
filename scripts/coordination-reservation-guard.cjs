#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROTECTED_STATES = new Set([
  'active',
  'reserved',
  'in_progress',
  'in-progress',
  'handoff-pending',
  'handoff_pending',
  'handoff-pending-no-response',
  'awaiting-explicit-release',
  'released-to-auxiliary-monitor-ci',
  'released-to-auxiliary',
  'released-to-auxiliary-monitor',
]);

function fail(message) {
  throw new Error(message);
}

function isSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function isProtectedState(value) {
  const state = String(value ?? '').trim().toLowerCase();
  return PROTECTED_STATES.has(state) || state.includes('do-not-edit');
}

function safeRepositoryPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 240) return false;
  if (value.includes('\0') || value.includes('\\')) return false;
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
  if (path.posix.normalize(value) !== value) return false;
  const parts = value.split('/');
  if (parts.some(part => part.length === 0 || part === '.' || part === '..' || (part.startsWith('.') && part !== '.github'))) return false;
  return true;
}

function reservationFrom(value, source) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const files = Array.isArray(value.reservedFiles)
    ? value.reservedFiles
    : Array.isArray(value.scope)
      ? value.scope
      : null;
  if (!files || files.length === 0) return null;

  const branch = typeof value.branch === 'string'
    ? value.branch
    : typeof value.workBranch === 'string'
      ? value.workBranch
      : null;
  const runId = typeof value.runId === 'string'
    ? value.runId
    : typeof value.reservationId === 'string'
      ? value.reservationId
      : null;
  const mission = typeof value.mission === 'string' ? value.mission : null;
  if (!branch && !runId && !mission) return null;

  return {
    runId,
    mission,
    branch,
    files: files.filter(file => typeof file === 'string'),
    state: value.state ?? value.status ?? '',
    source,
  };
}

function collectReservations(state) {
  const found = [];
  const seen = new Set();

  function walk(value, source) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, source + '[' + index + ']'));
      return;
    }
    if (!value || typeof value !== 'object') return;

    const reservation = reservationFrom(value, source);
    if (reservation && isProtectedState(reservation.state)) {
      const key = [
        reservation.runId ?? '',
        reservation.mission ?? '',
        reservation.branch ?? '',
        reservation.files.slice().sort().join('|'),
      ].join('::');
      if (!seen.has(key)) {
        seen.add(key);
        found.push(reservation);
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === 'reservedFiles' || key === 'scope') continue;
      walk(child, source + '.' + key);
    }
  }

  walk(state, 'state');
  return found;
}

function collectRunReferences(state) {
  const references = [];
  function walk(value, source) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, source + '[' + index + ']'));
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (typeof value.runId === 'string') {
      references.push({
        runId: value.runId,
        mission: typeof value.mission === 'string' ? value.mission : null,
        branch: typeof value.branch === 'string' ? value.branch : null,
        source,
      });
    }
    for (const [key, child] of Object.entries(value)) walk(child, source + '.' + key);
  }
  walk(state, 'state');
  return references;
}

function validateRunShape(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) fail('Run checkpoint must be an object.');
  if (typeof run.runId !== 'string' || !/^work-\d{8}T\d{6}-\d{4}-M\d+(?:-M\d+)*$/.test(run.runId)) {
    fail('Invalid or non-unique run ID format.');
  }
  if (typeof run.mission !== 'string' || !run.mission.trim()) fail('Mission is required.');
  if (typeof run.priority !== 'string' || !run.priority.trim()) fail('Priority is required.');
  if (typeof run.branch !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(run.branch) || run.branch.includes('..')) {
    fail('Invalid work branch.');
  }
  if (typeof run.sharedBranch !== 'string' || !run.sharedBranch.trim()) fail('Shared branch is required.');
  if (!isSha(run.sharedHeadAtStart)) fail('sharedHeadAtStart must be a full 40-character SHA.');
  if (!Array.isArray(run.reservedFiles) || run.reservedFiles.length === 0) fail('At least one reserved file is required.');
  const seen = new Set();
  for (const file of run.reservedFiles) {
    if (!safeRepositoryPath(file)) fail('Unsafe repository path: ' + file);
    if (seen.has(file)) fail('Duplicate path in reservation: ' + file);
    seen.add(file);
  }
  if (typeof run.startedAt !== 'string' || !Number.isFinite(Date.parse(run.startedAt))) fail('Invalid startedAt timestamp.');
  return true;
}

function validateReservation(state, run, options = {}) {
  validateRunShape(run);
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('Coordination state must be an object.');
  if (state.sharedBranch && state.sharedBranch !== run.sharedBranch) fail('Run targets a different shared branch.');
  if (options.actualHead && run.sharedHeadAtStart !== options.actualHead) {
    fail('Stale shared HEAD: expected ' + options.actualHead + ', got ' + run.sharedHeadAtStart);
  }

  const reservations = collectReservations(state);
  const sameId = collectRunReferences(state).filter(item => item.runId === run.runId);
  for (const item of sameId) {
    if (item.branch && item.branch !== run.branch) fail('Run ID is already reserved by another branch: ' + item.branch);
    if (item.mission && item.mission !== run.mission) fail('Run ID is already assigned to another mission: ' + item.mission);
  }

  const ownFiles = new Set(run.reservedFiles);
  const conflicts = [];
  for (const reservation of reservations) {
    if (reservation.runId === run.runId && reservation.branch === run.branch) continue;
    for (const file of reservation.files) {
      if (ownFiles.has(file)) {
        conflicts.push({
          file,
          runId: reservation.runId,
          mission: reservation.mission,
          branch: reservation.branch,
          state: reservation.state,
          source: reservation.source,
        });
      }
    }
  }
  if (conflicts.length) {
    fail('Reservation overlaps protected work: ' + conflicts.map(item =>
      item.file + ' (' + (item.runId || item.mission || 'unknown') + ', ' + item.state + ')'
    ).join('; '));
  }
  return {
    valid: true,
    runId: run.runId,
    branch: run.branch,
    reservedFiles: run.reservedFiles.slice(),
    protectedReservationsChecked: reservations.length,
    conflicts: 0,
  };
}

function validateRelease(run, releasedFiles) {
  validateRunShape(run);
  if (!Array.isArray(releasedFiles)) fail('Released files must be an array.');
  const owned = new Set(run.reservedFiles);
  const seen = new Set();
  for (const file of releasedFiles) {
    if (!safeRepositoryPath(file)) fail('Unsafe released path: ' + file);
    if (!owned.has(file)) fail('Cannot release a third-party reservation: ' + file);
    if (seen.has(file)) fail('Duplicate released path: ' + file);
    seen.add(file);
  }
  return { valid: true, releasedFiles: [...seen], thirdPartyFilesReleased: 0 };
}

function validateFinalCheckpoint(run) {
  validateRunShape(run);
  if (!run.endedAt) return { final: false };
  if (!Number.isFinite(Date.parse(run.endedAt))) fail('Invalid endedAt timestamp.');
  const duration = run.duration;
  if (!duration || !Number.isFinite(duration.elapsedMinutes) ||
      !Number.isFinite(duration.effectiveWorkMinutes) ||
      !Number.isFinite(duration.targetEffectiveMinutes) ||
      duration.elapsedMinutes < 0 ||
      duration.effectiveWorkMinutes < 0 ||
      duration.effectiveWorkMinutes > duration.elapsedMinutes ||
      duration.targetEffectiveMinutes < 0 ||
      duration.ciWaitExcluded !== true) {
    fail('Final checkpoint must report honest elapsed/effective duration and exclude CI wait.');
  }
  if (!run.catalogAtEnd || !Number.isInteger(run.catalogAtEnd.certified) ||
      !Number.isInteger(run.catalogAtEnd.newCertifications) ||
      !Number.isInteger(run.catalogAtEnd.automaticCertifications) ||
      run.catalogAtEnd.automaticCertifications !== 0 ||
      (run.catalogAtEnd.inventoryGranted ?? 0) !== 0) {
    fail('Final catalog counters are missing or report automatic certification/inventory grants.');
  }
  if (run.catalogAtStart && Number.isInteger(run.catalogAtStart.certified) &&
      run.catalogAtEnd.certified !== run.catalogAtStart.certified + run.catalogAtEnd.newCertifications) {
    fail('Certified-card delta does not match the reported new certifications.');
  }
  if (run.catalogAtEnd.newCertifications > 0) {
    const evidence = run.behavioralCertificationEvidence;
    if (!Array.isArray(evidence) || evidence.length !== run.catalogAtEnd.newCertifications ||
        evidence.some(item => !item || item.behaviorVerified !== true ||
          typeof item.cardId !== 'string' || /^\d{8}$/.test(item.cardId) ||
          typeof item.testRunId !== 'string' || !item.testRunId.trim())) {
      fail('Every new certification requires a matching behavioral test-run attestation.');
    }
    const ci = run.ciResults ?? run.ci ?? {};
    for (const key of ['engineValidation', 'cardBatchFast', 'milestone1000']) {
      if (ci[key] !== 'success') fail('New certifications require successful ' + key + '.');
    }
  }
  const production = run.productionAtEnd;
  if (!production || typeof production.mergePerformed !== 'boolean' ||
      typeof production.deployPerformed !== 'boolean') {
    fail('Final production status must explicitly report merge and deploy.');
  }
  if (production.mergePerformed && !(production.mergeAuthorization === true &&
      production.backupVerified === true && production.ciComplete === true)) {
    fail('Merge requires current authorization, verified backup and complete CI.');
  }
  if (production.deployPerformed && !(production.deployAuthorization === true &&
      production.backupVerified === true && production.ciComplete === true)) {
    fail('Deploy requires current authorization, verified backup and complete CI.');
  }
  if (run.reservationReleased !== true) fail('Final checkpoint must explicitly release its own reservation.');
  const releaseEntries = Array.isArray(run.scopeReleasedToAuxiliary) ? run.scopeReleasedToAuxiliary : [];
  for (const entry of releaseEntries) {
    if (entry.branch !== run.branch) fail('Auxiliary release must remain on this run branch.');
  }
  const releasedFiles = releaseEntries.flatMap(entry => Array.isArray(entry.files) ? entry.files : []);
  const release = validateRelease(run, releasedFiles);
  return { final: true, duration, catalog: run.catalogAtEnd, production, release };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) fail('Unexpected argument: ' + key);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail('Missing value for ' + key);
    options[key.slice(2)] = value;
    index += 1;
  }
  return options;
}

function main(argv) {
  const options = parseArgs(argv);
  if (!options.state || !options['run-file']) {
    fail('Usage: node scripts/coordination-reservation-guard.cjs --state coordination/state.json --run-file coordination/runs/work-....json [--actual-head SHA]');
  }
  const state = JSON.parse(fs.readFileSync(path.resolve(options.state), 'utf8'));
  const run = JSON.parse(fs.readFileSync(path.resolve(options['run-file']), 'utf8'));
  const reservation = validateReservation(state, run, { actualHead: options['actual-head'] });
  const final = validateFinalCheckpoint(run);
  console.log('COORDINATION_RESERVATION_GUARD ' + JSON.stringify({ ...reservation, final }));
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error('COORDINATION_RESERVATION_GUARD_FAILED ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  collectReservations,
  collectRunReferences,
  isProtectedState,
  safeRepositoryPath,
  validateFinalCheckpoint,
  validateRelease,
  validateReservation,
  validateRunShape,
};
