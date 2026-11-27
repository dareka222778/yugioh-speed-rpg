'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { auditState, collectReservations, validateRelease, validateTransition } = require('../scripts/coordination-guard.cjs');
const head = 'a'.repeat(40);
function reservation(runId, branch, files, state = 'reserved-and-implementing') {
  return { runId, mission: runId.toUpperCase(), branch, state, reservedFiles: files, conditionalHeadUpdate: true };
}
function runRecord(runId, branch, files) {
  return { runId, branch, reservedFiles: files, scopeReleasedToAuxiliary: [], inventoryGranted: 0 };
}
function stateWith(...items) {
  const state = { activeReservations: [] };
  items.forEach((item, index) => { state['currentWorkReservationM' + (index + 1)] = item; state.activeReservations.push({ ...item }); });
  return state;
}
test('deduplica aliases do mesmo run sem colisão falsa', () => {
  const item = reservation('run-a', 'branch-a', ['src/a.ts']);
  const state = { currentWorkReservationM1: item, subtaskReservationM1: { ...item }, activeReservations: [{ ...item }] };
  const audit = auditState(state);
  assert.equal(audit.reservationCount, 1);
  assert.equal(audit.activeReservationCount, 1);
  assert.deepEqual(audit.conflicts, []);
});
test('aceita nova reserva disjunta e preserva o terceiro', () => {
  const old = reservation('run-a', 'branch-a', ['src/a.ts']), next = reservation('run-b', 'branch-b', ['src/b.ts']);
  const result = validateTransition(stateWith(old), stateWith(old, next), head, head, runRecord('run-b', 'branch-b', ['src/b.ts']));
  assert.equal(result.ok, true, result.errors.join('; '));
});
test('rejeita HEAD diferente do snapshot lido', () => {
  const next = reservation('run-b', 'branch-b', ['src/b.ts']);
  const result = validateTransition({}, stateWith(next), head, 'b'.repeat(40), runRecord('run-b', 'branch-b', ['src/b.ts']));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /HEAD mudou/);
});
test('rejeita liberação de reserva de terceiro', () => {
  const old = reservation('run-a', 'branch-a', ['src/a.ts']), released = { ...old, state: 'released' };
  const result = validateTransition(stateWith(old), stateWith(released, reservation('run-b', 'branch-b', ['src/b.ts'])), head, head, runRecord('run-b', 'branch-b', ['src/b.ts']));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /reserva de terceiro alterada/);
});
test('rejeita colisão nova de arquivo', () => {
  const old = reservation('run-a', 'branch-a', ['src/a.ts']), next = reservation('run-b', 'branch-b', ['src/a.ts']);
  const result = validateTransition(stateWith(old), stateWith(old, next), head, head, runRecord('run-b', 'branch-b', ['src/a.ts']));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /colisão nova/);
});
test('rejeita runId repetido', () => {
  const old = reservation('run-a', 'branch-a', ['src/a.ts']);
  const result = validateTransition(stateWith(old), stateWith(old), head, head, runRecord('run-a', 'branch-a', ['src/a.ts']));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /runId já existe/);
});
test('rejeita release fora do escopo e inventário', () => {
  const bad = { ...runRecord('run-b', 'branch-b', ['src/b.ts']), scopeReleasedToAuxiliary: ['src/a.ts'], inventoryGranted: 1 };
  const result = validateTransition({}, stateWith(reservation('run-b', 'branch-b', ['src/b.ts'])), head, head, bad);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /fora do escopo próprio/);
  assert.match(result.errors.join(' '), /não pode conceder inventário/);
});
test('libera somente a própria reserva e mantém reservas alheias', () => {
  const own = reservation('run-own', 'branch-own', ['src/own.ts']), third = reservation('run-third', 'branch-third', ['src/third.ts']);
  const before = stateWith(own, third), after = stateWith({ ...own, state: 'released-to-auxiliary' }, third);
  const result = validateRelease(before, after, 'run-own', head, head, runRecord('run-own', 'branch-own', ['src/own.ts']));
  assert.equal(result.ok, true, result.errors.join('; '));
});
test('audita colisões sem esconder proprietários', () => {
  const audit = auditState(stateWith(reservation('run-a', 'branch-a', ['src/shared.ts']), reservation('run-b', 'branch-b', ['src/shared.ts'])));
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.conflicts, [{ file: 'src/shared.ts', runIds: ['run-a', 'run-b'] }]);
});
test('coleta somente caminhos textuais e preserva origem', () => {
  const items = collectReservations({ currentWorkReservationM1: { ...reservation('run-a', 'branch-a', ['src/a.ts', '', null]), scope: ['src/b.ts'] } });
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].files, ['src/a.ts']);
  assert.deepEqual(items[0].sources, ['currentWorkReservationM1']);
});
