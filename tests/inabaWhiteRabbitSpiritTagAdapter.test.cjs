const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  INABA_WHITE_RABBIT_ID,
  createInabaWhiteRabbitSpiritAdapter,
} = require('../dist/inabaWhiteRabbitSpiritTagAdapter.js');

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

const INABA_FIXTURE_ID = EFFECT_IDS[0];
const adapter = createInabaWhiteRabbitSpiritAdapter(INABA_FIXTURE_ID);

function makeDuel(first = 2, deck = BASE_DECK, extraBySeat = {}) {
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...deck],
    extra: [...(extraBySeat[i] || [])],
  }));
  return createTagDuel(players, {
    seed: 'm609-inaba-white-rabbit',
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

function eventFor(duel, sourceUid, summonKind = 'normal', patch = {}) {
  const effectFlip = summonKind === 'effect-flip';
  return {
    kind: effectFlip ? 'monster-flipped-face-up' : 'monster-summoned',
    eventId: 'm609:' + duel.core.turn + ':' + sourceUid + ':' + summonKind,
    turn: duel.core.turn,
    controllerTeam: Number(sourceUid.match(/^m([0-3]):/)[1]) % 2,
    sourceUid,
    sourceId: INABA_FIXTURE_ID,
    summonKind,
    sourceWasFaceUp: true,
    transitionSucceeded: true,
    ...patch,
  };
}

function eventAndSource(first = 2, ownerSeat = 0, controllerTeam = 0, summonKind = 'normal') {
  const duel = makeDuel(first);
  const sourceUid = addMonster(duel, INABA_FIXTURE_ID, ownerSeat, controllerTeam, summonKind === 'normal');
  if (summonKind !== 'normal') {
    const source = duel.core.players[controllerTeam].monsters.find(monster => monster.uid === sourceUid);
    source.faceUp = false;
    source.position = 'def';
    source.faceUp = true;
    source.position = summonKind === 'effect-flip' ? 'def' : 'atk';
  }
  return { duel, sourceUid, event: eventFor(duel, sourceUid, summonKind) };
}

function endPhase(duel, eventId = 'm609:end:' + duel.core.turn) {
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

test('identidade oficial, condição de Invocação-Especial e retorno no End Phase após Normal Summon', () => {
  assert.equal(INABA_WHITE_RABBIT_ID, '77084837');
  assert.equal(adapter.canBeSpecialSummoned(), false);
  const { duel, sourceUid, event } = eventAndSource(2, 0, 0, 'normal');
  const before = inventory(duel);
  const registered = adapter.registerSummon(duel, event);
  assert.equal(registered.status, 'registered');
  const returned = adapter.resolveEndPhase(registered.state, endPhase(duel));
  assert.equal(returned.results[0].status, 'returned');
  assert.ok(returned.state.reserves[0].hand.some(card => card.uid === sourceUid));
  assert.ok(!returned.state.core.players[0].monsters.some(monster => monster.uid === sourceUid));
  assert.deepEqual(inventory(returned.state), before);
});

test('Flip Summon e virada face-up por efeito registram o retorno do mesmo turno', () => {
  for (const kind of ['flip', 'effect-flip']) {
    const { duel, sourceUid, event } = eventAndSource(2, 2, 0, kind);
    const registered = adapter.registerSummon(duel, event);
    assert.equal(registered.status, 'registered');
    const returned = adapter.resolveEndPhase(registered.state, endPhase(duel, 'm609:end:' + kind));
    assert.equal(returned.results[0].status, 'returned');
    assert.ok(returned.state.core.players[0].hand.some(card => card.uid === sourceUid));
  }
});

test('Invocação-Especial é proibida mesmo quando a carta já está no campo', () => {
  const { duel, event } = eventAndSource();
  assert.throws(() => adapter.registerSummon(duel, { ...event, summonKind: 'special' }));
  assert.throws(() => adapter.registerSummon(duel, { ...event, kind: 'monster-flipped-face-up', summonKind: 'special' }));
});

test('a carta retorna à mão do proprietário físico, mesmo sob controle da equipe adversária', () => {
  const { duel, sourceUid, event } = eventAndSource(2, 0, 0);
  const registered = adapter.registerSummon(duel, event);
  const [source] = registered.state.core.players[0].monsters.splice(
    registered.state.core.players[0].monsters.findIndex(monster => monster.uid === sourceUid),
    1
  );
  registered.state.core.players[1].monsters.push(source);
  synchronizeCardLifetimes(registered.state.core);
  const returned = adapter.resolveEndPhase(registered.state, endPhase(registered.state));
  assert.equal(returned.results[0].status, 'returned');
  assert.ok(returned.state.reserves[0].hand.some(card => card.uid === sourceUid));
  assert.ok(!returned.state.core.players[1].monsters.some(monster => monster.uid === sourceUid));
});

test('proprietário ativo recebe a carta em sua mão privada, não na mão da equipe', () => {
  const { duel, sourceUid, event } = eventAndSource(2, 2, 0);
  const registered = adapter.registerSummon(duel, event);
  const returned = adapter.resolveEndPhase(registered.state, endPhase(registered.state));
  assert.equal(returned.results[0].status, 'returned');
  assert.ok(returned.state.core.players[0].hand.some(card => card.uid === sourceUid));
  assert.ok(!returned.state.reserves[2]);
});

test('a virada para face-down impede o retorno; a janela não é adiada para outro turno', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const registered = adapter.registerSummon(duel, event);
  const source = registered.state.core.players[0].monsters.find(monster => monster.uid === sourceUid);
  source.faceUp = false;
  source.position = 'def';
  const returned = adapter.resolveEndPhase(registered.state, endPhase(registered.state));
  assert.equal(returned.results[0].status, 'face-down');
  assert.ok(returned.state.core.players[0].monsters.some(monster => monster.uid === sourceUid));
  assert.equal(returned.state.inabaWhiteRabbit.pendingReturns.length, 0);
});

test('se a carta sair do campo antes do End Phase, não é devolvida', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const registered = adapter.registerSummon(duel, event);
  moveMonsterToOwnerGrave(registered.state, sourceUid, 0);
  const returned = adapter.resolveEndPhase(registered.state, endPhase(registered.state));
  assert.equal(returned.results[0].status, 'stale-instance');
  assert.ok(returned.state.core.players[0].grave.some(card => card.uid === sourceUid));
});

test('um novo ciclo de zona exige novo evento; o vínculo antigo não atinge a nova instância', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const first = adapter.registerSummon(duel, event);
  moveMonsterToOwnerGrave(first.state, sourceUid, 0);
  returnMonsterFromOwnerGrave(first.state, sourceUid, 0, 0);
  const stale = adapter.resolveEndPhase(first.state, endPhase(first.state));
  assert.equal(stale.results[0].status, 'stale-instance');
  assert.ok(stale.state.core.players[0].monsters.some(monster => monster.uid === sourceUid));
});

test('uma nova virada face-up após reentrada substitui o marcador obsoleto', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const first = adapter.registerSummon(duel, event);
  moveMonsterToOwnerGrave(first.state, sourceUid, 0);
  returnMonsterFromOwnerGrave(first.state, sourceUid, 0, 0);
  const secondEvent = eventFor(first.state, sourceUid, 'effect-flip', { eventId: 'm609:reentry:' + sourceUid });
  const second = adapter.registerSummon(first.state, secondEvent);
  assert.equal(second.status, 'registered');
  const returned = adapter.resolveEndPhase(second.state, endPhase(second.state));
  assert.equal(returned.results[0].status, 'returned');
  assert.ok(returned.state.reserves[0].hand.some(card => card.uid === sourceUid));
});

test('o efeito de retorno pode ser negado na janela End Phase', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const registered = adapter.registerSummon(duel, event);
  const returned = adapter.resolveEndPhase(registered.state, endPhase(registered.state), { effectNegated: true });
  assert.equal(returned.results[0].status, 'negated');
  assert.ok(returned.state.core.players[0].monsters.some(monster => monster.uid === sourceUid));
});

test('a permissão de ataque direto ignora monstros adversários, mas respeita face-up e negação', () => {
  const { duel, sourceUid } = eventAndSource();
  addAnyMonster(duel, 3, 1);
  assert.equal(adapter.canAttackDirectly(duel, sourceUid), true);
  assert.equal(adapter.canAttackDirectly(duel, sourceUid, { effectNegated: true }), false);
  const source = duel.core.players[0].monsters.find(monster => monster.uid === sourceUid);
  source.faceUp = false;
  source.position = 'def';
  assert.equal(adapter.canAttackDirectly(duel, sourceUid), false);
});

test('a permissão de ataque direto não se aplica a outra carta nem fora do campo', () => {
  const { duel, sourceUid } = eventAndSource();
  const otherUid = addAnyMonster(duel, 0, 0);
  assert.equal(adapter.canAttackDirectly(duel, otherUid), false);
  moveMonsterToOwnerGrave(duel, sourceUid, 0);
  assert.equal(adapter.canAttackDirectly(duel, sourceUid), false);
});

test('eventos repetidos, restauração JSON e resolução End Phase são idempotentes', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const first = adapter.registerSummon(duel, event);
  assert.equal(adapter.registerSummon(first.state, event).status, 'duplicate');
  const restored = JSON.parse(JSON.stringify(first.state));
  const end = endPhase(restored);
  const returned = adapter.resolveEndPhase(restored, end);
  assert.equal(returned.results[0].status, 'returned');
  const replay = adapter.resolveEndPhase(JSON.parse(JSON.stringify(returned.state)), end);
  assert.equal(replay.status, 'duplicate');
  assert.ok(replay.state.reserves[0].hand.some(card => card.uid === sourceUid));
});

test('o retorno não descarta a mão: limite 6 continua sendo aplicado pelo fluxo End Phase', () => {
  const { duel, sourceUid, event } = eventAndSource();
  const ownerHand = duel.reserves[0].hand;
  for (let i = 0; i < 2; i++) ownerHand.push(takeFromSeat(duel, 0, () => true, ['deck']));
  assert.equal(ownerHand.length, 6);
  const registered = adapter.registerSummon(duel, event);
  const returned = adapter.resolveEndPhase(registered.state, endPhase(registered.state));
  assert.equal(returned.state.reserves[0].hand.length, 7);
  assert.ok(returned.state.reserves[0].hand.some(card => card.uid === sourceUid));
});

test('Deck 20/30 e Extra 5 são aceitos; limites inválidos são rejeitados', () => {
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK));
  assert.doesNotThrow(() => makeDuel(2, MAX_DECK));
  assert.throws(() => makeDuel(2, BASE_DECK.slice(1)));
  assert.throws(() => makeDuel(2, [...MAX_DECK, NORMAL_IDS[26]]));
  assert.ok(FUSION_IDS.length >= 6);
  assert.doesNotThrow(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 5) }));
  assert.throws(() => makeDuel(2, BASE_DECK, { 0: FUSION_IDS.slice(0, 6) }));
});

test('três Monster Zones e três Spell/Trap Zones são aceitas; a quarta é rejeitada', () => {
  {
    const { duel, event } = eventAndSource();
    addAnyMonster(duel, 0, 0);
    addAnyMonster(duel, 0, 0);
    assert.equal(adapter.registerSummon(duel, event).status, 'registered');
    addAnyMonster(duel, 0, 0);
    assert.throws(() => adapter.registerSummon(duel, event));
  }
  {
    const { duel, event } = eventAndSource();
    for (let i = 0; i < 3; i++) addAnyBackrow(duel, 0, 0);
    assert.equal(adapter.registerSummon(duel, event).status, 'registered');
    addAnyBackrow(duel, 0, 0);
    assert.throws(() => adapter.registerSummon(duel, event));
  }
});

test('eventos forjados, turnos errados e equipe controladora incompatível são rejeitados', () => {
  const { duel, event } = eventAndSource();
  assert.throws(() => adapter.registerSummon(duel, { ...event, turn: event.turn + 1 }));
  assert.throws(() => adapter.registerSummon(duel, { ...event, controllerTeam: 1 }));
  assert.throws(() => adapter.registerSummon(duel, { ...event, sourceWasFaceUp: false }));
  assert.throws(() => adapter.registerSummon(duel, { ...event, transitionSucceeded: false }));
  assert.throws(() => adapter.resolveEndPhase(duel, { ...endPhase(duel), turn: duel.core.turn + 1 }));
});
