const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveTagSolemnWishesDrawGain,
  solemnWishesTagDuelPublicSummary
} = require('../dist/solemnWishesTagDuelAdapter');
const { SOLEMN_WISHES_CARD_ID } = require('../dist/solemnWishesDrawGain');
const { createTagDuel, tagNormalCardIds } = require('../dist/tagDuel');

const JINZO_ID = '77585513';

function makeGame(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: 'seat-' + seat,
    name: 'Seat ' + seat,
    cards: [...deck]
  }));
  return createTagDuel(players, { seed: 'm447-solemn-wishes', first, classic: true });
}

function takeCard(game, seat) {
  const team = seat % 2;
  const held = game.active[team] === seat
    ? game.core.players[team]
    : game.reserves[String(seat)];
  const card = held.deck.pop();
  assert.ok(card);
  return card;
}

function addWishes(game, ownerSeat = 0, controllerTeam = ownerSeat % 2, faceUp = true) {
  const physical = takeCard(game, ownerSeat);
  const card = { ...physical, id: SOLEMN_WISHES_CARD_ID, faceUp };
  game.core.players[controllerTeam].backrow.push(card);
  return card;
}

function addJinzo(game, ownerSeat = 0, controllerTeam = ownerSeat % 2) {
  const physical = takeCard(game, ownerSeat);
  const card = {
    ...physical,
    id: JINZO_ID,
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

function drawCard(game, seat = 0) {
  const physical = takeCard(game, seat);
  const team = seat % 2;
  const held = game.active[team] === seat
    ? game.core.players[team]
    : game.reserves[String(seat)];
  held.hand.push(physical);
  return physical;
}

function drawEvent(game, seat = 0, count = 1, eventId = 'm447:draw:1', overrides = {}) {
  const drawnCardUids = [];
  for (let i = 0; i < count; i++) drawnCardUids.push(drawCard(game, seat).uid);
  return { eventId, drawingSeat: seat, drawCount: count, drawnCardUids, ...overrides };
}

test('one face-up Solemn Wishes gains 500 shared LP for one committed draw event', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  const event = drawEvent(game, 0, 1);
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggered, true);
  assert.equal(result.value.result.lpGained, 500);
  assert.equal(result.value.result.gainingTeam, 0);
  assert.equal(result.value.result.opposingTeam, 1);
  assert.deepEqual(result.value.result.teamLifePointsAfterGain, [4500, 4000]);
});

test('drawing multiple cards in one event still grants only 500 LP per copy', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  const event = drawEvent(game, 0, 3, 'm447:draw:multi');
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.lpGained, 500);
  assert.equal(result.value.result.triggerCount, 1);
});

test('multiple face-up copies across both physical teammates stack once each', () => {
  const game = makeGame();
  const first = addWishes(game, 0, 0);
  const second = addWishes(game, 2, 0);
  const event = drawEvent(game, 0, 2, 'm447:draw:stack');
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.lpGained, 1000);
  assert.equal(result.value.result.triggerCount, 2);
  assert.deepEqual(result.value.result.triggerSources.map(x => x.physicalOwnerSeat).sort(), [0, 2]);
  assert.notEqual(first.uid, second.uid);
});

test('current controller team determines LP routing, not physical owner seat', () => {
  const game = makeGame();
  const source = addWishes(game, 0, 1);
  const event = drawEvent(game, 2, 1, 'm447:draw:controller');
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.gainingTeam, 1);
  assert.equal(result.value.result.triggerSources[0].physicalOwnerSeat, 0);
  assert.deepEqual(result.value.result.teamLifePointsAfterGain, [4000, 4500]);
  assert.equal(source.uid.startsWith('m0:'), true);
});

test('an opposing team controlled copy does not trigger for this draw event', () => {
  const game = makeGame();
  addWishes(game, 1, 1);
  const event = drawEvent(game, 0, 1, 'm447:draw:opponent');
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggered, false);
  assert.equal(result.value.result.reason, 'no-eligible-copy');
  assert.deepEqual(result.value.result.teamLifePointsAfterGain, [4000, 4000]);
});

test('a Set Continuous Trap does not grant LP', () => {
  const game = makeGame();
  addWishes(game, 0, 0, false);
  const event = drawEvent(game, 0);
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.reason, 'no-eligible-copy');
});

test('a Solemn Wishes card outside the shared backrow does not grant LP', () => {
  const game = makeGame();
  const physical = takeCard(game, 0);
  game.core.players[0].grave.push({ ...physical, id: SOLEMN_WISHES_CARD_ID });
  const event = drawEvent(game, 0, 1, 'm447:draw:grave');
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggered, false);
});

test('Jinzo continuous Trap negation suppresses Solemn Wishes on both teams', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  addWishes(game, 1, 1);
  addJinzo(game, 2, 0);
  const event = drawEvent(game, 0, 1, 'm447:draw:jinzo');
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggered, false);
  assert.equal(result.value.result.reason, 'no-eligible-copy');
});

test('per-copy chain negation suppresses only the exact Solemn Wishes UID', () => {
  const game = makeGame();
  const negated = addWishes(game, 0, 0);
  addWishes(game, 2, 0);
  const event = drawEvent(game, 0, 1, 'm447:draw:chain-negated', { negatedSourceUids: [negated.uid] });
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggerCount, 1);
  assert.equal(result.value.result.triggerSources[0].physicalOwnerSeat, 2);
  assert.equal(result.value.result.lpGained, 500);
});

test('a negation snapshot cannot name a missing or non-Solemn-Wishes UID', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  const event = drawEvent(game, 0, 1, 'm447:draw:bad-negation', { negatedSourceUids: ['m3:not-wishes'] });
  assert.deepEqual(resolveTagSolemnWishesDrawGain(game, event), {
    ok: false, reason: 'negated-source-uid-is-not-a-current-solemn-wishes'
  });
});

test('a zero-card event does not gain LP and is recorded for idempotency', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  const event = drawEvent(game, 0, 0, 'm447:draw:none');
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.reason, 'no-draw');
  assert.deepEqual(result.value.processedEventIds, ['m447:draw:none']);
});

test('a duplicate draw event cannot grant LP twice after atomic commit', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  const event = drawEvent(game, 0, 1, 'm447:draw:retry');
  const first = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(first.ok, true);
  game.core.players[0].lp = first.value.result.teamLifePointsAfterGain[0];
  const retry = resolveTagSolemnWishesDrawGain(game, event, first.value.processedEventIds);
  assert.equal(retry.ok, true);
  assert.equal(retry.value.result.reason, 'duplicate-event');
  assert.deepEqual(retry.value.result.teamLifePointsAfterGain, [4500, 4000]);
  assert.deepEqual(retry.value.processedEventIds, first.value.processedEventIds);
});

test('distinct draw event IDs may resolve again in the same turn', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  const firstEvent = drawEvent(game, 0, 1, 'm447:draw:first');
  const first = resolveTagSolemnWishesDrawGain(game, firstEvent);
  assert.equal(first.ok, true);
  game.core.players[0].lp = first.value.result.teamLifePointsAfterGain[0];
  const secondEvent = drawEvent(game, 0, 1, 'm447:draw:second');
  const second = resolveTagSolemnWishesDrawGain(game, secondEvent, first.value.processedEventIds);
  assert.equal(second.ok, true);
  assert.equal(second.value.result.lpGained, 500);
  assert.deepEqual(second.value.result.teamLifePointsAfterGain, [5000, 4000]);
});

test('draw event output preserves the Fire Princess LP-gain event contract', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  const event = drawEvent(game, 0, 1, 'm447:draw:fire-princess-contract');
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  const gain = result.value.result;
  assert.deepEqual(
    Object.keys(gain).filter(key => ['eventId', 'gainingTeam', 'opposingTeam', 'lpGained', 'teamLifePointsAfterGain'].includes(key)).sort(),
    ['eventId', 'gainingTeam', 'opposingTeam', 'lpGained', 'teamLifePointsAfterGain'].sort()
  );
  assert.equal(gain.eventId, event.eventId);
});

test('drawn-card UIDs must belong to the physical drawing seat', () => {
  const game = makeGame();
  const event = drawEvent(game, 0, 1, 'm447:draw:wrong-seat');
  event.drawingSeat = 2;
  assert.deepEqual(resolveTagSolemnWishesDrawGain(game, event), {
    ok: false, reason: 'drawn-card-uid-does-not-belong-to-drawing-seat'
  });
});

test('draw count must match the captured physical card UIDs', () => {
  const game = makeGame();
  const event = drawEvent(game, 0, 1, 'm447:draw:count');
  event.drawCount = 2;
  assert.deepEqual(resolveTagSolemnWishesDrawGain(game, event), {
    ok: false, reason: 'drawn-card-uids-do-not-match-draw-count'
  });
});

test('a drawn UID must exist exactly once in the four-seat inventory', () => {
  const game = makeGame();
  const event = drawEvent(game, 0, 1, 'm447:draw:missing');
  event.drawnCardUids = ['m0:missing-physical-card'];
  assert.deepEqual(resolveTagSolemnWishesDrawGain(game, event), {
    ok: false, reason: 'drawn-card-uid-is-not-unique-in-physical-inventory'
  });
});

test('malformed event IDs and duplicate physical draw UIDs are rejected', () => {
  const game = makeGame();
  const event = drawEvent(game, 0, 1, 'm447:draw:bad-id');
  event.eventId = ' ';
  assert.deepEqual(resolveTagSolemnWishesDrawGain(game, event), {
    ok: false, reason: 'invalid-solemn-wishes-draw-event-id'
  });
  event.eventId = 'm447:draw:duplicate-uid';
  event.drawCount = 2;
  event.drawnCardUids = [event.drawnCardUids[0], event.drawnCardUids[0]];
  assert.deepEqual(resolveTagSolemnWishesDrawGain(game, event), {
    ok: false, reason: 'drawn-card-uids-do-not-match-draw-count'
  });
});

test('duplicate physical UIDs anywhere in the four-seat inventory are rejected', () => {
  const game = makeGame();
  const wishes = addWishes(game, 0, 0);
  game.core.players[1].grave.push({ ...wishes });
  const event = drawEvent(game, 0, 1, 'm447:draw:duplicate-inventory');
  assert.deepEqual(resolveTagSolemnWishesDrawGain(game, event), {
    ok: false, reason: 'invalid-tag-duel-core-or-zone-capacity'
  });
});

test('the adapter never mutates TagDuel state or physical inventory', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  const event = drawEvent(game, 0, 1, 'm447:draw:read-only');
  const before = JSON.stringify(game);
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(game), before);
});

test('the adapter respects the shared three-Monster-Zone capacity', () => {
  const game = makeGame();
  for (let i = 0; i < 4; i++) {
    const physical = takeCard(game, 0);
    game.core.players[0].monsters.push({
      ...physical, position: 'atk', faceUp: true, entered: game.core.turn,
      changed: game.core.turn, attacked: 0, atkBoost: 0, defBoost: 0
    });
  }
  const event = drawEvent(game, 0, 1, 'm447:draw:monster-capacity');
  assert.deepEqual(resolveTagSolemnWishesDrawGain(game, event), {
    ok: false, reason: 'invalid-tag-duel-core-or-zone-capacity'
  });
});

test('the adapter respects the shared three-backrow-zone capacity', () => {
  const game = makeGame();
  for (let i = 0; i < 4; i++) {
    const physical = takeCard(game, 0);
    game.core.players[0].backrow.push({ ...physical, faceUp: false });
  }
  const event = drawEvent(game, 0, 1, 'm447:draw:backrow-capacity');
  assert.deepEqual(resolveTagSolemnWishesDrawGain(game, event), {
    ok: false, reason: 'invalid-tag-duel-core-or-zone-capacity'
  });
});

test('the separate Field Zone does not consume a shared backrow slot', () => {
  const game = makeGame();
  for (let i = 0; i < 3; i++) {
    const physical = takeCard(game, 0);
    game.core.players[0].backrow.push({ ...physical, faceUp: false });
  }
  const field = takeCard(game, 0);
  game.core.players[0].field = { ...field, faceUp: true };
  addWishes(game, 0, 0);
  const event = drawEvent(game, 0, 1, 'm447:draw:field-zone');
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.lpGained, 500);
});

test('the adapter rejects an Extra Deck larger than five', () => {
  const game = makeGame();
  game.core.players[0].extra ??= [];
  for (let i = 0; i < 6; i++) game.core.players[0].extra.push(takeCard(game, 0));
  const event = drawEvent(game, 0, 1, 'm447:draw:extra-capacity');
  assert.deepEqual(resolveTagSolemnWishesDrawGain(game, event), {
    ok: false, reason: 'invalid-tag-duel-core-or-zone-capacity'
  });
});

test('the adapter does not impose an artificial 8000 LP ceiling', () => {
  const game = makeGame();
  addWishes(game, 0, 0);
  game.core.players[0].lp = 9000;
  const event = drawEvent(game, 0, 1, 'm447:draw:above-eight-thousand');
  const result = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.result.teamLifePointsAfterGain, [9500, 4000]);
});

test('the public summary does not expose physical UIDs or private hands', () => {
  const summary = solemnWishesTagDuelPublicSummary();
  assert.match(summary, /UIDs, mãos privadas/i);
  assert.equal(summary.includes(SOLEMN_WISHES_CARD_ID), false);
  assert.equal(summary.includes('m0:'), false);
});
