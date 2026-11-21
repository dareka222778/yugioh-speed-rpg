'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm455-standby-lp-'));
process.env.DATABASE_PATH = path.join(dir, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const { rulesFor } = require('../dist/rulesProfile');
const { advanceStandby, chooseStandby } = require('../dist/standbyFlow');
const {
  captureDarklordMarieActivationUids,
  resolveTagStandbyLpRecovery
} = require('../dist/standbyLpRecoveryTagDuelAdapter');
const {
  DANCING_FAIRY_CARD_ID,
  DARKLORD_MARIE_CARD_ID
} = require('../dist/dancingFairyStandby');
const { FIRE_PRINCESS_CARD_ID } = require('../dist/firePrincessLpGain');
const { planTagDuelLpGainFirePrincessPipeline } = require('../dist/tagDuelLpGainFirePrincessPipeline');
const { commitTagDuelLpGainPipelinePlan } = require('../dist/tagDuelLifePointStore');

const member = seat => 'm455-seat-' + seat;

function makeGame(first = 0) {
  const deck = tag.tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M455 Seat ' + seat,
    cards: [...deck]
  }));
  return tag.createTagDuel(players, {
    classic: true,
    first,
    seed: 'm455-standby-lp-atomic-' + first
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

function addFairy(game, ownerSeat, controllerTeam) {
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
    defBoost: 0
  };
  game.core.players[controllerTeam].monsters.push(card);
  return card;
}

function addMarie(game, ownerSeat, graveyardTeam) {
  const physical = takeCard(game, ownerSeat);
  const card = { ...physical, id: DARKLORD_MARIE_CARD_ID };
  game.core.players[graveyardTeam].grave.push(card);
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

function openStandbyTask(game, team = game.core.current) {
  const activationDarklordMarieUids = captureDarklordMarieActivationUids(game, team);
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
    completed: []
  };
  assert.equal(advanceStandby(game.core), true, 'the real Standby scheduler must open the active task');
  chooseStandby(game.core, team, 'resolve');
  return {
    eventId: taskId + ':resolution',
    taskId,
    turnNumber,
    activeTeam: team,
    activationDarklordMarieUids
  };
}

function currentLP(game) {
  return [game.core.players[0].lp, game.core.players[1].lp];
}

function makeStandbyPlan(game, event) {
  const before = currentLP(game);
  const standby = resolveTagStandbyLpRecovery(game, event);
  assert.equal(standby.ok, true, standby.reason || 'Standby adapter must resolve');
  const plan = planTagDuelLpGainFirePrincessPipeline(game, {
    eventId: event.eventId,
    gainingTeam: event.activeTeam,
    lpGained: standby.value.requestedGain,
    teamLifePointsBefore: before,
    teamLifePointsAfterGain: standby.value.teamLifePointsAfter
  });
  assert.equal(plan.ok, true, plan.reason || 'LP pipeline must plan');
  return { standby: standby.value, plan: plan.value };
}

function register(state, id) {
  const members = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M455 Seat ' + seat,
    accepted: true
  }));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(
    id, 'm455-guild', 'm455-channel', 'm455-message', 7, Date.now(),
    'playing', JSON.stringify(members), JSON.stringify(state), 'classic-loan'
  );
  // Do not call getTag here: it validates admission before the tested commit boundary.
  return { id, revision: 7 };
}

function ledger(sessionId) {
  return database.db.prepare(
    'SELECT source_event_ids,fire_princess_event_ids FROM tag_lp_event_ledgers WHERE session_id=?'
  ).get(sessionId);
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

test('Dancing Fairy and Fire Princess plan correct 2v2 LP, but unadmitted cards cannot cross the storage boundary', () => {
  const game = makeGame(0);
  const fairy = addFairy(game, 2, 0);
  const princess = addPrincess(game, 0, 0);
  const event = openStandbyTask(game, 0);
  const beforeGame = JSON.stringify(game);

  const { standby, plan } = makeStandbyPlan(game, event);
  assert.equal(standby.requestedGain, 1000);
  assert.equal(standby.dancingFairy.triggerCount, 1);
  assert.equal(standby.dancingFairy.triggerSources[0].uid, fairy.uid);
  assert.equal(standby.dancingFairy.triggerSources[0].physicalOwnerSeat, 2);
  assert.equal(plan.firePrincess.triggerCount, 1);
  assert.equal(plan.firePrincess.triggerSources[0].uid, princess.uid);
  assert.deepEqual(plan.teamLifePointsAfter, [5000, 3500]);
  assert.equal(JSON.stringify(game), beforeGame, 'both planners must remain read-only');
  // The planner input intentionally remains an active, unpersisted Standby
  // continuation. Exercise the persistence gate with a clean session snapshot
  // containing the same candidate cards, so the failure isolates admission
  // rather than an unrelated continuation-state invariant.
  const persisted = makeGame(0);
  addFairy(persisted, 2, 0);
  addPrincess(persisted, 0, 0);
  assert.throws(
    () => tag.assertTagDuel(persisted),
    /Estado do duelo inválido: identificador de carta ausente, duplicado ou desconhecido/
  );
  const record = register(persisted, 'm455-fairy-fire-gate');
  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan), {
    ok: false,
    reason: 'invalid-tag-session-state'
  });

  const unchanged = rawSession(record.id);
  assert.equal(unchanged.revision, 7);
  assert.deepEqual(currentLP(unchanged.state), [4000, 4000]);
  assert.equal(ledger(record.id), undefined, 'no partial source or Fire Princess ledger may be written');
});

test('Darklord Marie activation snapshot and Fire Princess team routing are planned, then fail closed before persistence', () => {
  const game = makeGame(1);
  const marie = addMarie(game, 3, 1);
  const princess = addPrincess(game, 1, 1);
  const event = openStandbyTask(game, 1);
  const beforeGame = JSON.stringify(game);

  assert.deepEqual(event.activationDarklordMarieUids, [marie.uid]);
  const { standby, plan } = makeStandbyPlan(game, event);
  assert.equal(standby.darklordMarie.triggerCount, 1);
  assert.equal(standby.darklordMarie.triggerSources[0].uid, marie.uid);
  assert.equal(standby.requestedGain, 200);
  assert.equal(plan.firePrincess.triggerCount, 1);
  assert.equal(plan.firePrincess.triggerSources[0].uid, princess.uid);
  assert.deepEqual(plan.teamLifePointsAfter, [3500, 4200]);
  assert.equal(JSON.stringify(game), beforeGame);
  // Use a separate clean persisted snapshot to isolate the card-admission
  // boundary from the in-flight Standby continuation used by the planner.
  const persisted = makeGame(1);
  addMarie(persisted, 3, 1);
  addPrincess(persisted, 1, 1);
  assert.throws(
    () => tag.assertTagDuel(persisted),
    /Estado do duelo inválido: identificador de carta ausente, duplicado ou desconhecido/
  );
  const record = register(persisted, 'm455-marie-fire-gate');
  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan), {
    ok: false,
    reason: 'invalid-tag-session-state'
  });
  const unchanged = rawSession(record.id);
  assert.equal(unchanged.revision, 7);
  assert.deepEqual(currentLP(unchanged.state), [4000, 4000]);
  assert.equal(ledger(record.id), undefined);
});

test('certified-only LP plan commits atomically, duplicate replay is idempotent and stale revision is rejected', () => {
  const game = makeGame(0);
  const beforeInventory = new Map(tag.tagInventory(game).map(card => [card.uid, card.id]));
  const plan = planTagDuelLpGainFirePrincessPipeline(game, {
    eventId: 'm455:generic-lp-gain',
    gainingTeam: 0,
    lpGained: 500,
    teamLifePointsBefore: [4000, 4000],
    teamLifePointsAfterGain: [4500, 4000]
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.value.firePrincess.reason, 'no-eligible-fire-princess');
  assert.deepEqual(plan.value.teamLifePointsAfter, [4500, 4000]);

  const record = register(game, 'm455-certified-only');
  const first = commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan.value);
  assert.deepEqual(first, {
    ok: true,
    status: 'committed',
    revision: 8,
    teamLifePoints: [4500, 4000]
  });

  const duplicate = commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan.value);
  assert.deepEqual(duplicate, {
    ok: true,
    status: 'duplicate-event',
    revision: 8,
    teamLifePoints: [4500, 4000]
  });

  const persisted = store.getTag(record.id);
  assert.equal(persisted.revision, 8);
  assert.deepEqual(currentLP(persisted.state), [4500, 4000]);
  assert.deepEqual(new Map(tag.tagInventory(persisted.state).map(card => [card.uid, card.id])), beforeInventory);
  tag.assertTagDuel(persisted.state);
  assertOwnerRules(persisted.state);
  const saved = ledger(record.id);
  assert.deepEqual(JSON.parse(saved.source_event_ids), ['m455:generic-lp-gain']);
  assert.deepEqual(JSON.parse(saved.fire_princess_event_ids), ['m455:generic-lp-gain:fire-princess']);

  const secondPlan = planTagDuelLpGainFirePrincessPipeline(persisted.state, {
    eventId: 'm455:second-event',
    gainingTeam: 0,
    lpGained: 500,
    teamLifePointsBefore: [4500, 4000],
    teamLifePointsAfterGain: [5000, 4000]
  }, JSON.parse(saved.source_event_ids), JSON.parse(saved.fire_princess_event_ids));
  assert.equal(secondPlan.ok, true);
  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, secondPlan.value), {
    ok: false,
    reason: 'stale-session-revision'
  });
  const after = store.getTag(record.id);
  assert.equal(after.revision, 8);
  assert.deepEqual(currentLP(after.state), [4500, 4000]);
});

after(() => {
  database.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
