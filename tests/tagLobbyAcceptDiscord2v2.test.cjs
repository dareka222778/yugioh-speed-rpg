'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm464-tag-lobby-no-inventory-'));
process.env.DATABASE_PATH = path.join(dir, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const ui = require('../dist/tagUI');
const { handleTagComponent } = require('../dist/tagInteraction');
const { validateDiscordPayload } = require('../dist/discordPayload');
const { rulesFor } = require('../dist/rulesProfile');

function buttons(payload) {
  return payload.components.map(row => row.toJSON()).flatMap(row => row.components || []);
}

function assertNoHandUids(record, payload, label) {
  validateDiscordPayload(payload);
  const rendered = JSON.stringify(payload);
  for (const member of record.members) {
    if (!record.state) continue;
    for (const card of tag.tagMemberHand(record.state, member.id)) {
      assert.equal(rendered.includes(card.uid), false, label + ' leaked UID from ' + member.id);
    }
  }
}

function makeInteraction(record, actor, customId) {
  const calls = [];
  const deferKinds = [];
  let payload;
  return {
    id: 'm464-' + actor + '-' + record.revision,
    guildId: record.guild,
    user: { id: actor },
    customId,
    deferUpdate: async () => { calls.push('deferUpdate'); },
    deferReply: async options => {
      calls.push('deferReply');
      assert.ok(options.flags, 'private hand must be ephemeral');
    },
    editReply: async value => {
      calls.push('editReply');
      payload = value;
      validateDiscordPayload(value);
    },
    calls,
    deferKinds,
    setDeferKind(kind) { deferKinds.push(kind); },
    get payload() { return payload; }
  };
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
    assert.ok(Object.hasOwn(team, 'field'));
  }
}

test('four-human TagDuel lobby accepts through Discord and starts without granting collection cards', async () => {
  const ids = [0, 1, 2, 3].map(i => 'm464-user-' + i);
  for (const id of ids) database.createPlayer(id, 'M464 User ' + id);
  const beforeCollections = new Map(ids.map(id => [id, database.getCollection(id)]));
  assert.ok([...beforeCollections.values()].every(cards => cards.length === 0));
  assert.throws(
    () => store.createTagLobby([ids[0], ids[1], ids[1], ids[3]], 'm464-guild', 'm464-channel', 'classic-loan'),
    /quatro humanos diferentes/
  );
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_sessions').get().n, 0);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_members').get().n, 0);

  let record = store.createTagLobby(ids, 'm464-guild', 'm464-channel', 'classic-loan');
  assert.equal(record.status, 'lobby');
  assert.equal(record.state, null);
  assert.equal(record.members.filter(member => member.accepted).length, 1);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_members').get().n, 1);

  for (const actor of ids.slice(1)) {
    const panel = ui.tagPublicMessage(record);
    const accept = buttons(panel).find(component => component.label === 'Aceitar participação');
    assert.ok(accept);
    assert.equal(accept.custom_id, 'tag:accept:' + record.id + ':' + record.revision);
    const interaction = makeInteraction(record, actor, accept.custom_id);
    await handleTagComponent(interaction, async next => {
      assert.equal(next.revision, record.revision + 1);
      validateDiscordPayload(ui.tagPublicMessage(next));
    }, kind => interaction.setDeferKind(kind));
    assert.deepEqual(interaction.calls, ['deferUpdate', 'editReply']);
    assert.deepEqual(interaction.deferKinds, ['update']);
    assertNoHandUids(store.getTag(record.id), interaction.payload, 'lobby public update');
    record = store.getTag(record.id);
    assert.equal(record.revision, ids.indexOf(actor));
  }

  record = store.getTag(record.id);
  assert.equal(record.status, 'playing');
  assert.ok(record.state);
  assert.equal(record.members.every(member => member.accepted), true);
  assert.equal(record.members.length, 4);
  tag.assertTagDuel(record.state);
  assertOwnerRules(record.state);
  assert.equal(tag.tagDecisionMember(record.state).id.length > 0, true);
  assert.equal(new Set(tag.tagInventory(record.state).map(card => card.uid)).size, tag.tagInventory(record.state).length);
  assert.equal(record.members.filter(member => member.team === 0).length, 2);
  assert.equal(record.members.filter(member => member.team === 1).length, 2);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE tag_id=?').get(record.id).n, 4);

  const publicPanel = ui.tagPublicMessage(record);
  assertNoHandUids(record, publicPanel, 'playing public board');
  assert.ok(JSON.stringify(publicPanel).includes('Sem custos ou recompensas'));

  const active = tag.tagDecisionMember(record.state).id;
  for (const member of record.members) {
    const interaction = makeInteraction(record, member.id, 'tag:open:' + record.id + ':' + record.revision);
    await handleTagComponent(interaction, async () => {
      throw new Error('opening a private hand must not refresh the public board');
    }, kind => interaction.setDeferKind(kind));
    assert.deepEqual(interaction.calls, ['deferReply', 'editReply']);
    assert.deepEqual(interaction.deferKinds, ['reply']);
    assertNoHandUids(record, interaction.payload, 'ephemeral hand');
    const hasActionMenu = buttons(interaction.payload).some(component =>
      component.custom_id === 'tag:act:' + record.id + ':' + record.revision + ':' + member.id
    );
    assert.equal(hasActionMenu, member.id === active, 'only the current representative may receive an action menu');
  }

  for (const id of ids) assert.deepEqual(database.getCollection(id), beforeCollections.get(id));
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM player_cards').get().n, 0);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM starter_grants').get().n, 0);
});

test('nonparticipant and wrong-guild lobby actions are rejected before acknowledgement or lock changes', async () => {
  const ids = [0, 1, 2, 3].map(i => 'm464-negative-' + i);
  for (const id of ids) database.createPlayer(id, 'M464 Negative ' + id);
  const outsider = 'm464-outsider';
  database.createPlayer(outsider, 'M464 Outsider');
  const record = store.createTagLobby(ids, 'm464-guild-negative', 'm464-channel', 'classic-loan');
  const beforeLocks = database.db.prepare('SELECT COUNT(*) AS n FROM tag_members').get().n;

  const forged = makeInteraction(record, outsider, 'tag:accept:' + record.id + ':' + record.revision);
  await assert.rejects(
    handleTagComponent(forged, async () => {}, () => {}),
    /Você não participa desta partida/
  );
  assert.deepEqual(forged.calls, []);

  const wrongGuild = makeInteraction(record, ids[1], 'tag:accept:' + record.id + ':' + record.revision);
  wrongGuild.guildId = 'm464-other-guild';
  await assert.rejects(
    handleTagComponent(wrongGuild, async () => {}, () => {}),
    /outro servidor/
  );
  assert.deepEqual(wrongGuild.calls, []);
  assert.equal(store.getTag(record.id).revision, record.revision);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_members').get().n, beforeLocks);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM player_cards').get().n, 0);
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
