'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm468-tag-command-order-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const { buildTagInvite } = require('../dist/tagCommand');
const db = database.db;

test('Discord /dupla convidar maps host and partner to Azul and both opponents to Vermelha', () => {
  const invite = buildTagInvite({
    hostId: 'm468-host',
    partnerId: 'm468-partner',
    opponent1Id: 'm468-opponent-1',
    opponent2Id: 'm468-opponent-2',
    rules: 'classic-owned'
  });
  assert.deepEqual(invite.members, [
    'm468-host',
    'm468-opponent-1',
    'm468-partner',
    'm468-opponent-2'
  ]);
  assert.deepEqual(invite.members.map((_, index) => index % 2), [0, 1, 0, 1]);
  assert.equal(invite.rules, 'classic-owned');
});

test('Discord /dupla convidar defaults to classic-loan and preserves each explicit supported mode', () => {
  const input = {
    hostId: 'host',
    partnerId: 'partner',
    opponent1Id: 'opponent-1',
    opponent2Id: 'opponent-2'
  };
  assert.equal(buildTagInvite(input).rules, 'classic-loan');
  assert.equal(buildTagInvite({ ...input, rules: 'classic-loan' }).rules, 'classic-loan');
  assert.equal(buildTagInvite({ ...input, rules: 'classic-owned' }).rules, 'classic-owned');
  assert.equal(buildTagInvite({ ...input, rules: 'normal' }).rules, 'normal');
});

test('duplicate, blank and unsupported invite fields fail before any lobby or seat lock is created', () => {
  const valid = {
    hostId: 'host',
    partnerId: 'partner',
    opponent1Id: 'opponent-1',
    opponent2Id: 'opponent-2'
  };
  assert.throws(() => buildTagInvite({ ...valid, partnerId: 'host' }), /quatro jogadores diferentes/);
  assert.throws(() => buildTagInvite({ ...valid, opponent2Id: ' ' }), /quatro jogadores diferentes/);
  assert.throws(() => buildTagInvite({ ...valid, rules: 'unknown-mode' }), /Modo de cartas 2v2 inválido/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_sessions').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members').get().n, 0);
});

test('the command seat order is the same order persisted by tagStore and creates no inventory', () => {
  const ids = ['m468-host-live', 'm468-partner-live', 'm468-opponent-1-live', 'm468-opponent-2-live'];
  for (const id of ids) database.createPlayer(id, id);
  const before = {
    cards: db.prepare('SELECT COUNT(*) AS n FROM player_cards').get().n,
    grants: db.prepare('SELECT COUNT(*) AS n FROM starter_grants').get().n,
    decks: db.prepare('SELECT COUNT(*) AS n FROM decks').get().n
  };
  const invite = buildTagInvite({
    hostId: ids[0],
    partnerId: ids[1],
    opponent1Id: ids[2],
    opponent2Id: ids[3],
    rules: 'normal'
  });
  const record = store.createTagLobby(invite.members, 'm468-guild', 'm468-channel', invite.rules);
  assert.deepEqual(record.members.map(member => member.id), invite.members);
  assert.deepEqual(record.members.map(member => member.team), [0, 1, 0, 1]);
  assert.equal(record.members[0].team, record.members[2].team);
  assert.equal(record.members[1].team, record.members[3].team);
  assert.notEqual(record.members[0].team, record.members[1].team);
  assert.deepEqual({
    cards: db.prepare('SELECT COUNT(*) AS n FROM player_cards').get().n,
    grants: db.prepare('SELECT COUNT(*) AS n FROM starter_grants').get().n,
    decks: db.prepare('SELECT COUNT(*) AS n FROM decks').get().n
  }, before);
});

after(() => {
  if (db.open) db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
