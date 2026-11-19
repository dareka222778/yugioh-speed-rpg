const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  AQUA_SPIRIT_CARD_ID,
  aquaSpiritSummonSource,
  prepareAquaSpiritSummon,
  payWaterGraveBanish,
  waterGraveBanishCandidates,
} = require('../dist/waterGraveCost.js');

const ids = {
  water: 'fixture-water-monster',
  waterFusion: 'fixture-water-fusion',
  waterRitual: 'fixture-water-ritual',
  fire: 'fixture-fire-monster',
  spell: 'fixture-spell',
  trap: 'fixture-trap',
};

const metadata = new Map([
  [ids.water, card(ids.water, { kind: 'monster', attribute: 'WATER' })],
  [ids.waterFusion, card(ids.waterFusion, { kind: 'monster', attribute: 'WATER', monsterType: 'fusion', fusion: ['a', 'b'] })],
  [ids.waterRitual, card(ids.waterRitual, { kind: 'monster', attribute: 'WATER', monsterType: 'ritual' })],
  [ids.fire, card(ids.fire, { kind: 'monster', attribute: 'FIRE' })],
  [ids.spell, card(ids.spell, { kind: 'spell', attribute: null })],
  [ids.trap, card(ids.trap, { kind: 'trap', attribute: null })],
]);

function card(id, overrides = {}) {
  return {
    id,
    konamiId: 0,
    name: id,
    englishName: id,
    kind: 'monster',
    race: 'Aqua',
    attribute: 'WATER',
    level: 4,
    atk: 1000,
    defense: 1000,
    summary: 'test fixture',
    source: 'https://www.db.yugioh-card.com/',
    monsterType: 'effect',
    ...overrides,
  };
}
const lookup = id => metadata.get(id);
const ref = (uid, id, extra = {}) => ({ uid, id, ...extra });

test('Aqua Spirit accepts only WATER monsters as its shared-Graveyard cost', () => {
  const grave = [
    ref('m0:water', ids.water),
    ref('m2:fire', ids.fire),
    ref('m0:spell', ids.spell),
    ref('m2:trap', ids.trap),
  ];

  assert.deepEqual(waterGraveBanishCandidates(grave, [], 0, lookup).map(c => c.uid), ['m0:water']);
});

test('the banish cost may use WATER Fusion and Ritual monsters regardless of revival history', () => {
  const grave = [
    ref('m0:fusion', ids.waterFusion),
    ref('m2:ritual', ids.waterRitual),
  ];

  assert.deepEqual(waterGraveBanishCandidates(grave, [], 0, lookup).map(c => c.uid), [
    'm0:fusion',
    'm2:ritual',
  ]);
});

test('tokens are not valid cards to banish from the Graveyard', () => {
  const grave = [ref('m0:token', ids.water, { entityKind: 'token' })];
  assert.deepEqual(waterGraveBanishCandidates(grave, [], 0, lookup), []);
});

test('the shared three-Monster-Zone cap prevents paying a cost for an impossible summon', () => {
  const grave = [ref('m0:water', ids.water)];

  assert.deepEqual(waterGraveBanishCandidates(grave, [], 3, lookup), []);
  assert.throws(() => waterGraveBanishCandidates(grave, [], 4, lookup), /Zone count/);
});

test('a selected WATER monster moves once to the shared banished zone and preserves object identity', () => {
  const paid = ref('m2:water', ids.water, { marker: 'physical-owner-2' });
  const grave = [ref('m0:other', ids.fire), paid];
  const banished = [];
  const result = payWaterGraveBanish(grave, banished, 1, paid.uid, lookup);

  assert.equal(result, paid);
  assert.deepEqual(grave.map(c => c.uid), ['m0:other']);
  assert.deepEqual(banished.map(c => c.uid), ['m2:water']);
  assert.equal(banished[0], paid);
  assert.equal(banished[0].marker, 'physical-owner-2');
});

test('the shared Graveyard can pay with a WATER monster owned by either teammate', () => {
  const grave = [
    ref('m0:water', ids.water),
    ref('m2:water', ids.water),
  ];
  const banished = [];
  const result = payWaterGraveBanish(grave, banished, 0, 'm2:water', lookup);

  assert.equal(result.uid, 'm2:water');
  assert.deepEqual(grave.map(c => c.uid), ['m0:water']);
  assert.deepEqual(banished.map(c => c.uid), ['m2:water']);
});

test('a forged or stale UID never pays a partial banish cost', () => {
  const grave = [ref('m0:water', ids.water)];
  const banished = [];
  const before = [...grave];

  assert.equal(payWaterGraveBanish(grave, banished, 0, 'm9:forged', lookup), null);
  grave.splice(0, 1);
  assert.equal(payWaterGraveBanish(grave, banished, 0, 'm0:water', lookup), null);
  assert.deepEqual(banished, []);
  assert.equal(before[0].uid, 'm0:water');
});

test('a full field does not move a selected cost card', () => {
  const grave = [ref('m0:water', ids.water)];
  const banished = [];
  const before = [...grave];

  assert.equal(payWaterGraveBanish(grave, banished, 3, 'm0:water', lookup), null);
  assert.deepEqual(grave, before);
  assert.deepEqual(banished, []);
});

test('duplicate physical UIDs inside the shared Graveyard are rejected', () => {
  assert.throws(() => waterGraveBanishCandidates([
    ref('m0:dup', ids.water),
    ref('m0:dup', ids.water),
  ], [], 0, lookup), /duplicate physical UID/);
});

test('a physical UID cannot exist in both the shared Graveyard and banished zone', () => {
  assert.throws(() => waterGraveBanishCandidates(
    [ref('m0:water', ids.water)],
    [ref('m0:water', ids.water)],
    0,
    lookup,
  ), /both Graveyard and banished zone/);
});

test('malformed physical references fail closed before a cost is paid', () => {
  assert.throws(() => waterGraveBanishCandidates([{}], [], 0, lookup), /invalid physical card reference/);
});

test('an empty shared Graveyard offers no cost and does not mutate the banished zone', () => {
  const banished = [];
  assert.deepEqual(waterGraveBanishCandidates([], banished, 0, lookup), []);
  assert.deepEqual(banished, []);
});

test('the banished zone is checked for duplicate UIDs before any movement', () => {
  const grave = [ref('m0:water', ids.water)];
  const banished = [ref('m2:existing', ids.fire), ref('m2:existing', ids.fire)];
  const before = [...grave];

  assert.throws(() => payWaterGraveBanish(grave, banished, 0, 'm0:water', lookup), /duplicate physical UID/);
  assert.deepEqual(grave, before);
  assert.equal(grave[0], before[0]);
});


test('Aqua Spirit must come from the active physical player hand supplied to the summon helper', () => {
  const source = ref('m0:aqua', AQUA_SPIRIT_CARD_ID);
  assert.equal(aquaSpiritSummonSource([source], source.uid, 0), source);
});

test('a card present only in the inactive partner hand is not visible to the active-hand helper', () => {
  const partnerHand = [ref('m2:aqua', AQUA_SPIRIT_CARD_ID)];
  assert.equal(aquaSpiritSummonSource([], partnerHand[0].uid, 0), null);
});

test('a forged UID or a different card identity cannot be used as Aqua Spirit', () => {
  assert.equal(aquaSpiritSummonSource([ref('m0:other', ids.water)], 'm0:other', 0), null);
  assert.equal(aquaSpiritSummonSource([ref('m0:aqua', AQUA_SPIRIT_CARD_ID)], 'm9:forged', 0), null);
});

test('Aqua Spirit cannot begin its summon procedure when all three shared Monster Zones are occupied', () => {
  const source = ref('m0:aqua', AQUA_SPIRIT_CARD_ID);
  assert.equal(aquaSpiritSummonSource([source], source.uid, 3), null);
});

test('duplicate physical UIDs in the active physical hand are rejected', () => {
  assert.throws(
    () => aquaSpiritSummonSource([
      ref('m0:aqua', AQUA_SPIRIT_CARD_ID),
      ref('m0:aqua', AQUA_SPIRIT_CARD_ID),
    ], 'm0:aqua', 0),
    /duplicate physical UID/,
  );
});


test('Aqua Spirit exposes cost choices only after validating the active-hand source and free shared zone', () => {
  const source = ref('m0:aqua', AQUA_SPIRIT_CARD_ID);
  const cost = ref('m2:water', ids.water);
  const plan = prepareAquaSpiritSummon([source], source.uid, [cost], [], 2, lookup);

  assert.equal(plan.source, source);
  assert.deepEqual(plan.costCandidates, [cost]);
  assert.equal(plan.costCandidates[0], cost);
});

test('Aqua Spirit does not expose a cost menu when the active physical hand lacks the source', () => {
  const cost = ref('m2:water', ids.water);
  assert.equal(prepareAquaSpiritSummon([], 'm0:aqua', [cost], [], 0, lookup), null);
});

test('Aqua Spirit does not expose a cost menu when no WATER monster is available', () => {
  const source = ref('m0:aqua', AQUA_SPIRIT_CARD_ID);
  assert.equal(prepareAquaSpiritSummon([source], source.uid, [ref('m2:fire', ids.fire)], [], 0, lookup), null);
});

test('Aqua Spirit does not expose a cost menu when the team field is full', () => {
  const source = ref('m0:aqua', AQUA_SPIRIT_CARD_ID);
  const cost = ref('m2:water', ids.water);
  assert.equal(prepareAquaSpiritSummon([source], source.uid, [cost], [], 3, lookup), null);
});

test('Aqua Spirit summon planning is read-only until the player confirms the cost', () => {
  const source = ref('m0:aqua', AQUA_SPIRIT_CARD_ID);
  const cost = ref('m2:water', ids.water);
  const hand = [source];
  const grave = [cost];
  const plan = prepareAquaSpiritSummon(hand, source.uid, grave, [], 0, lookup);

  assert.ok(plan);
  assert.equal(hand[0], source);
  assert.equal(grave[0], cost);
  assert.deepEqual(hand.map(c => c.uid), ['m0:aqua']);
  assert.deepEqual(grave.map(c => c.uid), ['m2:water']);
});
