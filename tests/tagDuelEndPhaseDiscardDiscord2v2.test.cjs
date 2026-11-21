'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm460-tag-end-phase-discard-'));
process.env.DATABASE_PATH = path.join(dir, 'isolated.sqlite');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID']) delete process.env[key];

const database = require('../dist/database');
const store = require('../dist/tagStore');
const tag = require('../dist/tagDuel');
const ui = require('../dist/tagUI');
const { handleTagComponent } = require('../dist/tagInteraction');
const { validateDiscordPayload } = require('../dist/discordPayload');
const { rulesFor } = require('../dist/rulesProfile');

const member = seat => 'm460-seat-' + seat;

function makeGame(first) {
  const deck = tag.tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M460 Seat ' + seat,
    cards: [...deck]
  }));
  const game = tag.createTagDuel(players, {
    classic: true,
    first,
    seed: 'm460-tag-end-phase-discard-' + first
  });
  const incomingSeat = (first + 1) % 4;
  const outgoingTeam = first % 2;
  const outgoingPhysical = game.core.players[outgoingTeam];
  while (outgoingPhysical.hand.length < 7) {
    const card = outgoingPhysical.deck.pop();
    assert.ok(card, 'outgoing physical seat must have cards to reach seven');
    outgoingPhysical.hand.push(card);
  }
  tag.assertTagDuel(game);
  return { game, incomingSeat, outgoingTeam, incomingTeam: incomingSeat % 2 };
}

function register(state, id) {
  const members = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M460 Seat ' + seat,
    accepted: true
  }));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(
    id, 'm460-guild', 'm460-channel', 'm460-message', 7, Date.now(),
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
  assert.equal(state.core.players.length, 2);
  for (const team of state.core.players) {
    assert.ok(team.monsters.length <= 3);
    assert.ok(team.backrow.length <= 3);
    assert.ok(Object.hasOwn(team, 'field'), 'Field Zone remains separate');
  }
}

function assertNoHandUids(record, payload, label) {
  validateDiscordPayload(payload);
  const rendered = JSON.stringify(payload);
  for (let seat = 0; seat < 4; seat++) {
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
    deferUpdate: async () => { calls.push('defer'); },
    editReply: async payload => {
      calls.push('edit');
      editedPayload = payload;
      validateDiscordPayload(payload);
    },
    calls,
    get editedPayload() { return editedPayload; }
  };
}

function actionMenu(record, owner) {
  const panel = assertNoHandUids(record, ui.tagPrivateMessage(record, owner), 'private panel');
  const components = panel.components.map(row => row.toJSON()).flatMap(row => row.components || []);
  return components.find(component =>
    component.custom_id === 'tag:act:' + record.id + ':' + record.revision + ':' + owner
  );
}

async function submit(record, actor, index, requestId) {
  const menu = actionMenu(record, actor);
  assert.ok(menu, 'only the active representative should receive an action menu');
  assert.ok(menu.options.some(option => option.value === String(index)), 'the selected action must exist in the private menu');

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

async function rejectForgedAction(record, actor, index, requestId) {
  const before = store.getTag(record.id);
  const snapshot = JSON.stringify(before.state);
  const interaction = makeInteraction(before, actor, index, requestId);
  let refreshes = 0;
  await assert.rejects(
    handleTagComponent(interaction, async () => { refreshes++; }, () => {}),
    /Jogada indisponível/
  );
  assert.deepEqual(interaction.calls, ['defer']);
  assert.equal(refreshes, 0);
  const after = store.getTag(record.id);
  assert.equal(after.revision, before.revision);
  assert.equal(JSON.stringify(after.state), snapshot);
}

test('TagDuel checks the incoming physical hand at End Phase and discards before its next draw in all four rotations', async t => {
  for (const first of [0, 1, 2, 3]) {
    await t.test('first=' + first, async () => {
      const { game, incomingSeat, outgoingTeam, incomingTeam } = makeGame(first);
      const outgoing = member(first);
      const incoming = member(incomingSeat);
      const inactivePartner = member((first + 2) % 4);
      const record = register(game, 'm460-end-phase-' + first);
      assertOwnerRules(record.state);

      const outgoingHandBefore = tag.tagMemberHand(record.state, outgoing).map(card => card.uid);
      const partnerHandBefore = tag.tagMemberHand(record.state, inactivePartner).map(card => card.uid);
      assert.equal(outgoingHandBefore.length, 7);
      const incomingDeckBefore = record.state.core.players[incomingTeam].deck.length;
      const nextDrawUid = record.state.core.players[incomingTeam].deck[0].uid;
      const beforeInventory = new Map(tag.tagInventory(record.state).map(card => [card.uid, card.id]));
      const outgoingActions = tag.tagActions(record.state, outgoing);
      assert.ok(outgoingActions.some(action => action.kind === 'end'));
      assert.equal(outgoingActions.some(action => action.kind === 'discard'), false, 'no discard is offered before End Phase');

      const endIndex = outgoingActions.findIndex(action => action.kind === 'end');
      const afterEnd = await submit(record, outgoing, endIndex, 'm460-end-' + first);
      assert.equal(afterEnd.revision, record.revision + 1);
      assert.equal(afterEnd.state.core.phase, 'discard');
      assert.equal(tag.tagDecisionMember(afterEnd.state).id, outgoing);
      assert.equal(tag.tagMemberHand(afterEnd.state, outgoing).length, 7);
      assert.equal(afterEnd.state.core.players[incomingTeam].deck.length, incomingDeckBefore, 'incoming draw must wait until outgoing discard is paid');
      assert.equal(afterEnd.state.core.players[incomingTeam].deck[0].uid, nextDrawUid);
      assertOwnerRules(afterEnd.state);

      const discardActions = tag.tagActions(afterEnd.state, outgoing).filter(action => action.kind === 'discard');
      assert.ok(discardActions.length > 0, 'outgoing representative must receive a discard choice');
      const discardIndex = tag.tagActions(afterEnd.state, outgoing).findIndex(action => action.kind === 'discard');
      const discardUid = tag.tagActions(afterEnd.state, outgoing)[discardIndex].card;
      const outgoingMenu = actionMenu(afterEnd, outgoing);
      assert.ok(outgoingMenu.options.some(option => option.value === String(discardIndex)));
      assert.equal(actionMenu(afterEnd, inactivePartner), undefined, 'inactive physical partner must not receive the discard menu');
      assert.equal(actionMenu(afterEnd, incoming), undefined, 'incoming opponent must not receive the discard menu');

      await rejectForgedAction(afterEnd, inactivePartner, discardIndex, 'm460-forged-partner-' + first);
      await rejectForgedAction(afterEnd, incoming, discardIndex, 'm460-forged-opponent-' + first);

      const afterDiscard = await submit(afterEnd, outgoing, discardIndex, 'm460-discard-' + first);
      assert.equal(afterDiscard.revision, afterEnd.revision + 1);
      assert.equal(afterDiscard.state.core.phase, 'main');
      assert.equal(afterDiscard.state.core.handFlow, undefined);
      assert.equal(afterDiscard.state.core.turn, record.state.core.turn + 1);
      assert.equal(tag.tagDecisionMember(afterDiscard.state).id, incoming);
      assert.equal(tag.tagMemberHand(afterDiscard.state, outgoing).length, 6, 'outgoing player must finish the turn at six cards');
      assert.equal(afterDiscard.state.core.players[incomingTeam].deck.length, incomingDeckBefore - 1);
      assert.ok(tag.tagMemberHand(afterDiscard.state, incoming).some(card => card.uid === nextDrawUid));
      assert.ok(afterDiscard.state.core.players[outgoingTeam].grave.some(card => card.uid === discardUid));
      assert.deepEqual(tag.tagMemberHand(afterDiscard.state, inactivePartner).map(card => card.uid), partnerHandBefore);
      assertOwnerRules(afterDiscard.state);

      const afterInventory = tag.tagInventory(afterDiscard.state);
      assert.equal(afterInventory.length, beforeInventory.size);
      assert.ok(afterInventory.every(card => beforeInventory.get(card.uid) === card.id), 'all physical UIDs and card identities must be conserved');
      const publicPanel = assertNoHandUids(afterDiscard, ui.tagPublicMessage(afterDiscard), 'final public panel');
      assert.ok(publicPanel.embeds.length > 0);
      const nextMenu = actionMenu(afterDiscard, incoming);
      assert.ok(nextMenu, 'incoming representative receives the next turn after the discard and draw');
    });
  }
});

after(() => {
  database.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
