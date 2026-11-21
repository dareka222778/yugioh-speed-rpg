const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveTagBattleLifePointRecovery,
  battleLifePointRecoveryPublicSummary
} = require('../dist/battleLifePointRecoveryTagDuelAdapter');
const {
  ABSORBING_KID_FROM_THE_SKY_CARD_ID,
  GUARDIAN_ANGEL_JOAN_CARD_ID
} = require('../dist/absorbingKidFromTheSky');
const { createTagDuel, tagNormalCardIds } = require('../dist/tagDuel');
const { getPlayableCard } = require('../dist/effectRegistry');

function makeGame() {
  const deck = tagNormalCardIds.slice(0, 20);
  const players = [0, 1, 2, 3].map(seat => ({
    id: 'seat-' + seat, name: 'Seat ' + seat, cards: [...deck]
  }));
  return createTagDuel(players, { seed: 'm443-battle-lp', first: 2, classic: true });
}

function takeCard(game, seat) {
  const team = seat % 2;
  const held = game.active[team] === seat ? game.core.players[team] : game.reserves[String(seat)];
  const card = held.deck.pop();
  assert.ok(card);
  return card;
}

function addSource(game, cardId, ownerSeat = 0, controllerTeam = 0, zone = 'monsters') {
  const physical = takeCard(game, ownerSeat);
  const source = { ...physical, id: cardId, position: 'atk', faceUp: true, entered: game.core.turn, changed: game.core.turn, attacked: 0, atkBoost: 0, defBoost: 0 };
  if (zone === 'monsters') game.core.players[controllerTeam].monsters.push(source);
  else if (zone === 'grave') game.core.players[controllerTeam].grave.push(source);
  return source;
}

function addDestroyedMonster(game, ownerSeat = 1, destination = 'grave') {
  const physical = takeCard(game, ownerSeat);
  const card = { ...physical, id: tagNormalCardIds[0] };
  const ownerTeam = ownerSeat % 2;
  if (destination === 'grave') game.core.players[ownerTeam].grave.push(card);
  else if (destination === 'banished') game.core.players[ownerTeam].banished.push(card);
  else if (destination === 'hand') game.reserves[String(ownerSeat)].hand.push(card);
  else if (destination === 'deck') game.reserves[String(ownerSeat)].deck.push(card);
  return card;
}

function battleEvent(source, destroyed, overrides = {}) {
  return {
    eventId: 'turn-1:battle-1',
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

test('Absorbing Kid recovers 300 LP per destroyed monster Level into the controller team shared LP', () => {
  const game = makeGame();
  const source = addSource(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID, 0, 0);
  const destroyed = addDestroyedMonster(game, 1);
  const level = getPlayableCard(destroyed.id).level;
  const result = resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed));
  assert.equal(result.ok, true);
  assert.equal(result.value.result.gainAmount, level * 300);
  assert.equal(result.value.result.recipientTeam, 0);
  assert.deepEqual(result.value.result.teamLifePoints, [4000 + level * 300, 4000]);
});

test('Guardian Angel Joan recovers the destroyed monster original ATK, not current ATK', () => {
  const game = makeGame();
  const source = addSource(game, GUARDIAN_ANGEL_JOAN_CARD_ID, 0, 1);
  const destroyed = addDestroyedMonster(game, 1);
  const originalAtk = getPlayableCard(destroyed.id).atk;
  const result = resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed, {
    sourceCardId: GUARDIAN_ANGEL_JOAN_CARD_ID,
    sourceControllerTeam: 1,
    sourceBattleRole: 'defender'
  }));
  assert.equal(result.ok, true);
  assert.equal(result.value.result.gainAmount, originalAtk);
  assert.equal(result.value.result.recipientTeam, 1);
  assert.deepEqual(result.value.result.teamLifePoints, [4000, 4000 + originalAtk]);
});

test('recipient is current controller team, not the source physical owner seat', () => {
  const game = makeGame();
  const source = addSource(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID, 0, 1);
  const destroyed = addDestroyedMonster(game, 1);
  const result = resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed, {
    sourceControllerTeam: 1
  }));
  assert.equal(result.ok, true);
  assert.equal(result.value.result.sourcePhysicalOwnerSeat, 0);
  assert.equal(result.value.result.recipientTeam, 1);
  assert.deepEqual(result.value.result.teamLifePoints, [4000, 4000 + getPlayableCard(destroyed.id).level * 300]);
});

test('source may already be in its controller team Graveyard after a simultaneous battle destruction', () => {
  const game = makeGame();
  const source = addSource(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID, 2, 0, 'grave');
  const destroyed = addDestroyedMonster(game, 1);
  const result = resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed));
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggered, true);
});

test('destroyed monster must actually reach the physical owner team Graveyard', () => {
  const game = makeGame();
  const source = addSource(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID);
  const destroyed = addDestroyedMonster(game, 1);
  game.core.players[0].grave.push(destroyed);
  game.core.players[1].grave = game.core.players[1].grave.filter(card => card.uid !== destroyed.uid);
  assert.deepEqual(resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed)), {
    ok: false, reason: 'destroyed-monster-not-in-physical-owner-team-graveyard'
  });
});

test('replacement destination banished is accepted as a non-triggering event', () => {
  const game = makeGame();
  const source = addSource(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID);
  const destroyed = addDestroyedMonster(game, 1, 'banished');
  const result = resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed, { destination: 'banished' }));
  assert.equal(result.ok, true);
  assert.equal(result.value.result.triggered, false);
  assert.equal(result.value.result.reason, 'not-sent-to-graveyard');
  assert.deepEqual(result.value.result.teamLifePoints, [4000, 4000]);
});

test('non-battle destruction and a different destroyer do not recover LP', () => {
  const game = makeGame();
  const source = addSource(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID);
  const destroyed = addDestroyedMonster(game, 1);
  const notBattle = resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed, { destroyedByBattle: false }));
  assert.equal(notBattle.ok, true);
  assert.equal(notBattle.value.result.reason, 'not-destroyed-by-battle');
  const otherDestroyer = resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed, {
    eventId: 'turn-1:battle-2', destroyerUid: 'm2:other'
  }));
  assert.equal(otherDestroyer.ok, true);
  assert.equal(otherDestroyer.value.result.reason, 'different-destroyer');
});

test('source must have been face-up at the moment it destroyed the monster', () => {
  const game = makeGame();
  const source = addSource(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID);
  const destroyed = addDestroyedMonster(game, 1);
  const result = resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed, {
    sourceFaceUpWhenDestroying: false
  }));
  assert.equal(result.ok, true);
  assert.equal(result.value.result.reason, 'source-not-face-up');
});

test('source and destroyed card physical UIDs remain in the receipt', () => {
  const game = makeGame();
  const source = addSource(game, GUARDIAN_ANGEL_JOAN_CARD_ID, 2, 0);
  const destroyed = addDestroyedMonster(game, 3);
  const result = resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed, {
    sourceCardId: GUARDIAN_ANGEL_JOAN_CARD_ID
  }));
  assert.equal(result.ok, true);
  assert.equal(result.value.result.sourcePhysicalOwnerSeat, 2);
  assert.equal(result.value.result.destroyedMonsterUid, destroyed.uid);
});

test('duplicate battle event IDs are rejected and valid event IDs are appended immutably', () => {
  const game = makeGame();
  const source = addSource(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID);
  const destroyed = addDestroyedMonster(game, 1);
  const event = battleEvent(source, destroyed);
  assert.deepEqual(resolveTagBattleLifePointRecovery(game, event, [event.eventId]), {
    ok: false, reason: 'duplicate-battle-event'
  });
  const processed = ['turn-0:old'];
  const result = resolveTagBattleLifePointRecovery(game, { ...event, eventId: 'turn-1:battle-9' }, processed);
  assert.equal(result.ok, true);
  assert.deepEqual(processed, ['turn-0:old']);
  assert.deepEqual(result.value.processedEventIds, ['turn-0:old', 'turn-1:battle-9']);
});

test('event source and destroyed UIDs must resolve to exactly one physical card', () => {
  const game = makeGame();
  const source = addSource(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID);
  const destroyed = addDestroyedMonster(game, 1);
  game.core.players[0].grave.push({ uid: source.uid, id: source.id });
  assert.deepEqual(resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed)), {
    ok: false, reason: 'battle-source-not-found-or-identity-mismatch'
  });
  const clean = makeGame();
  const cleanSource = addSource(clean, ABSORBING_KID_FROM_THE_SKY_CARD_ID);
  const cleanDestroyed = addDestroyedMonster(clean, 1);
  assert.deepEqual(resolveTagBattleLifePointRecovery(clean, battleEvent(cleanSource, cleanDestroyed, {
    destroyedMonsterUid: 'm1:missing'
  })), { ok: false, reason: 'destroyed-monster-not-found-or-duplicate-uid' });
});

test('rejects unsupported source identities and malformed event IDs', () => {
  const game = makeGame();
  const source = addSource(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID);
  const destroyed = addDestroyedMonster(game, 1);
  assert.deepEqual(resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed, {
    sourceCardId: '00000000'
  })), { ok: false, reason: 'unsupported-battle-lp-source-card' });
  assert.deepEqual(resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed, {
    eventId: 'bad event id'
  })), { ok: false, reason: 'invalid-battle-event-id' });
});

test('does not mutate TagDuel LP, zones, or processed event input', () => {
  const game = makeGame();
  const source = addSource(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID);
  const destroyed = addDestroyedMonster(game, 1);
  const before = JSON.stringify(game);
  const processed = ['turn-0:old'];
  const result = resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed), processed);
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(game), before);
  assert.deepEqual(processed, ['turn-0:old']);
});

test('public summary never exposes UIDs or hidden card identities', () => {
  const summary = battleLifePointRecoveryPublicSummary();
  assert.match(summary, /UIDs, mãos e identidades privadas não são exibidos publicamente/i);
  assert.equal(summary.includes(ABSORBING_KID_FROM_THE_SKY_CARD_ID), false);
  assert.equal(summary.includes(GUARDIAN_ANGEL_JOAN_CARD_ID), false);
});

test('LP overflow is rejected without mutating the duel state', () => {
  const game = makeGame();
  const source = addSource(game, ABSORBING_KID_FROM_THE_SKY_CARD_ID);
  const destroyed = addDestroyedMonster(game, 1);
  game.core.players[0].lp = Number.MAX_SAFE_INTEGER;
  const before = JSON.stringify(game);
  const result = resolveTagBattleLifePointRecovery(game, battleEvent(source, destroyed));
  assert.equal(result.ok, false);
  assert.match(result.reason, /safe integer range/);
  assert.equal(JSON.stringify(game), before);
});
