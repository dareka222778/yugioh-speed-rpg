'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const tag = require('../dist/tagDuel');
const { enabledCardIds, engineCard } = require('../dist/effectRegistry');
const { renderTag, tagImageLayout } = require('../dist/tagRenderer');

const member = seat => 'm463-seat-' + seat;
const fieldId = '86318356'; // Sogen
const trapIds = enabledCardIds.filter(id => engineCard(id)?.kind === 'trap').slice(0, 3);

function makeGame(first) {
  const normals = tag.tagNormalCardIds.slice(0, 80);
  assert.equal(new Set(normals).size, 80);
  assert.equal(engineCard(fieldId)?.field, true, 'Sogen must be a certified Field Spell');
  assert.equal(trapIds.length, 3);
  assert.ok(trapIds.every(id => engineCard(id)?.kind === 'trap'));
  const active = first % 2 === 0 ? [first, (first + 1) % 4] : [(first + 1) % 4, first];
  const players = [0, 1, 2, 3].map(seat => {
    const normalDeck = normals.slice(seat * 20, (seat + 1) * 20);
    const cards = active.includes(seat)
      ? [fieldId, ...trapIds, ...normalDeck.slice(0, 16)]
      : normalDeck;
    return { id: member(seat), name: 'M463 Seat ' + seat, cards };
  });
  const state = tag.createTagDuel(players, {
    classic: true,
    first,
    seed: 'm463-field-zone-separate-' + first
  });

  for (let team = 0; team < 2; team++) {
    const physical = state.core.players[team];
    const take = id => {
      let index = physical.hand.findIndex(card => card.id === id);
      if (index >= 0) return physical.hand.splice(index, 1)[0];
      index = physical.deck.findIndex(card => card.id === id);
      assert.ok(index >= 0, 'required card must remain in this team's physical Deck or hand: ' + id);
      return physical.deck.splice(index, 1)[0];
    };
    const field = take(fieldId);
    field.faceUp = true;
    physical.field = field;
    physical.backrow = trapIds.map(id => {
      const card = take(id);
      card.faceUp = false;
      return card;
    });
    assert.equal(physical.backrow.length, 3);
    assert.equal(physical.field.id, fieldId);
    assert.ok(!physical.backrow.some(card => card.uid === field.uid), 'Field Zone UID must not occupy a Spell/Trap slot');
    assert.ok(physical.monsters.length <= 3);
  }
  tag.assertTagDuel(state);
  return state;
}

function expectedPublicArt(state) {
  const ids = [];
  for (const team of state.core.players) {
    if (team.field?.faceUp) ids.push(team.field.id);
    for (const monster of team.monsters) if (monster.faceUp) ids.push(monster.id);
    const last = team.grave.at(-1);
    if (last) ids.push(last.id);
  }
  return new Set(ids);
}

test('classic 2v2 keeps a separate Field Zone alongside all three hidden backrow slots for every rotation', async () => {
  let renders = 0;
  for (const first of [0, 1, 2, 3]) {
    const state = makeGame(first);
    const layout = tagImageLayout(state);
    assert.deepEqual(layout, { width: 1400, fieldHeight: 1240, handHeight: 340 });
    const publicState = tag.publicTagDuel(state);
    for (const team of [0, 1]) {
      assert.equal(state.core.players[team].backrow.length, 3);
      assert.equal(state.core.players[team].field.id, fieldId);
      assert.equal(publicState.teams[team].field.id, fieldId);
      assert.equal(publicState.teams[team].backrow.length, 3);
      assert.ok(publicState.teams[team].backrow.every(card => card.faceUp === false && card.id === null));
    }

    const publicRequests = [];
    const publicImage = await renderTag(state, undefined, async id => {
      publicRequests.push(id);
      return undefined;
    });
    renders++;
    const publicMetadata = await sharp(publicImage).metadata();
    assert.equal(publicMetadata.width, 1400);
    assert.equal(publicMetadata.height, 1240);
    assert.deepEqual(new Set(publicRequests), expectedPublicArt(state), 'public render may fetch Field Spell art but not set Trap identities');
    for (const id of trapIds) assert.equal(publicRequests.includes(id), false, 'public render leaked a face-down Trap identity');

    for (const viewerSeat of [0, 1, 2, 3]) {
      const viewer = member(viewerSeat);
      const ownHand = new Set(tag.tagMemberHand(state, viewer).map(card => card.id));
      const otherHands = new Set(
        [0, 1, 2, 3]
          .filter(seat => seat !== viewerSeat)
          .flatMap(seat => tag.tagMemberHand(state, member(seat)).map(card => card.id))
      );
      for (const id of ownHand) assert.equal(otherHands.has(id), false, 'physical seat decks must remain disjoint');
      const requests = [];
      const image = await renderTag(state, viewer, async id => {
        requests.push(id);
        return undefined;
      });
      renders++;
      const metadata = await sharp(image).metadata();
      assert.equal(metadata.width, 1400);
      assert.equal(metadata.height, 1580);
      const expected = new Set([...expectedPublicArt(state), ...ownHand]);
      assert.deepEqual(new Set(requests), expected, 'private renderer may fetch Field Spell art and only this viewer hand');
      for (const id of otherHands) assert.equal(requests.includes(id), false, 'private render leaked another seat hand');
      for (const id of trapIds) assert.equal(requests.includes(id), false, 'private render leaked a face-down Trap identity');
    }
  }
  assert.equal(renders, 20);
});
