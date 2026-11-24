const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagNormalCardIds, tagInventory } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const {
  MAGICAL_MERCHANT_ID, prepareMagicalMerchantTrigger, resolveMagicalMerchant,
  assertMagicalMerchantPhysicalRules, assertMagicalMerchantExtraDeckCounts,
} = require('../dist/magicalMerchantTagAdapter.js');

const CARD_ID = tagNormalCardIds[0]; // enabled fixture identity; the real passcode is supplied as an adapter override.
const SPELL_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'spell' && !getDuelCard(id)?.field);
const TRAP_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'trap');
const FIELD_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'spell' && getDuelCard(id)?.field === true);
assert.ok(CARD_ID && getDuelCard(CARD_ID));
assert.ok(SPELL_ID && TRAP_ID && FIELD_ID);

function makeDuel(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  assert.equal(deck.length, 20);
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i, name: 'Member ' + i, cards: [...deck], extra: [],
  }));
  return createTagDuel(players, { seed: 'm589-magical-merchant', first, classic: true });
}
function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team][zone] : duel.reserves[String(seat)][zone];
}
function putSource(duel, ownerSeat = 0, controllerTeam = ownerSeat % 2) {
  const ref = privateZone(duel, ownerSeat, 'deck').pop();
  assert.ok(ref);
  ref.id = CARD_ID;
  const monster = {
    ...ref, position: 'def', faceUp: true, entered: duel.core.turn,
    changed: duel.core.turn, attacked: 0, atkBoost: 0, defBoost: 0,
  };
  duel.core.players[controllerTeam].monsters.push(monster);
  return monster;
}
function flipEvent(duel, source, controllerTeam, cause = 'flip-summon', overrides = {}) {
  return {
    id: 'magical-merchant:' + source.uid + ':' + cause,
    kind: 'flip-face-up',
    sourceUid: source.uid,
    sourceId: source.id,
    controllerTeam,
    turn: duel.core.turn,
    cause,
    wasFaceDown: true,
    faceUp: true,
    ...overrides,
  };
}
function setTop(deck, ids) {
  assert.ok(deck.length >= ids.length);
  for (let i = 0; i < ids.length; i++) deck[i].id = ids[i];
}
function inventory(duel) {
  return tagInventory(duel).map(card => card.uid + '|' + card.id).sort();
}
function moveSourceToOwnerGrave(duel, source) {
  const controller = duel.core.players.findIndex(team => team.monsters.some(card => card.uid === source.uid));
  if (controller >= 0) duel.core.players[controller].monsters = duel.core.players[controller].monsters.filter(card => card.uid !== source.uid);
  const owner = /^m([0-3]):/.exec(source.uid);
  assert.ok(owner);
  duel.core.players[Number(owner[1]) % 2].grave.push({ uid: source.uid, id: source.id });
}

test('Magical Merchant accepts Flip Summon, battle and card-effect face-up transitions', () => {
  for (const cause of ['flip-summon', 'battle', 'card-effect']) {
    const duel = makeDuel(0);
    const source = putSource(duel, 0, 0);
    const plan = prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0, cause), CARD_ID);
    assert.ok(plan);
    assert.equal(plan.cause, cause);
    assert.equal(plan.activeSeat, 0);
  }
});

test('Magical Merchant rejects events without a real current face-down to face-up transition', () => {
  const duel = makeDuel(0);
  const source = putSource(duel, 0, 0);
  assert.equal(prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0, 'flip-summon', { wasFaceDown: false }), CARD_ID), null);
  assert.equal(prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0, 'flip-summon', { faceUp: false }), CARD_ID), null);
  assert.equal(prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0, 'flip-summon', { turn: duel.core.turn + 1 }), CARD_ID), null);
  assert.equal(prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 1), CARD_ID), null);
  assert.equal(prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0, 'flip-summon', { sourceId: MAGICAL_MERCHANT_ID }), CARD_ID), null);
});

test('the first excavated Trap is added; preceding monsters go to the shared GY and lower Deck cards stay put', () => {
  const duel = makeDuel(0);
  const source = putSource(duel, 0, 0);
  const deck = privateZone(duel, 0, 'deck');
  setTop(deck, [CARD_ID, CARD_ID, TRAP_ID, SPELL_ID]);
  const expected = deck.slice(0, 4).map(card => card.uid);
  const remaining = deck.slice(4).map(card => card.uid);
  const plan = prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0), CARD_ID);
  assert.ok(plan);
  const before = inventory(duel);
  const result = resolveMagicalMerchant(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.deepEqual(result.revealedCards.map(card => card.uid), expected);
  assert.equal(result.addedUid, expected[2]);
  assert.deepEqual(result.sentToGraveUids, expected.slice(0, 2));
  assert.deepEqual(privateZone(result.state, 0, 'deck').map(card => card.uid), remaining);
  assert.ok(privateZone(result.state, 0, 'hand').some(card => card.uid === expected[2]));
  assert.deepEqual(result.state.core.players[0].grave.filter(card => expected.slice(0, 2).includes(card.uid)).map(card => card.uid), expected.slice(0, 2));
  assert.deepEqual(inventory(result.state), before);
});

test('the first Spell also qualifies and later Spell/Trap cards remain in the Deck', () => {
  const duel = makeDuel(0);
  const source = putSource(duel, 0, 0);
  const deck = privateZone(duel, 0, 'deck');
  setTop(deck, [CARD_ID, SPELL_ID, TRAP_ID]);
  const expected = deck.slice(0, 3).map(card => card.uid);
  const plan = prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0), CARD_ID);
  assert.ok(plan);
  const result = resolveMagicalMerchant(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(result.addedUid, expected[1]);
  assert.deepEqual(result.sentToGraveUids, [expected[0]]);
  assert.ok(privateZone(result.state, 0, 'deck').some(card => card.uid === expected[2]));
});

test('a Field Spell is a Spell Card for Magical Merchant', () => {
  const duel = makeDuel(0);
  const source = putSource(duel, 0, 0);
  const deck = privateZone(duel, 0, 'deck');
  setTop(deck, [CARD_ID, FIELD_ID, TRAP_ID]);
  const fieldUid = deck[1].uid;
  const plan = prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0), CARD_ID);
  assert.ok(plan);
  const result = resolveMagicalMerchant(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(result.addedUid, fieldUid);
  assert.ok(privateZone(result.state, 0, 'hand').some(card => card.uid === fieldUid));
});

test('if no Spell/Trap exists, all excavated cards go to the shared GY without deck-out', () => {
  const duel = makeDuel(0);
  const source = putSource(duel, 0, 0);
  const deck = privateZone(duel, 0, 'deck');
  for (const card of deck) card.id = CARD_ID;
  const expected = deck.map(card => card.uid);
  const plan = prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0), CARD_ID);
  assert.ok(plan);
  const result = resolveMagicalMerchant(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(result.addedUid, null);
  assert.deepEqual(result.sentToGraveUids, expected);
  assert.equal(privateZone(result.state, 0, 'deck').length, 0);
  assert.equal(result.state.core.phase, 'main');
  assert.equal(result.deckOut, undefined);
});

test('negation prevents excavation and preserves the controller private Deck', () => {
  const duel = makeDuel(0);
  const source = putSource(duel, 0, 0);
  setTop(privateZone(duel, 0, 'deck'), [CARD_ID, TRAP_ID]);
  const plan = prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0), CARD_ID);
  assert.ok(plan);
  const beforeDeck = privateZone(duel, 0, 'deck').map(card => card.uid);
  const beforeHand = privateZone(duel, 0, 'hand').map(card => card.uid);
  const result = resolveMagicalMerchant(duel, plan, { cardId: CARD_ID, negated: true });
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.deepEqual(result.revealedCards, []);
  assert.equal(result.addedUid, null);
  assert.deepEqual(privateZone(result.state, 0, 'deck').map(card => card.uid), beforeDeck);
  assert.deepEqual(privateZone(result.state, 0, 'hand').map(card => card.uid), beforeHand);
});

test('a stolen Magical Merchant uses the active controller team Deck, not its physical owner Deck', () => {
  const duel = makeDuel(0);
  const source = putSource(duel, 1, 0); // physical owner is team 1; current controller is team 0
  const controllerDeck = privateZone(duel, 0, 'deck');
  const ownerDeck = privateZone(duel, 1, 'deck');
  setTop(controllerDeck, [CARD_ID, TRAP_ID]);
  ownerDeck[0].id = SPELL_ID;
  const ownerTopUid = ownerDeck[0].uid;
  const controllerTrapUid = controllerDeck[1].uid;
  const ownerDeckBefore = ownerDeck.map(card => card.uid);
  const plan = prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0), CARD_ID);
  assert.ok(plan);
  assert.equal(plan.ownerTeam, 1);
  assert.equal(plan.controllerTeam, 0);
  assert.equal(plan.activeSeat, 0);
  const result = resolveMagicalMerchant(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(result.addedUid, controllerTrapUid);
  assert.deepEqual(privateZone(result.state, 1, 'deck').map(card => card.uid), ownerDeckBefore);
  assert.ok(privateZone(result.state, 1, 'deck').some(card => card.uid === ownerTopUid));
});

test('a card owned by the inactive partner but controlled by the active team still uses the active seat Deck', () => {
  const duel = makeDuel(0);
  const source = putSource(duel, 2, 0);
  setTop(privateZone(duel, 0, 'deck'), [CARD_ID, SPELL_ID]);
  const activeSpellUid = privateZone(duel, 0, 'deck')[1].uid;
  const partnerDeckBefore = privateZone(duel, 2, 'deck').map(card => card.uid);
  const plan = prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0), CARD_ID);
  assert.ok(plan);
  assert.equal(plan.ownerSeat, 2);
  assert.equal(plan.activeSeat, 0);
  const result = resolveMagicalMerchant(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(result.addedUid, activeSpellUid);
  assert.deepEqual(privateZone(result.state, 2, 'deck').map(card => card.uid), partnerDeckBefore);
});

test('the Flip Effect resolves if its source leaves the field after the trigger is prepared', () => {
  const duel = makeDuel(0);
  const source = putSource(duel, 1, 0);
  setTop(privateZone(duel, 0, 'deck'), [CARD_ID, TRAP_ID]);
  const plan = prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0), CARD_ID);
  assert.ok(plan);
  moveSourceToOwnerGrave(duel, source);
  const result = resolveMagicalMerchant(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(result.addedUid, privateZone(result.state, 0, 'hand').find(card => card.id === TRAP_ID)?.uid);
});

test('a stale or forged active-seat plan is rejected before touching another private Deck', () => {
  const duel = makeDuel(0);
  const source = putSource(duel, 0, 0);
  setTop(privateZone(duel, 0, 'deck'), [CARD_ID, TRAP_ID]);
  const plan = prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0), CARD_ID);
  assert.ok(plan);
  assert.equal(resolveMagicalMerchant(duel, { ...plan, activeSeat: 2 }, { cardId: CARD_ID }), null);
  assert.equal(resolveMagicalMerchant(duel, { ...plan, turn: plan.turn - 1 }, { cardId: CARD_ID }), null);
});

test('the adapter never mutates the input snapshot and conserves every physical UID', () => {
  const duel = makeDuel(0);
  const source = putSource(duel, 0, 0);
  setTop(privateZone(duel, 0, 'deck'), [CARD_ID, CARD_ID, TRAP_ID]);
  const plan = prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0), CARD_ID);
  assert.ok(plan);
  const before = JSON.stringify(duel);
  const beforeInventory = inventory(duel);
  const result = resolveMagicalMerchant(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(JSON.stringify(duel), before);
  assert.deepEqual(inventory(result.state), beforeInventory);
});

test('the End Phase hand limit remains deferred after adding a Spell/Trap', () => {
  const duel = makeDuel(0);
  const source = putSource(duel, 0, 0);
  const hand = privateZone(duel, 0, 'hand');
  const deck = privateZone(duel, 0, 'deck');
  while (hand.length < 6) hand.push(deck.shift());
  setTop(deck, [TRAP_ID]);
  const plan = prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 0), CARD_ID);
  assert.ok(plan);
  const result = resolveMagicalMerchant(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(privateZone(result.state, 0, 'hand').length, 7);
  assert.equal(result.state.core.phase, 'main');
});

test('the shared field keeps 3 Monster Zones, 3 Spell/Trap Zones and a separate Field Zone', () => {
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
    card.id = i === 0 ? SPELL_ID : TRAP_ID;
    duel.core.players[0].backrow.push({ ...card, setTurn: duel.core.turn, faceUp: false });
  }
  const field = deck.pop();
  field.id = FIELD_ID;
  duel.core.players[0].field = { ...field, setTurn: duel.core.turn, faceUp: true };
  assert.doesNotThrow(() => assertMagicalMerchantPhysicalRules(duel));
  const fourthBackrow = deck.pop();
  fourthBackrow.id = TRAP_ID;
  duel.core.players[0].backrow.push({ ...fourthBackrow, setTurn: duel.core.turn, faceUp: false });
  assert.throws(() => assertMagicalMerchantPhysicalRules(duel), /três Zonas de Magias/);
});

test('physical Extra Deck is capped at five for each of the four seats', () => {
  assert.doesNotThrow(() => assertMagicalMerchantExtraDeckCounts([5, 5, 5, 5], 5));
  assert.throws(() => assertMagicalMerchantExtraDeckCounts([5, 6, 5, 5], 5), /Deck Adicional físico excede cinco/);
  assert.throws(() => assertMagicalMerchantExtraDeckCounts([5, -1, 5, 5], 5), /Contagem do Deck Adicional inválida/);
});

test('Main Deck minimum remains twenty cards per physical seat', () => {
  const duel = makeDuel(0);
  privateZone(duel, 0, 'deck').pop();
  assert.throws(() => assertMagicalMerchantPhysicalRules(duel), /Deck principal físico fora do limite 20–30/);
});

test('the active representative of team 1 uses team 1 private Deck even while team 0 has the turn', () => {
  const duel = makeDuel(0);
  const source = putSource(duel, 1, 1);
  setTop(privateZone(duel, 1, 'deck'), [CARD_ID, TRAP_ID]);
  const selectedUid = privateZone(duel, 1, 'deck')[1].uid;
  const plan = prepareMagicalMerchantTrigger(duel, flipEvent(duel, source, 1), CARD_ID);
  assert.ok(plan);
  assert.equal(plan.activeSeat, 1);
  const result = resolveMagicalMerchant(duel, plan, { cardId: CARD_ID });
  assert.ok(result);
  assert.equal(result.addedUid, selectedUid);
});
