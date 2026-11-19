'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ANTI_AIRCRAFT_FLOWER_ID,
  ARCANE_ARCHER_OF_THE_FOREST_ID,
  typedTributeCandidates,
  resolveTypedTributeSelection,
  antiAircraftFlowerBurnAmount,
  arcaneArcherIsAttackProtected,
  arcaneArcherSpellTrapTargetOptions,
  resolveArcaneArcherSpellTrapTarget,
} = require('../dist/typedTributeOperations.js');

const ids = {
  flower: ANTI_AIRCRAFT_FLOWER_ID,
  archer: ARCANE_ARCHER_OF_THE_FOREST_ID,
  insect: 'fixture-insect',
  plant: 'fixture-plant',
  warrior: 'fixture-warrior',
  spell: 'fixture-spell',
  trap: 'fixture-trap',
  monster: 'fixture-monster',
};
const metadata = new Map([
  [ids.flower, card(ids.flower, 'monster', 'Plant')],
  [ids.archer, card(ids.archer, 'monster', 'Warrior')],
  [ids.insect, card(ids.insect, 'monster', 'Insect')],
  [ids.plant, card(ids.plant, 'monster', 'Plant')],
  [ids.warrior, card(ids.warrior, 'monster', 'Warrior')],
  [ids.spell, card(ids.spell, 'spell')],
  [ids.trap, card(ids.trap, 'trap')],
  [ids.monster, card(ids.monster, 'monster', 'Dragon')],
]);
function card(id, kind, race = null) {
  return { id, kind, race, name: id, englishName: id, konamiId: 0,
    summary: 'isolated typed Tribute fixture', source: 'https://www.db.yugioh-card.com/' };
}
const lookup = id => metadata.get(id);
const ref = (uid, id, team, extra = {}) => ({ uid, id, team, faceUp: true, ...extra });

test('Anti-Aircraft Flower can Tribute either teammate-owned Insect on the shared field', () => {
  const own = ref('m0:insect', ids.insect, 0, { ownerSeat: 0 });
  const partner = ref('m2:insect', ids.insect, 0, { ownerSeat: 2 });
  const opposing = ref('m1:insect', ids.insect, 1, { ownerSeat: 1 });
  const candidates = typedTributeCandidates(ids.flower, 0, [own, partner, opposing], lookup);
  assert.deepEqual(candidates, [own, partner]);
  assert.equal(candidates[0], own);
  assert.equal(candidates[1], partner);
});

test('Arcane Archer requires a Plant Tribute, not an Insect or Warrior', () => {
  const field = [
    ref('m0:plant', ids.plant, 0),
    ref('m2:insect', ids.insect, 0),
    ref('m0:warrior', ids.warrior, 0),
  ];
  assert.deepEqual(
    typedTributeCandidates(ids.archer, 0, field, lookup).map(x => x.uid),
    ['m0:plant'],
  );
});

test('face-down allied monsters remain eligible because the active team controls the shared field', () => {
  const hidden = ref('m2:hidden-insect', ids.insect, 0, { faceUp: false, ownerSeat: 2 });
  assert.deepEqual(typedTributeCandidates(ids.flower, 0, [hidden], lookup), [hidden]);
});

test('tokens may be Tributed when their resolved metadata has the required monster Type', () => {
  const token = ref('m2:insect-token', ids.insect, 0, { entityKind: 'token' });
  assert.deepEqual(typedTributeCandidates(ids.flower, 0, [token], lookup), [token]);
});

test('opposing team monsters are never offered as Tribute costs', () => {
  const opponent = ref('m1:plant', ids.plant, 1);
  assert.deepEqual(typedTributeCandidates(ids.archer, 0, [opponent], lookup), []);
});

test('typed Tribute refuses a fourth monster in either shared three-zone team field', () => {
  const field = [
    ref('m0:a', ids.insect, 0),
    ref('m2:b', ids.insect, 0),
    ref('m0:c', ids.insect, 0),
    ref('m2:d', ids.insect, 0),
  ];
  assert.throws(() => typedTributeCandidates(ids.flower, 0, field, lookup), /Monster Zone capacity/);
});

test('Tribute payment selection returns the exact physical reference and rejects forged UIDs', () => {
  const partner = ref('m2:plant', ids.plant, 0, { ownerSeat: 2, marker: 'physical-owner' });
  const field = [partner];
  assert.equal(resolveTypedTributeSelection(
    ids.archer, 0, field, partner.uid, lookup,
  ), partner);
  assert.equal(resolveTypedTributeSelection(
    ids.archer, 0, field, 'm9:forged', lookup,
  ), null);
  field.splice(0, 1);
  assert.equal(resolveTypedTributeSelection(
    ids.archer, 0, field, partner.uid, lookup,
  ), null);
});

test('typed Tribute discovery does not mutate shared Monster Zones', () => {
  const field = [ref('m0:plant', ids.plant, 0), ref('m2:insect', ids.insect, 0)];
  const before = [...field];
  typedTributeCandidates(ids.archer, 0, field, lookup);
  assert.deepEqual(field, before);
  assert.equal(field[0], before[0]);
  assert.equal(field[1], before[1]);
});

test('unknown source cards do not borrow either typed Tribute effect', () => {
  assert.deepEqual(typedTributeCandidates('unknown', 0, [], lookup), []);
  assert.equal(antiAircraftFlowerBurnAmount('unknown'), null);
});

test('Anti-Aircraft Flower burns exactly 800 and has no once-per-turn lock', () => {
  assert.equal(antiAircraftFlowerBurnAmount(ids.flower), 800);
  const field = [ref('m0:insect', ids.insect, 0)];
  assert.deepEqual(typedTributeCandidates(ids.flower, 0, field, lookup), field);
  assert.deepEqual(typedTributeCandidates(ids.flower, 0, field, lookup), field);
});

test('Arcane Archer is protected while its own team controls a face-up Plant monster', () => {
  const archer = ref('m0:archer', ids.archer, 0);
  const plant = ref('m2:plant', ids.plant, 0, { ownerSeat: 2 });
  assert.equal(arcaneArcherIsAttackProtected(archer, [archer, plant], lookup), true);
});

test('an Arcane Archer not present in the shared field cannot receive passive protection', () => {
  const archer = ref('m0:archer', ids.archer, 0);
  const plant = ref('m2:plant', ids.plant, 0);
  assert.equal(arcaneArcherIsAttackProtected(archer, [plant], lookup), false);
});

test('a Plant controlled by the opposing team does not protect Arcane Archer', () => {
  const archer = ref('m0:archer', ids.archer, 0);
  const plant = ref('m1:plant', ids.plant, 1);
  assert.equal(arcaneArcherIsAttackProtected(archer, [archer, plant], lookup), false);
});

test('a face-down Plant does not satisfy the continuous protection condition', () => {
  const archer = ref('m0:archer', ids.archer, 0);
  const plant = ref('m2:plant', ids.plant, 0, { faceUp: false });
  assert.equal(arcaneArcherIsAttackProtected(archer, [archer, plant], lookup), false);
});

test('removing the last face-up Plant immediately removes Arcane Archer protection', () => {
  const archer = ref('m0:archer', ids.archer, 0);
  const plant = ref('m2:plant', ids.plant, 0);
  assert.equal(arcaneArcherIsAttackProtected(archer, [archer, plant], lookup), true);
  assert.equal(arcaneArcherIsAttackProtected(archer, [archer], lookup), false);
});

test('Arcane Archer protection requires the correct face-up source', () => {
  const archer = ref('m0:archer', ids.archer, 0);
  const plant = ref('m2:plant', ids.plant, 0);
  assert.equal(arcaneArcherIsAttackProtected(
    ref('m0:other', ids.warrior, 0), [archer, plant], lookup,
  ), false);
  assert.equal(arcaneArcherIsAttackProtected(
    ref('m0:hidden-archer', ids.archer, 0, { faceUp: false }), [plant], lookup,
  ), false);
});

test('Arcane Archer target options include all face-up Spell/Traps on both teams', () => {
  const own = ref('m0:own-spell', ids.spell, 0, { zone: 'backrow' });
  const opposing = ref('m1:opponent-trap', ids.trap, 1, { zone: 'backrow' });
  const field = ref('m1:field-spell', ids.spell, 1, { zone: 'field' });
  const options = arcaneArcherSpellTrapTargetOptions(
    ids.archer, 0, [own, opposing, field], lookup,
  );
  assert.deepEqual(options.map(x => x.uid), [own.uid, opposing.uid, field.uid]);
  assert.equal(options[1].visibleCardId, ids.trap);
});

test('Arcane Archer respects three backrow zones and one Field Zone per team', () => {
  const backrow = [
    ref('m1:a', ids.trap, 1, { zone: 'backrow' }),
    ref('m1:b', ids.trap, 1, { zone: 'backrow' }),
    ref('m1:c', ids.trap, 1, { zone: 'backrow' }),
    ref('m3:d', ids.trap, 1, { zone: 'backrow' }),
  ];
  assert.throws(() => arcaneArcherSpellTrapTargetOptions(
    ids.archer, 0, backrow, lookup,
  ), /Spell\/Trap Zone capacity/);
  assert.throws(() => arcaneArcherSpellTrapTargetOptions(
    ids.archer, 0, [
      ref('m1:field-a', ids.spell, 1, { zone: 'field' }),
      ref('m3:field-b', ids.spell, 1, { zone: 'field' }),
    ], lookup,
  ), /Field Zone capacity/);
});

test('an opponent Set card is targetable but its identity is not exposed in the option', () => {
  const hidden = ref('m1:hidden-trap', ids.trap, 1, { faceUp: false, zone: 'backrow' });
  let lookedUp = false;
  const guardedLookup = id => {
    if (id === ids.trap) lookedUp = true;
    return lookup(id);
  };
  const options = arcaneArcherSpellTrapTargetOptions(
    ids.archer, 0, [hidden], guardedLookup,
  );
  assert.equal(lookedUp, false);
  assert.equal(options.length, 1);
  assert.equal(options[0].displayName, 'Carta virada para baixo');
  assert.equal(Object.hasOwn(options[0], 'visibleCardId'), false);
  assert.equal(Object.hasOwn(options[0], 'id'), false);
});

test('a teammate may see the identity of their own Set Spell/Trap', () => {
  const hidden = ref('m2:hidden-own-trap', ids.trap, 0, { faceUp: false, zone: 'backrow' });
  const options = arcaneArcherSpellTrapTargetOptions(ids.archer, 0, [hidden], lookup);
  assert.equal(options[0].visibleCardId, ids.trap);
  assert.equal(options[0].displayName, ids.trap);
});

test('non-Spell/Trap face-up cards are not targetable', () => {
  const monster = ref('m1:monster', ids.monster, 1, { zone: 'backrow' });
  assert.deepEqual(arcaneArcherSpellTrapTargetOptions(
    ids.archer, 0, [monster], lookup,
  ), []);
});

test('Arcane Archer target selection returns the exact current physical reference', () => {
  const target = ref('m1:trap', ids.trap, 1, { zone: 'backrow', marker: 'keep-owner' });
  assert.equal(resolveArcaneArcherSpellTrapTarget(
    0, [target], target.uid, lookup,
  ), target);
  assert.equal(resolveArcaneArcherSpellTrapTarget(
    0, [target], 'm9:forged', lookup,
  ), null);
});

test('Arcane Archer rejects stale target UIDs after the field changes', () => {
  const target = ref('m1:trap', ids.trap, 1, { zone: 'backrow' });
  const field = [target];
  field.splice(0, 1);
  assert.equal(resolveArcaneArcherSpellTrapTarget(
    0, field, target.uid, lookup,
  ), null);
});

test('duplicate physical UIDs and malformed field references fail closed', () => {
  assert.throws(() => typedTributeCandidates(ids.flower, 0, [
    ref('m0:dup', ids.insect, 0), ref('m0:dup', ids.insect, 0),
  ], lookup), /duplicate physical UID/);
  assert.throws(() => arcaneArcherSpellTrapTargetOptions(
    ids.archer, 0, [{}], lookup,
  ), /invalid physical card reference/);
});
