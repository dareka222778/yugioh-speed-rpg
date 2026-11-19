'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ABSORBING_KID_FROM_THE_SKY_ID,
  AIRKNIGHT_PARSHATH_ID,
  ASWAN_APPARITION_ID,
  battleDamageInflictedBy,
  airknightParshathDrawReward,
  aswanApparitionTrapCandidates,
  resolveAswanApparitionTrapSelection,
  absorbingKidBattleHealReward,
} = require('../dist/battleDamageRewards.js');

const IDs = {
  trapA: 'fixture-trap-a',
  trapB: 'fixture-trap-b',
  monster: 'fixture-monster',
  spell: 'fixture-spell',
};
const metadata = new Map([
  [IDs.trapA, { id: IDs.trapA, kind: 'trap' }],
  [IDs.trapB, { id: IDs.trapB, kind: 'trap' }],
  [IDs.monster, { id: IDs.monster, kind: 'monster' }],
  [IDs.spell, { id: IDs.spell, kind: 'spell' }],
]);
const lookup = id => metadata.get(id);
const ref = (uid, id, extra = {}) => ({ uid, id, ...extra });

function snapshot(overrides = {}) {
  return {
    attackerUid: 'm0:attacker',
    attackerTeam: 0,
    defenderUid: 'm1:defender',
    defenderTeam: 1,
    damageToTeams: [0, 700],
    destroyedUids: [],
    battleDestroyedUids: [],
    sentToGraveUids: [],
    ...overrides,
  };
}

test('battle damage is attributed to the surviving attacker team opponent', () => {
  const event = snapshot();
  assert.equal(battleDamageInflictedBy(event, 'm0:attacker'), 700);
  assert.equal(battleDamageInflictedBy(event, 'm1:defender'), 0);
});

test('a surviving defender can inflict battle damage when the attacker loses', () => {
  const event = snapshot({
    damageToTeams: [500, 0],
    destroyedUids: ['m0:attacker'],
    battleDestroyedUids: ['m0:attacker'],
    sentToGraveUids: ['m0:attacker'],
  });
  assert.equal(battleDamageInflictedBy(event, 'm1:defender'), 500);
  assert.equal(battleDamageInflictedBy(event, 'm0:attacker'), 0);
});

test('direct battle damage is attributed to the attacker when no defender exists', () => {
  const event = snapshot({
    defenderUid: undefined,
    defenderTeam: undefined,
    damageToTeams: [0, 1800],
  });
  assert.equal(battleDamageInflictedBy(event, 'm0:attacker'), 1800);
});

test('zero battle damage never opens a battle-damage reward', () => {
  assert.equal(battleDamageInflictedBy(snapshot({ damageToTeams: [0, 0] }), 'm0:attacker'), 0);
});

test('a participant destroyed or removed in the same battle cannot receive a damage trigger', () => {
  const event = snapshot({
    destroyedUids: ['m0:attacker'],
    battleDestroyedUids: ['m0:attacker'],
    sentToGraveUids: ['m0:attacker'],
  });
  assert.equal(battleDamageInflictedBy(event, 'm0:attacker'), 0);
});

test('non-participants cannot claim another monster battle damage', () => {
  assert.equal(battleDamageInflictedBy(snapshot(), 'm2:forged'), 0);
});

test('malformed damage totals and same-team combatants fail closed', () => {
  assert.throws(() => battleDamageInflictedBy(snapshot({ damageToTeams: [-1, 0] }), 'm0:attacker'), /non-negative/);
  assert.throws(() => battleDamageInflictedBy(snapshot({ defenderTeam: 0 }), 'm0:attacker'), /defender identity/);
});

test('Airknight Parshath draws one card only when its own battle damage is positive', () => {
  const reward = airknightParshathDrawReward(snapshot(), 'm0:attacker', AIRKNIGHT_PARSHATH_ID);
  assert.deepEqual(reward, { drawCount: 1, battleDamage: 700 });
});

test('Airknight Parshath does not trigger from effect damage or another card identity', () => {
  assert.equal(airknightParshathDrawReward(snapshot({ damageToTeams: [0, 0] }), 'm0:attacker', AIRKNIGHT_PARSHATH_ID), null);
  assert.equal(airknightParshathDrawReward(snapshot(), 'm0:attacker', 'not-airknight'), null);
});

test('Aswan Apparition exposes only Trap cards from the supplied shared Graveyard', () => {
  const trapA = ref('m0:trap-a', IDs.trapA, { physicalOwner: 0 });
  const trapB = ref('m2:trap-b', IDs.trapB, { physicalOwner: 2 });
  const grave = [
    trapA,
    ref('m0:monster', IDs.monster),
    trapB,
    ref('m2:spell', IDs.spell),
    ref('m2:token', IDs.trapA, { entityKind: 'token' }),
  ];
  const candidates = aswanApparitionTrapCandidates(
    snapshot(), 'm0:attacker', ASWAN_APPARITION_ID, grave, lookup,
  );
  assert.deepEqual(candidates, [trapA, trapB]);
  assert.equal(candidates[0], trapA);
  assert.equal(candidates[1], trapB);
});

test('Aswan Apparition cannot inspect a private or unrelated Graveyard without battle damage', () => {
  const grave = [ref('m0:trap', IDs.trapA)];
  assert.deepEqual(
    aswanApparitionTrapCandidates(
      snapshot({ damageToTeams: [0, 0] }), 'm0:attacker', ASWAN_APPARITION_ID, grave, lookup,
    ),
    [],
  );
  assert.deepEqual(
    aswanApparitionTrapCandidates(snapshot(), 'm0:attacker', 'not-aswan', grave, lookup),
    [],
  );
});

test('Aswan optional selection returns the exact physical Trap reference', () => {
  const selected = ref('m2:trap', IDs.trapA, { physicalOwner: 2, marker: 'keep-identity' });
  const grave = [selected, ref('m0:other-trap', IDs.trapB)];
  const result = resolveAswanApparitionTrapSelection(
    snapshot(), 'm0:attacker', ASWAN_APPARITION_ID, grave, selected.uid, lookup,
  );
  assert.equal(result, selected);
  assert.equal(result.marker, 'keep-identity');
  assert.equal(result.physicalOwner, 2);
});

test('Aswan rejects stale/forged selections and allows the optional effect to be declined', () => {
  const selected = ref('m2:trap', IDs.trapA);
  const grave = [selected];
  assert.equal(resolveAswanApparitionTrapSelection(
    snapshot(), 'm0:attacker', ASWAN_APPARITION_ID, grave, 'm9:forged', lookup,
  ), null);
  assert.equal(resolveAswanApparitionTrapSelection(
    snapshot(), 'm0:attacker', ASWAN_APPARITION_ID, grave, null, lookup,
  ), null);
  grave.splice(0, 1);
  assert.equal(resolveAswanApparitionTrapSelection(
    snapshot(), 'm0:attacker', ASWAN_APPARITION_ID, grave, selected.uid, lookup,
  ), null);
});

test('Aswan discovery never mutates the shared Graveyard', () => {
  const grave = [ref('m0:trap', IDs.trapA), ref('m2:trap', IDs.trapB)];
  const before = [...grave];
  aswanApparitionTrapCandidates(snapshot(), 'm0:attacker', ASWAN_APPARITION_ID, grave, lookup);
  assert.deepEqual(grave, before);
  assert.equal(grave[0], before[0]);
});

test('duplicate physical UIDs in the shared Graveyard are rejected', () => {
  assert.throws(() => aswanApparitionTrapCandidates(
    snapshot(), 'm0:attacker', ASWAN_APPARITION_ID,
    [ref('m0:duplicate', IDs.trapA), ref('m0:duplicate', IDs.trapB)], lookup,
  ), /duplicate physical UID/);
});

test('Absorbing Kid heals its own team by 300 times the destroyed monster original Level', () => {
  const event = snapshot({
    destroyedUids: ['m1:defender'],
    battleDestroyedUids: ['m1:defender'],
    sentToGraveUids: ['m1:defender'],
  });
  assert.deepEqual(
    absorbingKidBattleHealReward(
      event, 'm0:attacker', ABSORBING_KID_FROM_THE_SKY_ID, 'm1:defender', 7,
    ),
    { team: 0, amount: 2100, destroyedUid: 'm1:defender' },
  );
});

test('Absorbing Kid uses the destroyed target Level, not its own Level', () => {
  const event = snapshot({
    destroyedUids: ['m1:defender'],
    battleDestroyedUids: ['m1:defender'],
    sentToGraveUids: ['m1:defender'],
  });
  const reward = absorbingKidBattleHealReward(
    event, 'm0:attacker', ABSORBING_KID_FROM_THE_SKY_ID, 'm1:defender', 2,
  );
  assert.equal(reward.amount, 600);
});

test('Absorbing Kid does not trigger for effect destruction or a non-Graveyard destination', () => {
  const effectDestroyed = snapshot({
    destroyedUids: ['m1:defender'],
    sentToGraveUids: ['m1:defender'],
  });
  const banished = snapshot({
    destroyedUids: ['m1:defender'],
    battleDestroyedUids: ['m1:defender'],
    banishedUids: ['m1:defender'],
  });
  assert.equal(absorbingKidBattleHealReward(
    effectDestroyed, 'm0:attacker', ABSORBING_KID_FROM_THE_SKY_ID, 'm1:defender', 4,
  ), null);
  assert.equal(absorbingKidBattleHealReward(
    banished, 'm0:attacker', ABSORBING_KID_FROM_THE_SKY_ID, 'm1:defender', 4,
  ), null);
});

test('Absorbing Kid ignores tokens and simultaneous source destruction; malformed same-team battles fail closed', () => {
  const token = snapshot({
    destroyedUids: ['m1:defender'],
    battleDestroyedUids: ['m1:defender'],
    sentToGraveUids: ['m1:defender'],
    tokenUids: ['m1:defender'],
  });
  const allied = snapshot({
    attackerTeam: 0,
    defenderTeam: 0,
    destroyedUids: ['m1:defender'],
    battleDestroyedUids: ['m1:defender'],
    sentToGraveUids: ['m1:defender'],
  });
  const sourceDestroyed = snapshot({
    destroyedUids: ['m0:attacker', 'm1:defender'],
    battleDestroyedUids: ['m0:attacker', 'm1:defender'],
    sentToGraveUids: ['m0:attacker', 'm1:defender'],
  });
  assert.equal(absorbingKidBattleHealReward(
    token, 'm0:attacker', ABSORBING_KID_FROM_THE_SKY_ID, 'm1:defender', 4,
  ), null);
  assert.throws(() => absorbingKidBattleHealReward(
    allied, 'm0:attacker', ABSORBING_KID_FROM_THE_SKY_ID, 'm1:defender', 4,
  ), /defender identity\/team/);
  assert.equal(absorbingKidBattleHealReward(
    sourceDestroyed, 'm0:attacker', ABSORBING_KID_FROM_THE_SKY_ID, 'm1:defender', 4,
  ), null);
});

test('Absorbing Kid rejects forged target UIDs and invalid original Levels', () => {
  const event = snapshot({
    destroyedUids: ['m1:defender'],
    battleDestroyedUids: ['m1:defender'],
    sentToGraveUids: ['m1:defender'],
  });
  assert.equal(absorbingKidBattleHealReward(
    event, 'm0:attacker', ABSORBING_KID_FROM_THE_SKY_ID, 'm9:forged', 4,
  ), null);
  for (const level of [0, 13, 1.5, NaN]) {
    assert.throws(() => absorbingKidBattleHealReward(
      event, 'm0:attacker', ABSORBING_KID_FROM_THE_SKY_ID, 'm1:defender', level,
    ), /original Level/);
  }
});

test('a card that is not the registered reward source cannot borrow Absorbing Kid logic', () => {
  const event = snapshot({
    destroyedUids: ['m1:defender'],
    battleDestroyedUids: ['m1:defender'],
    sentToGraveUids: ['m1:defender'],
  });
  assert.equal(absorbingKidBattleHealReward(
    event, 'm0:attacker', 'not-absorbing-kid', 'm1:defender', 4,
  ), null);
});
