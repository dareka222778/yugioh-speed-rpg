'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm471-tag-decision-timeout-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const ui = require('../dist/tagUI');
const { handleTagComponent } = require('../dist/tagInteraction');
const { validateDiscordPayload } = require('../dist/discordPayload');
const { rulesFor } = require('../dist/rulesProfile');
const { DECISION_TIMEOUT_MS } = require('../dist/duelStore');
const { decisionPlayer } = require('../dist/duelEngine');

const member = (run, seat) => run + '-seat-' + seat;
let interactionSequence = 0;

function createPlayers(ids) {
  for (const id of ids) database.createPlayer(id, id);
}

function inventorySnapshot() {
  const count = table => database.db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
  return {
    playerCards: count('player_cards'),
    starterGrants: count('starter_grants'),
    decks: count('decks')
  };
}

function lockOwners(sessionId) {
  return database.db.prepare(
    'SELECT owner FROM tag_members WHERE session_id=? ORDER BY owner'
  ).all(sessionId).map(row => row.owner);
}

function components(payload) {
  return (payload.components || []).flatMap(row => row.toJSON().components || []);
}

function componentId(payload, prefix) {
  const found = components(payload).find(component =>
    typeof component.custom_id === 'string' && component.custom_id.startsWith(prefix)
  );
  assert.ok(found, 'expected Discord component with custom ID prefix ' + prefix);
  return found.custom_id;
}

function assertNoHandUids(record, payload, label) {
  validateDiscordPayload(payload);
  if (!record.state) return;
  const serialized = JSON.stringify(payload);
  for (const physicalMember of record.state.members) {
    for (const card of tag.tagMemberHand(record.state, physicalMember.id)) {
      assert.equal(serialized.includes(card.uid), false, label + ' leaked hand UID from ' + physicalMember.id);
    }
  }
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
  for (const team of state.core.players) {
    assert.ok(team.monsters.length <= 3);
    assert.ok(team.backrow.length <= 3);
    assert.ok(Object.prototype.hasOwnProperty.call(team, 'field'), 'Field Zone must remain separate from the three backrow slots');
  }
}

function makeInteraction(record, actor, customId, values = []) {
  const calls = [];
  const replies = [];
  return {
    id: 'm471-' + actor + '-' + (++interactionSequence),
    guildId: record.guild,
    user: { id: actor },
    customId,
    values,
    isButton: () => false,
    isStringSelectMenu: () => true,
    deferUpdate: async () => { calls.push('deferUpdate'); },
    deferReply: async options => {
      calls.push('deferReply');
      assert.ok(options && options.flags);
    },
    editReply: async payload => {
      calls.push('editReply');
      validateDiscordPayload(payload);
      replies.push(payload);
    },
    calls,
    replies
  };
}

async function acceptThroughDiscord(record, actor) {
  const customId = componentId(ui.tagPublicMessage(record), 'tag:accept:');
  const interaction = makeInteraction(record, actor, customId);
  const refreshes = [];
  await handleTagComponent(interaction, async next => {
    const payload = ui.tagPublicMessage(next);
    assertNoHandUids(next, payload, 'public lobby/game refresh');
    refreshes.push(next.status);
  }, () => {});
  assert.deepEqual(interaction.calls, ['deferUpdate', 'editReply']);
  assert.equal(refreshes.length, 1);
  return store.getTag(record.id);
}

function createLobby(run, ids) {
  return store.createTagLobby(ids, run + '-guild', run + '-channel', 'classic-loan');
}

test('TagDuel decision timeout is exact, finishes by W.O., persists a public event and releases all four locks', async () => {
  const ids = [0, 1, 2, 3].map(seat => member('m471-timeout', seat));
  createPlayers(ids);
  const beforeInventory = inventorySnapshot();
  let record = createLobby('m471-timeout', ids);
  for (const actor of ids.slice(1)) record = await acceptThroughDiscord(record, actor);

  assert.equal(record.status, 'playing');
  assert.ok(record.state);
  tag.assertTagDuel(record.state);
  assertOwnerRules(record.state);
  assert.deepEqual(lockOwners(record.id), [...ids].sort());

  const activeMember = tag.tagDecisionMember(record.state).id;
  const activeSeat = ids.indexOf(activeMember);
  assert.ok(activeSeat >= 0);
  const losingTeam = decisionPlayer(record.state.core);
  const expectedWinner = 'tag-team-' + (1 - losingTeam);
  const beforeUids = tag.tagInventory(record.state).map(card => card.uid).sort();
  const beforeLp = record.state.core.players.map(team => team.lp);

  const activePanel = ui.tagPrivateMessage(record, activeMember);
  assertNoHandUids(record, activePanel, 'active representative private panel');
  const staleActionId = componentId(activePanel, 'tag:act:');
  assert.ok(tag.tagActions(record.state, activeMember).length > 0);

  store.setTagMessage(record.id, 'm471-public-message', record.channel);
  const base = Date.now() - DECISION_TIMEOUT_MS;
  database.db.prepare('UPDATE tag_sessions SET updated=? WHERE id=?').run(base, record.id);
  const deadline = base + DECISION_TIMEOUT_MS;

  const beforeDeadline = store.getTag(record.id, deadline - 1);
  assert.equal(beforeDeadline.status, 'playing');
  assert.equal(beforeDeadline.revision, record.revision);
  assert.deepEqual(lockOwners(record.id), [...ids].sort());

  const finished = store.getTag(record.id, deadline);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.revision, record.revision + 1);
  assert.equal(finished.state.core.phase, 'finished');
  assert.equal(finished.state.core.winner, expectedWinner);
  assert.match(finished.state.core.reason, /tempo de decisão esgotado/);
  tag.assertTagDuel(finished.state);
  assert.deepEqual(tag.tagInventory(finished.state).map(card => card.uid).sort(), beforeUids);
  assert.deepEqual(finished.state.core.players.map(team => team.lp), beforeLp);
  assert.deepEqual(lockOwners(record.id), []);
  for (const id of ids) assert.equal(store.currentTag(id), undefined);

  const events = store.tagEventsAt(record.id, finished.revision);
  assert.ok(events.some(event =>
    event.type === 'duelFinished' && event.visibility === 'public' && event.winner === expectedWinner
  ), 'the W.O. result must be persisted as a public transition event');

  const publicPayload = ui.tagPublicMessage(finished);
  assertNoHandUids(finished, publicPayload, 'timed-out public panel');
  for (const id of ids) {
    const privatePayload = ui.tagPrivateMessage(finished, id);
    assertNoHandUids(finished, privatePayload, 'timed-out private panel');
  }

  const due = store.dueTags();
  assert.ok(due.some(item => item.id === record.id && item.status === 'finished' && item.revision === finished.revision),
    'the finished public duel must be queued for Discord refresh');
  store.markTagPublished(record.id, finished.revision);
  assert.equal(store.dueTags().some(item => item.id === record.id), false);
  assert.deepEqual(inventorySnapshot(), beforeInventory);
});

test('a stale active-seat action menu cannot mutate a duel after its decision timeout', async () => {
  const ids = [0, 1, 2, 3].map(seat => member('m471-stale', seat));
  createPlayers(ids);
  const beforeInventory = inventorySnapshot();
  let record = createLobby('m471-stale', ids);
  for (const actor of ids.slice(1)) record = await acceptThroughDiscord(record, actor);

  const activeMember = tag.tagDecisionMember(record.state).id;
  const staleActionId = componentId(ui.tagPrivateMessage(record, activeMember), 'tag:act:');
  const beforeRevision = record.revision;
  const beforeState = JSON.stringify(record.state);
  const base = Date.now() - DECISION_TIMEOUT_MS;
  database.db.prepare('UPDATE tag_sessions SET updated=? WHERE id=?').run(base, record.id);

  const staleAction = makeInteraction(record, activeMember, staleActionId, ['0']);
  await assert.rejects(
    handleTagComponent(staleAction, async () => assert.fail('timed-out action must not refresh as a live turn'), () => {}),
    /Painel desatualizado. Atualize antes de jogar/
  );

  const finished = store.getTag(record.id, base + DECISION_TIMEOUT_MS + 1);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.revision, beforeRevision + 1);
  assert.equal(JSON.stringify(finished.state), JSON.stringify(store.getTag(record.id).state));
  assert.deepEqual(staleAction.calls, ['deferUpdate']);
  assert.deepEqual(lockOwners(record.id), []);
  for (const id of ids) assert.equal(store.currentTag(id), undefined);
  assert.notEqual(JSON.stringify(finished.state), beforeState);
  assert.deepEqual(inventorySnapshot(), beforeInventory);
});

after(() => {
  database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
