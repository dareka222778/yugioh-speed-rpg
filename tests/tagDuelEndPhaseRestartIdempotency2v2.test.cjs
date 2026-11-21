'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm461-tag-end-phase-restart-'));
process.env.DATABASE_PATH = path.join(dir, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const { rulesFor } = require('../dist/rulesProfile');

const member = seat => 'm461-seat-' + seat;

function makeGame(first) {
  const deck = tag.tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M461 Seat ' + seat,
    cards: [...deck]
  }));
  const game = tag.createTagDuel(players, {
    classic: true,
    first,
    seed: 'm461-tag-end-phase-restart-' + first
  });
  const incomingSeat = (first + 1) % 4;
  const outgoingTeam = first % 2;
  const physical = game.core.players[outgoingTeam];
  while (physical.hand.length < 7) {
    const card = physical.deck.pop();
    assert.ok(card);
    physical.hand.push(card);
  }
  tag.assertTagDuel(game);
  return { game, incomingSeat, outgoingTeam, incomingTeam: incomingSeat % 2 };
}

function register(state, id) {
  const members = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M461 Seat ' + seat,
    accepted: true
  }));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(
    id, 'm461-guild', 'm461-channel', 'm461-message', 3, Date.now(),
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
  for (const team of state.core.players) {
    assert.ok(team.monsters.length <= 3);
    assert.ok(team.backrow.length <= 3);
    assert.ok(Object.hasOwn(team, 'field'));
  }
}

const childScript = String.raw`
const database = require('./dist/database');
const store = require('./dist/tagStore');
const tag = require('./dist/tagDuel');
const [id, actor, partner, incoming, guild, incomingTeamRaw, nextDrawUid, partnerHandJson, inventoryJson] = process.argv.slice(1);
const partnerHandBefore = JSON.parse(partnerHandJson);
const inventoryBefore = new Map(JSON.parse(inventoryJson));
const record = store.getTag(id);
if (record.state.core.phase !== 'discard') throw new Error('End Phase discard was not restored');
if (tag.tagDecisionMember(record.state).id !== actor) throw new Error('Wrong physical seat owns the restored discard decision');
const actions = tag.tagActions(record.state, actor);
const discardIndex = actions.findIndex(action => action.kind === 'discard');
if (discardIndex < 0) throw new Error('Restored session has no legal discard action');
const discardUid = actions[discardIndex].card;
const outgoingTeam = record.state.members.find(member => member.id === actor).team;
const incomingTeam = Number(incomingTeamRaw);
const deckBefore = record.state.core.players[incomingTeam].deck.length;
const revisionBefore = record.revision;
const requestId = 'm461-restart-discard:' + id;
const committed = store.actTag(id, actor, guild, revisionBefore, discardIndex, requestId);
const after = store.getTag(id);
const retry = store.actTag(id, actor, guild, revisionBefore, discardIndex, requestId);
const final = store.getTag(id);
const inventoryAfter = tag.tagInventory(final.state);
const inventoryPreserved = inventoryAfter.length === inventoryBefore.size &&
  inventoryAfter.every(card => inventoryBefore.get(card.uid) === card.id);
const partnerHandAfter = tag.tagMemberHand(final.state, partner).map(card => card.uid);
const output = {
  revisionBefore,
  committedRevision: committed.revision,
  afterRevision: after.revision,
  retryRevision: retry.revision,
  finalRevision: final.revision,
  retryIdempotent: final.revision === after.revision && JSON.stringify(final.state) === JSON.stringify(after.state),
  phase: final.state.core.phase,
  turn: final.state.core.turn,
  handCount: tag.tagMemberHand(final.state, actor).length,
  incomingHandCount: tag.tagMemberHand(final.state, incoming).length,
  incomingDecision: tag.tagDecisionMember(final.state).id,
  deckCount: final.state.core.players[incomingTeam].deck.length,
  deckBefore,
  nextDrawPresent: tag.tagMemberHand(final.state, incoming).some(card => card.uid === nextDrawUid),
  discardInGrave: final.state.core.players[outgoingTeam].grave.some(card => card.uid === discardUid),
  partnerHandUnchanged: JSON.stringify(partnerHandAfter) === JSON.stringify(partnerHandBefore),
  inventoryPreserved
};
console.log(JSON.stringify(output));
database.db.close();
`;

test('a persisted End Phase discard resumes in a fresh process and duplicate interaction is idempotent', async t => {
  for (const first of [0, 1, 2, 3]) {
    await t.test('first=' + first, () => {
      const { game, incomingSeat, outgoingTeam, incomingTeam } = makeGame(first);
      const outgoing = member(first);
      const incoming = member(incomingSeat);
      const partner = member((first + 2) % 4);
      const id = 'm461-restart-' + first;
      const record = register(game, id);
      assertOwnerRules(record.state);

      const outgoingHand = tag.tagMemberHand(record.state, outgoing);
      assert.equal(outgoingHand.length, 7);
      const partnerHandBefore = tag.tagMemberHand(record.state, partner).map(card => card.uid);
      const nextDrawUid = record.state.core.players[incomingTeam].deck[0].uid;
      const incomingDeckBefore = record.state.core.players[incomingTeam].deck.length;
      const inventoryBefore = tag.tagInventory(record.state).map(card => [card.uid, card.id]);
      const endIndex = tag.tagActions(record.state, outgoing).findIndex(action => action.kind === 'end');
      assert.ok(endIndex >= 0);

      const afterEnd = store.actTag(id, outgoing, record.guild, record.revision, endIndex, 'm461-end:' + first);
      assert.equal(afterEnd.revision, record.revision + 1);
      assert.equal(afterEnd.state.core.phase, 'discard');
      assert.equal(tag.tagDecisionMember(afterEnd.state).id, outgoing);
      assert.equal(tag.tagMemberHand(afterEnd.state, outgoing).length, 7);
      assert.equal(afterEnd.state.core.players[incomingTeam].deck.length, incomingDeckBefore);
      assert.equal(afterEnd.state.core.players[incomingTeam].deck[0].uid, nextDrawUid);
      assertOwnerRules(afterEnd.state);

      const stdout = execFileSync(process.execPath, [
        '-e',
        childScript,
        id,
        outgoing,
        partner,
        incoming,
        record.guild,
        String(incomingTeam),
        nextDrawUid,
        JSON.stringify(partnerHandBefore),
        JSON.stringify(inventoryBefore)
      ], {
        encoding: 'utf8',
        env: { ...process.env, DATABASE_PATH: process.env.DATABASE_PATH }
      });
      const result = JSON.parse(stdout.trim().split('\n').at(-1));
      assert.equal(result.revisionBefore, afterEnd.revision);
      assert.equal(result.committedRevision, afterEnd.revision + 1);
      assert.equal(result.afterRevision, afterEnd.revision + 1);
      assert.equal(result.retryRevision, afterEnd.revision + 1);
      assert.equal(result.finalRevision, afterEnd.revision + 1);
      assert.equal(result.retryIdempotent, true);
      assert.equal(result.phase, 'main');
      assert.equal(result.turn, record.state.core.turn + 1);
      assert.equal(result.handCount, 6);
      assert.ok(result.incomingHandCount > 0);
      assert.equal(result.incomingDecision, incoming);
      assert.equal(result.deckCount, result.deckBefore - 1);
      assert.equal(result.nextDrawPresent, true);
      assert.equal(result.discardInGrave, true);
      assert.equal(result.partnerHandUnchanged, true);
      assert.equal(result.inventoryPreserved, true);
    });
  }
});

after(() => {
  if (database.db.open) database.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
