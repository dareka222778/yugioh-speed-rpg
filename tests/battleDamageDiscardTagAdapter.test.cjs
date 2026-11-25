const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  WHITE_MAGICAL_HAT_ID,
  ROBBIN_GOBLIN_ID,
  createBattleDamageDiscardAdapter,
} = require('../dist/battleDamageDiscardTagAdapter.js');

const EFFECT_IDS = enabledCardIds.filter(id => {
  const card = getDuelCard(id);
  return card?.kind === 'monster' && card.monsterType === 'effect' && !card.fusion;
});
const TRAP_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'trap').slice(0, 3);
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
const BASE_DECK = [
  ...NORMAL_IDS.slice(0, 14),
  EFFECT_IDS[0], EFFECT_IDS[1],
  ...SPELL_IDS,
  TRAP_IDS[0], TRAP_IDS[0],
];
const MAX_DECK = [
  ...NORMAL_IDS.slice(0, 26),
  EFFECT_IDS[0], EFFECT_IDS[1],
  SPELL_IDS[0], TRAP_IDS[0],
];
assert.ok(EFFECT_IDS.length >= 2, 'fixtures require two enabled effect monsters');
assert.ok(TRAP_IDS.length >= 2, 'fixtures require two enabled Traps');
assert.equal(SPELL_IDS.length, 2, 'fixtures require two enabled Spells');
assert.ok(NORMAL_IDS.length >= 26, 'fixtures require 26 distinct Normal Monster names');
assert.equal(BASE_DECK.length, 20);
assert.equal(MAX_DECK.length, 30);

const WHITE_FIXTURE_ID = EFFECT_IDS[0];
const ATTACKER_FIXTURE_ID = EFFECT_IDS[1];
const ROBBIN_FIXTURE_ID = TRAP_IDS[0];
const adapter = createBattleDamageDiscardAdapter(WHITE_FIXTURE_ID, ROBBIN_FIXTURE_ID);

function makeDuel(first = 2, deck = BASE_DECK, extraBySeat = {}) {
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...deck],
    extra: [...(extraBySeat[i] || [])],
  }));
  const duel = createTagDuel(players, {
    seed: 'm606-battle-damage-discard',
    first,
    classic: true,
  });
  duel.core.phase = 'response';
  duel.core.resume = 'battle';
  return duel;
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

function addMonster(duel, id, ownerSeat, controllerTeam) {
  const card = takeFromSeat(duel, ownerSeat, ref => ref.id === id);
  duel.core.players[controllerTeam].monsters.push({
    ...card,
    owner: ownerSeat % 2,
    position: 'atk',
    faceUp: true,
    entered: duel.core.turn,
    changed: duel.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  });
  return card.uid;
}

function addAnyMonster(duel, ownerSeat, controllerTeam) {
  const card = takeFromSeat(duel, ownerSeat, ref => {
    const info = getDuelCard(ref.id);
    return info?.kind === 'monster' && !info.fusion;
  });
  duel.core.players[controllerTeam].monsters.push({
    ...card,
    owner: ownerSeat % 2,
    position: 'atk',
    faceUp: true,
    entered: duel.core.turn,
    changed: duel.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  });
  return card.uid;
}

function addTrap(duel, id, ownerSeat, controllerTeam, faceUp = true) {
  const card = takeFromSeat(duel, ownerSeat, ref => ref.id === id);
  duel.core.players[controllerTeam].backrow.push({
    ...card,
    setTurn: 0,
    faceUp,
  });
  return card.uid;
}

function addAnyBackrow(duel, ownerSeat, controllerTeam) {
  const card = takeFromSeat(duel, ownerSeat, ref => {
    const kind = getDuelCard(ref.id)?.kind;
    return kind === 'spell' || kind === 'trap';
  });
  duel.core.players[controllerTeam].backrow.push({ ...card, setTurn: 0, faceUp: false });
  return card.uid;
}

function moveMonsterToOwnerGrave(duel, uid, controllerTeam) {
  const index = duel.core.players[controllerTeam].monsters.findIndex(monster => monster.uid === uid);
  assert.ok(index >= 0, 'source monster must still be on the field');
  const [monster] = duel.core.players[controllerTeam].monsters.splice(index, 1);
  const ownerTeam = Number(monster.uid.match(/^m([0-3]):/)[1]) % 2;
  duel.core.players[ownerTeam].grave.push({ uid: monster.uid, id: monster.id });
  synchronizeCardLifetimes(duel.core);
}

function eventFor(duel, attackerUid, attackerId, patch = {}) {
  return {
    kind: 'battle-damage-to-opponent',
    eventId: 'm606:' + duel.core.turn + ':' + attackerUid,
    turn: duel.core.turn,
    controllerTeam: duel.core.current,
    attackerUid,
    attackerId,
    attackerControllerTeam: duel.core.current,
    attackerWasFaceUp: true,
    battleDamage: 300,
    cause: 'battle',
    damageStepComplete: true,
    ...patch,
  };
}

function inventory(duel) {
  return tagInventory(duel)
    .map(card => [card.uid, card.id])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function fillHand(duel, seat, size) {
  const hand = privateZone(duel, seat, 'hand');
  const deck = privateZone(duel, seat, 'deck');
  while (hand.length < size) {
    const card = deck.shift();
    assert.ok(card, 'fixture deck must contain enough cards');
    hand.push(card);
  }
  return hand;
}

test('White Magical Hat descarta uma carta aleatória da mão privada do representante adversário ativo', () => {
  const duel = makeDuel(2);
  const sourceUid = addMonster(duel, WHITE_FIXTURE_ID, 1, 0);
  const event = eventFor(duel, sourceUid, WHITE_FIXTURE_ID);
  const plan = adapter.planWhiteMagicalHat(duel, event);
  assert.equal(plan.effect, 'white-magical-hat');
  assert.equal(plan.opponentTeam, 1);
  assert.equal(plan.opponentActiveSeat, 3);

  const activeHand = privateZone(duel, 3, 'hand');
  const inactivePartnerHand = privateZone(duel, 1, 'hand');
  const activeBefore = [...activeHand];
  const partnerBefore = [...inactivePartnerHand];
  const chosen = activeBefore[2];
  const before = inventory(duel);

  const result = adapter.resolve(duel, plan, { randomIndex: length => Math.min(2, length - 1) });
  assert.equal(result.status, 'discarded');
  assert.equal(result.discardedUid, chosen.uid);
  assert.equal(result.discardedOwnerSeat, 3);
  assert.ok(!privateZone(result.state, 3, 'hand').some(card => card.uid === chosen.uid));
  assert.deepEqual(privateZone(result.state, 1, 'hand'), partnerBefore);
  assert.ok(result.state.core.players[1].grave.some(card => card.uid === chosen.uid));
  assert.deepEqual(inventory(result.state), before);
});

test('White Magical Hat continua resolvendo se a fonte sair do campo após o dano', () => {
  const duel = makeDuel(2);
  const sourceUid = addMonster(duel, WHITE_FIXTURE_ID, 1, 0);
  const plan = adapter.planWhiteMagicalHat(duel, eventFor(duel, sourceUid, WHITE_FIXTURE_ID));
  moveMonsterToOwnerGrave(duel, sourceUid, 0);
  const before = inventory(duel);
  const result = adapter.resolve(duel, plan, { randomIndex: () => 0 });
  assert.equal(result.status, 'discarded');
  assert.ok(result.state.core.players[1].grave.some(card => card.uid === sourceUid));
  assert.deepEqual(inventory(result.state), before);
});

test('White Magical Hat aceita a fonte já no Cemitério físico após o dano de batalha', () => {
  const duel = makeDuel(2);
  const sourceUid = addMonster(duel, WHITE_FIXTURE_ID, 1, 0);
  moveMonsterToOwnerGrave(duel, sourceUid, 0);
  const plan = adapter.planWhiteMagicalHat(duel, eventFor(duel, sourceUid, WHITE_FIXTURE_ID));
  assert.equal(plan.sourceOwnerSeat, 1);
  assert.equal(plan.controllerTeam, 0);
});

test('White Magical Hat rejeita dano de efeito, dano zero, Damage Step incompleto, equipe/turno incorretos', () => {
  const duel = makeDuel(2);
  const sourceUid = addMonster(duel, WHITE_FIXTURE_ID, 1, 0);
  const valid = eventFor(duel, sourceUid, WHITE_FIXTURE_ID);
  for (const patch of [
    { cause: 'effect' },
    { battleDamage: 0 },
    { damageStepComplete: false },
    { attackerWasFaceUp: false },
    { controllerTeam: 1 },
    { attackerControllerTeam: 1 },
    { turn: duel.core.turn + 1 },
  ]) {
    assert.throws(() => adapter.planWhiteMagicalHat(duel, { ...valid, ...patch }));
  }
  assert.throws(() => adapter.planWhiteMagicalHat(duel, eventFor(duel, sourceUid, ATTACKER_FIXTURE_ID)));
});

test('Robbin Goblin reage a qualquer monstro da equipe e descarta uma carta sem selecionar alvo', () => {
  const duel = makeDuel(2);
  const trapUid = addTrap(duel, ROBBIN_FIXTURE_ID, 2, 0, true);
  const attackerUid = addMonster(duel, ATTACKER_FIXTURE_ID, 2, 0);
  const event = eventFor(duel, attackerUid, ATTACKER_FIXTURE_ID);
  const plan = adapter.planRobbinGoblin(duel, event, trapUid);
  assert.equal(plan.effect, 'robbin-goblin');
  assert.notEqual(plan.sourceUid, plan.attackerUid);

  const activeHand = privateZone(duel, 3, 'hand');
  const chosen = activeHand[activeHand.length - 1];
  const before = inventory(duel);
  const result = adapter.resolve(duel, plan, { randomIndex: length => length - 1 });
  assert.equal(result.status, 'discarded');
  assert.equal(result.discardedUid, chosen.uid);
  assert.ok(result.state.core.players[1].grave.some(card => card.uid === chosen.uid));
  assert.deepEqual(inventory(result.state), before);
});

test('cada cópia face-up de Robbin Goblin gera seu próprio recibo para o mesmo evento de batalha', () => {
  const duel = makeDuel(2);
  const firstTrap = addTrap(duel, ROBBIN_FIXTURE_ID, 2, 0, true);
  const secondTrap = addTrap(duel, ROBBIN_FIXTURE_ID, 0, 0, true);
  const attackerUid = addMonster(duel, ATTACKER_FIXTURE_ID, 2, 0);
  const event = eventFor(duel, attackerUid, ATTACKER_FIXTURE_ID);
  const firstPlan = adapter.planRobbinGoblin(duel, event, firstTrap);
  const secondPlan = adapter.planRobbinGoblin(duel, event, secondTrap);
  assert.notEqual(firstPlan.activationId, secondPlan.activationId);

  const first = adapter.resolve(duel, firstPlan, { randomIndex: () => 0 });
  const second = adapter.resolve(first.state, secondPlan, { randomIndex: () => 0 });
  assert.equal(first.status, 'discarded');
  assert.equal(second.status, 'discarded');
  assert.equal(second.state.battleDamageDiscard.resolvedActivationIds.length, 2);
});

test('Robbin Goblin não resolve se deixar o campo antes da resolução', () => {
  const duel = makeDuel(2);
  const trapUid = addTrap(duel, ROBBIN_FIXTURE_ID, 2, 0, true);
  const attackerUid = addMonster(duel, ATTACKER_FIXTURE_ID, 2, 0);
  const plan = adapter.planRobbinGoblin(duel, eventFor(duel, attackerUid, ATTACKER_FIXTURE_ID), trapUid);
  const index = duel.core.players[0].backrow.findIndex(card => card.uid === trapUid);
  const [trap] = duel.core.players[0].backrow.splice(index, 1);
  duel.core.players[0].grave.push({ uid: trap.uid, id: trap.id });
  synchronizeCardLifetimes(duel.core);

  const handBefore = [...privateZone(duel, 3, 'hand')];
  const result = adapter.resolve(duel, plan, { randomIndex: () => 0 });
  assert.equal(result.status, 'source-left-field');
  assert.deepEqual(privateZone(result.state, 3, 'hand'), handBefore);
});

test('negação, mão vazia e recibo duplicado não descartam carta nem criam inventário', () => {
  const duel = makeDuel(2);
  const trapUid = addTrap(duel, ROBBIN_FIXTURE_ID, 2, 0, true);
  const attackerUid = addMonster(duel, ATTACKER_FIXTURE_ID, 2, 0);
  const plan = adapter.planRobbinGoblin(duel, eventFor(duel, attackerUid, ATTACKER_FIXTURE_ID), trapUid);
  const before = inventory(duel);

  const negated = adapter.resolve(duel, plan, { effectNegated: true, randomIndex: () => 0 });
  assert.equal(negated.status, 'negated');
  assert.deepEqual(inventory(negated.state), before);
  const duplicate = adapter.resolve(negated.state, plan, { randomIndex: () => 0 });
  assert.equal(duplicate.status, 'duplicate');
  assert.deepEqual(inventory(duplicate.state), before);

  const empty = makeDuel(2);
  const emptyTrap = addTrap(empty, ROBBIN_FIXTURE_ID, 2, 0, true);
  const emptyAttacker = addMonster(empty, ATTACKER_FIXTURE_ID, 2, 0);
  const emptyPlan = adapter.planRobbinGoblin(empty, eventFor(empty, emptyAttacker, ATTACKER_FIXTURE_ID), emptyTrap);
  const activeHand = privateZone(empty, 3, 'hand');
  const deck = privateZone(empty, 3, 'deck');
  deck.push(...activeHand.splice(0));
  const partnerBefore = [...privateZone(empty, 1, 'hand')];
  const noCard = adapter.resolve(empty, emptyPlan, { randomIndex: () => 0 });
  assert.equal(noCard.status, 'no-card');
  assert.deepEqual(privateZone(noCard.state, 1, 'hand'), partnerBefore);
});

test('o descarte por efeito não antecipa nem substitui o limite de seis cartas da End Phase', () => {
  const duel = makeDuel(2);
  const trapUid = addTrap(duel, ROBBIN_FIXTURE_ID, 2, 0, true);
  const attackerUid = addMonster(duel, ATTACKER_FIXTURE_ID, 2, 0);
  const plan = adapter.planRobbinGoblin(duel, eventFor(duel, attackerUid, ATTACKER_FIXTURE_ID), trapUid);
  fillHand(duel, 3, 8);
  assert.equal(privateZone(duel, 3, 'hand').length, 8);

  const result = adapter.resolve(duel, plan, { randomIndex: () => 0 });
  assert.equal(result.status, 'discarded');
  assert.equal(privateZone(result.state, 3, 'hand').length, 7,
    'o adapter descarta somente uma carta do efeito; a regra de mão 6 continua na End Phase');
});

test('índice aleatório inválido falha sem modificar o estado de entrada', () => {
  const duel = makeDuel(2);
  const trapUid = addTrap(duel, ROBBIN_FIXTURE_ID, 2, 0, true);
  const attackerUid = addMonster(duel, ATTACKER_FIXTURE_ID, 2, 0);
  const plan = adapter.planRobbinGoblin(duel, eventFor(duel, attackerUid, ATTACKER_FIXTURE_ID), trapUid);
  const before = JSON.stringify(duel);
  assert.throws(() => adapter.resolve(duel, plan, { randomIndex: () => 999 }));
  assert.equal(JSON.stringify(duel), before);
});

test('respeita 3+3 zonas, Main Deck 20–30 e Extra Deck máximo 5 por assento', { skip: FUSION_IDS.length < 6 }, () => {
  const duel = makeDuel(2);
  const trapUid = addTrap(duel, ROBBIN_FIXTURE_ID, 2, 0, true);
  const attackerUid = addMonster(duel, ATTACKER_FIXTURE_ID, 2, 0);
  addAnyMonster(duel, 0, 0);
  addAnyMonster(duel, 2, 0);
  addAnyBackrow(duel, 0, 0);
  addAnyBackrow(duel, 2, 0);
  const event = eventFor(duel, attackerUid, ATTACKER_FIXTURE_ID);
  assert.ok(adapter.planRobbinGoblin(duel, event, trapUid));

  const fourthMonster = structuredClone(duel);
  addAnyMonster(fourthMonster, 0, 0);
  assert.throws(() => adapter.planRobbinGoblin(fourthMonster, eventFor(fourthMonster, attackerUid, ATTACKER_FIXTURE_ID), trapUid));

  const fourthBackrow = structuredClone(duel);
  addAnyBackrow(fourthBackrow, 0, 0);
  assert.throws(() => adapter.planRobbinGoblin(fourthBackrow, eventFor(fourthBackrow, attackerUid, ATTACKER_FIXTURE_ID), trapUid));

  const shortDeck = makeDuel(2);
  const shortTrap = addTrap(shortDeck, ROBBIN_FIXTURE_ID, 2, 0, true);
  const shortAttacker = addMonster(shortDeck, ATTACKER_FIXTURE_ID, 2, 0);
  privateZone(shortDeck, 1, 'deck').pop();
  assert.throws(() => adapter.planRobbinGoblin(shortDeck, eventFor(shortDeck, shortAttacker, ATTACKER_FIXTURE_ID), shortTrap));

  const extraFive = makeDuel(2, BASE_DECK, { 1: FUSION_IDS.slice(0, 5) });
  const extraTrap = addTrap(extraFive, ROBBIN_FIXTURE_ID, 2, 0, true);
  const extraAttacker = addMonster(extraFive, ATTACKER_FIXTURE_ID, 2, 0);
  const extraEvent = eventFor(extraFive, extraAttacker, ATTACKER_FIXTURE_ID);
  assert.ok(adapter.planRobbinGoblin(extraFive, extraEvent, extraTrap));
  extraFive.reserves[1].extra.push({ uid: 'm1:m606-extra-overflow', id: FUSION_IDS[5] });
  assert.throws(() => adapter.planRobbinGoblin(extraFive, extraEvent, extraTrap));

  const maxDeck = makeDuel(2, MAX_DECK);
  const maxTrap = addTrap(maxDeck, ROBBIN_FIXTURE_ID, 2, 0, true);
  const maxAttacker = addMonster(maxDeck, ATTACKER_FIXTURE_ID, 2, 0);
  assert.ok(adapter.planRobbinGoblin(maxDeck, eventFor(maxDeck, maxAttacker, ATTACKER_FIXTURE_ID), maxTrap));
});

test('adapters de produção permanecem presos aos passcodes oficiais', () => {
  assert.equal(WHITE_MAGICAL_HAT_ID, '15150365');
  assert.equal(ROBBIN_GOBLIN_ID, '88279736');
});
