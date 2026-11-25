'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createTagDuel,
  tagInventory,
  tagNormalCardIds,
} = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const { createTokenGroup } = require('../dist/tokens.js');
const {
  TSUKUYOMI_ID,
  OTOHIME_ID,
  createTsukuyomiOtohimeTagAdapter,
} = require('../dist/tsukuyomiOtohimeTagAdapter.js');

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
assert.ok(FUSION_IDS.length >= 6, 'fixtures require six distinct Fusion names');
assert.equal(BASE_DECK.length, 20);
assert.equal(MAX_DECK.length, 30);

const TSUKUYOMI_FIXTURE_ID = EFFECT_IDS[0];
const OTOHIME_FIXTURE_ID = EFFECT_IDS[1];
const adapter = createTsukuyomiOtohimeTagAdapter(
  { tsukuyomiId: TSUKUYOMI_FIXTURE_ID, otohimeId: OTOHIME_FIXTURE_ID },
  id => {
    const card = getDuelCard(id);
    return card ? { kind: card.kind, monsterType: card.monsterType } : undefined;
  }
);

function makeDuel(first = 2, deck = BASE_DECK, extraBySeat = {}) {
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm632-seat-' + i,
    name: 'Member ' + i,
    cards: [...deck],
    extra: [...(extraBySeat[i] || [])],
  }));
  return createTagDuel(players, {
    seed: 'm632-tsukuyomi-otohime',
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

function addMonster(duel, id, ownerSeat, controllerTeam, faceUp = true, position = 'atk') {
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

function addAnyMonster(duel, ownerSeat, controllerTeam, excludedUid) {
  const card = takeFromSeat(duel, ownerSeat, ref => {
    if (ref.uid === excludedUid) return false;
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

function addBackrow(duel, ownerSeat, controllerTeam) {
  const card = takeFromSeat(duel, ownerSeat, ref => {
    const kind = getDuelCard(ref.id)?.kind;
    return kind === 'spell' || kind === 'trap';
  });
  duel.core.players[controllerTeam].backrow.push({ ...card, setTurn: 0, faceUp: false });
  return card.uid;
}

function eventFor(duel, sourceUid, sourceId, summonKind = 'normal', patch = {}) {
  const effectFlip = summonKind === 'effect-flip';
  return {
    kind: effectFlip ? 'monster-flipped-face-up' : 'monster-summoned',
    eventId: 'm632:' + duel.core.turn + ':' + sourceUid + ':' + summonKind,
    turn: duel.core.turn,
    controllerTeam: Number(sourceUid.match(/^m([0-3]):/)[1]) % 2,
    sourceUid,
    sourceId,
    summonKind,
    sourceWasFaceUp: true,
    transitionSucceeded: true,
    ...patch,
  };
}

function eventAndSource(cardId = TSUKUYOMI_FIXTURE_ID, ownerSeat = 0, controllerTeam = 0, summonKind = 'normal', first = 2) {
  const duel = makeDuel(first);
  const sourceUid = addMonster(duel, cardId, ownerSeat, controllerTeam, summonKind === 'normal');
  if (summonKind !== 'normal') {
    const source = duel.core.players[controllerTeam].monsters.find(monster => monster.uid === sourceUid);
    source.faceUp = false;
    source.position = 'def';
    source.faceUp = true;
    source.position = summonKind === 'effect-flip' ? 'def' : 'atk';
  }
  return { duel, sourceUid, event: eventFor(duel, sourceUid, cardId, summonKind) };
}

function endPhase(duel, eventId = 'm632:end:' + duel.core.turn) {
  return { kind: 'end-phase', eventId, turn: duel.core.turn };
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

function registerAndPlan(duel, event, targetUid) {
  const registered = adapter.registerSummon(duel, event);
  const planned = adapter.preparePositionEffect(registered.state, event.eventId, targetUid);
  return { registered, planned };
}

test('IDs oficiais, tipos e condição de Invocação-Especial', () => {
  assert.equal(TSUKUYOMI_ID, '34853266');
  assert.equal(OTOHIME_ID, '39751093');
  assert.equal(adapter.canBeSpecialSummoned(TSUKUYOMI_FIXTURE_ID), false);
  assert.equal(adapter.canBeSpecialSummoned(OTOHIME_FIXTURE_ID), false);
  assert.equal(adapter.canBeSpecialSummoned(EFFECT_IDS[2]), true);
});

test('Normal Summon registra o retorno físico na End Phase', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const before = inventory(duel);
  const registered = adapter.registerSummon(duel, event);
  assert.equal(registered.status, 'registered');
  const returned = adapter.resolveEndPhase(registered.state, endPhase(duel));
  assert.equal(returned.results[0].status, 'returned');
  assert.ok(returned.state.reserves[0].hand.some(card => card.uid === sourceUid));
  assert.ok(!returned.state.core.players[0].monsters.some(monster => monster.uid === sourceUid));
  assert.deepEqual(inventory(returned.state), before);
});

test('Flip Summon e virada face-up por efeito registram o retorno no mesmo turno', () => {
  for (const kind of ['flip', 'effect-flip']) {
    const { duel, sourceUid, event } = eventAndSource(TSUKUYOMI_FIXTURE_ID, 0, 0, kind);
    const registered = adapter.registerSummon(duel, event);
    assert.equal(registered.status, 'registered');
    const returned = adapter.resolveEndPhase(registered.state, endPhase(duel, 'm632:end:' + kind));
    assert.equal(returned.results[0].status, 'returned');
    assert.ok(returned.state.reserves[0].hand.some(card => card.uid === sourceUid));
  }
});

test('Invocação-Especial é proibida mesmo com a carta presente no campo', () => {
  const { duel, event } = eventAndSource();
  assert.throws(() => adapter.registerSummon(duel, { ...event, summonKind: 'special' }));
});

test('evento de Invocação obsoleto ou de outra equipe é rejeitado', () => {
  const { duel, event } = eventAndSource();
  assert.throws(() => adapter.registerSummon(duel, { ...event, turn: duel.core.turn + 1 }));
  assert.throws(() => adapter.registerSummon(duel, { ...event, controllerTeam: 1 }));
});

test('Tsukuyomi pode colocar um monstro aliado face-up em Defesa face-down', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const targetUid = addAnyMonster(duel, 2, 0, sourceUid);
  const before = inventory(duel);
  const { planned } = registerAndPlan(duel, event, targetUid);
  assert.equal(planned.status, 'ready');
  const resolved = adapter.resolvePositionEffect(planned.state, planned.plan);
  assert.equal(resolved.status, 'resolved');
  const target = resolved.state.core.players[0].monsters.find(monster => monster.uid === targetUid);
  assert.equal(target.faceUp, false);
  assert.equal(target.position, 'def');
  assert.deepEqual(inventory(resolved.state), before);
});

test('Tsukuyomi também pode colocar um monstro adversário face-up face-down', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addAnyMonster(duel, 1, 1);
  const { planned } = registerAndPlan(duel, event, targetUid);
  assert.equal(planned.status, 'ready');
  const resolved = adapter.resolvePositionEffect(planned.state, planned.plan);
  assert.equal(resolved.status, 'resolved');
  const target = resolved.state.core.players[1].monsters.find(monster => monster.uid === targetUid);
  assert.equal(target.faceUp, false);
  assert.equal(target.position, 'def');
});

test('Tsukuyomi pode escolher a si mesmo; ficar face-down impede o retorno Spirit', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const { planned } = registerAndPlan(duel, event, sourceUid);
  assert.equal(planned.status, 'ready');
  const resolved = adapter.resolvePositionEffect(planned.state, planned.plan);
  assert.equal(resolved.status, 'resolved');
  const source = resolved.state.core.players[0].monsters.find(monster => monster.uid === sourceUid);
  assert.equal(source.faceUp, false);
  const end = adapter.resolveEndPhase(resolved.state, endPhase(resolved.state));
  assert.equal(end.results[0].status, 'face-down');
  assert.ok(end.state.core.players[0].monsters.some(monster => monster.uid === sourceUid));
});

test('Tsukuyomi não escolhe monstro face-down e consome a janela', () => {
  const { duel, event } = eventAndSource();
  const hiddenUid = addMonster(duel, NORMAL_IDS[0], 2, 0, false, 'def');
  const registered = adapter.registerSummon(duel, event);
  const hiddenPlan = adapter.preparePositionEffect(registered.state, event.eventId, hiddenUid);
  assert.equal(hiddenPlan.status, 'no-target');
  const retry = adapter.preparePositionEffect(hiddenPlan.state, event.eventId, hiddenUid);
  assert.equal(retry.status, 'duplicate');
});

test('Tsukuyomi não pode colocar Fichas face-down', () => {
  const { duel, event } = eventAndSource();
  const [token] = createTokenGroup(duel.core, 0, 1);
  const registered = adapter.registerSummon(duel, event);
  const tokenPlan = adapter.preparePositionEffect(registered.state, event.eventId, token.uid);
  assert.equal(tokenPlan.status, 'invalid-target');
});

test('Otohime recusa um monstro aliado como alvo', () => {
  const { duel, event } = eventAndSource(OTOHIME_FIXTURE_ID);
  const ownUid = addAnyMonster(duel, 2, 0);
  const registered = adapter.registerSummon(duel, event);
  const ownPlan = adapter.preparePositionEffect(registered.state, event.eventId, ownUid);
  assert.equal(ownPlan.status, 'invalid-target');
});

test('Otohime aceita um monstro adversário face-up', () => {
  const { duel, event } = eventAndSource(OTOHIME_FIXTURE_ID);
  const enemyUid = addAnyMonster(duel, 1, 1);
  const registered = adapter.registerSummon(duel, event);
  const enemyPlan = adapter.preparePositionEffect(registered.state, event.eventId, enemyUid);
  assert.equal(enemyPlan.status, 'ready');
});

test('Otohime alterna Ataque para Defesa sem virar o alvo face-down', () => {
  const { duel, event } = eventAndSource(OTOHIME_FIXTURE_ID);
  const targetUid = addAnyMonster(duel, 1, 1);
  const { planned } = registerAndPlan(duel, event, targetUid);
  assert.equal(planned.status, 'ready');
  const resolved = adapter.resolvePositionEffect(planned.state, planned.plan);
  assert.equal(resolved.status, 'resolved');
  const target = resolved.state.core.players[1].monsters.find(monster => monster.uid === targetUid);
  assert.equal(target.faceUp, true);
  assert.equal(target.position, 'def');
});

test('Otohime alterna Defesa para Ataque sem virar o alvo face-down', () => {
  const { duel, event } = eventAndSource(OTOHIME_FIXTURE_ID);
  const targetUid = addMonster(duel, NORMAL_IDS[0], 1, 1, true, 'def');
  const { planned } = registerAndPlan(duel, event, targetUid);
  assert.equal(planned.status, 'ready');
  const resolved = adapter.resolvePositionEffect(planned.state, planned.plan);
  const target = resolved.state.core.players[1].monsters.find(monster => monster.uid === targetUid);
  assert.equal(target.faceUp, true);
  assert.equal(target.position, 'atk');
});

test('Otohime muda Defesa face-up para Ataque face-up', () => {
  const { duel, event } = eventAndSource(OTOHIME_FIXTURE_ID);
  const targetUid = addMonster(duel, NORMAL_IDS[0], 1, 1, true, 'def');
  const { planned } = registerAndPlan(duel, event, targetUid);
  assert.equal(planned.status, 'ready');
  const resolved = adapter.resolvePositionEffect(planned.state, planned.plan);
  const target = resolved.state.core.players[1].monsters.find(monster => monster.uid === targetUid);
  assert.equal(target.faceUp, true);
  assert.equal(target.position, 'atk');
});

test('Otohime sem alvo consome a janela, mas mantém o retorno Spirit', () => {
  const { duel, sourceUid, event } = eventAndSource(OTOHIME_FIXTURE_ID);
  const registered = adapter.registerSummon(duel, event);
  const first = adapter.preparePositionEffect(registered.state, event.eventId, undefined);
  assert.equal(first.status, 'no-target');
  const retry = adapter.preparePositionEffect(first.state, event.eventId, sourceUid);
  assert.equal(retry.status, 'duplicate');
  const returned = adapter.resolveEndPhase(first.state, endPhase(first.state));
  assert.equal(returned.results[0].status, 'returned');
});

test('alvo que sai do campo não é substituído na resolução', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addAnyMonster(duel, 1, 1);
  const { planned } = registerAndPlan(duel, event, targetUid);
  moveMonsterToOwnerGrave(planned.state, targetUid, 1);
  const resolved = adapter.resolvePositionEffect(planned.state, planned.plan);
  assert.equal(resolved.status, 'stale-target');
});

test('alvo que sai e retorna ao campo é uma nova instância de zona', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addAnyMonster(duel, 1, 1);
  const { planned } = registerAndPlan(duel, event, targetUid);
  moveMonsterToOwnerGrave(planned.state, targetUid, 1);
  returnMonsterFromOwnerGrave(planned.state, targetUid, 1, 1);
  const resolved = adapter.resolvePositionEffect(planned.state, planned.plan);
  assert.equal(resolved.status, 'stale-target');
});

test('alvo face-down na resolução não recebe o efeito', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addAnyMonster(duel, 1, 1);
  const { planned } = registerAndPlan(duel, event, targetUid);
  const target = planned.state.core.players[1].monsters.find(monster => monster.uid === targetUid);
  target.faceUp = false;
  target.position = 'def';
  const resolved = adapter.resolvePositionEffect(planned.state, planned.plan);
  assert.equal(resolved.status, 'target-face-down');
});

test('a resolução não depende da fonte continuar no campo após ativar', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const targetUid = addAnyMonster(duel, 1, 1);
  const { planned } = registerAndPlan(duel, event, targetUid);
  moveMonsterToOwnerGrave(planned.state, sourceUid, 0);
  const resolved = adapter.resolvePositionEffect(planned.state, planned.plan);
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.state.core.players[1].monsters.find(monster => monster.uid === targetUid).faceUp, false);
});

test('negação na resolução impede a mudança, sem reativar o mesmo evento', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addAnyMonster(duel, 1, 1);
  const { planned } = registerAndPlan(duel, event, targetUid);
  const resolved = adapter.resolvePositionEffect(planned.state, planned.plan, { effectNegated: true });
  assert.equal(resolved.status, 'source-negated');
  const duplicate = adapter.resolvePositionEffect(resolved.state, planned.plan);
  assert.equal(duplicate.status, 'duplicate');
});

test('controle do alvo pode mudar após ativação sem trocar a identidade selecionada', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addAnyMonster(duel, 1, 1);
  const { planned } = registerAndPlan(duel, event, targetUid);
  const index = planned.state.core.players[1].monsters.findIndex(monster => monster.uid === targetUid);
  const [target] = planned.state.core.players[1].monsters.splice(index, 1);
  planned.state.core.players[0].monsters.push(target);
  synchronizeCardLifetimes(planned.state.core);
  const resolved = adapter.resolvePositionEffect(planned.state, planned.plan);
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.state.core.players[0].monsters.find(monster => monster.uid === targetUid).faceUp, false);
});

test('retorno Spirit preserva o proprietário físico após troca de controle', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const registered = adapter.registerSummon(duel, event);
  const index = registered.state.core.players[0].monsters.findIndex(monster => monster.uid === sourceUid);
  const [source] = registered.state.core.players[0].monsters.splice(index, 1);
  registered.state.core.players[1].monsters.push(source);
  synchronizeCardLifetimes(registered.state.core);
  const returned = adapter.resolveEndPhase(registered.state, endPhase(registered.state));
  assert.equal(returned.results[0].status, 'returned');
  assert.ok(returned.state.reserves[0].hand.some(card => card.uid === sourceUid));
  assert.ok(!returned.state.core.players[1].monsters.some(monster => monster.uid === sourceUid));
});

test('proprietário ativo recebe a carta na própria mão privada', () => {
  const { duel, sourceUid, event } = eventAndSource(TSUKUYOMI_FIXTURE_ID, 0, 0, 'normal', 0);
  const registered = adapter.registerSummon(duel, event);
  const returned = adapter.resolveEndPhase(registered.state, endPhase(registered.state));
  assert.equal(returned.results[0].status, 'returned');
  assert.ok(returned.state.core.players[0].hand.some(card => card.uid === sourceUid));
  assert.equal(returned.state.reserves[0], undefined);
});

test('mão acima de seis permanece intacta para o fluxo End Phase compartilhado', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const registered = adapter.registerSummon(duel, event);
  const hand = privateZone(registered.state, 0, 'hand');
  for (let i = 0; i < 3; i++) {
    hand.push(takeFromSeat(registered.state, 0, () => true, ['deck']));
  }
  assert.equal(hand.length, 7);
  const returned = adapter.resolveEndPhase(registered.state, endPhase(registered.state));
  assert.equal(returned.results[0].status, 'returned');
  assert.equal(returned.state.reserves[0].hand.length, 8);
  assert.ok(returned.state.reserves[0].hand.some(card => card.uid === sourceUid));
});

test('virar a fonte face-down impede o retorno e não adia a janela', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const registered = adapter.registerSummon(duel, event);
  const source = registered.state.core.players[0].monsters.find(monster => monster.uid === sourceUid);
  source.faceUp = false;
  source.position = 'def';
  const returned = adapter.resolveEndPhase(registered.state, endPhase(registered.state));
  assert.equal(returned.results[0].status, 'face-down');
  assert.ok(returned.state.core.players[0].monsters.some(monster => monster.uid === sourceUid));
  assert.equal(returned.state.spiritPosition.pendingReturns.length, 0);
});

test('fonte que sai do campo não retorna; uma reentrada cria novo epoch', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const first = adapter.registerSummon(duel, event);
  moveMonsterToOwnerGrave(first.state, sourceUid, 0);
  returnMonsterFromOwnerGrave(first.state, sourceUid, 0, 0);
  const stale = adapter.resolveEndPhase(first.state, endPhase(first.state));
  assert.equal(stale.results[0].status, 'stale-instance');
  assert.ok(stale.state.core.players[0].monsters.some(monster => monster.uid === sourceUid));
});

test('nova virada face-up após reentrada substitui marcador obsoleto', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const first = adapter.registerSummon(duel, event);
  moveMonsterToOwnerGrave(first.state, sourceUid, 0);
  returnMonsterFromOwnerGrave(first.state, sourceUid, 0, 0);
  const secondEvent = eventFor(first.state, sourceUid, TSUKUYOMI_FIXTURE_ID, 'effect-flip', { eventId: 'm632:reentry:' + sourceUid });
  const second = adapter.registerSummon(first.state, secondEvent);
  assert.equal(second.status, 'registered');
  const returned = adapter.resolveEndPhase(second.state, endPhase(second.state, 'm632:end:reentry'));
  assert.equal(returned.results[0].status, 'returned');
});

test('evento duplicado e End Phase duplicada são idempotentes', () => {
  const { duel, event } = eventAndSource();
  const first = adapter.registerSummon(duel, event);
  assert.equal(adapter.registerSummon(first.state, event).status, 'duplicate');
  const end = adapter.resolveEndPhase(first.state, endPhase(first.state, 'm632:end:once'));
  const duplicate = adapter.resolveEndPhase(end.state, endPhase(end.state, 'm632:end:once'));
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.results.length, 0);
});

test('uma segunda tentativa de alvo para a mesma ativação não pode retargetar', () => {
  const { duel, event } = eventAndSource();
  const firstTarget = addAnyMonster(duel, 1, 1);
  const secondTarget = addAnyMonster(duel, 1, 1);
  const { planned } = registerAndPlan(duel, event, firstTarget);
  assert.equal(planned.status, 'ready');
  const retry = adapter.preparePositionEffect(planned.state, event.eventId, secondTarget);
  assert.equal(retry.status, 'duplicate');
});

test('plano fabricado ou de outro alvo é recusado', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addAnyMonster(duel, 1, 1);
  const { planned } = registerAndPlan(duel, event, targetUid);
  const forged = { ...planned.plan, targetUid: 'm1:forged', targetBinding: { ...planned.plan.targetBinding, uid: 'm1:forged' } };
  const rejected = adapter.resolvePositionEffect(planned.state, forged);
  assert.equal(rejected.status, 'invalid-target');
});

test('duplicação de resolução não repete a mudança', () => {
  const { duel, event } = eventAndSource();
  const targetUid = addAnyMonster(duel, 1, 1);
  const { planned } = registerAndPlan(duel, event, targetUid);
  const first = adapter.resolvePositionEffect(planned.state, planned.plan);
  assert.equal(first.status, 'resolved');
  const second = adapter.resolvePositionEffect(first.state, planned.plan);
  assert.equal(second.status, 'duplicate');
});

test('Deck Principal 20 e 30 são aceitos; 19 e 31 são rejeitados', () => {
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK));
  assert.doesNotThrow(() => makeDuel(2, MAX_DECK));
  assert.throws(() => makeDuel(2, BASE_DECK.slice(0, 19)));
  assert.throws(() => makeDuel(2, [...MAX_DECK, NORMAL_IDS[26]]));
});

test('Deck Adicional até cinco é aceito e seis é rejeitado', () => {
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 5) }));
  assert.throws(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 6) }));
});

test('quatro Monster Zones são rejeitadas sem alterar inventário', () => {
  const { duel, event } = eventAndSource();
  addAnyMonster(duel, 2, 0);
  addAnyMonster(duel, 2, 0);
  addAnyMonster(duel, 2, 0);
  assert.throws(() => adapter.registerSummon(duel, event), /limite de zonas/);
});

test('quatro Spell/Trap Zones são rejeitadas', () => {
  const { duel, event } = eventAndSource();
  addBackrow(duel, 0, 0);
  addBackrow(duel, 2, 0);
  addBackrow(duel, 1, 0);
  addBackrow(duel, 3, 0);
  assert.throws(() => adapter.registerSummon(duel, event), /três Spell\/Trap Zones/);
});

test('inventário físico permanece conservado ao registrar, resolver e retornar', () => {
  const { duel, event, sourceUid } = eventAndSource();
  const before = inventory(duel);
  const registered = adapter.registerSummon(duel, event);
  const targetUid = addAnyMonster(registered.state, 1, 1);
  const planned = adapter.preparePositionEffect(registered.state, event.eventId, targetUid);
  const resolved = adapter.resolvePositionEffect(planned.state, planned.plan);
  const returned = adapter.resolveEndPhase(resolved.state, endPhase(resolved.state));
  assert.deepEqual(inventory(returned.state), before);
  assert.ok(returned.state.reserves[0].hand.some(card => card.uid === sourceUid));
});

test('evento End Phase de outro turno é rejeitado', () => {
  const { duel, event } = eventAndSource();
  const registered = adapter.registerSummon(duel, event);
  assert.throws(() => adapter.resolveEndPhase(registered.state, { ...endPhase(registered.state), turn: duel.core.turn + 1 }));
});
