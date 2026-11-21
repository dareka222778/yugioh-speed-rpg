'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm456-solemn-wishes-'));
process.env.DATABASE_PATH = path.join(dir, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const tag = require('../dist/tagDuel');
const { rulesFor } = require('../dist/rulesProfile');
const { resolveTagSolemnWishesDrawGain } = require('../dist/solemnWishesTagDuelAdapter');
const { SOLEMN_WISHES_CARD_ID } = require('../dist/solemnWishesDrawGain');
const { FIRE_PRINCESS_CARD_ID } = require('../dist/firePrincessLpGain');
const { planTagDuelLpGainFirePrincessPipeline } = require('../dist/tagDuelLpGainFirePrincessPipeline');
const { commitTagDuelLpGainPipelinePlan } = require('../dist/tagDuelLifePointStore');

const member = seat => 'm456-seat-' + seat;

function makeGame(first = 0) {
  const deck = tag.tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M456 Seat ' + seat,
    cards: [...deck]
  }));
  return tag.createTagDuel(players, {
    classic: true,
    first,
    seed: 'm456-solemn-wishes-' + first
  });
}

function takeCard(game, seat) {
  const team = seat % 2;
  const held = game.active[team] === seat
    ? game.core.players[team]
    : game.reserves[String(seat)];
  const card = held.deck.pop();
  assert.ok(card, 'physical seat ' + seat + ' must have a card available');
  return card;
}

function addSolemnWishes(game, ownerSeat, controllerTeam) {
  const physical = takeCard(game, ownerSeat);
  const card = {
    ...physical,
    id: SOLEMN_WISHES_CARD_ID,
    faceUp: true,
    setTurn: game.core.turn
  };
  game.core.players[controllerTeam].backrow.push(card);
  return card;
}

function addPrincess(game, ownerSeat, controllerTeam) {
  const physical = takeCard(game, ownerSeat);
  const card = {
    ...physical,
    id: FIRE_PRINCESS_CARD_ID,
    position: 'atk',
    faceUp: true,
    entered: game.core.turn,
    changed: game.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0
  };
  game.core.players[controllerTeam].monsters.push(card);
  return card;
}

function makeDrawEvent(game, seat, count, eventId) {
  const team = seat % 2;
  const held = game.active[team] === seat
    ? game.core.players[team]
    : game.reserves[String(seat)];
  const drawn = Array.from({ length: count }, () => takeCard(game, seat));
  held.hand.push(...drawn);
  return {
    eventId,
    drawingSeat: seat,
    drawCount: count,
    drawnCardUids: drawn.map(card => card.uid)
  };
}

function currentLP(game) {
  return [game.core.players[0].lp, game.core.players[1].lp];
}

function planDrawPipeline(game, event, processedSourceIds = [], processedFireIds = []) {
  const before = currentLP(game);
  const source = resolveTagSolemnWishesDrawGain(game, event, processedSourceIds);
  assert.equal(source.ok, true, source.reason || 'Solemn Wishes draw adapter must resolve');
  const plan = planTagDuelLpGainFirePrincessPipeline(game, {
    eventId: event.eventId,
    gainingTeam: source.value.result.gainingTeam,
    lpGained: source.value.result.lpGained,
    teamLifePointsBefore: before,
    teamLifePointsAfterGain: source.value.result.teamLifePointsAfterGain
  }, processedSourceIds, processedFireIds);
  assert.equal(plan.ok, true, plan.reason || 'Fire Princess pipeline must plan');
  return { source: source.value, plan: plan.value };
}

function register(state, id) {
  const members = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M456 Seat ' + seat,
    accepted: true
  }));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(
    id, 'm456-guild', 'm456-channel', 'm456-message', 4, Date.now(),
    'playing', JSON.stringify(members), JSON.stringify(state), 'classic-loan'
  );
  return { id, revision: 4 };
}

function rawSession(sessionId) {
  const row = database.db.prepare(
    'SELECT revision,state FROM tag_sessions WHERE id=?'
  ).get(sessionId);
  return { revision: row.revision, state: JSON.parse(row.state) };
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

test('a two-card draw by the inactive partner triggers only the unnegated Solemn Wishes copy, then Fire Princess plans one burn', () => {
  const game = makeGame(0);
  const negated = addSolemnWishes(game, 0, 0);
  const eligible = addSolemnWishes(game, 2, 0);
  const princess = addPrincess(game, 0, 0);
  const event = makeDrawEvent(game, 2, 2, 'm456:draw:partner-two-cards');
  event.negatedSourceUids = [negated.uid];
  const beforePlan = JSON.stringify(game);

  const { source, plan } = planDrawPipeline(game, event);
  assert.equal(source.result.reason, 'resolved');
  assert.equal(source.result.triggerCount, 1);
  assert.equal(source.result.lpGained, 500, 'two cards in one draw event still grant 500 per eligible copy, not per card');
  assert.equal(source.result.triggerSources[0].uid, eligible.uid);
  assert.equal(source.result.triggerSources[0].physicalOwnerSeat, 2);
  assert.equal(source.drawingSeat, 2);
  assert.equal(plan.firePrincess.triggerCount, 1);
  assert.equal(plan.firePrincess.triggerSources[0].uid, princess.uid);
  assert.deepEqual(plan.teamLifePointsAfter, [4500, 3500]);
  assert.equal(JSON.stringify(game), beforePlan, 'source and Fire Princess planners must not mutate the drawn state');

  assert.throws(() => tag.assertTagDuel(game), /Carta não admitida/);
  const record = register(game, 'm456-wishes-admission-gate');
  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan), {
    ok: false,
    reason: 'invalid-tag-session-state'
  });
  const unchanged = rawSession(record.id);
  assert.equal(unchanged.revision, 4);
  assert.deepEqual(currentLP(unchanged.state), [4000, 4000]);
  assert.equal(database.db.prepare('SELECT session_id FROM tag_lp_event_ledgers WHERE session_id=?').get(record.id), undefined);
  assertOwnerRules(unchanged.state);
});

test('two eligible Solemn Wishes copies stack once each for a multi-card draw event', () => {
  const game = makeGame(0);
  const first = addSolemnWishes(game, 0, 0);
  const second = addSolemnWishes(game, 2, 0);
  addPrincess(game, 0, 0);
  const event = makeDrawEvent(game, 2, 2, 'm456:draw:two-copies');
  const { source, plan } = planDrawPipeline(game, event);

  assert.equal(source.result.triggerCount, 2);
  assert.deepEqual(source.result.triggerSources.map(source => source.uid), [first.uid, second.uid]);
  assert.equal(source.result.lpGained, 1000);
  assert.equal(plan.firePrincess.triggerCount, 1);
  assert.deepEqual(plan.teamLifePointsAfter, [5000, 3500]);
});

test('a draw by team 1 does not trigger team 0 Solemn Wishes or Fire Princess', () => {
  const game = makeGame(1);
  addSolemnWishes(game, 0, 0);
  addPrincess(game, 0, 0);
  const event = makeDrawEvent(game, 1, 1, 'm456:draw:opposing-team');
  const { source, plan } = planDrawPipeline(game, event);

  assert.equal(source.result.reason, 'no-eligible-copy');
  assert.equal(source.result.gainingTeam, 1);
  assert.equal(source.result.lpGained, 0);
  assert.equal(plan.firePrincess.reason, 'no-lp-gain');
  assert.deepEqual(plan.teamLifePointsAfter, [4000, 4000]);
});

test('drawn UIDs from a different physical seat are rejected even when the team matches', () => {
  const game = makeGame(0);
  const physical = takeCard(game, 0);
  game.core.players[0].hand.push(physical);
  const result = resolveTagSolemnWishesDrawGain(game, {
    eventId: 'm456:draw:wrong-seat',
    drawingSeat: 2,
    drawCount: 1,
    drawnCardUids: [physical.uid]
  });
  assert.deepEqual(result, {
    ok: false,
    reason: 'drawn-card-uid-does-not-belong-to-drawing-seat'
  });
});

test('source and Fire Princess ledgers jointly make a committed draw replay idempotent', () => {
  const game = makeGame(0);
  addSolemnWishes(game, 0, 0);
  addPrincess(game, 0, 0);
  const event = makeDrawEvent(game, 0, 1, 'm456:draw:retry');
  const first = planDrawPipeline(game, event);
  assert.equal(first.source.result.lpGained, 500);
  assert.deepEqual(first.plan.nextSourceProcessedEventIds, [event.eventId]);
  assert.deepEqual(first.plan.nextFirePrincessProcessedEventIds, [event.eventId + ':fire-princess']);

  const duplicateSource = resolveTagSolemnWishesDrawGain(game, event, [event.eventId]);
  assert.equal(duplicateSource.ok, true);
  assert.equal(duplicateSource.value.result.reason, 'duplicate-event');
  assert.equal(duplicateSource.value.result.lpGained, 0);

  const duplicatePlan = planTagDuelLpGainFirePrincessPipeline(game, {
    eventId: event.eventId,
    gainingTeam: 0,
    lpGained: 0,
    teamLifePointsBefore: [4000, 4000],
    teamLifePointsAfterGain: [4000, 4000]
  }, [event.eventId], [event.eventId + ':fire-princess']);
  assert.equal(duplicatePlan.ok, true);
  assert.equal(duplicatePlan.value.status, 'duplicate-event');
  assert.deepEqual(duplicatePlan.value.teamLifePointsAfter, [4000, 4000]);
});

after(() => {
  database.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
