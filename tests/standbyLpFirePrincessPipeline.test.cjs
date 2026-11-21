const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  captureDarklordMarieActivationUids,
  resolveTagStandbyLpRecovery,
  standbyLpRecoveryPublicSummary
} = require('../dist/standbyLpRecoveryTagDuelAdapter');
const {
  resolveTagFirePrincessLpGain,
  firePrincessTagDuelPublicSummary
} = require('../dist/firePrincessTagDuelAdapter');
const {
  DANCING_FAIRY_CARD_ID,
  DARKLORD_MARIE_CARD_ID
} = require('../dist/dancingFairyStandby');
const { FIRE_PRINCESS_CARD_ID } = require('../dist/firePrincessLpGain');
const { createTagDuel, tagNormalCardIds } = require('../dist/tagDuel');

function makeGame(first = 2) {
  const deck = tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: 'seat-' + seat,
    name: 'Seat ' + seat,
    cards: [...deck]
  }));
  return createTagDuel(players, { seed: 'm450-standby-fire-princess', first, classic: true });
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

function addFairy(game, ownerSeat = 0, controllerTeam = ownerSeat % 2, overrides = {}) {
  const physical = takeCard(game, ownerSeat);
  const card = {
    ...physical,
    id: DANCING_FAIRY_CARD_ID,
    position: 'def',
    faceUp: true,
    entered: game.core.turn,
    changed: game.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
    ...overrides
  };
  game.core.players[controllerTeam].monsters.push(card);
  return card;
}

function addMarie(game, ownerSeat = 0, graveyardTeam = ownerSeat % 2) {
  const physical = takeCard(game, ownerSeat);
  const card = { ...physical, id: DARKLORD_MARIE_CARD_ID };
  game.core.players[graveyardTeam].grave.push(card);
  return card;
}

function addPrincess(game, ownerSeat = 0, controllerTeam = ownerSeat % 2) {
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

function openStandbyTask(game, team = game.core.current, activationUids) {
  const activationDarklordMarieUids = activationUids === undefined
    ? captureDarklordMarieActivationUids(game, team)
    : [...activationUids];
  const turnNumber = game.core.turn;
  const taskId = 'm444:standby:' + turnNumber + ':' + team;
  game.core.standby = {
    version: 1,
    tasks: [{
      id: taskId,
      turn: turnNumber,
      actor: team,
      optional: false,
      options: [{ id: 'resolve', label: 'Resolver recuperação de LP', operations: [] }]
    }],
    completed: [],
    active: { id: taskId, status: 'responding', choice: 'resolve' }
  };
  game.core.phase = 'response';
  game.core.resume = 'main';
  game.core.pending = {
    kind: 'standby',
    actor: team,
    card: 'standby:' + taskId,
    taskId,
    choiceId: 'resolve'
  };
  game.core.priority = 1 - team;
  game.core.passes = 0;
  game.core.chain = [];
  delete game.core.choice;
  return {
    eventId: taskId + ':resolution',
    taskId,
    turnNumber,
    activeTeam: team,
    activationDarklordMarieUids
  };
}

function resolveStandbyFirePrincessPipeline(
  game,
  event,
  standbyEventLedger = [],
  standbyTurnCardKeys = [],
  firePrincessLedger = [],
  negatedStandbyUids = [],
  negatedFirePrincessUids = []
) {
  const standbyEvent = { ...event, negatedSourceUids: negatedStandbyUids };
  const standby = resolveTagStandbyLpRecovery(
    game,
    standbyEvent,
    standbyEventLedger,
    standbyTurnCardKeys
  );
  if (!standby.ok) return { ok: false, stage: 'standby', reason: standby.reason };

  const recovery = standby.value;
  // The trusted caller atomically commits the combined Standby LP gain.
  game.core.players[0].lp = recovery.teamLifePointsAfter[0];
  game.core.players[1].lp = recovery.teamLifePointsAfter[1];

  const fireEvent = {
    eventId: event.eventId,
    gainingTeam: event.activeTeam,
    lpGained: recovery.requestedGain,
    teamLifePointsAfterGain: recovery.teamLifePointsAfter,
    negatedSourceUids: negatedFirePrincessUids
  };
  const firePrincess = resolveTagFirePrincessLpGain(game, fireEvent, firePrincessLedger);
  if (!firePrincess.ok) {
    return { ok: false, stage: 'fire-princess', reason: firePrincess.reason };
  }

  // The caller commits Fire Princess damage and its independent ledger.
  game.core.players[0].lp = firePrincess.value.result.teamLifePointsAfterDamage[0];
  game.core.players[1].lp = firePrincess.value.result.teamLifePointsAfterDamage[1];

  return {
    ok: true,
    standby: recovery,
    firePrincess: firePrincess.value,
    fireEvent,
    standbyEventLedger: recovery.processedEventIds,
    standbyTurnCardKeys: recovery.processedTurnCardKeys,
    firePrincessLedger: firePrincess.value.processedEventIds
  };
}

test('Dancing Fairy Standby gain flows into Fire Princess burn after the LP commit', () => {
  const game = makeGame(2);
  const fairy = addFairy(game, 1, 0); // physical owner is opposing seat 1; current controller is team 0
  const princess = addPrincess(game, 0, 0);
  const event = openStandbyTask(game);
  const result = resolveStandbyFirePrincessPipeline(game, event);

  assert.equal(result.ok, true);
  assert.equal(result.standby.requestedGain, 1000);
  assert.equal(result.standby.recipientTeam, 0);
  assert.equal(result.standby.dancingFairy.triggerSources[0].physicalOwnerSeat, 1);
  assert.equal(result.firePrincess.result.triggerCount, 1);
  assert.equal(result.firePrincess.result.triggerSources[0].uid, princess.uid);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [5000, 3500]);
});

test('Darklord Marie uses the activation-time physical UID snapshot before Fire Princess reacts', () => {
  const game = makeGame(2);
  const marie = addMarie(game, 2, 0);
  addPrincess(game, 0, 0);
  const activation = captureDarklordMarieActivationUids(game, 0);
  const event = openStandbyTask(game, 0, activation);
  const result = resolveStandbyFirePrincessPipeline(game, event);

  assert.equal(result.ok, true);
  assert.deepEqual(activation, [marie.uid]);
  assert.equal(result.standby.darklordMarie.triggerCount, 1);
  assert.equal(result.standby.requestedGain, 200);
  assert.equal(result.firePrincess.result.requestedDamage, 500);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [4200, 3500]);
});

test('Dancing Fairy and Darklord Marie combine against one LP snapshot before one Fire Princess event', () => {
  const game = makeGame(2);
  addFairy(game, 0, 0);
  addMarie(game, 2, 0);
  addPrincess(game, 2, 0);
  const event = openStandbyTask(game);
  const result = resolveStandbyFirePrincessPipeline(game, event);

  assert.equal(result.ok, true);
  assert.equal(result.standby.dancingFairy.triggerCount, 1);
  assert.equal(result.standby.darklordMarie.triggerCount, 1);
  assert.equal(result.standby.requestedGain, 1200);
  assert.equal(result.firePrincess.result.requestedDamage, 500);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [5200, 3500]);
});

test('team 1 receives Standby recovery and routes Fire Princess damage to team 0', () => {
  const game = makeGame(1);
  addFairy(game, 3, 1);
  addPrincess(game, 1, 1);
  const event = openStandbyTask(game, 1);
  const result = resolveStandbyFirePrincessPipeline(game, event);

  assert.equal(result.ok, true);
  assert.equal(result.standby.activePhysicalSeat, 1);
  assert.equal(result.standby.recipientTeam, 1);
  assert.equal(result.firePrincess.result.recipientTeam, 0);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [3500, 5000]);
});

test('two Fire Princess copies stack once each for one combined Standby LP event', () => {
  const game = makeGame(2);
  addFairy(game, 0, 0);
  addPrincess(game, 0, 0);
  addPrincess(game, 2, 0);
  const result = resolveStandbyFirePrincessPipeline(game, openStandbyTask(game));

  assert.equal(result.ok, true);
  assert.equal(result.standby.requestedGain, 1000);
  assert.equal(result.firePrincess.result.triggerCount, 2);
  assert.equal(result.firePrincess.result.requestedDamage, 1000);
  assert.equal(game.core.players[1].lp, 3000);
});

test('per-copy Standby negation suppresses only the selected Dancing Fairy UID', () => {
  const game = makeGame(2);
  const negatedFairy = addFairy(game, 0, 0);
  const eligibleFairy = addFairy(game, 2, 0);
  addPrincess(game, 0, 0);
  const event = openStandbyTask(game);

  const result = resolveStandbyFirePrincessPipeline(
    game,
    event,
    [],
    [],
    [],
    [negatedFairy.uid],
    []
  );
  assert.equal(result.ok, true);
  assert.equal(result.standby.dancingFairy.triggerCount, 1);
  assert.equal(result.standby.dancingFairy.triggerSources[0].uid, eligibleFairy.uid);
  assert.equal(result.standby.requestedGain, 1000);
  assert.equal(result.firePrincess.result.triggerCount, 1);
  assert.equal(result.firePrincess.result.requestedDamage, 500);
});

test('per-copy Fire Princess negation suppresses only the selected Fire Princess UID', () => {
  const game = makeGame(2);
  addFairy(game, 0, 0);
  const negatedPrincess = addPrincess(game, 0, 0);
  const eligiblePrincess = addPrincess(game, 2, 0);
  const event = openStandbyTask(game);

  const result = resolveStandbyFirePrincessPipeline(
    game,
    event,
    [],
    [],
    [],
    [],
    [negatedPrincess.uid]
  );
  assert.equal(result.ok, true);
  assert.equal(result.standby.requestedGain, 1000);
  assert.equal(result.firePrincess.result.triggerCount, 1);
  assert.equal(result.firePrincess.result.triggerSources[0].uid, eligiblePrincess.uid);
  assert.equal(result.firePrincess.result.requestedDamage, 500);
});

test('no eligible Standby recovery produces no Fire Princess burn', () => {
  const game = makeGame(2);
  addPrincess(game, 0, 0);
  const result = resolveStandbyFirePrincessPipeline(game, openStandbyTask(game));

  assert.equal(result.ok, true);
  assert.equal(result.standby.reason, 'no-eligible-copy');
  assert.equal(result.standby.requestedGain, 0);
  assert.equal(result.firePrincess.result.reason, 'no-lp-gain');
  assert.equal(result.firePrincess.result.requestedDamage, 0);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [4000, 4000]);
});

test('Standby and Fire Princess ledgers remain independent and retries cannot gain or burn twice', () => {
  const game = makeGame(2);
  addFairy(game, 0, 0);
  addMarie(game, 2, 0);
  addPrincess(game, 0, 0);
  const event = openStandbyTask(game);
  const first = resolveStandbyFirePrincessPipeline(game, event);
  assert.equal(first.ok, true);
  assert.ok(first.standbyEventLedger.includes(event.eventId + ':fairy'));
  assert.ok(first.standbyEventLedger.includes(event.eventId + ':marie'));
  assert.deepEqual(first.firePrincessLedger, [event.eventId]);
  const afterFirstCommit = [game.core.players[0].lp, game.core.players[1].lp];

  const standbyRetry = resolveTagStandbyLpRecovery(
    game,
    event,
    first.standbyEventLedger,
    first.standbyTurnCardKeys
  );
  assert.equal(standbyRetry.ok, true);
  assert.equal(standbyRetry.value.reason, 'duplicate-event');
  assert.deepEqual(standbyRetry.value.teamLifePointsAfter, afterFirstCommit);

  const burnRetry = resolveTagFirePrincessLpGain(game, first.fireEvent, first.firePrincessLedger);
  assert.equal(burnRetry.ok, true);
  assert.equal(burnRetry.value.result.reason, 'duplicate-event');
  assert.deepEqual(burnRetry.value.result.teamLifePointsAfterDamage, afterFirstCommit);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], afterFirstCommit);
});

test('both adapters remain read-only until the caller atomically commits each LP transition', () => {
  const game = makeGame(2);
  addFairy(game, 0, 0);
  addPrincess(game, 2, 0);
  const event = openStandbyTask(game);
  const before = JSON.stringify(game);

  const standby = resolveTagStandbyLpRecovery(game, event);
  assert.equal(standby.ok, true);
  assert.equal(JSON.stringify(game), before);

  const projected = JSON.parse(before);
  projected.core.players[0].lp = standby.value.teamLifePointsAfter[0];
  projected.core.players[1].lp = standby.value.teamLifePointsAfter[1];
  const firePrincess = resolveTagFirePrincessLpGain(projected, {
    eventId: event.eventId,
    gainingTeam: event.activeTeam,
    lpGained: standby.value.requestedGain,
    teamLifePointsAfterGain: standby.value.teamLifePointsAfter
  });
  assert.equal(firePrincess.ok, true);
  assert.equal(JSON.stringify(game), before);
});

test('public summaries expose neither UIDs nor private physical identities', () => {
  const summary = standbyLpRecoveryPublicSummary() + ' ' + firePrincessTagDuelPublicSummary();
  assert.equal(summary.includes('m0:'), false);
  assert.equal(summary.includes(DANCING_FAIRY_CARD_ID), false);
  assert.equal(summary.includes(DARKLORD_MARIE_CARD_ID), false);
  assert.equal(summary.includes(FIRE_PRINCESS_CARD_ID), false);
  assert.match(summary, /UIDs, mãos privadas|UIDs e identidades privadas/i);
});
