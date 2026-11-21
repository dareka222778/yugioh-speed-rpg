const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  planTagDuelLifePointCommit,
  tagDuelLifePointCommitPublicSummary
} = require('../dist/tagDuelLifePointTransaction');
const {
  resolveTagBattleLifePointRecovery
} = require('../dist/battleLifePointRecoveryTagDuelAdapter');
const {
  ABSORBING_KID_FROM_THE_SKY_CARD_ID
} = require('../dist/absorbingKidFromTheSky');
const {
  resolveTagStandbyLpRecovery,
  captureDarklordMarieActivationUids
} = require('../dist/standbyLpRecoveryTagDuelAdapter');
const { DANCING_FAIRY_CARD_ID } = require('../dist/dancingFairyStandby');
const {
  resolveTagSolemnWishesDrawGain
} = require('../dist/solemnWishesTagDuelAdapter');
const { SOLEMN_WISHES_CARD_ID } = require('../dist/solemnWishesDrawGain');
const { createTagDuel, tagNormalCardIds } = require('../dist/tagDuel');

function makeGame(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: 'seat-' + seat,
    name: 'Seat ' + seat,
    cards: [...deck]
  }));
  return createTagDuel(players, { seed: 'm451-lp-transaction', first, classic: true });
}

function takeCard(game, seat) {
  const team = seat % 2;
  const held = game.active[team] === seat ? game.core.players[team] : game.reserves[String(seat)];
  const card = held.deck.pop();
  assert.ok(card);
  return card;
}

function addBattleSource(game, cardId, ownerSeat = 0, controllerTeam = 0) {
  const physical = takeCard(game, ownerSeat);
  const card = {
    ...physical, id: cardId, position: 'atk', faceUp: true,
    entered: game.core.turn, changed: game.core.turn, attacked: 0, atkBoost: 0, defBoost: 0
  };
  game.core.players[controllerTeam].monsters.push(card);
  return card;
}

function addDestroyed(game, ownerSeat = 1) {
  const physical = takeCard(game, ownerSeat);
  const card = { ...physical, id: tagNormalCardIds[0] };
  game.core.players[ownerSeat % 2].grave.push(card);
  return card;
}

function addFairy(game, ownerSeat = 0, team = 0) {
  const physical = takeCard(game, ownerSeat);
  const card = {
    ...physical, id: DANCING_FAIRY_CARD_ID, position: 'def', faceUp: true,
    entered: game.core.turn, changed: game.core.turn, attacked: 0, atkBoost: 0, defBoost: 0
  };
  game.core.players[team].monsters.push(card);
  return card;
}

function openStandby(game, team = game.core.current) {
  const activationDarklordMarieUids = captureDarklordMarieActivationUids(game, team);
  const turnNumber = game.core.turn;
  const taskId = 'm444:standby:' + turnNumber + ':' + team;
  game.core.standby = {
    version: 1,
    tasks: [{
      id: taskId, turn: turnNumber, actor: team, optional: false,
      options: [{ id: 'resolve', label: 'Resolver recuperação de LP', operations: [] }]
    }],
    completed: [],
    active: { id: taskId, status: 'responding', choice: 'resolve' }
  };
  game.core.phase = 'response';
  game.core.resume = 'main';
  game.core.pending = { kind: 'standby', actor: team, card: 'standby:' + taskId, taskId, choiceId: 'resolve' };
  game.core.priority = 1 - team;
  game.core.passes = 0;
  game.core.chain = [];
  delete game.core.choice;
  return {
    eventId: taskId + ':resolution', taskId, turnNumber, activeTeam: team,
    activationDarklordMarieUids
  };
}

function addSolemnWishes(game, ownerSeat = 0, controllerTeam = 0) {
  const physical = takeCard(game, ownerSeat);
  const card = { ...physical, id: SOLEMN_WISHES_CARD_ID, faceUp: true };
  game.core.players[controllerTeam].backrow.push(card);
  return card;
}

function makeDrawEvent(game, seat = 0, eventId = 'm451:draw:1') {
  const physical = takeCard(game, seat);
  const team = seat % 2;
  const held = game.active[team] === seat ? game.core.players[team] : game.reserves[String(seat)];
  held.hand.push(physical);
  return { eventId, drawingSeat: seat, drawCount: 1, drawnCardUids: [physical.uid] };
}

function currentLP(game) {
  return [game.core.players[0].lp, game.core.players[1].lp];
}

test('plans a positive team 0 LP gain without mutating the duel or ledger', () => {
  const game = makeGame();
  const ledger = ['older:event'];
  const beforeGame = JSON.stringify(game);
  const result = planTagDuelLifePointCommit(game, {
    eventId: 'm451:gain:1',
    teamLifePointsBefore: [4000, 4000],
    teamLifePointsAfter: [5200, 4000]
  }, ledger);
  assert.equal(result.ok, true);
  assert.equal(result.value.status, 'ready');
  assert.deepEqual(result.value.teamLifePointsAfter, [5200, 4000]);
  assert.deepEqual(result.value.nextProcessedEventIds, ['older:event', 'm451:gain:1']);
  assert.deepEqual(ledger, ['older:event']);
  assert.equal(JSON.stringify(game), beforeGame);
});

test('plans opposing-team damage and simultaneous two-team LP changes in one tuple', () => {
  const game = makeGame();
  const result = planTagDuelLifePointCommit(game, {
    eventId: 'm451:tremendous-fire',
    teamLifePointsBefore: [4000, 4000],
    teamLifePointsAfter: [3500, 3000]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.teamLifePointsAfter, [3500, 3000]);
});

test('rejects a stale LP snapshot instead of overwriting a newer concurrent commit', () => {
  const game = makeGame();
  game.core.players[0].lp = 4500;
  assert.deepEqual(planTagDuelLifePointCommit(game, {
    eventId: 'm451:stale',
    teamLifePointsBefore: [4000, 4000],
    teamLifePointsAfter: [5000, 4000]
  }), { ok: false, reason: 'stale-team-life-point-snapshot' });
});

test('duplicate event retry returns the current LP tuple and does not append twice', () => {
  const game = makeGame();
  game.core.players[0].lp = 5000;
  const ledger = ['m451:already-committed'];
  const result = planTagDuelLifePointCommit(game, {
    eventId: 'm451:already-committed',
    teamLifePointsBefore: [4000, 4000],
    teamLifePointsAfter: [5500, 4000]
  }, ledger);
  assert.equal(result.ok, true);
  assert.equal(result.value.status, 'duplicate-event');
  assert.deepEqual(result.value.teamLifePointsBefore, [5000, 4000]);
  assert.deepEqual(result.value.teamLifePointsAfter, [5000, 4000]);
  assert.deepEqual(result.value.nextProcessedEventIds, ledger);
});

test('rejects malformed, duplicated or oversized event ledgers', () => {
  const game = makeGame();
  assert.equal(planTagDuelLifePointCommit(game, {
    eventId: 'm451:bad-ledger', teamLifePointsBefore: [4000, 4000], teamLifePointsAfter: [4000, 4000]
  }, ['same', 'same']).reason, 'invalid-life-point-event-ledger');
  assert.equal(planTagDuelLifePointCommit(game, {
    eventId: 'm451:bad-ledger', teamLifePointsBefore: [4000, 4000], teamLifePointsAfter: [4000, 4000]
  }, ['bad event id']).reason, 'invalid-life-point-event-ledger');
  assert.equal(planTagDuelLifePointCommit(game, {
    eventId: 'm451:bad-ledger', teamLifePointsBefore: [4000, 4000], teamLifePointsAfter: [4000, 4000]
  }, Array(4097).fill('event')).reason, 'invalid-life-point-event-ledger');
});

test('rejects malformed IDs and negative or unsafe LP totals', () => {
  const game = makeGame();
  assert.equal(planTagDuelLifePointCommit(game, {
    eventId: 'bad event', teamLifePointsBefore: [4000, 4000], teamLifePointsAfter: [4000, 4000]
  }).reason, 'invalid-life-point-event-id');
  assert.equal(planTagDuelLifePointCommit(game, {
    eventId: 'm451:negative', teamLifePointsBefore: [4000, 4000], teamLifePointsAfter: [-1, 4000]
  }).reason, 'invalid-life-point-after-snapshot');
  assert.equal(planTagDuelLifePointCommit(game, {
    eventId: 'm451:unsafe', teamLifePointsBefore: [4000, 4000], teamLifePointsAfter: [Number.MAX_SAFE_INTEGER + 1, 4000]
  }).reason, 'invalid-life-point-after-snapshot');
});

test('does not impose an artificial 8000 LP ceiling', () => {
  const game = makeGame();
  game.core.players[0].lp = 9000;
  game.core.players[1].lp = 10000;
  const result = planTagDuelLifePointCommit(game, {
    eventId: 'm451:above-eight-thousand',
    teamLifePointsBefore: [9000, 10000],
    teamLifePointsAfter: [12000, 9500]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.teamLifePointsAfter, [12000, 9500]);
});

test('records a zero-delta event so a no-gain trigger cannot replay forever', () => {
  const game = makeGame();
  const result = planTagDuelLifePointCommit(game, {
    eventId: 'm451:zero-gain',
    teamLifePointsBefore: [4000, 4000],
    teamLifePointsAfter: [4000, 4000]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.nextProcessedEventIds, ['m451:zero-gain']);
});

test('rejects a non-TagDuel or malformed team container', () => {
  const game = makeGame();
  const standard = { ...game, mode: 'standard' };
  assert.deepEqual(planTagDuelLifePointCommit(standard, {
    eventId: 'm451:mode', teamLifePointsBefore: [4000, 4000], teamLifePointsAfter: [4000, 4000]
  }), { ok: false, reason: 'classic-tag-duel-required' });
  const malformed = { ...game, core: { ...game.core, players: [game.core.players[0]] } };
  assert.deepEqual(planTagDuelLifePointCommit(malformed, {
    eventId: 'm451:shape', teamLifePointsBefore: [4000, 4000], teamLifePointsAfter: [4000, 4000]
  }), { ok: false, reason: 'invalid-tag-duel-team-state' });
});

test('consumes the M443 battle-recovery adapter tuple without mutating the source game', () => {
  const game = makeGame();
  const source = addBattleSource(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID, 0, 0);
  const destroyed = addDestroyed(game, 1);
  const event = {
    eventId: 'm451:battle-source',
    sourceUid: source.uid,
    sourceCardId: source.id,
    sourceFaceUpWhenDestroying: true,
    sourceControllerTeam: 0,
    sourceBattleRole: 'attacker',
    destroyedMonsterUid: destroyed.uid,
    destroyerUid: source.uid,
    destroyedByBattle: true,
    destination: 'graveyard'
  };
  const before = currentLP(game);
  const battle = resolveTagBattleLifePointRecovery(game, event);
  assert.equal(battle.ok, true);
  const plan = planTagDuelLifePointCommit(game, {
    eventId: event.eventId,
    teamLifePointsBefore: before,
    teamLifePointsAfter: battle.value.result.teamLifePoints
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.value.teamLifePointsAfter[0], before[0] + battle.value.result.gainAmount);
  assert.deepEqual(currentLP(game), before);
});

test('consumes the M444 Standby recovery tuple while preserving its task and UID snapshots', () => {
  const game = makeGame(2);
  addFairy(game, 0, 0);
  const event = openStandby(game);
  const standby = resolveTagStandbyLpRecovery(game, event);
  assert.equal(standby.ok, true);
  const plan = planTagDuelLifePointCommit(game, {
    eventId: event.eventId,
    teamLifePointsBefore: standby.value.teamLifePointsBefore,
    teamLifePointsAfter: standby.value.teamLifePointsAfter
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.value.teamLifePointsAfter[0], 5000);
  assert.deepEqual(currentLP(game), [4000, 4000]);
});

test('consumes the M447 Solemn Wishes draw-gain tuple for the physical drawing team', () => {
  const game = makeGame(0);
  addSolemnWishes(game, 0, 0);
  const event = makeDrawEvent(game, 0, 'm451:solemn-wishes');
  const draw = resolveTagSolemnWishesDrawGain(game, event);
  assert.equal(draw.ok, true);
  const plan = planTagDuelLifePointCommit(game, {
    eventId: event.eventId,
    teamLifePointsBefore: draw.value.result.teamLifePointsBefore,
    teamLifePointsAfter: draw.value.result.teamLifePointsAfterGain
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.value.teamLifePointsAfter[0], 4500);
  assert.deepEqual(currentLP(game), [4000, 4000]);
});

test('public summary does not expose player UIDs or private identity', () => {
  const summary = tagDuelLifePointCommitPublicSummary();
  assert.match(summary, /UIDs privados não são expostos publicamente/i);
  assert.equal(summary.includes('m0:'), false);
});
