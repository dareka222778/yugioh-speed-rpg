const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveTagFirePrincessLpGain,
  firePrincessTagDuelPublicSummary
} = require('../dist/firePrincessTagDuelAdapter');
const { FIRE_PRINCESS_CARD_ID } = require('../dist/firePrincessLpGain');
const { createTagDuel, tagNormalCardIds } = require('../dist/tagDuel');

function makeGame(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: 'seat-' + seat,
    name: 'Seat ' + seat,
    cards: [...deck]
  }));
  return createTagDuel(players, { seed: 'm446-fire-princess', first, classic: true });
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

function addPrincess(game, ownerSeat = 0, controllerTeam = ownerSeat % 2, overrides = {}) {
  const physical = takeCard(game, ownerSeat);
  const source = {
    ...physical,
    id: FIRE_PRINCESS_CARD_ID,
    position: 'atk',
    faceUp: true,
    entered: game.core.turn,
    changed: game.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
    ...overrides
  };
  game.core.players[controllerTeam].monsters.push(source);
  return source;
}

function addPrincessToGrave(game, ownerSeat = 0) {
  const physical = takeCard(game, ownerSeat);
  const source = { ...physical, id: FIRE_PRINCESS_CARD_ID };
  game.core.players[ownerSeat % 2].grave.push(source);
  return source;
}

function commitGain(game, gainingTeam = 0, amount = 500, eventId = 'm446:lp:1', overrides = {}) {
  game.core.players[gainingTeam].lp += amount;
  return {
    eventId,
    gainingTeam,
    lpGained: amount,
    teamLifePointsAfterGain: [game.core.players[0].lp, game.core.players[1].lp],
    ...overrides
  };
}

test('one face-up Fire Princess deals exactly 500 after a committed positive LP gain', () => {
  const game = makeGame();
  addPrincess(game, 0, 0);
  const event = commitGain(game, 0, 1200);
  const result = resolveTagFirePrincessLpGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggered, true);
  assert.equal(result.value.result.requestedDamage, 500);
  assert.deepEqual(result.value.result.teamLifePointsAfterDamage, [5200, 3500]);
});

test('damage is fixed per copy and event, not multiplied by the amount of LP gained', () => {
  const game = makeGame();
  addPrincess(game, 0, 0);
  const event = commitGain(game, 0, 5000);
  const result = resolveTagFirePrincessLpGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.requestedDamage, 500);
});

test('two copies owned by different teammates each deal 500 to the opposing shared LP', () => {
  const game = makeGame();
  const first = addPrincess(game, 0, 0);
  const second = addPrincess(game, 2, 0);
  const event = commitGain(game, 0, 300);
  const result = resolveTagFirePrincessLpGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggerCount, 2);
  assert.equal(result.value.result.requestedDamage, 1000);
  assert.deepEqual(result.value.result.triggerSources.map(x => x.physicalOwnerSeat).sort(), [0, 2]);
  assert.deepEqual(result.value.result.teamLifePointsAfterDamage, [4300, 3000]);
  assert.notEqual(first.uid, second.uid);
});

test('current controller team determines routing, not physical owner seat', () => {
  const game = makeGame();
  const source = addPrincess(game, 0, 1);
  const event = commitGain(game, 1, 400);
  const result = resolveTagFirePrincessLpGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggerCount, 1);
  assert.equal(result.value.result.triggerSources[0].physicalOwnerSeat, 0);
  assert.equal(result.value.result.recipientTeam, 0);
  assert.deepEqual(result.value.result.teamLifePointsAfterDamage, [3500, 4400]);
  assert.equal(source.uid.startsWith('m0:'), true);
});

test('a Fire Princess controlled by the other team does not trigger for this LP gain', () => {
  const game = makeGame();
  addPrincess(game, 1, 1);
  const event = commitGain(game, 0, 500);
  const result = resolveTagFirePrincessLpGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggered, false);
  assert.equal(result.value.result.reason, 'no-eligible-fire-princess');
  assert.deepEqual(result.value.result.teamLifePointsAfterDamage, [4500, 4000]);
});

test('face-down Fire Princess does not trigger', () => {
  const game = makeGame();
  addPrincess(game, 0, 0, { faceUp: false, position: 'def' });
  const event = commitGain(game, 0, 500);
  const result = resolveTagFirePrincessLpGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggered, false);
});

test('Fire Princess in the shared Graveyard does not trigger', () => {
  const game = makeGame();
  addPrincessToGrave(game, 0);
  const event = commitGain(game, 0, 500);
  const result = resolveTagFirePrincessLpGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggered, false);
});

test('per-copy chain negation suppresses only the exact Fire Princess UID', () => {
  const game = makeGame();
  const negated = addPrincess(game, 0, 0);
  addPrincess(game, 2, 0);
  const event = commitGain(game, 0, 500, 'm446:lp:negated', { negatedSourceUids: [negated.uid] });
  const result = resolveTagFirePrincessLpGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggerCount, 1);
  assert.equal(result.value.result.triggerSources[0].uid.startsWith('m2:'), true);
  assert.equal(result.value.result.requestedDamage, 500);
});

test('a negation snapshot cannot name a missing or non-Fire-Princess UID', () => {
  const game = makeGame();
  addPrincess(game, 0, 0);
  const event = commitGain(game, 0, 500, 'm446:lp:bad-negation', { negatedSourceUids: ['m3:not-a-princess'] });
  assert.deepEqual(resolveTagFirePrincessLpGain(game, event), {
    ok: false,
    reason: 'negated-source-uid-is-not-a-current-fire-princess'
  });
});

test('a zero LP event does not trigger and is still recorded for idempotency', () => {
  const game = makeGame();
  addPrincess(game, 0, 0);
  const event = commitGain(game, 0, 0, 'm446:lp:zero');
  const result = resolveTagFirePrincessLpGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.reason, 'no-lp-gain');
  assert.deepEqual(result.value.processedEventIds, ['m446:lp:zero']);
});

test('a duplicate committed event cannot inflict damage twice after atomic commit', () => {
  const game = makeGame();
  addPrincess(game, 0, 0);
  const event = commitGain(game, 0, 500, 'm446:lp:retry');
  const first = resolveTagFirePrincessLpGain(game, event);
  assert.equal(first.ok, true);
  game.core.players[1].lp = first.value.result.teamLifePointsAfterDamage[1];
  const retry = resolveTagFirePrincessLpGain(game, event, first.value.processedEventIds);
  assert.equal(retry.ok, true);
  assert.equal(retry.value.result.reason, 'duplicate-event');
  assert.deepEqual(retry.value.result.teamLifePointsAfterDamage, [4500, 3500]);
  assert.deepEqual(retry.value.processedEventIds, first.value.processedEventIds);
});

test('distinct LP gain events may trigger again in the same turn', () => {
  const game = makeGame();
  addPrincess(game, 0, 0);
  const firstEvent = commitGain(game, 0, 100, 'm446:lp:first');
  const first = resolveTagFirePrincessLpGain(game, firstEvent);
  assert.equal(first.ok, true);
  game.core.players[1].lp = first.value.result.teamLifePointsAfterDamage[1];
  const nextEvent = commitGain(game, 0, 100, 'm446:lp:second');
  const second = resolveTagFirePrincessLpGain(game, nextEvent, first.value.processedEventIds);
  assert.equal(second.ok, true);
  assert.equal(second.value.result.requestedDamage, 500);
  assert.equal(second.value.result.teamLifePointsAfterDamage[1], 3000);
});

test('a stale post-gain LP snapshot is rejected for a new event', () => {
  const game = makeGame();
  addPrincess(game, 0, 0);
  const event = commitGain(game, 0, 500, 'm446:lp:stale');
  event.teamLifePointsAfterGain = [9999, 9999];
  assert.deepEqual(resolveTagFirePrincessLpGain(game, event), {
    ok: false,
    reason: 'lp-gain-event-snapshot-does-not-match-current-tag-duel'
  });
});

test('a malformed or negative LP gain is rejected', () => {
  const game = makeGame();
  const event = commitGain(game, 0, 500, 'm446:lp:negative');
  event.lpGained = -1;
  assert.deepEqual(resolveTagFirePrincessLpGain(game, event), {
    ok: false,
    reason: 'invalid-lp-gain-amount'
  });
});

test('an invalid physical UID on Fire Princess is rejected', () => {
  const game = makeGame();
  const source = addPrincess(game, 0, 0);
  source.uid = 'invalid-physical-owner';
  const event = commitGain(game, 0, 500, 'm446:lp:uid');
  assert.deepEqual(resolveTagFirePrincessLpGain(game, event), {
    ok: false,
    reason: 'fire-princess-has-no-physical-owner-uid'
  });
});

test('duplicate physical UIDs anywhere in the four-seat inventory are rejected', () => {
  const game = makeGame();
  const source = addPrincess(game, 0, 0);
  game.core.players[1].grave.push({ ...source });
  const event = commitGain(game, 0, 500, 'm446:lp:duplicate-uid');
  assert.deepEqual(resolveTagFirePrincessLpGain(game, event), {
    ok: false,
    reason: 'tag-duel-physical-inventory-is-not-unique'
  });
});

test('the adapter never mutates TagDuel state or the physical inventory', () => {
  const game = makeGame();
  addPrincess(game, 0, 0);
  const event = commitGain(game, 0, 500, 'm446:lp:read-only');
  const before = JSON.stringify(game);
  const result = resolveTagFirePrincessLpGain(game, event);
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
  const event = commitGain(game, 0, 100, 'm446:lp:monster-capacity');
  const result = resolveTagFirePrincessLpGain(game, event);
  assert.deepEqual(result, { ok: false, reason: 'invalid-tag-duel-core-or-zone-capacity' });
});

test('the adapter respects the shared three-backrow-zone capacity', () => {
  const game = makeGame();
  for (let i = 0; i < 4; i++) {
    const physical = takeCard(game, 0);
    game.core.players[0].backrow.push({ ...physical, faceUp: false });
  }
  const event = commitGain(game, 0, 100, 'm446:lp:backrow-capacity');
  assert.deepEqual(resolveTagFirePrincessLpGain(game, event), {
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
  addPrincess(game, 0, 0);
  const event = commitGain(game, 0, 100, 'm446:lp:field-zone');
  const result = resolveTagFirePrincessLpGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.requestedDamage, 500);
});

test('the adapter rejects an Extra Deck larger than five', () => {
  const game = makeGame();
  game.core.players[0].extra ??= [];
  for (let i = 0; i < 6; i++) {
    const physical = takeCard(game, 0);
    game.core.players[0].extra.push(physical);
  }
  const event = commitGain(game, 0, 100, 'm446:lp:extra-capacity');
  assert.deepEqual(resolveTagFirePrincessLpGain(game, event), {
    ok: false, reason: 'invalid-tag-duel-core-or-zone-capacity'
  });
});

test('the adapter does not impose an artificial 8000 LP ceiling', () => {
  const game = makeGame();
  addPrincess(game, 0, 0);
  game.core.players[0].lp = 9000;
  game.core.players[1].lp = 10000;
  const event = commitGain(game, 0, 50, 'm446:lp:above-eight-thousand');
  const result = resolveTagFirePrincessLpGain(game, event);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.result.teamLifePointsAfterDamage, [9050, 9500]);
});

test('overkill is reported while shared LP never becomes negative', () => {
  const game = makeGame();
  addPrincess(game, 0, 0);
  addPrincess(game, 2, 0);
  game.core.players[1].lp = 200;
  const event = commitGain(game, 0, 50, 'm446:lp:overkill');
  const result = resolveTagFirePrincessLpGain(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.requestedDamage, 1000);
  assert.equal(result.value.result.appliedDamage, 200);
  assert.equal(result.value.result.overkillDamage, 800);
  assert.equal(result.value.result.teamLifePointsAfterDamage[1], 0);
});

test('the public summary contains no card UID, player hand, or private identity', () => {
  const summary = firePrincessTagDuelPublicSummary();
  assert.match(summary, /UIDs, mãos privadas/i);
  assert.equal(summary.includes(FIRE_PRINCESS_CARD_ID), false);
  assert.equal(summary.includes('m0:'), false);
});
