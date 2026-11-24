const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const FUSION_ID = enabledCardIds.find(id => getDuelCard(id)?.fusion);
const {
  SWIFT_GAIA_ID,
  prepareSwiftGaiaNormalSummon,
  resolveSwiftGaiaNormalSummon,
} = require('../dist/swiftGaiaNormalSummonTagAdapter.js');

const BASE_DECK = tagNormalCardIds.slice(0, 20);
assert.equal(BASE_DECK.length, 20, 'fixture requires a 20-card Main Deck per physical seat');

function makeDuel(first = 0) {
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...BASE_DECK],
  }));
  return createTagDuel(players, { seed: 'm603-swift-gaia', first, classic: true });
}

function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team][zone] : duel.reserves[seat][zone];
}

function putSwiftGaiaInHand(duel, seat) {
  const card = privateZone(duel, seat, 'deck').pop();
  assert.ok(card);
  card.id = SWIFT_GAIA_ID;
  privateZone(duel, seat, 'hand').push(card);
  return card.uid;
}

function clearHandExcept(duel, seat, sourceUid) {
  const hand = privateZone(duel, seat, 'hand');
  const others = hand.filter(card => card.uid !== sourceUid);
  hand.splice(0, hand.length, ...hand.filter(card => card.uid === sourceUid));
  privateZone(duel, seat, 'deck').push(...others);
}

function moveDeckCardToMonster(duel, seat, faceUp = true) {
  const card = privateZone(duel, seat, 'deck').pop();
  assert.ok(card);
  duel.core.players[seat % 2].monsters.push({
    ...card,
    position: 'atk',
    faceUp,
    entered: duel.core.turn,
    changed: duel.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  });
  return card.uid;
}

function inventory(duel) {
  return new Map(tagInventory(duel).filter(card => card.entityKind !== 'token').map(card => [card.uid, card.id]));
}

test('Swift Gaia só pode ser Normal Summoned sem Tributo se for a única carta da mão física', () => {
  const duel = makeDuel();
  const sourceUid = putSwiftGaiaInHand(duel, 0);
  assert.equal(prepareSwiftGaiaNormalSummon(duel, sourceUid), null);
  clearHandExcept(duel, 0, sourceUid);
  const plan = prepareSwiftGaiaNormalSummon(duel, sourceUid);
  assert.ok(plan);
  assert.deepEqual(plan.handSnapshot, [sourceUid]);
});

test('a mão privada do parceiro não invalida a condição do assento ativo', () => {
  const duel = makeDuel();
  const sourceUid = putSwiftGaiaInHand(duel, 0);
  clearHandExcept(duel, 0, sourceUid);
  assert.ok(privateZone(duel, 2, 'hand').length > 0);
  assert.ok(prepareSwiftGaiaNormalSummon(duel, sourceUid));
});

test('um parceiro inativo não pode Normal Summon com a própria mão durante o turno do colega', () => {
  const duel = makeDuel(2);
  const inactiveUid = putSwiftGaiaInHand(duel, 0);
  clearHandExcept(duel, 0, inactiveUid);
  assert.equal(prepareSwiftGaiaNormalSummon(duel, inactiveUid), null);
  const activeUid = putSwiftGaiaInHand(duel, 2);
  clearHandExcept(duel, 2, activeUid);
  assert.ok(prepareSwiftGaiaNormalSummon(duel, activeUid));
});

test('o procedimento exige Main Phase e Normal Summon ainda disponível', () => {
  const duel = makeDuel();
  const sourceUid = putSwiftGaiaInHand(duel, 0);
  clearHandExcept(duel, 0, sourceUid);
  duel.core.phase = 'battle';
  assert.equal(prepareSwiftGaiaNormalSummon(duel, sourceUid), null);
  duel.core.phase = 'main';
  duel.core.players[0].summoned = true;
  assert.equal(prepareSwiftGaiaNormalSummon(duel, sourceUid), null);
});

test('a resolução move o UID existente face-up Attack, consome a Normal Summon e não tributa', () => {
  const duel = makeDuel();
  const sourceUid = putSwiftGaiaInHand(duel, 0);
  clearHandExcept(duel, 0, sourceUid);
  const before = JSON.stringify(duel);
  const beforeInventory = inventory(duel);
  const graveBefore = duel.core.players[0].grave.length;
  const plan = prepareSwiftGaiaNormalSummon(duel, sourceUid);
  const result = resolveSwiftGaiaNormalSummon(duel, plan);
  assert.ok(result);
  assert.equal(result.summonedUid, sourceUid);
  assert.equal(result.tributesUsed, 0);
  assert.equal(result.normalSummonConsumed, true);
  assert.ok(result.state.core.players[0].monsters.some(card =>
    card.uid === sourceUid && card.id === SWIFT_GAIA_ID &&
    card.faceUp === true && card.position === 'atk'));
  assert.equal(result.state.core.players[0].summoned, true);
  assert.equal(result.state.core.players[0].grave.length, graveBefore);
  assert.equal(result.state.core.players[0].hand.length, 0);
  assert.deepEqual(inventory(result.state), beforeInventory);
  assert.equal(JSON.stringify(duel), before, 'resolution must not mutate the input snapshot');
});

test('plano fica obsoleto se outra carta entrar na mão antes da resolução', () => {
  const duel = makeDuel();
  const sourceUid = putSwiftGaiaInHand(duel, 0);
  clearHandExcept(duel, 0, sourceUid);
  const plan = prepareSwiftGaiaNormalSummon(duel, sourceUid);
  const card = privateZone(duel, 0, 'deck').pop();
  privateZone(duel, 0, 'hand').push(card);
  const before = JSON.stringify(duel);
  assert.equal(resolveSwiftGaiaNormalSummon(duel, plan), null);
  assert.equal(JSON.stringify(duel), before);
});

test('mão acima de seis não é descartada por este adapter; a condição de uma carta falha', () => {
  const duel = makeDuel();
  const sourceUid = putSwiftGaiaInHand(duel, 0);
  while (privateZone(duel, 0, 'hand').length < 7) {
    const card = privateZone(duel, 0, 'deck').pop();
    privateZone(duel, 0, 'hand').push(card);
  }
  const beforeHand = privateZone(duel, 0, 'hand').map(card => card.uid);
  assert.equal(prepareSwiftGaiaNormalSummon(duel, sourceUid), null);
  assert.deepEqual(privateZone(duel, 0, 'hand').map(card => card.uid), beforeHand);
});

test('não oferece carta fora da mão, com identidade errada ou sem zona disponível', () => {
  const duel = makeDuel();
  const sourceUid = putSwiftGaiaInHand(duel, 0);
  clearHandExcept(duel, 0, sourceUid);
  const card = privateZone(duel, 0, 'hand')[0];
  card.id = tagNormalCardIds[3];
  assert.equal(prepareSwiftGaiaNormalSummon(duel, sourceUid), null);
  card.id = SWIFT_GAIA_ID;
  for (let i = 0; i < 3; i++) moveDeckCardToMonster(duel, 0);
  assert.equal(prepareSwiftGaiaNormalSummon(duel, sourceUid), null);
});

test('resolução rejeita turno ou fase obsoletos', () => {
  const duel = makeDuel();
  const sourceUid = putSwiftGaiaInHand(duel, 0);
  clearHandExcept(duel, 0, sourceUid);
  const plan = prepareSwiftGaiaNormalSummon(duel, sourceUid);
  const staleTurn = structuredClone(duel);
  staleTurn.core.turn++;
  assert.equal(resolveSwiftGaiaNormalSummon(staleTurn, plan), null);
  const battle = structuredClone(duel);
  battle.core.phase = 'battle';
  assert.equal(resolveSwiftGaiaNormalSummon(battle, plan), null);
});

test('preserva limites 3+3, Main Deck 20–30 e Extra Deck 5', { skip: !FUSION_ID }, () => {
  const duel = makeDuel();
  const sourceUid = putSwiftGaiaInHand(duel, 0);
  clearHandExcept(duel, 0, sourceUid);
  duel.reserves[2].extra = duel.reserves[2].extra || [];
  for (let i = 0; i < 5; i++) duel.reserves[2].extra.push({ uid: 'm2:swift-extra-' + i, id: FUSION_ID });
  assert.ok(prepareSwiftGaiaNormalSummon(duel, sourceUid));
  duel.reserves[2].extra.push({ uid: 'm2:swift-extra-overflow', id: FUSION_ID });
  assert.throws(() => prepareSwiftGaiaNormalSummon(duel, sourceUid), /Deck Adicional excedeu cinco/);
});
