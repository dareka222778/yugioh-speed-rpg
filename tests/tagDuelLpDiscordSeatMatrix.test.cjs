'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm459-lp-discord-seat-matrix-'));
process.env.DATABASE_PATH = path.join(dir, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const ui = require('../dist/tagUI');
const { handleTagComponent } = require('../dist/tagInteraction');
const { validateDiscordPayload } = require('../dist/discordPayload');
const { rulesFor } = require('../dist/rulesProfile');

const member = seat => 'm459-seat-' + seat;

function makeGame(first) {
  const deck = tag.tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M459 Seat ' + seat,
    cards: [...deck]
  }));
  const game = tag.createTagDuel(players, {
    classic: true,
    first,
    seed: 'm459-lp-discord-seat-matrix-' + first
  });
  game.core.players[0].lp = 4500;
  game.core.players[1].lp = 3500;
  tag.assertTagDuel(game);
  return game;
}

function register(state, id) {
  const members = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M459 Seat ' + seat,
    accepted: true
  }));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(
    id, 'm459-guild', 'm459-channel', 'm459-message', 7, Date.now(),
    'playing', JSON.stringify(members), JSON.stringify(state), 'classic-loan'
  );
  return store.getTag(id);
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

function assertNoHandUids(record, payload, label) {
  validateDiscordPayload(payload);
  const rendered = JSON.stringify(payload);
  for (const seat of [0, 1, 2, 3]) {
    for (const card of tag.tagMemberHand(record.state, member(seat))) {
      assert.equal(rendered.includes(card.uid), false, label + ' leaked hand UID from seat ' + seat);
    }
  }
  return payload;
}

function makeInteraction(record, actor, index, requestId) {
  const calls = [];
  let editedPayload;
  return {
    id: requestId,
    guildId: record.guild,
    user: { id: actor },
    customId: 'tag:act:' + record.id + ':' + record.revision + ':' + actor,
    values: [String(index)],
    isButton: () => false,
    isStringSelectMenu: () => true,
    deferUpdate: async () => {
      if (store.getTag(record.id).revision !== record.revision) {
        throw new Error('stale revision before Discord acknowledgement');
      }
      calls.push('defer');
    },
    editReply: async payload => {
      calls.push('edit');
      editedPayload = payload;
      validateDiscordPayload(payload);
    },
    calls,
    get editedPayload() { return editedPayload; }
  };
}

async function submit(record, actor, index, requestId) {
  const panel = ui.tagPrivateMessage(record, actor, Math.floor(index / 20));
  validateDiscordPayload(panel);
  const components = panel.components.map(row => row.toJSON()).flatMap(row => row.components || []);
  const menu = components.find(component =>
    component.custom_id === 'tag:act:' + record.id + ':' + record.revision + ':' + actor
  );
  assert.ok(menu, 'active representative must receive a private action menu');
  assert.ok(menu.options.some(option => option.value === String(index)));

  const interaction = makeInteraction(record, actor, index, requestId);
  let refreshes = 0;
  await handleTagComponent(interaction, async next => {
    refreshes++;
    assertNoHandUids(next, ui.tagPublicMessage(next), 'public refresh');
  }, () => {});
  assert.deepEqual(interaction.calls, ['defer', 'edit']);
  assert.equal(refreshes, 1);
  assertNoHandUids(store.getTag(record.id), interaction.editedPayload, 'interaction reply');
  return store.getTag(record.id);
}

test('all four initial-seat rotations render shared LP and keep action menus private to the active representative', async t => {
  for (const first of [0, 1, 2, 3]) {
    await t.test('first=' + first, async () => {
      const game = makeGame(first);
      const record = register(game, 'm459-lp-discord-' + first);
      const actor = tag.tagDecisionMember(record.state).id;
      const actorSeat = Number(actor.split('-').at(-1));
      const partner = member((actorSeat + 2) % 4);

      const publicBefore = assertNoHandUids(record, ui.tagPublicMessage(record), 'public panel');
      const publicJson = publicBefore.embeds[0].toJSON();
      assert.ok(publicJson.fields.some(field => /4500 PV/.test(field.name)));
      assert.ok(publicJson.fields.some(field => /3500 PV/.test(field.name)));

      const activePanel = assertNoHandUids(record, ui.tagPrivateMessage(record, actor), 'active private panel');
      const partnerPanel = assertNoHandUids(record, ui.tagPrivateMessage(record, partner), 'partner private panel');
      const activeComponents = activePanel.components.map(row => row.toJSON()).flatMap(row => row.components || []);
      const partnerComponents = partnerPanel.components.map(row => row.toJSON()).flatMap(row => row.components || []);
      assert.ok(activeComponents.some(component => component.custom_id === 'tag:act:' + record.id + ':' + record.revision + ':' + actor));
      assert.ok(!partnerComponents.some(component => component.custom_id?.startsWith('tag:act:')));

      assertOwnerRules(record.state);
      const actions = tag.tagActions(record.state, actor);
      const endIndex = actions.findIndex(action => action.kind === 'end');
      assert.ok(endIndex >= 0, 'active representative must have a legal End Phase action');

      const next = await submit(record, actor, endIndex, 'm459-end-' + first);
      assert.equal(next.revision, record.revision + 1);
      assert.deepEqual(next.state.core.players.map(player => player.lp), [4500, 3500]);
      assert.equal(tag.tagDecisionMember(next.state).id, member((actorSeat + 1) % 4));
      assertNoHandUids(next, ui.tagPublicMessage(next), 'post-End Phase public panel');
      const nextActor = tag.tagDecisionMember(next.state).id;
      assertNoHandUids(next, ui.tagPrivateMessage(next, nextActor), 'next representative private panel');
      assertOwnerRules(next.state);
    });
  }
});

after(() => {
  database.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
