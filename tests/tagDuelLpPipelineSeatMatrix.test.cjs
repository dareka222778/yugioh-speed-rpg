'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const tag = require('../dist/tagDuel');
const { rulesFor } = require('../dist/rulesProfile');
const { resolveTagSolemnWishesDrawGain } = require('../dist/solemnWishesTagDuelAdapter');
const { SOLEMN_WISHES_CARD_ID } = require('../dist/solemnWishesDrawGain');
const { FIRE_PRINCESS_CARD_ID } = require('../dist/firePrincessLpGain');
const { planTagDuelLpGainFirePrincessPipeline } = require('../dist/tagDuelLpGainFirePrincessPipeline');

const member = seat => 'm457-seat-' + seat;

function makeGame(first) {
  const deck = tag.tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M457 Seat ' + seat,
    cards: [...deck]
  }));
  return tag.createTagDuel(players, {
    classic: true,
    first,
    seed: 'm457-seat-matrix-' + first
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

function addSolemnWishes(game, ownerSeat) {
  const physical = takeCard(game, ownerSeat);
  const card = {
    ...physical,
    id: SOLEMN_WISHES_CARD_ID,
    faceUp: true,
    setTurn: game.core.turn
  };
  game.core.players[0].backrow.push(card);
  return card;
}

function addFirePrincess(game, ownerSeat) {
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
  game.core.players[0].monsters.push(card);
  return card;
}

function makeDrawEvent(game, seat, eventId) {
  const team = seat % 2;
  const held = game.active[team] === seat
    ? game.core.players[team]
    : game.reserves[String(seat)];
  const card = takeCard(game, seat);
  held.hand.push(card);
  return {
    eventId,
    drawingSeat: seat,
    drawCount: 1,
    drawnCardUids: [card.uid]
  };
}

function currentLP(game) {
  return [game.core.players[0].lp, game.core.players[1].lp];
}

function planDrawPipeline(game, event) {
  const before = currentLP(game);
  const source = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(source.ok, true, source.reason || 'Solemn Wishes draw adapter must resolve');
  const plan = planTagDuelLpGainFirePrincessPipeline(game, {
    eventId: event.eventId,
    gainingTeam: source.value.result.gainingTeam,
    lpGained: source.value.result.lpGained,
    teamLifePointsBefore: before,
    teamLifePointsAfterGain: source.value.result.teamLifePointsAfterGain
  });
  assert.equal(plan.ok, true, plan.reason || 'Fire Princess pipeline must plan');
  return { source: source.value, plan: plan.value };
}

function assertOwnerRules(game) {
  const rules = rulesFor(game.core);
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

test('all 16 first-seat × drawing-seat permutations preserve physical ownership and team LP routing', async t => {
  for (const first of [0, 1, 2, 3]) {
    for (const drawingSeat of [0, 1, 2, 3]) {
      await t.test('first=' + first + ', drawingSeat=' + drawingSeat, () => {
        const game = makeGame(first);
        const solemnOwner = game.active[0];
        const princessOwner = (solemnOwner + 2) % 4;
        const solemn = addSolemnWishes(game, solemnOwner);
        const princess = addFirePrincess(game, princessOwner);
        const event = makeDrawEvent(game, drawingSeat, 'm457:draw:' + first + ':' + drawingSeat);
        const beforePlan = JSON.stringify(game);
        const team = drawingSeat % 2;

        const { source, plan } = planDrawPipeline(game, event);

        assert.equal(source.drawingSeat, drawingSeat);
        assert.equal(source.result.gainingTeam, team);
        assertOwnerRules(game);

        if (team === 0) {
          assert.equal(source.result.reason, 'resolved');
          assert.equal(source.result.triggerCount, 1);
          assert.equal(source.result.lpGained, 500);
          assert.equal(source.result.triggerSources[0].uid, solemn.uid);
          assert.equal(source.result.triggerSources[0].physicalOwnerSeat, solemnOwner);
          assert.equal(plan.firePrincess.triggerCount, 1);
          assert.equal(plan.firePrincess.triggerSources[0].uid, princess.uid);
          assert.equal(plan.firePrincess.triggerSources[0].physicalOwnerSeat, princessOwner);
          assert.deepEqual(plan.teamLifePointsAfter, [4500, 3500]);
        } else {
          assert.equal(source.result.reason, 'no-eligible-copy');
          assert.equal(source.result.triggerCount, 0);
          assert.equal(source.result.lpGained, 0);
          assert.equal(plan.firePrincess.reason, 'no-lp-gain');
          assert.equal(plan.firePrincess.triggerCount, 0);
          assert.deepEqual(plan.teamLifePointsAfter, [4000, 4000]);
        }

        assert.equal(JSON.stringify(game), beforePlan, 'both planners must remain read-only');
      });
    }
  }
});

test('a partner-owned draw UID cannot be substituted for the declared physical drawing seat', () => {
  const game = makeGame(3);
  const physical = takeCard(game, 0);
  game.core.players[0].hand.push(physical);
  const result = resolveTagSolemnWishesDrawGain(game, {
    eventId: 'm457:draw:wrong-physical-seat',
    drawingSeat: 2,
    drawCount: 1,
    drawnCardUids: [physical.uid]
  });
  assert.deepEqual(result, {
    ok: false,
    reason: 'drawn-card-uid-does-not-belong-to-drawing-seat'
  });
});
