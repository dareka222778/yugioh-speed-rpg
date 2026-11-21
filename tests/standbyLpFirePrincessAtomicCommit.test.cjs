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

function currentLP(game) {
  return [game.core.players[0].lp, game.core.players[1].lp];
}

function makePipelinePlan(game, event, sourceLedger = [], fireLedger = [], negatedFirePrincessUids = []) {
  const before = currentLP(game);
  const standby = resolveTagStandbyLpRecovery(game, event);
  assert.equal(standby.ok, true, standby.reason || 'Standby adapter must resolve');
  const plan = planTagDuelLpGainFirePrincessPipeline(game, {
    eventId: event.eventId,
    gainingTeam: event.activeTeam,
    lpGained: standby.value.requestedGain,
    teamLifePointsBefore: before,
    teamLifePointsAfterGain: standby.value.teamLifePointsAfter,
    negatedFirePrincessUids
  }, sourceLedger, fireLedger);
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
  return store.getTag(id);
}

function ledger(sessionId) {
  return database.db.prepare(
    'SELECT source_event_ids,fire_princess_event_ids FROM tag_lp_event_ledgers WHERE session_id=?'
  ).get(sessionId);
}

function inventory(state) {
  return new Map(tag.tagInventory(state).map(card => [card.uid, card.id]));
}

function assertConserved(state, before) {
  const current = inventory(state);
  assert.equal(current.size, before.size);
  for (const [uid, id] of before) assert.equal(current.get(uid), id, 'physical card identity changed: ' + uid);
}

function assertOwnerUid(uid, seat) {
  assert.match(uid, new RegExp('^m' + seat + ':'));
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

test('Dancing Fairy recovery feeds Fire Princess and both ledgers commit with the shared LP tuple', () => {
  const game = makeGame(0);
  const fairy = addFairy(game, 2, 0); // partner-owned physical card, controlled by team 0
  const princess = addPrincess(game, 0, 0);
  const event = openStandbyTask(game, 0);
  const beforeGame = JSON.stringify(game);
  const beforeInventory = inventory(game);

  const { standby, plan } = makePipelinePlan(game, event);
  assert.equal(standby.requestedGain, 1000);
  assert.equal(standby.dancingFairy.triggerCount, 1);
  assert.equal(standby.dancingFairy.triggerSources[0].uid, fairy.uid);
  assert.equal(standby.dancingFairy.triggerSources[0].physicalOwnerSeat, 2);
  assert.equal(plan.firePrincess.triggerCount, 1);
  assert.equal(plan.firePrincess.triggerSources[0].uid, princess.uid);
  assert.deepEqual(plan.teamLifePointsBefore, [4000, 4000]);
  assert.deepEqual(plan.teamLifePointsAfter, [5000, 3500]);
  assert.equal(JSON.stringify(game), beforeGame, 'planning must not mutate the live duel');

  const record = register(game, 'm455-fairy-fire');
  const committed = commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan);
  assert.deepEqual(committed, {
    ok: true,
    status: 'committed',
    revision: 8,
    teamLifePoints: [5000, 3500]
  });

  const persisted = store.getTag(record.id);
  assert.equal(persisted.revision, 8);
  assert.deepEqual(currentLP(persisted.state), [5000, 3500]);
  assertOwnerUid(fairy.uid, 2);
  assertOwnerUid(princess.uid, 0);
  assertConserved(persisted.state, beforeInventory);
  tag.assertTagDuel(persisted.state);
  assertOwnerRules(persisted.state);

  const saved = ledger(record.id);
  assert.deepEqual(JSON.parse(saved.source_event_ids), [event.eventId]);
  assert.deepEqual(JSON.parse(saved.fire_princess_event_ids), [event.eventId + ':fire-princess']);
});

test('Darklord Marie activation snapshot feeds the opposing Fire Princess burn for team 1', () => {
  const game = makeGame(1);
  const marie = addMarie(game, 3, 1); // partner-owned physical copy in team 1 shared Graveyard
  const princess = addPrincess(game, 1, 1);
  const event = openStandbyTask(game, 1);
  const beforeInventory = inventory(game);

  assert.deepEqual(event.activationDarklordMarieUids, [marie.uid]);
  const { standby, plan } = makePipelinePlan(game, event);
  assert.equal(standby.darklordMarie.triggerCount, 1);
  assert.equal(standby.darklordMarie.triggerSources[0].uid, marie.uid);
  assert.equal(standby.requestedGain, 200);
  assert.equal(plan.firePrincess.triggerCount, 1);
  assert.equal(plan.firePrincess.triggerSources[0].uid, princess.uid);
  assert.deepEqual(plan.teamLifePointsAfter, [3500, 4200]);

  const record = register(game, 'm455-marie-fire');
  const committed = commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan);
  assert.deepEqual(committed, {
    ok: true,
    status: 'committed',
    revision: 8,
    teamLifePoints: [3500, 4200]
  });
  const persisted = store.getTag(record.id);
  assert.deepEqual(currentLP(persisted.state), [3500, 4200]);
  assertOwnerUid(marie.uid, 3);
  assertOwnerUid(princess.uid, 1);
  assertConserved(persisted.state, beforeInventory);
  tag.assertTagDuel(persisted.state);
  assertOwnerRules(persisted.state);
});

test('committed replay is idempotent and a new event with stale session revision cannot overwrite it', () => {
  const game = makeGame(0);
  addFairy(game, 0, 0);
  addPrincess(game, 2, 0);
  const event = openStandbyTask(game, 0);
  const { plan } = makePipelinePlan(game, event);
  const record = register(game, 'm455-idempotency');
  const first = commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan);
  assert.equal(first.status, 'committed');

  const duplicate = commitTagDuelLpGainPipelinePlan(record.id, record.revision, plan);
  assert.deepEqual(duplicate, {
    ok: true,
    status: 'duplicate-event',
    revision: 8,
    teamLifePoints: [5000, 3500]
  });

  const persisted = store.getTag(record.id);
  const saved = ledger(record.id);
  const sourceIds = JSON.parse(saved.source_event_ids);
  const fireIds = JSON.parse(saved.fire_princess_event_ids);
  const secondPlan = planTagDuelLpGainFirePrincessPipeline(persisted.state, {
    eventId: 'm455:second-event',
    gainingTeam: 0,
    lpGained: 500,
    teamLifePointsBefore: [5000, 3500],
    teamLifePointsAfterGain: [5500, 3500]
  }, sourceIds, fireIds);
  assert.equal(secondPlan.ok, true, secondPlan.reason || 'second event must plan from persisted snapshot');

  assert.deepEqual(commitTagDuelLpGainPipelinePlan(record.id, record.revision, secondPlan.value), {
    ok: false,
    reason: 'stale-session-revision'
  });
  const after = store.getTag(record.id);
  assert.equal(after.revision, 8);
  assert.deepEqual(currentLP(after.state), [5000, 3500]);
  assert.deepEqual(JSON.parse(ledger(record.id).source_event_ids), [event.eventId]);
});

after(() => {
  database.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
