'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm473-tag-natural-win-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const ui = require('../dist/tagUI');
const { handleTagComponent } = require('../dist/tagInteraction');
const { validateDiscordPayload } = require('../dist/discordPayload');
const { rulesFor } = require('../dist/rulesProfile');

let interactionSequence = 0;
function createPlayers(ids) {
  for (const id of ids) database.createPlayer(id, id);
}
function inventorySnapshot() {
  return {
    players: database.db.prepare(
      'SELECT discord_id, dp, xp, starter_deck FROM players ORDER BY discord_id'
    ).all(),
    cards: database.db.prepare(
      'SELECT discord_id, card_key, quantity FROM player_cards ORDER BY discord_id, card_key'
    ).all(),
    grants: database.db.prepare(
      'SELECT discord_id, starter_deck, catalog_version FROM starter_grants ORDER BY discord_id'
    ).all()
  };
}
function lockOwners(sessionId) {
  return database.db.prepare(
    'SELECT owner FROM tag_members WHERE session_id=? ORDER BY owner'
  ).all(sessionId).map(row => row.owner);
}
function actionIndex(record, actor, predicate) {
  const actions = tag.tagActions(record.state, actor);
  const index = actions.findIndex(predicate);
  assert.notEqual(index, -1, 'expected legal action was not offered');
  return index;
}
async function actThroughDiscord(record, actor, predicate) {
  const index = actionIndex(record, actor, predicate);
  const calls = [];
  const replies = [];
  const refreshes = [];
  const interaction = {
    id: 'm473-' + (++interactionSequence),
    guildId: record.guild,
    user: { id: actor },
    customId: 'tag:act:' + record.id + ':' + record.revision + ':' + actor,
    values: [String(index)],
    deferUpdate: async () => { calls.push('deferUpdate'); },
    editReply: async payload => {
      calls.push('editReply');
      validateDiscordPayload(payload);
      replies.push(payload);
    }
  };
  await handleTagComponent(interaction, async next => {
    const publicPayload = ui.tagPublicMessage(next);
    validateDiscordPayload(publicPayload);
    refreshes.push({ status: next.status, revision: next.revision, payload: publicPayload });
  }, () => {});
  assert.deepEqual(calls, ['deferUpdate', 'editReply']);
  assert.equal(replies.length, 1);
  assert.equal(refreshes.length, 1);
  return store.getTag(record.id);
}

test('a normal direct-attack victory finishes through the Discord handler and releases all four seat locks', async () => {
  const ids = ['m473-a', 'm473-b', 'm473-c', 'm473-d'];
  createPlayers(ids);
  const beforeEconomy = inventorySnapshot();

  let record = store.createTagLobby(ids, 'm473-guild', 'm473-channel', 'classic-loan');
  for (const actor of ids.slice(1)) {
    record = store.acceptTag(record.id, actor, record.guild, record.revision);
  }
  assert.equal(record.status, 'playing');
  assert.ok(record.state);
  tag.assertTagDuel(record.state);
  assert.deepEqual(lockOwners(record.id), [...ids].sort());

  const ownerRules = rulesFor(record.state.core);
  assert.deepEqual([
    ownerRules.mainDeckMin,
    ownerRules.mainDeckMax,
    ownerRules.handLimit,
    ownerRules.handCheck,
    ownerRules.monsterZones,
    ownerRules.spellTrapZones,
    ownerRules.extraDeckMax
  ], [20, 30, 6, 'end', 3, 3, 5]);

  const actor = tag.tagDecisionMember(record.state).id;
  const team = record.state.members.find(member => member.id === actor).team;
  const opponent = 1 - team;
  const beforeUids = tag.tagInventory(record.state).map(card => card.uid).sort();

  // Deterministic fixture: a legal direct attack by a borrowed normal monster
  // must end the opposing team at zero without changing physical card identity.
  record.state.core.players[opponent].lp = 100;
  database.db.prepare('UPDATE tag_sessions SET state=? WHERE id=?')
    .run(JSON.stringify(record.state), record.id);
  record = store.getTag(record.id);

  record = await actThroughDiscord(record, actor, action => action.kind === 'summon' && action.position === 'atk');
  assert.equal(record.status, 'playing');
  assert.equal(record.state.core.turn, 1);
  assert.equal(tag.tagActions(record.state, actor).some(action => action.kind === 'battle'), false,
    'the first player cannot enter Battle Phase on turn one');
  record = await actThroughDiscord(record, actor, action => action.kind === 'end');
  const opponentActor = tag.tagDecisionMember(record.state).id;
  record = await actThroughDiscord(record, opponentActor, action => action.kind === 'end');
  const battleActor = tag.tagDecisionMember(record.state).id;
  assert.equal(record.state.core.turn, 3);
  assert.equal(record.state.members.find(member => member.id === battleActor).team, team);
  assert.ok(tag.tagActions(record.state, battleActor).some(action => action.kind === 'battle'),
    'Battle Phase becomes available to the next physical teammate after the first opposing turn');
  record = await actThroughDiscord(record, battleActor, action => action.kind === 'battle');
  assert.equal(record.status, 'playing');
  record = await actThroughDiscord(record, battleActor, action => action.kind === 'attack');

  assert.equal(record.status, 'finished');
  assert.equal(record.state.core.phase, 'finished');
  assert.equal(record.state.core.winner, 'tag-team-' + team);
  assert.equal(record.state.core.players[opponent].lp, 0);
  assert.deepEqual(lockOwners(record.id), [], 'normal victory must release the host and all three accepted seat locks');
  for (const id of ids) assert.equal(store.currentTag(id), undefined);

  const terminalEvents = store.tagEventsAt(record.id, record.revision);
  assert.ok(terminalEvents.some(event => event.type === 'duelFinished' && event.winner === 'tag-team-' + team),
    'the terminal transition must be persisted for public delivery');
  assert.deepEqual(tag.tagInventory(record.state).map(card => card.uid).sort(), beforeUids,
    'the normal win moves cards but must not create or lose physical UIDs');

  const publicPayload = ui.tagPublicMessage(record);
  validateDiscordPayload(publicPayload);
  assert.deepEqual(publicPayload.components, [], 'a finished duel must not expose active play controls');
  assert.deepEqual(inventorySnapshot(), beforeEconomy, 'borrowed TagDuel must not alter collection or starter grants');
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
