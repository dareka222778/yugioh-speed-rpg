'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm474-tag-draw-locks-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const ui = require('../dist/tagUI');
const { handleTagComponent } = require('../dist/tagInteraction');
const { getPlayableCard, getCardStatus, getEffect } = require('../dist/effectRegistry');
const { validateDiscordPayload } = require('../dist/discordPayload');
const { rulesFor } = require('../dist/rulesProfile');

const member = seat => 'm474-seat-' + seat;
const normalIds = [...new Set(tag.tagNormalCardIds)].filter(id => {
  const card = getPlayableCard(id);
  return card?.kind === 'monster' && card.monsterType === 'normal' &&
    Number.isInteger(card.atk) && Number.isInteger(card.defense);
}).slice(0, 7);
assert.equal(normalIds.length, 7);

function deck(required = []) {
  const ids = [...new Set([...required, ...normalIds])];
  return Array.from({ length: 20 }, (_, index) => ids[index % ids.length]);
}
function holder(state, seat) {
  const team = seat % 2;
  return state.active[team] === seat ? state.core.players[team] : state.reserves[seat];
}
function ensureInHand(state, seat, id) {
  const physical = holder(state, seat);
  const held = physical.hand.find(card => card.id === id);
  if (held) return held;
  const index = physical.deck.findIndex(card => card.id === id);
  assert.ok(index >= 0, 'physical seat ' + seat + ' Deck must contain ' + id);
  const [card] = physical.deck.splice(index, 1);
  physical.hand.push(card);
  return card;
}
function inventorySnapshot(state) {
  const cards = tag.tagInventory(state);
  assert.equal(cards.length, 80);
  const map = new Map(cards.map(card => [card.uid, card.id]));
  assert.equal(map.size, 80);
  return map;
}
function assertInventoryConserved(state, before) {
  const cards = tag.tagInventory(state);
  assert.equal(cards.length, before.size);
  assert.equal(new Set(cards.map(card => card.uid)).size, before.size);
  for (const card of cards) assert.equal(before.get(card.uid), card.id, 'physical identity changed: ' + card.uid);
}
function economySnapshot() {
  return {
    players: database.db.prepare('SELECT discord_id,dp,xp,starter_deck FROM players ORDER BY discord_id').all(),
    cards: database.db.prepare('SELECT discord_id,card_key,quantity FROM player_cards ORDER BY discord_id,card_key').all(),
    grants: database.db.prepare('SELECT discord_id,starter_deck,catalog_version FROM starter_grants ORDER BY discord_id').all()
  };
}
function register(state) {
  const id = 'm474-tremendous-fire-draw';
  const guild = 'm474-guild';
  const channel = 'm474-channel';
  const members = [0, 1, 2, 3].map(seat => ({ id: member(seat), name: 'M474 Seat ' + seat, accepted: true }));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id, guild, channel, 'm474-message', 7, Date.now(), 'playing', JSON.stringify(members), JSON.stringify(state), 'classic-loan');
  for (const seat of [0, 1, 2, 3]) database.db.prepare('INSERT INTO tag_members VALUES(?,?)').run(member(seat), id);
  return store.getTag(id);
}
let interactionSequence = 0;
async function submit(record, actor, predicate) {
  const actions = tag.tagActions(record.state, actor);
  const index = actions.findIndex(predicate);
  assert.notEqual(index, -1, 'expected legal action was not offered');
  const panel = ui.tagPrivateMessage(record, actor, Math.floor(index / 20));
  validateDiscordPayload(panel);
  const components = panel.components.map(row => row.toJSON()).flatMap(row => row.components || []);
  const menu = components.find(component =>
    component.custom_id === 'tag:act:' + record.id + ':' + record.revision + ':' + actor
  );
  assert.ok(menu, 'the active physical representative must receive the private action menu');
  assert.ok(menu.options.some(option => option.value === String(index)));

  const calls = [];
  const interaction = {
    id: 'm474-request-' + (++interactionSequence),
    guildId: record.guild,
    user: { id: actor },
    customId: 'tag:act:' + record.id + ':' + record.revision + ':' + actor,
    values: [String(index)],
    isButton: () => false,
    isStringSelectMenu: () => true,
    deferUpdate: async () => { calls.push('deferUpdate'); },
    editReply: async payload => { calls.push('editReply'); validateDiscordPayload(payload); }
  };
  let refreshes = 0;
  await handleTagComponent(interaction, async next => {
    refreshes++;
    validateDiscordPayload(ui.tagPublicMessage(next));
  }, () => {});
  assert.deepEqual(calls, ['deferUpdate', 'editReply']);
  assert.ok(refreshes >= 1);
  return store.getTag(record.id);
}

test('Tremendous Fire resolving at 500 shared LP each produces a draw and releases every 2v2 lock', async () => {
  const cardId = '46918794';
  const card = getPlayableCard(cardId);
  assert.ok(card);
  assert.equal(card.englishName, 'Tremendous Fire');
  assert.equal(getCardStatus(cardId)?.stage, 'certified');
  assert.equal(getEffect(cardId)?.kind, 'sequence');

  for (const seat of [0, 1, 2, 3]) database.createPlayer(member(seat), 'M474 Seat ' + seat);
  const beforeEconomy = economySnapshot();

  const players = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M474 Seat ' + seat,
    cards: deck(seat === 0 ? [cardId] : [])
  }));
  const state = tag.createTagDuel(players, {
    classic: true,
    first: 0,
    seed: 'm474-simultaneous-lp-zero'
  });
  state.core.turn = 3;
  state.core.players[0].lp = 500;
  state.core.players[1].lp = 500;
  const source = ensureInHand(state, 0, cardId);
  assert.match(source.uid, /^m0:/);
  assert.equal(tag.tagDecisionMember(state).id, member(0));
  tag.assertTagDuel(state);
  const beforeInventory = inventorySnapshot(state);
  let record = register(state);
  assert.deepEqual(database.db.prepare('SELECT owner FROM tag_members WHERE session_id=? ORDER BY owner').all(record.id)
    .map(row => row.owner), [member(0), member(1), member(2), member(3)]);

  record = await submit(record, member(0), action => action.kind === 'spell' && action.card === source.uid);
  assert.deepEqual(record.state.core.players.map(player => player.lp), [0, 0]);
  let passes = 0;
  while (record.state.core.phase === 'response') {
    assert.ok(passes < 8, 'chain response must terminate');
    const actor = tag.tagDecisionMember(record.state).id;
    record = await submit(record, actor, action => action.kind === 'pass');
    passes++;
  }

  assert.equal(record.status, 'finished');
  assert.equal(record.state.core.phase, 'finished');
  assert.equal(record.state.core.winner, null, 'simultaneous zero LP must be a draw, never a team victory');
  assert.deepEqual(record.state.core.players.map(player => player.lp), [0, 0]);
  const terminal = store.tagEventsAt(record.id, record.revision);
  assert.ok(terminal.some(event => event.type === 'duelFinished' && event.winner === null));
  assert.deepEqual(database.db.prepare('SELECT owner FROM tag_members WHERE session_id=?').all(record.id), [],
    'draw must release all four participant locks');
  for (const seat of [0, 1, 2, 3]) assert.equal(store.currentTag(member(seat)), undefined);

  assertInventoryConserved(record.state, beforeInventory);
  const publicPayload = ui.tagPublicMessage(record);
  validateDiscordPayload(publicPayload);
  assert.ok(JSON.stringify(publicPayload).includes('Empate'));
  assert.deepEqual(publicPayload.components, []);
  assert.deepEqual(economySnapshot(), beforeEconomy, 'duel resolution must not grant or remove collection cards');
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
