const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AMAZONESS_CHAIN_MASTER_ID,
  planTagAmazonessChainMaster,
  projectTagAmazonessChainMasterInspection,
  resolveTagAmazonessChainMaster,
  projectTagAmazonessChainMasterTransfer,
  tagAmazonessChainMasterPublicSummary
} = require('../dist/amazonessChainMasterTagDuelAdapter');
const { createTagDuel, tagNormalCardIds } = require('../dist/tagDuel');
const { getEnabledCardIds, getPlayableCard } = require('../dist/effectRegistry');

function makeGame() {
  const deck = tagNormalCardIds.slice(0, 20);
  assert.equal(deck.length, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: 'seat-' + seat,
    name: 'Seat ' + seat,
    cards: [...deck]
  }));
  const game = createTagDuel(players, { seed: 'm441-amazoness-chain-master', first: 2, classic: true });
  const physicalSource = game.reserves['0'].deck.pop();
  assert.ok(physicalSource);
  game.core.players[0].grave.push({ ...physicalSource, id: AMAZONESS_CHAIN_MASTER_ID });
  return game;
}

function event(game, overrides = {}) {
  return {
    kind: 'battle-destruction',
    sourceUid: game.core.players[0].grave.find(card => card.id === AMAZONESS_CHAIN_MASTER_ID)?.uid ?? 'm0:missing',
    opponentSeat: 3,
    turn: game.core.turn,
    sentToGyByBattle: true,
    ...overrides
  };
}

function makePlan(game, overrides = {}) {
  return planTagAmazonessChainMaster(game, event(game, overrides), true);
}

test('uses the official Amazoness Chain Master identity and real TagDuel active seats', () => {
  const game = makeGame();
  assert.equal(AMAZONESS_CHAIN_MASTER_ID, '29654737');
  assert.deepEqual(game.active, [2, 3]);
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  assert.equal(plan.value.effectPlayerSeat, 2);
  assert.equal(plan.value.opponentSeat, 3);
  assert.equal(plan.value.team, 0);
});

test('requires the Classic TagDuel format and rejects the normal laboratory', () => {
  const game = makeGame();
  game.mode = 'tag-normal-lab';
  assert.deepEqual(makePlan(game), { ok: false, reason: 'classic-tag-duel-required' });
});

test('requires an explicit opposing active battle-controller seat, not the inactive partner', () => {
  const game = makeGame();
  assert.deepEqual(makePlan(game, { opponentSeat: 1 }), {
    ok: false, reason: 'opponent-seat-must-be-active-battle-controller'
  });
  assert.deepEqual(makePlan(game, { opponentSeat: 2 }), {
    ok: false, reason: 'opponent-seat-must-be-active-battle-controller'
  });
});

test('requires a current-turn battle-destruction event that sent the source to the shared GY', () => {
  const game = makeGame();
  assert.deepEqual(makePlan(game, { sentToGyByBattle: false }), {
    ok: false, reason: 'not-a-current-turn-battle-destruction-event'
  });
  assert.deepEqual(makePlan(game, { turn: game.core.turn - 1 }), {
    ok: false, reason: 'not-a-current-turn-battle-destruction-event'
  });
  assert.deepEqual(makePlan(game, { kind: 'effect-destruction' }), {
    ok: false, reason: 'not-a-current-turn-battle-destruction-event'
  });
});

test('source must be the physical Amazoness Chain Master in the effect team shared Graveyard', () => {
  const game = makeGame();
  const source = game.core.players[0].grave.pop();
  assert.ok(source);
  assert.deepEqual(makePlan(game, { sourceUid: source.uid }), {
    ok: false, reason: 'amazoness-chain-master-not-in-shared-grave'
  });
});

test('rejects a trigger card whose physical owner belongs to the opposing team', () => {
  const game = makeGame();
  const source = game.core.players[0].grave[0];
  game.core.players[0].grave[0] = { ...source, uid: 'm1:opposing-owner' };
  assert.deepEqual(makePlan(game), {
    ok: false, reason: 'trigger-source-physical-owner-is-not-effect-team'
  });
});

test('plans the 1500 LP cost against shared team LP without mutating TagDuel state', () => {
  const game = makeGame();
  const before = JSON.stringify(game);
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  assert.equal(plan.value.effect.teamLifePointsBefore, 4000);
  assert.equal(plan.value.effect.teamLifePointsAfter, 2500);
  assert.equal(plan.value.effect.costPaid, true);
  assert.equal(game.core.players[0].lp, 4000);
  assert.equal(JSON.stringify(game), before);
});

test('declining the optional effect leaves shared LP unchanged', () => {
  const game = makeGame();
  const result = planTagAmazonessChainMaster(game, event(game), false);
  assert.equal(result.ok, true);
  assert.equal(result.value.effect.active, false);
  assert.equal(result.value.effect.teamLifePointsAfter, 4000);
});

test('only the active resolver sees the active opposing physical hand', () => {
  const game = makeGame();
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  const resolver = projectTagAmazonessChainMasterInspection(game, plan.value, 2);
  assert.equal(resolver.ok, true);
  assert.equal(resolver.value.visible, true);
  assert.equal(resolver.value.cards.length, game.core.players[1].hand.length);
  assert.deepEqual(
    resolver.value.cards.map(card => card.uid).sort(),
    game.core.players[1].hand.map(card => card.uid).sort()
  );
});

test('the resolver partner, opponent partner, inspected opponent and public view cannot see the full hand', () => {
  const game = makeGame();
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  for (const viewer of [0, 1, 3]) {
    const projection = projectTagAmazonessChainMasterInspection(game, plan.value, viewer);
    assert.equal(projection.ok, true);
    assert.equal(projection.value.visible, false);
    assert.deepEqual(projection.value.cards, []);
  }
});

test('the inactive partner reserve is never merged into the active opponent hand projection', () => {
  const game = makeGame();
  const partnerUids = game.reserves['1'].hand.map(card => card.uid);
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  const projection = projectTagAmazonessChainMasterInspection(game, plan.value, 2);
  assert.equal(projection.ok, true);
  assert.equal(projection.value.cards.some(card => partnerUids.includes(card.uid)), false);
});

test('selected card keeps physical ownership when held in the active opponent hand', () => {
  const game = makeGame();
  const activeHand = game.core.players[1].hand;
  assert.ok(activeHand.length > 0);
  activeHand[0] = { ...activeHand[0], uid: 'm1:partner-owned-card' };
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  const inspection = projectTagAmazonessChainMasterInspection(game, plan.value, 2);
  assert.equal(inspection.ok, true);
  const selected = inspection.value.cards.find(card => card.uid === 'm1:partner-owned-card');
  assert.ok(selected);
  assert.equal(selected.physicalOwnerSeat, 1);
  assert.equal(selected.kind, 'monster');
  const resolved = resolveTagAmazonessChainMaster(game, plan.value, selected.uid);
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.value.transferred, {
    uid: selected.uid,
    id: selected.id,
    kind: 'monster',
    physicalOwnerSeat: 1,
    previousHolderSeat: 3,
    newHolderSeat: 2
  });
});

test('resolution pays no second cost and reports a no-op if no monster remains in hand', () => {
  const game = makeGame();
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  const spellId = getEnabledCardIds().find(id => getPlayableCard(id)?.kind === 'spell');
  assert.ok(spellId, 'the certified catalog must contain a Spell for this regression');
  game.core.players[1].hand = game.core.players[1].hand.map(card => ({ ...card, id: spellId }));
  const resolved = resolveTagAmazonessChainMaster(game, plan.value, 'm3:unused');
  assert.equal(resolved.ok, true);
  assert.equal(resolved.value.costPaid, true);
  assert.equal(resolved.value.transferred, null);
  assert.equal(resolved.value.noMonsterAvailableAtResolution, true);
});

test('stale selected UIDs and non-monster selections are rejected', () => {
  const game = makeGame();
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  assert.deepEqual(resolveTagAmazonessChainMaster(game, plan.value, 'm3:not-in-hand'), {
    ok: false, reason: 'selected-card-not-in-opponent-hand'
  });
  const spellId = getEnabledCardIds().find(id => getPlayableCard(id)?.kind === 'spell');
  assert.ok(spellId);
  const original = game.core.players[1].hand[0];
  game.core.players[1].hand[0] = { ...original, id: spellId };
  assert.deepEqual(resolveTagAmazonessChainMaster(game, plan.value, original.uid), {
    ok: false, reason: 'selected-card-is-not-monster'
  });
});

test('inspection and resolution accept the committed 1500 LP cost but reject unrelated LP changes', () => {
  const game = makeGame();
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  game.core.players[0].lp = 2500;
  assert.equal(projectTagAmazonessChainMasterInspection(game, plan.value, 2).ok, true);
  game.core.players[0].lp = 2400;
  assert.deepEqual(projectTagAmazonessChainMasterInspection(game, plan.value, 2), {
    ok: false, reason: 'stale-chain-master-team-life-points'
  });
});

test('turn and active representative changes invalidate the plan', () => {
  const game = makeGame();
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  game.core.turn++;
  assert.deepEqual(projectTagAmazonessChainMasterInspection(game, plan.value, 2), {
    ok: false, reason: 'stale-chain-master-turn'
  });
});

test('unknown hand-card metadata fails closed', () => {
  const game = makeGame();
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  game.core.players[1].hand[0] = { ...game.core.players[1].hand[0], id: '00000000' };
  assert.deepEqual(projectTagAmazonessChainMasterInspection(game, plan.value, 2), {
    ok: false, reason: 'hand-card-not-in-certified-playable-catalog'
  });
});

test('duplicate physical UIDs in the inspected hand are rejected', () => {
  const game = makeGame();
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  game.core.players[1].hand[1] = { ...game.core.players[1].hand[1], uid: game.core.players[1].hand[0].uid };
  assert.deepEqual(projectTagAmazonessChainMasterInspection(game, plan.value, 2), {
    ok: false, reason: 'duplicate-or-invalid-physical-hand-uid'
  });
});

test('transfer identity is visible only to the resolver and inspected opponent', () => {
  const game = makeGame();
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  const selectedUid = game.core.players[1].hand[0].uid;
  const resolved = resolveTagAmazonessChainMaster(game, plan.value, selectedUid);
  assert.equal(resolved.ok, true);
  const own = projectTagAmazonessChainMasterTransfer(plan.value, resolved.value.transferred, 2);
  const opponent = projectTagAmazonessChainMasterTransfer(plan.value, resolved.value.transferred, 3);
  assert.equal(own.ok, true);
  assert.equal(opponent.ok, true);
  assert.equal(own.value.visible, true);
  assert.equal(opponent.value.visible, true);
  for (const viewer of [0, 1]) {
    const hidden = projectTagAmazonessChainMasterTransfer(plan.value, resolved.value.transferred, viewer);
    assert.equal(hidden.ok, true);
    assert.equal(hidden.value.visible, false);
    assert.equal('card' in hidden.value, false);
  }
});

test('transfer projections reject a forged physical owner or holder mapping', () => {
  const game = makeGame();
  const plan = makePlan(game);
  assert.equal(plan.ok, true);
  assert.deepEqual(projectTagAmazonessChainMasterTransfer(plan.value, {
    uid: 'm3:stolen',
    id: '12345678',
    kind: 'monster',
    physicalOwnerSeat: 1,
    previousHolderSeat: 3,
    newHolderSeat: 2
  }, 2), { ok: false, reason: 'transfer-does-not-match-chain-master-plan' });
});

test('public summary never includes card identities or private hand data', () => {
  const summary = tagAmazonessChainMasterPublicSummary();
  assert.match(summary, /identidades de cartas privadas não são exibidas publicamente/i);
  assert.equal(summary.includes(AMAZONESS_CHAIN_MASTER_ID), false);
});
