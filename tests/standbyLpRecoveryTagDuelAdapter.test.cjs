const test = require('node:test');
const assert = require('node:assert/strict');
const {
  captureDarklordMarieActivationUids,
  resolveTagStandbyLpRecovery,
  standbyLpRecoveryPublicSummary
} = require('../dist/standbyLpRecoveryTagDuelAdapter');
const {
  DANCING_FAIRY_CARD_ID,
  DARKLORD_MARIE_CARD_ID
} = require('../dist/dancingFairyStandby');
const { createTagDuel, tagNormalCardIds } = require('../dist/tagDuel');

function makeGame(first = 2) {
  const deck = tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: 'seat-' + seat,
    name: 'Seat ' + seat,
    cards: [...deck]
  }));
  return createTagDuel(players, { seed: 'm444-standby-lp', first, classic: true });
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

function addFairy(game, ownerSeat = 0, controllerTeam = 0, overrides = {}) {
  const physical = takeCard(game, ownerSeat);
  const source = {
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
  game.core.players[controllerTeam].monsters.push(source);
  return source;
}

function addMarie(game, ownerSeat = 0, graveyardTeam = ownerSeat % 2) {
  const physical = takeCard(game, ownerSeat);
  const source = { ...physical, id: DARKLORD_MARIE_CARD_ID };
  game.core.players[graveyardTeam].grave.push(source);
  return source;
}

function openTask(game, team = game.core.current, activationUids) {
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

test('Dancing Fairy recovers 1000 shared team LP from the live Standby task', () => {
  const game = makeGame(2);
  const fairy = addFairy(game, 0, 0);
  const event = openTask(game);
  const before = JSON.stringify(game);
  const result = resolveTagStandbyLpRecovery(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.triggered, true);
  assert.equal(result.value.requestedGain, 1000);
  assert.deepEqual(result.value.teamLifePointsAfter, [5000, 4000]);
  assert.equal(result.value.activePhysicalSeat, 2);
  assert.equal(result.value.dancingFairy.triggerSources[0].uid, fairy.uid);
  assert.equal(result.value.dancingFairy.triggerSources[0].physicalOwnerSeat, 0);
  assert.equal(JSON.stringify(game), before);
});

test('a partner-owned Dancing Fairy controlled by the active team benefits the controller team', () => {
  const game = makeGame(2);
  const fairy = addFairy(game, 2, 0);
  const event = openTask(game);
  const result = resolveTagStandbyLpRecovery(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.recipientTeam, 0);
  assert.equal(result.value.dancingFairy.triggerSources[0].physicalOwnerSeat, 2);
  assert.deepEqual(result.value.teamLifePointsAfter, [5000, 4000]);
});

test('a stolen Dancing Fairy follows its current controller team, not its physical owner team', () => {
  const game = makeGame(2);
  const fairy = addFairy(game, 1, 0);
  const event = openTask(game);
  const result = resolveTagStandbyLpRecovery(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.dancingFairy.triggerSources[0].uid, fairy.uid);
  assert.equal(result.value.dancingFairy.triggerSources[0].physicalOwnerSeat, 1);
  assert.equal(result.value.recipientTeam, 0);
});

test('Dancing Fairy does not recover when controlled by the opposing team', () => {
  const game = makeGame(2);
  addFairy(game, 0, 1);
  const event = openTask(game);
  const result = resolveTagStandbyLpRecovery(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.triggered, false);
  assert.deepEqual(result.value.teamLifePointsAfter, [4000, 4000]);
});

test('Dancing Fairy requires face-up Defense Position at resolution', () => {
  for (const overrides of [{ position: 'atk' }, { faceUp: false }]) {
    const game = makeGame(2);
    addFairy(game, 0, 0, overrides);
    const result = resolveTagStandbyLpRecovery(game, openTask(game));
    assert.equal(result.ok, true);
    assert.equal(result.value.dancingFairy.triggerCount, 0);
  }
});

test('a negated resolving Standby task suppresses both LP recovery effects', () => {
  const game = makeGame(2);
  addFairy(game, 0, 0);
  addMarie(game, 2, 0);
  const event = openTask(game);
  game.core.pendingNegated = true;
  const result = resolveTagStandbyLpRecovery(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.triggered, false);
  assert.deepEqual(result.value.teamLifePointsAfter, [4000, 4000]);
});

test('per-copy negation suppresses only the selected Dancing Fairy UID', () => {
  const game = makeGame(2);
  const negated = addFairy(game, 0, 0);
  const eligible = addFairy(game, 2, 0);
  const event = { ...openTask(game), negatedSourceUids: [negated.uid] };
  const result = resolveTagStandbyLpRecovery(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.dancingFairy.triggerCount, 1);
  assert.equal(result.value.dancingFairy.triggerSources[0].uid, eligible.uid);
  assert.equal(result.value.requestedGain, 1000);
});

test('per-copy negation suppresses only the selected Darklord Marie UID', () => {
  const game = makeGame(2);
  const negated = addMarie(game, 0, 0);
  const eligible = addMarie(game, 2, 0);
  const event = { ...openTask(game), negatedSourceUids: [negated.uid] };
  const result = resolveTagStandbyLpRecovery(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.darklordMarie.triggerCount, 1);
  assert.equal(result.value.darklordMarie.triggerSources[0].uid, eligible.uid);
  assert.equal(result.value.requestedGain, 200);
});

test('rejects a per-card negation UID that is not a physical Standby recovery card', () => {
  const game = makeGame(2);
  const event = { ...openTask(game), negatedSourceUids: ['m0:missing'] };
  const result = resolveTagStandbyLpRecovery(game, event);
  assert.deepEqual(result, { ok: false, reason: 'negated-source-uid-is-not-a-standby-recovery-card' });
});

test('Darklord Marie recovers 200 LP only if the same physical UID was in the shared Graveyard at activation and resolution', () => {
  const game = makeGame(2);
  const marie = addMarie(game, 0, 0);
  const activation = captureDarklordMarieActivationUids(game, 0);
  const event = openTask(game, 0, activation);
  const result = resolveTagStandbyLpRecovery(game, event);
  assert.equal(result.ok, true);
  assert.equal(result.value.darklordMarie.triggerCount, 1);
  assert.equal(result.value.darklordMarie.triggerSources[0].uid, marie.uid);
  assert.equal(result.value.darklordMarie.triggerSources[0].physicalOwnerSeat, 0);
  assert.deepEqual(result.value.teamLifePointsAfter, [4200, 4000]);
});

test('Darklord Marie does not resolve after leaving the Graveyard following activation', () => {
  const game = makeGame(2);
  const marie = addMarie(game, 0, 0);
  const activation = captureDarklordMarieActivationUids(game, 0);
  game.core.players[0].grave = game.core.players[0].grave.filter(card => card.uid !== marie.uid);
  game.reserves['0'].hand.push(marie);
  const result = resolveTagStandbyLpRecovery(game, openTask(game, 0, activation));
  assert.equal(result.ok, true);
  assert.equal(result.value.darklordMarie.triggerCount, 0);
  assert.deepEqual(result.value.teamLifePointsAfter, [4000, 4000]);
});

test('Darklord Marie entering the Graveyard after activation is not eligible', () => {
  const game = makeGame(2);
  const activation = captureDarklordMarieActivationUids(game, 0);
  addMarie(game, 0, 0);
  const result = resolveTagStandbyLpRecovery(game, openTask(game, 0, activation));
  assert.equal(result.ok, true);
  assert.equal(result.value.darklordMarie.triggerCount, 0);
});

test('multiple Dancing Fairies and Darklord Maries stack by physical copy', () => {
  const game = makeGame(2);
  addFairy(game, 0, 0);
  addFairy(game, 2, 0);
  addMarie(game, 0, 0);
  addMarie(game, 2, 0);
  const result = resolveTagStandbyLpRecovery(game, openTask(game));
  assert.equal(result.ok, true);
  assert.equal(result.value.dancingFairy.triggerCount, 2);
  assert.equal(result.value.darklordMarie.triggerCount, 2);
  assert.equal(result.value.requestedGain, 2400);
  assert.deepEqual(result.value.teamLifePointsAfter, [6400, 4000]);
});

test('each Darklord Marie copy is once per turn without suppressing other copies', () => {
  const game = makeGame(2);
  const used = addMarie(game, 0, 0);
  const fresh = addMarie(game, 2, 0);
  const event = openTask(game);
  const result = resolveTagStandbyLpRecovery(game, event, [], [game.core.turn + ':' + used.uid]);
  assert.equal(result.ok, true);
  assert.equal(result.value.darklordMarie.triggerCount, 1);
  assert.equal(result.value.darklordMarie.triggerSources[0].uid, fresh.uid);
  assert.equal(result.value.requestedGain, 200);
});

test('Dancing Fairy uses the per-UID turn ledger to prevent a duplicate same-turn trigger', () => {
  const game = makeGame(2);
  const fairy = addFairy(game, 0, 0);
  const event = openTask(game);
  const result = resolveTagStandbyLpRecovery(game, event, [], [game.core.turn + ':' + fairy.uid]);
  assert.equal(result.ok, true);
  assert.equal(result.value.dancingFairy.triggerCount, 0);
});

test('both card families route recovery to team 1 during its physical representative turn', () => {
  const game = makeGame(1);
  addFairy(game, 3, 1);
  addMarie(game, 1, 1);
  const result = resolveTagStandbyLpRecovery(game, openTask(game, 1));
  assert.equal(result.ok, true);
  assert.equal(result.value.activePhysicalSeat, 1);
  assert.deepEqual(result.value.teamLifePointsAfter, [4000, 5200]);
});

test('duplicate event and per-copy turn keys make the complete result idempotent', () => {
  const game = makeGame(2);
  addFairy(game, 0, 0);
  addMarie(game, 0, 0);
  const event = openTask(game);
  const first = resolveTagStandbyLpRecovery(game, event);
  assert.equal(first.ok, true);
  const retry = resolveTagStandbyLpRecovery(
    game,
    event,
    first.value.processedEventIds,
    first.value.processedTurnCardKeys
  );
  assert.equal(retry.ok, true);
  assert.equal(retry.value.triggered, false);
  assert.equal(retry.value.reason, 'duplicate-event');
  assert.deepEqual(retry.value.teamLifePointsAfter, [4000, 4000]);
});

test('rejects a task that is not the currently resolving Standby continuation', () => {
  const game = makeGame(2);
  const event = openTask(game);
  delete game.core.standby.active;
  assert.deepEqual(resolveTagStandbyLpRecovery(game, event), {
    ok: false,
    reason: 'matching-standby-task-is-not-active-for-resolution'
  });
});

test('rejects wrong task identity, turn, team and phase without mutating the game', () => {
  const game = makeGame(2);
  const event = openTask(game);
  assert.match(resolveTagStandbyLpRecovery(game, { ...event, taskId: 'other' }).reason, /deterministic-task/);
  assert.match(resolveTagStandbyLpRecovery(game, { ...event, turnNumber: event.turnNumber + 1 }).reason, /deterministic-task/);
  assert.match(resolveTagStandbyLpRecovery(game, { ...event, activeTeam: 1 }).reason, /deterministic-task/);
  const before = JSON.stringify(game);
  game.core.phase = 'main';
  assert.equal(resolveTagStandbyLpRecovery(game, event).ok, false);
  assert.notEqual(JSON.stringify(game), before);
});

test('rejects a Darklord Marie stored in the wrong physical-owner team Graveyard', () => {
  const game = makeGame(2);
  addMarie(game, 1, 0);
  assert.throws(() => captureDarklordMarieActivationUids(game, 0), /equipe proprietária/);
});

test('does not cap shared team LP at 8000', () => {
  const game = makeGame(2);
  addFairy(game, 0, 0);
  game.core.players[0].lp = 7900;
  const result = resolveTagStandbyLpRecovery(game, openTask(game));
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.teamLifePointsAfter, [8900, 4000]);
});

test('the adapter does not expose private card UIDs in its public summary', () => {
  const summary = standbyLpRecoveryPublicSummary();
  assert.match(summary, /UIDs e identidades privadas não são exibidos publicamente/i);
  assert.equal(summary.includes(DANCING_FAIRY_CARD_ID), false);
  assert.equal(summary.includes(DARKLORD_MARIE_CARD_ID), false);
});
