'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm454-lp-session-'));
process.env.DATABASE_PATH = path.join(dir, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const { rulesFor } = require('../dist/rulesProfile');
const { planTagDuelLpGainFirePrincessPipeline } = require('../dist/tagDuelLpGainFirePrincessPipeline');
const { commitTagDuelLpGainPipelinePlan } = require('../dist/tagDuelLifePointStore');

function member(seat) { return 'm454-seat-' + seat; }
function makeGame() {
  const deck = tag.tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({ id: member(seat), name: 'M454 Seat ' + seat, cards: [...deck] }));
  return tag.createTagDuel(players, { classic: true, first: 0, seed: 'm454-lp-session-store' });
}
function register(state, id = 'm454-session') {
  const members = [0, 1, 2, 3].map(seat => ({ id: member(seat), name: 'M454 Seat ' + seat, accepted: true }));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id, 'm454-guild', 'm454-channel', 'm454-message', 7, Date.now(),
    'playing', JSON.stringify(members), JSON.stringify(state), 'classic-loan');
  return store.getTag(id);
}
function makePlan(game, eventId, before = [4000, 4000], after = [4500, 4000]) {
  return planTagDuelLpGainFirePrincessPipeline(game, {
    eventId, gainingTeam: 0, lpGained: after[0] - before[0],
    teamLifePointsBefore: before, teamLifePointsAfterGain: after
  });
}
function ledger(sessionId) {
  return database.db.prepare(
    'SELECT source_event_ids,fire_princess_event_ids FROM tag_lp_event_ledgers WHERE session_id=?'
  ).get(sessionId);
}
function inventory(state) { return new Map(tag.tagInventory(state).map(card => [card.uid, card.id])); }
function assertConserved(state, before) {
  const current = inventory(state);
  assert.equal(current.size, before.size);
  for (const [uid, id] of before) assert.equal(current.get(uid), id);
}

test('commits both team LP totals, both idempotency ledgers and one session revision atomically', () => {
  const game = makeGame();
  const beforeInventory = inventory(game);
  const plan = makePlan(game, 'm454:commit');
  assert.equal(plan.ok, true);
  assert.equal(plan.value.firePrincess.reason, 'no-eligible-fire-princess');
  const record = register(game);
  const result = commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan.value);
  assert.deepEqual(result, { ok: true, status: 'committed', revision: 8, teamLifePoints: [4500, 4000] });
  const persisted = store.getTag(record.id);
  assert.equal(persisted.revision, 8);
  assert.deepEqual(persisted.state.core.players.map(player => player.lp), [4500, 4000]);
  const storedLedger = ledger(record.id);
  assert.deepEqual(JSON.parse(storedLedger.source_event_ids), ['m454:commit']);
  assert.deepEqual(JSON.parse(storedLedger.fire_princess_event_ids), ['m454:commit:fire-princess']);
  assertConserved(persisted.state, beforeInventory);
  tag.assertTagDuel(persisted.state);
  const rules = rulesFor(persisted.state.core);
  assert.deepEqual(
    [rules.mainDeckMin, rules.mainDeckMax, rules.handLimit, rules.handCheck, rules.monsterZones, rules.spellTrapZones, rules.extraDeckMax],
    [20, 30, 6, 'end', 3, 3, 5]
  );
});

test('a fully committed retry is idempotent even with the original stale revision', () => {
  const game = makeGame();
  const plan = makePlan(game, 'm454:duplicate');
  const record = register(game, 'm454-duplicate');
  const first = commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan.value);
  assert.equal(first.status, 'committed');
  const retry = commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan.value);
  assert.deepEqual(retry, { ok: true, status: 'duplicate-event', revision: 8, teamLifePoints: [4500, 4000] });
  assert.equal(store.getTag(record.id).revision, 8);
});

test('a new event with a stale Discord/session revision cannot overwrite the newer session', () => {
  const game = makeGame();
  const record = register(game, 'm454-stale-revision');
  const firstPlan = makePlan(game, 'm454:first');
  const first = commitTagDuelLpGainPipelinePlan(record.id, record.revision, firstPlan.value);
  assert.equal(first.status, 'committed');
  const persisted = store.getTag(record.id);
  const saved = ledger(record.id);
  const sourceIds = JSON.parse(saved.source_event_ids);
  const fireIds = JSON.parse(saved.fire_princess_event_ids);
  const secondPlan = planTagDuelLpGainFirePrincessPipeline(
    persisted.state,
    {
      eventId: 'm454:second', gainingTeam: 0, lpGained: 500,
      teamLifePointsBefore: [4500, 4000], teamLifePointsAfterGain: [5000, 4000]
    },
    sourceIds,
    fireIds
  );
  assert.equal(secondPlan.ok, true);
  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, secondPlan.value), {
    ok: false, reason: 'stale-session-revision'
  });
  assert.equal(store.getTag(record.id).revision, 8);
  assert.deepEqual(store.getTag(record.id).state.core.players.map(player => player.lp), [4500, 4000]);
});

test('rejects a stale LP snapshot even when the session revision matches', () => {
  const game = makeGame();
  game.core.players[0].lp = 4200;
  const record = register(game, 'm454-stale-lp');
  const forged = {
    eventId: 'm454:stale-lp', firePrincessEventId: 'm454:stale-lp:fire-princess',
    status: 'ready', teamLifePointsBefore: [4000, 4000], teamLifePointsAfter: [4500, 4000],
    nextSourceProcessedEventIds: ['m454:stale-lp'],
    nextFirePrincessProcessedEventIds: ['m454:stale-lp:fire-princess'], firePrincess: null
  };
  forged.firePrincess = {
    eventId: forged.firePrincessEventId,
    teamLifePointsAfterDamage: [4500, 4000]
  };
  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, forged), {
    ok: false, reason: 'stale-team-life-point-snapshot'
  });
  assert.deepEqual(store.getTag(record.id).state.core.players.map(player => player.lp), [4200, 4000]);
  assert.equal(store.getTag(record.id).revision, 7);
});

test('rejects a partial persisted ledger rather than risking a duplicate burn', () => {
  const game = makeGame();
  const record = register(game, 'm454-partial-ledger');
  database.db.prepare(
    'INSERT INTO tag_lp_event_ledgers(session_id,source_event_ids,fire_princess_event_ids,updated) VALUES(?,?,?,?)'
  ).run(record.id, JSON.stringify(['m454:partial']), JSON.stringify([]), Date.now());
  const forged = {
    eventId: 'm454:partial', firePrincessEventId: 'm454:partial:fire-princess',
    status: 'ready', teamLifePointsBefore: [4000, 4000], teamLifePointsAfter: [4500, 4000],
    nextSourceProcessedEventIds: ['m454:partial'],
    nextFirePrincessProcessedEventIds: ['m454:partial:fire-princess'], firePrincess: null
  };
  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, forged), {
    ok: false, reason: 'partial-persisted-lp-pipeline-ledger'
  });
  assert.equal(store.getTag(record.id).revision, 7);
  assert.deepEqual(store.getTag(record.id).state.core.players.map(player => player.lp), [4000, 4000]);
});

test('rejects a plan whose next ledgers do not append exactly the two event IDs', () => {
  const game = makeGame();
  const record = register(game, 'm454-invalid-plan');
  const plan = makePlan(game, 'm454:invalid-plan');
  assert.equal(plan.ok, true);
  const forged = { ...plan.value, nextFirePrincessProcessedEventIds: [] };
  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, forged), {
    ok: false, reason: 'lp-pipeline-plan-ledger-does-not-match-persisted-state'
  });
  assert.equal(store.getTag(record.id).revision, 7);
});

test('finished sessions reject new LP transactions without changing the stored state', () => {
  const game = makeGame();
  const record = register(game, 'm454-finished');
  database.db.prepare("UPDATE tag_sessions SET status='finished' WHERE id=?").run(record.id);
  const plan = makePlan(game, 'm454:finished');
  assert.equal(plan.ok, true);
  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan.value), {
    ok: false, reason: 'tag-session-not-playing'
  });
  const stored = database.db.prepare('SELECT revision,state FROM tag_sessions WHERE id=?').get(record.id);
  assert.equal(stored.revision, 7);
  assert.equal(JSON.parse(stored.state).core.phase, 'main');
});

after(() => {
  database.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
