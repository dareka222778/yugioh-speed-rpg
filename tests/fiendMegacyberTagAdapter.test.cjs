const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const FUSION_ID = enabledCardIds.find(id => getDuelCard(id)?.fusion);
const SPELL_TRAP_ID = enabledCardIds.find(id => ['spell', 'trap'].includes(getDuelCard(id)?.kind));
const {
  FIEND_MEGACYBER_ID,
  prepareFiendMegacyber,
  resolveFiendMegacyber,
} = require('../dist/fiendMegacyberTagAdapter.js');

const BASE_DECK = tagNormalCardIds.slice(0, 20);
assert.equal(BASE_DECK.length, 20, 'fixture requires a 20-card Main Deck per physical seat');

function makeDuel(first = 0) {
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...BASE_DECK],
  }));
  return createTagDuel(players, { seed: 'm602-fiend-megacyber', first, classic: true });
}

function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team][zone] : duel.reserves[seat][zone];
}

function putFiendMegacyberInHand(duel, seat) {
  const card = privateZone(duel, seat, 'deck').pop();
  assert.ok(card, 'physical Deck must contain the source card');
  card.id = FIEND_MEGACYBER_ID;
  privateZone(duel, seat, 'hand').push(card);
  return card.uid;
}

function moveDeckCardToMonster(duel, seat, faceUp = true) {
  const card = privateZone(duel, seat, 'deck').pop();
  assert.ok(card, 'physical Deck must contain a monster fixture');
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

test('The Fiend Megacyber exige dois monstros a mais no time adversário', () => {
  const duel = makeDuel();
  const sourceUid = putFiendMegacyberInHand(duel, 0);
  moveDeckCardToMonster(duel, 1);
  assert.equal(prepareFiendMegacyber(duel, sourceUid), null);
  moveDeckCardToMonster(duel, 3);
  const plan = prepareFiendMegacyber(duel, sourceUid);
  assert.ok(plan);
  assert.equal(plan.ownMonsterCount, 0);
  assert.equal(plan.opponentMonsterCount, 2);
});

test('monstros com a face para baixo também contam para a diferença de campo', () => {
  const duel = makeDuel();
  const sourceUid = putFiendMegacyberInHand(duel, 0);
  moveDeckCardToMonster(duel, 1, false);
  moveDeckCardToMonster(duel, 3, false);
  assert.ok(prepareFiendMegacyber(duel, sourceUid));
});

test('a contagem inclui os monstros da equipe inteira, não só o assento ativo', () => {
  const duel = makeDuel();
  const sourceUid = putFiendMegacyberInHand(duel, 0);
  moveDeckCardToMonster(duel, 0, false);
  moveDeckCardToMonster(duel, 1);
  moveDeckCardToMonster(duel, 3);
  moveDeckCardToMonster(duel, 1);
  assert.ok(prepareFiendMegacyber(duel, sourceUid));
});

test('o procedimento só pode ser oferecido no Main Phase', () => {
  const duel = makeDuel();
  const sourceUid = putFiendMegacyberInHand(duel, 0);
  moveDeckCardToMonster(duel, 1);
  moveDeckCardToMonster(duel, 3);
  duel.core.phase = 'battle';
  assert.equal(prepareFiendMegacyber(duel, sourceUid), null);
});

test('somente o proprietário físico ativo pode usar a própria mão privada', () => {
  const duel = makeDuel(2);
  const inactiveUid = putFiendMegacyberInHand(duel, 0);
  moveDeckCardToMonster(duel, 1);
  moveDeckCardToMonster(duel, 3);
  assert.equal(prepareFiendMegacyber(duel, inactiveUid), null);
  const activeUid = putFiendMegacyberInHand(duel, 2);
  assert.ok(prepareFiendMegacyber(duel, activeUid));
});

test('a resolução move exatamente a carta física da mão privada para a zona compartilhada', () => {
  const duel = makeDuel();
  const sourceUid = putFiendMegacyberInHand(duel, 0);
  moveDeckCardToMonster(duel, 1);
  moveDeckCardToMonster(duel, 3);
  const before = JSON.stringify(duel);
  const beforeInventory = inventory(duel);
  const plan = prepareFiendMegacyber(duel, sourceUid);
  const result = resolveFiendMegacyber(duel, plan);
  assert.ok(result);
  assert.equal(result.summonedUid, sourceUid);
  assert.ok(result.state.core.players[0].monsters.some(card =>
    card.uid === sourceUid && card.id === FIEND_MEGACYBER_ID &&
    card.faceUp === true && card.position === 'atk'));
  assert.ok(!result.state.core.players[0].hand.some(card => card.uid === sourceUid));
  assert.deepEqual(inventory(result.state), beforeInventory);
  assert.equal(JSON.stringify(duel), before, 'resolution must not mutate the input snapshot');
  assert.equal(result.state.core.players[0].summoned, false, 'Special Summon does not consume the Normal Summon');
});

test('o Special Summon não descarta a mão antecipadamente; o limite 6 continua sendo de End Phase', () => {
  const duel = makeDuel();
  const sourceUid = putFiendMegacyberInHand(duel, 0);
  while (privateZone(duel, 0, 'hand').length < 7) {
    const card = privateZone(duel, 0, 'deck').pop();
    assert.ok(card);
    privateZone(duel, 0, 'hand').push(card);
  }
  moveDeckCardToMonster(duel, 1);
  moveDeckCardToMonster(duel, 3);
  const beforeHandUids = privateZone(duel, 0, 'hand').filter(card => card.uid !== sourceUid).map(card => card.uid);
  const plan = prepareFiendMegacyber(duel, sourceUid);
  const result = resolveFiendMegacyber(duel, plan);
  assert.ok(result);
  assert.equal(privateZone(result.state, 0, 'hand').length, 6);
  assert.deepEqual(privateZone(result.state, 0, 'hand').map(card => card.uid), beforeHandUids);
});

test('plano fica obsoleto se o campo mudar antes da resolução', () => {
  const duel = makeDuel();
  const sourceUid = putFiendMegacyberInHand(duel, 0);
  moveDeckCardToMonster(duel, 1);
  moveDeckCardToMonster(duel, 3);
  const plan = prepareFiendMegacyber(duel, sourceUid);
  const [removed] = duel.core.players[1].monsters.splice(0, 1);
  duel.core.players[1].grave.push(removed);
  const before = JSON.stringify(duel);
  assert.equal(resolveFiendMegacyber(duel, plan), null);
  assert.equal(JSON.stringify(duel), before);
});

test('plano não sobrevive à troca de turno ou à saída do Main Phase', () => {
  const duel = makeDuel();
  const sourceUid = putFiendMegacyberInHand(duel, 0);
  moveDeckCardToMonster(duel, 1);
  moveDeckCardToMonster(duel, 3);
  const plan = prepareFiendMegacyber(duel, sourceUid);
  const nextTurn = structuredClone(duel);
  nextTurn.core.turn++;
  assert.equal(resolveFiendMegacyber(nextTurn, plan), null);
  const battle = structuredClone(duel);
  battle.core.phase = 'battle';
  assert.equal(resolveFiendMegacyber(battle, plan), null);
});

test('não oferece carta fora da mão privada nem identidade diferente', () => {
  const duel = makeDuel();
  const sourceUid = putFiendMegacyberInHand(duel, 0);
  moveDeckCardToMonster(duel, 1);
  moveDeckCardToMonster(duel, 3);
  const handCard = privateZone(duel, 0, 'hand').find(card => card.uid === sourceUid);
  handCard.id = tagNormalCardIds[5];
  assert.equal(prepareFiendMegacyber(duel, sourceUid), null);
  handCard.id = FIEND_MEGACYBER_ID;
  privateZone(duel, 0, 'hand').splice(privateZone(duel, 0, 'hand').indexOf(handCard), 1);
  privateZone(duel, 0, 'deck').push(handCard);
  assert.equal(prepareFiendMegacyber(duel, sourceUid), null);
});

test('não permite ultrapassar as três Monster Zones ou Spell/Trap Zones', () => {
  const duel = makeDuel();
  const sourceUid = putFiendMegacyberInHand(duel, 0);
  for (let i = 0; i < 4; i++) moveDeckCardToMonster(duel, 1);
  assert.throws(() => prepareFiendMegacyber(duel, sourceUid), /três Monster Zones/);
  const other = makeDuel();
  const otherUid = putFiendMegacyberInHand(other, 0);
  for (let i = 0; i < 4; i++) {
    const card = privateZone(other, 0, 'deck').pop();
    assert.ok(card);
    card.id = SPELL_TRAP_ID;
    other.core.players[0].backrow.push({ ...card, setTurn: 0, faceUp: false });
  }
  assert.throws(() => prepareFiendMegacyber(other, otherUid), /três Spell\/Trap Zones/);
});

test('não permite Main Deck físico abaixo de 20 cartas', () => {
  const duel = makeDuel();
  const sourceUid = putFiendMegacyberInHand(duel, 0);
  privateZone(duel, 0, 'deck').pop();
  assert.throws(() => prepareFiendMegacyber(duel, sourceUid), /Deck Principal físico fora de 20–30/);
});

test('Deck Principal aceita até 30 cartas físicas e rejeita 31', () => {
  const duel = makeDuel();
  const sourceUid = putFiendMegacyberInHand(duel, 0);
  for (let i = 0; i < 10; i++) {
    duel.core.players[0].deck.push({ uid: 'm0:extra-main-' + i, id: tagNormalCardIds[i] });
  }
  moveDeckCardToMonster(duel, 1);
  moveDeckCardToMonster(duel, 3);
  assert.ok(prepareFiendMegacyber(duel, sourceUid));
  duel.core.players[0].deck.push({ uid: 'm0:extra-main-overflow', id: tagNormalCardIds[10] });
  assert.throws(() => prepareFiendMegacyber(duel, sourceUid), /Deck Principal físico fora de 20–30/);
});

test('Deck Adicional aceita cinco cartas e rejeita a sexta', { skip: !FUSION_ID }, () => {
  const duel = makeDuel();
  const sourceUid = putFiendMegacyberInHand(duel, 0);
  duel.reserves[2].extra = duel.reserves[2].extra || [];
  for (let i = 0; i < 5; i++) {
    duel.reserves[2].extra.push({ uid: 'm2:extra-fiend-' + i, id: FUSION_ID });
  }
  assert.doesNotThrow(() => prepareFiendMegacyber(duel, sourceUid));
  duel.reserves[2].extra.push({ uid: 'm2:extra-fiend-overflow', id: FUSION_ID });
  assert.throws(() => prepareFiendMegacyber(duel, sourceUid), /Deck Adicional excedeu cinco/);
});
