const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  FLIP_MONSTER_DESTRUCTION_CARDS,
  teamOfSeat,
  planFlipMonsterDestruction,
  resolveFlipMonsterDestruction,
  projectFlipDestructionTargetOption,
  projectFlipDestructionResultForViewer,
} = require('../dist/flipMonsterDestructionFamily.js');

const TURN = 9;
function monster(uid, id, owner, team, zoneIndex, level = 4, position = 'face-up-attack', extra = {}) {
  return { uid, id, physicalOwnerSeat: owner, controllerTeam: team, zone: 'monster', monsterZoneIndex: zoneIndex, level, position, ...extra };
}
function source(overrides = {}) {
  return {
    uid: 'flip-source',
    id: FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id,
    physicalOwnerSeat: 0,
    controllerTeam: 0,
    zone: 'monster',
    monsterZoneIndex: 0,
    position: 'face-up-attack',
    level: 2,
    wasFaceDownAtFlip: true,
    flippedTurn: TURN,
    ...overrides,
  };
}
function makePlan(cardId = FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, overrides = {}) {
  return planFlipMonsterDestruction({ source: source({ id: cardId, ...overrides.source }), currentTurn: TURN, resolverSeat: overrides.resolverSeat ?? 0 });
}
function resolve(cardId, options = {}) {
  const p = makePlan(cardId, options);
  assert.equal(p.ok, true, p.ok ? '' : p.reason);
  return resolveFlipMonsterDestruction({
    plan: p.value,
    currentTurn: options.currentTurn ?? TURN,
    fieldAtActivation: options.activation ?? [source({ id: cardId })],
    fieldAtResolution: options.resolution ?? options.activation ?? [source({ id: cardId })],
    selectedUids: options.selected ?? [],
  });
}

test('official identities and card-specific selection semantics are fixed', () => {
  assert.deepEqual(FLIP_MONSTER_DESTRUCTION_CARDS, {
    oldVindictiveMagician: { id: '45141844', konamiCardDatabaseId: 5651, name: 'Old Vindictive Magician', selectionMode: 'targeted-at-activation', maxTargets: 1 },
    fourStarredLadybug: { id: '83994646', konamiCardDatabaseId: 5139, name: '4-Starred Ladybug of Doom', selectionMode: 'non-targeting-at-resolution', maxTargets: 0 },
  });
});
test('2v2 seat mapping is shared by opposite seats', () => {
  assert.deepEqual([teamOfSeat(0), teamOfSeat(1), teamOfSeat(2), teamOfSeat(3), teamOfSeat(4)], [0, 1, 0, 1, undefined]);
});
test('FLIP source must turn face-up from face-down in the current turn', () => {
  assert.equal(makePlan(undefined, { source: { wasFaceDownAtFlip: false } }).reason, 'source-was-not-flipped-from-face-down');
  assert.equal(makePlan(undefined, { source: { position: 'face-down-defense' } }).reason, 'flip-source-not-face-up-after-flip');
  assert.equal(makePlan(undefined, { source: { flippedTurn: TURN - 1 } }).reason, 'flip-trigger-from-different-turn');
});
test('only the source controller team may resolve the FLIP trigger', () => {
  assert.equal(makePlan(undefined, { resolverSeat: 1 }).reason, 'resolver-not-on-source-controller-team');
  const stolen = makePlan(undefined, { source: { physicalOwnerSeat: 2, controllerTeam: 1 }, resolverSeat: 1 });
  assert.equal(stolen.ok, true);
});
test('Old Vindictive Magician targets exactly one monster at activation', () => {
  const activation = [source(), monster('opponent', '11111111', 1, 1, 0)];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['opponent'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.destroyed.map(card => card.uid), ['opponent']);
});
test('Old Vindictive Magician cannot target a monster controlled by its own team', () => {
  const activation = [source(), monster('ally', '22222222', 2, 0, 1)];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['ally'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'target-not-controlled-by-opposing-team');
});
test('Old Vindictive Magician requires exactly one target', () => {
  const activation = [source(), monster('opponent', '11111111', 1, 1, 0)];
  assert.equal(resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: [] }).reason, 'old-vindictive-requires-exactly-one-target');
  assert.equal(resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['opponent', 'opponent'] }).reason, 'duplicate-selected-monster-uid');
});
test('Old Vindictive Magician may target a face-down opposing monster', () => {
  const activation = [source(), monster('hidden', '33333333', 3, 1, 0, 4, 'face-down-defense')];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['hidden'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed[0].wasFaceUpAtResolution, false);
});
test('a targeted monster that leaves the field before resolution is not destroyed', () => {
  const activation = [source(), monster('target', '11111111', 1, 1, 0)];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: [source()], selected: ['target'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed.length, 0);
});
test('targeted UIDs cannot be rebound to another physical card', () => {
  const activation = [source(), monster('target', '11111111', 1, 1, 0)];
  const resolution = [source(), monster('target', '99999999', 1, 1, 0)];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution, selected: ['target'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'target-physical-identity-changed');
});
test('destroyed stolen monsters go to the physical owner team Graveyard', () => {
  const activation = [source(), monster('stolen', '44444444', 2, 1, 0)];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['stolen'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed[0].physicalOwnerSeat, 2);
  assert.equal(result.value.destroyed[0].fromControllerTeam, 1);
  assert.equal(result.value.destroyed[0].destinationGraveyardTeam, 0);
});
test('a monster physically owned by our team but controlled by the opponent goes to our team Graveyard', () => {
  const activation = [source(), monster('our-stolen', '55555555', 0, 1, 1)];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['our-stolen'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed[0].destinationGraveyardTeam, 0);
});
test('face-down target options hide identity from non-owners and public viewers', () => {
  const hidden = monster('private-uid', '66666666', 3, 1, 0, 4, 'face-down-defense');
  const publicOption = projectFlipDestructionTargetOption(hidden, 'public');
  const controllerOption = projectFlipDestructionTargetOption(hidden, 0);
  const ownerOption = projectFlipDestructionTargetOption(hidden, 3);
  assert.equal(publicOption.cardId, undefined);
  assert.equal(controllerOption.cardId, undefined);
  assert.equal(ownerOption.cardId, '66666666');
  assert.equal(JSON.stringify(publicOption).includes('private-uid'), false);
});
test('destroyed face-down cards become public in the Graveyard without exposing UIDs', () => {
  const activation = [source(), monster('private-uid', '77777777', 1, 1, 0, 4, 'face-down-defense')];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['private-uid'] });
  const projection = projectFlipDestructionResultForViewer(result.value, 'public');
  assert.equal(projection.cards[0].cardId, '77777777');
  assert.equal(JSON.stringify(projection).includes('private-uid'), false);
});
test('destruction protection prevents the target from leaving the field', () => {
  const activation = [source(), monster('protected', '11111111', 1, 1, 0, 4, 'face-up-attack', { destructionProtected: true })];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['protected'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed.length, 0);
  assert.deepEqual(result.value.protectedUids, ['protected']);
  assert.equal(result.value.releasedMonsterZones.length, 0);
});
test('4-Starred Ladybug is non-targeting and rejects selected UIDs', () => {
  const activation = [source({ id: FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id })];
  const resolution = [monster('level4', '11111111', 1, 1, 0)];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id, { activation, resolution, selected: ['level4'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'non-targeting-effect-does-not-accept-targets');
});
test('4-Starred Ladybug destroys every face-up Level 4 monster controlled by the opposing team', () => {
  const activation = [source({ id: FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id })];
  const resolution = [
    monster('opp-a', '11111111', 1, 1, 0, 4, 'face-up-attack'),
    monster('opp-b', '22222222', 3, 1, 1, 4, 'face-up-defense'),
    monster('own', '33333333', 0, 0, 1, 4, 'face-up-attack'),
    monster('level3', '44444444', 1, 1, 2, 3, 'face-up-attack'),
    monster('level5', '55555555', 3, 0, 2, 5, 'face-up-attack'),
  ];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id, { activation, resolution, selected: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.destroyed.map(card => card.uid), ['opp-a', 'opp-b']);
});

test('Old Vindictive Magician rejects two distinct targets', () => {
  const activation = [source(), monster('a', '11111111', 1, 1, 0), monster('b', '22222222', 3, 1, 1)];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['a', 'b'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'old-vindictive-requires-exactly-one-target');
});
test('Old Vindictive Magician cannot select a target that was absent at activation', () => {
  const activation = [source()];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['missing'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'target-not-on-field-at-activation');
});
test('4-Starred Ladybug routes each destroyed monster to its physical owner team Graveyard', () => {
  const activation = [source({ id: FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id })];
  const resolution = [
    monster('stolen-by-opponent', '11111111', 0, 1, 0, 4, 'face-up-attack'),
    monster('opponent-owned', '22222222', 3, 1, 1, 4, 'face-up-defense'),
    monster('opponent-owned-but-ours', '33333333', 3, 0, 1, 4, 'face-up-attack'),
  ];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id, { activation, resolution, selected: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.destroyed.map(card => card.uid), ['stolen-by-opponent', 'opponent-owned']);
  assert.deepEqual(result.value.destroyed.map(card => card.destinationGraveyardTeam), [0, 1]);
});
test('4-Starred Ladybug ignores face-down Level 4 monsters per the official OCG text', () => {
  const activation = [source({ id: FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id })];
  const resolution = [
    monster('hidden-level4', '11111111', 1, 1, 0, 4, 'face-down-defense'),
    monster('visible-level4', '22222222', 3, 1, 1, 4, 'face-up-attack'),
  ];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id, { activation, resolution, selected: [] });
  assert.deepEqual(result.value.destroyed.map(card => card.uid), ['visible-level4']);
});
test('4-Starred Ladybug evaluates the current field at resolution, including new Level 4 monsters', () => {
  const activation = [source({ id: FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id })];
  const resolution = [monster('entered-later', '33333333', 1, 1, 0, 4, 'face-up-defense')];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id, { activation, resolution, selected: [] });
  assert.equal(result.value.destroyed[0].uid, 'entered-later');
});
test('4-Starred Ladybug does not destroy protected Level 4 monsters', () => {
  const activation = [source({ id: FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id })];
  const resolution = [monster('protected', '11111111', 1, 1, 0, 4, 'face-up-attack', { destructionProtected: true })];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id, { activation, resolution, selected: [] });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed.length, 0);
  assert.deepEqual(result.value.protectedUids, ['protected']);
});
test('FLIP destruction resolves after battle destruction removes its source before activation', () => {
  const activation = [monster('opponent', '11111111', 1, 1, 0)];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['opponent'] });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed[0].uid, 'opponent');
});
test('4-Starred Ladybug may resolve after its source leaves the field', () => {
  const activation = [];
  const resolution = [monster('opponent-level4', '11111111', 1, 1, 0, 4, 'face-up-attack')];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.fourStarredLadybug.id, { activation, resolution, selected: [] });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed.length, 1);
});
test('source identity mismatch is rejected when the source remains on the activation field', () => {
  const activation = [source(), monster('opponent', '11111111', 1, 1, 0)];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation: [source({ physicalOwnerSeat: 2 }), activation[1]], resolution: activation, selected: ['opponent'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'flip-source-identity-or-controller-changed');
});
test('shared Monster Zones enforce three slots per team and exclude the Field Zone', () => {
  const activation = [source(), monster('a', '11111111', 0, 0, 1), monster('b', '22222222', 2, 0, 2), monster('c', '33333333', 1, 1, 0), monster('d', '44444444', 3, 1, 1), monster('e', '55555555', 1, 1, 2)];
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['c'] });
  assert.equal(result.ok, true);
  const fieldCard = { ...monster('field', '66666666', 1, 1, 2), zone: 'field' };
  assert.equal(resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation: [source(), fieldCard], resolution: [source(), fieldCard], selected: [] }).reason, 'activation-target-is-not-in-monster-zone');
});
test('seven monsters cannot fit in the 3+3 shared Monster Zones', () => {
  const six = [source(), monster('a', '11111111', 0, 0, 1), monster('b', '22222222', 2, 0, 2), monster('c', '33333333', 1, 1, 0), monster('d', '44444444', 3, 1, 1), monster('e', '55555555', 1, 1, 2)];
  const seven = [...six, monster('f', '66666666', 2, 0, 0)];
  const result = resolveFlipMonsterDestruction({ plan: makePlan().value, currentTurn: TURN, fieldAtActivation: seven, fieldAtResolution: seven, selectedUids: [] });
  assert.equal(result.reason, 'activation-invalid-shared-monster-field-size');
});
test('duplicate UIDs and duplicate shared slots are rejected', () => {
  const duplicateUid = [source(), monster('flip-source', '11111111', 2, 0, 1)];
  assert.equal(resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation: duplicateUid, resolution: duplicateUid, selected: [] }).reason, 'activation-duplicate-physical-uid-on-field');
  const duplicateSlot = [source(), monster('other', '22222222', 2, 0, 0)];
  assert.equal(resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation: duplicateSlot, resolution: duplicateSlot, selected: [] }).reason, 'activation-duplicate-shared-monster-zone-occupancy');
});
test('invalid levels, zone indexes, and protection values are rejected', () => {
  const badLevel = [source(), monster('bad-level', '11111111', 1, 1, 0, 0)];
  assert.equal(resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation: badLevel, resolution: badLevel, selected: [] }).reason, 'activation-invalid-monster-level');
  const badZone = [source(), { ...monster('bad-zone', '22222222', 1, 1, 0), monsterZoneIndex: 3 }];
  assert.equal(resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation: badZone, resolution: badZone, selected: [] }).reason, 'activation-invalid-shared-monster-zone-index');
  const badProtection = [source(), { ...monster('bad-protection', '33333333', 1, 1, 0), destructionProtected: 'yes' }];
  assert.equal(resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation: badProtection, resolution: badProtection, selected: [] }).reason, 'activation-invalid-destruction-protection-state');
});
test('stale turns, duplicate selections, and tampered plans are rejected', () => {
  const activation = [source(), monster('opponent', '11111111', 1, 1, 0)];
  assert.equal(resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['opponent', 'opponent'] }).reason, 'duplicate-selected-monster-uid');
  assert.equal(resolveFlipMonsterDestruction({ plan: makePlan().value, currentTurn: TURN + 1, fieldAtActivation: activation, fieldAtResolution: activation, selectedUids: ['opponent'] }).reason, 'flip-destruction-resolution-turn-mismatch');
  const tampered = { ...makePlan().value, maxTargets: 0, selectionMode: 'non-targeting-at-resolution' };
  assert.equal(resolveFlipMonsterDestruction({ plan: tampered, currentTurn: TURN, fieldAtActivation: activation, fieldAtResolution: activation, selectedUids: [] }).reason, 'tampered-flip-destruction-plan');
});
test('inputs are immutable and destroyed cards release only their actual shared zones', () => {
  const activation = [source(), monster('target', '11111111', 3, 1, 0)];
  const before = structuredClone(activation);
  const result = resolve(FLIP_MONSTER_DESTRUCTION_CARDS.oldVindictiveMagician.id, { activation, resolution: activation, selected: ['target'] });
  assert.equal(result.ok, true);
  assert.deepEqual(activation, before);
  assert.deepEqual(result.value.releasedMonsterZones, [{ team: 1, zoneIndex: 0 }]);
});
