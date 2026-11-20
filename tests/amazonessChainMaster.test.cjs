const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AMAZONESS_CHAIN_MASTER_ID,
  AMAZONESS_CHAIN_MASTER_LP_COST,
  teamOfSeat,
  planAmazonessChainMasterEffect,
  projectAmazonessChainMasterInspection,
  resolveAmazonessChainMasterEffect,
  projectAmazonessChainMasterTransfer,
  amazonessChainMasterPublicSummary
} = require('../dist/amazonessChainMaster');

function sourceCard(options = {}) {
  return {
    uid: options.uid || 'chain-master-uid',
    id: options.id || AMAZONESS_CHAIN_MASTER_ID,
    physicalOwnerSeat: options.physicalOwnerSeat ?? 0,
    zone: options.zone || 'grave',
    sentToGyByBattle: options.sentToGyByBattle ?? true,
    destroyedByBattleTurn: options.destroyedByBattleTurn ?? 9
  };
}

function handCard(uid, kind = 'monster', options = {}) {
  return {
    uid,
    id: options.id || (kind === 'monster' ? '12345678' : '87654321'),
    physicalOwnerSeat: options.physicalOwnerSeat ?? 1,
    holderSeat: options.holderSeat ?? 1,
    zone: 'hand',
    kind
  };
}

function makePlan(options = {}) {
  return planAmazonessChainMasterEffect({
    sourceCard: options.sourceCard || sourceCard(),
    turn: options.turn ?? 9,
    effectPlayerSeat: options.effectPlayerSeat ?? 0,
    opponentSeat: options.opponentSeat ?? 1,
    teamLifePoints: options.teamLifePoints ?? 4000,
    acceptEffect: options.acceptEffect ?? true,
    opponentHandAtActivation: options.opponentHandAtActivation || [
      handCard('opponent-monster-a'),
      handCard('opponent-spell', 'spell')
    ]
  });
}

test('Amazoness Chain Master keeps its official passcode and 1500 LP cost', () => {
  assert.equal(AMAZONESS_CHAIN_MASTER_ID, '29654737');
  assert.equal(AMAZONESS_CHAIN_MASTER_LP_COST, 1500);
});

test('2v2 team mapping is stable for all four seats', () => {
  assert.deepEqual([teamOfSeat(0), teamOfSeat(1), teamOfSeat(2), teamOfSeat(3)], [0, 1, 0, 1]);
  assert.equal(teamOfSeat(4), undefined);
});

test('trigger requires this card in the GY after battle destruction in the current turn', () => {
  assert.equal(makePlan().ok, true);
  assert.deepEqual(makePlan({ sourceCard: sourceCard({ sentToGyByBattle: false }) }), {
    ok: false, reason: 'trigger-not-destroyed-by-battle-this-turn'
  });
  assert.deepEqual(makePlan({ sourceCard: sourceCard({ destroyedByBattleTurn: 8 }) }), {
    ok: false, reason: 'trigger-not-destroyed-by-battle-this-turn'
  });
  assert.deepEqual(makePlan({ sourceCard: sourceCard({ zone: 'field' }) }), {
    ok: false, reason: 'source-card-not-amazoness-chain-master-in-grave'
  });
});

test('trigger rejects another card identity and a card owned by the opposing team', () => {
  assert.deepEqual(makePlan({ sourceCard: sourceCard({ id: '00000001' }) }), {
    ok: false, reason: 'source-card-not-amazoness-chain-master-in-grave'
  });
  assert.deepEqual(makePlan({ sourceCard: sourceCard({ physicalOwnerSeat: 1 }) }), {
    ok: false, reason: 'trigger-card-not-owned-by-effect-team'
  });
});

test('the inspected opponent seat must belong to the opposing team', () => {
  assert.deepEqual(makePlan({ opponentSeat: 2 }), {
    ok: false, reason: 'selected-opponent-is-not-opposing-team'
  });
});

test('accepting the effect pays exactly 1500 team LP', () => {
  const result = makePlan({ teamLifePoints: 4000 });
  assert.equal(result.ok, true);
  assert.equal(result.value.costPaid, true);
  assert.equal(result.value.teamLifePointsBefore, 4000);
  assert.equal(result.value.teamLifePointsAfter, 2500);
});

test('effect cannot be accepted when the team cannot pay 1500 LP', () => {
  assert.deepEqual(makePlan({ teamLifePoints: 1499 }), {
    ok: false, reason: 'insufficient-team-life-points'
  });
});

test('declining the optional trigger does not pay LP', () => {
  const result = makePlan({ acceptEffect: false, teamLifePoints: 2000 });
  assert.equal(result.ok, true);
  assert.equal(result.value.active, false);
  assert.equal(result.value.costPaid, false);
  assert.equal(result.value.teamLifePointsAfter, 2000);
});

test('activation requires at least one monster in the selected opponent hand', () => {
  assert.deepEqual(makePlan({
    opponentHandAtActivation: [handCard('only-spell', 'spell')]
  }), { ok: false, reason: 'no-monster-in-opponent-hand-at-activation' });
});

test('the effect player alone receives the full private hand inspection', () => {
  const plan = makePlan();
  assert.equal(plan.ok, true);
  const hand = [handCard('monster-a'), handCard('spell-a', 'spell')];
  const own = projectAmazonessChainMasterInspection(plan.value, 0, hand);
  assert.equal(own.ok, true);
  assert.equal(own.value.visible, true);
  assert.deepEqual(own.value.cards.map(card => card.uid), ['monster-a', 'spell-a']);
});

test('the effect partner, inspected opponent, and other opponent cannot see the full hand', () => {
  const plan = makePlan();
  assert.equal(plan.ok, true);
  const hand = [handCard('secret-monster')];
  for (const viewer of [1, 2, 3]) {
    const view = projectAmazonessChainMasterInspection(plan.value, viewer, hand);
    assert.equal(view.ok, true);
    assert.equal(view.value.visible, false);
    assert.deepEqual(view.value.cards, []);
  }
});

test('inspection rejects a hand that belongs to another physical holder', () => {
  const plan = makePlan();
  assert.equal(plan.ok, true);
  const view = projectAmazonessChainMasterInspection(plan.value, 0, [
    handCard('wrong-holder', 'monster', { holderSeat: 3 })
  ]);
  assert.deepEqual(view, { ok: false, reason: 'hand-card-not-held-by-selected-opponent' });
});

test('resolution transfers one chosen monster to the effect player hand without changing physical owner', () => {
  const plan = makePlan();
  assert.equal(plan.ok, true);
  const hand = [
    handCard('owned-by-opponent', 'monster', { physicalOwnerSeat: 1 }),
    handCard('owned-by-opponent-partner', 'monster', { physicalOwnerSeat: 3 }),
    handCard('spell', 'spell')
  ];
  const resolution = resolveAmazonessChainMasterEffect(plan.value, hand, 'owned-by-opponent-partner');
  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.value.transferred, {
    uid: 'owned-by-opponent-partner',
    id: '12345678',
    kind: 'monster',
    physicalOwnerSeat: 3,
    previousHolderSeat: 1,
    newHolderSeat: 0
  });
  assert.equal(resolution.value.costPaid, true);
  assert.equal(resolution.value.teamLifePointsAfter, 2500);
});

test('resolution cannot select a Spell or Trap from the inspected hand', () => {
  const plan = makePlan();
  assert.equal(plan.ok, true);
  const hand = [handCard('spell', 'spell'), handCard('monster')];
  assert.deepEqual(resolveAmazonessChainMasterEffect(plan.value, hand, 'spell'), {
    ok: false, reason: 'selected-card-is-not-monster'
  });
});

test('resolution cannot take a UID that has left the opponent hand', () => {
  const plan = makePlan();
  assert.equal(plan.ok, true);
  assert.deepEqual(resolveAmazonessChainMasterEffect(plan.value, [handCard('remaining')], 'stale-uid'), {
    ok: false, reason: 'selected-card-not-in-opponent-hand'
  });
});

test('if no monster remains at resolution, the already-paid cost is not refunded', () => {
  const plan = makePlan();
  assert.equal(plan.ok, true);
  const resolution = resolveAmazonessChainMasterEffect(plan.value, [handCard('spell', 'spell')], 'missing');
  assert.equal(resolution.ok, true);
  assert.equal(resolution.value.costPaid, true);
  assert.equal(resolution.value.teamLifePointsAfter, 2500);
  assert.equal(resolution.value.transferred, null);
  assert.equal(resolution.value.noMonsterAvailableAtResolution, true);
});

test('duplicate hand UIDs are rejected before inspection or transfer', () => {
  const plan = makePlan();
  assert.equal(plan.ok, true);
  const hand = [handCard('same'), handCard('same')];
  assert.deepEqual(projectAmazonessChainMasterInspection(plan.value, 0, hand), {
    ok: false, reason: 'duplicate-or-invalid-hand-uid'
  });
  assert.deepEqual(resolveAmazonessChainMasterEffect(plan.value, hand, 'same'), {
    ok: false, reason: 'duplicate-or-invalid-hand-uid'
  });
});

test('only the effect player and the inspected opponent see the transferred card identity', () => {
  const plan = makePlan();
  assert.equal(plan.ok, true);
  const resolution = resolveAmazonessChainMasterEffect(plan.value, [handCard('taken')], 'taken');
  assert.equal(resolution.ok, true);
  const transfer = resolution.value.transferred;
  for (const viewer of [0, 1]) {
    const view = projectAmazonessChainMasterTransfer(plan.value, transfer, viewer);
    assert.equal(view.ok, true);
    assert.equal(view.value.visible, true);
    assert.equal(view.value.card.id, '12345678');
  }
  for (const viewer of [2, 3]) {
    const view = projectAmazonessChainMasterTransfer(plan.value, transfer, viewer);
    assert.equal(view.ok, true);
    assert.equal(view.value.visible, false);
    assert.equal(view.value.card, undefined);
  }
});

test('public summary does not reveal the stolen card ID or private hand contents', () => {
  const summary = amazonessChainMasterPublicSummary();
  assert.equal(summary.includes('12345678'), false);
  assert.equal(summary.includes('opponent-monster-a'), false);
  assert.match(summary, /um monstro foi transferido/);
});

test('inputs remain unchanged because the helper only returns a transfer plan', () => {
  const plan = makePlan();
  assert.equal(plan.ok, true);
  const hand = [handCard('unchanged')];
  const before = JSON.stringify(hand);
  const resolution = resolveAmazonessChainMasterEffect(plan.value, hand, 'unchanged');
  assert.equal(resolution.ok, true);
  assert.equal(JSON.stringify(hand), before);
});

test('effect may resolve for the active teammate while preserving the card owner seat', () => {
  const plan = makePlan({
    sourceCard: sourceCard({ physicalOwnerSeat: 2 }),
    effectPlayerSeat: 0,
    opponentSeat: 3
  });
  assert.equal(plan.ok, true);
  const hand = [handCard('taken-by-active-seat', 'monster', { holderSeat: 3, physicalOwnerSeat: 1 })];
  const resolution = resolveAmazonessChainMasterEffect(plan.value, hand, 'taken-by-active-seat');
  assert.equal(resolution.ok, true);
  assert.equal(resolution.value.transferred.physicalOwnerSeat, 1);
  assert.equal(resolution.value.transferred.previousHolderSeat, 3);
  assert.equal(resolution.value.transferred.newHolderSeat, 0);
});
