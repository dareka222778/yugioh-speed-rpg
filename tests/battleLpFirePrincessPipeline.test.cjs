const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveTagBattleLifePointRecovery,
  battleLifePointRecoveryPublicSummary
} = require('../dist/battleLifePointRecoveryTagDuelAdapter');
const {
  resolveTagFirePrincessLpGain,
  firePrincessTagDuelPublicSummary
} = require('../dist/firePrincessTagDuelAdapter');
const {
  ABSORBING_KID_FROM_THE_SKY_CARD_ID,
  GUARDIAN_ANGEL_JOAN_CARD_ID
} = require('../dist/absorbingKidFromTheSky');
const { FIRE_PRINCESS_CARD_ID } = require('../dist/firePrincessLpGain');
const { createTagDuel, tagNormalCardIds } = require('../dist/tagDuel');
const { getPlayableCard } = require('../dist/effectRegistry');

function makeGame(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: 'seat-' + seat,
    name: 'Seat ' + seat,
    cards: [...deck]
  }));
  return createTagDuel(players, { seed: 'm449-battle-lp-fire-princess', first, classic: true });
}

function takeCard(game, seat) {
  const team = seat % 2;
  const held = game.active[team] === seat ? game.core.players[team] : game.reserves[String(seat)];
  const card = held.deck.pop();
  assert.ok(card);
  return card;
}

function addMonster(game, cardId, ownerSeat, controllerTeam) {
  const physical = takeCard(game, ownerSeat);
  const monster = {
    ...physical,
    id: cardId,
    position: 'atk',
    faceUp: true,
    entered: game.core.turn,
    changed: game.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0
  };
  game.core.players[controllerTeam].monsters.push(monster);
  return monster;
}

function addDestroyedMonster(game, ownerSeat = 1, destination = 'graveyard') {
  const physical = takeCard(game, ownerSeat);
  const card = { ...physical, id: tagNormalCardIds[0] };
  const ownerTeam = ownerSeat % 2;
  if (destination === 'graveyard') game.core.players[ownerTeam].grave.push(card);
  else if (destination === 'banished') game.core.players[ownerTeam].banished.push(card);
  else if (destination === 'hand') game.reserves[String(ownerSeat)].hand.push(card);
  else if (destination === 'deck') game.reserves[String(ownerSeat)].deck.push(card);
  return card;
}

function battleEvent(source, destroyed, overrides = {}) {
  return {
    eventId: 'm449:battle:1',
    sourceUid: source.uid,
    sourceCardId: source.id,
    sourceFaceUpWhenDestroying: true,
    sourceControllerTeam: 0,
    sourceBattleRole: 'attacker',
    destroyedMonsterUid: destroyed.uid,
    destroyerUid: source.uid,
    destroyedByBattle: true,
    destination: 'graveyard',
    ...overrides
  };
}

function resolveBattleRecoveryPipeline(
  game,
  event,
  battleLedger = [],
  lpLedger = [],
  negatedFirePrincessUids = []
) {
  const battle = resolveTagBattleLifePointRecovery(game, event, battleLedger);
  if (!battle.ok) return { ok: false, stage: 'battle-recovery', reason: battle.reason };

  const recovery = battle.value.result;
  // The caller atomically commits the already-resolved battle recovery to shared LP.
  game.core.players[0].lp = recovery.teamLifePoints[0];
  game.core.players[1].lp = recovery.teamLifePoints[1];

  const gainingTeam = recovery.recipientTeam ?? event.sourceControllerTeam;
  const fireEvent = {
    eventId: event.eventId,
    gainingTeam,
    lpGained: recovery.gainAmount,
    teamLifePointsAfterGain: recovery.teamLifePoints,
    negatedSourceUids: negatedFirePrincessUids
  };
  const firePrincess = resolveTagFirePrincessLpGain(game, fireEvent, lpLedger);
  if (!firePrincess.ok) {
    return { ok: false, stage: 'fire-princess', reason: firePrincess.reason };
  }

  // The caller atomically commits Fire Princess damage and its independent event ledger.
  game.core.players[0].lp = firePrincess.value.result.teamLifePointsAfterDamage[0];
  game.core.players[1].lp = firePrincess.value.result.teamLifePointsAfterDamage[1];

  return {
    ok: true,
    battle: battle.value,
    firePrincess: firePrincess.value,
    fireEvent,
    battleLedger: battle.value.processedEventIds,
    lpLedger: firePrincess.value.processedEventIds
  };
}

test('Absorbing Kid recovery triggers Fire Princess after the shared LP gain is committed', () => {
  const game = makeGame();
  const source = addMonster(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID, 2, 0);
  const princess = addMonster(game, FIRE_PRINCESS_CARD_ID, 0, 0);
  const destroyed = addDestroyedMonster(game, 1);
  const level = getPlayableCard(destroyed.id).level;

  const result = resolveBattleRecoveryPipeline(game, battleEvent(source, destroyed));
  assert.equal(result.ok, true);
  assert.equal(result.battle.result.gainAmount, level * 300);
  assert.equal(result.battle.result.sourcePhysicalOwnerSeat, 2);
  assert.equal(result.battle.result.recipientTeam, 0);
  assert.equal(result.firePrincess.result.triggerCount, 1);
  assert.equal(result.firePrincess.result.triggerSources[0].uid, princess.uid);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [4000 + level * 300, 3500]);
});

test('Guardian Angel Joan uses original ATK and sends Fire Princess damage to the opposing team', () => {
  const game = makeGame();
  const source = addMonster(game, GUARDIAN_ANGEL_JOAN_CARD_ID, 0, 0);
  addMonster(game, FIRE_PRINCESS_CARD_ID, 2, 0);
  const destroyed = addDestroyedMonster(game, 1);
  const originalAtk = getPlayableCard(destroyed.id).atk;

  const result = resolveBattleRecoveryPipeline(game, battleEvent(source, destroyed, {
    eventId: 'm449:battle:joan'
  }));
  assert.equal(result.ok, true);
  assert.equal(result.battle.result.gainAmount, originalAtk);
  assert.equal(result.firePrincess.result.requestedDamage, 500);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [4000 + originalAtk, 3500]);
});

test('routing follows the current controller team while retaining the physical source seat', () => {
  const game = makeGame();
  const source = addMonster(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID, 3, 1);
  addMonster(game, FIRE_PRINCESS_CARD_ID, 1, 1);
  const destroyed = addDestroyedMonster(game, 0);
  const level = getPlayableCard(destroyed.id).level;

  const result = resolveBattleRecoveryPipeline(game, battleEvent(source, destroyed, {
    eventId: 'm449:battle:team-one',
    sourceControllerTeam: 1,
    sourceBattleRole: 'defender'
  }));
  assert.equal(result.ok, true);
  assert.equal(result.battle.result.sourcePhysicalOwnerSeat, 3);
  assert.equal(result.battle.result.recipientTeam, 1);
  assert.equal(result.firePrincess.result.recipientTeam, 0);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [3500, 4000 + level * 300]);
});

test('multiple Fire Princess copies stack once each for one battle recovery event', () => {
  const game = makeGame();
  const source = addMonster(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID, 0, 0);
  addMonster(game, FIRE_PRINCESS_CARD_ID, 0, 0);
  addMonster(game, FIRE_PRINCESS_CARD_ID, 2, 0);
  const destroyed = addDestroyedMonster(game, 1);

  const result = resolveBattleRecoveryPipeline(game, battleEvent(source, destroyed, {
    eventId: 'm449:battle:stacked-princesses'
  }));
  assert.equal(result.ok, true);
  assert.equal(result.firePrincess.result.triggerCount, 2);
  assert.equal(result.firePrincess.result.requestedDamage, 1000);
  assert.equal(result.firePrincess.result.appliedDamage, 1000);
  assert.equal(game.core.players[1].lp, 3000);
});

test('replacement destination does not create a positive LP event or Fire Princess burn', () => {
  const game = makeGame();
  const source = addMonster(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID, 0, 0);
  addMonster(game, FIRE_PRINCESS_CARD_ID, 2, 0);
  const destroyed = addDestroyedMonster(game, 1, 'banished');

  const result = resolveBattleRecoveryPipeline(game, battleEvent(source, destroyed, {
    eventId: 'm449:battle:banished',
    destination: 'banished'
  }));
  assert.equal(result.ok, true);
  assert.equal(result.battle.result.reason, 'not-sent-to-graveyard');
  assert.equal(result.battle.result.gainAmount, 0);
  assert.equal(result.firePrincess.result.reason, 'no-lp-gain');
  assert.equal(result.firePrincess.result.requestedDamage, 0);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], [4000, 4000]);
});

test('per-copy chain negation suppresses only the exact Fire Princess UID', () => {
  const game = makeGame();
  const source = addMonster(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID, 0, 0);
  const negated = addMonster(game, FIRE_PRINCESS_CARD_ID, 0, 0);
  const active = addMonster(game, FIRE_PRINCESS_CARD_ID, 2, 0);
  const destroyed = addDestroyedMonster(game, 1);

  const result = resolveBattleRecoveryPipeline(
    game,
    battleEvent(source, destroyed, { eventId: 'm449:battle:per-copy-negation' }),
    [],
    [],
    [negated.uid]
  );
  assert.equal(result.ok, true);
  assert.equal(result.firePrincess.result.triggerCount, 1);
  assert.deepEqual(result.firePrincess.result.triggerSources.map(item => item.uid), [active.uid]);
  assert.equal(result.firePrincess.result.requestedDamage, 500);
});

test('battle and LP ledgers remain separate and retries cannot recover or burn twice', () => {
  const game = makeGame();
  const source = addMonster(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID, 0, 0);
  addMonster(game, FIRE_PRINCESS_CARD_ID, 2, 0);
  const destroyed = addDestroyedMonster(game, 1);
  const event = battleEvent(source, destroyed, { eventId: 'm449:battle:dedupe' });

  const first = resolveBattleRecoveryPipeline(game, event);
  assert.equal(first.ok, true);
  assert.deepEqual(first.battleLedger, [event.eventId]);
  assert.deepEqual(first.lpLedger, [event.eventId]);
  const afterFirstCommit = [game.core.players[0].lp, game.core.players[1].lp];

  assert.deepEqual(
    resolveTagBattleLifePointRecovery(game, event, first.battleLedger),
    { ok: false, reason: 'duplicate-battle-event' }
  );
  const retry = resolveTagFirePrincessLpGain(game, first.fireEvent, first.lpLedger);
  assert.equal(retry.ok, true);
  assert.equal(retry.value.result.reason, 'duplicate-event');
  assert.deepEqual(retry.value.result.teamLifePointsAfterDamage, afterFirstCommit);
  assert.deepEqual([game.core.players[0].lp, game.core.players[1].lp], afterFirstCommit);
});

test('both adapters are read-only until the trusted caller commits each LP transition', () => {
  const game = makeGame();
  const source = addMonster(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID, 0, 0);
  addMonster(game, FIRE_PRINCESS_CARD_ID, 2, 0);
  const destroyed = addDestroyedMonster(game, 1);
  const event = battleEvent(source, destroyed, { eventId: 'm449:battle:readonly' });
  const before = JSON.stringify(game);

  const battle = resolveTagBattleLifePointRecovery(game, event);
  assert.equal(battle.ok, true);
  assert.equal(JSON.stringify(game), before);

  const recovery = battle.value.result;
  const projected = JSON.parse(before);
  projected.core.players[0].lp = recovery.teamLifePoints[0];
  projected.core.players[1].lp = recovery.teamLifePoints[1];
  const firePrincess = resolveTagFirePrincessLpGain(projected, {
    eventId: event.eventId,
    gainingTeam: recovery.recipientTeam,
    lpGained: recovery.gainAmount,
    teamLifePointsAfterGain: recovery.teamLifePoints
  });
  assert.equal(firePrincess.ok, true);
  assert.equal(JSON.stringify(game), before);
});

test('public summaries disclose no physical UID or private card identity', () => {
  const summary = battleLifePointRecoveryPublicSummary() + ' ' + firePrincessTagDuelPublicSummary();
  assert.equal(summary.includes('m0:'), false);
  assert.equal(summary.includes(ABSORBING_KID_FROM_THE_SKY_CARD_ID), false);
  assert.equal(summary.includes(GUARDIAN_ANGEL_JOAN_CARD_ID), false);
  assert.equal(summary.includes(FIRE_PRINCESS_CARD_ID), false);
  assert.match(summary, /UIDs, mãos/i);
});

test('Fire Princess overkill is capped at remaining shared LP after battle recovery', () => {
  const game = makeGame();
  const source = addMonster(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID, 0, 0);
  addMonster(game, FIRE_PRINCESS_CARD_ID, 2, 0);
  const destroyed = addDestroyedMonster(game, 1);
  game.core.players[1].lp = 200;

  const result = resolveBattleRecoveryPipeline(game, battleEvent(source, destroyed, {
    eventId: 'm449:battle:overkill'
  }));
  assert.equal(result.ok, true);
  assert.equal(result.firePrincess.result.requestedDamage, 500);
  assert.equal(result.firePrincess.result.appliedDamage, 200);
  assert.equal(result.firePrincess.result.overkillDamage, 300);
  assert.equal(game.core.players[1].lp, 0);
});
