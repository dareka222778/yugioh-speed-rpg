const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SWARM_INSECT_CARDS,
  teamOfSeat,
  planSwarmFlipSummonDestruction,
  resolveSwarmFlipSummonDestruction,
  projectSwarmTargetOption,
  projectSwarmDestructionResult,
  planSwarmSelfSet,
  resolveSwarmSelfSet,
} = require('../dist/flipSummonInsectDestruction.js');

const TURN = 11;
function monster(uid, id, owner, team, zoneIndex, position = 'face-up-attack', extra = {}) {
  return { uid, id, physicalOwnerSeat: owner, controllerTeam: team, zone: 'monster', zoneIndex, position, ...extra };
}
function spell(uid, id, owner, team, zoneIndex, position = 'face-up', extra = {}) {
  return { uid, id, physicalOwnerSeat: owner, controllerTeam: team, zone: 'spell-trap', zoneIndex, position, ...extra };
}
function field(uid, id, owner, team, position = 'face-up', extra = {}) {
  return { uid, id, physicalOwnerSeat: owner, controllerTeam: team, zone: 'field', zoneIndex: null, position, ...extra };
}
function source(cardId = SWARM_INSECT_CARDS.scarabs.id, overrides = {}) {
  return {
    uid: 'swarm-source',
    id: cardId,
    physicalOwnerSeat: 0,
    controllerTeam: 0,
    zone: 'monster',
    zoneIndex: 0,
    position: 'face-up-attack',
    wasFaceDownBefore: true,
    summonMethod: 'flip-summon',
    summonedTurn: TURN,
    ...overrides,
  };
}
function makePlan(cardId, overrides = {}) {
  return planSwarmFlipSummonDestruction({ source: source(cardId, overrides.source), currentTurn: TURN, resolverSeat: overrides.resolverSeat ?? 0 });
}
function resolve(cardId, options = {}) {
  const p = makePlan(cardId, options);
  assert.equal(p.ok, true, p.ok ? '' : p.reason);
  return resolveSwarmFlipSummonDestruction({
    plan: p.value,
    currentTurn: options.currentTurn ?? TURN,
    fieldAtActivation: options.activation ?? [source(cardId)],
    fieldAtResolution: options.resolution ?? options.activation ?? [source(cardId)],
    selectedUid: options.selected ?? 'target',
  });
}
function selfSetCard(cardId = SWARM_INSECT_CARDS.scarabs.id, overrides = {}) {
  return {
    uid: 'self-set-source',
    id: cardId,
    physicalOwnerSeat: 0,
    controllerTeam: 0,
    zone: 'monster',
    zoneIndex: 0,
    position: 'face-up-attack',
    ...overrides,
  };
}
function planSelfSet(cardId, overrides = {}) {
  return planSwarmSelfSet({
    card: selfSetCard(cardId, overrides.card),
    currentTurn: TURN,
    phase: overrides.phase ?? 'main1',
    turnOwnerTeam: overrides.turnOwnerTeam ?? 0,
    resolverSeat: overrides.resolverSeat ?? 0,
    lastSelfSetTurn: overrides.lastSelfSetTurn ?? null,
  });
}

test('official passcodes, Konami CIDs and target zones are fixed', () => {
  assert.deepEqual(SWARM_INSECT_CARDS, {
    scarabs: { id: '15383415', konamiCardDatabaseId: 5418, name: 'Swarm of Scarabs', flipSummonTargetZone: 'monster' },
    locusts: { id: '41872150', konamiCardDatabaseId: 5419, name: 'Swarm of Locusts', flipSummonTargetZone: 'spell-trap-or-field' },
  });
});
test('2v2 seats map to their shared teams', () => {
  assert.deepEqual([teamOfSeat(0), teamOfSeat(1), teamOfSeat(2), teamOfSeat(3), teamOfSeat(4)], [0, 1, 0, 1, undefined]);
});
test('only a true Flip Summon triggers destruction', () => {
  assert.equal(makePlan(SWARM_INSECT_CARDS.scarabs.id, { source: { summonMethod: 'flip-by-effect' } }).reason, 'source-was-not-flip-summoned');
  assert.equal(makePlan(SWARM_INSECT_CARDS.scarabs.id, { source: { wasFaceDownBefore: false } }).reason, 'source-was-not-flip-summoned');
});
test('Flip Summon source must be face-up Attack in a Monster Zone', () => {
  assert.equal(makePlan(SWARM_INSECT_CARDS.scarabs.id, { source: { position: 'face-up-defense' } }).reason, 'flip-summon-source-not-face-up-monster');
  assert.equal(makePlan(SWARM_INSECT_CARDS.scarabs.id, { source: { zone: 'field' } }).reason, 'flip-summon-source-not-face-up-monster');
});
test('Flip Summon trigger and resolver must belong to the current turn and source team', () => {
  assert.equal(makePlan(SWARM_INSECT_CARDS.scarabs.id, { source: { summonedTurn: TURN - 1 } }).reason, 'flip-summon-turn-mismatch');
  assert.equal(makePlan(SWARM_INSECT_CARDS.scarabs.id, { resolverSeat: 1 }).reason, 'resolver-not-on-source-controller-team');
});
test('Scarabs targets exactly a monster controlled by the opposing team', () => {
  const activation = [source(), monster('target', '11111111', 1, 1, 0)];
  const result = resolve(SWARM_INSECT_CARDS.scarabs.id, { activation, resolution: activation, selected: 'target' });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed.fromZone, 'monster');
});
test('Scarabs cannot target an opposing Spell/Trap', () => {
  const activation = [source(), spell('target', '11111111', 1, 1, 0)];
  const result = resolve(SWARM_INSECT_CARDS.scarabs.id, { activation, resolution: activation, selected: 'target' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'target-zone-does-not-match-swarm-card');
});
test('Locusts targets exactly an opposing Spell/Trap', () => {
  const activation = [source(SWARM_INSECT_CARDS.locusts.id), spell('target', '11111111', 1, 1, 0)];
  const result = resolve(SWARM_INSECT_CARDS.locusts.id, { activation, resolution: activation, selected: 'target' });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed.fromZone, 'spell-trap');
});
test('Locusts may target the separate opposing Field Zone', () => {
  const activation = [source(SWARM_INSECT_CARDS.locusts.id), field('field-target', '22222222', 3, 1)];
  const result = resolve(SWARM_INSECT_CARDS.locusts.id, { activation, resolution: activation, selected: 'field-target' });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed.fromZone, 'field');
  assert.equal(result.value.releasedZone.zoneIndex, null);
});
test('Locusts cannot target a monster and Scarabs cannot target the Field Zone', () => {
  const locustActivation = [source(SWARM_INSECT_CARDS.locusts.id), monster('m', '11111111', 1, 1, 0)];
  assert.equal(resolve(SWARM_INSECT_CARDS.locusts.id, { activation: locustActivation, resolution: locustActivation, selected: 'm' }).reason, 'target-zone-does-not-match-swarm-card');
  const scarabActivation = [source(), field('f', '22222222', 1, 1)];
  assert.equal(resolve(SWARM_INSECT_CARDS.scarabs.id, { activation: scarabActivation, resolution: scarabActivation, selected: 'f' }).reason, 'target-zone-does-not-match-swarm-card');
});
test('neither card can target a card controlled by its own team', () => {
  const activation = [source(), monster('ally', '11111111', 2, 0, 1)];
  assert.equal(resolve(SWARM_INSECT_CARDS.scarabs.id, { activation, resolution: activation, selected: 'ally' }).reason, 'target-not-controlled-by-opposing-team');
});
test('face-down target identities are hidden from public and non-owner viewers', () => {
  const hidden = monster('private-uid', '33333333', 3, 1, 0, 'face-down-defense');
  assert.equal(projectSwarmTargetOption(hidden, 'public').cardId, undefined);
  assert.equal(projectSwarmTargetOption(hidden, 0).cardId, undefined);
  assert.equal(projectSwarmTargetOption(hidden, 3).cardId, '33333333');
  assert.equal(JSON.stringify(projectSwarmTargetOption(hidden, 'public')).includes('private-uid'), false);
});
test('destroyed face-down targets become public in the Graveyard without exposing UIDs', () => {
  const activation = [source(), monster('private-uid', '44444444', 1, 1, 0, 'face-down-defense')];
  const result = resolve(SWARM_INSECT_CARDS.scarabs.id, { activation, resolution: activation, selected: 'private-uid' });
  const projection = projectSwarmDestructionResult(result.value, 'public');
  assert.equal(projection.cardId, '44444444');
  assert.equal(JSON.stringify(projection).includes('private-uid'), false);
});
test('destroyed stolen cards go to the physical owner team Graveyard', () => {
  const activation = [source(), monster('stolen', '11111111', 2, 1, 0)];
  const result = resolve(SWARM_INSECT_CARDS.scarabs.id, { activation, resolution: activation, selected: 'stolen' });
  assert.equal(result.value.destroyed.destinationGraveyardTeam, 0);
  assert.equal(result.value.releasedZone.team, 1);
});
test('a target that leaves the field before resolution is not destroyed', () => {
  const activation = [source(), monster('target', '11111111', 1, 1, 0)];
  const result = resolve(SWARM_INSECT_CARDS.scarabs.id, { activation, resolution: [source()], selected: 'target' });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed, null);
});
test('target identity or zone changes are rejected', () => {
  const activation = [source(SWARM_INSECT_CARDS.locusts.id), spell('target', '11111111', 1, 1, 0)];
  const resolution = [source(SWARM_INSECT_CARDS.locusts.id), field('target', '11111111', 1, 1)];
  const result = resolve(SWARM_INSECT_CARDS.locusts.id, { activation, resolution, selected: 'target' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'target-physical-identity-or-zone-changed');
});
test('destruction protection prevents the target from leaving its zone', () => {
  const activation = [source(), monster('protected', '11111111', 1, 1, 0, 'face-up-attack', { destructionProtected: true })];
  const result = resolve(SWARM_INSECT_CARDS.scarabs.id, { activation, resolution: activation, selected: 'protected' });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed, null);
  assert.equal(result.value.protectedUid, 'protected');
  assert.equal(result.value.releasedZone, null);
});
test('a Flip Summon effect resolves if battle destruction removes its source before activation', () => {
  const activation = [monster('target', '11111111', 1, 1, 0)];
  const result = resolve(SWARM_INSECT_CARDS.scarabs.id, { activation, resolution: activation, selected: 'target' });
  assert.equal(result.ok, true);
  assert.equal(result.value.destroyed.uid, 'target');
});
test('shared field validates 3+3 Monster Zones, 3+3 Spell/Trap Zones and separate Field Zones', () => {
  const activation = [
    source(),
    monster('m1', '11111111', 0, 0, 1), monster('m2', '22222222', 2, 0, 2),
    monster('m3', '33333333', 1, 1, 0), monster('m4', '44444444', 3, 1, 1), monster('m5', '55555555', 1, 1, 2),
    spell('s1', '66666666', 0, 0, 0), spell('s2', '77777777', 2, 0, 1), spell('s3', '88888888', 1, 1, 0),
    spell('s4', '99999999', 3, 1, 1), spell('s5', '10101010', 1, 1, 2),
    field('f0', '11111112', 0, 0), field('f1', '11111113', 1, 1),
  ];
  const result = resolve(SWARM_INSECT_CARDS.scarabs.id, { activation, resolution: activation, selected: 'm3' });
  assert.equal(result.ok, true);
});
test('duplicate shared slots and duplicate UIDs are rejected', () => {
  const duplicateSlot = [source(), monster('other', '11111111', 2, 0, 0)];
  assert.equal(resolve(SWARM_INSECT_CARDS.scarabs.id, { activation: duplicateSlot, resolution: duplicateSlot, selected: 'other' }).reason, 'activation-duplicate-shared-zone-occupancy');
  const duplicateUid = [source(), monster('swarm-source', '22222222', 1, 1, 0)];
  assert.equal(resolve(SWARM_INSECT_CARDS.scarabs.id, { activation: duplicateUid, resolution: duplicateUid, selected: 'swarm-source' }).reason, 'activation-duplicate-physical-uid-on-field');
});
test('Field Zone is one separate slot per team', () => {
  const activation = [source(SWARM_INSECT_CARDS.locusts.id), field('f1', '11111111', 1, 1), field('f2', '22222222', 3, 1)];
  const result = resolve(SWARM_INSECT_CARDS.locusts.id, { activation, resolution: activation, selected: 'f1' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'activation-duplicate-shared-zone-occupancy');
});
test('self-set can be planned during Main Phase 1 or 2', () => {
  assert.equal(planSelfSet(SWARM_INSECT_CARDS.scarabs.id, { phase: 'main1' }).ok, true);
  assert.equal(planSelfSet(SWARM_INSECT_CARDS.locusts.id, { phase: 'main2' }).ok, true);
});
test('self-set is not available outside Main Phase', () => {
  assert.equal(planSelfSet(SWARM_INSECT_CARDS.scarabs.id, { phase: 'battle' }).reason, 'self-set-only-during-main-phase');
  assert.equal(planSelfSet(SWARM_INSECT_CARDS.scarabs.id, { phase: 'end' }).reason, 'self-set-only-during-main-phase');
});
test('self-set belongs to the current controller team and its representative seat', () => {
  assert.equal(planSelfSet(SWARM_INSECT_CARDS.scarabs.id, { turnOwnerTeam: 1 }).reason, 'self-set-not-controller-team-turn');
  assert.equal(planSelfSet(SWARM_INSECT_CARDS.scarabs.id, { resolverSeat: 1 }).reason, 'self-set-resolver-not-controller-team');
});
test('self-set is once per turn per physical card UID', () => {
  assert.equal(planSelfSet(SWARM_INSECT_CARDS.scarabs.id, { lastSelfSetTurn: TURN }).reason, 'self-set-already-used-this-turn');
  assert.equal(planSelfSet(SWARM_INSECT_CARDS.scarabs.id, { lastSelfSetTurn: TURN - 1 }).ok, true);
});

test('self-set usage is tracked per physical card UID rather than globally by card name', () => {
  const usedCopy = planSelfSet(SWARM_INSECT_CARDS.scarabs.id, { card: { uid: 'copy-a' }, lastSelfSetTurn: TURN });
  const freshCopy = planSelfSet(SWARM_INSECT_CARDS.scarabs.id, { card: { uid: 'copy-b' }, lastSelfSetTurn: null });
  assert.equal(usedCopy.ok, false);
  assert.equal(freshCopy.ok, true);
});
test('self-set requires a face-up source in one of the shared Monster Zones', () => {
  assert.equal(planSelfSet(SWARM_INSECT_CARDS.scarabs.id, { card: { position: 'face-down-defense' } }).reason, 'self-set-source-not-face-up');
  assert.equal(planSelfSet(SWARM_INSECT_CARDS.scarabs.id, { card: { zone: 'field' } }).reason, 'self-set-source-not-in-monster-zone');
});
test('self-set resolution returns a face-down position instruction without mutating state', () => {
  const plan = planSelfSet(SWARM_INSECT_CARDS.scarabs.id);
  const current = [selfSetCard()];
  const before = structuredClone(current);
  const result = resolveSwarmSelfSet({ plan: plan.value, currentTurn: TURN, fieldAtResolution: current });
  assert.equal(result.ok, true);
  assert.equal(result.value.changed, true);
  assert.equal(result.value.nextPosition, 'face-down-defense');
  assert.equal(result.value.consumedTurn, TURN);
  assert.deepEqual(current, before);
});
test('self-set resolves without effect if the source leaves the field', () => {
  const plan = planSelfSet(SWARM_INSECT_CARDS.scarabs.id);
  const result = resolveSwarmSelfSet({ plan: plan.value, currentTurn: TURN, fieldAtResolution: [] });
  assert.equal(result.ok, true);
  assert.equal(result.value.changed, false);
  assert.equal(result.value.reason, 'source-left-field');
  assert.equal(result.value.consumedTurn, TURN);
});
test('self-set does not change a source that is already face-down', () => {
  const plan = planSelfSet(SWARM_INSECT_CARDS.scarabs.id);
  const current = [selfSetCard(SWARM_INSECT_CARDS.scarabs.id, { position: 'face-down-defense' })];
  const result = resolveSwarmSelfSet({ plan: plan.value, currentTurn: TURN, fieldAtResolution: current });
  assert.equal(result.ok, true);
  assert.equal(result.value.changed, false);
  assert.equal(result.value.reason, 'source-not-face-up');
  assert.equal(result.value.consumedTurn, TURN);
});
test('self-set can be used on the same turn as a Flip Summon because it is a card effect', () => {
  const plan = planSelfSet(SWARM_INSECT_CARDS.scarabs.id);
  assert.equal(plan.ok, true);
  assert.equal(plan.value.turn, TURN);
});
test('self-set rejects stale plans, wrong source identity and invalid usage ledgers', () => {
  const plan = planSelfSet(SWARM_INSECT_CARDS.scarabs.id);
  assert.equal(resolveSwarmSelfSet({ plan: plan.value, currentTurn: TURN + 1, fieldAtResolution: [selfSetCard()] }).reason, 'self-set-resolution-turn-mismatch');
  assert.equal(planSelfSet(SWARM_INSECT_CARDS.scarabs.id, { lastSelfSetTurn: TURN + 1 }).reason, 'invalid-self-set-usage-ledger');
  const changed = [selfSetCard(SWARM_INSECT_CARDS.scarabs.id, { id: SWARM_INSECT_CARDS.locusts.id })];
  assert.equal(resolveSwarmSelfSet({ plan: plan.value, currentTurn: TURN, fieldAtResolution: changed }).reason, 'self-set-source-identity-changed');
});
