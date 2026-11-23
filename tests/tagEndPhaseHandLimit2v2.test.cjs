'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { starterContents } = require('../dist/cardCatalog');
const tag = require('../dist/tagDuel');
const { rulesFor } = require('../dist/rulesProfile');

const deck = starterContents.warrior.flatMap(card => Array(card.quantity).fill(card.id));
function createClassicTag() {
  return tag.createTagDuel([
    { id: 'm485-seat-0', name: 'A1', cards: deck },
    { id: 'm485-seat-1', name: 'B1', cards: deck },
    { id: 'm485-seat-2', name: 'A2', cards: deck },
    { id: 'm485-seat-3', name: 'B2', cards: deck }
  ], { classic: true, seed: 'm485-end-phase-hand-limit', first: 0 });
}
function physicalInventory(state) {
  return new Map(tag.tagInventory(state).map(card => [card.uid, card.id]));
}

test('2v2 End Phase discards to six before the next physical seat draws, including after JSON restore', () => {
  let state = createClassicTag();
  const active = tag.tagDecisionMember(state);
  assert.equal(active.id, 'm485-seat-0');
  assert.equal(rulesFor(state.core).handLimit, 6);

  // Move three real physical cards from the active seat's Deck into its hand.
  const activePlayer = state.core.players[0];
  activePlayer.hand.push(...activePlayer.deck.splice(0, 3));
  tag.assertTagDuel(state);
  const before = physicalInventory(state);
  const partner = state.members.find(member => member.team === active.team && member.id !== active.id);
  const next = state.members.find(member => member.id === 'm485-seat-1');
  const partnerHandBefore = tag.tagMemberHand(state, partner.id).map(card => card.uid);
  const nextHandBefore = tag.tagMemberHand(state, next.id).length;
  const nextTop = state.core.players[1].deck[0].uid;
  const nextDeckBefore = state.core.players[1].deck.length;

  const end = tag.tagActions(state, active.id).find(action => action.kind === 'end');
  assert.ok(end, 'active seat must be able to enter End Phase');
  state = tag.stepTagDuel(state, active.id, end);

  assert.equal(state.core.phase, 'discard');
  assert.equal(tag.tagDecisionMember(state).id, active.id, 'the outgoing seat retains the decision');
  assert.equal(tag.tagMemberHand(state, active.id).length, 7);
  assert.equal(tag.tagMemberHand(state, partner.id).length, partnerHandBefore.length);
  assert.equal(tag.tagMemberHand(state, next.id).length, nextHandBefore);
  assert.equal(state.core.players[1].deck[0].uid, nextTop, 'the next seat must not draw before discard');

  // A process restart/JSON restore during End Phase must preserve the owner and decision.
  state = JSON.parse(JSON.stringify(state));
  tag.assertTagDuel(state);
  assert.equal(tag.tagDecisionMember(state).id, active.id);
  assert.deepEqual(tag.tagMemberHand(state, partner.id).map(card => card.uid), partnerHandBefore);
  assert.deepEqual(tag.tagActions(state, partner.id), [], 'the inactive partner cannot discard for the active seat');
  const wrongOwnerAction = tag.tagActions(state, active.id).find(action => action.kind === 'discard');
  assert.ok(wrongOwnerAction);
  assert.throws(
    () => tag.stepTagDuel(state, partner.id, wrongOwnerAction),
    /Aguarde a vez do participante ativo/
  );

  const discard = tag.tagActions(state, active.id).find(action => action.kind === 'discard');
  assert.ok(discard, 'the physical owner must receive discard choices');
  state = tag.stepTagDuel(state, active.id, discard);

  assert.equal(state.core.phase, 'main');
  assert.equal(state.core.turn, 2);
  assert.equal(tag.tagDecisionMember(state).id, next.id);
  assert.equal(tag.tagMemberHand(state, active.id).length, 6, 'the outgoing hand must be capped at six');
  assert.equal(tag.tagMemberHand(state, next.id).length, nextHandBefore + 1);
  assert.equal(state.core.players[1].deck.length, nextDeckBefore - 1);
  assert.ok(tag.tagMemberHand(state, next.id).some(card => card.uid === nextTop), 'the next physical seat draws exactly once');
  assert.deepEqual(tag.tagMemberHand(state, partner.id).map(card => card.uid), partnerHandBefore);
  const after = physicalInventory(state);
  assert.equal(after.size, before.size);
  for (const [uid, id] of before) assert.equal(after.get(uid), id);
  assert.equal(new Set(tag.tagInventory(state).map(card => card.uid)).size, before.size);
});

test('a seven-card hand does not trigger a draw-time discard; the check belongs to End Phase', () => {
  const state = createClassicTag();
  const active = tag.tagDecisionMember(state);
  const player = state.core.players[0];
  player.hand.push(...player.deck.splice(0, 3));
  tag.assertTagDuel(state);
  assert.equal(tag.tagMemberHand(state, active.id).length, 7);
  assert.equal(state.core.phase, 'main');
  assert.ok(tag.tagActions(state, active.id).some(action => action.kind === 'end'));
  assert.equal(tag.tagActions(state, active.id).some(action => action.kind === 'discard'), false);
});
