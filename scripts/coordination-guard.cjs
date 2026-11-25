#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const TERMINAL = /released|completed|closed|cancelled|canceled|merged|deployed|abandoned|finished/;
const RESERVATION_KEYS = /^(?:currentWorkReservation|subtaskReservation|activeReservation)(?:M\d+)?$|^(?:currentReservation|reservation)$/;
function unique(values) { return [...new Set((values || []).filter(v => typeof v === 'string' && v.trim()))]; }
function normalizeReservation(raw, source, assumeActive = false) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.runId !== 'string') return null;
  const status = String(raw.state || raw.status || (assumeActive ? 'reserved' : '')).toLowerCase();
  const files = unique(Array.isArray(raw.reservedFiles) ? raw.reservedFiles : Array.isArray(raw.scope) ? raw.scope : []);
  return { runId: raw.runId, mission: raw.mission || null, branch: raw.branch || null, status,
    active: !TERMINAL.test(status) && (assumeActive || /active|reserved|implementing|awaiting|in progress/.test(status)),
    files, conditionalHeadUpdate: raw.conditionalHeadUpdate === true, sources: [source] };
}
function collectReservations(state) {
  const byRun = new Map();
  const add = (raw, source, assumeActive = false) => {
    const item = normalizeReservation(raw, source, assumeActive);
    if (!item) return;
    const previous = byRun.get(item.runId);
    if (!previous) { byRun.set(item.runId, item); return; }
    previous.files = unique([...previous.files, ...item.files]);
    previous.sources.push(source);
    previous.active ||= item.active;
    previous.conditionalHeadUpdate ||= item.conditionalHeadUpdate;
    if (previous.branch && item.branch && previous.branch !== item.branch) previous.branchConflict = [previous.branch, item.branch];
    if (previous.mission && item.mission && previous.mission !== item.mission) previous.missionConflict = [previous.mission, item.mission];
    previous.branch ||= item.branch;
    previous.mission ||= item.mission;
  };
  for (const [key, value] of Object.entries(state || {})) {
    if (key === 'activeReservations' && Array.isArray(value)) value.forEach((item, index) => add(item, key + '[' + index + ']', true));
    else if (RESERVATION_KEYS.test(key)) add(value, key, false);
  }
  return [...byRun.values()];
}
function conflictPairs(reservations) {
  const owners = new Map();
  for (const reservation of reservations.filter(item => item.active)) {
    for (const file of reservation.files) owners.set(file, [...(owners.get(file) || []), reservation.runId]);
  }
  return [...owners.entries()].filter(([, ids]) => new Set(ids).size > 1)
    .map(([file, ids]) => ({ file, runIds: unique(ids).sort() }));
}
function auditState(state) {
  const reservations = collectReservations(state);
  const malformed = reservations.filter(item => item.branchConflict || item.missionConflict || !item.branch || !item.files.length)
    .map(item => ({ runId: item.runId, branchConflict: item.branchConflict || null, missionConflict: item.missionConflict || null, branch: item.branch, files: item.files }));
  const conflicts = conflictPairs(reservations);
  return { ok: malformed.length === 0 && conflicts.length === 0, reservationCount: reservations.length,
    activeReservationCount: reservations.filter(item => item.active).length, conflicts, malformed, reservations };
}
function validateOwnedRelease(runRecord) {
  const errors = [];
  const owned = new Set(unique(runRecord && runRecord.reservedFiles));
  for (const file of unique(runRecord && runRecord.scopeReleasedToAuxiliary)) if (!owned.has(file)) errors.push('release fora do escopo próprio: ' + file);
  if (Number(runRecord && runRecord.inventoryGranted || 0) !== 0) errors.push('a coordenação não pode conceder inventário');
  return errors;
}
function validateTransition(previousState, nextState, expectedHead, currentHead, runRecord) {
  const errors = [];
  if (!expectedHead || !currentHead || expectedHead !== currentHead) errors.push('HEAD mudou desde a leitura; releia antes de publicar');
  if (!runRecord || typeof runRecord.runId !== 'string') errors.push('run record sem ID único');
  const before = collectReservations(previousState), after = collectReservations(nextState);
  const beforeById = new Map(before.map(item => [item.runId, item])), afterById = new Map(after.map(item => [item.runId, item]));
  const ownId = runRecord && runRecord.runId;
  if (ownId && beforeById.has(ownId)) errors.push('runId já existe: ' + ownId);
  for (const old of before.filter(item => item.active && item.runId !== ownId)) {
    const current = afterById.get(old.runId);
    if (!current || !current.active) errors.push('reserva de terceiro alterada/liberada: ' + old.runId);
    else for (const file of old.files) if (!current.files.includes(file)) errors.push('arquivo de terceiro removido da reserva ' + old.runId + ': ' + file);
  }
  const own = afterById.get(ownId);
  if (!own || !own.active) errors.push('nova reserva própria não está ativa no estado proposto');
  if (own && runRecord) {
    if (own.branch !== runRecord.branch) errors.push('branch da reserva diverge do run record');
    if (!own.conditionalHeadUpdate) errors.push('reserva nova sem atualização condicional de HEAD');
    for (const file of unique(runRecord.reservedFiles)) if (!own.files.includes(file)) errors.push('arquivo do run record ausente na reserva: ' + file);
  }
  for (const item of after.filter(item => item.branchConflict || item.missionConflict))
    errors.push('reserva inconsistente para runId: ' + item.runId);
  const oldConflicts = new Set(conflictPairs(before).map(item => item.file + '|' + item.runIds.join(',')));
  for (const conflict of conflictPairs(after)) {
    const key = conflict.file + '|' + conflict.runIds.join(',');
    if (!oldConflicts.has(key)) errors.push('colisão nova de reserva: ' + conflict.file + ' (' + conflict.runIds.join(', ') + ')');
  }
  errors.push(...validateOwnedRelease(runRecord));
  return { ok: errors.length === 0, errors, beforeCount: before.length, afterCount: after.length };
}
function validateRelease(previousState, nextState, runId, expectedHead, currentHead, runRecord) {
  const errors = [];
  if (!expectedHead || !currentHead || expectedHead !== currentHead) errors.push('HEAD mudou desde a leitura; releia antes de liberar');
  const before = new Map(collectReservations(previousState).map(item => [item.runId, item]));
  const after = new Map(collectReservations(nextState).map(item => [item.runId, item]));
  const own = before.get(runId), released = after.get(runId);
  if (!own || !own.active) errors.push('reserva própria ativa não encontrada: ' + runId);
  if (released && released.active) errors.push('reserva própria ainda está ativa: ' + runId);
  if (own && runRecord) for (const file of unique(runRecord.reservedFiles)) if (!own.files.includes(file)) errors.push('run record não corresponde à reserva própria: ' + file);
  for (const old of before.values()) {
    if (!old.active || old.runId === runId) continue;
    const current = after.get(old.runId);
    if (!current || !current.active) errors.push('reserva de terceiro alterada/liberada: ' + old.runId);
    else for (const file of old.files) if (!current.files.includes(file)) errors.push('arquivo de terceiro removido: ' + old.runId + '/' + file);
  }
  errors.push(...validateOwnedRelease(runRecord));
  return { ok: errors.length === 0, errors };
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function main(argv) {
  const [mode, ...args] = argv;
  if (mode === 'audit' && args.length === 1) {
    const result = auditState(readJson(args[0]));
    const summary = { ok: result.ok, reservationCount: result.reservationCount, activeReservationCount: result.activeReservationCount, conflicts: result.conflicts, malformed: result.malformed };
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (mode === 'transition' && args.length === 5) {
    const [before, after, expected, current, run] = args;
    const result = validateTransition(readJson(before), readJson(after), expected, current, readJson(run));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (mode === 'release' && args.length === 6) {
    const [before, after, runId, expected, current, run] = args;
    const result = validateRelease(readJson(before), readJson(after), runId, expected, current, readJson(run));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!result.ok) process.exitCode = 1;
    return;
  }
  process.stderr.write('Uso: coordination-guard.cjs audit <state.json> | transition <before.json> <after.json> <expected-head> <current-head> <run.json> | release <before.json> <after.json> <run-id> <expected-head> <current-head> <run.json>\n');
  process.exitCode = 2;
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { auditState, collectReservations, validateRelease, validateTransition };
