const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagNormalCardIds, tagInventory } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const {
  THUNDER_DRAGON_ID, ELECTRIC_SNAKE_ID,
  activateThunderDragon, resolveThunderDragonSearch,
  prepareElectricSnakeTrigger, resolveElectricSnakeDraw,
  assertHandDiscardPhysicalRules,
} = require('../dist/handDiscardTagAdapters.js');

const CARD_ID = tagNormalCardIds[0]; // enabled fixture identity; the real card ID is supplied as an adapter override.
assert.ok(CARD_ID);
assert.ok(getDuelCard(CARD_ID));
assert.ok(enabledCardIds.includes(CARD_ID));

function makeDuel(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  assert.equal(deck.length, 20);
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i, name: 'Member ' + i, cards: [...deck], extra: [],
  }));
  return createTagDuel(players, { seed: 'm588-hand-discard', first, classic: true });
}
function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team][zone] : duel.reserves[String(seat)][zone];
}
function putCardInHand(duel, seat, id = CARD_ID) {
  const card = privateZone(duel, seat, 'hand')[0];
  assert.ok(card);
  card.id = id;
  return card.uid;
}
function putCopiesOnTop(duel, seat, count, id = CARD_ID) {
  const deck = privateZone(duel, seat, 'deck');
  assert.ok(deck.length >= count);
  for (let i = 0; i < count; i++) deck[i].id = id;
  return deck.slice(0, count).map(card => card.uid);
}
function inventory(duel) {
  return tagInventory(duel).map(card => card.uid + '|' + card.id).sort();
}
function electricEvent(duel, ownerSeat, sourceUid, overrides = {}) {
  return {
    id: 'electric-snake:' + sourceUid + ':' + duel.core.turn,
    kind: 'discard-to-grave',
    sourceUid,
    sourceId: CARD_ID,
    from: 'hand',
    to: 'grave',
    by: 'effect',
    effectControllerTeam: 1 - (ownerSeat % 2),
    turn: duel.core.turn,
    ...overrides,
  };
}
function discardElectricSnakeFromHand(duel, ownerSeat) {
  const team = ownerSeat % 2;
  const hand = privateZone(duel, ownerSeat, 'hand');
  const card = hand.shift();
  assert.ok(card);
  card.id = CARD_ID;
  duel.core.players[team].grave.push(card);
  return card.uid;
}

test('Thunder Dragon only activates from the active physical hand during an open Main Phase', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0);
  const plan = activateThunderDragon(duel, sourceUid, { cardId: CARD_ID });
  assert.ok(plan);
  assert.equal(plan.plan.ownerSeat, 0);
  assert.equal(plan.plan.ownerTeam, 0);
  assert.ok(plan.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.equal(privateZone(plan.state, 0, 'hand').some(card => card.uid === sourceUid), false);
});

test('Thunder Dragon cannot be activated from the inactive partner hand', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 2);
  assert.equal(activateThunderDragon(duel, sourceUid, { cardId: CARD_ID }), null);
});

test('Thunder Dragon rejects Battle Phase, response windows, and stale/non-owned sources', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0);
  duel.core.phase = 'battle';
  assert.equal(activateThunderDragon(duel, sourceUid, { cardId: CARD_ID }), null);

  const response = makeDuel(0);
  const responseUid = putCardInHand(response, 0);
  response.core.phase = 'response';
  assert.equal(activateThunderDragon(response, responseUid, { cardId: CARD_ID }), null);

  const stale = makeDuel(0);
  const staleUid = putCardInHand(stale, 0);
  assert.equal(activateThunderDragon(stale, 'm2:not-in-hand', { cardId: CARD_ID }), null);
  assert.equal(activateThunderDragon(stale, staleUid, { cardId: THUNDER_DRAGON_ID }), null);
});

test('Thunder Dragon pays its discard cost immediately and searches up to two copies at resolution', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0);
  const targetUids = putCopiesOnTop(duel, 0, 2);
  const before = inventory(duel);
  const activation = activateThunderDragon(duel, sourceUid, { cardId: CARD_ID });
  assert.ok(activation);
  const handBeforeResolve = privateZone(activation.state, 0, 'hand').length;
  const result = resolveThunderDragonSearch(activation.state, activation.plan, targetUids, { cardId: CARD_ID });
  assert.ok(result);
  assert.deepEqual(result.addedUids, targetUids);
  assert.equal(privateZone(result.state, 0, 'hand').length, handBeforeResolve + 2);
  assert.deepEqual(inventory(result.state), before);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.equal(duel.core.players[0].grave.some(card => card.uid === sourceUid), false);
});

test('Thunder Dragon may add one copy or choose zero; the effect has no once-per-turn limit', () => {
  const duel = makeDuel(0);
  const first = putCardInHand(duel, 0);
  const second = privateZone(duel, 0, 'hand')[1].uid;
  privateZone(duel, 0, 'hand').find(card => card.uid === second).id = CARD_ID;
  const oneTarget = putCopiesOnTop(duel, 0, 1)[0];

  const firstActivation = activateThunderDragon(duel, first, { cardId: CARD_ID });
  assert.ok(firstActivation);
  const one = resolveThunderDragonSearch(firstActivation.state, firstActivation.plan, [oneTarget], { cardId: CARD_ID });
  assert.ok(one);
  assert.deepEqual(one.addedUids, [oneTarget]);

  const secondActivation = activateThunderDragon(one.state, second, { cardId: CARD_ID });
  assert.ok(secondActivation, 'a second physical copy may activate in the same turn');
  const zero = resolveThunderDragonSearch(secondActivation.state, secondActivation.plan, [], { cardId: CARD_ID });
  assert.ok(zero);
  assert.deepEqual(zero.addedUids, []);
});

test('Thunder Dragon search cannot use the partner or opposing physical Deck', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0);
  const activation = activateThunderDragon(duel, sourceUid, { cardId: CARD_ID });
  assert.ok(activation);
  const partnerUid = privateZone(activation.state, 2, 'deck')[0].uid;
  const opponentUid = privateZone(activation.state, 1, 'deck')[0].uid;
  assert.equal(resolveThunderDragonSearch(activation.state, activation.plan, [partnerUid], { cardId: CARD_ID }), null);
  assert.equal(resolveThunderDragonSearch(activation.state, activation.plan, [opponentUid], { cardId: CARD_ID }), null);
});

test('Thunder Dragon resolution revalidates duplicate, stale, wrong-card and over-two selections', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0);
  const targets = putCopiesOnTop(duel, 0, 3);
  const activation = activateThunderDragon(duel, sourceUid, { cardId: CARD_ID });
  assert.ok(activation);
  assert.equal(resolveThunderDragonSearch(activation.state, activation.plan, [targets[0], targets[0]], { cardId: CARD_ID }), null);
  assert.equal(resolveThunderDragonSearch(activation.state, activation.plan, targets, { cardId: CARD_ID }), null);
  assert.equal(resolveThunderDragonSearch(activation.state, { ...activation.plan, turn: activation.plan.turn - 1 }, [targets[0]], { cardId: CARD_ID }), null);
  assert.equal(resolveThunderDragonSearch(activation.state, activation.plan, [targets[0]], { cardId: THUNDER_DRAGON_ID }), null);
});

test('negating Thunder Dragon leaves its activation cost in the shared Graveyard and adds nothing', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0);
  const targetUid = putCopiesOnTop(duel, 0, 1)[0];
  const activation = activateThunderDragon(duel, sourceUid, { cardId: CARD_ID });
  assert.ok(activation);
  const beforeHand = privateZone(activation.state, 0, 'hand').map(card => card.uid);
  const result = resolveThunderDragonSearch(activation.state, activation.plan, [], { cardId: CARD_ID, negated: true });
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.deepEqual(result.addedUids, []);
  assert.deepEqual(privateZone(result.state, 0, 'hand').map(card => card.uid), beforeHand);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.ok(privateZone(result.state, 0, 'deck').some(card => card.uid === targetUid));
});

test('Thunder Dragon does not discard excess hand cards before the End Phase', () => {
  const duel = makeDuel(0);
  const hand = privateZone(duel, 0, 'hand');
  const deck = privateZone(duel, 0, 'deck');
  while (hand.length < 6) hand.push(deck.shift());
  const sourceUid = putCardInHand(duel, 0);
  const targetUids = putCopiesOnTop(duel, 0, 2);
  const activation = activateThunderDragon(duel, sourceUid, { cardId: CARD_ID });
  assert.ok(activation);
  const result = resolveThunderDragonSearch(activation.state, activation.plan, targetUids, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(privateZone(result.state, 0, 'hand').length, 7);
  assert.equal(result.state.core.phase, 'main');
});

test('Thunder Dragon adapters do not mutate the input snapshot', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0);
  const targetUids = putCopiesOnTop(duel, 0, 2);
  const before = JSON.stringify(duel);
  const activation = activateThunderDragon(duel, sourceUid, { cardId: CARD_ID });
  assert.ok(activation);
  assert.equal(JSON.stringify(duel), before);
  const activatedBefore = JSON.stringify(activation.state);
  resolveThunderDragonSearch(activation.state, activation.plan, targetUids, { cardId: CARD_ID });
  assert.equal(JSON.stringify(activation.state), activatedBefore);
});

test('Electric Snake triggers only when an opponent-controlled card effect discards it from the active hand to the shared GY', () => {
  const duel = makeDuel(0);
  const sourceUid = discardElectricSnakeFromHand(duel, 0);
  const plan = prepareElectricSnakeTrigger(duel, electricEvent(duel, 0, sourceUid), CARD_ID);
  assert.ok(plan);
  assert.equal(plan.ownerSeat, 0);
  assert.equal(plan.ownerTeam, 0);
  assert.equal(plan.effectControllerTeam, 1);
});

test('Electric Snake rejects cost, rule, same-team and non-hand discards', () => {
  const duel = makeDuel(0);
  const sourceUid = discardElectricSnakeFromHand(duel, 0);
  assert.equal(prepareElectricSnakeTrigger(duel, electricEvent(duel, 0, sourceUid, { by: 'cost' }), CARD_ID), null);
  assert.equal(prepareElectricSnakeTrigger(duel, electricEvent(duel, 0, sourceUid, { by: 'rule' }), CARD_ID), null);
  assert.equal(prepareElectricSnakeTrigger(duel, electricEvent(duel, 0, sourceUid, { effectControllerTeam: 0 }), CARD_ID), null);
  assert.equal(prepareElectricSnakeTrigger(duel, electricEvent(duel, 0, sourceUid, { from: 'deck' }), CARD_ID), null);
  assert.equal(prepareElectricSnakeTrigger(duel, electricEvent(duel, 0, sourceUid, { to: 'banished' }), CARD_ID), null);
});

test('Electric Snake cannot trigger from the inactive partner private hand', () => {
  const duel = makeDuel(0);
  const sourceUid = discardElectricSnakeFromHand(duel, 2);
  assert.equal(prepareElectricSnakeTrigger(duel, electricEvent(duel, 2, sourceUid), CARD_ID), null);
});

test('Electric Snake resolves from the affected physical owner Deck and hand, not the partner or opponent', () => {
  const duel = makeDuel(0);
  const sourceUid = discardElectricSnakeFromHand(duel, 0);
  const ownerDeck = privateZone(duel, 0, 'deck');
  const expected = ownerDeck.slice(0, 2).map(card => card.uid);
  const partnerDeckBefore = privateZone(duel, 2, 'deck').map(card => card.uid);
  const opponentDeckBefore = privateZone(duel, 1, 'deck').map(card => card.uid);
  const partnerHandBefore = privateZone(duel, 2, 'hand').map(card => card.uid);
  const ownerHandBefore = privateZone(duel, 0, 'hand').length;
  const plan = prepareElectricSnakeTrigger(duel, electricEvent(duel, 0, sourceUid), CARD_ID);
  assert.ok(plan);
  const before = inventory(duel);
  const result = resolveElectricSnakeDraw(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.deepEqual(result.drawnUids, expected);
  assert.equal(privateZone(result.state, 0, 'hand').length, ownerHandBefore + 2);
  assert.deepEqual(privateZone(result.state, 2, 'deck').map(card => card.uid), partnerDeckBefore);
  assert.deepEqual(privateZone(result.state, 1, 'deck').map(card => card.uid), opponentDeckBefore);
  assert.deepEqual(privateZone(result.state, 2, 'hand').map(card => card.uid), partnerHandBefore);
  assert.deepEqual(inventory(result.state), before);
});

test('Electric Snake may trigger for the active representative of either team', () => {
  const duel = makeDuel(0);
  const sourceUid = discardElectricSnakeFromHand(duel, 1);
  const plan = prepareElectricSnakeTrigger(duel, electricEvent(duel, 1, sourceUid), CARD_ID);
  assert.ok(plan);
  assert.equal(plan.ownerTeam, 1);
  const result = resolveElectricSnakeDraw(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(result.state.core.players[1].hand.length, duel.core.players[1].hand.length + 2);
});

test('Electric Snake deck-out is atomic when fewer than two cards remain', () => {
  const duel = makeDuel(0);
  const sourceUid = discardElectricSnakeFromHand(duel, 0);
  const deck = privateZone(duel, 0, 'deck');
  privateZone(duel, 0, 'hand').push(...deck.splice(0, deck.length - 1));
  assert.equal(deck.length, 1);
  const plan = prepareElectricSnakeTrigger(duel, electricEvent(duel, 0, sourceUid), CARD_ID);
  assert.ok(plan);
  const result = resolveElectricSnakeDraw(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(result.deckOut, true);
  assert.deepEqual(result.drawnUids, []);
  assert.equal(privateZone(result.state, 0, 'deck').length, 1);
  assert.equal(result.state.core.phase, 'finished');
  assert.equal(result.state.core.winner, 'tag-team-1');
  assert.equal(result.state.core.reason, 'não conseguiu comprar 2 cartas');
});

test('negated Electric Snake trigger does not draw or cause deck-out', () => {
  const duel = makeDuel(0);
  const sourceUid = discardElectricSnakeFromHand(duel, 0);
  const deck = privateZone(duel, 0, 'deck');
  privateZone(duel, 0, 'hand').push(...deck.splice(0, deck.length - 1));
  const plan = prepareElectricSnakeTrigger(duel, electricEvent(duel, 0, sourceUid), CARD_ID);
  assert.ok(plan);
  const result = resolveElectricSnakeDraw(duel, plan, { cardId: CARD_ID, negated: true });
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.equal(result.deckOut, false);
  assert.deepEqual(result.drawnUids, []);
  assert.equal(result.state.core.phase, 'main');
});

test('Electric Snake still resolves if its physical copy leaves the shared GY after the trigger was created', () => {
  const duel = makeDuel(0);
  const sourceUid = discardElectricSnakeFromHand(duel, 0);
  const plan = prepareElectricSnakeTrigger(duel, electricEvent(duel, 0, sourceUid), CARD_ID);
  assert.ok(plan);
  const [source] = duel.core.players[0].grave.splice(duel.core.players[0].grave.findIndex(card => card.uid === sourceUid), 1);
  duel.core.players[0].banished.push(source);
  const result = resolveElectricSnakeDraw(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(result.drawnUids.length, 2);
  assert.ok(result.state.core.players[0].banished.some(card => card.uid === sourceUid));
});

test('Electric Snake draw above six is retained until the End Phase', () => {
  const duel = makeDuel(0);
  const sourceUid = discardElectricSnakeFromHand(duel, 0);
  const hand = privateZone(duel, 0, 'hand');
  const deck = privateZone(duel, 0, 'deck');
  while (hand.length < 6) hand.push(deck.shift());
  const plan = prepareElectricSnakeTrigger(duel, electricEvent(duel, 0, sourceUid), CARD_ID);
  assert.ok(plan);
  const result = resolveElectricSnakeDraw(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(privateZone(result.state, 0, 'hand').length, 8);
  assert.equal(result.state.core.phase, 'main');
});

test('Electric Snake rejects stale, forged and missing physical source events', () => {
  const duel = makeDuel(0);
  const sourceUid = discardElectricSnakeFromHand(duel, 0);
  const event = electricEvent(duel, 0, sourceUid);
  assert.equal(prepareElectricSnakeTrigger(duel, { ...event, turn: duel.core.turn + 1 }, CARD_ID), null);
  assert.equal(prepareElectricSnakeTrigger(duel, { ...event, sourceId: ELECTRIC_SNAKE_ID }, CARD_ID), null);
  assert.equal(prepareElectricSnakeTrigger(duel, { ...event, sourceUid: 'm2:forged' }, CARD_ID), null);
  assert.equal(prepareElectricSnakeTrigger(duel, event, ELECTRIC_SNAKE_ID), null);
});

test('Electric Snake plan is revalidated at resolution and the input snapshot remains unchanged', () => {
  const duel = makeDuel(0);
  const sourceUid = discardElectricSnakeFromHand(duel, 0);
  const plan = prepareElectricSnakeTrigger(duel, electricEvent(duel, 0, sourceUid), CARD_ID);
  assert.ok(plan);
  const before = JSON.stringify(duel);
  const result = resolveElectricSnakeDraw(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(JSON.stringify(duel), before);
  assert.equal(result.drawnUids.length, 2);
});

test('the owner rules retain 20–30 Main Deck, 3+3 shared zones, separate Field Zone and Extra Deck limit five', () => {
  const duel = makeDuel(0);
  assert.doesNotThrow(() => assertHandDiscardPhysicalRules(duel));
  privateZone(duel, 0, 'deck').pop();
  assert.throws(() => assertHandDiscardPhysicalRules(duel), /Deck principal físico/);
});


test('the shared field accepts exactly three Monster Zones and three Spell/Trap Zones while Field Zone stays separate', () => {
  const duel = makeDuel(0);
  const deck = privateZone(duel, 0, 'deck');
  for (let i = 0; i < 3; i++) {
    const card = deck.pop();
    duel.core.players[0].monsters.push({
      ...card, position: 'atk', faceUp: true, entered: duel.core.turn,
      changed: duel.core.turn, attacked: 0, atkBoost: 0, defBoost: 0,
    });
  }
  for (let i = 0; i < 3; i++) {
    const card = deck.pop();
    duel.core.players[0].backrow.push({ ...card, setTurn: duel.core.turn, faceUp: false });
  }
  const field = deck.pop();
  duel.core.players[0].field = { ...field, setTurn: duel.core.turn, faceUp: true };
  assert.doesNotThrow(() => assertHandDiscardPhysicalRules(duel));
  const fourthMonster = deck.pop();
  duel.core.players[0].monsters.push({
    ...fourthMonster, position: 'atk', faceUp: true, entered: duel.core.turn,
    changed: duel.core.turn, attacked: 0, atkBoost: 0, defBoost: 0,
  });
  assert.throws(() => assertHandDiscardPhysicalRules(duel), /três Zonas de Monstros/);
});

test('five Fusion cards are accepted in each physical Extra Deck and a sixth is rejected', () => {
  const fusionIds = enabledCardIds.filter(id => getDuelCard(id)?.fusion === true);
  assert.ok(fusionIds.length >= 6, 'fixture needs six enabled Fusion identities');
  const main = tagNormalCardIds.slice(0, 30);
  assert.equal(main.length, 30);
  const extra = fusionIds.slice(0, 5);
  const players = [0, 1, 2, 3].map(i => ({
    id: 'extra-' + i, name: 'Extra ' + i, cards: [...main], extra: [...extra],
  }));
  const duel = createTagDuel(players, { seed: 'm588-extra-five', first: 0, classic: true });
  assert.doesNotThrow(() => assertHandDiscardPhysicalRules(duel));
  const extraCard = privateZone(duel, 0, 'deck').pop();
  extraCard.id = fusionIds[5];
  duel.core.players[0].extra.push(extraCard);
  assert.throws(() => assertHandDiscardPhysicalRules(duel), /Deck Adicional físico excede cinco/);
});
