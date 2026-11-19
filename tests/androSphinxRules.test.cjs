const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ANDRO_SPHINX_CARD_ID,
  PYRAMID_OF_LIGHT_CARD_ID,
  planAndroSphinxSpecialSummon,
  resolveAndroSphinxSpecialSummon,
  canAndroSphinxAttack,
  resolveAndroSphinxBattleDamage,
  teamOfAndroSphinxSeat,
} = require('../dist/androSphinxRules.js');

const handCard = (uid='andro-hand', seat=0) => ({
  uid, cardId: ANDRO_SPHINX_CARD_ID, physicalOwnerSeat: seat, kind: 'monster', atk: 3000,
});
const pyramid = (uid='pyramid', controller=2, faceUp=true) => ({
  uid, cardId: PYRAMID_OF_LIGHT_CARD_ID, physicalOwnerSeat: 0, controllerSeat: controller,
  zone: 'field', faceUp,
});
const monster = (uid, controller=0, slot=0, overrides={}) => ({
  uid, cardId: '00000001', physicalOwnerSeat: controller, controllerSeat: controller,
  zone: 'monster', zoneSlot: slot, faceUp: true, position: 'attack', atk: 1000, ...overrides,
});
const basePlanInput = () => ({
  activeSeat: 0, teamLP: 8000, sourceUid: 'andro-hand',
  hand: [handCard()], field: [pyramid()],
});

test('team seats map to the two shared teams', () => {
  assert.equal(teamOfAndroSphinxSeat(0), 'even');
  assert.equal(teamOfAndroSphinxSeat(2), 'even');
  assert.equal(teamOfAndroSphinxSeat(1), 'odd');
  assert.equal(teamOfAndroSphinxSeat(3), 'odd');
});

test('Andro Sphinx can be planned from the active physical hand with teammate-controlled Pyramid', () => {
  const result = planAndroSphinxSpecialSummon(basePlanInput());
  assert.equal(result.allowed, true);
  assert.equal(result.plan.team, 'even');
  assert.equal(result.plan.pyramidUid, 'pyramid');
  assert.equal(result.plan.monsterZoneSlot, 0);
  assert.equal(result.plan.lpCost, 500);
});

test('the 500 LP cost cannot be paid when it would leave the team at zero', () => {
  const result = planAndroSphinxSpecialSummon({ ...basePlanInput(), teamLP: 500 });
  assert.deepEqual(result, { allowed: false, reason: 'insufficient-team-lp' });
});

test('the 500 LP cost is paid from the shared team pool', () => {
  const result = planAndroSphinxSpecialSummon({ ...basePlanInput(), teamLP: 501 });
  assert.equal(result.allowed, true);
  const resolved = resolveAndroSphinxSpecialSummon({
    plan: result.plan, activeSeat: 0, teamLP: 501, turn: 4, position: 'attack',
    hand: [handCard()], field: [pyramid()],
  });
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.remainingTeamLP, 1);
});

test('Pyramid of Light must be face-up on the active team field', () => {
  assert.deepEqual(
    planAndroSphinxSpecialSummon({ ...basePlanInput(), field: [pyramid('pyramid', 2, false)] }),
    { allowed: false, reason: 'pyramid-not-face-up-for-team' },
  );
});

test('an opponent-controlled Pyramid does not enable the summon', () => {
  assert.deepEqual(
    planAndroSphinxSpecialSummon({ ...basePlanInput(), field: [pyramid('enemy-pyramid', 1, true)] }),
    { allowed: false, reason: 'pyramid-not-face-up-for-team' },
  );
});

test('a teammate-owned but team-controlled Pyramid enables the summon', () => {
  const result = planAndroSphinxSpecialSummon({
    ...basePlanInput(),
    field: [{ ...pyramid(), physicalOwnerSeat: 2, controllerSeat: 0 }],
  });
  assert.equal(result.allowed, true);
});

test('the partner private hand is never read for the summon source', () => {
  assert.throws(() => planAndroSphinxSpecialSummon({
    ...basePlanInput(), hand: [handCard('partner-andro', 2)],
  }), /Partner private hand/);
});

test('a card in the Graveyard or Deck is not treated as a hand summon source', () => {
  assert.deepEqual(
    planAndroSphinxSpecialSummon({ ...basePlanInput(), hand: [] }),
    { allowed: false, reason: 'source-not-in-active-hand' },
  );
});

test('a full three-slot shared Monster Zone blocks the summon', () => {
  const field = [pyramid(), monster('m0', 0, 0), monster('m1', 2, 1), monster('m2', 0, 2)];
  assert.deepEqual(
    planAndroSphinxSpecialSummon({ ...basePlanInput(), field }),
    { allowed: false, reason: 'monster-zone-full' },
  );
});

test('resolution preserves physical owner, shared controller and chosen position', () => {
  const planned = planAndroSphinxSpecialSummon(basePlanInput());
  assert.equal(planned.allowed, true);
  const result = resolveAndroSphinxSpecialSummon({
    plan: planned.plan, activeSeat: 0, teamLP: 8000, turn: 7, position: 'defense',
    hand: [handCard()], field: [pyramid()],
  });
  assert.equal(result.resolved, true);
  assert.deepEqual(result.hand, []);
  assert.equal(result.field.at(-1).uid, 'andro-hand');
  assert.equal(result.physicalOwnerSeat, 0);
  assert.equal(result.controllerSeat, 0);
  assert.equal(result.monsterZoneSlot, 0);
  assert.equal(result.position, 'defense');
  assert.equal(result.summonedTurn, 7);
});

test('a teammate-owned source cannot be borrowed from the partner private hand', () => {
  assert.throws(() => planAndroSphinxSpecialSummon({
    ...basePlanInput(), activeSeat: 0, hand: [handCard('partner-andro', 2)], sourceUid: 'partner-andro',
  }), /Partner private hand/);
});

test('resolution fails closed if Pyramid leaves or turns face-down', () => {
  const planned = planAndroSphinxSpecialSummon(basePlanInput());
  assert.equal(planned.allowed, true);
  const result = resolveAndroSphinxSpecialSummon({
    plan: planned.plan, activeSeat: 0, teamLP: 8000, turn: 1, position: 'attack',
    hand: [handCard()], field: [pyramid('pyramid', 2, false)],
  });
  assert.deepEqual(result, { resolved: false, reason: 'pyramid-not-face-up-for-team' });
});

test('resolution fails closed when the reserved Monster Zone slot becomes occupied', () => {
  const planned = planAndroSphinxSpecialSummon(basePlanInput());
  assert.equal(planned.allowed, true);
  const result = resolveAndroSphinxSpecialSummon({
    plan: planned.plan, activeSeat: 0, teamLP: 8000, turn: 1, position: 'attack',
    hand: [handCard()], field: [pyramid(), monster('new-occupant', 0, 0)],
  });
  assert.deepEqual(result, { resolved: false, reason: 'stale-plan' });
});

test('resolution rechecks the shared LP pool before paying the cost', () => {
  const planned = planAndroSphinxSpecialSummon(basePlanInput());
  assert.equal(planned.allowed, true);
  const result = resolveAndroSphinxSpecialSummon({
    plan: planned.plan, activeSeat: 0, teamLP: 500, turn: 1, position: 'attack',
    hand: [handCard()], field: [pyramid()],
  });
  assert.deepEqual(result, { resolved: false, reason: 'insufficient-team-lp' });
});

test('the summoned Andro Sphinx cannot attack in the turn it was Special Summoned', () => {
  const card = { uid: 'andro', cardId: ANDRO_SPHINX_CARD_ID, physicalOwnerSeat: 0, controllerSeat: 0,
    zone: 'monster', zoneSlot: 0, faceUp: true, position: 'attack', lastNormalOrSpecialSummonTurn: 3 };
  assert.equal(canAndroSphinxAttack(card, 3), false);
  assert.equal(canAndroSphinxAttack(card, 4), true);
});

test('Andro Sphinx cannot attack while face-down or in Defense Position', () => {
  const base = { uid: 'andro', cardId: ANDRO_SPHINX_CARD_ID, physicalOwnerSeat: 0, controllerSeat: 0,
    zone: 'monster', zoneSlot: 0, lastNormalOrSpecialSummonTurn: 1 };
  assert.equal(canAndroSphinxAttack({ ...base, faceUp: false, position: 'attack' }, 2), false);
  assert.equal(canAndroSphinxAttack({ ...base, faceUp: true, position: 'defense' }, 2), false);
});

const battleEvent = (overrides={}) => ({
  eventId: 'battle-1', sourceUid: 'andro', sourceCardId: ANDRO_SPHINX_CARD_ID,
  sourcePhysicalOwnerSeat: 2, sourceControllerSeat: 0, sourceEffectNegated: false,
  destroyedUid: 'defender', destroyedBySourceUid: 'andro', destroyedPhysicalOwnerSeat: 3,
  destroyedControllerSeat: 1, destroyedPosition: 'defense', destroyedMonsterAtk: 2401,
  result: 'destroyed', byBattle: true, ...overrides,
});

test('destroying a Defense Position monster inflicts half its ATK, rounded down, to the opposing team', () => {
  const result = resolveAndroSphinxBattleDamage(battleEvent());
  assert.equal(result.applied, true);
  assert.equal(result.damage, 1200);
  assert.equal(result.damagedTeam, 'odd');
  assert.equal(result.sourcePhysicalOwnerSeat, 2);
  assert.equal(result.sourceControllerSeat, 0);
  assert.equal(result.destroyedPhysicalOwnerSeat, 3);
});

test('a face-down defender is represented by its revealed Damage Step ATK snapshot', () => {
  const result = resolveAndroSphinxBattleDamage(battleEvent({ destroyedMonsterAtk: 1800 }));
  assert.equal(result.applied, true);
  assert.equal(result.damage, 900);
});

test('destroying an Attack Position monster does not inflict the burn', () => {
  assert.deepEqual(
    resolveAndroSphinxBattleDamage(battleEvent({ destroyedPosition: 'attack' })),
    { applied: false, reason: 'not-defense-position' },
  );
});

test('a monster controlled by the same team cannot be the burn recipient', () => {
  assert.deepEqual(
    resolveAndroSphinxBattleDamage(battleEvent({ destroyedControllerSeat: 2 })),
    { applied: false, reason: 'not-opponent-team' },
  );
});

test('the burn requires destruction by battle and by this exact source UID', () => {
  assert.deepEqual(
    resolveAndroSphinxBattleDamage(battleEvent({ byBattle: false })),
    { applied: false, reason: 'not-battle-destruction' },
  );
  assert.deepEqual(
    resolveAndroSphinxBattleDamage(battleEvent({ destroyedBySourceUid: 'other-source' })),
    { applied: false, reason: 'not-battle-destruction' },
  );
});

test('the burn does not apply if the monster survived battle', () => {
  assert.deepEqual(
    resolveAndroSphinxBattleDamage(battleEvent({ result: 'survived' })),
    { applied: false, reason: 'not-battle-destruction' },
  );
});

test('negated Andro Sphinx does not apply its battle damage effect', () => {
  assert.deepEqual(
    resolveAndroSphinxBattleDamage(battleEvent({ sourceEffectNegated: true })),
    { applied: false, reason: 'source-effect-negated' },
  );
});

test('the same battle event cannot inflict damage twice', () => {
  assert.deepEqual(
    resolveAndroSphinxBattleDamage(battleEvent(), ['battle-1']),
    { applied: false, reason: 'duplicate-event' },
  );
});

test('a different battle event remains independently resolvable', () => {
  const first = resolveAndroSphinxBattleDamage(battleEvent());
  assert.equal(first.applied, true);
  const second = resolveAndroSphinxBattleDamage(battleEvent({ eventId: 'battle-2' }), first.processedEventIds);
  assert.equal(second.applied, true);
  assert.deepEqual(second.processedEventIds, ['battle-1', 'battle-2']);
});
