const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { getMonsterEffect } = require('../dist/monsterEffects.js');
const {
  DARK_RULER_HA_DES_ID, DARK_BALTER_THE_TERRIBLE_ID,
  battleDestroyedEffectNegation, haDesSpecialSummonFromGraveBlocked,
} = require('../dist/fiendBattleNegationTagAdapter.js');

const FIEND_ID = tagNormalCardIds.find(id => getDuelCard(id)?.race === 'Fiend');
const NONFIEND_ID = tagNormalCardIds.find(id => getDuelCard(id)?.race && getDuelCard(id).race !== 'Fiend');
const EFFECT_ID = enabledCardIds.find(id => !!getMonsterEffect(id));
const FUSION_ID = enabledCardIds.find(id => !!getDuelCard(id)?.fusion);
assert.ok(FIEND_ID && NONFIEND_ID && EFFECT_ID && FUSION_ID, 'fixture needs Fiend, non-Fiend, Effect Monster and Fusion cards');

const FIXTURE_IDS = { darkRulerHaDesId: FIEND_ID, darkBalterId: FUSION_ID };

function makeDuel() {
  const deck = tagNormalCardIds.slice(3, 23);
  assert.equal(deck.length, 20, 'fixture requires 20 enabled Normal Monsters');
  const players = [0, 1, 2, 3].map(i => ({
    id: 'Member ' + i, name: 'Member ' + i, cards: [...deck], extra: [FUSION_ID],
  }));
  return createTagDuel(players, { seed: 'm586-fiend-battle-negation', first: 0, classic: true });
}

function physicalDeck(duel, seat) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team].deck : duel.reserves[seat].deck;
}

function physicalExtra(duel, seat) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team].extra : duel.reserves[seat].extra;
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

function moveExtraCardToField(duel, seat, controllerTeam, id) {
  const card = physicalExtra(duel, seat).pop();
  assert.ok(card);
  card.id = id;
  const monster = {
    ...card, owner: seat % 2, position: 'atk', faceUp: true,
    entered: duel.core.turn, changed: duel.core.turn, attacked: 0,
    atkBoost: 0, defBoost: 0,
  };
  duel.core.players[controllerTeam].monsters.push(monster);
  return monster.uid;
}

function moveFieldCardToGrave(duel, team, uid) {
  const index = duel.core.players[team].monsters.findIndex(m => m.uid === uid);
  assert.ok(index >= 0);
  const [monster] = duel.core.players[team].monsters.splice(index, 1);
  duel.core.players[team].grave.push(monster);
}

function inventoryMap(duel) {
  return new Map(tagInventory(duel)
    .filter(card => card.entityKind !== 'token')
    .map(card => [card.uid, card.id]));
}

function event(attackerUid, attackerCardId, targetUid, targetTeam, destroyedByBattle = true, attackerTeam = 0) {
  return {
    attackerUid, attackerCardId, attackerTeam, attackerWasFaceUp: true,
    attackerEffectWasNegated: false, destroyedUid: targetUid,
    destroyedCardId: EFFECT_ID, targetTeam, destroyedByBattle,
  };
}

test('Dark Ruler Ha Des negates an Effect Monster destroyed by battle with any controlled Fiend', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.darkRulerHaDesId);
  const attackerUid = moveDeckCardToField(duel, 2, 0, FIEND_ID);
  const targetUid = moveDeckCardToField(duel, 1, 1, EFFECT_ID);
  moveFieldCardToGrave(duel, 1, targetUid);
  const result = battleDestroyedEffectNegation(
    duel, event(attackerUid, FIEND_ID, targetUid, 1), FIXTURE_IDS,
  );
  assert.ok(result);
  assert.equal(result.negatedEffectUid, targetUid);
  assert.deepEqual(result.sources, ['dark-ruler-ha-des']);
});

test('Dark Ruler Ha Des does not apply when a non-Fiend monster wins the battle', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.darkRulerHaDesId);
  const attackerUid = moveDeckCardToField(duel, 2, 0, NONFIEND_ID);
  const targetUid = moveDeckCardToField(duel, 1, 1, EFFECT_ID);
  moveFieldCardToGrave(duel, 1, targetUid);
  assert.equal(
    battleDestroyedEffectNegation(duel, event(attackerUid, NONFIEND_ID, targetUid, 1), FIXTURE_IDS),
    null,
  );
});

test('Dark Ruler Ha Des needs a face-up, non-negated copy on the attacking team', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.darkRulerHaDesId, false);
  const attackerUid = moveDeckCardToField(duel, 2, 0, FIEND_ID);
  const targetUid = moveDeckCardToField(duel, 1, 1, EFFECT_ID);
  moveFieldCardToGrave(duel, 1, targetUid);
  assert.equal(
    battleDestroyedEffectNegation(duel, event(attackerUid, FIEND_ID, targetUid, 1), FIXTURE_IDS),
    null,
  );
});

test('Dark Balter negates an Effect Monster destroyed by battle with itself', () => {
  const duel = makeDuel();
  const attackerUid = moveExtraCardToField(duel, 0, 0, FIXTURE_IDS.darkBalterId);
  const targetUid = moveDeckCardToField(duel, 1, 1, EFFECT_ID);
  moveFieldCardToGrave(duel, 1, targetUid);
  const result = battleDestroyedEffectNegation(
    duel, event(attackerUid, FIXTURE_IDS.darkBalterId, targetUid, 1), FIXTURE_IDS,
  );
  assert.ok(result);
  assert.equal(result.negatedEffectUid, targetUid);
  assert.deepEqual(result.sources, ['dark-balter-the-terrible']);
});

test('Dark Balter does not grant its battle negation to another Fiend attacker', () => {
  const duel = makeDuel();
  moveExtraCardToField(duel, 0, 0, FIXTURE_IDS.darkBalterId);
  const attackerUid = moveDeckCardToField(duel, 2, 0, FIEND_ID);
  const targetUid = moveDeckCardToField(duel, 1, 1, EFFECT_ID);
  moveFieldCardToGrave(duel, 1, targetUid);
  assert.equal(
    battleDestroyedEffectNegation(duel, event(attackerUid, FIEND_ID, targetUid, 1), FIXTURE_IDS),
    null,
  );
});

test('Dark Balter and Ha Des do not negate a Normal Monster with no effect definition', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.darkRulerHaDesId);
  const attackerUid = moveDeckCardToField(duel, 2, 0, FIEND_ID);
  const normalId = tagNormalCardIds[10];
  const targetUid = moveDeckCardToField(duel, 1, 1, normalId);
  moveFieldCardToGrave(duel, 1, targetUid);
  const result = battleDestroyedEffectNegation(
    duel,
    { ...event(attackerUid, FIEND_ID, targetUid, 1), destroyedCardId: normalId },
    FIXTURE_IDS,
  );
  assert.equal(result, null);
});

test('The battle negation adapter requires a real battle destruction and opposing team', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.darkRulerHaDesId);
  const attackerUid = moveDeckCardToField(duel, 2, 0, FIEND_ID);
  const targetUid = moveDeckCardToField(duel, 1, 1, EFFECT_ID);
  moveFieldCardToGrave(duel, 1, targetUid);
  assert.equal(
    battleDestroyedEffectNegation(duel, event(attackerUid, FIEND_ID, targetUid, 1, false), FIXTURE_IDS),
    null,
  );
  assert.equal(
    battleDestroyedEffectNegation(duel, event(attackerUid, FIEND_ID, targetUid, 0, true), FIXTURE_IDS),
    null,
  );
});

test('A negated attacker cannot apply Dark Balter battle suppression', () => {
  const duel = makeDuel();
  const attackerUid = moveExtraCardToField(duel, 0, 0, FIXTURE_IDS.darkBalterId);
  const targetUid = moveDeckCardToField(duel, 1, 1, EFFECT_ID);
  moveFieldCardToGrave(duel, 1, targetUid);
  const result = battleDestroyedEffectNegation(
    duel,
    { ...event(attackerUid, FIXTURE_IDS.darkBalterId, targetUid, 1), attackerEffectWasNegated: true },
    FIXTURE_IDS,
  );
  assert.equal(result, null);
});

test('Dark Ruler Ha Des cannot be Special Summoned from the GY even when no copy is on the field', () => {
  assert.equal(haDesSpecialSummonFromGraveBlocked(FIXTURE_IDS.darkRulerHaDesId, FIXTURE_IDS), true);
  assert.equal(haDesSpecialSummonFromGraveBlocked(tagNormalCardIds[10], FIXTURE_IDS), false);
});

test('Battle negation is a marker for the shared effect pipeline and does not move or grant cards', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.darkRulerHaDesId);
  const attackerUid = moveDeckCardToField(duel, 2, 0, FIEND_ID);
  const targetUid = moveDeckCardToField(duel, 1, 1, EFFECT_ID);
  moveFieldCardToGrave(duel, 1, targetUid);
  const before = inventoryMap(duel);
  const result = battleDestroyedEffectNegation(
    duel, event(attackerUid, FIEND_ID, targetUid, 1), FIXTURE_IDS,
  );
  assert.ok(result);
  assert.deepEqual(inventoryMap(duel), before);
  assert.equal(duel.core.players[1].grave.some(c => c.uid === targetUid), true);
});

test('Dark Balter remains an Extra Deck card under the five-card physical cap', () => {
  const duel = makeDuel();
  const before = inventoryMap(duel);
  const attackerUid = moveExtraCardToField(duel, 0, 0, FIXTURE_IDS.darkBalterId);
  assert.ok(attackerUid);
  assert.deepEqual(inventoryMap(duel), before);
});
