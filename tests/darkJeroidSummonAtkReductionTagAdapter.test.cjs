const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { atk, def } = require('../dist/duelEngine.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  DARK_JEROID_ATK_REDUCTION,
  createDarkJeroidSummonAtkReductionAdapter,
} = require('../dist/darkJeroidSummonAtkReductionTagAdapter.js');

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
assert.ok(EFFECT_IDS.length >= 2, 'fixtures require two enabled effect monsters');
assert.ok(TRAP_IDS.length >= 1, 'fixtures require an enabled Trap');
assert.equal(SPELL_IDS.length, 2, 'fixtures require two enabled Spells');
assert.ok(NORMAL_IDS.length >= 26, 'fixtures require 26 distinct Normal Monster names');
assert.equal(BASE_DECK.length, 20);
assert.equal(MAX_DECK.length, 30);

const DARK_FIXTURE_ID = EFFECT_IDS[0];
const TARGET_FIXTURE_ID = EFFECT_IDS[1];
const adapter = createDarkJeroidSummonAtkReductionAdapter(DARK_FIXTURE_ID);

function makeDuel(first = 2, deck = BASE_DECK, extraBySeat = {}) {
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...deck],
    extra: [...(extraBySeat[i] || [])],
  }));
  return createTagDuel(players, {
    seed: 'm608-dark-jeroid-summon-atk-reduction',
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

function addAnyBackrow(duel, ownerSeat, controllerTeam) {
  const card = takeFromSeat(duel, ownerSeat, ref => {
    const kind = getDuelCard(ref.id)?.kind;
    return kind === 'spell' || kind === 'trap';
  });
  duel.core.players[controllerTeam].backrow.push({ ...card, setTurn: 0, faceUp: false });
  return card.uid;
}

function eventFor(duel, sourceUid, patch = {}) {
  return {
    kind: 'monster-summoned',
    eventId: 'm608:' + duel.core.turn + ':' + sourceUid,
    turn: duel.core.turn,
    controllerTeam: duel.core.current,
    sourceUid,
    sourceId: DARK_FIXTURE_ID,
    summonKind: 'normal',
    sourceWasFaceUp: true,
    summonSucceeded: true,
    ...patch,
  };
}

function inventory(duel) {
  return tagInventory(duel)
    .map(card => [card.uid, card.id])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function moveMonsterToOwnerGrave(duel, uid, controllerTeam) {
  const index = duel.core.players[controllerTeam].monsters.findIndex(monster => monster.uid === uid);
  assert.ok(index >= 0, 'monster must still be on the field');
  const [monster] = duel.core.players[controllerTeam].monsters.splice(index, 1);
  const ownerTeam = Number(monster.uid.match(/^m([0-3]):/)[1]) % 2;
  duel.core.players[ownerTeam].grave.push({ uid: monster.uid, id: monster.id });
  synchronizeCardLifetimes(duel.core);
}

function returnMonsterFromOwnerGrave(duel, uid, ownerTeam, controllerTeam) {
  const index = duel.core.players[ownerTeam].grave.findIndex(card => card.uid === uid);
  assert.ok(index >= 0, 'monster must be in its physical owner team Graveyard');
  const [card] = duel.core.players[ownerTeam].grave.splice(index, 1);
  duel.core.players[controllerTeam].monsters.push({
    ...card,
    owner: ownerTeam,
    position: 'atk',
    faceUp: true,
    entered: duel.core.turn,
    changed: duel.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  });
  synchronizeCardLifetimes(duel.core);
}

function eventAndSource(first = 2, ownerSeat = 0, controllerTeam = 0) {
  const duel = makeDuel(first);
  const sourceUid = addMonster(duel, DARK_FIXTURE_ID, ownerSeat, controllerTeam);
  return { duel, sourceUid, event: eventFor(duel, sourceUid) };
}

test('Dark Jeroid reduz 800 ATK após Invocação-Normal e a escolha pertence ao representante ativo', () => {
  const { duel, sourceUid, event } = eventAndSource(2, 0, 0);
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 3, 1);
  const target = duel.core.players[1].monsters.find(monster => monster.uid === targetUid);
  const beforeAtk = atk(target, duel.core);
  const beforeDef = def(target, duel.core);
  const beforeInventory = inventory(duel);

  const plan = adapter.plan(duel, event, targetUid);
  assert.equal(plan.selectingSeat, 2);
  assert.equal(plan.sourceOwnerSeat, 0, 'the source may belong to the inactive partner');
  assert.equal(plan.targetTeam, 1);
  const result = adapter.resolve(duel, plan);

  assert.equal(result.status, 'reduced');
  assert.equal(result.targetAtk, Math.max(0, beforeAtk - DARK_JEROID_ATK_REDUCTION));
  assert.equal(result.state.core.players[1].monsters.find(monster => monster.uid === targetUid).atkBoost, -800);
  assert.equal(def(result.state.core.players[1].monsters.find(monster => monster.uid === targetUid), result.state.core), beforeDef);
  assert.deepEqual(inventory(result.state), beforeInventory);
  assert.ok(result.state.core.players[0].monsters.some(monster => monster.uid === sourceUid));
  assert.equal(duel.core.players[1].monsters.find(monster => monster.uid === targetUid).atkBoost, 0, 'input state remains unchanged');
});

test('Dark Jeroid aceita Invocação-Virar e pode escolher a si próprio', () => {
  const { duel, sourceUid, event } = eventAndSource(2, 2, 0);
  const source = duel.core.players[0].monsters.find(monster => monster.uid === sourceUid);
  const beforeAtk = atk(source, duel.core);
  const plan = adapter.plan(duel, { ...event, summonKind: 'flip' }, sourceUid);
  const result = adapter.resolve(duel, plan);
  assert.equal(result.status, 'reduced');
  assert.equal(result.targetAtk, Math.max(0, beforeAtk - 800));
});

test('Dark Jeroid aceita Invocação-Especial e também pode escolher um aliado face-up', () => {
  const { duel, sourceUid, event } = eventAndSource(2, 2, 0);
  const allyUid = addMonster(duel, TARGET_FIXTURE_ID, 0, 0);
  const plan = adapter.plan(duel, { ...event, summonKind: 'special' }, allyUid);
  assert.equal(plan.targetTeam, 0);
  assert.equal(plan.selectingSeat, 2);
  assert.equal(adapter.resolve(duel, plan).status, 'reduced');
  assert.ok(duel.core.players[0].monsters.some(monster => monster.uid === sourceUid));
});

test('Dark Jeroid controlado pela equipe adversária mantém o dono físico e usa o assento ativo controlador', () => {
  const duel = makeDuel(3);
  const sourceUid = addMonster(duel, DARK_FIXTURE_ID, 0, 1);
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 2, 0);
  const event = eventFor(duel, sourceUid, { controllerTeam: 1 });
  const plan = adapter.plan(duel, event, targetUid);
  assert.equal(plan.sourceOwnerSeat, 0);
  assert.equal(plan.controllerTeam, 1);
  assert.equal(plan.selectingSeat, 3);
  assert.equal(adapter.resolve(duel, plan).status, 'reduced');
});

test('Dark Jeroid exige evento de Invocação real, face-up, atual e não negado', () => {
  const { duel, sourceUid, event } = eventAndSource();
  for (const patch of [
    { kind: 'battle-damage-to-opponent' },
    { eventId: '' },
    { turn: duel.core.turn + 1 },
    { controllerTeam: 1 },
    { sourceId: TARGET_FIXTURE_ID },
    { summonKind: 'set' },
    { sourceWasFaceUp: false },
    { summonSucceeded: false },
  ]) {
    assert.throws(() => adapter.plan(duel, { ...event, ...patch }, sourceUid));
  }
});

test('Dark Jeroid rejeita fonte removida, face-down ou UID de outra identidade', () => {
  {
    const { duel, sourceUid, event } = eventAndSource();
    moveMonsterToOwnerGrave(duel, sourceUid, 0);
    assert.throws(() => adapter.plan(duel, event, sourceUid));
  }
  {
    const { duel, sourceUid, event } = eventAndSource();
    duel.core.players[0].monsters.find(monster => monster.uid === sourceUid).faceUp = false;
    assert.throws(() => adapter.plan(duel, event, sourceUid));
  }
  {
    const { duel, sourceUid, event } = eventAndSource();
    assert.throws(() => adapter.plan(duel, { ...event, sourceUid: 'm1:forged' }, sourceUid));
  }
});

test('Dark Jeroid só escolhe monstros face-up e nunca Spell/Trap', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const faceDownUid = addMonster(duel, TARGET_FIXTURE_ID, 3, 1, false);
  assert.throws(() => adapter.plan(duel, event, faceDownUid));
  const backrowUid = addAnyBackrow(duel, 3, 1);
  assert.throws(() => adapter.plan(duel, event, backrowUid));
  assert.ok(duel.core.players[0].monsters.some(monster => monster.uid === sourceUid));
});

test('a redução resolve mesmo se Dark Jeroid sair do campo depois da ativação', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 3, 1);
  const plan = adapter.plan(duel, event, targetUid);
  moveMonsterToOwnerGrave(duel, sourceUid, 0);
  const before = inventory(duel);
  const result = adapter.resolve(duel, plan);
  assert.equal(result.status, 'reduced');
  assert.equal(result.state.core.players[1].monsters.find(monster => monster.uid === targetUid).atkBoost, -800);
  assert.deepEqual(inventory(result.state), before);
});

test('o alvo que sai do campo antes da resolução não recebe a redução', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 3, 1);
  const plan = adapter.plan(duel, event, targetUid);
  moveMonsterToOwnerGrave(duel, targetUid, 1);
  const result = adapter.resolve(duel, plan);
  assert.equal(result.status, 'target-left-field');
  assert.equal(result.state.core.players[1].grave.some(card => card.uid === targetUid), true);
});

test('o vínculo por epoch impede aplicar o efeito a uma nova instância que voltou ao campo', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 3, 1);
  const plan = adapter.plan(duel, event, targetUid);
  moveMonsterToOwnerGrave(duel, targetUid, 1);
  returnMonsterFromOwnerGrave(duel, targetUid, 1, 0);
  const result = adapter.resolve(duel, plan);
  assert.equal(result.status, 'target-left-field');
  assert.equal(result.state.core.players[0].monsters.find(monster => monster.uid === targetUid).atkBoost, 0);
});

test('o alvo que vira face-down antes da resolução não recebe a redução', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 3, 1);
  const plan = adapter.plan(duel, event, targetUid);
  duel.core.players[1].monsters.find(monster => monster.uid === targetUid).faceUp = false;
  const result = adapter.resolve(duel, plan);
  assert.equal(result.status, 'target-no-longer-face-up');
});

test('trocar o controle do alvo não invalida o vínculo físico do mesmo monstro', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 3, 1);
  const plan = adapter.plan(duel, event, targetUid);
  const index = duel.core.players[1].monsters.findIndex(monster => monster.uid === targetUid);
  const [target] = duel.core.players[1].monsters.splice(index, 1);
  duel.core.players[0].monsters.push(target);
  synchronizeCardLifetimes(duel.core);
  const result = adapter.resolve(duel, plan);
  assert.equal(result.status, 'reduced');
  assert.equal(result.state.core.players[0].monsters.find(monster => monster.uid === targetUid).atkBoost, -800);
});

test('negação não reduz ATK e o recibo impede replay', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 3, 1);
  const plan = adapter.plan(duel, event, targetUid);
  const negated = adapter.resolve(duel, plan, { effectNegated: true });
  assert.equal(negated.status, 'negated');
  assert.equal(negated.state.core.players[1].monsters.find(monster => monster.uid === targetUid).atkBoost, 0);
  const replay = adapter.resolve(negated.state, plan);
  assert.equal(replay.status, 'duplicate');
  assert.equal(replay.state.core.players[1].monsters.find(monster => monster.uid === targetUid).atkBoost, 0);
});

test('um evento repetido não aplica duas reduções ao mesmo alvo', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 3, 1);
  const plan = adapter.plan(duel, event, targetUid);
  const first = adapter.resolve(duel, plan);
  const second = adapter.resolve(first.state, plan);
  assert.equal(first.status, 'reduced');
  assert.equal(second.status, 'duplicate');
  assert.equal(second.state.core.players[1].monsters.find(monster => monster.uid === targetUid).atkBoost, -800);
});

test('redução não deixa ATK negativo e não altera DEF', () => {
  const lowAtkId = NORMAL_IDS.find(id => (getDuelCard(id)?.atk ?? 9999) < 800);
  assert.ok(lowAtkId, 'fixture requires a Normal Monster below 800 ATK');
  const { duel, event } = eventAndSource();
  const targetUid = addMonster(duel, lowAtkId, 3, 1);
  const target = duel.core.players[1].monsters.find(monster => monster.uid === targetUid);
  const beforeDef = def(target, duel.core);
  const result = adapter.resolve(duel, adapter.plan(duel, event, targetUid));
  const afterTarget = result.state.core.players[1].monsters.find(monster => monster.uid === targetUid);
  assert.equal(result.status, 'reduced');
  assert.equal(result.targetAtk, 0);
  assert.equal(atk(afterTarget, result.state.core), 0);
  assert.equal(def(afterTarget, result.state.core), beforeDef);
});

test('mão acima de seis não é descartada por este efeito antes da End Phase', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 3, 1);
  for (const seat of [2, 3]) {
    const hand = privateZone(duel, seat, 'hand');
    const deck = privateZone(duel, seat, 'deck');
    while (hand.length < 8) hand.push(deck.shift());
  }
  const beforeHands = [0, 1, 2, 3].map(seat => [...privateZone(duel, seat, 'hand')]);
  const result = adapter.resolve(duel, adapter.plan(duel, event, targetUid));
  assert.equal(result.status, 'reduced');
  for (let seat = 0; seat < 4; seat++) {
    assert.deepEqual(privateZone(result.state, seat, 'hand'), beforeHands[seat]);
  }
});

test('recibos e vínculos sobrevivem a JSON; inventário e UID permanecem conservados', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addMonster(duel, TARGET_FIXTURE_ID, 3, 1);
  const before = inventory(duel);
  const plan = adapter.plan(duel, event, targetUid);
  const first = adapter.resolve(duel, plan);
  const restored = JSON.parse(JSON.stringify(first.state));
  const replay = adapter.resolve(restored, plan);
  assert.equal(replay.status, 'duplicate');
  assert.deepEqual(inventory(replay.state), before);
});

test('regras físicas aceitam Deck 20/30 e Extra 5, rejeitam limites inválidos e preservam 3+3 zonas', () => {
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK));
  assert.doesNotThrow(() => makeDuel(2, MAX_DECK));
  assert.throws(() => makeDuel(2, BASE_DECK.slice(1)));
  assert.throws(() => makeDuel(2, [...MAX_DECK, NORMAL_IDS[26]]));

  assert.ok(FUSION_IDS.length >= 6, 'fixtures require six distinct Fusion names');
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 5) }));
  assert.throws(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 6) }));

  {
    const { duel, event } = eventAndSource();
    addMonster(duel, TARGET_FIXTURE_ID, 3, 1);
    addAnyMonster(duel, 0, 0);
    addAnyMonster(duel, 0, 0);
    assert.doesNotThrow(() => adapter.plan(duel, event, duel.core.players[1].monsters[0].uid));
    addAnyMonster(duel, 0, 0);
    assert.throws(() => adapter.plan(duel, event, duel.core.players[1].monsters[0].uid));
  }
  {
    const { duel, sourceUid, event } = eventAndSource();
    addMonster(duel, TARGET_FIXTURE_ID, 3, 1);
    for (let i = 0; i < 3; i++) addAnyBackrow(duel, 0, 0);
    assert.doesNotThrow(() => adapter.plan(duel, event, duel.core.players[1].monsters[0].uid));
    addAnyBackrow(duel, 0, 0);
    assert.throws(() => adapter.plan(duel, event, duel.core.players[1].monsters[0].uid));
    assert.ok(duel.core.players[0].monsters.some(monster => monster.uid === sourceUid));
  }
});
