const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  planTagDuelLpGainFirePrincessPipeline,
  tagDuelLpGainFirePrincessPublicSummary
} = require('../dist/tagDuelLpGainFirePrincessPipeline');
const { FIRE_PRINCESS_CARD_ID } = require('../dist/firePrincessLpGain');
const { createTagDuel, tagNormalCardIds } = require('../dist/tagDuel');

function makeGame(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: 'seat-' + seat, name: 'Seat ' + seat, cards: [...deck]
  }));
  return createTagDuel(players, { seed: 'm452-lp-gain-pipeline', first, classic: true });
}

function takeCard(game, seat) {
  const team = seat % 2;
  const held = game.active[team] === seat ? game.core.players[team] : game.reserves[String(seat)];
  const card = held.deck.pop();
  assert.ok(card);
  return card;
}

function addPrincess(game, ownerSeat = 0, controllerTeam = ownerSeat % 2) {
  const physical = takeCard(game, ownerSeat);
  const card = {
    ...physical, id: FIRE_PRINCESS_CARD_ID, position: 'atk', faceUp: true,
    entered: game.core.turn, changed: game.core.turn, attacked: 0, atkBoost: 0, defBoost: 0
  };
  game.core.players[controllerTeam].monsters.push(card);
  return card;
}

function event(eventId, overrides = {}) {
  return {
    eventId,
    gainingTeam: 0,
    lpGained: 500,
    teamLifePointsBefore: [4000, 4000],
    teamLifePointsAfterGain: [4500, 4000],
    ...overrides
  };
}

function currentLP(game) {
  return [game.core.players[0].lp, game.core.players[1].lp];
}

test('plans one shared LP gain followed by one opposing Fire Princess burn', () => {
  const game = makeGame();
  const princess = addPrincess(game, 0, 0);
  const before = JSON.stringify(game);
  const result = planTagDuelLpGainFirePrincessPipeline(game, event('m452:one'));
  assert.equal(result.ok, true);
  assert.equal(result.value.status, 'ready');
  assert.equal(result.value.firePrincessEventId, 'm452:one:fire-princess');
  assert.equal(result.value.firePrincess.triggerCount, 1);
  assert.equal(result.value.firePrincess.triggerSources[0].uid, princess.uid);
  assert.deepEqual(result.value.teamLifePointsAfter, [4500, 3500]);
  assert.deepEqual(result.value.nextSourceProcessedEventIds, ['m452:one']);
  assert.deepEqual(result.value.nextFirePrincessProcessedEventIds, ['m452:one:fire-princess']);
  assert.equal(JSON.stringify(game), before);
});

test('no eligible Fire Princess keeps the source LP gain without inventing damage', () => {
  const game = makeGame();
  const result = planTagDuelLpGainFirePrincessPipeline(game, event('m452:no-copy'));
  assert.equal(result.ok, true);
  assert.equal(result.value.firePrincess.reason, 'no-eligible-fire-princess');
  assert.deepEqual(result.value.teamLifePointsAfter, [4500, 4000]);
});

test('zero LP gain records both event IDs but never triggers Fire Princess', () => {
  const game = makeGame();
  addPrincess(game, 0, 0);
  const result = planTagDuelLpGainFirePrincessPipeline(game, event('m452:zero', {
    lpGained: 0,
    teamLifePointsAfterGain: [4000, 4000]
  }));
  assert.equal(result.ok, true);
  assert.equal(result.value.firePrincess.reason, 'no-lp-gain');
  assert.deepEqual(result.value.teamLifePointsAfter, [4000, 4000]);
  assert.deepEqual(result.value.nextSourceProcessedEventIds, ['m452:zero']);
  assert.deepEqual(result.value.nextFirePrincessProcessedEventIds, ['m452:zero:fire-princess']);
});

test('multiple Fire Princess copies stack once each for the same gain event', () => {
  const game = makeGame();
  addPrincess(game, 0, 0);
  addPrincess(game, 2, 0);
  const result = planTagDuelLpGainFirePrincessPipeline(game, event('m452:stack'));
  assert.equal(result.ok, true);
  assert.equal(result.value.firePrincess.triggerCount, 2);
  assert.deepEqual(result.value.teamLifePointsAfter, [4500, 3000]);
});

test('team 1 gain routes Fire Princess damage to team 0 and retains physical ownership', () => {
  const game = makeGame(1);
  const princess = addPrincess(game, 1, 1);
  const result = planTagDuelLpGainFirePrincessPipeline(game, event('m452:team-one', {
    gainingTeam: 1,
    teamLifePointsBefore: [4000, 4000],
    teamLifePointsAfterGain: [4000, 4500]
  }));
  assert.equal(result.ok, true);
  assert.equal(result.value.firePrincess.recipientTeam, 0);
  assert.equal(result.value.firePrincess.triggerSources[0].physicalOwnerSeat, Number(princess.uid.slice(1, 2)));
  assert.deepEqual(result.value.teamLifePointsAfter, [3500, 4500]);
});

test('per-copy negation suppresses only the exact Fire Princess UID', () => {
  const game = makeGame();
  const negated = addPrincess(game, 0, 0);
  const eligible = addPrincess(game, 2, 0);
  const result = planTagDuelLpGainFirePrincessPipeline(game, event('m452:negation', {
    negatedFirePrincessUids: [negated.uid]
  }));
  assert.equal(result.ok, true);
  assert.equal(result.value.firePrincess.triggerCount, 1);
  assert.deepEqual(result.value.firePrincess.triggerSources.map(x => x.uid), [eligible.uid]);
  assert.deepEqual(result.value.teamLifePointsAfter, [4500, 3500]);
});

test('a fully committed retry is a duplicate and cannot apply the burn twice', () => {
  const game = makeGame();
  addPrincess(game, 0, 0);
  const sourceLedger = [];
  const fireLedger = [];
  const first = planTagDuelLpGainFirePrincessPipeline(game, event('m452:retry'), sourceLedger, fireLedger);
  assert.equal(first.ok, true);
  game.core.players[0].lp = first.value.teamLifePointsAfter[0];
  game.core.players[1].lp = first.value.teamLifePointsAfter[1];
  sourceLedger.push(...first.value.nextSourceProcessedEventIds);
  fireLedger.push(...first.value.nextFirePrincessProcessedEventIds);

  const retry = planTagDuelLpGainFirePrincessPipeline(game, event('m452:retry'), sourceLedger, fireLedger);
  assert.equal(retry.ok, true);
  assert.equal(retry.value.status, 'duplicate-event');
  assert.equal(retry.value.firePrincess, null);
  assert.deepEqual(retry.value.teamLifePointsAfter, [4500, 3500]);
  assert.deepEqual(sourceLedger, ['m452:retry']);
  assert.deepEqual(fireLedger, ['m452:retry:fire-princess']);
});

test('rejects a partially committed source ledger without replaying Fire Princess', () => {
  const game = makeGame();
  assert.deepEqual(planTagDuelLpGainFirePrincessPipeline(
    game, event('m452:partial-source'), ['m452:partial-source'], []
  ), { ok: false, reason: 'partial-lp-gain-pipeline-ledger' });
});

test('rejects a Fire Princess ledger that is ahead of its source event', () => {
  const game = makeGame();
  assert.deepEqual(planTagDuelLpGainFirePrincessPipeline(
    game, event('m452:partial-fire'), [], ['m452:partial-fire:fire-princess']
  ), { ok: false, reason: 'partial-lp-gain-pipeline-ledger' });
});

test('rejects stale source snapshots rather than overwriting a concurrent LP commit', () => {
  const game = makeGame();
  game.core.players[0].lp = 4200;
  assert.deepEqual(planTagDuelLpGainFirePrincessPipeline(game, event('m452:stale')), {
    ok: false, reason: 'stale-team-life-point-snapshot'
  });
});

test('rejects an LP gain amount that does not match the gaining team tuple delta', () => {
  const game = makeGame();
  assert.deepEqual(planTagDuelLpGainFirePrincessPipeline(game, event('m452:wrong-delta', {
    lpGained: 400
  })), { ok: false, reason: 'lp-gain-amount-does-not-match-team-snapshot' });
});

test('source events may change both teams before Fire Princess reacts', () => {
  const game = makeGame(1);
  addPrincess(game, 1, 1);
  const result = planTagDuelLpGainFirePrincessPipeline(game, event('m452:two-team', {
    gainingTeam: 1,
    lpGained: 500,
    teamLifePointsBefore: [4000, 4000],
    teamLifePointsAfterGain: [3500, 4500]
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.teamLifePointsAfter, [3000, 4500]);
});

test('rejects an event ID that leaves no room for the Fire Princess suffix', () => {
  const game = makeGame();
  const id = 'x'.repeat(104);
  assert.deepEqual(planTagDuelLpGainFirePrincessPipeline(game, event(id)), {
    ok: false, reason: 'invalid-lp-gain-source-event-id'
  });
});

test('public summary exposes neither physical UIDs nor private identities', () => {
  const summary = tagDuelLpGainFirePrincessPublicSummary();
  assert.match(summary, /UIDs privados não são exibidos publicamente/i);
  assert.equal(summary.includes('m0:'), false);
  assert.equal(summary.includes(FIRE_PRINCESS_CARD_ID), false);
});
