const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ARCHLORD_ZERATO_ID,
  WARRIOR_OF_ZERA_ID,
  SANCTUARY_IN_THE_SKY_ID,
  prepareArchlordZeratoSummon,
  prepareArchlordZeratoWipe,
  resolveArchlordZeratoWipe,
  teamOfZeratoSeat,
} = require('../dist/archlordZerato');

const warrior = (patch = {}) => ({
  uid: 'seat2:warrior-zera',
  cardId: WARRIOR_OF_ZERA_ID,
  physicalOwnerSeat: 2,
  controllerSeat: 0,
  location: 'monster',
  zoneSlot: 1,
  faceUp: true,
  ...patch,
});
const sanctuary = (patch = {}) => ({
  uid: 'seat2:sanctuary',
  cardId: SANCTUARY_IN_THE_SKY_ID,
  physicalOwnerSeat: 2,
  controllerSeat: 2,
  location: 'field',
  faceUp: true,
  ...patch,
});
const zeratoHand = (patch = {}) => ({
  uid: 'seat0:zerato',
  cardId: ARCHLORD_ZERATO_ID,
  physicalOwnerSeat: 0,
  location: 'hand',
  ...patch,
});
const allyMonster = (uid, zoneSlot, patch = {}) => ({
  uid,
  cardId: '11111111',
  physicalOwnerSeat: 2,
  controllerSeat: 2,
  location: 'monster',
  zoneSlot,
  faceUp: true,
  ...patch,
});
const summonContext = (patch = {}) => ({
  activeSeat: 0,
  source: zeratoHand(),
  warrior: warrior(),
  sanctuary: sanctuary(),
  teamMonsterZones: [warrior()],
  ...patch,
});
const wipeSource = (patch = {}) => ({
  uid: 'seat0:zerato-field',
  cardId: ARCHLORD_ZERATO_ID,
  physicalOwnerSeat: 2,
  controllerSeat: 0,
  location: 'monster',
  faceUp: true,
  effectNegated: false,
  ...patch,
});
const lightDiscard = (patch = {}) => ({
  uid: 'seat0:light-cost',
  cardId: '22222222',
  physicalOwnerSeat: 0,
  location: 'hand',
  cardType: 'monster',
  attribute: 'LIGHT',
  ...patch,
});
const wipeContext = (patch = {}) => ({
  activeSeat: 0,
  source: wipeSource(),
  hand: [lightDiscard()],
  selectedDiscardUid: 'seat0:light-cost',
  activationId: 'zerato-link-1',
  ...patch,
});
const opponentMonster = (uid, zoneSlot, patch = {}) => ({
  uid,
  cardId: '33333333',
  physicalOwnerSeat: zoneSlot % 2 === 0 ? 1 : 3,
  controllerSeat: zoneSlot % 2 === 0 ? 1 : 3,
  location: 'monster',
  zoneSlot,
  faceUp: true,
  ...patch,
});

test('seat mapping uses the two shared teams', () => {
  assert.deepEqual([0, 1, 2, 3].map(teamOfZeratoSeat), ['even', 'odd', 'even', 'odd']);
});

test('special summon uses the exact Warrior of Zera controlled by the shared team', () => {
  const result = prepareArchlordZeratoSummon(summonContext());
  assert.equal(result.eligible, true);
  assert.equal(result.plan.tributeUid, 'seat2:warrior-zera');
  assert.equal(result.plan.tributePhysicalOwnerSeat, 2);
  assert.equal(result.plan.destinationSlot, 1);
  assert.equal(result.plan.startsChain, false);
});

test('a full three-monster team field is legal because tributing Warrior opens its slot', () => {
  const w = warrior();
  const result = prepareArchlordZeratoSummon(summonContext({
    teamMonsterZones: [allyMonster('seat0:a', 0), w, allyMonster('seat0:b', 2)]
  }));
  assert.equal(result.eligible, true);
  assert.equal(result.plan.destinationSlot, 1);
});

test('does not use the inactive partner hand for Archlord Zerato', () => {
  assert.deepEqual(prepareArchlordZeratoSummon(summonContext({
    source: zeratoHand({ physicalOwnerSeat: 2 })
  })), { eligible: false, reason: 'not-in-active-physical-hand' });
});

test('cannot Special Summon Archlord Zerato from Deck, GY, or banishment', () => {
  for (const location of ['deck', 'graveyard', 'banished']) {
    const result = prepareArchlordZeratoSummon(summonContext({
      source: zeratoHand({ location })
    }));
    assert.deepEqual(result, { eligible: false, reason: 'not-in-active-physical-hand' });
  }
});

test('rejects another card as the summon source', () => {
  assert.deepEqual(prepareArchlordZeratoSummon(summonContext({
    source: zeratoHand({ cardId: '00000000' })
  })), { eligible: false, reason: 'wrong-source' });
});

test('requires the exact face-up Warrior of Zera', () => {
  assert.deepEqual(prepareArchlordZeratoSummon(summonContext({
    warrior: warrior({ cardId: '00000000' })
  })), { eligible: false, reason: 'not-the-required-warrior' });
  assert.deepEqual(prepareArchlordZeratoSummon(summonContext({
    warrior: warrior({ faceUp: false })
  })), { eligible: false, reason: 'warrior-not-face-up' });
});

test('accepts a Warrior physically owned by the partner but controlled by the team', () => {
  const result = prepareArchlordZeratoSummon(summonContext({
    warrior: warrior({ physicalOwnerSeat: 2, controllerSeat: 0 })
  }));
  assert.equal(result.eligible, true);
  assert.equal(result.plan.tributePhysicalOwnerSeat, 2);
});

test('rejects a Warrior controlled by the opposing team', () => {
  assert.deepEqual(prepareArchlordZeratoSummon(summonContext({
    warrior: warrior({ controllerSeat: 1 })
  })), { eligible: false, reason: 'warrior-not-controlled-by-team' });
});

test('requires The Sanctuary in the Sky face-up on the same team field', () => {
  assert.deepEqual(prepareArchlordZeratoSummon(summonContext({
    sanctuary: sanctuary({ faceUp: false })
  })), { eligible: false, reason: 'sanctuary-not-face-up-on-team-field' });
  assert.deepEqual(prepareArchlordZeratoSummon(summonContext({
    sanctuary: sanctuary({ controllerSeat: 1 })
  })), { eligible: false, reason: 'sanctuary-not-face-up-on-team-field' });
});

test('rejects a Warrior absent from the shared Monster Zones', () => {
  assert.deepEqual(prepareArchlordZeratoSummon(summonContext({
    teamMonsterZones: []
  })), { eligible: false, reason: 'warrior-not-in-shared-monster-zones' });
});

test('enforces the three shared Monster Zone slots and unique physical UIDs', () => {
  assert.deepEqual(prepareArchlordZeratoSummon(summonContext({
    teamMonsterZones: [warrior(), allyMonster('a', 0), allyMonster('b', 2), allyMonster('c', 3)]
  })), { eligible: false, reason: 'invalid-shared-monster-zone-state' });
  assert.deepEqual(prepareArchlordZeratoSummon(summonContext({
    teamMonsterZones: [warrior(), allyMonster('a', 0), allyMonster('a', 2)]
  })), { eligible: false, reason: 'invalid-shared-monster-zone-state' });
});

test('normal summon and alternative special summon procedures are explicitly prohibited', () => {
  const result = prepareArchlordZeratoSummon(summonContext());
  assert.equal(result.eligible, true);
  assert.equal(result.plan.normalSummonAllowed, false);
  assert.equal(result.plan.otherSpecialSummonProceduresAllowed, false);
});

test('effect can be activated by the active team representative using their own LIGHT monster', () => {
  const result = prepareArchlordZeratoWipe(wipeContext());
  assert.equal(result.eligible, true);
  assert.equal(result.offer.discard.uid, 'seat0:light-cost');
  assert.equal(result.offer.discard.physicalOwnerSeat, 0);
});

test('rejects a source that is not face-up under the active team controller', () => {
  assert.deepEqual(prepareArchlordZeratoWipe(wipeContext({
    source: wipeSource({ faceUp: false })
  })), { eligible: false, reason: 'source-not-face-up-on-team-field' });
  assert.deepEqual(prepareArchlordZeratoWipe(wipeContext({
    source: wipeSource({ controllerSeat: 1 })
  })), { eligible: false, reason: 'source-not-face-up-on-team-field' });
});

test('rejects a negated effect source', () => {
  assert.deepEqual(prepareArchlordZeratoWipe(wipeContext({
    source: wipeSource({ effectNegated: true })
  })), { eligible: false, reason: 'effect-negated' });
});

test('requires exactly one LIGHT monster from the active physical hand', () => {
  assert.deepEqual(prepareArchlordZeratoWipe(wipeContext({
    hand: [lightDiscard({ attribute: 'DARK' })]
  })), { eligible: false, reason: 'discard-is-not-light-monster' });
  assert.deepEqual(prepareArchlordZeratoWipe(wipeContext({
    hand: [lightDiscard({ cardType: 'spell' })]
  })), { eligible: false, reason: 'discard-is-not-light-monster' });
});

test('cannot discard the inactive partner private hand', () => {
  assert.deepEqual(prepareArchlordZeratoWipe(wipeContext({
    hand: [lightDiscard({ physicalOwnerSeat: 2 })]
  })), { eligible: false, reason: 'discard-belongs-to-partner' });
});

test('detects duplicate physical UIDs in the active hand before paying cost', () => {
  assert.deepEqual(prepareArchlordZeratoWipe(wipeContext({
    hand: [lightDiscard(), lightDiscard({ cardId: '44444444' })]
  })), { eligible: false, reason: 'duplicate-hand-uid' });
});

test('can activate multiple times in one turn; no once-per-turn limit is invented', () => {
  const first = prepareArchlordZeratoWipe(wipeContext({ activationId: 'link-1' }));
  const second = prepareArchlordZeratoWipe(wipeContext({
    activationId: 'link-2',
    hand: [lightDiscard({ uid: 'seat0:light-cost-2' })],
    selectedDiscardUid: 'seat0:light-cost-2'
  }));
  assert.equal(first.eligible, true);
  assert.equal(second.eligible, true);
  assert.equal(second.offer.oncePerTurnLimit, false);
});

test('resolves as a non-targeting wipe across both opposing physical seats', () => {
  const prepared = prepareArchlordZeratoWipe(wipeContext());
  assert.equal(prepared.eligible, true);
  const result = resolveArchlordZeratoWipe(
    prepared.offer,
    sanctuary(),
    [opponentMonster('opp1', 0), opponentMonster('opp3', 1), opponentMonster('opp1b', 2)]
  );
  assert.equal(result.resolved, true);
  assert.equal(result.applied, true);
  assert.equal(result.targeting, false);
  assert.deepEqual(result.destroyed.map(card => card.uid), ['opp1', 'opp3', 'opp1b']);
});

test('includes face-down opposing monsters without exposing their identities before resolution', () => {
  const prepared = prepareArchlordZeratoWipe(wipeContext());
  assert.equal(prepared.eligible, true);
  const result = resolveArchlordZeratoWipe(
    prepared.offer,
    sanctuary(),
    [opponentMonster('opp-hidden', 0, { faceUp: false })]
  );
  assert.equal(result.resolved, true);
  assert.deepEqual(result.destroyed.map(card => card.uid), ['opp-hidden']);
  assert.equal(result.destroyed[0].wasFaceUp, false);
});

test('uses the field at resolution, so a monster summoned in the chain is also destroyed', () => {
  const prepared = prepareArchlordZeratoWipe(wipeContext());
  assert.equal(prepared.eligible, true);
  const result = resolveArchlordZeratoWipe(
    prepared.offer,
    sanctuary(),
    [opponentMonster('new-chain-monster', 2)]
  );
  assert.equal(result.resolved, true);
  assert.deepEqual(result.destroyed.map(card => card.uid), ['new-chain-monster']);
});

test('preserves the physical owner when an opposing team controls a stolen monster', () => {
  const prepared = prepareArchlordZeratoWipe(wipeContext());
  assert.equal(prepared.eligible, true);
  const result = resolveArchlordZeratoWipe(
    prepared.offer,
    sanctuary(),
    [opponentMonster('stolen', 0, { physicalOwnerSeat: 2, controllerSeat: 1 })]
  );
  assert.equal(result.resolved, true);
  assert.equal(result.destroyed[0].physicalOwnerSeat, 2);
  assert.equal(result.destroyed[0].physicalOwnerTeam, 'even');
  assert.equal(result.destroyed[0].previousControllerSeat, 1);
});

test('does not destroy monsters protected from card-effect destruction', () => {
  const prepared = prepareArchlordZeratoWipe(wipeContext());
  assert.equal(prepared.eligible, true);
  const result = resolveArchlordZeratoWipe(
    prepared.offer,
    sanctuary(),
    [
      opponentMonster('normal', 0),
      opponentMonster('protected', 1, { canBeDestroyedByCardEffect: false })
    ]
  );
  assert.equal(result.resolved, true);
  assert.deepEqual(result.destroyed.map(card => card.uid), ['normal']);
  assert.deepEqual(result.protected, ['protected']);
});

test('discard remains paid but the effect does not apply if Sanctuary is absent at resolution', () => {
  const prepared = prepareArchlordZeratoWipe(wipeContext());
  assert.equal(prepared.eligible, true);
  const result = resolveArchlordZeratoWipe(prepared.offer, null, [opponentMonster('opp', 0)]);
  assert.deepEqual(result, {
    resolved: true,
    applied: false,
    reason: 'sanctuary-not-on-own-side',
    discardPaid: true,
    discardedUid: 'seat0:light-cost',
    destroyed: [],
    oncePerTurnLimit: false
  });
});

test('discard remains paid if Sanctuary leaves the field in the chain', () => {
  const prepared = prepareArchlordZeratoWipe(wipeContext());
  assert.equal(prepared.eligible, true);
  const result = resolveArchlordZeratoWipe(
    prepared.offer,
    sanctuary({ faceUp: false }),
    [opponentMonster('opp', 0)]
  );
  assert.equal(result.resolved, true);
  assert.equal(result.applied, false);
  assert.equal(result.discardPaid, true);
});

test('effect can activate without Sanctuary but resolves only if it is present at resolution', () => {
  const prepared = prepareArchlordZeratoWipe(wipeContext());
  assert.equal(prepared.eligible, true);
  const result = resolveArchlordZeratoWipe(
    prepared.offer,
    sanctuary(),
    [opponentMonster('opp', 0)]
  );
  assert.equal(result.resolved, true);
  assert.equal(result.applied, true);
});

test('does not resolve twice for the same activation ID', () => {
  const prepared = prepareArchlordZeratoWipe(wipeContext());
  assert.equal(prepared.eligible, true);
  assert.deepEqual(resolveArchlordZeratoWipe(
    prepared.offer,
    sanctuary(),
    [],
    { alreadyResolvedActivationIds: ['zerato-link-1'] }
  ), { resolved: false, reason: 'already-resolved' });
});

test('a negated chain link pays the cost but destroys nothing', () => {
  const prepared = prepareArchlordZeratoWipe(wipeContext());
  assert.equal(prepared.eligible, true);
  const result = resolveArchlordZeratoWipe(
    prepared.offer,
    sanctuary(),
    [opponentMonster('opp', 0)],
    { activationNegated: true }
  );
  assert.equal(result.resolved, true);
  assert.equal(result.applied, false);
  assert.equal(result.discardPaid, true);
  assert.deepEqual(result.destroyed, []);
});

test('rejects duplicate opponent UIDs or more than three shared Monster Zones', () => {
  const prepared = prepareArchlordZeratoWipe(wipeContext());
  assert.equal(prepared.eligible, true);
  assert.deepEqual(resolveArchlordZeratoWipe(
    prepared.offer,
    sanctuary(),
    [opponentMonster('dup', 0), opponentMonster('dup', 1)]
  ), { resolved: false, reason: 'invalid-opponent-shared-field' });
  assert.deepEqual(resolveArchlordZeratoWipe(
    prepared.offer,
    sanctuary(),
    [opponentMonster('a', 0), opponentMonster('b', 1), opponentMonster('c', 2), opponentMonster('d', 0)]
  ), { resolved: false, reason: 'invalid-opponent-shared-field' });
});

test('does not destroy monsters controlled by the active team', () => {
  const prepared = prepareArchlordZeratoWipe(wipeContext());
  assert.equal(prepared.eligible, true);
  assert.deepEqual(resolveArchlordZeratoWipe(
    prepared.offer,
    sanctuary(),
    [opponentMonster('ally', 0, { controllerSeat: 2 })]
  ), { resolved: false, reason: 'invalid-opponent-shared-field' });
});

test('keeps the activation and all physical card snapshots immutable', () => {
  const ctx = wipeContext();
  const before = structuredClone(ctx);
  const prepared = prepareArchlordZeratoWipe(ctx);
  assert.equal(prepared.eligible, true);
  resolveArchlordZeratoWipe(prepared.offer, sanctuary(), [opponentMonster('opp', 0)]);
  assert.deepEqual(ctx, before);
});
