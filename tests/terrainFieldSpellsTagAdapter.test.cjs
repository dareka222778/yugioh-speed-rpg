const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  TERRAIN_FIELD_SPELL_IDS,
  createTerrainFieldSpellTagAdapter,
} = require('../dist/terrainFieldSpellsTagAdapter.js');

const FIELD_SPELL_FIXTURE_ID = '86318356'; // Sogen is the admitted base-catalog Field Spell.
const FIELD_KEYS = ['SOGEN', 'MOUNTAIN', 'WASTELAND', 'FOREST', 'UMI', 'YAMI'];
const RACES = [
  'Warrior', 'Beast-Warrior', 'Dragon', 'Winged Beast', 'Thunder',
  'Dinosaur', 'Zombie', 'Rock', 'Insect', 'Beast', 'Plant',
  'Fish', 'Sea Serpent', 'Aqua', 'Machine', 'Pyro', 'Fiend',
  'Spellcaster', 'Fairy',
];

const allMainIds = [...new Set([...enabledCardIds, ...tagNormalCardIds])]
  .filter(id => {
    const card = getDuelCard(id);
    return card?.kind === 'monster' && !card.fusion;
  });
const raceFixtureIds = Object.fromEntries(RACES.map(race => [
  race,
  allMainIds.find(id => getDuelCard(id)?.race === race),
]));
for (const race of RACES) {
  assert.ok(raceFixtureIds[race], 'a certified physical fixture is required for race ' + race);
}
const RACE_IDS = RACES.map(race => raceFixtureIds[race]);
assert.equal(new Set(RACE_IDS).size, RACES.length, 'each race needs a distinct physical card');
assert.equal(getDuelCard(FIELD_SPELL_FIXTURE_ID)?.field, true,
  'Sogen must remain an admitted Field Spell fixture');

const SPELL_IDS = enabledCardIds
  .filter(id => getDuelCard(id)?.kind === 'spell' && id !== FIELD_SPELL_FIXTURE_ID)
  .slice(0, 2);
const TRAP_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'trap').slice(0, 1);
const FUSION_NAMES = new Set();
const FUSION_IDS = enabledCardIds.filter(id => {
  const card = getDuelCard(id);
  if (!card?.fusion) return false;
  const name = rulesCardName(card);
  if (FUSION_NAMES.has(name)) return false;
  FUSION_NAMES.add(name);
  return true;
});
const EXTRA_NAMES = new Set();
const NORMAL_EXTRA_IDS = tagNormalCardIds.filter(id => {
  if (RACE_IDS.includes(id) || id === FIELD_SPELL_FIXTURE_ID) return false;
  const name = rulesCardName(getDuelCard(id));
  if (EXTRA_NAMES.has(name)) return false;
  EXTRA_NAMES.add(name);
  return true;
}).slice(0, 7);

assert.equal(SPELL_IDS.length, 2, 'fixtures require two non-Field Spells');
assert.equal(TRAP_IDS.length, 1, 'fixture requires an enabled Trap');
assert.ok(FUSION_IDS.length >= 5, 'fixtures require five distinct Fusion Monsters');
assert.equal(NORMAL_EXTRA_IDS.length, 7, 'fixtures require seven extra Normal Monsters');

const BASE_DECK = [...RACE_IDS, FIELD_SPELL_FIXTURE_ID];
const MAX_DECK = [...BASE_DECK, ...SPELL_IDS, TRAP_IDS[0], ...NORMAL_EXTRA_IDS];
assert.equal(BASE_DECK.length, 20);
assert.equal(MAX_DECK.length, 30);

const lookup = id => {
  const info = getDuelCard(id);
  if (!info) return undefined;
  return id === FIELD_SPELL_FIXTURE_ID ? { ...info, field: true } : info;
};
const negated = new Set();

function adapterFor(key, customLookup = lookup) {
  const ids = Object.fromEntries(FIELD_KEYS.map(fieldKey => [
    fieldKey,
    fieldKey === key ? FIELD_SPELL_FIXTURE_ID : 'm613-unused-' + fieldKey.toLowerCase(),
  ]));
  return createTerrainFieldSpellTagAdapter(ids, customLookup,
    (_state, uid) => negated.has(uid));
}

const adapters = Object.fromEntries(FIELD_KEYS.map(key => [key, adapterFor(key)]));

function makeDuel(first = 2, deck = BASE_DECK, extraBySeat = {}) {
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...deck],
    extra: [...(extraBySeat[i] || [])],
  }));
  return createTagDuel(players, {
    seed: 'm613-terrain-field-spells',
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

function addMonster(duel, race, ownerSeat, controllerTeam, faceUp = true) {
  const id = raceFixtureIds[race];
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

function addField(duel, ownerSeat, controllerTeam, faceUp = true, resolved = true) {
  const card = takeFromSeat(duel, ownerSeat, ref => ref.id === FIELD_SPELL_FIXTURE_ID);
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

test('identidades oficiais e seis Field Spells clássicas estão mapeadas', () => {
  assert.deepEqual(TERRAIN_FIELD_SPELL_IDS, {
    SOGEN: '86318356',
    MOUNTAIN: '50913601',
    WASTELAND: '23424603',
    FOREST: '87430998',
    UMI: '22702055',
    YAMI: '59197169',
  });
  for (const key of FIELD_KEYS) {
    assert.equal(adapters[key].fieldSpellIds[key], FIELD_SPELL_FIXTURE_ID);
  }
});

test('Sogen concede +200 ATK/DEF a Warrior e Beast-Warrior, sem afetar outras raças', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0);
  const warrior = addMonster(duel, 'Warrior', 0, 0);
  const beastWarrior = addMonster(duel, 'Beast-Warrior', 2, 0);
  const dragon = addMonster(duel, 'Dragon', 1, 1);
  assert.equal(adapters.SOGEN.getTerrainModifier(duel, warrior).atk, 200);
  assert.equal(adapters.SOGEN.getTerrainModifier(duel, warrior).def, 200);
  assert.equal(adapters.SOGEN.getTerrainModifier(duel, beastWarrior).atk, 200);
  assert.equal(adapters.SOGEN.getTerrainModifier(duel, dragon).atk, 0);
});

test('Mountain concede +200 ATK/DEF a Dragon, Winged Beast e Thunder', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0);
  for (const race of ['Dragon', 'Winged Beast', 'Thunder']) {
    const uid = addMonster(duel, race, 0, 0);
    const modifier = adapters.MOUNTAIN.getTerrainModifier(duel, uid);
    assert.equal(modifier.atk, 200, race);
    assert.equal(modifier.def, 200, race);
  }
});

test('Wasteland concede +200 ATK/DEF a Dinosaur, Zombie e Rock', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0);
  for (const race of ['Dinosaur', 'Zombie', 'Rock']) {
    const uid = addMonster(duel, race, 0, 0);
    const modifier = adapters.WASTELAND.getTerrainModifier(duel, uid);
    assert.equal(modifier.atk, 200, race);
    assert.equal(modifier.def, 200, race);
  }
});

test('Forest concede +200 ATK/DEF a Insect, Beast, Plant e Beast-Warrior', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0);
  const races = ['Insect', 'Beast', 'Plant', 'Beast-Warrior'];
  const uids = races.map((race, index) =>
    addMonster(duel, race, index === 3 ? 1 : 0, index === 3 ? 1 : 0));
  uids.forEach((uid, index) => {
    const modifier = adapters.FOREST.getTerrainModifier(duel, uid);
    assert.equal(modifier.atk, 200, races[index]);
    assert.equal(modifier.def, 200, races[index]);
  });
});

test('Umi concede +200 a Fish, Sea Serpent, Thunder e Aqua', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0);
  const races = ['Fish', 'Sea Serpent', 'Thunder', 'Aqua'];
  const uids = races.map((race, index) =>
    addMonster(duel, race, index === 3 ? 1 : 0, index === 3 ? 1 : 0));
  uids.forEach((uid, index) => {
    const modifier = adapters.UMI.getTerrainModifier(duel, uid);
    assert.equal(modifier.atk, 200, races[index]);
    assert.equal(modifier.def, 200, races[index]);
  });
});

test('Umi reduz Machine e Pyro em 200 ATK/DEF', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0);
  const machine = addMonster(duel, 'Machine', 0, 0);
  const pyro = addMonster(duel, 'Pyro', 2, 0);
  assert.equal(adapters.UMI.getTerrainModifier(duel, machine).atk, -200);
  assert.equal(adapters.UMI.getTerrainModifier(duel, machine).def, -200);
  assert.equal(adapters.UMI.getTerrainModifier(duel, pyro).atk, -200);
  assert.equal(adapters.UMI.getTerrainModifier(duel, pyro).def, -200);
});

test('Yami concede +200 a Fiend e Spellcaster', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0);
  const fiend = addMonster(duel, 'Fiend', 0, 0);
  const spellcaster = addMonster(duel, 'Spellcaster', 2, 0);
  assert.equal(adapters.YAMI.getTerrainModifier(duel, fiend).atk, 200);
  assert.equal(adapters.YAMI.getTerrainModifier(duel, spellcaster).atk, 200);
  assert.equal(adapters.YAMI.getTerrainModifier(duel, spellcaster).def, 200);
});

test('Yami reduz Fairy em 200 ATK/DEF', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0);
  const fairy = addMonster(duel, 'Fairy', 0, 0);
  assert.equal(adapters.YAMI.getTerrainModifier(duel, fairy).atk, -200);
  assert.equal(adapters.YAMI.getTerrainModifier(duel, fairy).def, -200);
});

test('Field Spell de uma equipe afeta monstros face-up da equipe oposta', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0);
  const opponentWarrior = addMonster(duel, 'Warrior', 1, 1);
  const modifier = adapters.SOGEN.getTerrainModifier(duel, opponentWarrior);
  assert.equal(modifier.atk, 200);
  assert.equal(modifier.def, 200);
});

test('duas cópias em Field Zones diferentes acumulam sem duplicar UIDs', () => {
  resetNegation();
  const duel = makeDuel();
  const first = addField(duel, 0, 0);
  const second = addField(duel, 2, 1);
  const warrior = addMonster(duel, 'Warrior', 1, 1);
  const before = inventory(duel);
  const modifier = adapters.SOGEN.getTerrainModifier(duel, warrior);
  assert.equal(modifier.activeSources, 2);
  assert.equal(modifier.atk, 400);
  assert.equal(modifier.def, 400);
  assert.deepEqual(new Set(modifier.sourceUids), new Set([first, second]));
  assert.deepEqual(inventory(duel), before);
});

test('Field Spell face-down não modifica o campo', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0, false);
  const warrior = addMonster(duel, 'Warrior', 2, 0);
  assert.equal(adapters.SOGEN.getTerrainModifier(duel, warrior).atk, 0);
});

test('Field Spell ainda não resolvida não contribui', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 2, 1, true, false);
  const warrior = addMonster(duel, 'Warrior', 0, 0);
  assert.equal(adapters.SOGEN.getTerrainModifier(duel, warrior).atk, 0);
});

test('negação remove somente a fonte negada', () => {
  resetNegation();
  const duel = makeDuel();
  const first = addField(duel, 0, 0);
  const second = addField(duel, 2, 1);
  const warrior = addMonster(duel, 'Warrior', 1, 1);
  negated.add(first);
  const modifier = adapters.SOGEN.getTerrainModifier(duel, warrior);
  assert.equal(modifier.activeSources, 1);
  assert.equal(modifier.atk, 200);
  assert.deepEqual(modifier.sourceUids, [second]);
});

test('substituir a Field Zone elimina a fonte anterior e usa o novo UID', () => {
  resetNegation();
  const duel = makeDuel();
  const first = addField(duel, 0, 0);
  const warrior = addMonster(duel, 'Warrior', 2, 0);
  assert.deepEqual(adapters.SOGEN.getTerrainModifier(duel, warrior).sourceUids, [first]);
  const oldField = duel.core.players[0].field;
  duel.core.players[0].grave.push({ uid: oldField.uid, id: oldField.id });
  const replacement = takeFromSeat(duel, 1, ref => ref.id === FIELD_SPELL_FIXTURE_ID);
  duel.core.players[0].field = {
    ...replacement,
    setTurn: 0,
    faceUp: true,
    resolved: true,
  };
  synchronizeCardLifetimes(duel.core);
  const modifier = adapters.SOGEN.getTerrainModifier(duel, warrior);
  assert.equal(modifier.atk, 200);
  assert.deepEqual(modifier.sourceUids, [replacement.uid]);
});

test('remover a Field Spell encerra o modificador sem estado residual', () => {
  resetNegation();
  const duel = makeDuel();
  const fieldUid = addField(duel, 2, 1);
  const warrior = addMonster(duel, 'Warrior', 0, 0);
  assert.equal(adapters.SOGEN.getTerrainModifier(duel, warrior).atk, 200);
  duel.core.players[0].grave.push({ uid: fieldUid, id: FIELD_SPELL_FIXTURE_ID });
  duel.core.players[1].field = null;
  synchronizeCardLifetimes(duel.core);
  assert.equal(adapters.SOGEN.getTerrainModifier(duel, warrior).atk, 0);
});

test('monstro face-down não revela raça nem recebe modificador', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0);
  const hidden = addMonster(duel, 'Warrior', 2, 0, false);
  let lookedUp = false;
  const guardedLookup = id => {
    if (id === raceFixtureIds.Warrior) lookedUp = true;
    return lookup(id);
  };
  const guarded = adapterFor('SOGEN', guardedLookup);
  const modifier = guarded.getTerrainModifier(duel, hidden);
  assert.equal(modifier.race, 'UNKNOWN');
  assert.equal(modifier.atk, 0);
  assert.equal(lookedUp, false);
});

test('raça ausente não é tratada silenciosamente como uma raça conhecida', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0);
  const warrior = addMonster(duel, 'Warrior', 2, 0);
  const strictLookup = id => {
    const info = lookup(id);
    return id === raceFixtureIds.Warrior ? { ...info, race: null } : info;
  };
  const strict = adapterFor('SOGEN', strictLookup);
  assert.throws(() => strict.getTerrainModifier(duel, warrior));
});

test('consulta é somente leitura e conserva todos os UIDs físicos', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0);
  const warrior = addMonster(duel, 'Warrior', 2, 0);
  const beforeState = JSON.stringify(duel);
  const beforeInventory = inventory(duel);
  const modifier = adapters.SOGEN.getTerrainModifier(duel, warrior);
  assert.equal(modifier.atk, 200);
  assert.deepEqual(inventory(duel), beforeInventory);
  assert.equal(JSON.stringify(duel), beforeState);
});

test('consulta não descarta mão acima de seis antes da End Phase', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, 0, 0);
  const warrior = addMonster(duel, 'Warrior', 2, 0);
  while (duel.core.players[0].hand.length < 7) {
    duel.core.players[0].hand.push(duel.core.players[0].deck.shift());
  }
  const handBefore = duel.core.players[0].hand.map(card => card.uid);
  assert.equal(adapters.SOGEN.getTerrainModifier(duel, warrior).atk, 200);
  assert.deepEqual(duel.core.players[0].hand.map(card => card.uid), handBefore);
  assert.equal(duel.core.players[0].hand.length, 7);
});

test('Field Zone é separada das três Spell/Trap Zones e das três Monster Zones', () => {
  resetNegation();
  const duel = makeDuel(2, MAX_DECK);
  addField(duel, 2, 0);
  addBackrow(duel, SPELL_IDS[0], 0, 0);
  addBackrow(duel, SPELL_IDS[1], 0, 0);
  addBackrow(duel, TRAP_IDS[0], 0, 0);
  const warrior = addMonster(duel, 'Warrior', 0, 0);
  addMonster(duel, 'Beast-Warrior', 0, 0);
  addMonster(duel, 'Dragon', 0, 0);
  assert.equal(adapters.SOGEN.getTerrainModifier(duel, warrior).atk, 200);
  addMonster(duel, 'Winged Beast', 1, 0);
  assert.throws(() => adapters.SOGEN.getTerrainModifier(duel, warrior));

  const fourthBackrow = makeDuel(2, MAX_DECK);
  addField(fourthBackrow, 2, 0);
  addBackrow(fourthBackrow, SPELL_IDS[0], 0, 0);
  addBackrow(fourthBackrow, SPELL_IDS[1], 0, 0);
  addBackrow(fourthBackrow, TRAP_IDS[0], 0, 0);
  const target = addMonster(fourthBackrow, 'Warrior', 0, 0);
  addBackrow(fourthBackrow, SPELL_IDS[0], 1, 0);
  assert.throws(() => adapters.SOGEN.getTerrainModifier(fourthBackrow, target));
});

test('Deck Principal 20/30 e Extra Deck máximo 5 são preservados', () => {
  resetNegation();
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK));
  assert.doesNotThrow(() => makeDuel(2, MAX_DECK));
  assert.throws(() => makeDuel(2, BASE_DECK.slice(1)));
  assert.throws(() => makeDuel(2, [...MAX_DECK, NORMAL_EXTRA_IDS[0]]));
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 5) }));
  assert.throws(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 6) }));
});

test('IDs inválidos e metadados que não são Field Spell são rejeitados', () => {
  resetNegation();
  assert.throws(() => createTerrainFieldSpellTagAdapter({ SOGEN: '' }, lookup));
  const duel = makeDuel();
  addField(duel, 0, 0);
  const warrior = addMonster(duel, 'Warrior', 2, 0);
  const invalidLookup = id => {
    const info = lookup(id);
    return id === FIELD_SPELL_FIXTURE_ID ? { ...info, field: false } : info;
  };
  const strict = adapterFor('SOGEN', invalidLookup);
  assert.throws(() => strict.getTerrainModifier(duel, warrior));
});
