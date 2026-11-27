const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { atk, def } = require('../dist/duelEngine.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  INJECTION_FAIRY_LILY_ID,
  INJECTION_FAIRY_LILY_LP_COST,
  INJECTION_FAIRY_LILY_ATK_BONUS,
  createInjectionFairyLilyAdapter,
} = require('../dist/injectionFairyLilyDamageCalculationTagAdapter.js');

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
assert.ok(EFFECT_IDS.length >= 2);
assert.ok(TRAP_IDS.length >= 1);
assert.equal(SPELL_IDS.length, 2);
assert.ok(NORMAL_IDS.length >= 26);
assert.equal(BASE_DECK.length, 20);
assert.equal(MAX_DECK.length, 30);

const LILY_FIXTURE_ID = EFFECT_IDS[0];
const OPPONENT_MONSTER_ID = EFFECT_IDS[1];
const adapter = createInjectionFairyLilyAdapter(LILY_FIXTURE_ID);

function makeDuel(first = 2, deck = BASE_DECK, extraBySeat = {}) {
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...deck],
    extra: [...(extraBySeat[i] || [])],
  }));
  const duel = createTagDuel(players, {
    seed: 'm607-injection-fairy-lily',
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

function addMonster(duel, id, ownerSeat, controllerTeam, position = 'atk', faceUp = true) {
  const card = takeFromSeat(duel, ownerSeat, ref => ref.id === id);
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

function addAnyMonster(duel, ownerSeat, controllerTeam) {
  const card = takeFromSeat(duel, ownerSeat, ref => {
    const info = getDuelCard(ref.id);
    return info?.kind === 'monster' && !info.fusion;
  });
  duel.core.players[controllerTeam].monsters.push({
    ...card, owner: ownerSeat % 2, position: 'atk', faceUp: true,
    entered: duel.core.turn, changed: duel.core.turn, attacked: 0, atkBoost: 0, defBoost: 0,
  });
  return card.uid;
}

function addAnyBackrow(duel, ownerSeat, controllerTeam) {
  const card = takeFromSeat(duel, ownerSeat, ref => {
    const kind = getDuelCard(ref.id)?.kind;
    return kind === 'spell' || kind === 'trap';
  });
  duel.core.players[controllerTeam].backrow.push({ ...card, setTurn: 0, faceUp: false });
}

function moveMonsterToOwnerGrave(duel, uid, controllerTeam) {
  const index = duel.core.players[controllerTeam].monsters.findIndex(monster => monster.uid === uid);
  assert.ok(index >= 0);
  const [monster] = duel.core.players[controllerTeam].monsters.splice(index, 1);
  const ownerTeam = Number(monster.uid.match(/^m([0-3]):/)[1]) % 2;
  duel.core.players[ownerTeam].grave.push({ uid: monster.uid, id: monster.id });
  synchronizeCardLifetimes(duel.core);
}

function eventFor(duel, attackerUid, defenderUid, patch = {}) {
  return {
    kind: 'damage-calculation',
    eventId: 'm607-event-' + duel.core.turn + '-' + attackerUid,
    battleId: 'm607-battle-' + duel.core.turn + '-' + attackerUid + '-' + defenderUid,
    turn: duel.core.turn,
    attackerUid,
    attackerTeam: duel.core.current,
    defenderUid,
    defenderTeam: 1 - duel.core.current,
    window: 'damage-calculation',
    ...patch,
  };
}

function inventory(duel) {
  return tagInventory(duel).map(card => [card.uid, card.id]).sort((a, b) => a[0].localeCompare(b[0]));
}

test('Injection Fairy Lily ativa atacando: paga 2000 LP compartilhados e concede +3000 ATK só no cálculo', () => {
  const duel = makeDuel(2);
  const lilyUid = addMonster(duel, LILY_FIXTURE_ID, 1, 0, 'atk', true);
  const defenderUid = addMonster(duel, OPPONENT_MONSTER_ID, 3, 1, 'def', true);
  const event = eventFor(duel, lilyUid, defenderUid);
  const plan = adapter.plan(duel, event, lilyUid);
  assert.equal(plan.controllerTeam, 0);
  assert.equal(plan.activeSeat, 2);
  assert.equal(plan.lpCost, 2000);
  assert.equal(plan.atkBonus, 3000);
  const baseAtk = atk(duel.core.players[0].monsters.find(m => m.uid === lilyUid), duel.core);
  const before = inventory(duel);
  const beforeLP0 = duel.core.players[0].lp;
  const beforeLP1 = duel.core.players[1].lp;

  const activated = adapter.activate(duel, plan);
  assert.equal(activated.status, 'activated');
  assert.equal(activated.lpPaid, 2000);
  assert.equal(activated.state.core.players[0].lp, beforeLP0 - 2000);
  assert.equal(activated.state.core.players[1].lp, beforeLP1);
  const resolved = adapter.resolve(activated.state, plan);
  assert.equal(resolved.status, 'boosted');
  assert.equal(resolved.temporaryAtkBonus, 3000);
  assert.equal(resolved.effectiveAtk, baseAtk + 3000);
  assert.equal(resolved.appliesTo, 'ATK-only');
  const source = resolved.state.core.players[0].monsters.find(m => m.uid === lilyUid);
  assert.equal(source.atkBoost, 0, 'o bônus não pode virar modificador persistente');
  assert.deepEqual(inventory(resolved.state), before);
});

test('Injection Fairy Lily ativa como defensora durante o turno adversário; não aumenta DEF', () => {
  const duel = makeDuel(2);
  const attackerUid = addMonster(duel, OPPONENT_MONSTER_ID, 2, 0, 'atk', true);
  const lilyUid = addMonster(duel, LILY_FIXTURE_ID, 1, 1, 'def', true);
  const event = eventFor(duel, attackerUid, lilyUid);
  const plan = adapter.plan(duel, event, lilyUid);
  assert.equal(plan.controllerTeam, 1);
  assert.equal(plan.activeSeat, 3);
  assert.equal(plan.sourcePosition, 'def');
  const beforeLP = duel.core.players[1].lp;
  const sourceBefore = duel.core.players[1].monsters.find(m => m.uid === lilyUid);
  const baseDef = def(sourceBefore, duel.core);

  const activated = adapter.activate(duel, plan);
  assert.equal(activated.status, 'activated');
  assert.equal(activated.state.core.players[1].lp, beforeLP - 2000);
  const resolved = adapter.resolve(activated.state, plan);
  const sourceAfter = resolved.state.core.players[1].monsters.find(m => m.uid === lilyUid);
  assert.equal(resolved.status, 'boosted');
  assert.equal(resolved.effectiveAtk, plan.baseAtk + 3000);
  assert.equal(def(sourceAfter, resolved.state.core), baseDef);
  assert.equal(resolved.appliesTo, 'ATK-only');
});

test('once per battle, not once per turn: same battle blocks repeat, new battle can activate', () => {
  const duel = makeDuel(2);
  duel.core.players[0].lp = 8000;
  const lilyUid = addMonster(duel, LILY_FIXTURE_ID, 2, 0, 'atk', true);
  const defenderUid = addMonster(duel, OPPONENT_MONSTER_ID, 3, 1, 'atk', true);
  const firstPlan = adapter.plan(duel, eventFor(duel, lilyUid, defenderUid), lilyUid);
  const first = adapter.activate(duel, firstPlan);
  assert.equal(first.status, 'activated');
  const duplicateActivation = adapter.activate(first.state, firstPlan);
  assert.equal(duplicateActivation.status, 'duplicate');
  assert.equal(duplicateActivation.state.core.players[0].lp, 6000);

  const resolved = adapter.resolve(first.state, firstPlan);
  assert.equal(resolved.status, 'boosted');
  assert.equal(adapter.resolve(resolved.state, firstPlan).status, 'duplicate');

  const secondPlan = adapter.plan(
    resolved.state,
    eventFor(resolved.state, lilyUid, defenderUid, {
      eventId: 'm607-second-event',
      battleId: 'm607-second-battle',
    }),
    lilyUid
  );
  const second = adapter.activate(resolved.state, secondPlan);
  assert.equal(second.status, 'activated');
  assert.equal(second.state.core.players[0].lp, 4000);
});

test('custo exige LP estritamente maior que 2000 e nunca paga parcialmente', () => {
  const duel = makeDuel(2);
  const lilyUid = addMonster(duel, LILY_FIXTURE_ID, 2, 0, 'atk', true);
  const defenderUid = addMonster(duel, OPPONENT_MONSTER_ID, 3, 1, 'atk', true);
  const plan = adapter.plan(duel, eventFor(duel, lilyUid, defenderUid), lilyUid);
  duel.core.players[0].lp = 2000;
  const before = inventory(duel);
  const result = adapter.activate(duel, plan);
  assert.equal(result.status, 'insufficient-lp');
  assert.equal(result.lpPaid, 0);
  assert.equal(result.state.core.players[0].lp, 2000);
  assert.equal(result.state.injectionFairyLily, undefined);
  assert.deepEqual(inventory(result.state), before);
});

test('a negação não devolve o custo já pago e não concede o bônus', () => {
  const duel = makeDuel(2);
  const lilyUid = addMonster(duel, LILY_FIXTURE_ID, 2, 0, 'atk', true);
  const defenderUid = addMonster(duel, OPPONENT_MONSTER_ID, 3, 1, 'atk', true);
  const plan = adapter.plan(duel, eventFor(duel, lilyUid, defenderUid), lilyUid);
  const beforeLP = duel.core.players[0].lp;
  const activated = adapter.activate(duel, plan);
  const result = adapter.resolve(activated.state, plan, { effectNegated: true });
  assert.equal(result.status, 'negated');
  assert.equal(result.temporaryAtkBonus, 0);
  assert.equal(result.state.core.players[0].lp, beforeLP - 2000);
  assert.ok(result.state.injectionFairyLily.resolvedActivationIds.includes(plan.activationId));
});

test('se a fonte sair do campo após pagar o custo, não há bônus nem reembolso', () => {
  const duel = makeDuel(2);
  const lilyUid = addMonster(duel, LILY_FIXTURE_ID, 1, 0, 'atk', true);
  const defenderUid = addMonster(duel, OPPONENT_MONSTER_ID, 3, 1, 'atk', true);
  const plan = adapter.plan(duel, eventFor(duel, lilyUid, defenderUid), lilyUid);
  const beforeLP = duel.core.players[0].lp;
  const activated = adapter.activate(duel, plan);
  moveMonsterToOwnerGrave(activated.state, lilyUid, 0);
  const result = adapter.resolve(activated.state, plan);
  assert.equal(result.status, 'source-left-field');
  assert.equal(result.temporaryAtkBonus, 0);
  assert.equal(result.state.core.players[0].lp, beforeLP - 2000);
});

test('evento fora do Damage Calculation, carta não participante, virada para baixo ou turno errado é rejeitado', () => {
  const duel = makeDuel(2);
  const lilyUid = addMonster(duel, LILY_FIXTURE_ID, 2, 0, 'atk', true);
  const defenderUid = addMonster(duel, OPPONENT_MONSTER_ID, 3, 1, 'atk', true);
  const valid = eventFor(duel, lilyUid, defenderUid);
  for (const patch of [
    { window: 'battle' },
    { turn: duel.core.turn + 1 },
    { attackerTeam: 1 },
    { defenderTeam: 0 },
  ]) {
    assert.throws(() => adapter.plan(duel, { ...valid, ...patch }, lilyUid));
  }
  assert.throws(() => adapter.plan(duel, valid, 'm2:not-in-this-battle'));
  const faceDown = makeDuel(2);
  const downUid = addMonster(faceDown, LILY_FIXTURE_ID, 2, 0, 'def', false);
  const otherUid = addMonster(faceDown, OPPONENT_MONSTER_ID, 3, 1, 'atk', true);
  assert.throws(() => adapter.plan(faceDown, eventFor(faceDown, downUid, otherUid), downUid));
  assert.throws(() => adapter.plan(duel, eventFor(duel, lilyUid, defenderUid), defenderUid));
});

test('carta roubada paga LP da equipe controladora, não do dono físico', () => {
  const duel = makeDuel(2);
  const lilyUid = addMonster(duel, LILY_FIXTURE_ID, 1, 0, 'atk', true);
  const defenderUid = addMonster(duel, OPPONENT_MONSTER_ID, 3, 1, 'atk', true);
  const plan = adapter.plan(duel, eventFor(duel, lilyUid, defenderUid), lilyUid);
  assert.equal(plan.sourceOwnerSeat, 1);
  assert.equal(plan.controllerTeam, 0);
  const beforeLP0 = duel.core.players[0].lp;
  const beforeLP1 = duel.core.players[1].lp;
  const result = adapter.activate(duel, plan);
  assert.equal(result.state.core.players[0].lp, beforeLP0 - 2000);
  assert.equal(result.state.core.players[1].lp, beforeLP1);
});

test('mão acima de seis não sofre descarte antecipado durante o cálculo de dano', () => {
  const duel = makeDuel(2);
  const lilyUid = addMonster(duel, LILY_FIXTURE_ID, 2, 0, 'atk', true);
  const defenderUid = addMonster(duel, OPPONENT_MONSTER_ID, 3, 1, 'atk', true);
  const plan = adapter.plan(duel, eventFor(duel, lilyUid, defenderUid), lilyUid);
  const hand = privateZone(duel, 2, 'hand');
  const deck = privateZone(duel, 2, 'deck');
  while (hand.length < 8) hand.push(deck.shift());
  const beforeHand = [...hand];
  const activated = adapter.activate(duel, plan);
  const resolved = adapter.resolve(activated.state, plan);
  assert.deepEqual(privateZone(resolved.state, 2, 'hand'), beforeHand);
  assert.equal(privateZone(resolved.state, 2, 'hand').length, 8);
});

test('respeita 3+3 zonas, Main Deck 20–30 e Extra Deck máximo 5 por assento', { skip: FUSION_IDS.length < 6 }, () => {
  const duel = makeDuel(2);
  const lilyUid = addMonster(duel, LILY_FIXTURE_ID, 2, 0, 'atk', true);
  const defenderUid = addMonster(duel, OPPONENT_MONSTER_ID, 3, 1, 'atk', true);
  addAnyMonster(duel, 0, 0);
  addAnyMonster(duel, 2, 0);
  addAnyBackrow(duel, 0, 0);
  addAnyBackrow(duel, 2, 0);
  addAnyBackrow(duel, 0, 0);
  const event = eventFor(duel, lilyUid, defenderUid);
  assert.ok(adapter.plan(duel, event, lilyUid));

  const fourthMonster = structuredClone(duel);
  addAnyMonster(fourthMonster, 0, 0);
  assert.throws(() => adapter.plan(fourthMonster, eventFor(fourthMonster, lilyUid, defenderUid), lilyUid));

  const fourthBackrow = structuredClone(duel);
  addAnyBackrow(fourthBackrow, 0, 0);
  assert.throws(() => adapter.plan(fourthBackrow, eventFor(fourthBackrow, lilyUid, defenderUid), lilyUid));

  const shortDeck = makeDuel(2);
  const shortLily = addMonster(shortDeck, LILY_FIXTURE_ID, 2, 0, 'atk', true);
  const shortDefender = addMonster(shortDeck, OPPONENT_MONSTER_ID, 3, 1, 'atk', true);
  privateZone(shortDeck, 1, 'deck').pop();
  assert.throws(() => adapter.plan(shortDeck, eventFor(shortDeck, shortLily, shortDefender), shortLily));

  const extraFive = makeDuel(2, BASE_DECK, { 1: FUSION_IDS.slice(0, 5) });
  const extraLily = addMonster(extraFive, LILY_FIXTURE_ID, 2, 0, 'atk', true);
  const extraDefender = addMonster(extraFive, OPPONENT_MONSTER_ID, 3, 1, 'atk', true);
  assert.ok(adapter.plan(extraFive, eventFor(extraFive, extraLily, extraDefender), extraLily));
  extraFive.reserves[1].extra.push({ uid: 'm1:m607-extra-overflow', id: FUSION_IDS[5] });
  assert.throws(() => adapter.plan(extraFive, eventFor(extraFive, extraLily, extraDefender), extraLily));

  const maxDeck = makeDuel(2, MAX_DECK);
  const maxLily = addMonster(maxDeck, LILY_FIXTURE_ID, 2, 0, 'atk', true);
  const maxDefender = addMonster(maxDeck, OPPONENT_MONSTER_ID, 3, 1, 'atk', true);
  assert.ok(adapter.plan(maxDeck, eventFor(maxDeck, maxLily, maxDefender), maxLily));
});

test('passcode oficial e custo/bônus permanecem fixos', () => {
  assert.equal(INJECTION_FAIRY_LILY_ID, '79575620');
  assert.equal(INJECTION_FAIRY_LILY_LP_COST, 2000);
  assert.equal(INJECTION_FAIRY_LILY_ATK_BONUS, 3000);
});
