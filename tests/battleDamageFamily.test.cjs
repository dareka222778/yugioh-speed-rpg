const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  routeAmazonessSwordsWomanBattleDamage,
  applyAtomicFireflyBattleRetaliation,
  resolveAirknightParshathDraw,
  aswanApparitionRecoveryOptions,
  chooseAswanApparitionRecovery,
} = require('../dist/battleDamageFamily.js');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'evidence', 'm399-battle-damage-family.json'),
  'utf8',
));

test('Amazoness Swords Woman redirects the exact battle damage to the opposing team', () => {
  const result = routeAmazonessSwordsWomanBattleDamage({
    battleDamageByTeam: [700, 0],
    battleInvolvesSource: true,
    sourceControllerTeam: 0,
    opposingTeam: 1,
  });
  assert.deepEqual(result.battleDamageByTeam, [0, 700]);
  assert.equal(result.redirectedDamage, 700);
  assert.equal(result.recipientTeam, 1);
});

test('Amazoness Swords Woman conserves total LP damage and does not mutate the input', () => {
  const original = [1250, 200];
  const result = routeAmazonessSwordsWomanBattleDamage({
    battleDamageByTeam: original,
    battleInvolvesSource: true,
    sourceControllerTeam: 0,
    opposingTeam: 1,
  });
  assert.deepEqual(original, [1250, 200]);
  assert.deepEqual(result.battleDamageByTeam, [0, 1450]);
  assert.equal(result.battleDamageByTeam.reduce((sum, value) => sum + value, 0), 1450);
});

test('Amazoness Swords Woman does not redirect damage when the battle did not involve it', () => {
  const result = routeAmazonessSwordsWomanBattleDamage({
    battleDamageByTeam: [900, 0],
    battleInvolvesSource: false,
    sourceControllerTeam: 0,
    opposingTeam: 1,
  });
  assert.deepEqual(result.battleDamageByTeam, [900, 0]);
  assert.equal(result.redirectedDamage, 0);
  assert.equal(result.recipientTeam, null);
});

test('Amazoness Swords Woman does not redirect when its controller team would take no battle damage', () => {
  const result = routeAmazonessSwordsWomanBattleDamage({
    battleDamageByTeam: [0, 800],
    battleInvolvesSource: true,
    sourceControllerTeam: 0,
    opposingTeam: 1,
  });
  assert.deepEqual(result.battleDamageByTeam, [0, 800]);
  assert.equal(result.redirectedDamage, 0);
});

test('Amazoness Swords Woman rejects an invalid same-team opponent mapping', () => {
  assert.throws(() => routeAmazonessSwordsWomanBattleDamage({
    battleDamageByTeam: [100, 0],
    battleInvolvesSource: true,
    sourceControllerTeam: 0,
    opposingTeam: 0,
  }), /must differ/);
});

test('Atomic Firefly retaliates against the team that destroyed it by battle', () => {
  const result = applyAtomicFireflyBattleRetaliation({
    battleDamageByTeam: [0, 350],
    sourceFaceUpAtBattleStart: true,
    destroyedByBattle: true,
    sourceControllerTeam: 0,
    destroyingTeam: 1,
  });
  assert.deepEqual(result.battleDamageByTeam, [0, 1350]);
  assert.equal(result.triggered, true);
  assert.equal(result.retaliationDamage, 1000);
  assert.equal(result.recipientTeam, 1);
});

test('Atomic Firefly requires the source to have been face-up when battle began', () => {
  const result = applyAtomicFireflyBattleRetaliation({
    battleDamageByTeam: [0, 0],
    sourceFaceUpAtBattleStart: false,
    destroyedByBattle: true,
    sourceControllerTeam: 0,
    destroyingTeam: 1,
  });
  assert.equal(result.triggered, false);
  assert.deepEqual(result.battleDamageByTeam, [0, 0]);
});

test('Atomic Firefly does not trigger when removed by an effect instead of battle', () => {
  const result = applyAtomicFireflyBattleRetaliation({
    battleDamageByTeam: [0, 0],
    sourceFaceUpAtBattleStart: true,
    destroyedByBattle: false,
    sourceControllerTeam: 0,
    destroyingTeam: 1,
  });
  assert.equal(result.triggered, false);
  assert.equal(result.retaliationDamage, 0);
});

test('Atomic Firefly does not punish its own controller team', () => {
  const result = applyAtomicFireflyBattleRetaliation({
    battleDamageByTeam: [0, 0],
    sourceFaceUpAtBattleStart: true,
    destroyedByBattle: true,
    sourceControllerTeam: 0,
    destroyingTeam: 0,
  });
  assert.equal(result.triggered, false);
  assert.deepEqual(result.battleDamageByTeam, [0, 0]);
});

test('Airknight Parshath draws only after positive battle damage', () => {
  const result = resolveAirknightParshathDraw({
    damageKind: 'battle',
    battleDamageInflicted: 1,
    effectControllerSeat: 2,
    sourcePhysicalOwnerSeat: 0,
  });
  assert.deepEqual(result, {
    shouldDraw: true,
    drawCount: 1,
    drawSeat: 2,
    sourcePhysicalOwnerSeat: 0,
  });
});

test('Airknight Parshath does not draw when battle damage is zero', () => {
  const result = resolveAirknightParshathDraw({
    damageKind: 'battle',
    battleDamageInflicted: 0,
    effectControllerSeat: 2,
    sourcePhysicalOwnerSeat: 0,
  });
  assert.equal(result.shouldDraw, false);
  assert.equal(result.drawCount, 0);
  assert.equal(result.drawSeat, null);
});

test('Airknight Parshath does not mistake effect damage for battle damage', () => {
  const result = resolveAirknightParshathDraw({
    damageKind: 'effect',
    battleDamageInflicted: 500,
    effectControllerSeat: 2,
    sourcePhysicalOwnerSeat: 0,
  });
  assert.equal(result.shouldDraw, false);
  assert.equal(result.drawSeat, null);
});

test('Airknight Parshath resolves the draw for the effect controller, not the card owner', () => {
  const result = resolveAirknightParshathDraw({
    damageKind: 'battle',
    battleDamageInflicted: 400,
    effectControllerSeat: 3,
    sourcePhysicalOwnerSeat: 1,
  });
  assert.equal(result.drawSeat, 3);
  assert.notEqual(result.drawSeat, result.sourcePhysicalOwnerSeat);
});

test('Aswan Apparition offers only shared-Graveyard Traps after battle damage', () => {
  const trap = { uid: 'm1:trap-1', id: '51482758', kind: 'trap', physicalOwnerSeat: 1 };
  const options = aswanApparitionRecoveryOptions({
    damageKind: 'battle',
    battleDamageInflicted: 250,
    effectControllerSeat: 2,
    sharedGraveyard: [
      { uid: 'm0:monster-1', id: '46986414', kind: 'monster', physicalOwnerSeat: 0 },
      { uid: 'm3:spell-1', id: '55144522', kind: 'spell', physicalOwnerSeat: 3 },
      trap,
    ],
  });
  assert.equal(options.available, true);
  assert.deepEqual(options.targets, [trap]);
  assert.equal(options.deckTopSeat, 2);
});

test('Aswan Apparition offers no recovery after zero battle damage or effect damage', () => {
  const trap = { uid: 'm1:trap-1', id: '51482758', kind: 'trap', physicalOwnerSeat: 1 };
  const zero = aswanApparitionRecoveryOptions({
    damageKind: 'battle',
    battleDamageInflicted: 0,
    effectControllerSeat: 2,
    sharedGraveyard: [trap],
  });
  const effect = aswanApparitionRecoveryOptions({
    damageKind: 'effect',
    battleDamageInflicted: 500,
    effectControllerSeat: 2,
    sharedGraveyard: [trap],
  });
  assert.equal(zero.available, false);
  assert.equal(effect.available, false);
  assert.deepEqual(zero.targets, []);
  assert.deepEqual(effect.targets, []);
});

test('Aswan Apparition preserves the Trap UID and owner while placing it atop the resolving seat Deck', () => {
  const trap = { uid: 'm0:trap-7', id: '51482758', kind: 'trap', physicalOwnerSeat: 0 };
  const options = aswanApparitionRecoveryOptions({
    damageKind: 'battle',
    battleDamageInflicted: 100,
    effectControllerSeat: 2,
    sharedGraveyard: [trap],
  });
  const selected = chooseAswanApparitionRecovery(options, trap.uid);
  assert.ok(selected);
  assert.equal(selected.card, trap);
  assert.equal(selected.card.uid, 'm0:trap-7');
  assert.equal(selected.card.physicalOwnerSeat, 0);
  assert.equal(selected.deckTopSeat, 2);
});

test('Aswan Apparition rejects stale UIDs and non-Trap selections', () => {
  const options = aswanApparitionRecoveryOptions({
    damageKind: 'battle',
    battleDamageInflicted: 100,
    effectControllerSeat: 1,
    sharedGraveyard: [
      { uid: 'm1:trap-1', id: '51482758', kind: 'trap', physicalOwnerSeat: 1 },
    ],
  });
  assert.equal(chooseAswanApparitionRecovery(options, 'stale-uid'), null);
  assert.equal(chooseAswanApparitionRecovery(options, ''), null);
});

test('Aswan Apparition rejects duplicate physical UIDs in the shared Graveyard', () => {
  assert.throws(() => aswanApparitionRecoveryOptions({
    damageKind: 'battle',
    battleDamageInflicted: 100,
    effectControllerSeat: 2,
    sharedGraveyard: [
      { uid: 'same', id: '51482758', kind: 'trap', physicalOwnerSeat: 0 },
      { uid: 'same', id: '51482758', kind: 'trap', physicalOwnerSeat: 2 },
    ],
  }), /duplicate physical UID/);
});

test('battle-damage helpers reject malformed totals and invalid physical seats', () => {
  assert.throws(() => routeAmazonessSwordsWomanBattleDamage({
    battleDamageByTeam: [-1, 0],
    battleInvolvesSource: true,
    sourceControllerTeam: 0,
    opposingTeam: 1,
  }), /non-negative/);
  assert.throws(() => applyAtomicFireflyBattleRetaliation({
    battleDamageByTeam: [0, Number.MAX_SAFE_INTEGER],
    sourceFaceUpAtBattleStart: true,
    destroyedByBattle: true,
    sourceControllerTeam: 0,
    destroyingTeam: 1,
  }), /safe integer range/);
  assert.throws(() => resolveAirknightParshathDraw({
    damageKind: 'battle',
    battleDamageInflicted: 100,
    effectControllerSeat: 4,
    sourcePhysicalOwnerSeat: 0,
  }), /seat from 0 to 3/);
});

test('M399 evidence keeps all four candidates source-linked and explicitly uncertified', () => {
  assert.equal(evidence.mission, 'M399');
  assert.equal(evidence.cards.length, 4);
  for (const card of evidence.cards) {
    assert.equal(card.sourceVerified, true);
    assert.match(card.officialSourceUrl, /^https:\/\/www\.db\.yugioh-card\.com\//);
    assert.equal(card.historicalEligibility, 'pending OCG/TCG first-release audit');
    assert.equal(card.certificationStatus, 'not-certified');
    assert.equal(card.automaticCertification, false);
    assert.match(card.behavioralTestStatus, /engine integration pending/);
  }
});
