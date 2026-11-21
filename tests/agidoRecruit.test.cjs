const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDuelRandom } = require('../dist/duelRandom.js');
const {
  AGIDO_CARD_ID,
  agidoRecruitCandidates,
  resolveAgidoRecruitSelection,
  rollAgidoDie,
} = require('../dist/agidoRecruit.js');

const ids = {
  agido: AGIDO_CARD_ID,
  fairy3: 'fixture-fairy-3',
  fairy4: 'fixture-fairy-4',
  fairy5: 'fixture-fairy-5',
  fairy6: 'fixture-fairy-6',
  fairy7: 'fixture-fairy-7',
  warrior4: 'fixture-warrior-4',
  spell4: 'fixture-spell-4',
  trap4: 'fixture-trap-4',
  fusion4: 'fixture-fusion-4',
  ritual6: 'fixture-ritual-6',
};

const metadata = new Map([
  [ids.agido, card(ids.agido, 4)],
  [ids.fairy3, card(ids.fairy3, 3)],
  [ids.fairy4, card(ids.fairy4, 4)],
  [ids.fairy5, card(ids.fairy5, 5)],
  [ids.fairy6, card(ids.fairy6, 6)],
  [ids.fairy7, card(ids.fairy7, 7)],
  [ids.warrior4, card(ids.warrior4, 4, { race: 'Warrior' })],
  [ids.spell4, card(ids.spell4, 4, { kind: 'spell', race: null })],
  [ids.trap4, card(ids.trap4, 4, { kind: 'trap', race: null })],
  [ids.fusion4, card(ids.fusion4, 4, { monsterType: 'fusion', fusion: ['a', 'b'] })],
  [ids.ritual6, card(ids.ritual6, 6, { monsterType: 'ritual' })],
]);

function card(id, level, overrides = {}) {
  return {
    id,
    konamiId: 0,
    name: id,
    englishName: id,
    kind: 'monster',
    race: 'Fairy',
    attribute: 'EARTH',
    level,
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

test('Agido rolls a deterministic six-sided result using the persisted private duel stream', () => {
  const a = createDuelRandom('1'.repeat(64));
  const b = createDuelRandom('1'.repeat(64));
  const first = rollAgidoDie(a);

  assert.ok(Number.isInteger(first) && first >= 1 && first <= 6);
  assert.equal(a.counter, 1);
  assert.equal(rollAgidoDie(b), first);
  assert.equal(b.counter, 1);
  assert.equal(a.seed, '1'.repeat(64));
});

test('Agido rejects malformed persisted random state', () => {
  assert.throws(
    () => rollAgidoDie({ algorithm: 'bad', seed: 'not-a-seed', counter: -1 }),
    /sorteio persistido/,
  );
});

test('rolls one through five require an exact Fairy Level match', () => {
  const grave = [
    ref('m0:agido', ids.agido),
    ref('m2:level-3', ids.fairy3),
    ref('m0:level-4', ids.fairy4),
    ref('m2:level-5', ids.fairy5),
  ];

  assert.deepEqual(agidoRecruitCandidates(grave, 3, 0, lookup).map(c => c.uid), ['m2:level-3']);
  assert.deepEqual(agidoRecruitCandidates(grave, 4, 0, lookup).map(c => c.uid), ['m0:agido', 'm0:level-4']);
  assert.deepEqual(agidoRecruitCandidates(grave, 5, 0, lookup).map(c => c.uid), ['m2:level-5']);
});

test('a result of six permits Level 6 or higher Fairies, but not lower Levels', () => {
  const grave = [
    ref('m0:level-5', ids.fairy5),
    ref('m2:level-6', ids.fairy6),
    ref('m0:level-7', ids.fairy7),
  ];

  assert.deepEqual(agidoRecruitCandidates(grave, 6, 0, lookup).map(c => c.uid), [
    'm2:level-6',
    'm0:level-7',
  ]);
});

test('the shared Graveyard can contain eligible cards from either physical teammate', () => {
  const grave = [
    ref('m0:fairy', ids.fairy4),
    ref('m2:fairy', ids.fairy4),
  ];
  const candidates = agidoRecruitCandidates(grave, 4, 1, lookup);

  assert.deepEqual(candidates.map(c => c.uid), ['m0:fairy', 'm2:fairy']);
  assert.equal(candidates[0], grave[0]);
  assert.equal(candidates[1], grave[1]);
});

test('Agido itself is a legal Level 4 Fairy candidate when the die result is four', () => {
  const agido = ref('m2:agido', ids.agido);
  const candidates = agidoRecruitCandidates([agido], 4, 0, lookup);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0], agido);
});

test('non-Fairy monsters and non-monster cards are never offered', () => {
  const grave = [
    ref('m0:warrior', ids.warrior4),
    ref('m2:spell', ids.spell4),
    ref('m0:trap', ids.trap4),
  ];

  assert.deepEqual(agidoRecruitCandidates(grave, 4, 0, lookup), []);
});

test('tokens are excluded from the Graveyard recruitment choices', () => {
  const grave = [ref('m0:token', ids.fairy4, { entityKind: 'token' })];

  assert.deepEqual(agidoRecruitCandidates(grave, 4, 0, lookup), []);
});

test('Fusion and Ritual Fairies require properly-summoned history before revival', () => {
  const grave = [
    ref('m0:fusion-unqualified', ids.fusion4),
    ref('m2:fusion-qualified', ids.fusion4, { properlySummoned: true }),
    ref('m0:ritual-unqualified', ids.ritual6),
    ref('m2:ritual-qualified', ids.ritual6, { properlySummoned: true }),
  ];

  assert.deepEqual(agidoRecruitCandidates(grave, 4, 0, lookup).map(c => c.uid), [
    'm2:fusion-qualified',
  ]);
  assert.deepEqual(agidoRecruitCandidates(grave, 6, 0, lookup).map(c => c.uid), [
    'm2:ritual-qualified',
  ]);
});

test('the shared three-Monster-Zone cap prevents a fourth Special Summon', () => {
  const grave = [ref('m0:fairy', ids.fairy4)];

  assert.deepEqual(agidoRecruitCandidates(grave, 4, 3, lookup), []);
  assert.throws(() => agidoRecruitCandidates(grave, 4, 4, lookup), /Zone count/);
});

test('duplicate physical UIDs in the shared Graveyard are rejected', () => {
  assert.throws(
    () => agidoRecruitCandidates([
      ref('m0:duplicate', ids.fairy4),
      ref('m0:duplicate', ids.fairy4),
    ], 4, 0, lookup),
    /duplicate physical UID/,
  );
});

test('malformed Graveyard references fail closed', () => {
  assert.throws(() => agidoRecruitCandidates([{}], 4, 0, lookup), /invalid physical card reference/);
});

test('invalid die results and field counts are rejected', () => {
  const grave = [ref('m0:fairy', ids.fairy4)];

  for (const roll of [0, 7, 1.5, NaN]) {
    assert.throws(() => agidoRecruitCandidates(grave, roll, 0, lookup), /die result/);
  }
  for (const count of [-1, 1.5, 4]) {
    assert.throws(() => agidoRecruitCandidates(grave, 4, count, lookup), /Zone count/);
  }
});

test('the optional selection returns the exact physical reference, not a reconstructed card', () => {
  const selected = ref('m2:fairy', ids.fairy4, { marker: 'physical-owner-2' });
  const grave = [ref('m0:other', ids.fairy4), selected];
  const result = resolveAgidoRecruitSelection(grave, 4, 0, selected.uid, lookup);

  assert.equal(result, selected);
  assert.equal(result.marker, 'physical-owner-2');
});

test('a stale or forged UID cannot be selected after the shared Graveyard changes', () => {
  const selected = ref('m2:fairy', ids.fairy4);
  const grave = [selected];

  assert.equal(resolveAgidoRecruitSelection(grave, 4, 0, 'm9:forged', lookup), null);
  grave.splice(0, 1);
  assert.equal(resolveAgidoRecruitSelection(grave, 4, 0, selected.uid, lookup), null);
});

test('the optional effect can be declined without moving or rewriting any Graveyard card', () => {
  const grave = [ref('m0:fairy', ids.fairy4), ref('m2:fairy', ids.fairy4)];
  const before = [...grave];

  assert.equal(resolveAgidoRecruitSelection(grave, 4, 0, null, lookup), null);
  assert.deepEqual(grave, before);
  assert.equal(grave[0], before[0]);
  assert.equal(grave[1], before[1]);
});

test('declining still validates the current shared-field and Graveyard invariants', () => {
  assert.throws(
    () => resolveAgidoRecruitSelection([{}], 4, 0, null, lookup),
    /invalid physical card reference/,
  );
});

test('candidate discovery never mutates the shared Graveyard', () => {
  const grave = [ref('m0:fairy', ids.fairy4), ref('m2:warrior', ids.warrior4)];
  const before = [...grave];

  agidoRecruitCandidates(grave, 4, 0, lookup);

  assert.deepEqual(grave, before);
  assert.equal(grave[0], before[0]);
  assert.equal(grave[1], before[1]);
});
