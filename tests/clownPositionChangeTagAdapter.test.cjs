const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  DREAM_CLOWN_ID,
  CRASS_CLOWN_ID,
  createClownPositionChangeAdapter,
} = require('../dist/clownPositionChangeTagAdapter.js');

const normalNames = new Set();
const NORMAL_IDS = tagNormalCardIds.filter(id => {
  const name = rulesCardName(getDuelCard(id));
  if (normalNames.has(name)) return false;
  normalNames.add(name);
  return true;
});
const EFFECT_IDS = enabledCardIds.filter(id => {
  const card = getDuelCard(id);
  return card?.kind === 'monster' && card.monsterType === 'effect' && !card.fusion;
});
const DREAM_FIXTURE_ID = EFFECT_IDS[0];
const CRASS_FIXTURE_ID = EFFECT_IDS.find(id => id !== DREAM_FIXTURE_ID);
const SPELL_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'spell').slice(0, 2);
const TRAP_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'trap').slice(0, 2);
const fusionNames = new Set();
const FUSION_IDS = enabledCardIds.filter(id => {
  const card = getDuelCard(id);
  if (!card?.fusion) return false;
  const name = rulesCardName(card);
  if (fusionNames.has(name)) return false;
  fusionNames.add(name);
  return true;
});
const BASE_DECK = [
  ...NORMAL_IDS.slice(0, 14),
  DREAM_FIXTURE_ID,
  CRASS_FIXTURE_ID,
  ...SPELL_IDS,
  ...TRAP_IDS,
];
const MAX_DECK = [
  ...NORMAL_IDS.slice(0, 26),
  DREAM_FIXTURE_ID,
  CRASS_FIXTURE_ID,
  SPELL_IDS[0],
  TRAP_IDS[0],
];
assert.ok(DREAM_FIXTURE_ID && CRASS_FIXTURE_ID, 'fixtures require two enabled effect monsters');
assert.ok(NORMAL_IDS.length >= 26, 'fixtures require 26 distinct normal-monster names');
assert.equal(SPELL_IDS.length, 2, 'fixtures require two Spells');
assert.equal(TRAP_IDS.length, 2, 'fixtures require two Traps');
assert.equal(BASE_DECK.length, 20);
assert.equal(MAX_DECK.length, 30);

const adapter = createClownPositionChangeAdapter(DREAM_FIXTURE_ID, CRASS_FIXTURE_ID);

function makeDuel(first = 0, deck = BASE_DECK, extraBySeat = {}) {
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...deck],
    extra: [...(extraBySeat[i] || [])],
  }));
  return createTagDuel(players, { seed: 'm605-clowns', first, classic: true });
}

function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat
    ? duel.core.players[team][zone]
    : duel.reserves[seat][zone];
}

function takeFromSeat(duel, seat, predicate, zones = ['hand', 'deck']) {
  for (const zoneName of zones) {
    const zone = privateZone(duel, seat, zoneName);
    const index = zone.findIndex(predicate);
    if (index >= 0) return zone.splice(index, 1)[0];
  }
  throw new Error('physical fixture card not found');
}

function addSource(duel, cardId, ownerSeat, controllerTeam, position, faceUp = true) {
  const card = takeFromSeat(duel, ownerSeat, ref => ref.id === cardId);
  duel.core.players[controllerTeam].monsters.push({
    ...card,
    owner: ownerSeat % 2,
    position,
    faceUp,
    entered: duel.core.turn,
    changed: duel.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  });
  return card.uid;
}

function addTarget(duel, ownerSeat, controllerTeam, options = {}) {
  const { id, position = 'def', faceUp = false, fromExtra = false } = options;
  const card = takeFromSeat(
    duel,
    ownerSeat,
    ref => id ? ref.id === id : (getDuelCard(ref.id)?.kind === 'monster' && !getDuelCard(ref.id)?.fusion),
    fromExtra ? ['extra'] : ['hand', 'deck'],
  );
  duel.core.players[controllerTeam].monsters.push({
    ...card,
    owner: ownerSeat % 2,
    position,
    faceUp,
    entered: duel.core.turn,
    changed: duel.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  });
  return card.uid;
}

function moveSourceToOwnerGrave(duel, sourceUid, ownerSeat, controllerTeam) {
  const player = duel.core.players[controllerTeam];
  const index = player.monsters.findIndex(monster => monster.uid === sourceUid);
  assert.ok(index >= 0);
  const [monster] = player.monsters.splice(index, 1);
  duel.core.players[ownerSeat % 2].grave.push({ uid: monster.uid, id: monster.id });
  synchronizeCardLifetimes(duel.core);
}

function eventFor(duel, sourceUid, sourceId, controllerTeam, patch = {}) {
  return {
    kind: 'position-changed',
    activationId: 'm605:' + duel.core.turn + ':' + sourceUid,
    sourceUid,
    sourceId,
    turn: duel.core.turn,
    controllerTeam,
    previousPosition: sourceId === DREAM_FIXTURE_ID ? 'atk' : 'def',
    previousFaceUp: sourceId === DREAM_FIXTURE_ID,
    newPosition: sourceId === DREAM_FIXTURE_ID ? 'def' : 'atk',
    newFaceUp: true,
    cause: 'effect',
    sourceLeftFieldAfterChange: false,
    ...patch,
  };
}

function inventory(duel) {
  return tagInventory(duel)
    .filter(card => card.entityKind !== 'token')
    .map(card => [card.uid, card.id])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function addMonsterFromSeat(duel, seat, team) {
  const card = takeFromSeat(duel, seat, ref => getDuelCard(ref.id)?.kind === 'monster' && !getDuelCard(ref.id)?.fusion);
  duel.core.players[team].monsters.push({
    ...card,
    owner: seat % 2,
    position: 'atk',
    faceUp: true,
    entered: duel.core.turn,
    changed: duel.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  });
}

function addBackrowFromSeat(duel, seat, team) {
  const card = takeFromSeat(duel, seat, ref => {
    const kind = getDuelCard(ref.id)?.kind;
    return kind === 'spell' || kind === 'trap';
  });
  duel.core.players[team].backrow.push({ ...card, setTurn: 0, faceUp: false });
}

test('Dream Clown destrói alvo face-down e respeita o dono físico mesmo sob controle roubado', () => {
  const duel = makeDuel(0);
  duel.core.phase = 'response';
  duel.core.resume = 'main';
  const sourceUid = addSource(duel, DREAM_FIXTURE_ID, 2, 1, 'def', true);
  const targetUid = addTarget(duel, 0, 0, { position: 'def', faceUp: false });
  const event = eventFor(duel, sourceUid, DREAM_FIXTURE_ID, 1);

  assert.deepEqual(adapter.listTargets(duel, event), [targetUid]);
  const plan = adapter.plan(duel, event, targetUid);
  assert.equal(plan.effect, 'dream-clown-destroy');
  assert.equal(plan.sourceOwnerSeat, 2);
  assert.equal(plan.controllerTeam, 1);

  const before = inventory(duel);
  const result = adapter.resolve(duel, plan);
  assert.equal(result.status, 'destroyed');
  assert.equal(result.destination, 'grave');
  assert.ok(duel.core.players[0].monsters.some(monster => monster.uid === targetUid));
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === targetUid));
  assert.ok(!result.state.core.players[0].monsters.some(monster => monster.uid === targetUid));
  assert.deepEqual(inventory(result.state), before);
});

test('Crass Clown devolve ao dono físico inativo e deixa descarte da mão para a End Phase', () => {
  const duel = makeDuel(0);
  duel.core.phase = 'response';
  duel.core.resume = 'main';
  const sourceUid = addSource(duel, CRASS_FIXTURE_ID, 1, 0, 'atk', true);
  const targetUid = addTarget(duel, 3, 1, { position: 'def', faceUp: false });
  const event = eventFor(duel, sourceUid, CRASS_FIXTURE_ID, 0, {
    previousPosition: 'def',
    previousFaceUp: false,
    newPosition: 'atk',
    cause: 'flip-summon',
  });
  const plan = adapter.plan(duel, event, targetUid);
  const hand = privateZone(duel, 3, 'hand');
  const deck = privateZone(duel, 3, 'deck');
  while (hand.length < 6) hand.push(deck.shift());
  const before = inventory(duel);

  const result = adapter.resolve(duel, plan);
  assert.equal(result.status, 'returned-to-hand');
  assert.equal(result.destination, 'hand');
  assert.equal(result.handLimitDeferred, true);
  assert.equal(privateZone(result.state, 3, 'hand').length, 7);
  assert.ok(!result.state.core.players[1].monsters.some(monster => monster.uid === targetUid));
  assert.deepEqual(inventory(result.state), before);
});

test('Crass Clown devolve Fusion ao Extra Deck físico, não à mão', () => {
  assert.ok(FUSION_IDS.length > 0, 'fixture requires at least one enabled Fusion');
  const duel = makeDuel(0, BASE_DECK, { 3: [FUSION_IDS[0]] });
  duel.core.phase = 'response';
  duel.core.resume = 'main';
  const sourceUid = addSource(duel, CRASS_FIXTURE_ID, 0, 0, 'atk', true);
  const targetUid = addTarget(duel, 3, 1, {
    id: FUSION_IDS[0],
    position: 'def',
    faceUp: false,
    fromExtra: true,
  });
  const event = eventFor(duel, sourceUid, CRASS_FIXTURE_ID, 0, {
    previousPosition: 'def',
    previousFaceUp: true,
    newPosition: 'atk',
  });
  const plan = adapter.plan(duel, event, targetUid);
  const result = adapter.resolve(duel, plan);

  assert.equal(result.status, 'returned-to-extra');
  assert.equal(result.destination, 'extra');
  assert.ok(privateZone(result.state, 3, 'extra').some(card => card.uid === targetUid));
  assert.ok(!privateZone(result.state, 3, 'hand').some(card => card.uid === targetUid));
});

test('gatilho continua válido se a fonte sair do campo após a mudança de posição', () => {
  const duel = makeDuel(0);
  duel.core.phase = 'response';
  duel.core.resume = 'main';
  const sourceUid = addSource(duel, DREAM_FIXTURE_ID, 2, 1, 'def', true);
  moveSourceToOwnerGrave(duel, sourceUid, 2, 1);
  const targetUid = addTarget(duel, 0, 0, { position: 'atk', faceUp: true });
  const event = eventFor(duel, sourceUid, DREAM_FIXTURE_ID, 1, {
    sourceLeftFieldAfterChange: true,
  });
  const plan = adapter.plan(duel, event, targetUid);
  assert.equal(plan.sourceOwnerSeat, 2);
  assert.equal(adapter.resolve(duel, plan).status, 'destroyed');
});

test('não ativa sem alvo, nem com transição, fonte, controlador ou turno incompatíveis', () => {
  const noTarget = makeDuel(0);
  noTarget.core.phase = 'response';
  noTarget.core.resume = 'main';
  const sourceUid = addSource(noTarget, DREAM_FIXTURE_ID, 0, 0, 'def', true);
  const valid = eventFor(noTarget, sourceUid, DREAM_FIXTURE_ID, 0);
  assert.deepEqual(adapter.listTargets(noTarget, valid), []);
  assert.equal(adapter.plan(noTarget, valid, 'missing-target'), null);

  const duel = makeDuel(0);
  duel.core.phase = 'response';
  duel.core.resume = 'main';
  const source = addSource(duel, DREAM_FIXTURE_ID, 0, 0, 'def', true);
  const target = addTarget(duel, 1, 1);
  const event = eventFor(duel, source, DREAM_FIXTURE_ID, 0);
  for (const patch of [
    { previousPosition: 'def' },
    { previousFaceUp: false },
    { newFaceUp: false },
    { controllerTeam: 1 },
    { turn: duel.core.turn + 1 },
    { sourceLeftFieldAfterChange: true },
  ]) {
    assert.throws(() => adapter.plan(duel, { ...event, ...patch }, target));
  }
});

test('alvo que deixa o campo antes da resolução não é substituído por outro', () => {
  const duel = makeDuel(0);
  duel.core.phase = 'response';
  duel.core.resume = 'main';
  const sourceUid = addSource(duel, CRASS_FIXTURE_ID, 0, 0, 'atk', true);
  const targetUid = addTarget(duel, 1, 1);
  const event = eventFor(duel, sourceUid, CRASS_FIXTURE_ID, 0, {
    previousPosition: 'def',
    previousFaceUp: true,
    newPosition: 'atk',
  });
  const plan = adapter.plan(duel, event, targetUid);
  const [target] = duel.core.players[1].monsters.splice(
    duel.core.players[1].monsters.findIndex(monster => monster.uid === targetUid), 1
  );
  duel.core.players[1].grave.push({ uid: target.uid, id: target.id });
  synchronizeCardLifetimes(duel.core);

  const result = adapter.resolve(duel, plan);
  assert.equal(result.status, 'target-left-field');
  assert.deepEqual(inventory(result.state), inventory(duel));
});

test('alvo que muda para a equipe do controlador deixa de ser um alvo adversário', () => {
  const duel = makeDuel(0);
  duel.core.phase = 'response';
  duel.core.resume = 'main';
  const sourceUid = addSource(duel, DREAM_FIXTURE_ID, 0, 0, 'def', true);
  const targetUid = addTarget(duel, 1, 1);
  const event = eventFor(duel, sourceUid, DREAM_FIXTURE_ID, 0);
  const plan = adapter.plan(duel, event, targetUid);
  const [target] = duel.core.players[1].monsters.splice(
    duel.core.players[1].monsters.findIndex(monster => monster.uid === targetUid), 1
  );
  duel.core.players[0].monsters.push(target);
  synchronizeCardLifetimes(duel.core);

  assert.equal(adapter.resolve(duel, plan).status, 'target-no-longer-opponent');
});

test('negação e repetição não movem nem concedem cartas', () => {
  const duel = makeDuel(0);
  duel.core.phase = 'response';
  duel.core.resume = 'main';
  const sourceUid = addSource(duel, CRASS_FIXTURE_ID, 0, 0, 'atk', true);
  const targetUid = addTarget(duel, 1, 1);
  const event = eventFor(duel, sourceUid, CRASS_FIXTURE_ID, 0, {
    previousPosition: 'def',
    previousFaceUp: true,
    newPosition: 'atk',
  });
  const plan = adapter.plan(duel, event, targetUid);
  const before = inventory(duel);
  const negated = adapter.resolve(duel, plan, true);
  assert.equal(negated.status, 'negated');
  assert.deepEqual(inventory(negated.state), before);
  const duplicate = adapter.resolve(negated.state, plan, false);
  assert.equal(duplicate.status, 'duplicate');
  assert.deepEqual(inventory(duplicate.state), before);
});

test('respeita 3+3 zonas, Main Deck 20–30 e Extra Deck máximo 5', { skip: FUSION_IDS.length < 6 }, () => {
  const duel = makeDuel(0);
  duel.core.phase = 'response';
  duel.core.resume = 'main';
  const sourceUid = addSource(duel, DREAM_FIXTURE_ID, 0, 0, 'def', true);
  const targetUid = addTarget(duel, 1, 1);
  for (let i = 0; i < 2; i++) addMonsterFromSeat(duel, i % 2, i % 2);
  for (let i = 0; i < 2; i++) addMonsterFromSeat(duel, (i % 2) + 2, i % 2);
  for (let i = 0; i < 3; i++) addBackrowFromSeat(duel, 0, 0);
  for (let i = 0; i < 3; i++) addBackrowFromSeat(duel, 1, 1);
  const event = eventFor(duel, sourceUid, DREAM_FIXTURE_ID, 0);
  assert.ok(adapter.plan(duel, event, targetUid));

  const overflow = structuredClone(duel);
  addMonsterFromSeat(overflow, 0, 0);
  assert.throws(() => adapter.plan(overflow, eventFor(overflow, sourceUid, DREAM_FIXTURE_ID, 0), targetUid));

  const shortDeck = makeDuel(0);
  shortDeck.core.phase = 'response';
  shortDeck.core.resume = 'main';
  const shortSource = addSource(shortDeck, DREAM_FIXTURE_ID, 0, 0, 'def', true);
  const shortTarget = addTarget(shortDeck, 1, 1);
  privateZone(shortDeck, 3, 'deck').pop();
  assert.throws(() => adapter.plan(shortDeck, eventFor(shortDeck, shortSource, DREAM_FIXTURE_ID, 0), shortTarget));

  const extraFive = makeDuel(0, BASE_DECK, { 3: FUSION_IDS.slice(0, 5) });
  extraFive.core.phase = 'response';
  extraFive.core.resume = 'main';
  const extraSource = addSource(extraFive, DREAM_FIXTURE_ID, 0, 0, 'def', true);
  const extraTarget = addTarget(extraFive, 1, 1);
  const extraEvent = eventFor(extraFive, extraSource, DREAM_FIXTURE_ID, 0);
  assert.ok(adapter.plan(extraFive, extraEvent, extraTarget));
  extraFive.reserves[3].extra.push({ uid: 'm3:m605-extra-overflow', id: FUSION_IDS[5] });
  assert.throws(() => adapter.plan(extraFive, extraEvent, extraTarget));

  const maxDeck = makeDuel(0, MAX_DECK);
  maxDeck.core.phase = 'response';
  maxDeck.core.resume = 'main';
  const maxSource = addSource(maxDeck, DREAM_FIXTURE_ID, 0, 0, 'def', true);
  const maxTarget = addTarget(maxDeck, 1, 1);
  assert.ok(adapter.plan(maxDeck, eventFor(maxDeck, maxSource, DREAM_FIXTURE_ID, 0), maxTarget));
});

test('adapter de produção permanece preso aos passcodes oficiais', () => {
  assert.equal(DREAM_CLOWN_ID, '13215230');
  assert.equal(CRASS_CLOWN_ID, '93889755');
});
