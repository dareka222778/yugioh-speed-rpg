'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm469-tag-lobby-cancel-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const ui = require('../dist/tagUI');
const { handleTagComponent } = require('../dist/tagInteraction');
const { validateDiscordPayload } = require('../dist/discordPayload');
const { rulesFor } = require('../dist/rulesProfile');

const member = (run, seat) => run + '-seat-' + seat;

function inventorySnapshot() {
  const count = table => database.db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
  return {
    playerCards: count('player_cards'),
    starterGrants: count('starter_grants'),
    decks: count('decks')
  };
}

function createPlayers(ids) {
  for (const id of ids) database.createPlayer(id, id);
}

function components(payload) {
  return (payload.components || []).flatMap(row => row.toJSON().components || []);
}

function buttonId(payload, prefix) {
  const found = components(payload).find(component =>
    typeof component.custom_id === 'string' && component.custom_id.startsWith(prefix)
  );
  assert.ok(found, 'expected Discord button with custom ID prefix ' + prefix);
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

function collectUids(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectUids(item, result);
  } else if (value && typeof value === 'object') {
    if (typeof value.uid === 'string') result.push(value.uid);
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'uid') collectUids(child, result);
    }
  }
  return result.sort();
}

function makeInteraction(record, actor, customId) {
  const calls = [];
  const replies = [];
  return {
    id: 'm469-' + actor + '-' + record.revision + '-' + calls.length + '-' + customId.slice(0, 18),
    guildId: record.guild,
    user: { id: actor },
    customId,
    isButton: () => true,
    isStringSelectMenu: () => false,
    deferUpdate: async () => { calls.push('deferUpdate'); },
    deferReply: async options => {
      calls.push('deferReply');
      assert.ok(options && options.flags, 'private Discord responses must be ephemeral');
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

async function dispatch(record, actor, customId) {
  const interaction = makeInteraction(record, actor, customId);
  const refreshed = [];
  await handleTagComponent(interaction, async next => {
    const payload = ui.tagPublicMessage(next);
    assertNoHandUids(next, payload, 'public refresh');
    refreshed.push(next.status);
  }, () => {});
  return { interaction, refreshed, record: store.getTag(record.id) };
}

function lockOwners(sessionId) {
  return database.db.prepare(
    'SELECT owner FROM tag_members WHERE session_id=? ORDER BY owner'
  ).all(sessionId).map(row => row.owner);
}

function makeLobby(run, ids) {
  return store.createTagLobby(ids, run + '-guild', run + '-channel', 'classic-loan');
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

async function acceptThroughDiscord(record, actor) {
  const customId = buttonId(ui.tagPublicMessage(record), 'tag:accept:');
  const result = await dispatch(record, actor, customId);
  assert.deepEqual(result.interaction.calls, ['deferUpdate', 'editReply']);
  assert.equal(result.refreshed.length, 1);
  return result.record;
}

test('an invited non-host can cancel a partially accepted lobby and release every seat lock', async () => {
  const ids = [0, 1, 2, 3].map(seat => member('m469-partial', seat));
  createPlayers(ids);
  const beforeInventory = inventorySnapshot();
  const lobby = makeLobby('m469-partial', ids);
  assert.equal(lobby.status, 'lobby');
  assert.deepEqual(lockOwners(lobby.id), [ids[0]]);

  let current = await acceptThroughDiscord(lobby, ids[2]);
  assert.equal(current.status, 'lobby');
  assert.equal(current.revision, 1);
  assert.equal(current.state, null);
  assert.deepEqual(lockOwners(current.id), [ids[0], ids[2]]);

  const cancelId = buttonId(ui.tagPublicMessage(current), 'tag:cancel:');
  const cancelled = await dispatch(current, ids[3], cancelId);
  current = cancelled.record;

  assert.equal(current.status, 'cancelled');
  assert.equal(current.revision, 2);
  assert.equal(current.state, null);
  assert.deepEqual(cancelled.interaction.calls, ['deferUpdate', 'editReply']);
  assert.deepEqual(cancelled.refreshed, ['cancelled']);
  assert.deepEqual(lockOwners(current.id), []);
  for (const id of ids) assert.equal(store.currentTag(id), undefined);
  assert.deepEqual(inventorySnapshot(), beforeInventory);
  assertNoHandUids(current, ui.tagPublicMessage(current), 'cancelled public lobby');
});

test('outsiders, wrong guilds and stale duplicate cancellations are rejected without a second mutation', async () => {
  const ids = [0, 1, 2, 3].map(seat => member('m469-stale', seat));
  createPlayers(ids);
  const beforeInventory = inventorySnapshot();
  const lobby = makeLobby('m469-stale', ids);
  const staleCancelId = buttonId(ui.tagPublicMessage(lobby), 'tag:cancel:');
  const before = JSON.stringify(store.getTag(lobby.id));

  const outsider = makeInteraction(lobby, 'm469-outsider', staleCancelId);
  await assert.rejects(
    handleTagComponent(outsider, async () => assert.fail('outsider must not refresh'), () => {}),
    /Você não participa desta partida/
  );
  assert.deepEqual(outsider.calls, []);

  const wrongGuild = makeInteraction(lobby, ids[0], staleCancelId);
  wrongGuild.guildId = 'another-guild';
  await assert.rejects(
    handleTagComponent(wrongGuild, async () => assert.fail('wrong guild must not refresh'), () => {}),
    /Esta partida pertence a outro servidor/
  );
  assert.deepEqual(wrongGuild.calls, []);
  assert.equal(JSON.stringify(store.getTag(lobby.id)), before);

  const firstCancel = await dispatch(lobby, ids[0], staleCancelId);
  const cancelled = firstCancel.record;
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.revision, lobby.revision + 1);
  const afterFirstCancel = JSON.stringify(cancelled);

  const staleRetry = makeInteraction(cancelled, ids[0], staleCancelId);
  await assert.rejects(
    handleTagComponent(staleRetry, async () => assert.fail('stale retry must not refresh'), () => {}),
    /Partida atualizada ou encerrada/
  );
  assert.deepEqual(staleRetry.calls, ['deferUpdate']);
  assert.equal(JSON.stringify(store.getTag(lobby.id)), afterFirstCancel);
  assert.deepEqual(lockOwners(lobby.id), []);
  assert.deepEqual(inventorySnapshot(), beforeInventory);
});

test('an inactive physical partner can confirm team concession through Discord without losing cards or private hands', async () => {
  const ids = [0, 1, 2, 3].map(seat => member('m469-concede', seat));
  createPlayers(ids);
  const beforeInventory = inventorySnapshot();
  let record = makeLobby('m469-concede', ids);

  for (const actor of ids.slice(1)) record = await acceptThroughDiscord(record, actor);
  assert.equal(record.status, 'playing');
  assert.ok(record.state);
  tag.assertTagDuel(record.state);
  assertOwnerRules(record.state);

  const activeMember = tag.tagDecisionMember(record.state).id;
  const activeSeat = ids.indexOf(activeMember);
  assert.ok(activeSeat >= 0);
  const inactivePartner = ids[(activeSeat + 2) % 4];
  assert.notEqual(inactivePartner, activeMember);

  const beforeUids = collectUids(record.state);
  assert.ok(beforeUids.length > 0);
  assert.equal(new Set(beforeUids).size, beforeUids.length);
  const beforeLp = record.state.core.players.map(team => team.lp);

  const partnerPanel = ui.tagPrivateMessage(record, inactivePartner);
  assertNoHandUids(record, partnerPanel, 'inactive partner private panel');
  const partnerComponents = components(partnerPanel);
  assert.equal(partnerComponents.some(component => component.custom_id?.startsWith('tag:act:')), false);
  const quitId = buttonId(partnerPanel, 'tag:quit,' + inactivePartner + ':');

  const quitInteraction = makeInteraction(record, inactivePartner, quitId);
  await handleTagComponent(quitInteraction, async () => assert.fail('opening confirmation must not mutate public state'), () => {});
  assert.deepEqual(quitInteraction.calls, ['deferUpdate', 'editReply']);
  assert.equal(store.getTag(record.id).revision, record.revision);
  assert.equal(store.getTag(record.id).status, 'playing');
  const confirmId = buttonId(quitInteraction.replies[0], 'tag:confirm,' + inactivePartner + ':');

  const confirmInteraction = makeInteraction(record, inactivePartner, confirmId);
  const publicRefreshes = [];
  await handleTagComponent(confirmInteraction, async next => {
    const payload = ui.tagPublicMessage(next);
    assertNoHandUids(next, payload, 'finished public panel');
    publicRefreshes.push(payload);
  }, () => {});
  const finished = store.getTag(record.id);

  assert.deepEqual(confirmInteraction.calls, ['deferUpdate', 'editReply']);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.state.core.phase, 'finished');
  assert.equal(finished.revision, record.revision + 1);
  assert.deepEqual(collectUids(finished.state), beforeUids);
  assert.deepEqual(finished.state.core.players.map(team => team.lp), beforeLp);
  assert.equal(publicRefreshes.length, 1);
  assertNoHandUids(finished, confirmInteraction.replies[0], 'conceding partner private response');
  assert.deepEqual(lockOwners(record.id), []);
  for (const id of ids) assert.equal(store.currentTag(id), undefined);
  assert.deepEqual(inventorySnapshot(), beforeInventory);
  assertOwnerRules(finished.state);

  const afterFinish = JSON.stringify(finished.state);
  const staleConfirm = makeInteraction(finished, inactivePartner, confirmId);
  await assert.rejects(
    handleTagComponent(staleConfirm, async () => assert.fail('stale confirmation must not refresh'), () => {}),
    /Partida atualizada ou encerrada/
  );
  assert.deepEqual(staleConfirm.calls, ['deferUpdate']);
  assert.equal(JSON.stringify(store.getTag(record.id).state), afterFinish);
});

after(() => {
  database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
