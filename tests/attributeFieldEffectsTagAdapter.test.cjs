const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  HOSHININGEN_ID,
  THUNDER_NYAN_NYAN_ID,
  createAttributeFieldEffectsTagAdapter,
} = require('../dist/attributeFieldEffectsTagAdapter.js');

const EFFECT_IDS = enabledCardIds.filter(id => {
  const card = getDuelCard(id);
  return card?.kind === 'monster' && card.monsterType === 'effect' && !card.fusion;
});
const TRAP_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'trap').slice(0, 2);
const SPELL_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'spell').slice(0, 2);
const FUSION_NAMES = new Set();
const FUSION_IDS = enabledCardIds.filter(id => {
  const card = getDuelCard(id);
  if (!card?.fusion) return false;
  const name = rulesCardName(card);
  if (FUSION_NAMES.has(name)) return false;
  FUSION_NAMES.add(name);
  return true;
});
const NORMAL_NAMES = new Set();
const NORMAL_IDS = tagNormalCardIds.filter(id => {
  const name = rulesCardName(getDuelCard(id));
  if (NORMAL_NAMES.has(name)) return false;
  NORMAL_NAMES.add(name);
  return true;
});
assert.ok(EFFECT_IDS.length >= 5, 'fixtures require five enabled effect monsters');
assert.ok(TRAP_IDS.length >= 1, 'fixtures require an enabled Trap');
assert.equal(SPELL_IDS.length, 2, 'fixtures require two enabled Spells');
assert.ok(NORMAL_IDS.length >= 27, 'fixtures require 27 distinct Normal Monster names');

const HOSHININGEN_FIXTURE_ID = EFFECT_IDS[0];
const THUNDER_NYAN_FIXTURE_ID = EFFECT_IDS[1];
const LIGHT_FIXTURE_ID = EFFECT_IDS[2];
const DARK_FIXTURE_ID = EFFECT_IDS[3];
const EARTH_FIXTURE_ID = EFFECT_IDS[4];
const attributes = new Map([
  [HOSHININGEN_FIXTURE_ID, 'LIGHT'],
  [THUNDER_NYAN_FIXTURE_ID, 'LIGHT'],
  [LIGHT_FIXTURE_ID, 'LIGHT'],
  [DARK_FIXTURE_ID, 'DARK'],
  [EARTH_FIXTURE_ID, 'EARTH'],
]);
const lookup = id => {
  const info = getDuelCard(id);
  return info ? { ...info, attribute: attributes.get(id) ?? info.attribute } : undefined;
};
const negated = new Set();
const adapter = createAttributeFieldEffectsTagAdapter({
  hoshiningenId: HOSHININGEN_FIXTURE_ID,
  thunderNyanNyanId: THUNDER_NYAN_FIXTURE_ID,
}, lookup, (_state, uid) => negated.has(uid));

const BASE_DECK = [
  ...NORMAL_IDS.slice(0, 12),
  HOSHININGEN_FIXTURE_ID,
  THUNDER_NYAN_FIXTURE_ID,
  LIGHT_FIXTURE_ID,
  DARK_FIXTURE_ID,
  EARTH_FIXTURE_ID,
  ...SPELL_IDS,
  TRAP_IDS[0],
];
const MAX_DECK = [
  ...NORMAL_IDS.slice(0, 25),
  HOSHININGEN_FIXTURE_ID,
  THUNDER_NYAN_FIXTURE_ID,
  LIGHT_FIXTURE_ID,
  DARK_FIXTURE_ID,
  EARTH_FIXTURE_ID,
];
assert.equal(BASE_DECK.length, 20);
assert.equal(MAX_DECK.length, 30);

function makeDuel(first = 2, deck = BASE_DECK, extraBySeat = {}) {
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...deck],
    extra: [...(extraBySeat[i] || [])],
  }));
  return createTagDuel(players, {
    seed: 'm611-attribute-field-effects',
    first,
    classic: true,
  });
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

function addMonster(duel, id, ownerSeat, controllerTeam, faceUp = true) {
  const card = takeFromSeat(duel, ownerSeat, ref => ref.id === id);
  duel.core.players[controllerTeam].monsters.push({
    ...card,
    owner: ownerSeat % 2,
    position: faceUp ? 'atk' : 'def',
    faceUp,
    entered: duel.core.turn,
    changed: duel.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  });
  synchronizeCardLifetimes(duel.core);
  return card.uid;
}

function inventory(duel) {
  return tagInventory(duel)
    .map(card => [card.uid, card.id])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function findMonster(duel, uid) {
  for (let team = 0; team < 2; team++) {
    const monster = duel.core.players[team].monsters.find(item => item.uid === uid);
    if (monster) return { team, monster };
  }
  return undefined;
}

function resetNegation() {
  negated.clear();
}

test('identidades oficiais e atributos básicos dos dois efeitos', () => {
  assert.equal(HOSHININGEN_ID, '67629977');
  assert.equal(THUNDER_NYAN_NYAN_ID, '14878871');
  assert.equal(adapter.hoshiningenId, HOSHININGEN_FIXTURE_ID);
  assert.equal(adapter.thunderNyanNyanId, THUNDER_NYAN_FIXTURE_ID);
});

test('Hoshiningen concede +500 ATK a LIGHT e -400 ATK a DARK nas duas equipes', () => {
  resetNegation();
  const duel = makeDuel();
  const source = addMonster(duel, HOSHININGEN_FIXTURE_ID, 0, 0);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 2, 0);
  const dark = addMonster(duel, DARK_FIXTURE_ID, 1, 1);
  const earth = addMonster(duel, EARTH_FIXTURE_ID, 3, 1);

  assert.deepEqual(adapter.getHoshiningenAtkModifier(duel, light), {
    targetUid: light, attribute: 'LIGHT', activeSources: 1, atk: 500,
  });
  assert.equal(adapter.getHoshiningenAtkModifier(duel, dark).atk, -400);
  assert.equal(adapter.getHoshiningenAtkModifier(duel, earth).atk, 0);
  assert.equal(adapter.getHoshiningenAtkModifier(duel, source).atk, 500);
});

test('a aura é global: Hoshiningen de uma equipe modifica monstros da equipe adversária', () => {
  resetNegation();
  const duel = makeDuel();
  addMonster(duel, HOSHININGEN_FIXTURE_ID, 2, 0);
  const dark = addMonster(duel, DARK_FIXTURE_ID, 1, 1);
  assert.equal(adapter.getHoshiningenAtkModifier(duel, dark).atk, -400);
});

test('fontes Hoshiningen múltiplas acumulam sem depender do controlador do alvo', () => {
  resetNegation();
  const deck = [
    ...NORMAL_IDS.slice(0, 11),
    HOSHININGEN_FIXTURE_ID, HOSHININGEN_FIXTURE_ID,
    THUNDER_NYAN_FIXTURE_ID, LIGHT_FIXTURE_ID, DARK_FIXTURE_ID, EARTH_FIXTURE_ID,
    ...SPELL_IDS, TRAP_IDS[0],
  ];
  assert.equal(deck.length, 20);
  const duel = makeDuel(2, deck);
  addMonster(duel, HOSHININGEN_FIXTURE_ID, 0, 0);
  addMonster(duel, HOSHININGEN_FIXTURE_ID, 2, 1);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 1, 1);
  const dark = addMonster(duel, DARK_FIXTURE_ID, 3, 0);
  assert.equal(adapter.getHoshiningenAtkModifier(duel, light).atk, 1000);
  assert.equal(adapter.getHoshiningenAtkModifier(duel, dark).atk, -800);
});

test('Hoshiningen face-down não é fonte e alvo face-down não recebe modificador', () => {
  resetNegation();
  const duel = makeDuel();
  addMonster(duel, HOSHININGEN_FIXTURE_ID, 0, 0, false);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 2, 0, false);
  assert.equal(adapter.getHoshiningenAtkModifier(duel, light).atk, 0);
  assert.equal(adapter.getHoshiningenAtkModifier(duel, light).activeSources, 0);
});

test('fontes Hoshiningen negadas não contribuem, mas outra fonte válida continua ativa', () => {
  resetNegation();
  const deck = [
    ...NORMAL_IDS.slice(0, 11),
    HOSHININGEN_FIXTURE_ID, HOSHININGEN_FIXTURE_ID,
    THUNDER_NYAN_FIXTURE_ID, LIGHT_FIXTURE_ID, DARK_FIXTURE_ID, EARTH_FIXTURE_ID,
    ...SPELL_IDS, TRAP_IDS[0],
  ];
  const duel = makeDuel(2, deck);
  const first = addMonster(duel, HOSHININGEN_FIXTURE_ID, 0, 0);
  addMonster(duel, HOSHININGEN_FIXTURE_ID, 2, 1);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 1, 1);
  negated.add(first);
  assert.equal(adapter.getHoshiningenAtkModifier(duel, light).atk, 500);
  assert.equal(adapter.getHoshiningenAtkModifier(duel, light).activeSources, 1);
});

test('Hoshiningen removido deixa de modificar o campo', () => {
  resetNegation();
  const duel = makeDuel();
  const source = addMonster(duel, HOSHININGEN_FIXTURE_ID, 0, 0);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 2, 0);
  const index = duel.core.players[0].monsters.findIndex(monster => monster.uid === source);
  const [removed] = duel.core.players[0].monsters.splice(index, 1);
  duel.core.players[0].grave.push({ uid: removed.uid, id: removed.id });
  synchronizeCardLifetimes(duel.core);
  assert.equal(adapter.getHoshiningenAtkModifier(duel, light).atk, 0);
});

test('Thunder Nyan Nyan é destruído por monstro não-LIGHT face-up da própria equipe', () => {
  resetNegation();
  const duel = makeDuel();
  const source = addMonster(duel, THUNDER_NYAN_FIXTURE_ID, 0, 0);
  const conflict = addMonster(duel, DARK_FIXTURE_ID, 2, 0);
  const before = inventory(duel);
  const result = adapter.resolveThunderNyanNyan(duel, source);
  assert.equal(result.status, 'destroyed');
  assert.deepEqual(result.conflictingUids, [conflict]);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === source));
  assert.ok(!findMonster(result.state, source));
  assert.deepEqual(inventory(result.state), before);
});

test('o monstro não-LIGHT do parceiro também satisfaz a condição compartilhada', () => {
  resetNegation();
  const duel = makeDuel();
  const source = addMonster(duel, THUNDER_NYAN_FIXTURE_ID, 0, 0);
  const conflict = addMonster(duel, EARTH_FIXTURE_ID, 3, 0);
  const result = adapter.resolveThunderNyanNyan(duel, source);
  assert.equal(result.status, 'destroyed');
  assert.deepEqual(result.conflictingUids, [conflict]);
});

test('monstro não-LIGHT apenas da equipe adversária não destrói Thunder Nyan Nyan', () => {
  resetNegation();
  const duel = makeDuel();
  const source = addMonster(duel, THUNDER_NYAN_FIXTURE_ID, 0, 0);
  addMonster(duel, DARK_FIXTURE_ID, 1, 1);
  assert.equal(adapter.resolveThunderNyanNyan(duel, source).status, 'condition-not-met');
  assert.ok(findMonster(duel, source));
});

test('monstro face-down não revela atributo nem satisfaz a condição', () => {
  resetNegation();
  const duel = makeDuel();
  const source = addMonster(duel, THUNDER_NYAN_FIXTURE_ID, 0, 0);
  addMonster(duel, DARK_FIXTURE_ID, 2, 0, false);
  assert.equal(adapter.resolveThunderNyanNyan(duel, source).status, 'condition-not-met');
});

test('Thunder Nyan Nyan face-down não é destruído pela própria condição', () => {
  resetNegation();
  const duel = makeDuel();
  const source = addMonster(duel, THUNDER_NYAN_FIXTURE_ID, 0, 0, false);
  addMonster(duel, DARK_FIXTURE_ID, 2, 0);
  assert.equal(adapter.resolveThunderNyanNyan(duel, source).status, 'face-down');
  assert.ok(findMonster(duel, source));
});

test('efeito negado de Thunder Nyan Nyan não executa a autodestruição', () => {
  resetNegation();
  const duel = makeDuel();
  const source = addMonster(duel, THUNDER_NYAN_FIXTURE_ID, 0, 0);
  addMonster(duel, DARK_FIXTURE_ID, 2, 0);
  negated.add(source);
  assert.equal(adapter.resolveThunderNyanNyan(duel, source).status, 'negated');
  assert.ok(findMonster(duel, source));
});

test('controle roubado não muda o Cemitério do proprietário físico', () => {
  resetNegation();
  const duel = makeDuel();
  const source = addMonster(duel, THUNDER_NYAN_FIXTURE_ID, 0, 1);
  addMonster(duel, DARK_FIXTURE_ID, 1, 1);
  const before = inventory(duel);
  const result = adapter.resolveThunderNyanNyan(duel, source);
  assert.equal(result.status, 'destroyed');
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === source));
  assert.ok(!result.state.core.players[1].grave.some(card => card.uid === source));
  assert.deepEqual(inventory(result.state), before);
});

test('resolução repetida após destruição não duplica a carta nem seu UID', () => {
  resetNegation();
  const duel = makeDuel();
  const source = addMonster(duel, THUNDER_NYAN_FIXTURE_ID, 0, 0);
  addMonster(duel, DARK_FIXTURE_ID, 2, 0);
  const first = adapter.resolveThunderNyanNyan(duel, source);
  const replay = adapter.resolveThunderNyanNyan(first.state, source);
  assert.equal(first.status, 'destroyed');
  assert.equal(replay.status, 'source-left-field');
  assert.deepEqual(inventory(replay.state), inventory(first.state));
  assert.equal(replay.state.core.players[0].grave.filter(card => card.uid === source).length, 1);
});

test('Deck 20/30, Extra Deck 5 e limites de zonas 3+3 permanecem preservados', () => {
  resetNegation();
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK));
  assert.doesNotThrow(() => makeDuel(2, MAX_DECK));
  assert.throws(() => makeDuel(2, BASE_DECK.slice(1)));
  assert.throws(() => makeDuel(2, [...MAX_DECK, NORMAL_IDS[26]]));
  assert.ok(FUSION_IDS.length >= 5);
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 5) }));
  assert.throws(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 6) }));

  const monsters = makeDuel();
  addMonster(monsters, HOSHININGEN_FIXTURE_ID, 0, 0);
  addMonster(monsters, LIGHT_FIXTURE_ID, 0, 0);
  addMonster(monsters, DARK_FIXTURE_ID, 0, 0);
  assert.doesNotThrow(() => adapter.getHoshiningenAtkModifier(monsters,
    monsters.core.players[0].monsters[1].uid));
  addMonster(monsters, EARTH_FIXTURE_ID, 0, 0);
  assert.throws(() => adapter.getHoshiningenAtkModifier(monsters,
    monsters.core.players[0].monsters[1].uid));

  const backrow = makeDuel();
  const backrowIds = [...SPELL_IDS, TRAP_IDS[0]];
  for (let i = 0; i < 3; i++) {
    const card = takeFromSeat(backrow, 0, ref => ref.id === backrowIds[i]);
    backrow.core.players[0].backrow.push({ ...card, setTurn: 0, faceUp: false });
  }
  assert.doesNotThrow(() => adapter.getHoshiningenAtkModifier(backrow, 'm0:not-on-field'));
  const fourth = takeFromSeat(backrow, 1, ref => ref.id === backrowIds[0]);
  backrow.core.players[0].backrow.push({ ...fourth, setTurn: 0, faceUp: false });
  assert.throws(() => adapter.getHoshiningenAtkModifier(backrow, 'm0:not-on-field'));
});

test('IDs inválidos e atributos desconhecidos não são aceitos silenciosamente', () => {
  resetNegation();
  assert.throws(() => createAttributeFieldEffectsTagAdapter({
    hoshiningenId: '', thunderNyanNyanId: THUNDER_NYAN_FIXTURE_ID,
  }, lookup));
  const duel = makeDuel();
  const source = addMonster(duel, HOSHININGEN_FIXTURE_ID, 0, 0);
  const unknownLookup = id => {
    const info = lookup(id);
    return id === HOSHININGEN_FIXTURE_ID ? { ...info, attribute: null } : info;
  };
  const unknown = createAttributeFieldEffectsTagAdapter({
    hoshiningenId: HOSHININGEN_FIXTURE_ID,
    thunderNyanNyanId: THUNDER_NYAN_FIXTURE_ID,
  }, unknownLookup);
  assert.throws(() => unknown.getHoshiningenAtkModifier(duel, source));
});
