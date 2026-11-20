const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  BATTLE_DESTROYED_RECRUIT_CARDS,
  teamOfSeat,
  planBattleDestroyedRecruit,
  resolveBattleDestroyedRecruit,
} = require('../dist/battleDestroyedRecruitFamily.js');

function source(id, overrides = {}) {
  const physicalOwnerSeat = overrides.physicalOwnerSeat ?? 0;
  return {
    uid: overrides.uid ?? 'source-uid',
    id,
    physicalOwnerSeat,
    controllerTeamAtDestruction: overrides.controllerTeamAtDestruction ?? (physicalOwnerSeat % 2),
    zone: 'grave',
    graveyardTeam: overrides.graveyardTeam ?? (physicalOwnerSeat % 2),
    destroyedByBattle: overrides.destroyedByBattle ?? true,
    sentToGraveByBattle: overrides.sentToGraveByBattle ?? true,
    destroyedTurn: overrides.destroyedTurn ?? 8,
  };
}

function deckCard(id, uid, physicalOwnerSeat = 0) {
  return { uid, id, physicalOwnerSeat, zone: 'deck', kind: 'monster' };
}

function plan(id, overrides = {}) {
  return planBattleDestroyedRecruit({
    source: source(id, overrides),
    currentTurn: overrides.currentTurn ?? 8,
  });
}

function resolve(id, overrides = {}) {
  const planned = plan(id, overrides);
  assert.equal(planned.ok, true, planned.ok ? '' : planned.reason);
  return resolveBattleDestroyedRecruit({
    plan: planned.value,
    lifePointsByTeam: overrides.lifePointsByTeam ?? [4000, 4000],
    ownerDeckAtResolution: overrides.deck ?? [],
    occupiedMonsterZoneIndices: overrides.occupied ?? [],
    selectedUids: overrides.selected ?? [],
  });
}

test('card identities preserve exact passcodes and Konami database IDs', () => {
  assert.deepEqual(BATTLE_DESTROYED_RECRUIT_CARDS, {
    giantGerm: { id: '95178994', konamiId: 4921, lpEffect: 'damage', amount: 500, position: 'face-up-attack' },
    nimbleMomonga: { id: '22567609', konamiId: 4922, lpEffect: 'gain', amount: 1000, position: 'face-down-defense' },
  });
});

test('2v2 seat mapping is 0/2 versus 1/3 and rejects invalid seats', () => {
  assert.equal(teamOfSeat(0), 0);
  assert.equal(teamOfSeat(2), 0);
  assert.equal(teamOfSeat(1), 1);
  assert.equal(teamOfSeat(3), 1);
  assert.equal(teamOfSeat(4), undefined);
  assert.equal(teamOfSeat(-1), undefined);
});

test('Giant Germ plans 500 damage to the opposing team and face-up Attack recruitment', () => {
  const result = plan(BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id);
  assert.equal(result.ok, true);
  assert.deepEqual({
    ownerTeam: result.value.ownerTeam,
    opposingTeam: result.value.opposingTeam,
    lpEffect: result.value.lpEffect,
    lpAmount: result.value.lpAmount,
    summonPosition: result.value.summonPosition,
  }, { ownerTeam: 0, opposingTeam: 1, lpEffect: 'damage', lpAmount: 500, summonPosition: 'face-up-attack' });
});

test('Nimble Momonga plans 1000 LP gain and face-down Defense recruitment', () => {
  const result = plan(BATTLE_DESTROYED_RECRUIT_CARDS.nimbleMomonga.id);
  assert.equal(result.ok, true);
  assert.deepEqual({
    ownerTeam: result.value.ownerTeam,
    lpEffect: result.value.lpEffect,
    lpAmount: result.value.lpAmount,
    summonPosition: result.value.summonPosition,
  }, { ownerTeam: 0, lpEffect: 'gain', lpAmount: 1000, summonPosition: 'face-down-defense' });
});

test('the physical owner receives Giant Germ effect even when the opposing team controlled it at destruction', () => {
  const result = plan(BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id, {
    physicalOwnerSeat: 2,
    controllerTeamAtDestruction: 1,
    graveyardTeam: 0,
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.physicalOwnerSeat, 2);
  assert.equal(result.value.ownerTeam, 0);
  assert.equal(result.value.controllerTeamAtDestruction, 1);
  assert.equal(result.value.opposingTeam, 1);
});

test('a stolen Nimble Momonga heals its physical owner team, not its temporary controller', () => {
  const result = plan(BATTLE_DESTROYED_RECRUIT_CARDS.nimbleMomonga.id, {
    physicalOwnerSeat: 3,
    controllerTeamAtDestruction: 0,
    graveyardTeam: 1,
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.physicalOwnerSeat, 3);
  assert.equal(result.value.ownerTeam, 1);
  assert.equal(result.value.controllerTeamAtDestruction, 0);
  assert.equal(result.value.opposingTeam, 0);
});

test('battle trigger requires the card to be destroyed by battle and sent to the Graveyard', () => {
  assert.deepEqual(plan(BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id, { destroyedByBattle: false }), {
    ok: false, reason: 'source-not-destroyed-by-battle-and-sent-to-grave',
  });
  assert.deepEqual(plan(BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id, { sentToGraveByBattle: false }), {
    ok: false, reason: 'source-not-destroyed-by-battle-and-sent-to-grave',
  });
});

test('the source must be in the physical owner team shared Graveyard', () => {
  assert.deepEqual(plan(BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id, { graveyardTeam: 1 }), {
    ok: false, reason: 'source-not-in-physical-owners-shared-graveyard',
  });
});

test('the trigger cannot be replayed in a different turn', () => {
  assert.deepEqual(plan(BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id, { currentTurn: 9 }), {
    ok: false, reason: 'trigger-from-different-turn',
  });
});

test('unknown cards and malformed physical seats are rejected', () => {
  assert.deepEqual(plan('00000000'), { ok: false, reason: 'unsupported-card-id' });
  assert.deepEqual(plan(BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id, { physicalOwnerSeat: 4 }), {
    ok: false, reason: 'invalid-physical-owner-seat',
  });
});

test('Giant Germ applies damage even when the owner chooses to summon zero copies', () => {
  const result = resolve(BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id, {
    lifePointsByTeam: [4000, 300],
    selected: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.lpTeam, 1);
  assert.equal(result.value.lpBefore, 300);
  assert.equal(result.value.lpAfter, 0);
  assert.equal(result.value.lpChange, -300);
  assert.deepEqual(result.value.summoned, []);
});

test('Nimble Momonga gains LP for its owner team and does not change the opponent LP', () => {
  const result = resolve(BATTLE_DESTROYED_RECRUIT_CARDS.nimbleMomonga.id, {
    lifePointsByTeam: [3500, 1700],
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.lpTeam, 0);
  assert.equal(result.value.lpBefore, 3500);
  assert.equal(result.value.lpAfter, 4500);
  assert.equal(result.value.lpChange, 1000);
});

test('Giant Germ summons selected same-name copies face-up in the first free shared zones', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id;
  const result = resolve(id, {
    deck: [deckCard(id, 'germ-a'), deckCard(id, 'germ-b'), deckCard('00000001', 'other')],
    occupied: [1],
    selected: ['germ-b', 'germ-a'],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.summoned.map(card => ({ uid: card.uid, zone: card.monsterZoneIndex, position: card.position })), [
    { uid: 'germ-b', zone: 0, position: 'face-up-attack' },
    { uid: 'germ-a', zone: 2, position: 'face-up-attack' },
  ]);
  assert.deepEqual(result.value.remainingMonsterZoneIndices, []);
});

test('Nimble Momonga summons face-down Defense copies from the physical owner Deck', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.nimbleMomonga.id;
  const result = resolve(id, {
    physicalOwnerSeat: 2,
    graveyardTeam: 0,
    deck: [deckCard(id, 'momonga-a', 2), deckCard(id, 'momonga-b', 2)],
    selected: ['momonga-a'],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.summoned, [{
    uid: 'momonga-a', id, physicalOwnerSeat: 2, controllerTeam: 0, monsterZoneIndex: 0, position: 'face-down-defense',
  }]);
});

test('the summoned cards keep their physical owner even though the team shares the field', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id;
  const result = resolve(id, {
    physicalOwnerSeat: 2,
    graveyardTeam: 0,
    deck: [deckCard(id, 'germ-owned-by-seat-2', 2)],
    selected: ['germ-owned-by-seat-2'],
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.summoned[0].physicalOwnerSeat, 2);
  assert.equal(result.value.summoned[0].controllerTeam, 0);
});

test('the partner private Deck cannot be searched or used for recruitment', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id;
  const result = resolve(id, {
    deck: [deckCard(id, 'partner-copy', 2)],
    selected: ['partner-copy'],
  });
  assert.deepEqual(result, { ok: false, reason: 'deck-card-not-in-physical-owners-private-deck' });
});

test('only the exact same-name card ID is eligible', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id;
  const result = resolve(id, {
    deck: [deckCard(BATTLE_DESTROYED_RECRUIT_CARDS.nimbleMomonga.id, 'momonga'), deckCard('00000001', 'other')],
    selected: [],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.summoned, []);
});

test('a full three-zone shared Monster Zone still resolves the LP effect', () => {
  const result = resolve(BATTLE_DESTROYED_RECRUIT_CARDS.nimbleMomonga.id, {
    occupied: [0, 1, 2],
    deck: [deckCard(BATTLE_DESTROYED_RECRUIT_CARDS.nimbleMomonga.id, 'momonga-a')],
    selected: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.lpAfter, 5000);
  assert.deepEqual(result.value.summoned, []);
  assert.deepEqual(result.value.remainingMonsterZoneIndices, []);
});

test('selection cannot exceed the free shared Monster Zone capacity', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id;
  const result = resolve(id, {
    occupied: [0, 1],
    deck: [deckCard(id, 'germ-a'), deckCard(id, 'germ-b')],
    selected: ['germ-a', 'germ-b'],
  });
  assert.deepEqual(result, { ok: false, reason: 'selection-exceeds-free-shared-monster-zones' });
});

test('selection cannot include more cards than the available same-name copies', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id;
  const result = resolve(id, {
    deck: [deckCard(id, 'germ-a'), deckCard('00000001', 'other')],
    selected: ['germ-a', 'other'],
  });
  assert.deepEqual(result, { ok: false, reason: 'selected-card-not-eligible-same-name-copy' });
});

test('selected UIDs must belong to the same-name cards in the owner Deck', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id;
  const result = resolve(id, {
    deck: [deckCard('00000001', 'other')],
    selected: ['other'],
  });
  assert.deepEqual(result, { ok: false, reason: 'selected-card-not-eligible-same-name-copy' });
});

test('duplicate physical UIDs across source Graveyard and Deck are rejected', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id;
  const result = resolve(id, {
    deck: [deckCard(id, 'source-uid')],
    selected: [],
  });
  assert.deepEqual(result, { ok: false, reason: 'duplicate-physical-uid-across-graveyard-and-deck' });
});

test('duplicate selected UIDs and duplicate deck UIDs are rejected', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id;
  assert.deepEqual(resolve(id, {
    deck: [deckCard(id, 'germ-a')],
    selected: ['germ-a', 'germ-a'],
  }), { ok: false, reason: 'duplicate-or-invalid-selected-uid' });
  assert.deepEqual(resolve(id, {
    deck: [deckCard(id, 'same'), deckCard(id, 'same')],
    selected: [],
  }), { ok: false, reason: 'duplicate-physical-uid-across-graveyard-and-deck' });
});

test('invalid or duplicated shared Monster Zone indexes are rejected', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id;
  assert.deepEqual(resolve(id, { occupied: [0, 0] }), { ok: false, reason: 'invalid-occupied-monster-zones' });
  assert.deepEqual(resolve(id, { occupied: [3] }), { ok: false, reason: 'invalid-occupied-monster-zones' });
});

test('invalid Deck zones and malformed Deck cards are rejected', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id;
  assert.deepEqual(resolve(id, { deck: [{ ...deckCard(id, 'bad'), zone: 'hand' }] }), {
    ok: false, reason: 'invalid-owner-deck-card',
  });
});

test('owner Deck size above the configured 30-card maximum is rejected', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id;
  const deck = Array.from({ length: 31 }, (_, i) => deckCard(id, `germ-${i}`));
  assert.deepEqual(resolve(id, { deck, selected: [] }), { ok: false, reason: 'invalid-owner-deck-size' });
});

test('controller team and Graveyard team are validated as team IDs, not seat IDs', () => {
  assert.deepEqual(plan(BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id, { controllerTeamAtDestruction: 2 }), {
    ok: false, reason: 'invalid-controller-team',
  });
  assert.deepEqual(plan(BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id, { graveyardTeam: 2 }), {
    ok: false, reason: 'source-not-in-physical-owners-shared-graveyard',
  });
});

test('resolution rejects a modified plan that no longer matches the registered card effect', () => {
  const planned = plan(BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id);
  assert.equal(planned.ok, true);
  const tampered = { ...planned.value, lpAmount: 1000 };
  assert.deepEqual(resolveBattleDestroyedRecruit({
    plan: tampered,
    lifePointsByTeam: [4000, 4000],
    ownerDeckAtResolution: [],
    occupiedMonsterZoneIndices: [],
    selectedUids: [],
  }), { ok: false, reason: 'plan-does-not-match-registered-card-rule' });
});

test('LP inputs must be safe non-negative integers', () => {
  const result = resolve(BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id, { lifePointsByTeam: [-1, 4000] });
  assert.deepEqual(result, { ok: false, reason: 'invalid-team-life-points' });
});

test('LP gain overflow is rejected rather than silently losing integer precision', () => {
  const result = resolve(BATTLE_DESTROYED_RECRUIT_CARDS.nimbleMomonga.id, {
    lifePointsByTeam: [Number.MAX_SAFE_INTEGER, 4000],
  });
  assert.deepEqual(result, { ok: false, reason: 'life-point-result-outside-safe-integer-range' });
});

test('the helpers do not mutate source Deck, LP, or occupied-zone inputs', () => {
  const id = BATTLE_DESTROYED_RECRUIT_CARDS.giantGerm.id;
  const deck = [deckCard(id, 'germ-a'), deckCard(id, 'germ-b')];
  const lp = [4000, 4000];
  const occupied = [1];
  const beforeDeck = structuredClone(deck);
  const result = resolve(id, { deck, lifePointsByTeam: lp, occupied, selected: ['germ-a'] });
  assert.equal(result.ok, true);
  assert.deepEqual(deck, beforeDeck);
  assert.deepEqual(lp, [4000, 4000]);
  assert.deepEqual(occupied, [1]);
});
