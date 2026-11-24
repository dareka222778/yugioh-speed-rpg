const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const {
  UNHAPPY_MAIDEN_ID,
  createUnhappyMaidenAdapter,
  planUnhappyMaidenBattlePhaseEnd,
} = require('../dist/unhappyMaidenBattlePhaseEndTagAdapter.js');

const FIXTURE_ID = enabledCardIds.find(id => {
  const card = getDuelCard(id);
  return card?.kind === 'monster' && card.monsterType === 'effect' && !card.fusion;
});
const SPELL_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'spell').slice(0, 2);
const TRAP_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'trap').slice(0, 2);
const FUSION_IDS = enabledCardIds.filter(id => getDuelCard(id)?.fusion);
const BASE_DECK = [
  ...tagNormalCardIds.slice(0, 14),
  FIXTURE_ID, FIXTURE_ID,
  ...SPELL_IDS,
  ...TRAP_IDS,
];
const MAX_DECK = [
  ...tagNormalCardIds.slice(0, 26),
  FIXTURE_ID, FIXTURE_ID,
  SPELL_IDS[0], TRAP_IDS[0],
];
assert.ok(FIXTURE_ID, 'fixture requires an enabled effect monster');
assert.equal(SPELL_IDS.length, 2, 'fixture requires two enabled Spells');
assert.equal(TRAP_IDS.length, 2, 'fixture requires two enabled Traps');
assert.equal(BASE_DECK.length, 20, 'fixture requires a 20-card Main Deck');
assert.equal(MAX_DECK.length, 30, 'fixture requires a 30-card Main Deck');

const adapter = createUnhappyMaidenAdapter(FIXTURE_ID);

function makeDuel(first = 0, deck = BASE_DECK, extraBySeat = {}) {
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...deck],
    extra: [...(extraBySeat[i] || [])],
  }));
  const duel = createTagDuel(players, {
    seed: 'm604-unhappy-maiden',
    first,
    classic: true,
  });
  duel.core.phase = 'battle';
  duel.core.resume = 'battle';
  duel.core.pending = { kind: 'none' };
  duel.core.chain = [];
  duel.core.priority = duel.core.current;
  duel.core.passes = 0;
  delete duel.core.damageStep;
  return duel;
}

function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat
    ? duel.core.players[team][zone]
    : duel.reserves[seat][zone];
}

function moveFixtureToGrave(duel, seat) {
  for (const zone of [privateZone(duel, seat, 'hand'), privateZone(duel, seat, 'deck')]) {
    const index = zone.findIndex(card => card.id === FIXTURE_ID);
    if (index >= 0) {
      const [card] = zone.splice(index, 1);
      duel.core.players[seat % 2].grave.push(card);
      return card.uid;
    }
  }
  throw new Error('fixture copy not found in the physical owner hand/deck');
}

function eventFor(duel, seat, sourceUid, activationId = 'm604:' + duel.core.turn + ':' + sourceUid) {
  return {
    kind: 'battle-destroyed',
    activationId,
    sourceUid,
    sourceId: FIXTURE_ID,
    turn: duel.core.turn,
    triggerActorTeam: seat % 2,
    battleTeam: duel.core.current,
    cause: 'battle',
    destination: 'grave',
    damageStepComplete: true,
  };
}

function inventory(duel) {
  return tagInventory(duel)
    .map(card => [card.uid, card.id])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function takeFromSeat(duel, seat, predicate) {
  for (const zone of [privateZone(duel, seat, 'hand'), privateZone(duel, seat, 'deck')]) {
    const index = zone.findIndex(predicate);
    if (index >= 0) return zone.splice(index, 1)[0];
  }
  throw new Error('physical fixture card not found');
}

function addMonster(duel, seat) {
  const card = takeFromSeat(duel, seat, ref => {
    const info = getDuelCard(ref.id);
    return info?.kind === 'monster' && !info.fusion;
  });
  duel.core.players[seat % 2].monsters.push({
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

function addBackrow(duel, seat) {
  const card = takeFromSeat(duel, seat, ref => {
    const info = getDuelCard(ref.id);
    return info?.kind === 'spell' || info?.kind === 'trap';
  });
  duel.core.players[seat % 2].backrow.push({
    ...card,
    setTurn: 0,
    faceUp: false,
  });
}

test('gatilho obrigatório aceita o dono físico inativo mesmo quando a Battle Phase é da equipe oposta', () => {
  const duel = makeDuel(3);
  const sourceUid = moveFixtureToGrave(duel, 2);
  assert.equal(duel.active[0], 0);
  assert.equal(duel.core.current, 1);
  const plan = adapter.plan(duel, eventFor(duel, 2, sourceUid));

  assert.equal(plan.ownerSeat, 2);
  assert.equal(plan.ownerTeam, 0);
  assert.equal(plan.activeSeat, 0);
  assert.equal(plan.battleTeam, 1);
  assert.equal(plan.sourceUid, sourceUid);
  assert.equal(plan.turn, duel.core.turn);
});

test('não aceita envio por efeito, banimento, Damage Step incompleto, equipe errada ou turno obsoleto', () => {
  const duel = makeDuel(0);
  const sourceUid = moveFixtureToGrave(duel, 0);
  const event = eventFor(duel, 0, sourceUid);

  for (const patch of [
    { cause: 'effect' },
    { destination: 'banished' },
    { damageStepComplete: false },
    { triggerActorTeam: 1 },
    { battleTeam: 1 },
    { turn: duel.core.turn + 1 },
  ]) {
    assert.throws(() => adapter.plan(duel, { ...event, ...patch }));
  }

  const notInGrave = makeDuel(0);
  const otherUid = moveFixtureToGrave(notInGrave, 0);
  const source = notInGrave.core.players[0].grave.pop();
  notInGrave.core.players[0].banished.push(source);
  assert.throws(() => adapter.plan(notInGrave, eventFor(notInGrave, 0, otherUid)));
});

test('resolução mantém o pedido pendente sem terminar a Battle Phase dentro da Chain', () => {
  const duel = makeDuel(0);
  const sourceUid = moveFixtureToGrave(duel, 0);
  const plan = adapter.plan(duel, eventFor(duel, 0, sourceUid));
  const source = duel.core.players[0].grave.pop();
  duel.core.players[0].banished.push(source);
  const hand = privateZone(duel, 0, 'hand');
  const deck = privateZone(duel, 0, 'deck');
  hand.push(...deck.splice(0, 3));
  assert.equal(hand.length, 7);

  const before = inventory(duel);
  const result = adapter.resolve(duel, plan);
  assert.equal(result.status, 'resolved');
  assert.equal(result.endBattlePending, true);
  assert.deepEqual(inventory(result.state), before);
  assert.equal(privateZone(result.state, 0, 'hand').length, 7,
    'the adapter must not perform the End Phase discard');
  assert.equal(result.state.core.phase, 'battle');
  assert.equal(result.state.core.pending.kind, 'none');
  assert.deepEqual(
    result.state.unhappyMaidenBattlePhaseEnd.pending.activationIds,
    [plan.activationId],
  );
});

test('negação não pede o fim da Battle Phase e o mesmo recibo não pode resolver duas vezes', () => {
  const duel = makeDuel(0);
  const sourceUid = moveFixtureToGrave(duel, 0);
  const plan = adapter.plan(duel, eventFor(duel, 0, sourceUid));

  const negated = adapter.resolve(duel, plan, true);
  assert.equal(negated.status, 'negated');
  assert.equal(negated.endBattlePending, false);
  assert.equal(negated.state.unhappyMaidenBattlePhaseEnd.pending, undefined);

  const duplicate = adapter.resolve(negated.state, plan, false);
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.endBattlePending, false);
  assert.equal(JSON.stringify(duplicate.state), JSON.stringify(negated.state));
});

test('só solicita o encerramento quando a Chain e todas as filas terminarem', () => {
  const duel = makeDuel(0);
  const sourceUid = moveFixtureToGrave(duel, 0);
  const plan = adapter.plan(duel, eventFor(duel, 0, sourceUid));
  const resolved = adapter.resolve(duel, plan).state;

  const duringResponse = structuredClone(resolved);
  duringResponse.core.phase = 'response';
  assert.equal(adapter.finalizeAfterChain(duringResponse).status, 'waiting-for-chain');

  const ready = structuredClone(resolved);
  ready.core.phase = 'battle';
  ready.core.resume = 'battle';
  ready.core.pending = { kind: 'none' };
  ready.core.chain = [];
  ready.core.passes = 0;
  delete ready.core.damageStep;
  delete ready.core.triggerBuild;
  delete ready.core.choice;
  delete ready.core.handFlow;
  delete ready.core.graveTriggers;
  delete ready.core.summonTriggers;
  delete ready.core.effectFlips;
  delete ready.core.afterEffectFlips;
  delete ready.core.afterMonsterEffect;
  delete ready.core.battleFlip;
  const beforeTurn = ready.core.turn;
  const beforeInventory = inventory(ready);

  const result = adapter.finalizeAfterChain(ready);
  assert.equal(result.status, 'end-requested');
  assert.equal(result.state.core.phase, 'response');
  assert.equal(result.state.core.resume, 'battle');
  assert.equal(result.state.core.pending.kind, 'end');
  assert.equal(result.state.core.priority, result.state.core.current);
  assert.equal(result.state.core.passes, 0);
  assert.equal(result.state.core.turn, beforeTurn);
  assert.equal(result.state.unhappyMaidenBattlePhaseEnd.pending, undefined);
  assert.deepEqual(inventory(result.state), beforeInventory);
  assert.match(result.state.core.log.at(-1), /encerrou a Fase de Batalha/);
});

test('várias Donzelas na mesma Battle Phase coalescem em um único pedido idempotente', () => {
  const duel = makeDuel(0);
  const firstUid = moveFixtureToGrave(duel, 0);
  const secondUid = moveFixtureToGrave(duel, 0);
  const firstPlan = adapter.plan(duel, eventFor(duel, 0, firstUid, 'm604:first'));
  const first = adapter.resolve(duel, firstPlan);
  const secondPlan = adapter.plan(first.state, eventFor(first.state, 0, secondUid, 'm604:second'));
  const second = adapter.resolve(first.state, secondPlan);

  assert.equal(second.status, 'resolved');
  assert.deepEqual(
    second.state.unhappyMaidenBattlePhaseEnd.pending.activationIds,
    ['m604:first', 'm604:second'],
  );
  const final = adapter.finalizeAfterChain(second.state);
  assert.equal(final.status, 'end-requested');
  assert.equal(final.state.core.pending.kind, 'end');
  assert.deepEqual(final.activationIds, ['m604:first', 'm604:second']);
});

test('não repete a transição se a Battle Phase já terminou por outro efeito', () => {
  const duel = makeDuel(0);
  const sourceUid = moveFixtureToGrave(duel, 0);
  const plan = adapter.plan(duel, eventFor(duel, 0, sourceUid));
  const resolved = adapter.resolve(duel, plan).state;
  resolved.core.phase = 'main';
  resolved.core.resume = 'main';

  const result = adapter.finalizeAfterChain(resolved);
  assert.equal(result.status, 'battle-already-ended');
  assert.equal(result.state.unhappyMaidenBattlePhaseEnd.pending, undefined);
});

test('respeita 3+3 zonas, Main Deck 20–30 e Extra Deck máximo 5 por participante', { skip: FUSION_IDS.length < 6 }, () => {
  const duel = makeDuel(0);
  const sourceUid = moveFixtureToGrave(duel, 0);
  for (let i = 0; i < 3; i++) addMonster(duel, 0);
  for (let i = 0; i < 3; i++) addBackrow(duel, 0);
  assert.ok(adapter.plan(duel, eventFor(duel, 0, sourceUid)));

  const fourthMonster = structuredClone(duel);
  addMonster(fourthMonster, 0);
  assert.throws(() => adapter.plan(fourthMonster, eventFor(fourthMonster, 0, sourceUid)));

  const fourthBackrow = structuredClone(duel);
  addBackrow(fourthBackrow, 0);
  assert.throws(() => adapter.plan(fourthBackrow, eventFor(fourthBackrow, 0, sourceUid)));

  const shortDeck = makeDuel(0);
  const shortUid = moveFixtureToGrave(shortDeck, 0);
  privateZone(shortDeck, 3, 'deck').pop();
  assert.throws(() => adapter.plan(shortDeck, eventFor(shortDeck, 0, shortUid)));

  const extraFive = makeDuel(0, BASE_DECK, { 2: FUSION_IDS.slice(0, 5) });
  const extraUid = moveFixtureToGrave(extraFive, 0);
  assert.ok(adapter.plan(extraFive, eventFor(extraFive, 0, extraUid)));
  extraFive.reserves[2].extra.push({ uid: 'm2:m604-extra-overflow', id: FUSION_IDS[5] });
  assert.throws(() => adapter.plan(extraFive, eventFor(extraFive, 0, extraUid)));

  const maxDeck = makeDuel(0, MAX_DECK);
  const maxUid = moveFixtureToGrave(maxDeck, 0);
  assert.ok(adapter.plan(maxDeck, eventFor(maxDeck, 0, maxUid)));
});

test('adapter de produção permanece preso ao passcode oficial 51275027', () => {
  const duel = makeDuel(0);
  const sourceUid = moveFixtureToGrave(duel, 0);
  assert.equal(UNHAPPY_MAIDEN_ID, '51275027');
  assert.throws(() => planUnhappyMaidenBattlePhaseEnd(duel, eventFor(duel, 0, sourceUid)),
    /The Unhappy Maiden|definição|Cemitério|Battle Phase/i);
});
