'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'm468-tag-command-seat-order-'));
process.env.DATABASE_PATH = path.join(folder, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const db = database.db;
const commandSource = fs.readFileSync(path.join(__dirname, '../src/index.ts'), 'utf8');

test('the real /dupla convidar handler preserves host/partner versus opponent seat order and classic-loan default', () => {
  const line = commandSource.split('\n').find(value => value.includes('createTagLobby([id,op1.id,partner.id,op2.id]'));
  assert.ok(line, 'the command must pass [host, opponent1, partner, opponent2] to tagStore');
  assert.ok(line.includes("i.options.getString?.('cartas')??'classic-loan'"),
    'the existing Discord command must retain classic-loan as its default mode');
});

test('the command seat order persisted by tagStore places host+partner together and opponents together', () => {
  const ids = ['m468-host', 'm468-partner', 'm468-opponent-1', 'm468-opponent-2'];
  for (const id of ids) database.createPlayer(id, id);
  const before = {
    cards: db.prepare('SELECT COUNT(*) AS n FROM player_cards').get().n,
    grants: db.prepare('SELECT COUNT(*) AS n FROM starter_grants').get().n,
    decks: db.prepare('SELECT COUNT(*) AS n FROM decks').get().n
  };

  // This is the exact order asserted against the /dupla command source.
  const members = [ids[0], ids[2], ids[1], ids[3]];
  let record = store.createTagLobby(members, 'm468-guild', 'm468-channel', 'normal');
  for (const id of members.slice(1)) record = store.acceptTag(record.id, id, record.guild, record.revision);

  assert.equal(record.status, 'playing');
  assert.deepEqual(record.members.map(member => member.id), members);
  assert.deepEqual(record.state.members.map(member => member.team), [0, 1, 0, 1]);
  assert.equal(record.state.members[0].team, record.state.members[2].team);
  assert.equal(record.state.members[1].team, record.state.members[3].team);
  assert.notEqual(record.state.members[0].team, record.state.members[1].team);
  assert.deepEqual({
    cards: db.prepare('SELECT COUNT(*) AS n FROM player_cards').get().n,
    grants: db.prepare('SELECT COUNT(*) AS n FROM starter_grants').get().n,
    decks: db.prepare('SELECT COUNT(*) AS n FROM decks').get().n
  }, before);
});

test('duplicate invite IDs are rejected before any lobby or seat lock is created', () => {
  assert.throws(
    () => store.createTagLobby(['same', 'opponent-1', 'same', 'opponent-2'], 'm468-guild', 'm468-channel', 'normal'),
    /quatro jogadores diferentes/
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_sessions').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members').get().n, 0);
});

after(() => {
  if (db.open) db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});
