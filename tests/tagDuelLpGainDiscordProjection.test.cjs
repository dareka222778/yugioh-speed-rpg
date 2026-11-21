'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm453-lp-discord-'));
process.env.DATABASE_PATH = path.join(dir, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const ui = require('../dist/tagUI');
const { handleTagComponent } = require('../dist/tagInteraction');
const { validateDiscordPayload } = require('../dist/discordPayload');
const { rulesFor } = require('../dist/rulesProfile');
const { getCard } = require('../dist/collection');
const { planTagDuelLpGainFirePrincessPipeline } = require('../dist/tagDuelLpGainFirePrincessPipeline');

const member = seat => 'm453-seat-' + seat;

function makeGame() {
  const deck = tag.tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M453 Seat ' + seat,
    cards: [...deck]
  }));
  return tag.createTagDuel(players, { classic: true, first: 0, seed: 'm453-lp-discord-projection' });
}

function register(state, id = 'm453-lp-discord') {
  const members = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M453 Seat ' + seat,
    accepted: true
  }));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(
    id, 'm453-guild', 'm453-channel', 'm453-message', 7, Date.now(),
    'playing', JSON.stringify(members), JSON.stringify(state), 'classic-loan'
  );
  return store.getTag(id);
}

function assertNoPublicHandUids(record) {
  const payload = ui.tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered = JSON.stringify(payload);
  for (const seat of [0, 1, 2, 3]) {
    for (const card of tag.tagMemberHand(record.state, member(seat))) {
      assert.equal(rendered.includes(card.uid), false, 'public Discord payload leaked private hand UID ' + card.uid);
    }
  }
  return payload;
}

function makeInteraction(record, actor, index, requestId, expectedRevision = record.revision) {
  const calls = [];
  return {
    id: requestId,
    guildId: record.guild,
    user: { id: actor },
    customId: 'tag:act:' + record.id + ':' + expectedRevision + ':' + actor,
    values: [String(index)],
    isButton: () => false,
    isStringSelectMenu: () => true,
    deferUpdate: async () => {
      if (store.getTag(record.id).revision !== expectedRevision) {
        throw new Error('stale revision before Discord acknowledgement');
      }
      calls.push('defer');
    },
    editReply: async payload => {
      calls.push('edit');
      validateDiscordPayload(payload);
    },
    calls
  };
}

async function submit(record, actor, index, requestId) {
  const panel = ui.tagPrivateMessage(record, actor, Math.floor(index / 20));
  validateDiscordPayload(panel);
  const components = panel.components.map(row => row.toJSON()).flatMap(row => row.components || []);
  const menu = components.find(component =>
    component.custom_id === 'tag:act:' + record.id + ':' + record.revision + ':' + actor
  );
  assert.ok(menu, 'the active representative must receive a private action menu');
  assert.ok(menu.options.some(option => option.value === String(index)));
  const interaction = makeInteraction(record, actor, index, requestId);
  let refreshes = 0;
  await handleTagComponent(interaction, async next => {
    refreshes++;
    validateDiscordPayload(ui.tagPublicMessage(next));
  }, () => {});
  assert.deepEqual(interaction.calls, ['defer', 'edit']);
  assert.equal(refreshes, 1, 'one committed interaction must refresh the public 2v2 panel');
  return store.getTag(record.id);
}

test('LP pipeline result renders safely in public/private Discord panels and survives a real 2v2 interaction', async () => {
  let game = makeGame();
  const plan = planTagDuelLpGainFirePrincessPipeline(game, {
    eventId: 'm453:source-lp-gain',
    gainingTeam: 0,
    lpGained: 500,
    teamLifePointsBefore: [4000, 4000],
    teamLifePointsAfterGain: [4500, 4000]
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.value.firePrincess.reason, 'no-eligible-fire-princess');
  assert.deepEqual(plan.value.teamLifePointsAfter, [4500, 4000]);

  // Simulate the trusted caller committing the returned shared LP tuple.
  game.core.players[0].lp = plan.value.teamLifePointsAfter[0];
  game.core.players[1].lp = plan.value.teamLifePointsAfter[1];
  const rules = rulesFor(game.core);
  assert.equal(rules.mainDeckMin, 20);
  assert.equal(rules.mainDeckMax, 30);
  assert.equal(rules.handLimit, 6);
  assert.equal(rules.handCheck, 'end');
  assert.equal(rules.monsterZones, 3);
  assert.equal(rules.spellTrapZones, 3);
  assert.equal(rules.extraDeckMax, 5);
  tag.assertTagDuel(game);

  const record = register(game);
  const publicBefore = assertNoPublicHandUids(record);
  const publicJson = publicBefore.embeds[0].toJSON();
  assert.ok(publicJson.fields.some(field => /4500 PV/.test(field.name)), 'public panel must show the committed Blue team LP');
  assert.ok(publicJson.fields.some(field => /4000 PV/.test(field.name)), 'public panel must show the Red team LP');

  const ownPanel = ui.tagPrivateMessage(record, member(0));
  const partnerPanel = ui.tagPrivateMessage(record, member(2));
  validateDiscordPayload(ownPanel);
  validateDiscordPayload(partnerPanel);
  const ownJson = JSON.stringify(ownPanel);
  const partnerJson = JSON.stringify(partnerPanel);
  for (const seat of [0, 1, 2, 3]) {
    for (const card of tag.tagMemberHand(game, member(seat))) {
      assert.equal(ownJson.includes(card.uid), false, 'private hand panel must not expose physical UIDs');
      assert.equal(partnerJson.includes(card.uid), false, 'partner panel must not expose physical UIDs');
    }
  }
  const ownMenu = ownPanel.components.map(row => row.toJSON()).flatMap(row => row.components || []);
  const partnerMenu = partnerPanel.components.map(row => row.toJSON()).flatMap(row => row.components || []);
  assert.ok(ownMenu.some(component => component.custom_id === 'tag:act:' + record.id + ':' + record.revision + ':' + member(0)));
  assert.ok(!partnerMenu.some(component => component.custom_id?.startsWith('tag:act:')),
    'inactive teammate must not receive the active representative action menu');

  const actions = tag.tagActions(record.state, member(0));
  const endIndex = actions.findIndex(action => action.kind === 'end');
  assert.ok(endIndex >= 0, 'the active representative must have a legal End Phase action');
  const next = await submit(record, member(0), endIndex, 'm453-end-turn');
  assert.equal(next.revision, record.revision + 1);
  assert.deepEqual(next.state.core.players.map(player => player.lp), [4500, 4000]);
  assert.equal(tag.tagDecisionMember(next.state).id, member(1));
  assertNoPublicHandUids(next);
  validateDiscordPayload(ui.tagPrivateMessage(next, member(1)));
});

test('stale Discord action revision cannot overwrite a newer LP session', async () => {
  const game = makeGame();
  game.core.players[0].lp = 4500;
  const record = register(game, 'm453-lp-discord-stale');
  const endIndex = tag.tagActions(record.state, member(0)).findIndex(action => action.kind === 'end');
  assert.ok(endIndex >= 0);
  const next = await submit(record, member(0), endIndex, 'm453-stale-seed');
  const before = store.getTag(record.id);
  const stale = makeInteraction(record, member(0), endIndex, 'm453-stale-retry', record.revision);
  await assert.rejects(
    handleTagComponent(stale, async () => {}, () => {}),
    /revisão|atualizada|revision|stale/i
  );
  const after = store.getTag(record.id);
  assert.equal(after.revision, before.revision);
  assert.deepEqual(after.state.core.players.map(player => player.lp), [4500, 4000]);
  assert.equal(next.revision, before.revision);
});

after(() => {
  database.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
