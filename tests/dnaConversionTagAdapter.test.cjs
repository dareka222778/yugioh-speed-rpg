const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  DNA_CONVERSION_CARD_IDS,
  DNA_CONVERSION_ATTRIBUTES,
  DNA_CONVERSION_RACES,
  createDnaConversionTagAdapter,
} = require('../dist/dnaConversionTagAdapter.js');

const DNA_SURGERY_PASSCODE = '74701381';
const DNA_TRANSPLANT_PASSCODE = '56769674';
const RACES = ['Warrior', 'Dragon', 'Machine', 'Fiend', 'Fairy', 'Spellcaster', 'Insect', 'Beast'];
const ATTRIBUTES = ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND'];
const allMainIds = [...new Set([...enabledCardIds, ...tagNormalCardIds])]
  .filter(id => {
    const card = getDuelCard(id);
    return card?.kind === 'monster' && !card.fusion;
  });
const raceFixtureIds = Object.fromEntries(RACES.map(race => [
  race,
  allMainIds.find(id => getDuelCard(id)?.race === race),
]));
const attributeFixtureIds = Object.fromEntries(ATTRIBUTES.map(attribute => [
  attribute,
  allMainIds.find(id => getDuelCard(id)?.attribute === attribute),
]));
for (const race of RACES) {
  assert.ok(raceFixtureIds[race], 'certified physical fixture required for race ' + race);
}
for (const attribute of ATTRIBUTES) {
  assert.ok(attributeFixtureIds[attribute],
    'certified physical fixture required for attribute ' + attribute);
}

const MONSTER_FIXTURE_IDS = [...new Set([
  ...Object.values(raceFixtureIds),
  ...Object.values(attributeFixtureIds),
])];
const TRAP_FIXTURE_IDS = enabledCardIds
  .filter(id => id !== DNA_SURGERY_PASSCODE && id !== DNA_TRANSPLANT_PASSCODE)
  .filter(id => getDuelCard(id)?.kind === 'trap')
  .slice(0, 2);
assert.equal(TRAP_FIXTURE_IDS.length, 2, 'two admitted Trap fixtures required');

const EXTRA_NAMES = new Set();
const NORMAL_FILLER_IDS = tagNormalCardIds.filter(id => {
  if (MONSTER_FIXTURE_IDS.includes(id) || TRAP_FIXTURE_IDS.includes(id)) return false;
  const card = getDuelCard(id);
  if (!card || card.fusion) return false;
  const name = rulesCardName(card);
  if (EXTRA_NAMES.has(name)) return false;
  EXTRA_NAMES.add(name);
  return true;
});
const BASE_DECK = [
  ...MONSTER_FIXTURE_IDS,
  ...TRAP_FIXTURE_IDS,
  ...NORMAL_FILLER_IDS.slice(0, 20 - MONSTER_FIXTURE_IDS.length - TRAP_FIXTURE_IDS.length),
];
const MAX_DECK = [...BASE_DECK, ...NORMAL_FILLER_IDS.slice(
  20 - MONSTER_FIXTURE_IDS.length - TRAP_FIXTURE_IDS.length,
  30 - MONSTER_FIXTURE_IDS.length - TRAP_FIXTURE_IDS.length,
)];
const FUSION_NAMES = new Set();
const FUSION_IDS = enabledCardIds.filter(id => {
  const card = getDuelCard(id);
  if (!card?.fusion) return false;
  const name = rulesCardName(card);
  if (FUSION_NAMES.has(name)) return false;
  FUSION_NAMES.add(name);
  return true;
});
assert.equal(BASE_DECK.length, 20);
assert.equal(MAX_DECK.length, 30);
assert.ok(FUSION_IDS.length >= 5, 'five distinct Fusion fixtures required');

const fixtureIds = {
  DNA_SURGERY: TRAP_FIXTURE_IDS[0],
  DNA_TRANSPLANT: TRAP_FIXTURE_IDS[1],
};
const lookup = id => {
  const info = getDuelCard(id);
  return info ? { ...info, kind: id === fixtureIds.DNA_SURGERY ||
    id === fixtureIds.DNA_TRANSPLANT ? 'trap' : info.kind } : undefined;
};
const declarations = new Map();
const activationOrders = new Map();
const negated = new Set();

function adapterFor(customLookup = lookup, customOrder = uid => activationOrders.get(uid)) {
  return createDnaConversionTagAdapter(
    fixtureIds,
    customLookup,
    uid => declarations.get(uid),
    customOrder,
    (_state, uid) => negated.has(uid),
  );
}
const adapter = adapterFor();

function makeDuel(first = 2, deck = BASE_DECK, extraBySeat = {}) {
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...deck],
    extra: [...(extraBySeat[i] || [])],
  }));
  return createTagDuel(players, {
    seed: 'm614-dna-conversion',
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

function addMonsterById(duel, id, ownerSeat, controllerTeam, faceUp = true) {
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

function addMonster(duel, race, ownerSeat, controllerTeam, faceUp = true) {
  return addMonsterById(duel, raceFixtureIds[race], ownerSeat, controllerTeam, faceUp);
}

function addTrap(duel, key, ownerSeat, controllerTeam, value, order, faceUp = true, resolved = true) {
  const id = fixtureIds[key];
  const card = takeFromSeat(duel, ownerSeat, ref => ref.id === id);
  duel.core.players[controllerTeam].backrow.push({
    ...card,
    setTurn: 0,
    faceUp,
    resolved,
  });
  declarations.set(card.uid, value);
  activationOrders.set(card.uid, order);
  synchronizeCardLifetimes(duel.core);
  return card.uid;
}

function inventory(duel) {
  return tagInventory(duel)
    .map(card => [card.uid, card.id])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function sendBackrowToOwnerGrave(duel, team, uid, id) {
  duel.core.players[team].backrow = duel.core.players[team].backrow.filter(card => card.uid !== uid);
  duel.core.players[team].grave.push({ uid, id });
  synchronizeCardLifetimes(duel.core);
}

function resetState() {
  declarations.clear();
  activationOrders.clear();
  negated.clear();
}

test('identidades oficiais e valores válidos de Raça/Atributo estão mapeados', () => {
  assert.deepEqual(DNA_CONVERSION_CARD_IDS, {
    DNA_SURGERY: '74701381',
    DNA_TRANSPLANT: '56769674',
  });
  assert.equal(adapter.cardIds.DNA_SURGERY, fixtureIds.DNA_SURGERY);
  assert.equal(adapter.cardIds.DNA_TRANSPLANT, fixtureIds.DNA_TRANSPLANT);
  assert.ok(DNA_CONVERSION_RACES.includes('Warrior'));
  assert.ok(DNA_CONVERSION_ATTRIBUTES.includes('DIVINE'));
});

test('DNA Surgery substitui a Raça de todos os monstros face-up', () => {
  resetState();
  const duel = makeDuel();
  const source = addTrap(duel, 'DNA_SURGERY', 0, 0, 'Machine', 1);
  const own = addMonster(duel, 'Warrior', 0, 0);
  const opponent = addMonster(duel, 'Dragon', 1, 1);
  const ownResult = adapter.getDnaConversion(duel, own);
  const opponentResult = adapter.getDnaConversion(duel, opponent);
  assert.equal(ownResult.originalRace, 'Warrior');
  assert.equal(ownResult.race, 'Machine');
  assert.equal(opponentResult.race, 'Machine');
  assert.equal(ownResult.raceSourceUid, source);
});

test('DNA Transplant substitui o Atributo de todos os monstros face-up', () => {
  resetState();
  const duel = makeDuel();
  const source = addTrap(duel, 'DNA_TRANSPLANT', 0, 0, 'WATER', 1);
  const target = addMonster(duel, 'Warrior', 2, 0);
  const result = adapter.getDnaConversion(duel, target);
  assert.equal(result.originalAttribute, getDuelCard(raceFixtureIds.Warrior).attribute);
  assert.equal(result.attribute, 'WATER');
  assert.equal(result.attributeSourceUid, source);
});

test('DNA Surgery e DNA Transplant podem alterar propriedades diferentes simultaneamente', () => {
  resetState();
  const duel = makeDuel();
  addTrap(duel, 'DNA_SURGERY', 0, 0, 'Fiend', 10);
  addTrap(duel, 'DNA_TRANSPLANT', 1, 1, 'DARK', 11);
  const target = addMonster(duel, 'Warrior', 2, 0);
  const result = adapter.getDnaConversion(duel, target);
  assert.equal(result.race, 'Fiend');
  assert.equal(result.attribute, 'DARK');
  assert.equal(result.activeSources, 2);
});

test('declarações afetam monstros do outro time e não dependem do controlador', () => {
  resetState();
  const duel = makeDuel();
  addTrap(duel, 'DNA_SURGERY', 0, 0, 'Dragon', 1);
  const opponent = addMonster(duel, 'Warrior', 1, 1);
  assert.equal(adapter.getDnaConversion(duel, opponent).race, 'Dragon');
});

test('DNA face-down não aplica declaração', () => {
  resetState();
  const duel = makeDuel();
  addTrap(duel, 'DNA_SURGERY', 0, 0, 'Machine', 1, false);
  const target = addMonster(duel, 'Warrior', 2, 0);
  assert.equal(adapter.getDnaConversion(duel, target).race, 'Warrior');
  assert.equal(adapter.getDnaConversion(duel, target).activeSources, 0);
});

test('DNA ainda não resolvida não aplica declaração', () => {
  resetState();
  const duel = makeDuel();
  addTrap(duel, 'DNA_TRANSPLANT', 0, 0, 'LIGHT', 1, true, false);
  const target = addMonster(duel, 'Warrior', 2, 0);
  assert.equal(adapter.getDnaConversion(duel, target).attribute,
    getDuelCard(raceFixtureIds.Warrior).attribute);
});

test('negação remove a fonte sem apagar outras declarações', () => {
  resetState();
  const duel = makeDuel();
  const surgery = addTrap(duel, 'DNA_SURGERY', 0, 0, 'Machine', 1);
  addTrap(duel, 'DNA_TRANSPLANT', 1, 1, 'DARK', 2);
  negated.add(surgery);
  const target = addMonster(duel, 'Warrior', 2, 0);
  const result = adapter.getDnaConversion(duel, target);
  assert.equal(result.race, 'Warrior');
  assert.equal(result.attribute, 'DARK');
  assert.equal(result.activeSources, 1);
});

test('a declaração de DNA Surgery mais recentemente ativada prevalece', () => {
  resetState();
  const duel = makeDuel();
  addTrap(duel, 'DNA_SURGERY', 0, 0, 'Machine', 10);
  const latest = addTrap(duel, 'DNA_SURGERY', 2, 1, 'Fiend', 20);
  const target = addMonster(duel, 'Warrior', 1, 1);
  const result = adapter.getDnaConversion(duel, target);
  assert.equal(result.race, 'Fiend');
  assert.equal(result.raceSourceUid, latest);
  assert.equal(result.activeSources, 2);
});

test('a declaração de DNA Transplant mais recentemente ativada prevalece', () => {
  resetState();
  const duel = makeDuel();
  addTrap(duel, 'DNA_TRANSPLANT', 0, 0, 'WATER', 10);
  const latest = addTrap(duel, 'DNA_TRANSPLANT', 2, 1, 'LIGHT', 20);
  const target = addMonster(duel, 'Warrior', 1, 1);
  const result = adapter.getDnaConversion(duel, target);
  assert.equal(result.attribute, 'LIGHT');
  assert.equal(result.attributeSourceUid, latest);
});

test('ordens empatadas para a mesma propriedade são rejeitadas', () => {
  resetState();
  const duel = makeDuel();
  addTrap(duel, 'DNA_SURGERY', 0, 0, 'Machine', 10);
  addTrap(duel, 'DNA_SURGERY', 2, 1, 'Fiend', 10);
  const target = addMonster(duel, 'Warrior', 1, 1);
  assert.throws(() => adapter.getDnaConversion(duel, target), /ambígua/);
});

test('substituir uma armadilha contínua troca sua declaração física', () => {
  resetState();
  const duel = makeDuel();
  const first = addTrap(duel, 'DNA_SURGERY', 0, 0, 'Machine', 1);
  const target = addMonster(duel, 'Warrior', 2, 0);
  assert.equal(adapter.getDnaConversion(duel, target).race, 'Machine');
  sendBackrowToOwnerGrave(duel, 0, first, fixtureIds.DNA_SURGERY);
  const replacement = addTrap(duel, 'DNA_SURGERY', 2, 0, 'Fiend', 2);
  const result = adapter.getDnaConversion(duel, target);
  assert.equal(result.race, 'Fiend');
  assert.equal(result.raceSourceUid, replacement);
});

test('remover DNA Surgery encerra o override e conserva a carta no Cemitério', () => {
  resetState();
  const duel = makeDuel();
  const source = addTrap(duel, 'DNA_SURGERY', 0, 0, 'Machine', 1);
  const target = addMonster(duel, 'Warrior', 2, 0);
  sendBackrowToOwnerGrave(duel, 0, source, fixtureIds.DNA_SURGERY);
  const result = adapter.getDnaConversion(duel, target);
  assert.equal(result.race, 'Warrior');
  assert.equal(result.activeSources, 0);
});

test('monstro face-down não revela Raça nem Atributo para o adapter', () => {
  resetState();
  const duel = makeDuel();
  addTrap(duel, 'DNA_SURGERY', 0, 0, 'Machine', 1);
  const hidden = addMonster(duel, 'Warrior', 2, 0, false);
  let targetLookups = 0;
  const guardedLookup = id => {
    if (id === raceFixtureIds.Warrior) targetLookups++;
    return lookup(id);
  };
  const guarded = adapterFor(guardedLookup);
  const result = guarded.getDnaConversion(duel, hidden);
  assert.equal(result.race, 'UNKNOWN');
  assert.equal(result.attribute, 'UNKNOWN');
  assert.equal(targetLookups, 0);
});

test('declaração fora da lista oficial é rejeitada', () => {
  resetState();
  const duel = makeDuel();
  addTrap(duel, 'DNA_SURGERY', 0, 0, 'Invalid Race', 1);
  const target = addMonster(duel, 'Warrior', 2, 0);
  assert.throws(() => adapter.getDnaConversion(duel, target), /Declaração inválida/);
});

test('ordem de ativação ausente é rejeitada em vez de escolher uma fonte arbitrária', () => {
  resetState();
  const duel = makeDuel();
  addTrap(duel, 'DNA_TRANSPLANT', 0, 0, 'LIGHT', 1);
  const target = addMonster(duel, 'Warrior', 2, 0);
  const missingOrder = adapterFor(lookup, () => undefined);
  assert.throws(() => missingOrder.getDnaConversion(duel, target), /Ordem de ativação ausente/);
});

test('consulta não altera inventário, UIDs nem zonas privadas', () => {
  resetState();
  const duel = makeDuel();
  addTrap(duel, 'DNA_SURGERY', 0, 0, 'Machine', 1);
  const target = addMonster(duel, 'Warrior', 2, 0);
  const before = JSON.stringify(duel);
  const cards = inventory(duel);
  assert.equal(adapter.getDnaConversion(duel, target).race, 'Machine');
  assert.deepEqual(inventory(duel), cards);
  assert.equal(JSON.stringify(duel), before);
});

test('mão acima de seis permanece intacta até a End Phase', () => {
  resetState();
  const duel = makeDuel();
  addTrap(duel, 'DNA_SURGERY', 0, 0, 'Machine', 1);
  const target = addMonster(duel, 'Warrior', 2, 0);
  while (duel.core.players[0].hand.length < 7) {
    duel.core.players[0].hand.push(duel.core.players[0].deck.shift());
  }
  const before = duel.core.players[0].hand.map(card => card.uid);
  assert.equal(adapter.getDnaConversion(duel, target).race, 'Machine');
  assert.deepEqual(duel.core.players[0].hand.map(card => card.uid), before);
  assert.equal(duel.core.players[0].hand.length, 7);
});

test('três zonas de armadilha continuam independentes da Field Zone e das três Monster Zones', () => {
  resetState();
  const duel = makeDuel(2, MAX_DECK);
  const fieldCard = takeFromSeat(duel, 2, ref => ref.id === '86318356');
  duel.core.players[0].field = { ...fieldCard, setTurn: 0, faceUp: true, resolved: true };
  addTrap(duel, 'DNA_SURGERY', 0, 0, 'Machine', 1);
  addTrap(duel, 'DNA_TRANSPLANT', 0, 0, 'DARK', 2);
  addTrap(duel, 'DNA_SURGERY', 1, 1, 'Fiend', 3);
  addTrap(duel, 'DNA_TRANSPLANT', 3, 1, 'WATER', 4);
  addTrap(duel, 'DNA_SURGERY', 3, 1, 'Beast', 5);
  const target = addMonster(duel, 'Warrior', 0, 0);
  assert.equal(adapter.getDnaConversion(duel, target).race, 'Beast');
  assert.equal(duel.core.players[0].backrow.length, 2);
  assert.equal(duel.core.players[1].backrow.length, 3);
  assert.equal(duel.core.players[0].field.id, '86318356');
  addTrap(duel, 'DNA_TRANSPLANT', 1, 1, 'LIGHT', 6);
  assert.throws(() => adapter.getDnaConversion(duel, target));
});

test('Deck Principal 20/30 e Deck Adicional máximo de cinco são respeitados', () => {
  resetState();
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK));
  assert.doesNotThrow(() => makeDuel(2, MAX_DECK));
  assert.throws(() => makeDuel(2, BASE_DECK.slice(1)));
  assert.throws(() => makeDuel(2, [...MAX_DECK, NORMAL_FILLER_IDS[0]]));
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 5) }));
  assert.throws(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 6) }));
});

test('IDs duplicados/inválidos e metadados não-Trap são rejeitados', () => {
  resetState();
  assert.throws(() => createDnaConversionTagAdapter({ DNA_SURGERY: '' }));
  assert.throws(() => createDnaConversionTagAdapter({
    DNA_SURGERY: fixtureIds.DNA_SURGERY,
    DNA_TRANSPLANT: fixtureIds.DNA_SURGERY,
  }));
  const duel = makeDuel();
  addTrap(duel, 'DNA_SURGERY', 0, 0, 'Machine', 1);
  const target = addMonster(duel, 'Warrior', 2, 0);
  const invalidLookup = id => {
    const info = lookup(id);
    return id === fixtureIds.DNA_SURGERY ? { ...info, kind: 'spell' } : info;
  };
  assert.throws(() => adapterFor(invalidLookup).getDnaConversion(duel, target));
});
