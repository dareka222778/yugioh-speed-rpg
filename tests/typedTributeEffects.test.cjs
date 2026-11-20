const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ANTI_AIRCRAFT_FLOWER_CARD_ID,
  ARCANE_ARCHER_OF_THE_FOREST_CARD_ID,
  eligibleTypedTributeUids,
  resolveAntiAircraftFlower,
  arcaneArcherAttackRestriction,
  resolveArcaneArcherOfTheForest,
} = require('../dist/typedTributeEffects.js');

const monster = (overrides = {}) => {
  const seat = overrides.physicalOwnerSeat ?? 0;
  return {
    uid: 'm0:monster',
    cardId: '11111111',
    physicalOwnerSeat: seat,
    physicalOwnerTeam: seat % 2,
    controllerTeam: seat % 2,
    monsterType: 'Beast',
    zoneIndex: 0,
    faceUp: true,
    ...overrides,
  };
};

const spellTrap = (overrides = {}) => {
  const seat = overrides.physicalOwnerSeat ?? 1;
  return {
    uid: 'm1:backrow',
    cardId: '22222222',
    physicalOwnerSeat: seat,
    physicalOwnerTeam: seat % 2,
    controllerTeam: seat % 2,
    cardKind: 'trap',
    zone: 'spellTrap',
    zoneIndex: 0,
    faceUp: false,
    ...overrides,
  };
};

const antiInput = (overrides = {}) => {
  const source = {
    cardId: ANTI_AIRCRAFT_FLOWER_CARD_ID,
    uid: 'm0:flower',
    physicalOwnerSeat: 0,
    physicalOwnerTeam: 0,
    controllerTeam: 0,
    faceUpAtActivation: true,
  };
  const fieldMonstersAtActivation = [
    monster({
      uid: source.uid,
      cardId: source.cardId,
      physicalOwnerSeat: 0,
      physicalOwnerTeam: 0,
      controllerTeam: 0,
      monsterType: 'Plant',
      zoneIndex: 0,
    }),
    monster({
      uid: 'm2:insect',
      physicalOwnerSeat: 2,
      physicalOwnerTeam: 0,
      controllerTeam: 0,
      monsterType: 'Insect',
      zoneIndex: 1,
    }),
    monster({
      uid: 'm1:enemy-insect',
      physicalOwnerSeat: 1,
      physicalOwnerTeam: 1,
      controllerTeam: 1,
      monsterType: 'Insect',
      zoneIndex: 0,
    }),
  ];
  return {
    source,
    fieldMonstersAtActivation,
    selectedTributeUid: 'm2:insect',
    ...overrides,
  };
};

const archerInput = (overrides = {}) => {
  const source = {
    cardId: ARCANE_ARCHER_OF_THE_FOREST_CARD_ID,
    uid: 'm0:archer',
    physicalOwnerSeat: 0,
    physicalOwnerTeam: 0,
    controllerTeam: 0,
    faceUpAtActivation: true,
  };
  const fieldMonstersAtActivation = [
    monster({
      uid: source.uid,
      cardId: source.cardId,
      physicalOwnerSeat: 0,
      physicalOwnerTeam: 0,
      controllerTeam: 0,
      monsterType: 'Warrior',
      zoneIndex: 0,
    }),
    monster({
      uid: 'm2:plant',
      physicalOwnerSeat: 2,
      physicalOwnerTeam: 0,
      controllerTeam: 0,
      monsterType: 'Plant',
      zoneIndex: 1,
    }),
    monster({
      uid: 'm1:enemy',
      physicalOwnerSeat: 1,
      physicalOwnerTeam: 1,
      controllerTeam: 1,
      monsterType: 'Plant',
      zoneIndex: 0,
    }),
  ];
  const target = spellTrap({
    uid: 'm3:set-trap',
    physicalOwnerSeat: 3,
    physicalOwnerTeam: 1,
    controllerTeam: 1,
    cardKind: 'trap',
    faceUp: false,
  });
  return {
    source,
    fieldMonstersAtActivation,
    fieldCardsAtActivation: [target],
    selectedTributeUid: 'm2:plant',
    selectedTargetUid: target.uid,
    fieldCardsAtResolution: [target],
    ...overrides,
  };
};

test('Anti-Aircraft Flower pays one controlled Insect and inflicts exactly 800 to the opposing team', () => {
  const result = resolveAntiAircraftFlower(antiInput());
  assert.equal(result.damageTeam, 1);
  assert.equal(result.damageAmount, 800);
  assert.equal(result.tribute.uid, 'm2:insect');
  assert.equal(result.tribute.destinationTeam, 0);
  assert.equal(result.tribute.physicalOwnerSeat, 2);
  assert.equal(result.hasOncePerTurnRestriction, false);
});

test('typed tribute candidates are limited to the controller team and exact monster Type', () => {
  const input = antiInput();
  assert.deepEqual(
    eligibleTypedTributeUids(input.fieldMonstersAtActivation, 0, 'Insect'),
    ['m2:insect'],
  );
});

test('a face-down Insect controlled by the activating team can be Tributed as a typed cost', () => {
  const input = antiInput();
  input.fieldMonstersAtActivation[1].faceUp = false;
  const result = resolveAntiAircraftFlower(input);
  assert.equal(result.tribute.uid, 'm2:insect');
});

test('physical owner and controller remain distinct when a stolen Insect is Tributed', () => {
  const input = antiInput();
  input.fieldMonstersAtActivation[1] = monster({
    uid: 'm3:stolen-insect',
    physicalOwnerSeat: 3,
    physicalOwnerTeam: 1,
    controllerTeam: 0,
    monsterType: 'Insect',
    zoneIndex: 1,
  });
  input.selectedTributeUid = 'm3:stolen-insect';
  const result = resolveAntiAircraftFlower(input);
  assert.equal(result.tribute.controllerTeam, 0);
  assert.equal(result.tribute.physicalOwnerSeat, 3);
  assert.equal(result.tribute.physicalOwnerTeam, 1);
  assert.equal(result.tribute.destinationTeam, 1);
});

test('Anti-Aircraft Flower may Tribute itself if its Type has been changed to Insect', () => {
  const input = antiInput();
  input.fieldMonstersAtActivation[0].monsterType = 'Insect';
  input.selectedTributeUid = input.source.uid;
  const result = resolveAntiAircraftFlower(input);
  assert.equal(result.tribute.uid, input.source.uid);
  assert.equal(result.damageAmount, 800);
});

test('Anti-Aircraft Flower has no helper-imposed once-per-turn limit', () => {
  const input = antiInput();
  input.fieldMonstersAtActivation.push(monster({
    uid: 'm2:second-insect',
    physicalOwnerSeat: 2,
    physicalOwnerTeam: 0,
    controllerTeam: 0,
    monsterType: 'Insect',
    zoneIndex: 2,
  }));
  const first = resolveAntiAircraftFlower(input);
  const second = resolveAntiAircraftFlower({ ...input, selectedTributeUid: 'm2:second-insect' });
  assert.equal(first.damageAmount, 800);
  assert.equal(second.damageAmount, 800);
});

test('Anti-Aircraft Flower rejects a non-Insect Tribute', () => {
  const input = antiInput({ selectedTributeUid: 'm1:enemy-insect' });
  assert.throws(() => resolveAntiAircraftFlower(input), /controlled Insect monster/);
});

test('Anti-Aircraft Flower rejects a source that is not face-up at activation', () => {
  const input = antiInput({ source: { ...antiInput().source, faceUpAtActivation: false } });
  assert.throws(() => resolveAntiAircraftFlower(input), /face-up at activation/);
});

test('Anti-Aircraft Flower rejects a mismatched source identity', () => {
  const input = antiInput({ source: { ...antiInput().source, cardId: '00000000' } });
  assert.throws(() => resolveAntiAircraftFlower(input), /65064143/);
});

test('typed tribute validation rejects duplicate physical UIDs', () => {
  const input = antiInput();
  input.fieldMonstersAtActivation[2].uid = input.fieldMonstersAtActivation[1].uid;
  assert.throws(() => resolveAntiAircraftFlower(input), /duplicate physical UID/);
});

test('typed tribute validation enforces three shared Monster Zones per team', () => {
  const input = antiInput();
  input.fieldMonstersAtActivation.push(monster({
    uid: 'm2:fourth',
    physicalOwnerSeat: 2,
    physicalOwnerTeam: 0,
    controllerTeam: 0,
    monsterType: 'Insect',
    zoneIndex: 3,
  }));
  assert.throws(() => resolveAntiAircraftFlower(input), /three Monster Zones/);
});

test('physical owner seat must map to its actual 2v2 team', () => {
  const input = antiInput();
  input.fieldMonstersAtActivation[1].physicalOwnerTeam = 1;
  assert.throws(() => resolveAntiAircraftFlower(input), /does not match the seat's team/);
});

test('Arcane Archer Tributes a Plant and destroys a face-down opposing Trap', () => {
  const result = resolveArcaneArcherOfTheForest(archerInput());
  assert.equal(result.tribute.uid, 'm2:plant');
  assert.equal(result.targetUid, 'm3:set-trap');
  assert.equal(result.targetDestroyed, true);
  assert.equal(result.targetDestinationTeam, 1);
  assert.equal(result.targetPhysicalOwnerSeat, 3);
  assert.equal(result.hasOncePerTurnRestriction, false);
});

test('Arcane Archer can target a Spell in the separate Field Zone', () => {
  const input = archerInput();
  input.fieldCardsAtActivation[0] = spellTrap({
    uid: 'm1:field-spell',
    physicalOwnerSeat: 1,
    physicalOwnerTeam: 1,
    controllerTeam: 1,
    cardKind: 'spell',
    zone: 'field',
    zoneIndex: 0,
    faceUp: true,
  });
  input.selectedTargetUid = 'm1:field-spell';
  input.fieldCardsAtResolution = input.fieldCardsAtActivation;
  const result = resolveArcaneArcherOfTheForest(input);
  assert.equal(result.targetDestroyed, true);
  assert.equal(result.targetDestinationTeam, 1);
});

test('Arcane Archer pays its Tribute even when the exact targeted card leaves before resolution', () => {
  const input = archerInput({ fieldCardsAtResolution: [] });
  const result = resolveArcaneArcherOfTheForest(input);
  assert.equal(result.tribute.uid, 'm2:plant');
  assert.equal(result.targetUid, 'm3:set-trap');
  assert.equal(result.targetDestroyed, false);
  assert.equal(result.targetDestinationTeam, null);
});

test('Arcane Archer may Tribute itself if its Type has been changed to Plant', () => {
  const input = archerInput();
  input.fieldMonstersAtActivation[0].monsterType = 'Plant';
  input.selectedTributeUid = input.source.uid;
  const result = resolveArcaneArcherOfTheForest(input);
  assert.equal(result.tribute.uid, input.source.uid);
  assert.equal(result.targetDestroyed, true);
});

test('Arcane Archer attack protection applies while a Plant is controlled by its team', () => {
  const input = archerInput();
  const result = arcaneArcherAttackRestriction(input.source.uid, input.fieldMonstersAtActivation);
  assert.deepEqual(result, { cannotBeAttacked: true, reason: 'plant-present' });
});

test('a face-down Plant is checked server-side without exposing its UID or identity in the result', () => {
  const input = archerInput();
  input.fieldMonstersAtActivation[1].faceUp = false;
  const result = arcaneArcherAttackRestriction(input.source.uid, input.fieldMonstersAtActivation);
  assert.equal(result.cannotBeAttacked, true);
  assert.deepEqual(Object.keys(result).sort(), ['cannotBeAttacked', 'reason']);
  assert.equal(JSON.stringify(result).includes('m2:plant'), false);
});

test('a Plant controlled by the opposing team does not protect Arcane Archer', () => {
  const input = archerInput();
  input.fieldMonstersAtActivation[1].controllerTeam = 1;
  input.fieldMonstersAtActivation[1].zoneIndex = 1;
  const result = arcaneArcherAttackRestriction(input.source.uid, input.fieldMonstersAtActivation);
  assert.deepEqual(result, { cannotBeAttacked: false, reason: 'no-plant' });
});

test('Arcane Archer is attackable while face-down even if a Plant is present', () => {
  const input = archerInput();
  input.fieldMonstersAtActivation[0].faceUp = false;
  const result = arcaneArcherAttackRestriction(input.source.uid, input.fieldMonstersAtActivation);
  assert.deepEqual(result, { cannotBeAttacked: false, reason: 'source-face-down' });
});

test('Arcane Archer is attackable when its team controls no Plant', () => {
  const input = archerInput();
  input.fieldMonstersAtActivation = [input.fieldMonstersAtActivation[0], input.fieldMonstersAtActivation[2]];
  const result = arcaneArcherAttackRestriction(input.source.uid, input.fieldMonstersAtActivation);
  assert.deepEqual(result, { cannotBeAttacked: false, reason: 'no-plant' });
});

test('Arcane Archer rejects a non-Plant Tribute', () => {
  const input = archerInput({ selectedTributeUid: 'm1:enemy' });
  assert.throws(() => resolveArcaneArcherOfTheForest(input), /controlled Plant monster/);
});

test('Arcane Archer requires its target to be on the field at activation', () => {
  const input = archerInput({ fieldCardsAtActivation: [] });
  assert.throws(() => resolveArcaneArcherOfTheForest(input), /on the field at activation/);
});

test('Arcane Archer target physical identity cannot be silently replaced before resolution', () => {
  const input = archerInput();
  input.fieldCardsAtResolution[0] = spellTrap({
    uid: 'm3:set-trap',
    cardId: '99999999',
    physicalOwnerSeat: 3,
    physicalOwnerTeam: 1,
    controllerTeam: 1,
  });
  assert.throws(() => resolveArcaneArcherOfTheForest(input), /physical identity changed/);
});

test('Arcane Archer can destroy its own team Spell/Trap as well as an opposing card', () => {
  const input = archerInput();
  const ownCard = spellTrap({
    uid: 'm2:own-spell',
    cardId: '33333333',
    physicalOwnerSeat: 2,
    physicalOwnerTeam: 0,
    controllerTeam: 0,
    cardKind: 'spell',
    zoneIndex: 2,
  });
  input.fieldCardsAtActivation = [ownCard];
  input.fieldCardsAtResolution = [ownCard];
  input.selectedTargetUid = ownCard.uid;
  const result = resolveArcaneArcherOfTheForest(input);
  assert.equal(result.targetDestroyed, true);
  assert.equal(result.targetDestinationTeam, 0);
});

test('the three Spell/Trap Zones and separate Field Zone coexist for one team', () => {
  const cards = [
    spellTrap({ uid: 'm0:st0', physicalOwnerSeat: 0, physicalOwnerTeam: 0, controllerTeam: 0, zoneIndex: 0 }),
    spellTrap({ uid: 'm0:st1', physicalOwnerSeat: 0, physicalOwnerTeam: 0, controllerTeam: 0, zoneIndex: 1 }),
    spellTrap({ uid: 'm0:st2', physicalOwnerSeat: 0, physicalOwnerTeam: 0, controllerTeam: 0, zoneIndex: 2 }),
    spellTrap({ uid: 'm2:field', physicalOwnerSeat: 2, physicalOwnerTeam: 0, controllerTeam: 0, zone: 'field', zoneIndex: 0 }),
  ];
  const input = archerInput({ fieldCardsAtActivation: cards, fieldCardsAtResolution: cards, selectedTargetUid: 'm2:field' });
  const result = resolveArcaneArcherOfTheForest(input);
  assert.equal(result.targetDestroyed, true);
});

test('the shared Spell/Trap field rejects a fourth Spell/Trap Zone', () => {
  const cards = [
    spellTrap({ uid: 'm0:a', physicalOwnerSeat: 0, physicalOwnerTeam: 0, controllerTeam: 0, zoneIndex: 0 }),
    spellTrap({ uid: 'm0:b', physicalOwnerSeat: 0, physicalOwnerTeam: 0, controllerTeam: 0, zoneIndex: 1 }),
    spellTrap({ uid: 'm0:c', physicalOwnerSeat: 0, physicalOwnerTeam: 0, controllerTeam: 0, zoneIndex: 2 }),
    spellTrap({ uid: 'm0:d', physicalOwnerSeat: 0, physicalOwnerTeam: 0, controllerTeam: 0, zoneIndex: 3 }),
  ];
  const input = archerInput({ fieldCardsAtActivation: cards, fieldCardsAtResolution: cards, selectedTargetUid: 'm0:a' });
  assert.throws(() => resolveArcaneArcherOfTheForest(input), /three Spell\/Trap Zones/);
});

test('a physical UID cannot occupy Monster and Spell/Trap Zones simultaneously', () => {
  const input = archerInput();
  input.fieldCardsAtActivation[0].uid = 'm2:plant';
  input.fieldCardsAtResolution = input.fieldCardsAtActivation;
  input.selectedTargetUid = 'm2:plant';
  assert.throws(() => resolveArcaneArcherOfTheForest(input), /cannot occupy Monster and Spell\/Trap Zones/);
});

test('resolvers do not mutate their input field snapshots', () => {
  const anti = antiInput();
  const beforeAnti = structuredClone(anti);
  resolveAntiAircraftFlower(anti);
  assert.deepEqual(anti, beforeAnti);

  const archer = archerInput();
  const beforeArcher = structuredClone(archer);
  resolveArcaneArcherOfTheForest(archer);
  assert.deepEqual(archer, beforeArcher);
});
