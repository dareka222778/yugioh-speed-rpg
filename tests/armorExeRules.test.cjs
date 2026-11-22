const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ARMOR_EXE_CARD_ID,
  armorExeCanAttack,
  prepareArmorExeStandbyUpkeep,
  recordArmorExeStandbyPhase,
  resolveArmorExeStandbyUpkeep,
  teamOfArmorExeSeat,
  validateArmorExeField,
} = require('../dist/armorExeRules');

const armorExe = (overrides = {}) => ({
  uid: 'm0:armor-exe',
  cardId: ARMOR_EXE_CARD_ID,
  physicalOwnerSeat: 0,
  controllerSeat: 0,
  zone: 'monster',
  zoneSlot: 0,
  faceUp: true,
  spellCounters: 0,
  lastSummonedTurn: 1,
  lastSummonKind: 'normal',
  ...overrides,
});
const fieldCard = (overrides = {}) => ({
  uid: 's0:counter-source',
  cardId: '99999999',
  physicalOwnerSeat: 0,
  controllerSeat: 0,
  zone: 'backrow',
  zoneSlot: 0,
  faceUp: true,
  spellCounters: 1,
  ...overrides,
});
const board = (...cards) => {
  const next = {
    even: { monster: 0, backrow: 0, field: 0 },
    odd: { monster: 0, backrow: 0, field: 0 },
  };
  return cards.map(card => {
    const team = card.controllerSeat % 2 === 0 ? 'even' : 'odd';
    const zoneSlot = card.zone === 'field' ? undefined : next[team][card.zone]++;
    return { ...card, ...(card.zone === 'field' ? { zoneSlot: undefined } : { zoneSlot }) };
  });
};
const phase = (overrides = {}) => ({
  eventId: 'turn-2:standby:even',
  turn: 2,
  activeSeat: 0,
  phase: 'standby',
  sourcePresentAtPhaseStart: true,
  ...overrides,
});

test('maps physical seats to the two shared teams', () => {
  assert.deepEqual([0, 1, 2, 3].map(teamOfArmorExeSeat), ['even', 'odd', 'even', 'odd']);
});

test('Armor Exe cannot attack during the turn it was Normal Summoned', () => {
  assert.equal(armorExeCanAttack(armorExe({ lastSummonKind: 'normal' }), 1), false);
});

test('the same summon-turn restriction applies to Flip and Special Summons', () => {
  assert.equal(armorExeCanAttack(armorExe({ lastSummonKind: 'flip' }), 1), false);
  assert.equal(armorExeCanAttack(armorExe({ lastSummonKind: 'special' }), 1), false);
});

test('Armor Exe may attack on a later turn', () => {
  assert.equal(armorExeCanAttack(armorExe({ lastSummonedTurn: 1 }), 2), true);
});

test('a face-down Armor Exe cannot attack', () => {
  assert.equal(armorExeCanAttack(armorExe({ faceUp: false }), 2), false);
});

test('attack helper rejects a different card identity and fails closed on missing summon history', () => {
  assert.throws(() => armorExeCanAttack(armorExe({ cardId: '12345678' }), 2), /Wrong Armor Exe/);
  assert.throws(() => armorExeCanAttack(armorExe({ lastSummonedTurn: undefined }), 2), /missing its last-summoned turn/);
});

test('Standby upkeep is required in either team turn', () => {
  const even = prepareArmorExeStandbyUpkeep('m0:armor-exe', board(armorExe(), fieldCard()), phase({ activeSeat: 0 }));
  const odd = prepareArmorExeStandbyUpkeep('m0:armor-exe', board(armorExe(), fieldCard()), phase({ eventId: 'turn-3:standby:odd', turn: 3, activeSeat: 1 }));
  assert.equal(even.action, 'remove-counter');
  assert.equal(odd.action, 'remove-counter');
});

test('one counter can be paid from a teammate-owned shared backrow card', () => {
  const field = board(
    armorExe({ physicalOwnerSeat: 2, controllerSeat: 0 }),
    fieldCard({ uid: 's2:team-counter', physicalOwnerSeat: 2, controllerSeat: 2, spellCounters: 3 }),
  );
  const currentPhase = phase();
  const plan = prepareArmorExeStandbyUpkeep('m0:armor-exe', field, currentPhase);
  assert.deepEqual(plan, {
    action: 'remove-counter',
    phaseEventId: currentPhase.eventId,
    sourceUid: 'm0:armor-exe',
    sourcePhysicalOwnerSeat: 2,
    controllerTeam: 'even',
    eligibleCounterUids: ['s2:team-counter'],
  });
  assert.deepEqual(resolveArmorExeStandbyUpkeep('m0:armor-exe', field, currentPhase, plan, 's2:team-counter'), {
    resolved: true,
    action: 'remove-counter',
    sourceUid: 'm0:armor-exe',
    sourcePhysicalOwnerSeat: 2,
    counterUid: 's2:team-counter',
    counterPhysicalOwnerSeat: 2,
    counterControllerSeat: 2,
    remainingCountersOnSelectedCard: 2,
    controllerTeam: 'even',
    phaseEventId: currentPhase.eventId,
  });
  assert.equal(field[1].spellCounters, 3, 'the primitive must not mutate persistent state');
});

test('Armor Exe may pay its own Spell Counter', () => {
  const field = board(armorExe({ spellCounters: 1 }));
  const currentPhase = phase();
  const plan = prepareArmorExeStandbyUpkeep('m0:armor-exe', field, currentPhase);
  const result = resolveArmorExeStandbyUpkeep('m0:armor-exe', field, currentPhase, plan, 'm0:armor-exe');
  assert.equal(result.action, 'remove-counter');
  assert.equal(result.remainingCountersOnSelectedCard, 0);
});

test('a face-up Field Zone card on the controller team may supply the counter', () => {
  const field = board(armorExe(), fieldCard({ uid: 'f0:counter', zone: 'field', zoneSlot: undefined }));
  const plan = prepareArmorExeStandbyUpkeep('m0:armor-exe', field, phase());
  assert.deepEqual(plan.eligibleCounterUids, ['f0:counter']);
  assert.equal(resolveArmorExeStandbyUpkeep('m0:armor-exe', field, phase(), plan, 'f0:counter').action, 'remove-counter');
});

test('no counter on the controller team destroys Armor Exe', () => {
  const field = board(armorExe(), fieldCard({ controllerSeat: 1, physicalOwnerSeat: 1 }));
  const currentPhase = phase();
  const plan = prepareArmorExeStandbyUpkeep('m0:armor-exe', field, currentPhase);
  assert.equal(plan.action, 'destroy');
  assert.equal(resolveArmorExeStandbyUpkeep('m0:armor-exe', field, currentPhase, plan).action, 'destroy');
});

test('face-down counters cannot pay the maintenance requirement', () => {
  const field = board(armorExe(), fieldCard({ faceUp: false, spellCounters: 2 }));
  assert.equal(prepareArmorExeStandbyUpkeep('m0:armor-exe', field, phase()).action, 'destroy');
});

test('a source summoned after the Standby Phase began has no retroactive upkeep', () => {
  const field = board(armorExe(), fieldCard());
  assert.deepEqual(prepareArmorExeStandbyUpkeep('m0:armor-exe', field, phase({ sourcePresentAtPhaseStart: false })), {
    action: 'none', reason: 'source-not-present-at-phase-start', phaseEventId: phase().eventId,
  });
});

test('a face-down Armor Exe has no upkeep while face-down', () => {
  assert.equal(prepareArmorExeStandbyUpkeep('m0:armor-exe', board(armorExe({ faceUp: false }), fieldCard()), phase()).action, 'none');
});

test('a control change moves the maintenance responsibility to the new team', () => {
  const field = board(
    armorExe({ physicalOwnerSeat: 0, controllerSeat: 1 }),
    fieldCard({ uid: 's0:old-team', physicalOwnerSeat: 0, controllerSeat: 0 }),
    fieldCard({ uid: 's1:new-team', physicalOwnerSeat: 3, controllerSeat: 3 }),
  );
  const plan = prepareArmorExeStandbyUpkeep('m0:armor-exe', field, phase());
  assert.deepEqual(plan.eligibleCounterUids, ['s1:new-team']);
  assert.equal(plan.controllerTeam, 'odd');
});

test('a counter on the opposing team cannot be selected', () => {
  const field = board(
    armorExe(),
    fieldCard({ uid: 's1:opponent-counter', physicalOwnerSeat: 1, controllerSeat: 1 }),
  );
  const currentPhase = phase();
  const plan = prepareArmorExeStandbyUpkeep('m0:armor-exe', field, currentPhase);
  assert.equal(plan.action, 'destroy');
  assert.deepEqual(resolveArmorExeStandbyUpkeep('m0:armor-exe', field, currentPhase, plan, 's1:opponent-counter').action, 'destroy');
});

test('if the offered counter leaves the team and none remain, Armor Exe is destroyed', () => {
  const offeredField = board(armorExe(), fieldCard({ uid: 's0:counter' }));
  const plan = prepareArmorExeStandbyUpkeep('m0:armor-exe', offeredField, phase());
  const changedField = board(armorExe(), fieldCard({ uid: 's0:counter', controllerSeat: 1, physicalOwnerSeat: 1 }));
  assert.deepEqual(resolveArmorExeStandbyUpkeep('m0:armor-exe', changedField, phase(), plan, 's0:counter'), {
    resolved: true,
    action: 'destroy',
    sourceUid: 'm0:armor-exe',
    sourcePhysicalOwnerSeat: 0,
    controllerTeam: 'even',
    phaseEventId: phase().eventId,
  });
});

test('a stale plan cannot spend a counter from another Standby Phase', () => {
  const field = board(armorExe(), fieldCard());
  const plan = prepareArmorExeStandbyUpkeep('m0:armor-exe', field, phase());
  assert.deepEqual(resolveArmorExeStandbyUpkeep('m0:armor-exe', field, phase({ eventId: 'turn-3:standby:even', turn: 3 }), plan, 's0:counter-source'), {
    resolved: false, reason: 'stale-plan',
  });
});

test('processed phase IDs prevent duplicate upkeep scheduling', () => {
  const currentPhase = phase();
  assert.deepEqual(prepareArmorExeStandbyUpkeep('m0:armor-exe', board(armorExe(), fieldCard()), currentPhase, [currentPhase.eventId]), {
    action: 'none', reason: 'duplicate-standby-phase', phaseEventId: currentPhase.eventId,
  });
});

test('phase ledger is immutable and idempotent', () => {
  const initial = ['turn-1:standby:odd'];
  const next = recordArmorExeStandbyPhase(initial, 'turn-2:standby:even');
  assert.deepEqual(initial, ['turn-1:standby:odd']);
  assert.deepEqual(next, ['turn-1:standby:odd', 'turn-2:standby:even']);
  assert.equal(recordArmorExeStandbyPhase(next, 'turn-2:standby:even'), next);
});

test('field validation enforces three Monster and three backrow slots per team', () => {
  const valid = board(
    armorExe(),
    armorExe({ uid: 'm0:second', controllerSeat: 2, physicalOwnerSeat: 2 }),
    armorExe({ uid: 'm0:third', controllerSeat: 0 }),
  );
  assert.doesNotThrow(() => validateArmorExeField(valid));
  assert.throws(() => validateArmorExeField([valid[0], { ...valid[1], zoneSlot: 0 }, valid[2]]), /slot is occupied/);
  const validBackrow = board(armorExe(), fieldCard());
  assert.doesNotThrow(() => validateArmorExeField(validBackrow));
});

test('field validation rejects duplicate physical UIDs', () => {
  const field = board(armorExe(), fieldCard({ uid: 'm0:armor-exe' }));
  assert.throws(() => validateArmorExeField(field), /Duplicate physical UID/);
});

test('the primitive preserves physical owner separately from current controller', () => {
  const field = board(
    armorExe({ physicalOwnerSeat: 2, controllerSeat: 0 }),
    fieldCard({ physicalOwnerSeat: 0, controllerSeat: 2 }),
  );
  const plan = prepareArmorExeStandbyUpkeep('m0:armor-exe', field, phase());
  const result = resolveArmorExeStandbyUpkeep('m0:armor-exe', field, phase(), plan, 's0:counter-source');
  assert.equal(result.sourcePhysicalOwnerSeat, 2);
  assert.equal(result.counterPhysicalOwnerSeat, 0);
  assert.equal(result.counterControllerSeat, 2);
});
