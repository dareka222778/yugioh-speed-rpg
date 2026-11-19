const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ANCIENT_LAMP_CARD_ID,
  LA_JINN_CARD_ID,
  planAncientLampLaJinnSummon,
  resolveAncientLampLaJinnSummon,
  planAncientLampAttackRedirect,
  resolveAncientLampAttackRedirect,
  teamOfAncientLampSeat,
} = require('../dist/ancientLampRules.js');

const lamp = (uid='lamp', owner=0, controller=0, overrides={}) => ({
  uid, cardId: ANCIENT_LAMP_CARD_ID, physicalOwnerSeat: owner, controllerSeat: controller,
  zone: 'monster', zoneSlot: 0, faceUp: true, position: 'attack', ...overrides,
});
const laJinn = (uid='la-jinn', seat=0) => ({
  uid, cardId: LA_JINN_CARD_ID, physicalOwnerSeat: seat, kind: 'monster',
});
const monster = (uid, controller, slot, faceUp=true, cardId='00000001') => ({
  uid, ...(faceUp ? { cardId } : {}), physicalOwnerSeat: controller, controllerSeat: controller,
  zone: 'monster', zoneSlot: slot, faceUp, position: 'attack',
});
const summonInput = () => ({
  phase: 'main', activeSeat: 0, sourceUid: 'lamp', laJinnUid: 'la-jinn',
  hand: [laJinn()], field: [lamp()],
});
const attackSnapshot = (overrides={}) => ({
  eventId: 'attack-1', timing: 'before-damage-calculation', attackerUid: 'attacker',
  attackerControllerSeat: 1, currentTargetUid: 'lamp', ancientLampUid: 'lamp',
  ancientLampControllerSeat: 0, wasFaceDownAtDamageStepStart: true, ...overrides,
});

test('team seats map to the two shared fields', () => {
  assert.equal(teamOfAncientLampSeat(0), 'even');
  assert.equal(teamOfAncientLampSeat(2), 'even');
  assert.equal(teamOfAncientLampSeat(1), 'odd');
  assert.equal(teamOfAncientLampSeat(3), 'odd');
});

test('face-up Ancient Lamp can Special Summon La Jinn from the active physical hand', () => {
  const result = planAncientLampLaJinnSummon(summonInput());
  assert.equal(result.allowed, true);
  assert.equal(result.plan.team, 'even');
  assert.equal(result.plan.monsterZoneSlot, 1);
});

test('Ancient Lamp cannot activate the La Jinn effect outside Main Phase', () => {
  assert.deepEqual(
    planAncientLampLaJinnSummon({ ...summonInput(), phase: 'battle' }),
    { allowed: false, reason: 'wrong-phase' },
  );
});

test('Ancient Lamp must be face-up to activate its La Jinn effect', () => {
  assert.deepEqual(
    planAncientLampLaJinnSummon({ ...summonInput(), field: [lamp('lamp', 0, 0, { faceUp: false, cardId: undefined })] }),
    { allowed: false, reason: 'source-not-face-up' },
  );
});

test('Ancient Lamp must be controlled by the active team', () => {
  assert.deepEqual(
    planAncientLampLaJinnSummon({ ...summonInput(), field: [lamp('lamp', 1, 1)] }),
    { allowed: false, reason: 'source-not-controlled-by-team' },
  );
});

test('a negated Ancient Lamp cannot activate the La Jinn effect', () => {
  assert.deepEqual(
    planAncientLampLaJinnSummon({ ...summonInput(), field: [lamp('lamp', 0, 0, { effectNegated: true })] }),
    { allowed: false, reason: 'source-effect-negated' },
  );
});

test('La Jinn in the partner private hand is not accessible', () => {
  assert.throws(() => planAncientLampLaJinnSummon({
    ...summonInput(), hand: [laJinn('partner-la-jinn', 2)], laJinnUid: 'partner-la-jinn',
  }), /Partner private hand/);
});

test('La Jinn must be in the active physical hand', () => {
  assert.deepEqual(
    planAncientLampLaJinnSummon({ ...summonInput(), hand: [] }),
    { allowed: false, reason: 'la-jinn-not-in-active-hand' },
  );
});

test('a full three-slot shared Monster Zone blocks the summon', () => {
  const field = [lamp(), monster('m1', 0, 1), monster('m2', 2, 2)];
  assert.deepEqual(
    planAncientLampLaJinnSummon({ ...summonInput(), field }),
    { allowed: false, reason: 'monster-zone-full' },
  );
});

test('La Jinn summon preserves physical owner and shared controller', () => {
  const planned = planAncientLampLaJinnSummon(summonInput());
  assert.equal(planned.allowed, true);
  const result = resolveAncientLampLaJinnSummon({
    plan: planned.plan, phase: 'main', activeSeat: 0, position: 'defense',
    hand: [laJinn()], field: [lamp('lamp', 2, 0)],
  });
  assert.equal(result.resolved, true);
  assert.deepEqual(result.hand, []);
  assert.equal(result.summonedUid, 'la-jinn');
  assert.equal(result.physicalOwnerSeat, 0);
  assert.equal(result.controllerSeat, 0);
  assert.equal(result.position, 'defense');
});

test('resolution fails if Ancient Lamp is no longer face-up', () => {
  const planned = planAncientLampLaJinnSummon(summonInput());
  assert.equal(planned.allowed, true);
  const result = resolveAncientLampLaJinnSummon({
    plan: planned.plan, phase: 'main', activeSeat: 0, position: 'attack', hand: [laJinn()],
    field: [lamp('lamp', 0, 0, { faceUp: false, cardId: undefined })],
  });
  assert.deepEqual(result, { resolved: false, reason: 'source-not-face-up' });
});

test('resolution fails if Ancient Lamp becomes negated', () => {
  const planned = planAncientLampLaJinnSummon(summonInput());
  assert.equal(planned.allowed, true);
  const result = resolveAncientLampLaJinnSummon({
    plan: planned.plan, phase: 'main', activeSeat: 0, position: 'attack', hand: [laJinn()],
    field: [lamp('lamp', 0, 0, { effectNegated: true })],
  });
  assert.deepEqual(result, { resolved: false, reason: 'source-effect-negated' });
});

test('resolution fails if La Jinn leaves the active hand', () => {
  const planned = planAncientLampLaJinnSummon(summonInput());
  assert.equal(planned.allowed, true);
  const result = resolveAncientLampLaJinnSummon({
    plan: planned.plan, phase: 'main', activeSeat: 0, position: 'attack', hand: [],
    field: [lamp()],
  });
  assert.deepEqual(result, { resolved: false, reason: 'la-jinn-not-in-active-hand' });
});

test('resolution fails if the planned shared Monster Zone slot becomes occupied', () => {
  const planned = planAncientLampLaJinnSummon(summonInput());
  assert.equal(planned.allowed, true);
  const result = resolveAncientLampLaJinnSummon({
    plan: planned.plan, phase: 'main', activeSeat: 0, position: 'attack', hand: [laJinn()],
    field: [lamp(), monster('new-monster', 2, 1)],
  });
  assert.deepEqual(result, { resolved: false, reason: 'stale-plan' });
});

test('a face-down target can be selected without exposing its card identity', () => {
  const field = [lamp(), monster('attacker', 1, 0), monster('hidden-target', 1, 1, false)];
  const planned = planAncientLampAttackRedirect({
    attack: attackSnapshot(), selectedTargetUid: 'hidden-target', field,
  });
  assert.equal(planned.allowed, true);
  assert.deepEqual(planned.plan, {
    eventId: 'attack-1', attackerUid: 'attacker', attackerTeam: 'odd',
    ancientLampUid: 'lamp', targetUid: 'hidden-target',
  });
  assert.equal(JSON.stringify(planned).includes('cardId'), false);
});

test('redirection only activates before Damage Calculation', () => {
  const field = [lamp(), monster('attacker', 1, 0), monster('target', 1, 1)];
  assert.deepEqual(
    planAncientLampAttackRedirect({
      attack: attackSnapshot({ timing: 'damage-calculation' }), selectedTargetUid: 'target', field,
    }),
    { allowed: false, reason: 'wrong-timing' },
  );
});

test('the attack must currently be targeting Ancient Lamp', () => {
  const field = [lamp(), monster('attacker', 1, 0), monster('target', 1, 1)];
  assert.deepEqual(
    planAncientLampAttackRedirect({
      attack: attackSnapshot({ currentTargetUid: 'other' }), selectedTargetUid: 'target', field,
    }),
    { allowed: false, reason: 'lamp-not-current-target' },
  );
});

test('Ancient Lamp must have been face-down at the start of the Damage Step', () => {
  const field = [lamp(), monster('attacker', 1, 0), monster('target', 1, 1)];
  assert.deepEqual(
    planAncientLampAttackRedirect({
      attack: attackSnapshot({ wasFaceDownAtDamageStepStart: false }), selectedTargetUid: 'target', field,
    }),
    { allowed: false, reason: 'lamp-was-not-face-down-at-damage-step-start' },
  );
});

test('the attacker must belong to the opposing team', () => {
  const field = [lamp(), monster('attacker', 0, 1), monster('target', 0, 2)];
  assert.deepEqual(
    planAncientLampAttackRedirect({
      attack: attackSnapshot({ attackerControllerSeat: 2 }), selectedTargetUid: 'target', field,
    }),
    { allowed: false, reason: 'attacker-not-opponent' },
  );
});

test('the attacking monster cannot be selected as its own redirect target', () => {
  const field = [lamp(), monster('attacker', 1, 0), monster('target', 1, 1)];
  assert.deepEqual(
    planAncientLampAttackRedirect({
      attack: attackSnapshot(), selectedTargetUid: 'attacker', field,
    }),
    { allowed: false, reason: 'invalid-redirect-target' },
  );
});

test('a monster on the Lamp controller team is not a legal redirect target', () => {
  const field = [lamp(), monster('attacker', 1, 0), monster('own-team', 0, 1)];
  assert.deepEqual(
    planAncientLampAttackRedirect({
      attack: attackSnapshot(), selectedTargetUid: 'own-team', field,
    }),
    { allowed: false, reason: 'invalid-redirect-target' },
  );
});

test('redirect resolution revalidates the attacker and selected target', () => {
  const field = [lamp(), monster('attacker', 1, 0), monster('target', 3, 1)];
  const planned = planAncientLampAttackRedirect({
    attack: attackSnapshot(), selectedTargetUid: 'target', field,
  });
  assert.equal(planned.allowed, true);
  const result = resolveAncientLampAttackRedirect({
    plan: planned.plan, attack: attackSnapshot(), field,
  });
  assert.equal(result.redirected, true);
  assert.equal(result.targetUid, 'target');
  assert.equal(result.targetTeam, 'odd');
});

test('redirect resolution fails if the target leaves the field', () => {
  const field = [lamp(), monster('attacker', 1, 0), monster('target', 1, 1)];
  const planned = planAncientLampAttackRedirect({
    attack: attackSnapshot(), selectedTargetUid: 'target', field,
  });
  assert.equal(planned.allowed, true);
  assert.deepEqual(
    resolveAncientLampAttackRedirect({ plan: planned.plan, attack: attackSnapshot(), field: field.slice(0, 2) }),
    { redirected: false, reason: 'target-missing' },
  );
});

test('redirect resolution fails if target control changes to the Lamp team', () => {
  const field = [lamp(), monster('attacker', 1, 0), monster('target', 1, 1)];
  const planned = planAncientLampAttackRedirect({
    attack: attackSnapshot(), selectedTargetUid: 'target', field,
  });
  assert.equal(planned.allowed, true);
  const changed = [lamp(), monster('attacker', 1, 0), monster('target', 0, 1)];
  assert.deepEqual(
    resolveAncientLampAttackRedirect({ plan: planned.plan, attack: attackSnapshot(), field: changed }),
    { redirected: false, reason: 'target-no-longer-opponent-controlled' },
  );
});

test('redirect resolution fails if the attack no longer targets Ancient Lamp', () => {
  const field = [lamp(), monster('attacker', 1, 0), monster('target', 1, 1)];
  const planned = planAncientLampAttackRedirect({
    attack: attackSnapshot(), selectedTargetUid: 'target', field,
  });
  assert.equal(planned.allowed, true);
  assert.deepEqual(
    resolveAncientLampAttackRedirect({
      plan: planned.plan, attack: attackSnapshot({ currentTargetUid: 'other' }), field,
    }),
    { redirected: false, reason: 'stale-attack' },
  );
});

test('the target card identity remains absent from the redirect receipt', () => {
  const field = [lamp(), monster('attacker', 1, 0), monster('hidden-target', 3, 1, false)];
  const planned = planAncientLampAttackRedirect({
    attack: attackSnapshot(), selectedTargetUid: 'hidden-target', field,
  });
  assert.equal(planned.allowed, true);
  const result = resolveAncientLampAttackRedirect({
    plan: planned.plan, attack: attackSnapshot(), field,
  });
  assert.equal(result.redirected, true);
  assert.equal(result.targetFaceUp, false);
  assert.equal(JSON.stringify(result).includes('cardId'), false);
});
