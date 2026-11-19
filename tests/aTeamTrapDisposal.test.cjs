const test = require('node:test');
const assert = require('node:assert/strict');
const {
  A_TEAM_TRAP_DISPOSAL_UNIT_ID,
  prepareATeamTrapDisposal,
  resolveATeamTrapDisposal,
  teamOfSeat,
} = require('../dist/aTeamTrapDisposal');

const source = (overrides = {}) => ({
  uid: 'm2:a-team',
  cardId: A_TEAM_TRAP_DISPOSAL_UNIT_ID,
  physicalOwnerSeat: 2,
  controllerSeat: 0,
  location: 'monster',
  zoneSlot: 1,
  faceUp: true,
  ...overrides,
});
const activation = (overrides = {}) => ({
  uid: 't1:trap',
  activationId: 'chain-17-link-2',
  cardId: '04031928',
  physicalOwnerSeat: 3,
  controllerSeat: 1,
  kind: 'trap',
  location: 'field',
  status: 'pending',
  chainWindowOpen: true,
  activationSpeed: 2,
  ...overrides,
});

test('seat mapping keeps the two physical seats of each team together', () => {
  assert.deepEqual([0, 1, 2, 3].map(teamOfSeat), ['even', 'odd', 'even', 'odd']);
});

test('offers response to an opponent Trap activation during either turn', () => {
  const result = prepareATeamTrapDisposal(source(), activation());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.offer, {
    sourceUid: 'm2:a-team',
    trapUid: 't1:trap',
    activationId: 'chain-17-link-2',
    sourceTeam: 'even',
    targetTeam: 'odd',
    responseSpeed: 2,
    cost: 'tribute-source',
  });
});

test('accepts a source physically owned by the inactive teammate', () => {
  const result = prepareATeamTrapDisposal(source({ physicalOwnerSeat: 2, controllerSeat: 0 }), activation());
  assert.equal(result.eligible, true);
});

test('current control, not physical ownership, determines the responding team', () => {
  const result = prepareATeamTrapDisposal(source({ physicalOwnerSeat: 1, controllerSeat: 0 }), activation());
  assert.equal(result.eligible, true);
});

test('does not offer against a Trap controlled by the same team', () => {
  const result = prepareATeamTrapDisposal(source(), activation({ controllerSeat: 2 }));
  assert.deepEqual(result, { eligible: false, reason: 'same-team-activation' });
});

test('does not offer against a Spell or monster activation', () => {
  assert.equal(prepareATeamTrapDisposal(source(), activation({ kind: 'spell' })).reason, 'not-a-trap-activation');
  assert.equal(prepareATeamTrapDisposal(source(), activation({ kind: 'monster' })).reason, 'not-a-trap-activation');
});

test('requires the A-Team source to be face-up', () => {
  assert.deepEqual(prepareATeamTrapDisposal(source({ faceUp: false }), activation()), {
    eligible: false, reason: 'source-face-down',
  });
});

test('rejects a different source card even if it has the same board state', () => {
  assert.deepEqual(prepareATeamTrapDisposal(source({ cardId: '77585513' }), activation()), {
    eligible: false, reason: 'wrong-source',
  });
});

test('does not offer while the source effect is negated', () => {
  assert.deepEqual(prepareATeamTrapDisposal(source({ effectNegated: true }), activation()), {
    eligible: false, reason: 'source-effect-negated',
  });
});

test('requires a pending activation in an open chain response window', () => {
  assert.equal(prepareATeamTrapDisposal(source(), activation({ status: 'resolved' })).reason, 'activation-not-pending');
  assert.equal(prepareATeamTrapDisposal(source(), activation({ status: 'negated' })).reason, 'activation-not-pending');
  assert.equal(prepareATeamTrapDisposal(source(), activation({ chainWindowOpen: false })).reason, 'response-window-closed');
});

test('cannot respond to a Counter Trap at Spell Speed 3', () => {
  assert.deepEqual(prepareATeamTrapDisposal(source(), activation({ activationSpeed: 3 })), {
    eligible: false, reason: 'counter-trap-speed',
  });
});

test('supports an activated Trap that originated in a legal hand-activation effect', () => {
  assert.equal(prepareATeamTrapDisposal(source(), activation({ location: 'hand' })).eligible, true);
});

test('requires a legal slot among the three shared Monster Zones', () => {
  assert.throws(() => prepareATeamTrapDisposal(source({ zoneSlot: 3 }), activation()), /shared Monster Zone slot/);
});

test('rejects source and Trap snapshots that reuse one physical UID', () => {
  assert.throws(() => prepareATeamTrapDisposal(source(), activation({ uid: 'm2:a-team' })), /distinct physical UIDs/);
});

test('revalidates the offer if the source leaves the field before resolution', () => {
  const offered = prepareATeamTrapDisposal(source(), activation());
  assert.equal(offered.eligible, true);
  const result = resolveATeamTrapDisposal(source({ location: 'monster', faceUp: false }), activation(), offered.offer);
  assert.deepEqual(result, { resolved: false, reason: 'source-face-down' });
});

test('revalidates the offer if the Trap activation has already resolved', () => {
  const offered = prepareATeamTrapDisposal(source(), activation());
  assert.equal(offered.eligible, true);
  const result = resolveATeamTrapDisposal(source(), activation({ status: 'resolved' }), offered.offer);
  assert.deepEqual(result, { resolved: false, reason: 'activation-not-pending' });
});

test('rejects an offer whose activation ID or physical source was replaced', () => {
  const offered = prepareATeamTrapDisposal(source(), activation());
  assert.equal(offered.eligible, true);
  const result = resolveATeamTrapDisposal(source(), activation(), { ...offered.offer, activationId: 'stale-chain-link' });
  assert.deepEqual(result, { resolved: false, reason: 'stale-offer' });
});

test('plans both Graveyard moves atomically and preserves physical owners', () => {
  const s = source({ physicalOwnerSeat: 2, controllerSeat: 0 });
  const a = activation({ physicalOwnerSeat: 3, controllerSeat: 1 });
  const offered = prepareATeamTrapDisposal(s, a);
  assert.equal(offered.eligible, true);
  const result = resolveATeamTrapDisposal(s, a, offered.offer);
  assert.equal(result.resolved, true);
  assert.deepEqual(result.tributedSource, { uid: 'm2:a-team', cardId: A_TEAM_TRAP_DISPOSAL_UNIT_ID, ownerSeat: 2 });
  assert.deepEqual(result.destroyedTrap, { uid: 't1:trap', cardId: '04031928', ownerSeat: 3 });
  assert.equal(result.negatedActivationId, 'chain-17-link-2');
  assert.equal(result.oncePerTurnLimit, false);
});

test('rejects duplicate UIDs already present in the shared Graveyard', () => {
  const offered = prepareATeamTrapDisposal(source(), activation());
  assert.equal(offered.eligible, true);
  assert.deepEqual(resolveATeamTrapDisposal(source(), activation(), offered.offer, ['m2:a-team']), {
    resolved: false, reason: 'duplicate-physical-uid',
  });
});

test('does not mutate source, activation, or existing Graveyard data', () => {
  const s = source();
  const a = activation();
  const graveyard = ['g:existing'];
  const before = structuredClone({ s, a, graveyard });
  const offered = prepareATeamTrapDisposal(s, a);
  assert.equal(offered.eligible, true);
  resolveATeamTrapDisposal(s, a, offered.offer, graveyard);
  assert.deepEqual({ s, a, graveyard }, before);
});

test('does not impose an unprinted once-per-turn restriction on the card rule', () => {
  const first = prepareATeamTrapDisposal(source(), activation({ activationId: 'link-1' }));
  const second = prepareATeamTrapDisposal(source(), activation({ uid: 't1:other', activationId: 'link-2' }));
  assert.equal(first.eligible, true);
  assert.equal(second.eligible, true);
});
