const test = require('node:test');
const assert = require('node:assert/strict');
const {
  planTagAntiAircraftFlower,
  captureTagArcaneArcherActivation,
  resolveTagArcaneArcher,
  tagArcaneArcherAttackRestriction,
  typedTributeTagDuelPublicSummary
} = require('../dist/typedTributeTagDuelAdapter');
const {
  ANTI_AIRCRAFT_FLOWER_CARD_ID,
  ARCANE_ARCHER_OF_THE_FOREST_CARD_ID
} = require('../dist/typedTributeEffects');
const { createTagDuel, tagNormalCardIds } = require('../dist/tagDuel');
const { engineCatalog } = require('../dist/effectRegistry');

const insectId = engineCatalog.find(card => card.kind === 'monster' && card.monsterType === 'Insect')?.id;
const plantId = engineCatalog.find(card => card.kind === 'monster' && card.monsterType === 'Plant')?.id;
const trapId = engineCatalog.find(card => card.kind === 'trap')?.id;
const spellId = engineCatalog.find(card => card.kind === 'spell')?.id;
assert.ok(insectId, 'catalog must include a typed Insect fixture');
assert.ok(plantId, 'catalog must include a typed Plant fixture');
assert.ok(trapId, 'catalog must include a Trap fixture');
assert.ok(spellId, 'catalog must include a Spell fixture');

function makeGame(first = 2) {
  const deck = tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: 'seat-' + seat,
    name: 'Seat ' + seat,
    cards: [...deck]
  }));
  return createTagDuel(players, { seed: 'm445-typed-tribute', first, classic: true });
}

function takeCard(game, seat) {
  const team = seat % 2;
  const held = game.active[team] === seat
    ? game.core.players[team]
    : game.reserves[String(seat)];
  const card = held.deck.pop();
  assert.ok(card);
  return card;
}

function addMonster(game, cardId, ownerSeat, controllerTeam, faceUp = true) {
  const physical = takeCard(game, ownerSeat);
  const list = game.core.players[controllerTeam].monsters;
  const monster = {
    ...physical,
    id: cardId,
    position: 'atk',
    faceUp,
    entered: game.core.turn,
    changed: game.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0
  };
  list.push(monster);
  return monster;
}

function addBackrow(game, cardId, ownerSeat, controllerTeam, faceUp = false) {
  const physical = takeCard(game, ownerSeat);
  const list = game.core.players[controllerTeam].backrow;
  const card = { ...physical, id: cardId, setTurn: 0, faceUp };
  list.push(card);
  return card;
}

function addField(game, cardId, ownerSeat, controllerTeam, faceUp = true) {
  const physical = takeCard(game, ownerSeat);
  const card = { ...physical, id: cardId, setTurn: 0, faceUp };
  game.core.players[controllerTeam].field = card;
  return card;
}

test('Anti-Aircraft Flower Tributes a controlled Insect and routes 800 damage to the opposing team', () => {
  const game = makeGame(2);
  const source = addMonster(game, ANTI_AIRCRAFT_FLOWER_CARD_ID, 0, 0);
  const insect = addMonster(game, insectId, 2, 0);
  const before = JSON.stringify(game);
  const result = planTagAntiAircraftFlower(game, 'turn1:flower:1', source.uid, insect.uid);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.damageTeam, 1);
  assert.equal(result.value.result.damageAmount, 800);
  assert.equal(result.value.result.tribute.uid, insect.uid);
  assert.equal(result.value.result.tribute.destinationTeam, 0);
  assert.equal(result.value.result.tribute.physicalOwnerSeat, 2);
  assert.deepEqual(result.value.processedActionIds, ['turn1:flower:1']);
  assert.equal(JSON.stringify(game), before);
});


test('a face-down Insect cannot be paid as Anti-Aircraft Flower typed Tribute cost', () => {
  const game = makeGame(2);
  const source = addMonster(game, ANTI_AIRCRAFT_FLOWER_CARD_ID, 0, 0);
  const hiddenInsect = addMonster(game, insectId, 2, 0, false);
  const result = planTagAntiAircraftFlower(game, 'turn1:flower:hidden', source.uid, hiddenInsect.uid);
  assert.equal(result.ok, false);
  assert.match(result.reason, /controlled Insect/);
});

test('a stolen Insect is paid to its physical-owner Graveyard while damage follows the controller team', () => {
  const game = makeGame(2);
  const source = addMonster(game, ANTI_AIRCRAFT_FLOWER_CARD_ID, 0, 0);
  const stolen = addMonster(game, insectId, 3, 0);
  const result = planTagAntiAircraftFlower(game, 'turn1:flower:2', source.uid, stolen.uid);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.damageTeam, 1);
  assert.equal(result.value.result.tribute.controllerTeam, 0);
  assert.equal(result.value.result.tribute.physicalOwnerTeam, 1);
  assert.equal(result.value.result.tribute.destinationTeam, 1);
  assert.equal(result.value.result.tribute.physicalOwnerSeat, 3);
});

test('an opposing Insect cannot pay the active team source cost', () => {
  const game = makeGame(2);
  const source = addMonster(game, ANTI_AIRCRAFT_FLOWER_CARD_ID, 0, 0);
  const enemy = addMonster(game, insectId, 1, 1);
  const result = planTagAntiAircraftFlower(game, 'turn1:flower:3', source.uid, enemy.uid);
  assert.equal(result.ok, false);
  assert.match(result.reason, /controlled Insect/);
});

test('Anti-Aircraft Flower requires a face-up source at activation', () => {
  const game = makeGame(2);
  const source = addMonster(game, ANTI_AIRCRAFT_FLOWER_CARD_ID, 0, 0, false);
  const insect = addMonster(game, insectId, 2, 0);
  const result = planTagAntiAircraftFlower(game, 'turn1:flower:4', source.uid, insect.uid);
  assert.equal(result.ok, false);
  assert.match(result.reason, /face-up at activation/);
});

test('Anti-Aircraft Flower has no helper-imposed once-per-turn limit', () => {
  const game = makeGame(2);
  const source = addMonster(game, ANTI_AIRCRAFT_FLOWER_CARD_ID, 0, 0);
  const first = addMonster(game, insectId, 0, 0);
  const second = addMonster(game, insectId, 2, 0);
  const one = planTagAntiAircraftFlower(game, 'turn1:flower:5', source.uid, first.uid);
  const two = planTagAntiAircraftFlower(game, 'turn1:flower:6', source.uid, second.uid);
  assert.equal(one.ok, true);
  assert.equal(two.ok, true);
  assert.equal(one.value.result.hasOncePerTurnRestriction, false);
  assert.equal(two.value.result.hasOncePerTurnRestriction, false);
});

test('Anti-Aircraft Flower rejects duplicate action IDs without mutating inventory', () => {
  const game = makeGame(2);
  const source = addMonster(game, ANTI_AIRCRAFT_FLOWER_CARD_ID, 0, 0);
  const insect = addMonster(game, insectId, 2, 0);
  const first = planTagAntiAircraftFlower(game, 'turn1:flower:7', source.uid, insect.uid);
  assert.equal(first.ok, true);
  const retry = planTagAntiAircraftFlower(
    game, 'turn1:flower:7', source.uid, insect.uid, first.value.processedActionIds
  );
  assert.deepEqual(retry, { ok: false, reason: 'duplicate typed Tribute action.' });
});

test('Arcane Archer Tributes a Plant and destroys an exact opposing face-down Trap', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 0, 0);
  const plant = addMonster(game, plantId, 2, 0);
  const target = addBackrow(game, trapId, 3, 1, false);
  const activation = captureTagArcaneArcherActivation(
    game, 'turn1:archer:1', source.uid, plant.uid, target.uid
  );
  assert.equal(activation.ok, true);
  const result = resolveTagArcaneArcher(game, activation.value);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.tribute.uid, plant.uid);
  assert.equal(result.value.result.targetUid, target.uid);
  assert.equal(result.value.result.targetDestroyed, true);
  assert.equal(result.value.result.targetDestinationTeam, 1);
  assert.equal(result.value.result.targetPhysicalOwnerSeat, 3);
});


test('a face-down Plant cannot be paid as Arcane Archer typed Tribute cost', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 0, 0);
  const hiddenPlant = addMonster(game, plantId, 2, 0, false);
  const target = addBackrow(game, trapId, 3, 1);
  const result = captureTagArcaneArcherActivation(
    game, 'turn1:archer:hidden-plant', source.uid, hiddenPlant.uid, target.uid
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /controlled Plant/);
});

test('a face-down Plant does not satisfy Arcane Archer continuous attack protection', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 0, 0);
  addMonster(game, plantId, 2, 0, false);
  const result = tagArcaneArcherAttackRestriction(game, source.uid);
  assert.deepEqual(result, { ok: true, value: { cannotBeAttacked: false, reason: 'no-plant' } });
});

test('Arcane Archer can target a Spell in the separate Field Zone', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 0, 0);
  const plant = addMonster(game, plantId, 2, 0);
  const target = addField(game, spellId, 1, 1, true);
  const activation = captureTagArcaneArcherActivation(
    game, 'turn1:archer:2', source.uid, plant.uid, target.uid
  );
  assert.equal(activation.ok, true);
  const result = resolveTagArcaneArcher(game, activation.value);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.targetDestroyed, true);
  assert.equal(result.value.result.targetDestinationTeam, 1);
});

test('Arcane Archer pays its Plant Tribute when the exact target leaves before resolution', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 0, 0);
  const plant = addMonster(game, plantId, 2, 0);
  const target = addBackrow(game, trapId, 3, 1, false);
  const activation = captureTagArcaneArcherActivation(
    game, 'turn1:archer:3', source.uid, plant.uid, target.uid
  );
  assert.equal(activation.ok, true);
  game.core.players[1].backrow = game.core.players[1].backrow.filter(card => card.uid !== target.uid);
  game.core.players[1].grave.push({ uid: target.uid, id: target.id });
  const result = resolveTagArcaneArcher(game, activation.value);
  assert.equal(result.ok, true);
  assert.equal(result.value.result.tribute.uid, plant.uid);
  assert.equal(result.value.result.targetDestroyed, false);
  assert.equal(result.value.result.targetDestinationTeam, null);
});

test('Arcane Archer rejects replacement of the target physical identity', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 0, 0);
  const plant = addMonster(game, plantId, 2, 0);
  const target = addBackrow(game, trapId, 3, 1, false);
  const activation = captureTagArcaneArcherActivation(
    game, 'turn1:archer:4', source.uid, plant.uid, target.uid
  );
  assert.equal(activation.ok, true);
  game.core.players[1].backrow[0].id = spellId;
  const result = resolveTagArcaneArcher(game, activation.value);
  assert.equal(result.ok, false);
  assert.match(result.reason, /physical identity changed/);
});

test('Arcane Archer attack protection follows a face-up Plant controlled by its team', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 0, 0);
  addMonster(game, plantId, 2, 0, true);
  const result = tagArcaneArcherAttackRestriction(game, source.uid);
  assert.deepEqual(result, { ok: true, value: { cannotBeAttacked: true, reason: 'plant-present' } });
});

test('an opposing Plant does not protect Arcane Archer', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 0, 0);
  addMonster(game, plantId, 1, 1, true);
  const result = tagArcaneArcherAttackRestriction(game, source.uid);
  assert.deepEqual(result, { ok: true, value: { cannotBeAttacked: false, reason: 'no-plant' } });
});

test('Arcane Archer is attackable while face-down even if its team controls a Plant', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 0, 0, false);
  addMonster(game, plantId, 2, 0, true);
  const result = tagArcaneArcherAttackRestriction(game, source.uid);
  assert.deepEqual(result, { ok: true, value: { cannotBeAttacked: false, reason: 'source-face-down' } });
});

test('Arcane Archer activation rejects a face-down source and a non-Plant Tribute', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 0, 0, false);
  const beast = addMonster(game, tagNormalCardIds[0], 2, 0);
  const target = addBackrow(game, trapId, 3, 1);
  const result = captureTagArcaneArcherActivation(game, 'turn1:archer:5', source.uid, beast.uid, target.uid);
  assert.equal(result.ok, false);
  assert.match(result.reason, /face-up at activation/);
});

test('Arcane Archer rejects a target that was not on the field at activation', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 0, 0);
  const plant = addMonster(game, plantId, 2, 0);
  const result = captureTagArcaneArcherActivation(
    game, 'turn1:archer:6', source.uid, plant.uid, 'm3:missing-target'
  );
  assert.deepEqual(result, { ok: false, reason: 'Arcane Archer target is not on the field at activation.' });
});

test('Arcane Archer activation is bound to the active physical representative and turn', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 1, 1);
  const plant = addMonster(game, plantId, 3, 1);
  const target = addBackrow(game, trapId, 3, 1);
  const result = captureTagArcaneArcherActivation(game, 'turn1:archer:7', source.uid, plant.uid, target.uid);
  assert.equal(result.ok, false);
  assert.match(result.reason, /active physical representative/);
});

test('a face-up source with no Plant on its team has no attack protection', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 0, 0);
  const result = tagArcaneArcherAttackRestriction(game, source.uid);
  assert.deepEqual(result, { ok: true, value: { cannotBeAttacked: false, reason: 'no-plant' } });
});

test('action ledger rejects malformed and duplicate IDs', () => {
  const game = makeGame(2);
  const source = addMonster(game, ANTI_AIRCRAFT_FLOWER_CARD_ID, 0, 0);
  const insect = addMonster(game, insectId, 2, 0);
  assert.equal(planTagAntiAircraftFlower(game, ' ', source.uid, insect.uid).ok, false);
  assert.equal(planTagAntiAircraftFlower(game, 'turn1:flower:8', source.uid, insect.uid, ['x', 'x']).ok, false);
});

test('the adapter never mutates TagDuel state or physical inventory', () => {
  const game = makeGame(2);
  const source = addMonster(game, ARCANE_ARCHER_OF_THE_FOREST_CARD_ID, 0, 0);
  const plant = addMonster(game, plantId, 2, 0);
  const target = addBackrow(game, trapId, 3, 1);
  const before = JSON.stringify(game);
  const activation = captureTagArcaneArcherActivation(
    game, 'turn1:archer:8', source.uid, plant.uid, target.uid
  );
  assert.equal(activation.ok, true);
  const resolved = resolveTagArcaneArcher(game, activation.value);
  assert.equal(resolved.ok, true);
  assert.equal(JSON.stringify(game), before);
});

test('public summary does not expose physical UIDs or selected hidden cards', () => {
  const summary = typedTributeTagDuelPublicSummary();
  assert.match(summary, /UIDs, mãos e identidades privadas não são exibidos publicamente/i);
  assert.equal(summary.includes(ANTI_AIRCRAFT_FLOWER_CARD_ID), false);
  assert.equal(summary.includes(ARCANE_ARCHER_OF_THE_FOREST_CARD_ID), false);
});
