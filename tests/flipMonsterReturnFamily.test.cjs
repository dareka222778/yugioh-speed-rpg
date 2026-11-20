const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  FLIP_MONSTER_RETURN_CARDS,
  teamOfSeat,
  planFlipMonsterReturn,
  resolveFlipMonsterReturn,
  projectFlipMonsterReturnForViewer,
} = require('../dist/flipMonsterReturnFamily.js');

const TURN = 7;
function monster(uid, id, owner, team, zoneIndex, position = 'face-up-attack', extra = {}) {
  return { uid, id, physicalOwnerSeat: owner, controllerTeam: team, zone: 'monster', monsterZoneIndex: zoneIndex, position, ...extra };
}
function source(overrides = {}) {
  return {
    uid: 'flip-source',
    id: FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id,
    physicalOwnerSeat: 0,
    controllerTeam: 0,
    zone: 'monster',
    monsterZoneIndex: 0,
    position: 'face-up-attack',
    wasFaceDownAtFlip: true,
    flippedTurn: TURN,
    ...overrides,
  };
}
function makePlan(cardId = FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, overrides = {}) {
  const event = source({ id: cardId, ...overrides.source });
  return planFlipMonsterReturn({ source: event, currentTurn: TURN, resolverSeat: overrides.resolverSeat ?? 0 });
}
function resolve(cardId, options = {}) {
  const p = makePlan(cardId, options);
  assert.equal(p.ok, true, p.ok ? '' : p.reason);
  return resolveFlipMonsterReturn({
    plan: p.value,
    currentTurn: options.currentTurn ?? TURN,
    fieldAtActivation: options.activation ?? [source({ id: cardId })],
    fieldAtResolution: options.resolution ?? options.activation ?? [source({ id: cardId })],
    selectedUids: options.selected ?? [],
  });
}

test('official passcodes, Konami IDs, and selection semantics are fixed', () => {
  assert.deepEqual(FLIP_MONSTER_RETURN_CARDS, {
    penguinSoldier: { id: '93920745', konamiCardDatabaseId: 4608, name: 'Penguin Soldier', selectionMode: 'targeted-at-activation', maxTargets: 2 },
    hadeHane: { id: '28357177', konamiCardDatabaseId: 6124, name: 'Hade-Hane', selectionMode: 'non-targeting-at-resolution', maxTargets: 3 },
  });
});
test('2v2 seat mapping is 0/2 versus 1/3', () => {
  assert.equal(teamOfSeat(0), 0);
  assert.equal(teamOfSeat(2), 0);
  assert.equal(teamOfSeat(1), 1);
  assert.equal(teamOfSeat(3), 1);
  assert.equal(teamOfSeat(4), undefined);
});
test('source must have been face-down and be face-up after the flip', () => {
  assert.equal(makePlan(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { source: { wasFaceDownAtFlip: false } }).reason, 'source-was-not-flipped-from-face-down');
  assert.equal(makePlan(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { source: { position: 'face-down-defense' } }).reason, 'flip-source-not-face-up-after-flip');
});
test('only a Monster Zone source can create this plan', () => {
  assert.equal(makePlan(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { source: { zone: 'field' } }).reason, 'flip-source-not-in-shared-monster-zone');
});
test('stale flip turns and invalid seats are rejected', () => {
  assert.equal(makePlan(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { source: { flippedTurn: TURN - 1 } }).reason, 'flip-trigger-from-different-turn');
  assert.equal(makePlan(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { resolverSeat: 1 }).reason, 'resolver-not-on-source-controller-team');
  assert.equal(makePlan(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { resolverSeat: 4 }).reason, 'invalid-resolver-seat');
});
test('a stolen flip source resolves for its current controller team, not its physical owner team', () => {
  const p = makePlan(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { source: { physicalOwnerSeat: 2, controllerTeam: 1 }, resolverSeat: 1 });
  assert.equal(p.ok, true);
  assert.equal(p.value.sourcePhysicalOwnerSeat, 2);
  assert.equal(p.value.controllerTeam, 1);
});
test('Penguin Soldier fixes up to two targets at activation', () => {
  const activation = [
    source(),
    monster('a', '11111111', 2, 0, 1),
    monster('b', '22222222', 3, 1, 0),
  ];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: ['a', 'b'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.returned.map(card => card.uid), ['a', 'b']);
});
test('Penguin Soldier returns each target to its physical owner hand', () => {
  const activation = [source(), monster('stolen', '33333333', 3, 0, 1)];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: ['stolen'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.returned[0].physicalOwnerSeat, 3);
  assert.equal(result.value.returned[0].fromControllerTeam, 0);
});
test('Penguin Soldier can choose zero, one, or two monsters', () => {
  const activation = [source(), monster('a', '11111111', 0, 0, 1)];
  assert.equal(resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: [] }).value.returned.length, 0);
  assert.equal(resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: ['a'] }).value.returned.length, 1);
});
test('Penguin Soldier rejects more than two targets', () => {
  const activation = [source(), monster('a', '11111111', 0, 0, 1), monster('b', '22222222', 2, 0, 2), monster('c', '33333333', 1, 1, 0)];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: ['a', 'b', 'c'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'too-many-selected-monsters');
});
test('Penguin Soldier requires each chosen target to exist at activation', () => {
  const activation = [source()];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: ['missing'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'target-not-on-field-at-activation');
});
test('a targeted monster that leaves the field before resolution is not returned', () => {
  const activation = [source(), monster('a', '11111111', 2, 0, 1)];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: [source()], selected: ['a'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.returned.length, 0);
});
test('a targeted monster may change controller and zone while retaining physical identity', () => {
  const activation = [source(), monster('a', '11111111', 2, 0, 1)];
  const resolution = [source(), monster('a', '11111111', 2, 1, 2, 'face-up-defense')];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution, selected: ['a'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.returned[0].fromControllerTeam, 1);
  assert.equal(result.value.returned[0].fromMonsterZoneIndex, 2);
});
test('a targeted UID cannot be rebound to a different physical card', () => {
  const activation = [source(), monster('a', '11111111', 2, 0, 1)];
  const resolution = [source(), monster('a', '99999999', 2, 0, 1)];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution, selected: ['a'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'target-physical-identity-changed');
});
test('the flip source itself may be one of Penguin Soldier targets', () => {
  const activation = [source()];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: ['flip-source'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.returned[0].physicalOwnerSeat, 0);
});
test('Hade-Hane chooses up to three monsters at resolution without targeting', () => {
  const activation = [source({ id: FLIP_MONSTER_RETURN_CARDS.hadeHane.id })];
  const resolution = [
    monster('a', '11111111', 0, 0, 0),
    monster('b', '22222222', 2, 0, 1),
    monster('c', '33333333', 3, 1, 0, 'face-down-defense'),
  ];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.hadeHane.id, { activation, resolution, selected: ['a', 'b', 'c'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.selectionMode, 'non-targeting-at-resolution');
  assert.equal(result.value.returned.length, 3);
});
test('Hade-Hane can select monsters that entered after its activation', () => {
  const activation = [source({ id: FLIP_MONSTER_RETURN_CARDS.hadeHane.id })];
  const resolution = [monster('new', '44444444', 1, 1, 0)];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.hadeHane.id, { activation, resolution, selected: ['new'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.returned[0].uid, 'new');
});
test('Hade-Hane rejects four selected monsters', () => {
  const activation = [source({ id: FLIP_MONSTER_RETURN_CARDS.hadeHane.id })];
  const resolution = [
    monster('a', '11111111', 0, 0, 0),
    monster('b', '22222222', 2, 0, 1),
    monster('c', '33333333', 1, 1, 0),
    monster('d', '44444444', 3, 1, 1),
  ];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.hadeHane.id, { activation, resolution, selected: ['a', 'b', 'c', 'd'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'too-many-selected-monsters');
});
test('Hade-Hane may resolve with zero targets', () => {
  const activation = [source({ id: FLIP_MONSTER_RETURN_CARDS.hadeHane.id })];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.hadeHane.id, { activation, resolution: activation, selected: [] });
  assert.equal(result.ok, true);
  assert.equal(result.value.returned.length, 0);
});
test('Hade-Hane requires every resolution choice to remain on the field', () => {
  const activation = [source({ id: FLIP_MONSTER_RETURN_CARDS.hadeHane.id })];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.hadeHane.id, { activation, resolution: activation, selected: ['missing'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'non-targeting-selection-not-on-field-at-resolution');
});
test('Hade-Hane may return its own source if it remains on the field', () => {
  const activation = [source({ id: FLIP_MONSTER_RETURN_CARDS.hadeHane.id })];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.hadeHane.id, { activation, resolution: activation, selected: ['flip-source'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.returned[0].uid, 'flip-source');
});
test('face-down monster identity is hidden from public and non-owner projections', () => {
  const activation = [source(), monster('hidden', '55555555', 3, 1, 0, 'face-down-defense')];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: ['hidden'] });
  assert.equal(result.ok, true);
  const publicView = projectFlipMonsterReturnForViewer(result.value, 'public');
  const teammateView = projectFlipMonsterReturnForViewer(result.value, 0);
  assert.equal(publicView.cards[0].cardId, undefined);
  assert.equal(teammateView.cards[0].cardId, undefined);
  assert.equal(publicView.cards[0].label, 'Monstro virado para baixo');
});
test('physical owner may see their own returned face-down monster', () => {
  const activation = [source(), monster('hidden', '55555555', 3, 1, 0, 'face-down-defense')];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: ['hidden'] });
  const ownerView = projectFlipMonsterReturnForViewer(result.value, 3);
  assert.equal(ownerView.cards[0].cardId, '55555555');
  assert.equal(ownerView.cards[0].destination, 'your-hand');
});
test('face-up identities remain public after returning to hand', () => {
  const activation = [source(), monster('visible', '66666666', 2, 0, 1)];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: ['visible'] });
  const publicView = projectFlipMonsterReturnForViewer(result.value, 'public');
  assert.equal(publicView.cards[0].cardId, '66666666');
});
test('Discord projections never expose physical UIDs', () => {
  const activation = [source(), monster('private-uid', '77777777', 2, 0, 1)];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: ['private-uid'] });
  const projection = projectFlipMonsterReturnForViewer(result.value, 'public');
  assert.equal(JSON.stringify(projection).includes('private-uid'), false);
  assert.equal(Object.hasOwn(projection.cards[0], 'uid'), false);
});
test('three shared Monster Zones per team are enforced and Field Zone is separate', () => {
  const activation = [
    source(),
    monster('a', '11111111', 0, 0, 1),
    monster('b', '22222222', 2, 0, 2),
    monster('c', '33333333', 1, 1, 0),
    monster('d', '44444444', 3, 1, 1),
    monster('e', '55555555', 1, 1, 2),
  ];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: ['a', 'c'] });
  assert.equal(result.ok, true);
  const seven = [...activation, monster('f', '66666666', 2, 0, 0)];
  assert.equal(resolveFlipMonsterReturn({
    plan: makePlan().value,
    currentTurn: TURN,
    fieldAtActivation: seven,
    fieldAtResolution: seven,
    selectedUids: [],
  }).reason, 'activation-invalid-shared-monster-field-size');
});
test('duplicate Monster Zone occupancy is rejected', () => {
  const activation = [source(), monster('a', '11111111', 2, 0, 0)];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: [] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'activation-duplicate-shared-monster-zone-occupancy');
});
test('duplicate physical UIDs on the field are rejected', () => {
  const activation = [source(), monster('flip-source', '11111111', 2, 0, 1)];
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: [] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'activation-duplicate-physical-uid-on-field');
});
test('a Field Zone card cannot be selected as a monster', () => {
  const fieldCard = { ...monster('field', '11111111', 0, 0, 1), zone: 'field' };
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation: [source(), fieldCard], resolution: [source(), fieldCard], selected: [] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'activation-target-is-not-in-monster-zone');
});
test('invalid Monster Zone indexes and card identities are rejected', () => {
  const badZone = { ...monster('bad', '11111111', 0, 0, 1), monsterZoneIndex: 3 };
  const badId = { ...monster('bad-id', 'not-an-id', 0, 0, 2) };
  assert.equal(resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation: [source(), badZone], resolution: [source(), badZone], selected: [] }).reason, 'activation-invalid-shared-monster-zone-index');
  assert.equal(resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation: [source(), badId], resolution: [source(), badId], selected: [] }).reason, 'activation-invalid-field-monster-card-id');
});
test('duplicate selections and stale plans are rejected', () => {
  const activation = [source(), monster('a', '11111111', 0, 0, 1)];
  assert.equal(resolve(FLIP_MONSTER_RETURN_CARDS.penguinSoldier.id, { activation, resolution: activation, selected: ['a', 'a'] }).reason, 'duplicate-selected-monster-uid');
  assert.equal(resolveFlipMonsterReturn({ plan: makePlan().value, currentTurn: TURN + 1, fieldAtActivation: activation, fieldAtResolution: activation, selectedUids: [] }).reason, 'flip-return-resolution-turn-mismatch');
});
test('tampered card-specific target limits and selection timing are rejected', () => {
  const plan = { ...makePlan().value, maxTargets: 3, selectionMode: 'non-targeting-at-resolution' };
  const result = resolveFlipMonsterReturn({ plan, currentTurn: TURN, fieldAtActivation: [source()], fieldAtResolution: [source()], selectedUids: [] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'tampered-flip-return-plan');
});
test('inputs remain unchanged and returning three cards does not discard before End Phase', () => {
  const activation = [source({ id: FLIP_MONSTER_RETURN_CARDS.hadeHane.id })];
  const resolution = [
    monster('a', '11111111', 0, 0, 0),
    monster('b', '22222222', 2, 0, 1),
    monster('c', '33333333', 1, 1, 0),
  ];
  const beforeActivation = structuredClone(activation);
  const beforeResolution = structuredClone(resolution);
  const result = resolve(FLIP_MONSTER_RETURN_CARDS.hadeHane.id, { activation, resolution, selected: ['a', 'b', 'c'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.returned.length, 3);
  assert.deepEqual(activation, beforeActivation);
  assert.deepEqual(resolution, beforeResolution);
});
