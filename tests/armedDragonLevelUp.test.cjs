const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ARMED_DRAGON_IDS,
  teamOfSeat,
  planArmedDragonLevelUp,
  prepareArmedDragonDiscardEffect,
  resolveArmedDragonDiscardEffect,
  canSummonArmedDragonLv7
} = require('../dist/armedDragonLevelUp');

function fieldCard(id, options = {}) {
  return {
    uid: options.uid || `field-${id}`,
    id,
    physicalOwnerSeat: options.physicalOwnerSeat ?? 0,
    controllerTeam: options.controllerTeam ?? 0,
    zone: 'monster',
    faceUp: options.faceUp ?? true,
    negated: options.negated ?? false,
    ...(options.destroyedByBattleTurn === undefined ? {} : { destroyedByBattleTurn: options.destroyedByBattleTurn })
  };
}

function candidate(id, zone = 'deck', options = {}) {
  return {
    uid: options.uid || `candidate-${id}`,
    id,
    physicalOwnerSeat: options.physicalOwnerSeat ?? 0,
    zone
  };
}

function monster(uid, atk, options = {}) {
  return {
    uid,
    id: options.id || '00000001',
    physicalOwnerSeat: options.physicalOwnerSeat ?? 1,
    controllerTeam: options.controllerTeam ?? 1,
    zone: 'monster',
    faceUp: options.faceUp ?? true,
    currentAtk: atk
  };
}

function discarded(atk = 1800, options = {}) {
  return {
    uid: options.uid || 'discard-cost',
    id: options.id || '11111111',
    physicalOwnerSeat: options.physicalOwnerSeat ?? 0,
    zone: 'hand',
    kind: 'monster',
    originalAtk: atk
  };
}

function levelUp(source, phase, options = {}) {
  return planArmedDragonLevelUp({
    sourceCard: source,
    phase,
    turn: options.turn ?? 7,
    effectPlayerSeat: options.effectPlayerSeat ?? 0,
    teamMonsterCount: options.teamMonsterCount ?? 3,
    summonCandidates: options.summonCandidates || [candidate(options.summonId || ARMED_DRAGON_IDS.lv5, options.summonZone || 'deck')],
    selectedSummonUid: options.selectedSummonUid || `candidate-${options.summonId || ARMED_DRAGON_IDS.lv5}`
  });
}

test('Armed Dragon identities preserve the leading zero in LV3', () => {
  assert.deepEqual(ARMED_DRAGON_IDS, {
    lv3: '00980973',
    lv5: '46384672',
    lv7: '73879377'
  });
});

test('2v2 seat mapping keeps seats 0/2 and 1/3 on separate teams', () => {
  assert.equal(teamOfSeat(0), 0);
  assert.equal(teamOfSeat(2), 0);
  assert.equal(teamOfSeat(1), 1);
  assert.equal(teamOfSeat(3), 1);
  assert.equal(teamOfSeat(4), undefined);
  assert.equal(teamOfSeat(-1), undefined);
});

test('LV3 Standby level-up selects LV5 from the active player Deck', () => {
  const source = fieldCard(ARMED_DRAGON_IDS.lv3, { physicalOwnerSeat: 2, uid: 'lv3' });
  const result = levelUp(source, 'standby', { teamMonsterCount: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.value.summonCardId, ARMED_DRAGON_IDS.lv5);
  assert.equal(result.value.summonFrom, 'deck');
  assert.equal(result.value.sourceGraveyardTeam, 0);
  assert.equal(result.value.summonControllerTeam, 0);
  assert.equal(result.value.sourcePhysicalOwnerSeat, 2);
});

test('LV3 can level up from the active player hand as well as the Deck', () => {
  const source = fieldCard(ARMED_DRAGON_IDS.lv3);
  const result = levelUp(source, 'standby', {
    summonZone: 'hand',
    summonCandidates: [candidate(ARMED_DRAGON_IDS.lv5, 'hand')]
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.summonFrom, 'hand');
});

test('LV3 level-up is unavailable outside the Standby Phase', () => {
  const result = levelUp(fieldCard(ARMED_DRAGON_IDS.lv3), 'main1');
  assert.deepEqual(result, { ok: false, reason: 'wrong-level-up-phase' });
});

test('LV3 cannot level up while face-down or negated', () => {
  assert.equal(levelUp(fieldCard(ARMED_DRAGON_IDS.lv3, { faceUp: false }), 'standby').ok, false);
  assert.equal(levelUp(fieldCard(ARMED_DRAGON_IDS.lv3, { negated: true }), 'standby').ok, false);
});

test('LV3 cannot summon a wrong next-level identity', () => {
  const result = levelUp(fieldCard(ARMED_DRAGON_IDS.lv3), 'standby', {
    summonId: ARMED_DRAGON_IDS.lv7,
    summonCandidates: [candidate(ARMED_DRAGON_IDS.lv7)],
    selectedSummonUid: `candidate-${ARMED_DRAGON_IDS.lv7}`
  });
  assert.deepEqual(result, { ok: false, reason: 'wrong-next-level-card' });
});

test('level-up cannot take a private summon candidate from the inactive teammate hand', () => {
  const result = levelUp(fieldCard(ARMED_DRAGON_IDS.lv3), 'standby', {
    summonCandidates: [candidate(ARMED_DRAGON_IDS.lv5, 'hand', { physicalOwnerSeat: 2 })]
  });
  assert.deepEqual(result, { ok: false, reason: 'summon-card-not-in-effect-player-private-zones' });
});

test('level-up rejects a full/invalid shared Monster Zone count', () => {
  const result = levelUp(fieldCard(ARMED_DRAGON_IDS.lv3), 'standby', { teamMonsterCount: 4 });
  assert.deepEqual(result, { ok: false, reason: 'invalid-shared-monster-zone-count' });
});

test('level-up rejects a selected UID not present in the offered private candidates', () => {
  const result = planArmedDragonLevelUp({
    sourceCard: fieldCard(ARMED_DRAGON_IDS.lv3),
    phase: 'standby',
    turn: 7,
    effectPlayerSeat: 0,
    teamMonsterCount: 1,
    summonCandidates: [candidate(ARMED_DRAGON_IDS.lv5)],
    selectedSummonUid: 'forged-uid'
  });
  assert.deepEqual(result, { ok: false, reason: 'selected-summon-not-available' });
});

test('LV5 levels up only in End Phase after destroying a monster by battle this turn', () => {
  const source = fieldCard(ARMED_DRAGON_IDS.lv5, { destroyedByBattleTurn: 7, uid: 'lv5' });
  const result = levelUp(source, 'end', {
    turn: 7,
    summonId: ARMED_DRAGON_IDS.lv7,
    summonCandidates: [candidate(ARMED_DRAGON_IDS.lv7, 'hand')]
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.summonCardId, ARMED_DRAGON_IDS.lv7);
  assert.equal(result.value.phase, 'end');
});

test('LV5 does not level up if its battle-destruction marker belongs to another turn', () => {
  const source = fieldCard(ARMED_DRAGON_IDS.lv5, { destroyedByBattleTurn: 6 });
  const result = levelUp(source, 'end', {
    turn: 7,
    summonId: ARMED_DRAGON_IDS.lv7,
    summonCandidates: [candidate(ARMED_DRAGON_IDS.lv7)]
  });
  assert.deepEqual(result, { ok: false, reason: 'lv5-did-not-destroy-by-battle-this-turn' });
});

test('LV5 level-up is not available in Main Phase even after a battle destruction', () => {
  const source = fieldCard(ARMED_DRAGON_IDS.lv5, { destroyedByBattleTurn: 7 });
  const result = levelUp(source, 'main2', {
    summonId: ARMED_DRAGON_IDS.lv7,
    summonCandidates: [candidate(ARMED_DRAGON_IDS.lv7)]
  });
  assert.deepEqual(result, { ok: false, reason: 'wrong-level-up-phase' });
});

test('level-up rejects duplicate physical UIDs before creating a plan', () => {
  const source = fieldCard(ARMED_DRAGON_IDS.lv3, { uid: 'same' });
  const result = levelUp(source, 'standby', {
    summonCandidates: [candidate(ARMED_DRAGON_IDS.lv5, 'deck', { uid: 'same' })],
    selectedSummonUid: 'same'
  });
  assert.deepEqual(result, { ok: false, reason: 'duplicate-or-invalid-uid' });
});

test('LV5 discard effect requires a face-up, usable source and a Main Phase', () => {
  const base = {
    phase: 'main1',
    effectPlayerSeat: 0,
    discardedMonster: discarded(1800),
    opposingMonstersAtActivation: [monster('target', 1700)],
    selectedTargetUid: 'target'
  };
  assert.equal(prepareArmedDragonDiscardEffect({ ...base, sourceCard: fieldCard(ARMED_DRAGON_IDS.lv5, { faceUp: false }) }).ok, false);
  assert.equal(prepareArmedDragonDiscardEffect({ ...base, sourceCard: fieldCard(ARMED_DRAGON_IDS.lv5, { negated: true }) }).ok, false);
  assert.deepEqual(
    prepareArmedDragonDiscardEffect({ ...base, phase: 'battle', sourceCard: fieldCard(ARMED_DRAGON_IDS.lv5) }),
    { ok: false, reason: 'wrong-ignition-phase' }
  );
});

test('LV5 discard cost must be a monster in the active effect player private hand', () => {
  const base = {
    sourceCard: fieldCard(ARMED_DRAGON_IDS.lv5),
    phase: 'main1',
    effectPlayerSeat: 0,
    opposingMonstersAtActivation: [monster('target', 1700)],
    selectedTargetUid: 'target'
  };
  assert.deepEqual(
    prepareArmedDragonDiscardEffect({ ...base, discardedMonster: { ...discarded(), kind: 'spell' } }),
    { ok: false, reason: 'discard-cost-must-be-monster-in-hand' }
  );
  assert.deepEqual(
    prepareArmedDragonDiscardEffect({ ...base, discardedMonster: discarded(1800, { physicalOwnerSeat: 2 }) }),
    { ok: false, reason: 'discard-cost-not-in-effect-player-private-hand' }
  );
});

test('LV5 discard cost selects one face-up opposing monster at or below discarded ATK', () => {
  const result = prepareArmedDragonDiscardEffect({
    sourceCard: fieldCard(ARMED_DRAGON_IDS.lv5),
    phase: 'main1',
    effectPlayerSeat: 0,
    discardedMonster: discarded(1800),
    opposingMonstersAtActivation: [monster('valid', 1800), monster('too-large', 1801)],
    selectedTargetUid: 'valid'
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.targeting, 'single');
  assert.equal(result.value.selectedTargetUid, 'valid');
  assert.equal(result.value.discardGraveyardTeam, 0);
});

test('LV5 cannot target an ally, a face-down monster, or a monster above the discarded ATK', () => {
  const sourceCard = fieldCard(ARMED_DRAGON_IDS.lv5);
  const common = {
    sourceCard,
    phase: 'main1',
    effectPlayerSeat: 0,
    discardedMonster: discarded(1800)
  };
  assert.equal(prepareArmedDragonDiscardEffect({
    ...common,
    opposingMonstersAtActivation: [monster('ally', 1500, { controllerTeam: 0 })],
    selectedTargetUid: 'ally'
  }).ok, false);
  assert.equal(prepareArmedDragonDiscardEffect({
    ...common,
    opposingMonstersAtActivation: [monster('hidden', 1500, { faceUp: false })],
    selectedTargetUid: 'hidden'
  }).ok, false);
  assert.equal(prepareArmedDragonDiscardEffect({
    ...common,
    opposingMonstersAtActivation: [monster('strong', 1801)],
    selectedTargetUid: 'strong'
  }).ok, false);
});

test('LV5 keeps the discard paid when the targeted monster is no longer eligible at resolution', () => {
  const plan = prepareArmedDragonDiscardEffect({
    sourceCard: fieldCard(ARMED_DRAGON_IDS.lv5),
    phase: 'main2',
    effectPlayerSeat: 0,
    discardedMonster: discarded(1800),
    opposingMonstersAtActivation: [monster('target', 1700)],
    selectedTargetUid: 'target'
  });
  assert.equal(plan.ok, true);
  const resolution = resolveArmedDragonDiscardEffect(plan.value, [
    monster('target', 1700, { faceUp: false })
  ]);
  assert.equal(resolution.ok, true);
  assert.equal(resolution.value.costPaid, true);
  assert.equal(resolution.value.discardedMonsterUid, 'discard-cost');
  assert.deepEqual(resolution.value.destroyed, []);
});

test('LV5 routes a destroyed target to its physical owner team even when controlled by the other team', () => {
  const plan = prepareArmedDragonDiscardEffect({
    sourceCard: fieldCard(ARMED_DRAGON_IDS.lv5),
    phase: 'main1',
    effectPlayerSeat: 0,
    discardedMonster: discarded(1800),
    opposingMonstersAtActivation: [monster('stolen-target', 1700, { physicalOwnerSeat: 3 })],
    selectedTargetUid: 'stolen-target'
  });
  assert.equal(plan.ok, true);
  const resolution = resolveArmedDragonDiscardEffect(plan.value, [
    monster('stolen-target', 1700, { physicalOwnerSeat: 3 })
  ]);
  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.value.destroyed, [{
    uid: 'stolen-target',
    physicalOwnerSeat: 3,
    graveyardTeam: 1
  }]);
});

test('LV7 is non-targeting and destroys every currently eligible opposing face-up monster', () => {
  const plan = prepareArmedDragonDiscardEffect({
    sourceCard: fieldCard(ARMED_DRAGON_IDS.lv7),
    phase: 'main2',
    effectPlayerSeat: 0,
    discardedMonster: discarded(2000),
    opposingMonstersAtActivation: [
      monster('low-a', 1000),
      monster('equal', 2000, { physicalOwnerSeat: 3 }),
      monster('high', 2001),
      monster('hidden', 500, { faceUp: false }),
      monster('ally', 100, { controllerTeam: 0 })
    ]
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.value.targeting, 'all-current');
  assert.equal(plan.value.selectedTargetUid, undefined);
  const resolution = resolveArmedDragonDiscardEffect(plan.value, [
    monster('low-a', 1000),
    monster('equal', 2000, { physicalOwnerSeat: 3 }),
    monster('high', 2001),
    monster('hidden', 500, { faceUp: false }),
    monster('ally', 100, { controllerTeam: 0 })
  ]);
  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.value.destroyed.map(card => card.uid), ['low-a', 'equal']);
  assert.equal(resolution.value.destroyed[1].graveyardTeam, 1);
});

test('LV7 evaluates the live field at resolution rather than locking targets at activation', () => {
  const plan = prepareArmedDragonDiscardEffect({
    sourceCard: fieldCard(ARMED_DRAGON_IDS.lv7),
    phase: 'main1',
    effectPlayerSeat: 0,
    discardedMonster: discarded(1600),
    opposingMonstersAtActivation: []
  });
  assert.equal(plan.ok, true);
  const resolution = resolveArmedDragonDiscardEffect(plan.value, [
    monster('arrived-after-activation', 1500),
    monster('arrived-too-large', 1601)
  ]);
  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.value.destroyed.map(card => card.uid), ['arrived-after-activation']);
});

test('LV7 may resolve with no eligible monsters while retaining its paid discard cost', () => {
  const plan = prepareArmedDragonDiscardEffect({
    sourceCard: fieldCard(ARMED_DRAGON_IDS.lv7),
    phase: 'main1',
    effectPlayerSeat: 0,
    discardedMonster: discarded(1000),
    opposingMonstersAtActivation: []
  });
  assert.equal(plan.ok, true);
  const resolution = resolveArmedDragonDiscardEffect(plan.value, [monster('strong', 2000)]);
  assert.equal(resolution.ok, true);
  assert.equal(resolution.value.costPaid, true);
  assert.deepEqual(resolution.value.destroyed, []);
});

test('LV7 rejects a selected target because its effect does not target', () => {
  const result = prepareArmedDragonDiscardEffect({
    sourceCard: fieldCard(ARMED_DRAGON_IDS.lv7),
    phase: 'main1',
    effectPlayerSeat: 0,
    discardedMonster: discarded(1800),
    opposingMonstersAtActivation: [monster('target', 1000)],
    selectedTargetUid: 'target'
  });
  assert.deepEqual(result, { ok: false, reason: 'lv7-effect-does-not-target' });
});

test('LV7 cannot be Normal Summoned, Set, or Special Summoned by another method', () => {
  assert.equal(canSummonArmedDragonLv7('normal'), false);
  assert.equal(canSummonArmedDragonLv7('set'), false);
  assert.equal(canSummonArmedDragonLv7('other-special'), false);
  assert.equal(canSummonArmedDragonLv7('armed-dragon-lv5'), true);
});

test('discard effect rejects duplicate UIDs across source, cost and field', () => {
  const result = prepareArmedDragonDiscardEffect({
    sourceCard: fieldCard(ARMED_DRAGON_IDS.lv5, { uid: 'collision' }),
    phase: 'main1',
    effectPlayerSeat: 0,
    discardedMonster: discarded(1800, { uid: 'collision' }),
    opposingMonstersAtActivation: [monster('target', 1000)],
    selectedTargetUid: 'target'
  });
  assert.deepEqual(result, { ok: false, reason: 'duplicate-or-invalid-uid' });
});

test('resolution rejects duplicate current physical UIDs instead of destroying twice', () => {
  const plan = prepareArmedDragonDiscardEffect({
    sourceCard: fieldCard(ARMED_DRAGON_IDS.lv7),
    phase: 'main1',
    effectPlayerSeat: 0,
    discardedMonster: discarded(2000),
    opposingMonstersAtActivation: []
  });
  assert.equal(plan.ok, true);
  const resolution = resolveArmedDragonDiscardEffect(plan.value, [
    monster('duplicate', 1000),
    monster('duplicate', 1200)
  ]);
  assert.deepEqual(resolution, { ok: false, reason: 'duplicate-or-invalid-current-monster-uid' });
});

test('effect source must belong to the resolving team and use one of four valid seats', () => {
  const wrongTeam = prepareArmedDragonDiscardEffect({
    sourceCard: fieldCard(ARMED_DRAGON_IDS.lv5, { controllerTeam: 1 }),
    phase: 'main1',
    effectPlayerSeat: 0,
    discardedMonster: discarded(),
    opposingMonstersAtActivation: [monster('target', 1000)],
    selectedTargetUid: 'target'
  });
  assert.deepEqual(wrongTeam, { ok: false, reason: 'source-not-controlled-by-effect-team' });
});
