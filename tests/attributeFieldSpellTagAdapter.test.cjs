const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  LUMINOUS_SPARK_ID,
  MYSTIC_PLASMA_ZONE_ID,
  createAttributeFieldSpellTagAdapter,
} = require('../dist/attributeFieldSpellTagAdapter.js');

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

const LIGHT_FIXTURE_ID = EFFECT_IDS[0];
const DARK_FIXTURE_ID = EFFECT_IDS[1];
const EARTH_FIXTURE_ID = EFFECT_IDS[2];
const LUMINOUS_FIXTURE_ID = SPELL_IDS[0];
const MYSTIC_FIXTURE_ID = SPELL_IDS[1];
const attributes = new Map([
  [LIGHT_FIXTURE_ID, 'LIGHT'],
  [DARK_FIXTURE_ID, 'DARK'],
  [EARTH_FIXTURE_ID, 'EARTH'],
]);
const lookup = id => {
  const info = getDuelCard(id);
  if (!info) return undefined;
  if (id === LUMINOUS_FIXTURE_ID || id === MYSTIC_FIXTURE_ID) {
    return { ...info, field: true };
  }
  return { ...info, attribute: attributes.get(id) ?? info.attribute };
};
const negated = new Set();
const adapter = createAttributeFieldSpellTagAdapter({
  luminousSparkId: LUMINOUS_FIXTURE_ID,
  mysticPlasmaZoneId: MYSTIC_FIXTURE_ID,
}, lookup, (_state, uid) => negated.has(uid));

const BASE_DECK = [
  ...NORMAL_IDS.slice(0, 12),
  LIGHT_FIXTURE_ID,
  DARK_FIXTURE_ID,
  EARTH_FIXTURE_ID,
  ...EFFECT_IDS.slice(3, 5),
  ...SPELL_IDS,
  TRAP_IDS[0],
];
const MAX_DECK = [
  ...NORMAL_IDS.slice(0, 25),
  LIGHT_FIXTURE_ID,
  DARK_FIXTURE_ID,
  EARTH_FIXTURE_ID,
  ...EFFECT_IDS.slice(3, 5),
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
    seed: 'm612-attribute-field-spells',
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

test('identidades oficiais e fixture Field Spell permanecem separadas', () => {
  assert.equal(LUMINOUS_SPARK_ID, '81777047');
  assert.equal(MYSTIC_PLASMA_ZONE_ID, '18161786');
  assert.equal(adapter.luminousSparkId, LUMINOUS_FIXTURE_ID);
  assert.equal(adapter.mysticPlasmaZoneId, MYSTIC_FIXTURE_ID);
});

test('Luminous Spark concede +500 ATK/-400 DEF a monstros LIGHT face-up', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 2, 0);
  const dark = addMonster(duel, DARK_FIXTURE_ID, 1, 1);
  assert.deepEqual(adapter.getAttributeModifier(duel, light), {
    targetUid: light, attribute: 'LIGHT', activeSources: 1, atk: 500, def: -400,
    sourceUids: [duel.core.players[0].field.uid],
  });
  assert.deepEqual(adapter.getAttributeModifier(duel, dark), {
    targetUid: dark, attribute: 'DARK', activeSources: 0, atk: 0, def: 0,
    sourceUids: [],
  });
});

test('Mystic Plasma Zone concede +500 ATK/-400 DEF somente a monstros DARK', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, MYSTIC_FIXTURE_ID, 2, 1);
  const dark = addMonster(duel, DARK_FIXTURE_ID, 0, 0);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 3, 1);
  assert.equal(adapter.getAttributeModifier(duel, dark).atk, 500);
  assert.equal(adapter.getAttributeModifier(duel, dark).def, -400);
  assert.equal(adapter.getAttributeModifier(duel, light).atk, 0);
});

test('Field Spell de qualquer equipe afeta monstros da equipe oposta', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  const opponentLight = addMonster(duel, LIGHT_FIXTURE_ID, 3, 1);
  assert.equal(adapter.getAttributeModifier(duel, opponentLight).atk, 500);
});

test('as duas Field Zones podem sustentar auras de atributos independentes', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  addField(duel, MYSTIC_FIXTURE_ID, 2, 1);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 1, 1);
  const dark = addMonster(duel, DARK_FIXTURE_ID, 3, 0);
  assert.equal(adapter.getAttributeModifier(duel, light).atk, 500);
  assert.equal(adapter.getAttributeModifier(duel, dark).atk, 500);
});

test('duas cópias de Luminous Spark em equipes diferentes acumulam', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  addField(duel, LUMINOUS_FIXTURE_ID, 2, 1);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 1, 1);
  const modifier = adapter.getAttributeModifier(duel, light);
  assert.equal(modifier.activeSources, 2);
  assert.equal(modifier.atk, 1000);
  assert.equal(modifier.def, -800);
  assert.equal(new Set(modifier.sourceUids).size, 2);
});

test('Field Spell face-down não modifica o campo', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, LUMINOUS_FIXTURE_ID, 0, 0, false);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 2, 0);
  assert.equal(adapter.getAttributeModifier(duel, light).atk, 0);
});

test('Field Spell ainda não resolvida não contribui para os atributos', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, MYSTIC_FIXTURE_ID, 2, 1, true, false);
  const dark = addMonster(duel, DARK_FIXTURE_ID, 0, 0);
  assert.equal(adapter.getAttributeModifier(duel, dark).atk, 0);
});

test('negação do efeito de Field Spell remove apenas aquela fonte', () => {
  resetNegation();
  const duel = makeDuel();
  const first = addField(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  addField(duel, LUMINOUS_FIXTURE_ID, 2, 1);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 1, 1);
  negated.add(first);
  const modifier = adapter.getAttributeModifier(duel, light);
  assert.equal(modifier.activeSources, 1);
  assert.equal(modifier.atk, 500);
  assert.deepEqual(modifier.sourceUids, [duel.core.players[1].field.uid]);
});

test('substituir a carta na Field Zone elimina imediatamente a aura antiga', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 2, 0);
  assert.equal(adapter.getAttributeModifier(duel, light).atk, 500);
  const replacement = takeFromSeat(duel, 1, ref => ref.id === MYSTIC_FIXTURE_ID);
  duel.core.players[0].field = { ...replacement, setTurn: 0, faceUp: true, resolved: true };
  synchronizeCardLifetimes(duel.core);
  assert.equal(adapter.getAttributeModifier(duel, light).atk, 0);
});

test('remover a Field Spell encerra o modificador sem deixar estado residual', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, MYSTIC_FIXTURE_ID, 2, 1);
  const dark = addMonster(duel, DARK_FIXTURE_ID, 0, 0);
  assert.equal(adapter.getAttributeModifier(duel, dark).atk, 500);
  duel.core.players[1].field = null;
  synchronizeCardLifetimes(duel.core);
  assert.equal(adapter.getAttributeModifier(duel, dark).atk, 0);
});

test('monstro alvo face-down não revela atributo nem recebe modificador', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  const hidden = addMonster(duel, LIGHT_FIXTURE_ID, 2, 0, false);
  let lookedUp = false;
  const guardedLookup = id => {
    if (id === LIGHT_FIXTURE_ID) lookedUp = true;
    return lookup(id);
  };
  const guarded = createAttributeFieldSpellTagAdapter({
    luminousSparkId: LUMINOUS_FIXTURE_ID,
    mysticPlasmaZoneId: MYSTIC_FIXTURE_ID,
  }, guardedLookup);
  assert.equal(guarded.getAttributeModifier(duel, hidden).attribute, 'UNKNOWN');
  assert.equal(guarded.getAttributeModifier(duel, hidden).atk, 0);
  assert.equal(lookedUp, false);
});

test('monstro de atributo diferente permanece inalterado', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  const earth = addMonster(duel, EARTH_FIXTURE_ID, 2, 0);
  assert.equal(adapter.getAttributeModifier(duel, earth).atk, 0);
  assert.equal(adapter.getAttributeModifier(duel, earth).def, 0);
});

test('atributo ausente não é tratado como LIGHT ou DARK', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 2, 0);
  const unknownLookup = id => {
    const info = lookup(id);
    return id === LIGHT_FIXTURE_ID ? { ...info, attribute: null } : info;
  };
  const strict = createAttributeFieldSpellTagAdapter({
    luminousSparkId: LUMINOUS_FIXTURE_ID,
    mysticPlasmaZoneId: MYSTIC_FIXTURE_ID,
  }, unknownLookup);
  assert.throws(() => strict.getAttributeModifier(duel, light));
});

test('consulta conserva todos os UIDs e não muta o estado do duelo', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 2, 0);
  const before = JSON.stringify(duel);
  const beforeInventory = inventory(duel);
  const result = adapter.getAttributeModifier(duel, light);
  assert.equal(result.atk, 500);
  assert.deepEqual(inventory(duel), beforeInventory);
  assert.equal(JSON.stringify(duel), before);
});

test('consulta não descarta mão acima de seis antes da End Phase', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 2, 0);
  while (duel.core.players[0].hand.length < 7) {
    duel.core.players[0].hand.push(duel.core.players[0].deck.shift());
  }
  const handBefore = duel.core.players[0].hand.map(card => card.uid);
  assert.equal(adapter.getAttributeModifier(duel, light).atk, 500);
  assert.deepEqual(duel.core.players[0].hand.map(card => card.uid), handBefore);
  assert.equal(duel.core.players[0].hand.length, 7);
});

test('Field Zone é separada das três Spell/Trap Zones e das três Monster Zones', () => {
  resetNegation();
  const duel = makeDuel();
  addField(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  addBackrow(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  addBackrow(duel, MYSTIC_FIXTURE_ID, 0, 0);
  addBackrow(duel, TRAP_IDS[0], 0, 0);
  addMonster(duel, LIGHT_FIXTURE_ID, 0, 0);
  addMonster(duel, DARK_FIXTURE_ID, 0, 0);
  addMonster(duel, EARTH_FIXTURE_ID, 0, 0);
  assert.doesNotThrow(() => adapter.getAttributeModifier(
    duel, duel.core.players[0].monsters[0].uid
  ));
  addMonster(duel, EFFECT_IDS[3], 1, 0);
  assert.throws(() => adapter.getAttributeModifier(
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

test('IDs inválidos e metadados de Field Spell não são aceitos silenciosamente', () => {
  resetNegation();
  assert.throws(() => createAttributeFieldSpellTagAdapter({
    luminousSparkId: '', mysticPlasmaZoneId: MYSTIC_FIXTURE_ID,
  }, lookup));
  const duel = makeDuel();
  addField(duel, LUMINOUS_FIXTURE_ID, 0, 0);
  const light = addMonster(duel, LIGHT_FIXTURE_ID, 2, 0);
  const invalidLookup = id => {
    const info = lookup(id);
    return id === LUMINOUS_FIXTURE_ID ? { ...info, field: false } : info;
  };
  const strict = createAttributeFieldSpellTagAdapter({
    luminousSparkId: LUMINOUS_FIXTURE_ID,
    mysticPlasmaZoneId: MYSTIC_FIXTURE_ID,
  }, invalidLookup);
  assert.throws(() => strict.getAttributeModifier(duel, light));
});
