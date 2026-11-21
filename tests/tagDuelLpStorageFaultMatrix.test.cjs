'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm458-lp-storage-faults-'));
process.env.DATABASE_PATH = path.join(dir, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const { rulesFor } = require('../dist/rulesProfile');
const { planTagDuelLpGainFirePrincessPipeline } = require('../dist/tagDuelLpGainFirePrincessPipeline');
const { commitTagDuelLpGainPipelinePlan } = require('../dist/tagDuelLifePointStore');

const member = seat => 'm458-seat-' + seat;

function makeGame() {
  const deck = tag.tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M458 Seat ' + seat,
    cards: [...deck]
  }));
  return tag.createTagDuel(players, { classic: true, first: 0, seed: 'm458-lp-storage-faults' });
}

function makePlan(game, eventId) {
  const result = planTagDuelLpGainFirePrincessPipeline(game, {
    eventId,
    gainingTeam: 0,
    lpGained: 500,
    teamLifePointsBefore: [4000, 4000],
    teamLifePointsAfterGain: [4500, 4000]
  });
  assert.equal(result.ok, true, result.reason || 'LP pipeline plan must be valid');
  assert.equal(result.value.firePrincess.reason, 'no-eligible-fire-princess');
  assert.deepEqual(result.value.teamLifePointsAfter, [4500, 4000]);
  return result.value;
}

function register(state, id, revision = 4) {
  const members = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M458 Seat ' + seat,
    accepted: true
  }));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(
    id, 'm458-guild', 'm458-channel', 'm458-message', revision, Date.now(),
    'playing', JSON.stringify(members), JSON.stringify(state), 'classic-loan'
  );
  return { id, revision };
}

function rawSession(id) {
  const row = database.db.prepare('SELECT revision,state FROM tag_sessions WHERE id=?').get(id);
  return { revision: row.revision, state: JSON.parse(row.state) };
}

function rawLedger(id) {
  return database.db.prepare(
    'SELECT source_event_ids,fire_princess_event_ids FROM tag_lp_event_ledgers WHERE session_id=?'
  ).get(id);
}

function assertOwnerRules(state) {
  const rules = rulesFor(state.core);
  assert.deepEqual([
    rules.mainDeckMin,
    rules.mainDeckMax,
    rules.handLimit,
    rules.handCheck,
    rules.monsterZones,
    rules.spellTrapZones,
    rules.extraDeckMax
  ], [20, 30, 6, 'end', 3, 3, 5]);
}

function assertSessionUnchanged(id, revision, lp, expectedLedger) {
  const saved = rawSession(id);
  assert.equal(saved.revision, revision);
  assert.deepEqual([saved.state.core.players[0].lp, saved.state.core.players[1].lp], lp);
  assertOwnerRules(saved.state);
  assert.deepEqual(rawLedger(id), expectedLedger);
}

test('malformed persisted JSON ledger is rejected without changing session or LP', () => {
  const game = makeGame();
  const plan = makePlan(game, 'm458:malformed-ledger');
  const record = register(game, 'm458-malformed-ledger');
  database.db.prepare(
    'INSERT INTO tag_lp_event_ledgers(session_id,source_event_ids,fire_princess_event_ids,updated) VALUES(?,?,?,?)'
  ).run(record.id, '{not-json', '[]', Date.now());

  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan), {
    ok: false,
    reason: 'invalid-persisted-lp-event-ledger'
  });
  assertSessionUnchanged(record.id, 4, [4000, 4000], {
    source_event_ids: '{not-json',
    fire_princess_event_ids: '[]'
  });
});

test('a source-only or Fire-Princess-only ledger is rejected as partial', () => {
  const game = makeGame();
  const plan = makePlan(game, 'm458:partial-ledger');
  const record = register(game, 'm458-partial-ledger');
  database.db.prepare(
    'INSERT INTO tag_lp_event_ledgers(session_id,source_event_ids,fire_princess_event_ids,updated) VALUES(?,?,?,?)'
  ).run(record.id, JSON.stringify([plan.eventId]), '[]', Date.now());

  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan), {
    ok: false,
    reason: 'partial-persisted-lp-pipeline-ledger'
  });
  assertSessionUnchanged(record.id, 4, [4000, 4000], {
    source_event_ids: JSON.stringify([plan.eventId]),
    fire_princess_event_ids: '[]'
  });
});

test('a stale LP snapshot is rejected before the session revision or ledger can change', () => {
  const game = makeGame();
  game.core.players[0].lp = 4100;
  tag.assertTagDuel(game);
  const plan = makePlan(makeGame(), 'm458:stale-lp');
  const record = register(game, 'm458-stale-lp');

  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan), {
    ok: false,
    reason: 'stale-team-life-point-snapshot'
  });
  assertSessionUnchanged(record.id, 4, [4100, 4000], undefined);
});

test('tampered next-event ledger arrays are rejected without a partial commit', () => {
  const game = makeGame();
  const plan = structuredClone(makePlan(game, 'm458:tampered-plan'));
  plan.nextSourceProcessedEventIds = ['m458:foreign-event'];
  const record = register(game, 'm458-tampered-plan');

  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan), {
    ok: false,
    reason: 'lp-pipeline-plan-ledger-does-not-match-persisted-state'
  });
  assertSessionUnchanged(record.id, 4, [4000, 4000], undefined);
});

test('SQLite ledger insert failure rolls back the earlier LP and revision update', () => {
  const game = makeGame();
  const plan = makePlan(game, 'm458:forced-rollback');
  const record = register(game, 'm458-forced-rollback');
  database.db.exec(
    "CREATE TRIGGER m458_fail_ledger_insert BEFORE INSERT ON tag_lp_event_ledgers " +
    "BEGIN SELECT RAISE(ABORT, 'M458 forced ledger write failure'); END;"
  );

  try {
    assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan), {
      ok: false,
      reason: 'lp-pipeline-storage-transaction-failed'
    });
    assertSessionUnchanged(record.id, 4, [4000, 4000], undefined);
  } finally {
    database.db.exec('DROP TRIGGER IF EXISTS m458_fail_ledger_insert');
  }
});

test('a duplicate plan without both persisted ledger entries is not treated as a successful replay', () => {
  const game = makeGame();
  const plan = structuredClone(makePlan(game, 'm458:duplicate-without-ledger'));
  plan.status = 'duplicate-event';
  const record = register(game, 'm458-duplicate-without-ledger');

  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan), {
    ok: false,
    reason: 'duplicate-plan-without-persisted-ledger'
  });
  assertSessionUnchanged(record.id, 4, [4000, 4000], undefined);
});

after(() => {
  database.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
