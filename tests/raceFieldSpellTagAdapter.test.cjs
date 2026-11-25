const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  RACE_FIELD_SPELL_IDS,
  createRaceFieldSpellTagAdapter,
} = require('../dist/raceFieldSpellTagAdapter.js');

const EFFECT_IDS = enabledCardIds.filter(id => {
  const card = getDuelCard(id);
  return card?.kind === 'monster' && card.monsterType === 'effect' && !card.fusion;
});
const TRAP_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'trap').slice(0, 1);
const SPELL_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'spell').slice(0, 3);
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
assert.equal(SPELL_IDS.length, 3, 'fixtures require three enabled Spells');
assert.ok(NORMAL_IDS.length >= 27, 'fixtures require 27 distinct Normal Monster names');

const [FIEND_ID, SPELLCASTER_ID, FAIRY_ID, INSECT_ID, BEAST_ID,
  PLANT_ID, BEAST_WARRIOR_ID, DINOSAUR_ID, ZOMBIE_ID, ROCK_ID] = NORMAL_IDS;
const [YAMI_FIXTURE_ID, FOREST_FIXTURE_ID, WASTELAND_FIXTURE_ID] = SPELL_IDS;
const races = new Map([
  [FIEND_ID, 'Fiend'],
  [SPELLCASTER_ID, 'Spellcaster'],
  [FAIRY_ID, 'Fairy'],
  [INSECT_ID, 'Insect'],
  [BEAST_ID, 'Beast'],
  [PLANT_ID, 'Plant'],
  [BEAST_WARRIOR_ID, 'Beast-Warrior'],
  [DINOSAUR_ID, 'Dinosaur'],
  [ZOMBIE_ID, 'Zombie'],
  [ROCK_ID, 'Rock'],
]);
const lookup = id => {
  const info = getDuelCard(id);
  if (!info) return undefined;
  if (SPELL_IDS.includes(id)) return { ...info, field: true };
  return { ...info, race: races.get(id) ?? info.race };
};
const fieldSpellIds = {
  YAMI: YAMI_FIXTURE_ID,
  FOREST: FOREST_FIXTURE_ID,
  WASTELAND: WASTELAND_FIXTURE_ID,
};
const negated = new Set();
const adapter = createRaceFieldSpellTagAdapter(fieldSpellIds, lookup, (_state, uid) => negated.has(uid));

const BASE_DECK = [
  ...NORMAL_IDS.slice(0, 12),
  ...EFFECT_IDS.slice(0, 4),
  ...SPELL_IDS,
  TRAP_IDS[0],
];
const MAX_DECK = [
  ...NORMAL_IDS.slice(0, 25),
  ...EFFECT_IDS.slice(0, 5),
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
    seed: 'm613-race-field-spells',
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

function addField(duel, id, ownerSeat, controllerTeam, faceUp = true, resolved = true) {
  const card = takeFromSeat(duel, ownerSeat, ref => ref.id === id);
  duel.core.players[controllerTeam].field = {
    ...card,
    setTurn: 0,
    faceUp,
    resolved,
  };
  synchronizeCardLifetimes(duel.core);
  return card.uid;
}

function addBackrow(duel, id, ownerSeat, controllerTeam) {
  const card = takeFromSeat(duel, ownerSeat, ref => ref.id === id);
  duel.core.players[controllerTeam].backrow.push({
    ...card,
    setTurn: 0,
    faceUp: false,
  });
  synchronizeCardLifetimes(duel.core);
  return card.uid;
}

function inventory(duel) {
  return tagInventory(duel)
    .map(card => [card.uid, card.id])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function resetNegation() {
  negated.clear();
}

test('passcodes oficiais das três Field Spells de Raça', () => {
  assert.equal(RACE_FIELD_SPELL_IDS.YAMI, '59197169');
  assert.equal(RACE_FIELD_SPELL_IDS.FOREST, '87430998');
  assert.equal(RACE_FIELD_SPELL_IDS.WASTELAND, '23424603');
  assert.equal(adapter.fieldSpellIds.YAMI, YAMI_FIXTURE_ID);
});

test('Yami concede +200/+200 a Fiend e Spellcaster e aplica -200/-200 a Fairy', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, YAMI_FIXTURE_ID, 0, 0);
  const fiend = addMonster(duel, FIEND_ID, 2, 0);
  const spellcaster = addMonster(duel, SPELLCASTER_ID, 0, 0);
  const fairy = addMonster(duel, FAIRY_ID, 1, 1);
  assert.equal(adapter.getRaceModifier(duel, fiend).atk, 200);
  assert.equal(adapter.getRaceModifier(duel, fiend).def, 200);
  assert.equal(adapter.getRaceModifier(duel, spellcaster).atk, 200);
  assert.equal(adapter.getRaceModifier(duel, fairy).atk, -200);
  assert.equal(adapter.getRaceModifier(duel, fairy).def, -200);
});

test('Forest modifica Insect, Beast, Plant e Beast-Warrior, sem atingir outras Raças', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, FOREST_FIXTURE_ID, 0, 0);
  for (const id of [INSECT_ID, BEAST_ID, PLANT_ID, BEAST_WARRIOR_ID]) {
    const uid = addMonster(duel, id, 0, 0);
    assert.equal(adapter.getRaceModifier(duel, uid).atk, 200);
    assert.equal(adapter.getRaceModifier(duel, uid).def, 200);
  }
  const fiend = addMonster(duel, FIEND_ID, 1, 1);
  assert.equal(adapter.getRaceModifier(duel, fiend).atk, 0);
});

test('Wasteland modifica Dinosaur, Zombie e Rock', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, WASTELAND_FIXTURE_ID, 2, 1);
  for (const id of [DINOSAUR_ID, ZOMBIE_ID, ROCK_ID]) {
    const uid = addMonster(duel, id, 0, 0);
    assert.equal(adapter.getRaceModifier(duel, uid).atk, 200);
    assert.equal(adapter.getRaceModifier(duel, uid).def, 200);
  }
});

test('Field Spells de Raça afetam monstros das duas equipes', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, FOREST_FIXTURE_ID, 0, 0);
  const opponentInsect = addMonster(duel, INSECT_ID, 3, 1);
  assert.equal(adapter.getRaceModifier(duel, opponentInsect).atk, 200);
});

test('fontes iguais em Field Zones distintas acumulam', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, FOREST_FIXTURE_ID, 0, 0);
  addField(duel, FOREST_FIXTURE_ID, 2, 1);
  const insect = addMonster(duel, INSECT_ID, 1, 1);
  const modifier = adapter.getRaceModifier(duel, insect);
  assert.equal(modifier.activeSources, 2);
  assert.equal(modifier.atk, 400);
  assert.equal(modifier.def, 400);
});

test('Yami, Forest e Wasteland podem coexistir sem cruzar seus filtros de Raça', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, YAMI_FIXTURE_ID, 0, 0);
  addField(duel, FOREST_FIXTURE_ID, 2, 1);
  const fairy = addMonster(duel, FAIRY_ID, 1, 1);
  const plant = addMonster(duel, PLANT_ID, 3, 0);
  assert.equal(adapter.getRaceModifier(duel, fairy).atk, -200);
  assert.equal(adapter.getRaceModifier(duel, plant).atk, 200);
});

test('Field Spell face-down ou ainda não resolvida não contribui', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, FOREST_FIXTURE_ID, 0, 0, false);
  const insect = addMonster(duel, INSECT_ID, 2, 0);
  assert.equal(adapter.getRaceModifier(duel, insect).atk, 0);
  const second = makeDuel();
  addField(second, WASTELAND_FIXTURE_ID, 2, 1, true, false);
  const rock = addMonster(second, ROCK_ID, 0, 0);
  assert.equal(adapter.getRaceModifier(second, rock).atk, 0);
});

test('negação remove somente a fonte correspondente', () => {
  resetNegation();
  const duel = makeDuel();
  const first = addField(duel, FOREST_FIXTURE_ID, 0, 0);
  addField(duel, FOREST_FIXTURE_ID, 2, 1);
  const insect = addMonster(duel, INSECT_ID, 1, 1);
  negated.add(first);
  const modifier = adapter.getRaceModifier(duel, insect);
  assert.equal(modifier.activeSources, 1);
  assert.equal(modifier.atk, 200);
});

test('substituir ou remover a Field Spell encerra imediatamente a fonte antiga', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, FOREST_FIXTURE_ID, 0, 0);
  const insect = addMonster(duel, INSECT_ID, 2, 0);
  assert.equal(adapter.getRaceModifier(duel, insect).atk, 200);
  const replacement = takeFromSeat(duel, 1, ref => ref.id === WASTELAND_FIXTURE_ID);
  duel.core.players[0].field = { ...replacement, setTurn: 0, faceUp: true, resolved: true };
  synchronizeCardLifetimes(duel.core);
  assert.equal(adapter.getRaceModifier(duel, insect).atk, 0);
  duel.core.players[0].field = null;
  synchronizeCardLifetimes(duel.core);
  assert.equal(adapter.getRaceModifier(duel, insect).atk, 0);
});

test('monstro face-down não revela Raça', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, FOREST_FIXTURE_ID, 0, 0);
  const hidden = addMonster(duel, INSECT_ID, 2, 0, false);
  let lookedUp = false;
  const guarded = createRaceFieldSpellTagAdapter(fieldSpellIds, id => {
    if (id === INSECT_ID) lookedUp = true;
    return lookup(id);
  });
  assert.equal(guarded.getRaceModifier(duel, hidden).race, 'UNKNOWN');
  assert.equal(lookedUp, false);
});

test('Raça ausente é rejeitada em vez de receber um bônus arbitrário', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, FOREST_FIXTURE_ID, 0, 0);
  const insect = addMonster(duel, INSECT_ID, 2, 0);
  const strict = createRaceFieldSpellTagAdapter(fieldSpellIds, id => {
    const info = lookup(id);
    return id === INSECT_ID ? { ...info, race: null } : info;
  });
  assert.throws(() => strict.getRaceModifier(duel, insect));
});

test('consulta preserva UIDs, inventário e estado do duelo', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, YAMI_FIXTURE_ID, 0, 0);
  const fiend = addMonster(duel, FIEND_ID, 2, 0);
  const before = JSON.stringify(duel);
  const beforeInventory = inventory(duel);
  assert.equal(adapter.getRaceModifier(duel, fiend).atk, 200);
  assert.deepEqual(inventory(duel), beforeInventory);
  assert.equal(JSON.stringify(duel), before);
});

test('consulta não descarta mão acima de seis antes da End Phase', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, YAMI_FIXTURE_ID, 0, 0);
  const fiend = addMonster(duel, FIEND_ID, 2, 0);
  while (duel.core.players[0].hand.length < 7) {
    duel.core.players[0].hand.push(duel.core.players[0].deck.shift());
  }
  const handBefore = duel.core.players[0].hand.map(card => card.uid);
  assert.equal(adapter.getRaceModifier(duel, fiend).atk, 200);
  assert.deepEqual(duel.core.players[0].hand.map(card => card.uid), handBefore);
  assert.equal(duel.core.players[0].hand.length, 7);
});

test('Field Zone é separada das três Spell/Trap Zones e das três Monster Zones', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, YAMI_FIXTURE_ID, 2, 0);
  addBackrow(duel, YAMI_FIXTURE_ID, 0, 0);
  addBackrow(duel, FOREST_FIXTURE_ID, 0, 0);
  addBackrow(duel, WASTELAND_FIXTURE_ID, 0, 0);
  addMonster(duel, FIEND_ID, 0, 0);
  addMonster(duel, SPELLCASTER_ID, 0, 0);
  addMonster(duel, FAIRY_ID, 0, 0);
  assert.doesNotThrow(() => adapter.getRaceModifier(
    duel, duel.core.players[0].monsters[0].uid
  ));
  addMonster(duel, INSECT_ID, 1, 0);
  assert.throws(() => adapter.getRaceModifier(
    duel, duel.core.players[0].monsters[0].uid
  ));
});

test('Deck Principal 20/30 e Extra Deck 5 permanecem preservados', () => {
  resetNegation();
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK));
  assert.doesNotThrow(() => makeDuel(2, MAX_DECK));
  assert.throws(() => makeDuel(2, BASE_DECK.slice(1)));
  assert.throws(() => makeDuel(2, [...MAX_DECK, NORMAL_IDS[26]]));
  assert.ok(FUSION_IDS.length >= 5);
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 5) }));
  assert.throws(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 6) }));
});

test('IDs inválidos e metadados Field não passam silenciosamente', () => {
  resetNegation();
  assert.throws(() => createRaceFieldSpellTagAdapter({ YAMI: '' }, lookup));
  const duel = makeDuel();
  addField(duel, YAMI_FIXTURE_ID, 0, 0);
  const fiend = addMonster(duel, FIEND_ID, 2, 0);
  const strict = createRaceFieldSpellTagAdapter(fieldSpellIds, id => {
    const info = lookup(id);
    return id === YAMI_FIXTURE_ID ? { ...info, field: false } : info;
  });
  assert.throws(() => strict.getRaceModifier(duel, fiend));
});
