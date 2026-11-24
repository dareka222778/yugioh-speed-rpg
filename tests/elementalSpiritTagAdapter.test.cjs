const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { swapTeamSeat } = require('../dist/teamRotation.js');
const {
  SPIRIT_OF_FLAMES_ID, THE_ROCK_SPIRIT_ID, GARUDA_THE_WIND_SPIRIT_ID,
  prepareElementalSpiritSummon, payElementalSpiritSummon,
  elementalSpiritAtkBonus, elementalSpiritEffectiveAtk,
  garudaEndPhaseTargets, resolveGarudaPositionChange,
} = require('../dist/elementalSpiritTagAdapter.js');

const FIRE_COST = 'fixture-fire-monster';
const EARTH_COST = 'fixture-earth-monster';
const WIND_COST = 'fixture-wind-monster';
const WATER_COST = 'fixture-water-monster';
const SPELL_COST = 'fixture-spell';
const infos = new Map([
  [FIRE_COST, { id: FIRE_COST, kind: 'monster', attribute: 'FIRE' }],
  [EARTH_COST, { id: EARTH_COST, kind: 'monster', attribute: 'EARTH' }],
  [WIND_COST, { id: WIND_COST, kind: 'monster', attribute: 'WIND' }],
  [WATER_COST, { id: WATER_COST, kind: 'monster', attribute: 'WATER' }],
  [SPELL_COST, { id: SPELL_COST, kind: 'spell', attribute: null }],
]);
const getCard = id => infos.get(id);

function makeDuel() {
  const deck = tagNormalCardIds.slice(0, 20);
  assert.equal(deck.length, 20, 'fixture needs 20 enabled Normal Monsters');
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i, name: 'Member ' + i, cards: [...deck], extra: [],
  }));
  return createTagDuel(players, { seed: 'm578-elemental-spirits', first: 0, classic: true });
}
function physicalHand(duel, seat, team) {
  return duel.active[team] === seat ? duel.core.players[team].hand : duel.reserves[seat].hand;
}
function physicalDeck(duel, seat, team) {
  return duel.active[team] === seat ? duel.core.players[team].deck : duel.reserves[seat].deck;
}
function replaceHandCardWith(duel, seat, team, id) {
  const card = physicalHand(duel, seat, team)[0];
  assert.ok(card);
  card.id = id;
  return card.uid;
}
function moveDeckCardToGrave(duel, seat, team, id) {
  const card = physicalDeck(duel, seat, team).pop();
  assert.ok(card);
  card.id = id;
  duel.core.players[team].grave.push(card);
  return card.uid;
}
function moveDeckCardToField(duel, seat, team, id, position = 'atk', faceUp = true) {
  const card = physicalDeck(duel, seat, team).pop();
  assert.ok(card);
  card.id = id;
  const monster = {
    ...card, faceUp, position, entered: duel.core.turn,
    changed: 0, attacked: 0, atkBoost: 0, defBoost: 0,
  };
  duel.core.players[team].monsters.push(monster);
  return monster.uid;
}
function activateOpponentTurn(duel) {
  duel.core.current = 1;
  duel.core.priority = 1;
  duel.cursor = duel.active[1];
  duel.core.teamRotation.cursor = duel.cursor;
}
function inventoryMap(duel) {
  return new Map(tagInventory(duel).filter(card => card.entityKind !== 'token').map(card => [card.uid, card.id]));
}

test('Spirit of Flames uses only the active seat hand and a FIRE monster in the shared team Graveyard', () => {
  const duel = makeDuel();
  const sourceUid = replaceHandCardWith(duel, 0, 0, SPIRIT_OF_FLAMES_ID);
  const costUid = moveDeckCardToGrave(duel, 2, 0, FIRE_COST);
  const plan = prepareElementalSpiritSummon(duel, sourceUid, getCard);
  assert.equal(plan.team, 0);
  assert.equal(plan.activeSeat, 0);
  assert.equal(plan.source.uid, sourceUid);
  assert.deepEqual(plan.costCandidates.map(card => card.uid), [costUid]);
});

test('each Spirit accepts only a monster matching its own Attribute', () => {
  for (const [spiritId, wrongCost] of [
    [SPIRIT_OF_FLAMES_ID, WATER_COST],
    [THE_ROCK_SPIRIT_ID, FIRE_COST],
    [GARUDA_THE_WIND_SPIRIT_ID, EARTH_COST],
  ]) {
    const duel = makeDuel();
    const sourceUid = replaceHandCardWith(duel, 0, 0, spiritId);
    moveDeckCardToGrave(duel, 2, 0, wrongCost);
    assert.equal(prepareElementalSpiritSummon(duel, sourceUid, getCard), null);
  }
});

test('Spells and Traps cannot pay a monster banish cost', () => {
  const duel = makeDuel();
  const sourceUid = replaceHandCardWith(duel, 0, 0, SPIRIT_OF_FLAMES_ID);
  moveDeckCardToGrave(duel, 2, 0, SPELL_COST);
  assert.equal(prepareElementalSpiritSummon(duel, sourceUid, getCard), null);
});

test('a Spirit in the inactive partner private hand is not offered to the active seat', () => {
  const duel = makeDuel();
  const partnerSourceUid = replaceHandCardWith(duel, 2, 0, SPIRIT_OF_FLAMES_ID);
  moveDeckCardToGrave(duel, 0, 0, FIRE_COST);
  assert.equal(prepareElementalSpiritSummon(duel, partnerSourceUid, getCard), null);
});

test('the shared three-Monster-Zone cap prevents an impossible summon', () => {
  const duel = makeDuel();
  const sourceUid = replaceHandCardWith(duel, 0, 0, SPIRIT_OF_FLAMES_ID);
  moveDeckCardToGrave(duel, 2, 0, FIRE_COST);
  for (let i = 0; i < 3; i++) moveDeckCardToField(duel, 0, 0, 'fixture-field-' + i);
  assert.equal(prepareElementalSpiritSummon(duel, sourceUid, getCard), null);
});

test('the summon cost must be in the same team shared Graveyard, never the opposing Graveyard', () => {
  const duel = makeDuel();
  const sourceUid = replaceHandCardWith(duel, 0, 0, SPIRIT_OF_FLAMES_ID);
  moveDeckCardToGrave(duel, 1, 1, FIRE_COST);
  assert.equal(prepareElementalSpiritSummon(duel, sourceUid, getCard), null);
});

test('Special Summon is offered only in an open Main Phase with no pending chain', () => {
  const duel = makeDuel();
  const sourceUid = replaceHandCardWith(duel, 0, 0, SPIRIT_OF_FLAMES_ID);
  moveDeckCardToGrave(duel, 2, 0, FIRE_COST);
  duel.core.phase = 'battle';
  assert.equal(prepareElementalSpiritSummon(duel, sourceUid, getCard), null);
});

test('payment preserves physical UIDs, partner hand, field zone and total inventory', () => {
  const duel = makeDuel();
  const sourceUid = replaceHandCardWith(duel, 0, 0, SPIRIT_OF_FLAMES_ID);
  const costUid = moveDeckCardToGrave(duel, 2, 0, FIRE_COST);
  const beforeInventory = inventoryMap(duel);
  const partnerHand = structuredClone(duel.reserves[2].hand);
  const fieldZoneBefore = structuredClone(duel.core.players[0].field);
  const next = payElementalSpiritSummon(duel, sourceUid, costUid, getCard, 'def');
  assert.ok(next);
  assert.equal(next.core.players[0].hand.some(card => card.uid === sourceUid), false);
  assert.equal(next.core.players[0].monsters.length, 1);
  const summoned = next.core.players[0].monsters[0];
  assert.equal(summoned.uid, sourceUid);
  assert.equal(summoned.id, SPIRIT_OF_FLAMES_ID);
  assert.equal(summoned.owner, 0);
  assert.equal(summoned.position, 'def');
  assert.equal(summoned.faceUp, true);
  assert.equal(summoned.properlySummoned, true);
  assert.equal(next.core.players[0].grave.some(card => card.uid === costUid), false);
  assert.equal(next.core.players[0].banished.some(card => card.uid === costUid), true);
  assert.deepEqual(next.reserves[2].hand, partnerHand);
  assert.deepEqual(next.core.players[0].field, fieldZoneBefore);
  assert.deepEqual(inventoryMap(next), beforeInventory);
  assert.deepEqual(duel.core.players[0].monsters, []);
  assert.equal(duel.core.players[0].hand.some(card => card.uid === sourceUid), true);
  assert.equal(duel.core.players[0].grave.length, 1);
  assert.equal(duel.core.players[0].grave[0].uid, costUid);
});

test('a stale or wrong-Attribute cost fails without mutating the input snapshot', () => {
  const duel = makeDuel();
  const sourceUid = replaceHandCardWith(duel, 0, 0, SPIRIT_OF_FLAMES_ID);
  const costUid = moveDeckCardToGrave(duel, 2, 0, WATER_COST);
  const before = JSON.stringify(duel);
  assert.equal(payElementalSpiritSummon(duel, sourceUid, costUid, getCard), null);
  assert.equal(JSON.stringify(duel), before);
});

test('Spirit of Flames gains 300 ATK only during its controller team Battle Phase', () => {
  assert.equal(elementalSpiritAtkBonus(SPIRIT_OF_FLAMES_ID, 0, 0, 'battle'), 300);
  assert.equal(elementalSpiritAtkBonus(SPIRIT_OF_FLAMES_ID, 0, 1, 'battle'), 0);
  assert.equal(elementalSpiritAtkBonus(SPIRIT_OF_FLAMES_ID, 0, 0, 'main'), 0);
  assert.equal(elementalSpiritEffectiveAtk({ id: SPIRIT_OF_FLAMES_ID, faceUp: true }, 1700, 0, 0, 'battle'), 2000);
});

test('The Rock Spirit gains 300 ATK only during the opponent team Battle Phase', () => {
  assert.equal(elementalSpiritAtkBonus(THE_ROCK_SPIRIT_ID, 0, 1, 'battle'), 300);
  assert.equal(elementalSpiritAtkBonus(THE_ROCK_SPIRIT_ID, 0, 0, 'battle'), 0);
  assert.equal(elementalSpiritAtkBonus(THE_ROCK_SPIRIT_ID, 0, 1, 'main'), 0);
  assert.equal(elementalSpiritEffectiveAtk({ id: THE_ROCK_SPIRIT_ID, faceUp: true }, 1700, 0, 1, 'battle'), 2000);
});

test('face-down Spirits receive no temporary ATK bonus and atkBoost is not mutated', () => {
  const faceDown = { id: SPIRIT_OF_FLAMES_ID, faceUp: false, atkBoost: 0 };
  assert.equal(elementalSpiritEffectiveAtk(faceDown, 1700, 0, 0, 'battle'), 1700);
  assert.equal(faceDown.atkBoost, 0);
  assert.equal(elementalSpiritAtkBonus(GARUDA_THE_WIND_SPIRIT_ID, 0, 1, 'battle'), 0);
});

test('Garuda offers only face-up opposing monsters in the opponent End Phase', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, GARUDA_THE_WIND_SPIRIT_ID);
  const targetUid = moveDeckCardToField(duel, 1, 1, 'fixture-opponent', 'atk', true);
  moveDeckCardToField(duel, 0, 0, 'fixture-own');
  moveDeckCardToField(duel, 1, 1, 'fixture-hidden', 'def', false);
  activateOpponentTurn(duel);
  const targets = garudaEndPhaseTargets(duel, sourceUid, { phase: 'opponent-end', activeTeam: 1 });
  assert.deepEqual(targets.map(monster => monster.uid), [targetUid]);
});

test('Garuda changes one selected target, marks its own once-per-turn use and preserves hands/inventory', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, GARUDA_THE_WIND_SPIRIT_ID);
  const targetUid = moveDeckCardToField(duel, 1, 1, 'fixture-opponent', 'atk', true);
  activateOpponentTurn(duel);
  const beforeInventory = inventoryMap(duel);
  const beforeHands = JSON.stringify([duel.core.players[0].hand, duel.core.players[1].hand, duel.reserves[2].hand, duel.reserves[3].hand]);
  const next = resolveGarudaPositionChange(duel, sourceUid, targetUid, { phase: 'opponent-end', activeTeam: 1 });
  assert.ok(next);
  assert.equal(next.core.players[1].monsters.find(monster => monster.uid === targetUid).position, 'def');
  assert.equal(next.core.players[0].monsters.find(monster => monster.uid === sourceUid).effectUsedTurn, next.core.turn);
  assert.equal(next.core.players[1].monsters.find(monster => monster.uid === targetUid).changed, 0);
  assert.deepEqual(inventoryMap(next), beforeInventory);
  assert.equal(JSON.stringify([next.core.players[0].hand, next.core.players[1].hand, next.reserves[2].hand, next.reserves[3].hand]), beforeHands);
  assert.equal(resolveGarudaPositionChange(next, sourceUid, targetUid, { phase: 'opponent-end', activeTeam: 1 }), null);
});

test('Garuda cannot target a face-down monster or a target locked through the current turn', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, GARUDA_THE_WIND_SPIRIT_ID);
  moveDeckCardToField(duel, 1, 1, 'fixture-hidden', 'def', false);
  const lockedUid = moveDeckCardToField(duel, 1, 1, 'fixture-locked', 'atk', true);
  duel.core.players[1].monsters.find(monster => monster.uid === lockedUid).positionLockedThrough = duel.core.turn;
  activateOpponentTurn(duel);
  assert.deepEqual(garudaEndPhaseTargets(duel, sourceUid, { phase: 'opponent-end', activeTeam: 1 }), []);
});

test('Garuda cannot activate in its controller End Phase or from a stale phase window', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, GARUDA_THE_WIND_SPIRIT_ID);
  moveDeckCardToField(duel, 1, 1, 'fixture-opponent', 'atk', true);
  activateOpponentTurn(duel);
  assert.deepEqual(garudaEndPhaseTargets(duel, sourceUid, { phase: 'opponent-end', activeTeam: 0 }), []);
  duel.core.current = 0;
  duel.cursor = duel.active[0];
  duel.core.teamRotation.cursor = duel.cursor;
  assert.deepEqual(garudaEndPhaseTargets(duel, sourceUid, { phase: 'opponent-end', activeTeam: 1 }), []);
});

test('two Garuda copies have independent once-per-turn usage', () => {
  const duel = makeDuel();
  const firstUid = moveDeckCardToField(duel, 0, 0, GARUDA_THE_WIND_SPIRIT_ID);
  const secondUid = moveDeckCardToField(duel, 2, 0, GARUDA_THE_WIND_SPIRIT_ID);
  const targetUid = moveDeckCardToField(duel, 1, 1, 'fixture-opponent', 'atk', true);
  activateOpponentTurn(duel);
  const first = resolveGarudaPositionChange(duel, firstUid, targetUid, { phase: 'opponent-end', activeTeam: 1 });
  assert.ok(first);
  assert.deepEqual(garudaEndPhaseTargets(first, firstUid, { phase: 'opponent-end', activeTeam: 1 }), []);
  assert.deepEqual(garudaEndPhaseTargets(first, secondUid, { phase: 'opponent-end', activeTeam: 1 }).map(monster => monster.uid), [targetUid]);
});

test('the adapter preserves 20–30 Main Deck, three shared Monster/Spell-Trap Zones, separate Field Zone and Extra Deck limit', () => {
  const duel = makeDuel();
  const sourceUid = replaceHandCardWith(duel, 0, 0, THE_ROCK_SPIRIT_ID);
  const costUid = moveDeckCardToGrave(duel, 2, 0, EARTH_COST);
  const next = payElementalSpiritSummon(duel, sourceUid, costUid, getCard);
  assert.ok(next);
  for (const team of [0, 1]) {
    assert.ok(next.core.players[team].monsters.length <= 3);
    assert.ok(next.core.players[team].backrow.length <= 3);
  }
  assert.equal(next.core.players[0].field, duel.core.players[0].field);
  assert.equal(next.core.players[1].field, duel.core.players[1].field);
  assert.equal(next.core.players[0].extra.length, duel.core.players[0].extra.length);
  assert.equal(next.core.players[1].extra.length, duel.core.players[1].extra.length);
  assert.equal(tagInventory(next).length, tagInventory(duel).length);
});

test('Garuda requires a WIND monster from the same team Graveyard before it can be summoned', () => {
  const duel = makeDuel();
  const sourceUid = replaceHandCardWith(duel, 0, 0, GARUDA_THE_WIND_SPIRIT_ID);
  const costUid = moveDeckCardToGrave(duel, 2, 0, WIND_COST);
  const plan = prepareElementalSpiritSummon(duel, sourceUid, getCard);
  assert.ok(plan);
  assert.deepEqual(plan.costCandidates.map(card => card.uid), [costUid]);
});

test('a six-card hand is not auto-discarded during the summon; only the Spirit leaves the hand', () => {
  const duel = makeDuel();
  const sourceUid = replaceHandCardWith(duel, 0, 0, THE_ROCK_SPIRIT_ID);
  const hand = duel.core.players[0].hand;
  for (let i = 0; i < 2; i++) {
    const card = duel.core.players[0].deck.pop();
    assert.ok(card);
    hand.push(card);
  }
  const costUid = moveDeckCardToGrave(duel, 2, 0, EARTH_COST);
  assert.equal(hand.length, 6);
  const next = payElementalSpiritSummon(duel, sourceUid, costUid, getCard);
  assert.ok(next);
  assert.equal(next.core.players[0].hand.length, 5);
  assert.equal(next.core.players[0].hand.some(card => card.uid === sourceUid), false);
});

test('the next physical partner may summon from their own hand after the team seat rotates', () => {
  const duel = makeDuel();
  swapTeamSeat(duel.core, 2);
  duel.cursor = 2;
  duel.core.teamRotation.cursor = 2;
  const sourceUid = replaceHandCardWith(duel, 2, 0, SPIRIT_OF_FLAMES_ID);
  const costUid = moveDeckCardToGrave(duel, 0, 0, FIRE_COST);
  const inactiveHandBefore = structuredClone(duel.reserves[0].hand);

  const next = payElementalSpiritSummon(duel, sourceUid, costUid, getCard);

  assert.ok(next);
  assert.equal(next.core.players[0].monsters[0].uid, sourceUid);
  assert.equal(next.core.players[0].monsters[0].owner, 0);
  assert.deepEqual(next.reserves[0].hand, inactiveHandBefore);
  assert.equal(next.core.players[0].banished[0].uid, costUid);
});

test('a desynchronized TagDuel rotation cursor is rejected instead of reading stale partner data', () => {
  const duel = makeDuel();
  const sourceUid = replaceHandCardWith(duel, 0, 0, SPIRIT_OF_FLAMES_ID);
  moveDeckCardToGrave(duel, 2, 0, FIRE_COST);
  duel.core.teamRotation.cursor = 3;

  assert.throws(() => prepareElementalSpiritSummon(duel, sourceUid, getCard), /fora de sincronia/);
});
