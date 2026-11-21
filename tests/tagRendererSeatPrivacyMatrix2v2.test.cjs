'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const tag = require('../dist/tagDuel');
const { renderTag, tagImageLayout } = require('../dist/tagRenderer');

const member = seat => 'm462-seat-' + seat;

function makeGame(first) {
  const normals = tag.tagNormalCardIds.slice(0, 80);
  assert.ok(normals.length >= 80, 'renderer matrix requires 80 distinct normal card IDs');
  assert.equal(new Set(normals).size, 80, 'each physical seat needs a disjoint deterministic deck');
  const players = [0, 1, 2, 3].map(seat => ({
    id: member(seat),
    name: 'M462 Seat ' + seat,
    cards: normals.slice(seat * 20, (seat + 1) * 20)
  }));
  const state = tag.createTagDuel(players, {
    classic: true,
    first,
    seed: 'm462-renderer-seat-matrix-' + first
  });
  tag.assertTagDuel(state);
  return state;
}

function expectedFieldArt(state) {
  const ids = [];
  for (const team of state.core.players) {
    for (const monster of team.monsters) if (monster.faceUp) ids.push(monster.id);
    const last = team.grave.at(-1);
    if (last) ids.push(last.id);
  }
  return new Set(ids);
}

test('classic TagDuel renderer exposes only the selected physical seat hand for all 4x4 rotations', async () => {
  let renders = 0;
  for (const first of [0, 1, 2, 3]) {
    const state = makeGame(first);
    const layout = tagImageLayout(state);
    assert.deepEqual(layout, { width: 1400, fieldHeight: 1240, handHeight: 340 });

    const publicRequests = [];
    const publicImage = await renderTag(state, undefined, async id => {
      publicRequests.push(id);
      return undefined;
    });
    renders++;
    const publicMetadata = await sharp(publicImage).metadata();
    assert.equal(publicMetadata.width, 1400);
    assert.equal(publicMetadata.height, 1240);
    assert.deepEqual(new Set(publicRequests), expectedFieldArt(state), 'public render must not request private hand art');

    for (const viewerSeat of [0, 1, 2, 3]) {
      const viewer = member(viewerSeat);
      const ownHand = new Set(tag.tagMemberHand(state, viewer).map(card => card.id));
      const otherHands = new Set(
        [0, 1, 2, 3]
          .filter(seat => seat !== viewerSeat)
          .flatMap(seat => tag.tagMemberHand(state, member(seat)).map(card => card.id))
      );
      assert.equal(ownHand.size, 4, 'each physical seat starts with four distinct private cards');
      for (const id of ownHand) assert.equal(otherHands.has(id), false, 'fixture decks must not overlap');

      const requests = [];
      const image = await renderTag(state, viewer, async id => {
        requests.push(id);
        return undefined;
      });
      renders++;
      const metadata = await sharp(image).metadata();
      assert.equal(metadata.width, 1400);
      assert.equal(metadata.height, 1580);
      const expected = new Set([...expectedFieldArt(state), ...ownHand]);
      assert.deepEqual(new Set(requests), expected, 'private renderer may request only face-up field/grave art and this seat hand');
      for (const id of otherHands) assert.equal(requests.includes(id), false, 'private renderer leaked another physical seat hand');
    }
  }
  assert.equal(renders, 20);
});
