'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ARMED_DRAGON_LV3_ID,
  ARMED_DRAGON_LV5_ID,
  ARMED_DRAGON_LV7_ID,
  armedDragonLevelUpCandidates,
  armedDragonLv7MayBeNormalSummonedOrSet,
  armedDragonLv7SummonSourceAllowed,
  armedDragonLv7MayBeRevived,
  armedDragonDiscardTargets,
  resolveArmedDragonDiscard,
  armedDragonLv5DestroyCandidates,
  resolveArmedDragonLv5DestroyTarget,
  armedDragonLv7DestroyTargets,
} = require('../dist/armedDragonEvolution.js');

const ids = {
  lv3: ARMED_DRAGON_LV3_ID,
  lv5: ARMED_DRAGON_LV5_ID,
  lv7: ARMED_DRAGON_LV7_ID,
  monster: 'fixture-monster',
  spell: 'fixture-spell',
  trap: 'fixture-trap',
};
const metadata = new Map([
  [ids.lv3, card(ids.lv3, 'monster')],
  [ids.lv5, card(ids.lv5, 'monster')],
  [ids.lv7, card(ids.lv7, 'monster')],
  [ids.monster, card(ids.monster, 'monster')],
  [ids.spell, card(ids.spell, 'spell')],
  [ids.trap, card(ids.trap, 'trap')],
]);
function card(id, kind) {
  return { id, kind, name: id, englishName: id, konamiId: 0, race: 'Dragon',
    attribute: 'WIND', level: 3, atk: 1000, defense: 1000,
    summary: 'isolated Armed Dragon fixture', source: 'https://www.db.yugioh-card.com/' };
}
const lookup = id => metadata.get(id);
const ref = (uid, id, extra = {}) => ({ uid, id, ...extra });
const monster = (uid, team, faceUp, atk) => ({ uid, id: 'fixture-field-monster', team, faceUp, atk });
const currentAtk = value => value.atk;

test('LV3 offers LV5 from the active physical hand and Deck during Standby Phase', () => {
  const hand = [ref('m0:lv5-hand', ids.lv5, { ownerSeat: 0 })];
  const deck = [ref('m0:lv5-deck', ids.lv5, { ownerSeat: 0 })];
  const candidates = armedDragonLevelUpCandidates(
    ids.lv3, true, 'standby', false, 0, 0, 0, hand, deck, lookup,
  );
  assert.deepEqual(candidates.map(x => [x.zone, x.card.uid]), [
    ['hand', 'm0:lv5-hand'], ['deck', 'm0:lv5-deck'],
  ]);
  assert.equal(candidates[0].card, hand[0]);
  assert.equal(candidates[1].card, deck[0]);
});

test('LV3 level-up is not offered outside Standby Phase or while face-down', () => {
  const hand = [ref('m0:lv5', ids.lv5)];
  assert.deepEqual(armedDragonLevelUpCandidates(
    ids.lv3, true, 'end', false, 0, 0, 0, hand, [], lookup,
  ), []);
  assert.deepEqual(armedDragonLevelUpCandidates(
    ids.lv3, false, 'standby', false, 0, 0, 0, hand, [], lookup,
  ), []);
});

test('LV5 offers LV7 only during End Phase after a battle destruction that turn', () => {
  const hand = [ref('m0:lv7-hand', ids.lv7)];
  const deck = [ref('m0:lv7-deck', ids.lv7)];
  const candidates = armedDragonLevelUpCandidates(
    ids.lv5, true, 'end', true, 0, 0, 0, hand, deck, lookup,
  );
  assert.deepEqual(candidates.map(x => [x.zone, x.card.uid]), [
    ['hand', 'm0:lv7-hand'], ['deck', 'm0:lv7-deck'],
  ]);
  assert.deepEqual(armedDragonLevelUpCandidates(
    ids.lv5, true, 'end', false, 0, 0, 0, hand, deck, lookup,
  ), []);
  assert.deepEqual(armedDragonLevelUpCandidates(
    ids.lv5, true, 'standby', true, 0, 0, 0, hand, deck, lookup,
  ), []);
});

test('level-up candidates are exact identities and ignore unrelated cards', () => {
  const hand = [ref('m0:lv5', ids.lv5), ref('m0:lv7', ids.lv7), ref('m0:spell', ids.spell)];
  const candidates = armedDragonLevelUpCandidates(
    ids.lv3, true, 'standby', false, 0, 0, 0, hand, [], lookup,
  );
  assert.deepEqual(candidates.map(x => x.card.uid), ['m0:lv5']);
});

test('LV7 cannot be Normal Summoned or Set and only LV5 is an evolution source', () => {
  assert.equal(armedDragonLv7MayBeNormalSummonedOrSet(), false);
  assert.equal(armedDragonLv7SummonSourceAllowed(ids.lv5), true);
  assert.equal(armedDragonLv7SummonSourceAllowed(ids.lv3), false);
  assert.equal(armedDragonLv7SummonSourceAllowed('other'), false);
});

test('an LV7 sent away may be revived only if it was properly Summoned first', () => {
  assert.equal(armedDragonLv7MayBeRevived(true), true);
  assert.equal(armedDragonLv7MayBeRevived(false), false);
});

test('level-up cannot inspect the inactive partner hand or Deck', () => {
  const hand = [ref('m2:lv5', ids.lv5, { ownerSeat: 2 })];
  const deck = [ref('m2:lv5-deck', ids.lv5, { ownerSeat: 2 })];
  assert.throws(() => armedDragonLevelUpCandidates(
    ids.lv3, true, 'standby', false, 0, 2, 2, hand, deck, lookup,
  ), /partner private hand or Deck/);
});

test('level-up rejects mixed physical owners and duplicate UIDs across hand and Deck', () => {
  assert.throws(() => armedDragonLevelUpCandidates(
    ids.lv3, true, 'standby', false, 0, 0, 0,
    [ref('m0:same', ids.lv5)], [ref('m0:same', ids.lv5)], lookup,
  ), /Duplicate physical UID/);
  assert.throws(() => armedDragonLevelUpCandidates(
    ids.lv3, true, 'standby', false, 0, 0, 0,
    [ref('m2:wrong-owner', ids.lv5, { ownerSeat: 2 })], [], lookup,
  ), /another physical seat/);
});

test('level-up rejects tokens and invalid references in physical hand or Deck', () => {
  assert.throws(() => armedDragonLevelUpCandidates(
    ids.lv3, true, 'standby', false, 0, 0, 0,
    [ref('m0:token', ids.lv5, { entityKind: 'token' })], [], lookup,
  ), /cannot contain a token/);
  assert.throws(() => armedDragonLevelUpCandidates(
    ids.lv3, true, 'standby', false, 0, 0, 0, [{}], [], lookup,
  ), /invalid physical card reference/);
});

test('discard cost candidates contain monsters only from the active physical hand', () => {
  const hand = [
    ref('m0:monster', ids.monster),
    ref('m0:lv3', ids.lv3),
    ref('m0:spell', ids.spell),
    ref('m0:trap', ids.trap),
  ];
  assert.deepEqual(armedDragonDiscardTargets(hand, 0, 0, lookup).map(x => x.uid), [
    'm0:monster', 'm0:lv3',
  ]);
});

test('discard cost refuses the inactive partner private hand', () => {
  assert.throws(() => armedDragonDiscardTargets(
    [ref('m2:monster', ids.monster)], 0, 2, lookup,
  ), /partner private hand/);
});

test('discard selection returns the original physical card and rejects stale/forged UIDs', () => {
  const selected = ref('m2:monster', ids.monster, { marker: 'owner-preserved' });
  const hand = [selected];
  assert.equal(resolveArmedDragonDiscard(hand, 2, 2, selected.uid, lookup), selected);
  assert.equal(resolveArmedDragonDiscard(hand, 2, 2, 'm0:forged', lookup), null);
  hand.splice(0, 1);
  assert.equal(resolveArmedDragonDiscard(hand, 2, 2, selected.uid, lookup), null);
});

test('LV5 accepts face-up opposing targets at or below discarded monster current ATK', () => {
  const field = [
    monster('m1:equal', 1, true, 1800),
    monster('m3:weaker', 1, true, 1200),
    monster('m1:stronger', 1, true, 1801),
    monster('m0:ally', 0, true, 100),
  ];
  const targets = armedDragonLv5DestroyCandidates(field, 1, 1800, currentAtk, false);
  assert.deepEqual(targets.map(x => x.uid), ['m1:equal', 'm3:weaker']);
});

test('LV5 target selection is revalidated and once-per-turn use suppresses all targets', () => {
  const field = [monster('m1:target', 1, true, 1500)];
  assert.equal(resolveArmedDragonLv5DestroyTarget(
    field, 1, 1500, currentAtk, false, 'm1:target',
  ), field[0]);
  assert.equal(resolveArmedDragonLv5DestroyTarget(
    field, 1, 1500, currentAtk, false, 'm9:forged',
  ), null);
  assert.equal(resolveArmedDragonLv5DestroyTarget(
    field, 1, 1500, currentAtk, true, 'm1:target',
  ), null);
});

test('LV7 destroys every eligible face-up opposing monster, not allied or face-down cards', () => {
  const field = [
    monster('m1:one', 1, true, 800),
    monster('m3:two', 1, true, 1600),
    monster('m1:over', 1, true, 1601),
    monster('m0:ally', 0, true, 100),
  ];
  assert.deepEqual(armedDragonLv7DestroyTargets(
    field, 1, 1600, currentAtk, false,
  ).map(x => x.uid), ['m1:one', 'm3:two']);
});

test('Armed Dragon rejects a fourth monster in either shared three-zone team field', () => {
  const field = [
    monster('m1:a', 1, true, 100),
    monster('m1:b', 1, true, 200),
    monster('m3:c', 1, true, 300),
    monster('m3:d', 1, true, 400),
  ];
  assert.throws(() => armedDragonLv5DestroyCandidates(
    field, 1, 500, currentAtk, false,
  ), /shared Monster Zone capacity/);
});

test('LV5/LV7 threshold uses current ATK supplied by the engine, not printed fixture ATK', () => {
  const field = [
    monster('m1:boosted', 1, true, 2200),
    monster('m1:reduced', 1, true, 1900),
  ];
  const liveAtk = m => m.uid === 'm1:boosted' ? 1400 : 2000;
  assert.deepEqual(armedDragonLv5DestroyCandidates(
    field, 1, 1500, liveAtk, false,
  ).map(x => x.uid), ['m1:boosted']);
});

test('LV5 and LV7 once-per-turn use prevents additional target offers', () => {
  const field = [monster('m1:target', 1, true, 1000)];
  assert.deepEqual(armedDragonLv5DestroyCandidates(field, 1, 2000, currentAtk, true), []);
  assert.deepEqual(armedDragonLv7DestroyTargets(field, 1, 2000, currentAtk, true), []);
});

test('invalid ATK values and duplicate field UIDs fail closed', () => {
  assert.throws(() => armedDragonLv5DestroyCandidates(
    [monster('m1:bad', 1, true, -1)], 1, 1000, currentAtk, false,
  ), /Current opposing monster ATK/);
  assert.throws(() => armedDragonLv7DestroyTargets(
    [monster('m1:dup', 1, true, 500), monster('m1:dup', 1, true, 400)],
    1, 1000, currentAtk, false,
  ), /duplicate physical UID/);
});

test('an invalid discarded ATK or lookup callback cannot expose targets', () => {
  const field = [monster('m1:target', 1, true, 500)];
  assert.throws(() => armedDragonLv5DestroyCandidates(field, 1, -1, currentAtk, false), /Discarded monster ATK/);
  assert.throws(() => armedDragonLv7DestroyTargets(field, 1, 1000, null, false), /ATK lookup/);
});
