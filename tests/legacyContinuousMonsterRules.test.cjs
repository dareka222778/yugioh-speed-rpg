const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AMAZONESS_TIGER_CARD_ID,
  ARSENAL_BUG_CARD_ID,
  amazonessTigerCanRemainFaceUp,
  amazonessTigerAttackAllowed,
  evaluateAmazonessTiger,
  evaluateArsenalBug,
  teamOfLegacySeat,
  validateLegacyMonsterField,
} = require('../dist/legacyContinuousMonsterRules');

const monster = (overrides = {}) => ({
  uid: 'm0:base',
  cardId: '99999999',
  physicalOwnerSeat: 0,
  controllerSeat: 0,
  zoneSlot: 0,
  faceUp: true,
  race: 'Warrior',
  archetypes: [],
  baseAtk: 1000,
  baseDef: 1000,
  ...overrides,
});
const tiger = (overrides = {}) => monster({
  uid: 'm0:tiger',
  cardId: AMAZONESS_TIGER_CARD_ID,
  race: 'Beast',
  archetypes: ['Amazoness'],
  baseAtk: 1100,
  baseDef: 1500,
  ...overrides,
});
const bug = (overrides = {}) => monster({
  uid: 'm2:bug',
  cardId: ARSENAL_BUG_CARD_ID,
  race: 'Insect',
  baseAtk: 2000,
  baseDef: 2000,
  physicalOwnerSeat: 2,
  controllerSeat: 2,
  zoneSlot: 0,
  ...overrides,
});
const board = (...cards) => {
  const next = { even: 0, odd: 0 };
  return cards.map(card => {
    const team = card.controllerSeat % 2 === 0 ? 'even' : 'odd';
    return { ...card, zoneSlot: next[team]++ };
  });
};

test('maps four physical seats to two shared teams', () => {
  assert.deepEqual([0, 1, 2, 3].map(teamOfLegacySeat), ['even', 'odd', 'even', 'odd']);
});

test('Amazoness Tiger counts itself and face-up Amazoness monsters controlled by its teammate', () => {
  const field = board(
    tiger({ physicalOwnerSeat: 2, controllerSeat: 0 }),
    monster({ uid: 'm0:amazoness', physicalOwnerSeat: 0, controllerSeat: 2, archetypes: ['Amazoness'] }),
  );
  const result = evaluateAmazonessTiger('m0:tiger', field);
  assert.deepEqual(result, {
    active: true,
    atk: 1900,
    amazonessCount: 2,
    controlLimitSatisfied: true,
    duplicateFaceUpTigerUids: [],
  });
});

test('Amazoness Tiger does not count monsters controlled by the opposing team', () => {
  const field = board(
    tiger(),
    monster({ uid: 'm1:amazoness', physicalOwnerSeat: 1, controllerSeat: 1, archetypes: ['Amazoness'] }),
  );
  assert.equal(evaluateAmazonessTiger('m0:tiger', field).atk, 1500);
});

test('face-down Amazoness identities do not leak into the visible ATK calculation', () => {
  const field = board(
    tiger(),
    monster({ uid: 'm2:hidden', physicalOwnerSeat: 2, controllerSeat: 2, faceUp: false, archetypes: ['Amazoness'] }),
  );
  assert.equal(evaluateAmazonessTiger('m0:tiger', field).atk, 1500);
});

test('face-down or negated Tiger has no continuous ATK modifier', () => {
  const faceDown = board(tiger({ faceUp: false }));
  const negated = board(tiger({ effectNegated: true }));
  assert.deepEqual(evaluateAmazonessTiger('m0:tiger', faceDown), {
    active: false, reason: 'source-face-down', atk: 1100,
  });
  assert.deepEqual(evaluateAmazonessTiger('m0:tiger', negated), {
    active: false, reason: 'source-effect-negated', atk: 1100,
  });
});

test('face-down duplicate Tiger may coexist with one face-up Tiger', () => {
  const existing = tiger({ uid: 'm0:first', zoneSlot: 0 });
  const candidate = tiger({ uid: 'm2:set', physicalOwnerSeat: 2, controllerSeat: 2, zoneSlot: 1, faceUp: false });
  assert.equal(amazonessTigerCanRemainFaceUp(candidate, board(existing)), true);
});

test('a second face-up Tiger is rejected across the shared team field', () => {
  const existing = tiger({ uid: 'm0:first', controllerSeat: 0, zoneSlot: 0 });
  const candidate = tiger({ uid: 'm2:second', physicalOwnerSeat: 2, controllerSeat: 2, zoneSlot: 1 });
  assert.equal(amazonessTigerCanRemainFaceUp(candidate, board(existing)), false);
  const result = evaluateAmazonessTiger('m0:first', board(existing, candidate));
  assert.equal(result.controlLimitSatisfied, false);
  assert.deepEqual(result.duplicateFaceUpTigerUids, ['m2:second']);
});

test('Tiger may attack-lock an opposing Amazoness target without returning hidden identity', () => {
  const field = board(
    tiger(),
    monster({ uid: 'm2:hidden-amazoness', physicalOwnerSeat: 2, controllerSeat: 2, faceUp: false, archetypes: ['Amazoness'] }),
  );
  const result = amazonessTigerAttackAllowed(1, 'm2:hidden-amazoness', field);
  assert.deepEqual(result, { allowed: false });
  assert.deepEqual(Object.keys(result), ['allowed']);
});

test('the Tiger itself remains an attackable exception', () => {
  const field = board(tiger(), monster({ uid: 'm1:attacker', controllerSeat: 1, physicalOwnerSeat: 1 }));
  assert.deepEqual(amazonessTigerAttackAllowed(1, 'm0:tiger', field), { allowed: true });
});

test('an allied attacker is not restricted by its own team Tiger', () => {
  const field = board(
    tiger(),
    monster({ uid: 'm2:amazoness', physicalOwnerSeat: 2, controllerSeat: 2, archetypes: ['Amazoness'] }),
  );
  assert.deepEqual(amazonessTigerAttackAllowed(0, 'm2:amazoness', field), { allowed: true });
});

test('a negated or face-down Tiger does not protect the team', () => {
  const target = monster({ uid: 'm1:amazoness', physicalOwnerSeat: 1, controllerSeat: 1, archetypes: ['Amazoness'] });
  assert.deepEqual(amazonessTigerAttackAllowed(1, 'm1:amazoness', board(tiger({ effectNegated: true }), target)), { allowed: true });
  assert.deepEqual(amazonessTigerAttackAllowed(1, 'm1:amazoness', board(tiger({ faceUp: false }), target)), { allowed: true });
});

test('Amazoness protection does not block non-Amazoness monsters', () => {
  const field = board(tiger(), monster({ uid: 'm1:other', physicalOwnerSeat: 1, controllerSeat: 1 }));
  assert.deepEqual(amazonessTigerAttackAllowed(1, 'm1:other', field), { allowed: true });
});

test('Arsenal Bug becomes 1000/1000 when no other face-up Insect is controlled by its team', () => {
  assert.deepEqual(evaluateArsenalBug('m2:bug', board(bug())), {
    active: true, atk: 1000, def: 1000, otherFaceUpInsectCount: 0,
  });
});

test('a teammate-owned Insect prevents Arsenal Bug reduction', () => {
  const field = board(
    bug({ physicalOwnerSeat: 0, controllerSeat: 2 }),
    monster({ uid: 'm0:insect', physicalOwnerSeat: 0, controllerSeat: 0, race: 'Insect' }),
  );
  assert.deepEqual(evaluateArsenalBug('m2:bug', field), {
    active: true, atk: 2000, def: 2000, otherFaceUpInsectCount: 1,
  });
});

test('multiple Arsenal Bugs count one another as other Insects', () => {
  const field = board(bug({ zoneSlot: 0 }), bug({ uid: 'm0:bug2', physicalOwnerSeat: 0, controllerSeat: 0, zoneSlot: 1 }));
  assert.equal(evaluateArsenalBug('m2:bug', field).atk, 2000);
  assert.equal(evaluateArsenalBug('m0:bug2', field).def, 2000);
});

test('opponent Insects do not affect Arsenal Bug', () => {
  const field = board(
    bug(),
    monster({ uid: 'm1:insect', physicalOwnerSeat: 1, controllerSeat: 1, race: 'Insect' }),
  );
  assert.equal(evaluateArsenalBug('m2:bug', field).atk, 1000);
});

test('face-down Insects do not alter visible Arsenal Bug stats', () => {
  const field = board(
    bug(),
    monster({ uid: 'm0:hidden-insect', physicalOwnerSeat: 0, controllerSeat: 0, faceUp: false, race: 'Insect' }),
  );
  assert.equal(evaluateArsenalBug('m2:bug', field).atk, 1000);
});

test('Arsenal Bug is inactive while face-down or effect-negated', () => {
  assert.deepEqual(evaluateArsenalBug('m2:bug', board(bug({ faceUp: false })),), {
    active: false, reason: 'source-face-down', atk: 2000, def: 2000,
  });
  assert.deepEqual(evaluateArsenalBug('m2:bug', board(bug({ effectNegated: true }))), {
    active: false, reason: 'source-effect-negated', atk: 2000, def: 2000,
  });
});

test('control, not physical ownership, determines Arsenal Bug team counts', () => {
  const field = board(
    bug({ physicalOwnerSeat: 1, controllerSeat: 0 }),
    monster({ uid: 'm2:insect', physicalOwnerSeat: 2, controllerSeat: 2, race: 'Insect' }),
  );
  assert.equal(evaluateArsenalBug('m2:bug', field).atk, 2000);
});

test('shared Monster Field rejects duplicate UIDs and duplicate team slots', () => {
  const valid = board(tiger(), monster({ uid: 'm0:second', controllerSeat: 2, physicalOwnerSeat: 2 }));
  assert.throws(() => validateLegacyMonsterField([valid[0], { ...valid[1], zoneSlot: 0 }]), /slot is occupied/);
  assert.throws(() => validateLegacyMonsterField(board(tiger(), tiger({ uid: 'm0:tiger' }))), /Duplicate physical UID/);
});
