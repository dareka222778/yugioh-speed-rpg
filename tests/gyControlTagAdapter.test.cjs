const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const {
  THE_END_OF_ANUBIS_ID, KYCOO_THE_GHOST_DESTROYER_ID,
  endOfAnubisApplies, gyEffectIsNegated, kycooBlocksOpponentBanishFromEitherGy,
  prepareKycooBattleDamage, resolveKycooBattleDamage,
} = require('../dist/gyControlTagAdapter.js');

const FIXTURE_IDS = {
  endOfAnubisId: tagNormalCardIds[0],
  kycooId: tagNormalCardIds[1],
};
const SPELL_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'spell');
const TRAP_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'trap');

function makeDuel() {
  const deck = tagNormalCardIds.slice(2, 22);
  assert.equal(deck.length, 20, 'fixture requires 20 enabled Normal Monsters');
  const players = [0, 1, 2, 3].map(i => ({
    id: 'Member ' + i, name: 'Member ' + i, cards: [...deck], extra: [],
  }));
  return createTagDuel(players, { seed: 'm584-gy-control', first: 0, classic: true });
}

function physicalDeck(duel, seat) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team].deck : duel.reserves[seat].deck;
}

function moveDeckCardToField(duel, seat, controllerTeam, id, faceUp = true) {
  const card = physicalDeck(duel, seat).pop();
  assert.ok(card);
  card.id = id;
  const monster = {
    ...card, owner: seat % 2, position: 'atk', faceUp,
    entered: duel.core.turn, changed: duel.core.turn, attacked: 0,
    atkBoost: 0, defBoost: 0,
  };
  duel.core.players[controllerTeam].monsters.push(monster);
  return monster.uid;
}

function moveDeckCardToGrave(duel, seat, id) {
  const card = physicalDeck(duel, seat).pop();
  assert.ok(card);
  card.id = id;
  duel.core.players[seat % 2].grave.push(card);
  return card.uid;
}

function moveDeckCardToHand(duel, seat) {
  const card = physicalDeck(duel, seat).pop();
  assert.ok(card);
  duel.core.players[seat % 2].hand.push(card);
  return card.uid;
}

function setBattle(duel, team) {
  duel.core.current = team;
  duel.cursor = duel.active[team];
  duel.core.teamRotation.cursor = duel.cursor;
  duel.core.phase = 'battle';
  duel.core.resume = 'battle';
}

function inventoryMap(duel) {
  return new Map(tagInventory(duel)
    .filter(card => card.entityKind !== 'token')
    .map(card => [card.uid, card.id]));
}

function ownerSeat(uid) {
  const match = /^m([0-3]):/.exec(uid);
  assert.ok(match, 'physical UID must encode a seat');
  return Number(match[1]);
}

test('The End of Anubis negates GY-activated and GY-targeting effects, but not unrelated effects', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.endOfAnubisId);
  assert.equal(endOfAnubisApplies(duel, FIXTURE_IDS), true);
  assert.equal(gyEffectIsNegated(duel, { sourceZone: 'grave', targetZones: [] }, FIXTURE_IDS), true);
  assert.equal(gyEffectIsNegated(duel, { sourceZone: 'hand', targetZones: ['grave'] }, FIXTURE_IDS), true);
  assert.equal(gyEffectIsNegated(duel, { sourceZone: 'field', targetZones: ['hand'] }, FIXTURE_IDS), false);
  assert.equal(gyEffectIsNegated(duel, { sourceZone: 'field', targetZones: ['deck'] }, FIXTURE_IDS), false);
});

test('The End of Anubis must be face-up; a face-down copy does not suppress GY effects', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.endOfAnubisId, false);
  assert.equal(endOfAnubisApplies(duel, FIXTURE_IDS), false);
  assert.equal(gyEffectIsNegated(duel, { sourceZone: 'grave', targetZones: [] }, FIXTURE_IDS), false);
});

test('Kycoo blocks only the opposing team from banishing cards from either shared GY', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 2, 0, FIXTURE_IDS.kycooId);
  assert.equal(kycooBlocksOpponentBanishFromEitherGy(duel, 1, FIXTURE_IDS), true);
  assert.equal(kycooBlocksOpponentBanishFromEitherGy(duel, 0, FIXTURE_IDS), false);
});

test('face-down Kycoo does not apply its continuous banish restriction', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.kycooId, false);
  assert.equal(kycooBlocksOpponentBanishFromEitherGy(duel, 1, FIXTURE_IDS), false);
});

test('Kycoo trigger requires positive battle damage in its controller team battle window', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.kycooId);
  assert.equal(prepareKycooBattleDamage(duel, sourceUid, 0, 100, FIXTURE_IDS), null);
  setBattle(duel, 0);
  assert.equal(prepareKycooBattleDamage(duel, sourceUid, 0, 0, FIXTURE_IDS), null);
  assert.ok(prepareKycooBattleDamage(duel, sourceUid, 0, 100, FIXTURE_IDS));
});

test('Kycoo offers only opposing GY monsters, including the inactive partner, and preserves physical UIDs', () => {
  const duel = makeDuel();
  setBattle(duel, 0);
  const sourceUid = moveDeckCardToField(duel, 2, 0, FIXTURE_IDS.kycooId);
  const ownGy = moveDeckCardToGrave(duel, 0, tagNormalCardIds[10]);
  const targetA = moveDeckCardToGrave(duel, 1, tagNormalCardIds[11]);
  const targetB = moveDeckCardToGrave(duel, 3, tagNormalCardIds[12]);
  assert.ok(SPELL_ID && TRAP_ID, 'fixture requires enabled Spell and Trap cards');
  const opponentSpell = moveDeckCardToGrave(duel, 1, SPELL_ID);
  const opponentTrap = moveDeckCardToGrave(duel, 3, TRAP_ID);
  const before = inventoryMap(duel);
  const plan = prepareKycooBattleDamage(duel, sourceUid, 0, 500, FIXTURE_IDS);
  assert.ok(plan);
  assert.deepEqual(plan.candidates.map(card => card.uid), [targetA, targetB]);

  const result = resolveKycooBattleDamage(duel, plan, [targetA, targetB], FIXTURE_IDS);
  assert.ok(result);
  assert.equal(result.negated, false);
  assert.deepEqual(result.movedUids, [targetA, targetB]);
  assert.equal(result.state.core.players[1].grave.some(card => card.uid === targetA || card.uid === targetB), false);
  assert.deepEqual(result.state.core.players[1].banished.map(card => card.uid).sort(), [targetA, targetB].sort());
  assert.equal(result.state.core.players[0].grave.some(card => card.uid === ownGy), true);
  assert.equal(result.state.core.players[1].grave.some(card => card.uid === opponentSpell), true);
  assert.equal(result.state.core.players[1].grave.some(card => card.uid === opponentTrap), true);
  assert.equal(ownerSeat(targetB), 3, 'inactive partner ownership remains encoded in UID');
  assert.deepEqual(inventoryMap(result.state), before);
});

test('Kycoo rejects duplicate, foreign and more-than-two target selections', () => {
  const duel = makeDuel();
  setBattle(duel, 0);
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.kycooId);
  const targetA = moveDeckCardToGrave(duel, 1, tagNormalCardIds[13]);
  const targetB = moveDeckCardToGrave(duel, 1, tagNormalCardIds[14]);
  const targetC = moveDeckCardToGrave(duel, 3, tagNormalCardIds[15]);
  const foreign = moveDeckCardToGrave(duel, 0, tagNormalCardIds[16]);
  const plan = prepareKycooBattleDamage(duel, sourceUid, 0, 1, FIXTURE_IDS);
  assert.ok(plan);
  assert.equal(resolveKycooBattleDamage(duel, plan, [targetA, targetA], FIXTURE_IDS), null);
  assert.equal(resolveKycooBattleDamage(duel, plan, [targetA, targetB, targetC], FIXTURE_IDS), null);
  assert.equal(resolveKycooBattleDamage(duel, plan, [foreign], FIXTURE_IDS), null);
});

test('Kycoo ignores a selected target that left the GY before resolution without duplicating it', () => {
  const duel = makeDuel();
  setBattle(duel, 0);
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.kycooId);
  const target = moveDeckCardToGrave(duel, 3, tagNormalCardIds[17]);
  const plan = prepareKycooBattleDamage(duel, sourceUid, 0, 200, FIXTURE_IDS);
  assert.ok(plan);
  const stale = structuredClone(duel);
  const index = stale.core.players[1].grave.findIndex(card => card.uid === target);
  const [moved] = stale.core.players[1].grave.splice(index, 1);
  stale.core.players[1].banished.push(moved);
  const before = inventoryMap(stale);
  const result = resolveKycooBattleDamage(stale, plan, [target], FIXTURE_IDS);
  assert.ok(result);
  assert.deepEqual(result.movedUids, []);
  assert.deepEqual(inventoryMap(result.state), before);
  assert.equal(result.state.core.players[1].banished.filter(card => card.uid === target).length, 1);
});

test('The End of Anubis negates Kycoo when its optional effect targets the opposing GY', () => {
  const duel = makeDuel();
  setBattle(duel, 0);
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.kycooId);
  moveDeckCardToField(duel, 1, 1, FIXTURE_IDS.endOfAnubisId);
  const target = moveDeckCardToGrave(duel, 3, tagNormalCardIds[18]);
  const plan = prepareKycooBattleDamage(duel, sourceUid, 0, 300, FIXTURE_IDS);
  assert.ok(plan);
  const result = resolveKycooBattleDamage(duel, plan, [target], FIXTURE_IDS);
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.deepEqual(result.movedUids, []);
  assert.equal(result.state.core.players[1].grave.some(card => card.uid === target), true);
});

test('Kycoo may resolve with zero selected targets and does not mutate physical inventory', () => {
  const duel = makeDuel();
  setBattle(duel, 0);
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.kycooId);
  const plan = prepareKycooBattleDamage(duel, sourceUid, 0, 100, FIXTURE_IDS);
  assert.ok(plan);
  const before = inventoryMap(duel);
  const result = resolveKycooBattleDamage(duel, plan, [], FIXTURE_IDS);
  assert.ok(result);
  assert.deepEqual(result.movedUids, []);
  assert.equal(result.negated, false);
  assert.deepEqual(inventoryMap(result.state), before);
});

test('Kycoo resolution does not discard a seven-card hand before End Phase', () => {
  const duel = makeDuel();
  setBattle(duel, 0);
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.kycooId);
  const target = moveDeckCardToGrave(duel, 1, tagNormalCardIds[19]);
  moveDeckCardToHand(duel, 0);
  moveDeckCardToHand(duel, 0);
  moveDeckCardToHand(duel, 0);
  assert.equal(duel.core.players[0].hand.length, 7);
  const plan = prepareKycooBattleDamage(duel, sourceUid, 0, 100, FIXTURE_IDS);
  assert.ok(plan);
  const result = resolveKycooBattleDamage(duel, plan, [target], FIXTURE_IDS);
  assert.ok(result);
  assert.equal(result.state.core.players[0].hand.length, 7);
});

test('Kycoo adapter rejects a team field that exceeds the three Monster Zones', () => {
  const duel = makeDuel();
  setBattle(duel, 0);
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.kycooId);
  for (let i = 0; i < 3; i++) moveDeckCardToField(duel, 0, 0, tagNormalCardIds[20 + i]);
  assert.throws(
    () => prepareKycooBattleDamage(duel, sourceUid, 0, 100, FIXTURE_IDS),
    /limite de zonas|Monster Zones/,
  );
});
