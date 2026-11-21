const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveTagSolemnWishesDrawGain,
  solemnWishesTagDuelPublicSummary
} = require('../dist/solemnWishesTagDuelAdapter');
const {
  resolveTagFirePrincessLpGain,
  firePrincessTagDuelPublicSummary
} = require('../dist/firePrincessTagDuelAdapter');
const { SOLEMN_WISHES_CARD_ID } = require('../dist/solemnWishesDrawGain');
const { FIRE_PRINCESS_CARD_ID } = require('../dist/firePrincessLpGain');
const { createTagDuel, tagNormalCardIds } = require('../dist/tagDuel');

const JINZO_ID = '77585513';

function makeGame(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: 'seat-' + seat, name: 'Seat ' + seat, cards: [...deck]
  }));
  return createTagDuel(players, { seed: 'm448-lp-gain-pipeline', first, classic: true });
}

function takeCard(game, seat) {
  const team = seat % 2;
  const held = game.active[team] === seat ? game.core.players[team] : game.reserves[String(seat)];
  const card = held.deck.pop();
  assert.ok(card);
  return card;
}

function addWishes(game, ownerSeat = 0, controllerTeam = ownerSeat % 2) {
  const physical = takeCard(game, ownerSeat);
  const card = { ...physical, id: SOLEMN_WISHES_CARD_ID, faceUp: true };
  game.core.players[controllerTeam].backrow.push(card);
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

function addJinzo(game, ownerSeat = 0, controllerTeam = ownerSeat % 2) {
  const physical = takeCard(game, ownerSeat);
  const card = {
    ...physical, id: JINZO_ID, position: 'atk', faceUp: true,
    entered: game.core.turn, changed: game.core.turn, attacked: 0, atkBoost: 0, defBoost: 0
  };
  game.core.players[controllerTeam].monsters.push(card);
  return card;
}

function drawEvent(game, seat = 0, count = 1, eventId = 'm448:draw:1') {
  const drawnCardUids = [];
  for (let i = 0; i < count; i++) {
    const physical = takeCard(game, seat);
    const team = seat % 2;
    const held = game.active[team] === seat ? game.core.players[team] : game.reserves[String(seat)];
    held.hand.push(physical);
    drawnCardUids.push(physical.uid);
  }
  return { eventId, drawingSeat: seat, drawCount: count, drawnCardUids };
}

function resolvePipeline(game, draw, drawLedger = [], lpLedger = [], firePrincessNegatedUids = []) {
  const wishes = resolveTagSolemnWishesDrawGain(game, draw, drawLedger);
  if (!wishes.ok) return { ok: false, stage: 'solemn-wishes', reason: wishes.reason };
  const gain = wishes.value.result;
  // Simulate the caller's atomic commit of the LP gain and its draw-event ledger.
  game.core.players[gain.gainingTeam].lp = gain.teamLifePointsAfterGain[gain.gainingTeam];
  const princess = resolveTagFirePrincessLpGain(game, {
    eventId: gain.eventId,
    gainingTeam: gain.gainingTeam,
    lpGained: gain.lpGained,
    teamLifePointsAfterGain: gain.teamLifePointsAfterGain,
    negatedSourceUids: firePrincessNegatedUids
  }, lpLedger);
  if (!princess.ok) return { ok: false, stage: 'fire-princess', reason: princess.reason };
  // Simulate the caller's atomic commit of the Fire Princess damage and LP ledger.
  game.core.players[1 - gain.gainingTeam].lp =
    princess.value.result.teamLifePointsAfterDamage[1 - gain.gainingTeam];
  return {
    ok: true,
    wishes: wishes.value,
    princess: princess.value,
    drawLedger: wishes.value.processedEventIds,
    lpLedger: princess.value.processedEventIds
  };
}

test('one Solemn Wishes draw gain flows into one Fire Princess burn in the opposing shared LP', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  addPrincess(game, 2, 0);
  const result = resolvePipeline(game, drawEvent(game, 0, 1, 'm448:one'));
  assert.equal(result.ok, true);
  assert.equal(result.wishes.result.lpGained, 500);
  assert.equal(result.princess.result.requestedDamage, 500);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [4500, 3500]);
});

test('two copies of each card stack once per draw event without multiplying by draw count', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  addWishes(game, 2, 0);
  addPrincess(game, 0, 0);
  addPrincess(game, 2, 0);
  const result = resolvePipeline(game, drawEvent(game, 0, 3, 'm448:stack'));
  assert.equal(result.ok, true);
  assert.equal(result.wishes.result.lpGained, 1000);
  assert.equal(result.princess.result.requestedDamage, 1000);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [5000, 3000]);
});

test('the pipeline routes by current controller team while retaining physical owner seats', () => {
  const game = makeGame();
  addWishes(game, 1, 1);
  addPrincess(game, 3, 1);
  const result = resolvePipeline(game, drawEvent(game, 1, 1, 'm448:team-one'));
  assert.equal(result.ok, true);
  assert.equal(result.wishes.result.gainingTeam, 1);
  assert.equal(result.princess.result.recipientTeam, 0);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [3500, 4500]);
});

test('Jinzo prevents the Solemn Wishes gain, so Fire Princess receives no positive LP event', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  addPrincess(game, 2, 0);
  addJinzo(game, 0, 0);
  const result = resolvePipeline(game, drawEvent(game, 0, 1, 'm448:jinzo'));
  assert.equal(result.ok, true);
  assert.equal(result.wishes.result.lpGained, 0);
  assert.equal(result.princess.result.reason, 'no-lp-gain');
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [4000, 4000]);
});

test('chain-negated copies are excluded independently at each stage', () => {
  const game = makeGame();
  const negatedWish = addWishes(game, 0, 0);
  addWishes(game, 2, 0);
  const negatedPrincess = addPrincess(game, 0, 0);
  addPrincess(game, 2, 0);
  const draw = { ...drawEvent(game, 0, 1, 'm448:per-copy-negation'), negatedSourceUids: [negatedWish.uid] };
  const result = resolveTagSolemnWishesDrawGain(game, draw);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.lpGained, 500);
  game.core.players[0].lp = result.value.result.teamLifePointsAfterGain[0];
  const burn = resolveTagFirePrincessLpGain(game, {
    eventId: result.value.result.eventId,
    gainingTeam: result.value.result.gainingTeam,
    lpGained: result.value.result.lpGained,
    teamLifePointsAfterGain: result.value.result.teamLifePointsAfterGain,
    negatedSourceUids: [negatedPrincess.uid]
  });
  assert.equal(burn.ok, true);
  assert.equal(burn.value.result.requestedDamage, 500);
  assert.deepEqual(burn.value.result.triggerSources.map(x => x.physicalOwnerSeat), [2]);
});

test('draw and LP-gain ledgers are separate even when both stages share the event ID', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  addPrincess(game, 2, 0);
  const draw = drawEvent(game, 0, 1, 'm448:separate-ledgers');
  const first = resolvePipeline(game, draw);
  assert.equal(first.ok, true);
  assert.deepEqual(first.drawLedger, ['m448:separate-ledgers']);
  assert.deepEqual(first.lpLedger, ['m448:separate-ledgers']);
  const currentLP = [game.core.players[0].lp, game.core.players[1].lp];
  const retry = resolvePipeline(game, draw, first.drawLedger, first.lpLedger);
  assert.equal(retry.ok, true);
  assert.equal(retry.wishes.result.reason, 'duplicate-event');
  assert.equal(retry.princess.result.reason, 'duplicate-event');
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], currentLP);
});

test('distinct draw events can run the full LP-gain and burn pipeline again in one turn', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  addPrincess(game, 0, 0);
  const first = resolvePipeline(game, drawEvent(game, 0, 1, 'm448:repeat:1'));
  assert.equal(first.ok, true);
  const second = resolvePipeline(
    game,
    drawEvent(game, 0, 1, 'm448:repeat:2'),
    first.drawLedger,
    first.lpLedger
  );
  assert.equal(second.ok, true);
  assert.equal(second.wishes.result.lpGained, 500);
  assert.equal(second.princess.result.requestedDamage, 500);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [5000, 3000]);
});

test('both adapters remain read-only until the caller performs each atomic commit', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  addPrincess(game, 2, 0);
  const draw = drawEvent(game, 0, 1, 'm448:readonly');
  const before = JSON.stringify(game);
  const wishes = resolveTagSolemnWishesDrawGain(game, draw);
  assert.equal(wishes.ok, true);
  assert.equal(JSON.stringify(game), before);
  const gain = wishes.value.result;
  const projected = JSON.parse(before);
  projected.core.players[0].lp = gain.teamLifePointsAfterGain[0];
  const princess = resolveTagFirePrincessLpGain(projected, {
    eventId: gain.eventId,
    gainingTeam: gain.gainingTeam,
    lpGained: gain.lpGained,
    teamLifePointsAfterGain: gain.teamLifePointsAfterGain
  });
  assert.equal(princess.ok, true);
  assert.equal(JSON.stringify(game), before);
});

test('public summaries expose neither private draw UIDs nor physical player identity', () => {
  const summary = solemnWishesTagDuelPublicSummary() + ' ' + firePrincessTagDuelPublicSummary();
  assert.equal(summary.includes('m0:'), false);
  assert.equal(summary.includes(SOLEMN_WISHES_CARD_ID), false);
  assert.equal(summary.includes(FIRE_PRINCESS_CARD_ID), false);
  assert.match(summary, /UIDs, mãos privadas/i);
});
