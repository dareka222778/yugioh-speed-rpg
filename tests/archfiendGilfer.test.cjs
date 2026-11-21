const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ARCHFIEND_OF_GILFER_ID,
  archfiendGilferAtkDelta,
  prepareArchfiendGilferEquip,
  resolveArchfiendGilferEquip,
  teamOfGilferSeat,
} = require('../dist/archfiendGilfer');

const source = (patch = {}) => ({
  uid: 'g2:gilfer',
  cardId: ARCHFIEND_OF_GILFER_ID,
  physicalOwnerSeat: 2,
  location: 'graveyard',
  sentToGyWasLastEvent: true,
  effectNegated: false,
  ...patch,
});
const target = (patch = {}) => ({
  uid: 'm1:target',
  cardId: '12345678',
  physicalOwnerSeat: 1,
  controllerSeat: 1,
  location: 'monster',
  zoneSlot: 0,
  faceUp: true,
  canBeEquipped: true,
  ...patch,
});
const context = (patch = {}) => ({
  source: source(),
  target: target(),
  triggerControllerSeat: 0,
  activationId: 'gilfer-chain-1',
  teamSpellTrapZonesUsed: 1,
  existingEquipUids: [],
  ...patch,
});

test('seat mapping keeps seats 0/2 and 1/3 on their shared teams', () => {
  assert.deepEqual([0, 1, 2, 3].map(teamOfGilferSeat), ['even', 'odd', 'even', 'odd']);
});

test('accepts a Gilfer physically owned by the inactive teammate in the shared Graveyard', () => {
  const result = prepareArchfiendGilferEquip(context());
  assert.equal(result.eligible, true);
  assert.equal(result.offer.sourceTeam, 'even');
});

test('rejects a different source card', () => {
  assert.deepEqual(prepareArchfiendGilferEquip(context({ source: source({ cardId: '00000000' }) })), {
    eligible: false, reason: 'wrong-source'
  });
});

test('requires the source to remain in the shared Graveyard when its trigger resolves', () => {
  assert.deepEqual(prepareArchfiendGilferEquip(context({ source: source({ location: 'hand' }) })), {
    eligible: false, reason: 'source-not-in-graveyard'
  });
});

test('honors optional When timing: the send to the GY must be the last event', () => {
  assert.deepEqual(prepareArchfiendGilferEquip(context({ source: source({ sentToGyWasLastEvent: false }) })), {
    eligible: false, reason: 'optional-when-timing-missed'
  });
});

test('does not activate while the source effect is negated', () => {
  assert.deepEqual(prepareArchfiendGilferEquip(context({ source: source({ effectNegated: true }) })), {
    eligible: false, reason: 'source-effect-negated'
  });
});

test('the trigger controller must belong to the physical owner team', () => {
  assert.deepEqual(prepareArchfiendGilferEquip(context({ triggerControllerSeat: 1 })), {
    eligible: false, reason: 'trigger-controller-outside-owner-team'
  });
});

test('can target a face-up monster on either team', () => {
  assert.equal(prepareArchfiendGilferEquip(context({ target: target({ controllerSeat: 2 }) })).eligible, true);
  assert.equal(prepareArchfiendGilferEquip(context({ target: target({ controllerSeat: 3 }) })).eligible, true);
});

test('rejects a face-down target without exposing its identity', () => {
  assert.deepEqual(prepareArchfiendGilferEquip(context({ target: target({ faceUp: false }) })), {
    eligible: false, reason: 'target-not-face-up'
  });
});

test('rejects a target that has left the Monster Zone', () => {
  assert.deepEqual(prepareArchfiendGilferEquip(context({ target: target({ location: 'graveyard' }) })), {
    eligible: false, reason: 'target-not-on-monster-field'
  });
});

test('rejects a monster that cannot be equipped', () => {
  assert.deepEqual(prepareArchfiendGilferEquip(context({ target: target({ canBeEquipped: false }) })), {
    eligible: false, reason: 'target-cannot-be-equipped'
  });
});

test('requires a legal slot in one of the three shared Monster Zones', () => {
  assert.throws(() => prepareArchfiendGilferEquip(context({ target: target({ zoneSlot: 3 }) })), /shared Monster Zone slot/);
});

test('requires an open Spell/Trap Zone on the trigger controller team', () => {
  assert.deepEqual(prepareArchfiendGilferEquip(context({ teamSpellTrapZonesUsed: 3 })), {
    eligible: false, reason: 'no-team-spell-trap-zone'
  });
});

test('checks the trigger team backrow even when the target is controlled by the opponents', () => {
  const result = prepareArchfiendGilferEquip(context({
    target: target({ controllerSeat: 1 }),
    teamSpellTrapZonesUsed: 2
  }));
  assert.equal(result.eligible, true);
  assert.equal(result.offer.sourceTeam, 'even');
  assert.equal(result.offer.targetTeam, 'odd');
});

test('rejects reuse of one physical UID for source and target', () => {
  assert.deepEqual(prepareArchfiendGilferEquip(context({ target: target({ uid: 'g2:gilfer' }) })), {
    eligible: false, reason: 'same-physical-uid'
  });
});

test('rejects duplicate UIDs already present among shared Equip Cards', () => {
  assert.deepEqual(prepareArchfiendGilferEquip(context({ existingEquipUids: ['e:1', 'e:1'] })), {
    eligible: false, reason: 'duplicate-physical-uid'
  });
});

test('rejects a source UID that is already registered as an Equip Card', () => {
  assert.deepEqual(prepareArchfiendGilferEquip(context({ existingEquipUids: ['g2:gilfer'] })), {
    eligible: false, reason: 'duplicate-physical-uid'
  });
});

test('resolution preserves Gilfer physical owner and keeps the trigger controller', () => {
  const ctx = context({ target: target({ controllerSeat: 1, physicalOwnerSeat: 3 }) });
  const offered = prepareArchfiendGilferEquip(ctx);
  assert.equal(offered.eligible, true);
  const result = resolveArchfiendGilferEquip(ctx, offered.offer);
  assert.equal(result.resolved, true);
  assert.deepEqual(result.equip, {
    uid: 'g2:gilfer',
    cardId: ARCHFIEND_OF_GILFER_ID,
    physicalOwnerSeat: 2,
    controllerSeat: 0,
    controllerTeam: 'even',
    destination: 'shared-spell-trap-zone',
    targetUid: 'm1:target',
    targetControllerSeatAtResolution: 1,
    atkReduction: 500,
    modifierLifetime: 'while-equipped'
  });
  assert.equal(result.oncePerTurnLimit, false);
});

test('rejects a stale offer if the source leaves the Graveyard', () => {
  const ctx = context();
  const offered = prepareArchfiendGilferEquip(ctx);
  assert.equal(offered.eligible, true);
  assert.deepEqual(resolveArchfiendGilferEquip({
    ...ctx,
    source: source({ location: 'deck' })
  }, offered.offer), { resolved: false, reason: 'source-not-in-graveyard' });
});

test('rejects a stale offer if the target turns face-down before resolution', () => {
  const ctx = context();
  const offered = prepareArchfiendGilferEquip(ctx);
  assert.equal(offered.eligible, true);
  assert.deepEqual(resolveArchfiendGilferEquip({
    ...ctx,
    target: target({ faceUp: false })
  }, offered.offer), { resolved: false, reason: 'target-not-face-up' });
});

test('rejects a replaced activation ID or target UID', () => {
  const ctx = context();
  const offered = prepareArchfiendGilferEquip(ctx);
  assert.equal(offered.eligible, true);
  assert.deepEqual(resolveArchfiendGilferEquip(ctx, { ...offered.offer, activationId: 'stale-link' }), {
    resolved: false, reason: 'stale-offer'
  });
});

test('the ATK penalty is exactly 500 per attached Gilfer and disappears on detachment', () => {
  assert.equal(archfiendGilferAtkDelta(0), 0);
  assert.equal(archfiendGilferAtkDelta(1), -500);
  assert.equal(archfiendGilferAtkDelta(2), -1000);
  assert.equal(archfiendGilferAtkDelta(1 - 1), 0);
});

test('does not impose an unprinted once-per-turn limit', () => {
  const first = prepareArchfiendGilferEquip(context({ activationId: 'link-1' }));
  const second = prepareArchfiendGilferEquip(context({ activationId: 'link-2', target: target({ uid: 'm2:other' }) }));
  assert.equal(first.eligible, true);
  assert.equal(second.eligible, true);
});

test('eligibility and resolution do not mutate source, target, or existing Equip data', () => {
  const ctx = context();
  const before = structuredClone(ctx);
  const offered = prepareArchfiendGilferEquip(ctx);
  assert.equal(offered.eligible, true);
  resolveArchfiendGilferEquip(ctx, offered.offer);
  assert.deepEqual(ctx, before);
});
