const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  APPRENTICE_MAGICIAN_ID,
  eligibleApprenticeSpellCounterTargets,
  placeApprenticeSpellCounter,
  eligibleApprenticeRecruitTargets,
  prepareApprenticeRecruit
} = require('../dist/apprenticeMagician');

const counterTargets = [
  { uid: 'ally-monster', controller: 2, zone: 'monster', faceUp: true, canReceiveSpellCounter: true, spellCounters: 0 },
  { uid: 'opponent-field', controller: 3, zone: 'field', faceUp: true, canReceiveSpellCounter: true, spellCounters: 2 },
  { uid: 'hidden-opponent', controller: 1, zone: 'monster', faceUp: false, canReceiveSpellCounter: true, spellCounters: 0 },
  { uid: 'not-counterable', controller: 1, zone: 'spell-trap', faceUp: true, canReceiveSpellCounter: false, spellCounters: 0 },
  { uid: 'grave-card', controller: 0, zone: 'grave', faceUp: true, canReceiveSpellCounter: true, spellCounters: 0 }
];

const deck = [
  { uid: 'spellcaster-l1', cardId: '10000001', ownerSeat: 0, zone: 'deck', level: 1, race: 'Spellcaster', isToken: false, isExtraDeck: false, canSpecialSummon: true },
  { uid: 'spellcaster-l2', cardId: '10000002', ownerSeat: 0, zone: 'deck', level: 2, race: 'SPELLCASTER', isToken: false, isExtraDeck: false, canSpecialSummon: true },
  { uid: 'spellcaster-l3', cardId: '10000003', ownerSeat: 0, zone: 'deck', level: 3, race: 'Spellcaster', isToken: false, isExtraDeck: false, canSpecialSummon: true },
  { uid: 'warrior-l2', cardId: '10000004', ownerSeat: 0, zone: 'deck', level: 2, race: 'Warrior', isToken: false, isExtraDeck: false, canSpecialSummon: true },
  { uid: 'token-l1', cardId: '10000005', ownerSeat: 0, zone: 'deck', level: 1, race: 'Spellcaster', isToken: true, isExtraDeck: false, canSpecialSummon: true },
  { uid: 'extra-l2', cardId: '10000006', ownerSeat: 0, zone: 'extra', level: 2, race: 'Spellcaster', isToken: false, isExtraDeck: true, canSpecialSummon: true },
  { uid: 'locked-l1', cardId: '10000007', ownerSeat: 0, zone: 'deck', level: 1, race: 'Spellcaster', isToken: false, isExtraDeck: false, canSpecialSummon: false },
  { uid: 'partner-deck-card', cardId: '10000008', ownerSeat: 2, zone: 'deck', level: 1, race: 'Spellcaster', isToken: false, isExtraDeck: false, canSpecialSummon: true }
];

function recruitContext(patch = {}) {
  return {
    sourceCardId: APPRENTICE_MAGICIAN_ID,
    destroyedByBattle: true,
    effectNegated: false,
    teamMonsterZonesUsed: 1,
    sourceDeckOwnerSeat: 0,
    sourceDeck: deck,
    ...patch
  };
}

test('on-Summon Spell Counter target selection includes face-up counterable cards on either team', () => {
  assert.deepEqual(
    eligibleApprenticeSpellCounterTargets(APPRENTICE_MAGICIAN_ID, counterTargets),
    ['ally-monster', 'opponent-field']
  );
});

test('Spell Counter target selection excludes face-down, non-counterable, and non-field cards', () => {
  const ids = eligibleApprenticeSpellCounterTargets(APPRENTICE_MAGICIAN_ID, counterTargets);
  assert.ok(!ids.includes('hidden-opponent'));
  assert.ok(!ids.includes('not-counterable'));
  assert.ok(!ids.includes('grave-card'));
});

test('placing a Spell Counter increments exactly one and does not mutate the source target', () => {
  const before = counterTargets[0];
  const result = placeApprenticeSpellCounter(APPRENTICE_MAGICIAN_ID, 'ally-monster', counterTargets);
  assert.equal(result.ok, true);
  assert.equal(result.target.spellCounters, 1);
  assert.equal(before.spellCounters, 0);
});

test('Spell Counter placement rejects stale targets and wrong source cards', () => {
  assert.deepEqual(
    placeApprenticeSpellCounter(APPRENTICE_MAGICIAN_ID, 'hidden-opponent', counterTargets),
    { ok: false, reason: 'target-not-eligible' }
  );
  assert.deepEqual(
    placeApprenticeSpellCounter('00000000', 'ally-monster', counterTargets),
    { ok: false, reason: 'wrong-source' }
  );
});

test('recruitment is available only after battle destruction and while not negated', () => {
  assert.deepEqual(eligibleApprenticeRecruitTargets(recruitContext({ destroyedByBattle: false })), []);
  assert.deepEqual(eligibleApprenticeRecruitTargets(recruitContext({ effectNegated: true })), []);
});

test('recruitment filters only Level 1–2 Spellcasters from the supplied physical Deck', () => {
  assert.deepEqual(
    eligibleApprenticeRecruitTargets(recruitContext()),
    ['spellcaster-l1', 'spellcaster-l2']
  );
});

test('recruitment excludes tokens, Extra Deck cards, Level 3+, non-Spellcasters, and locked cards', () => {
  const ids = eligibleApprenticeRecruitTargets(recruitContext());
  for (const uid of ['spellcaster-l3', 'warrior-l2', 'token-l1', 'extra-l2', 'locked-l1']) {
    assert.ok(!ids.includes(uid));
  }
});

test('a full shared three-zone field prevents recruitment without mutating the Deck', () => {
  assert.deepEqual(eligibleApprenticeRecruitTargets(recruitContext({ teamMonsterZonesUsed: 3 })), []);
  assert.deepEqual(prepareApprenticeRecruit(recruitContext({ teamMonsterZonesUsed: 3 }), 'spellcaster-l1'), {
    ok: false,
    reason: 'no-zone'
  });
  assert.equal(deck.length, 8);
});

test('selection is revalidated by UID after the source Deck changes', () => {
  const stale = recruitContext({ sourceDeck: deck.filter(card => card.uid !== 'spellcaster-l1') });
  assert.deepEqual(prepareApprenticeRecruit(stale, 'spellcaster-l1'), {
    ok: false,
    reason: 'target-not-eligible'
  });
});

test('successful selection preserves physical UID and owner and prepares face-down Defense', () => {
  const result = prepareApprenticeRecruit(recruitContext(), 'spellcaster-l2');
  assert.deepEqual(result, {
    ok: true,
    uid: 'spellcaster-l2',
    cardId: '10000002',
    ownerSeat: 0,
    destination: 'monster-zone',
    position: 'def',
    faceUp: false
  });
});

test('duplicate physical UIDs are exposed only once', () => {
  const duplicated = recruitContext({
    sourceDeck: [...deck, { ...deck[0], ownerSeat: 2 }]
  });
  assert.deepEqual(
    eligibleApprenticeRecruitTargets(duplicated),
    ['spellcaster-l1', 'spellcaster-l2']
  );
});

test('a candidate from the partner physical Deck is rejected even if injected into the supplied list', () => {
  const mixed = recruitContext();
  assert.ok(!eligibleApprenticeRecruitTargets(mixed).includes('partner-deck-card'));
  assert.deepEqual(prepareApprenticeRecruit(mixed, 'partner-deck-card'), {
    ok: false,
    reason: 'target-not-eligible'
  });
});

test('no automatic summon or Deck mutation occurs when merely enumerating candidates', () => {
  const before = deck.map(card => ({ ...card }));
  eligibleApprenticeRecruitTargets(recruitContext());
  assert.deepEqual(deck, before);
});
