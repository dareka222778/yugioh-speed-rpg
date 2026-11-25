const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagNormalCardIds, tagInventory } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const {
  THE_CHEERFUL_COFFIN_ID,
  activateCheerfulCoffin,
  resolveCheerfulCoffin,
  assertCheerfulCoffinRules,
  assertPhysicalExtraDeckCounts,
} = require('../dist/cheerfulCoffinTagAdapter.js');

const MONSTER_ID = tagNormalCardIds.find(id => getDuelCard(id)?.kind === 'monster');
const SPELL_ID = enabledCardIds.find(id => {
  const card = getDuelCard(id);
  return card?.kind === 'spell' && card.field !== true;
});
const TRAP_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'trap');
assert.ok(MONSTER_ID);
assert.ok(SPELL_ID);
assert.ok(TRAP_ID);

function makeDuel(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  assert.equal(deck.length, 20);
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i, name: 'Member ' + i, cards: [...deck], extra: [],
  }));
  return createTagDuel(players, { seed: 'm615-cheerful-coffin', first, classic: true });
}
function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team][zone] : duel.reserves[String(seat)][zone];
}
function putCardInHand(duel, seat, id) {
  const card = privateZone(duel, seat, 'hand')[0];
  assert.ok(card);
  card.id = id;
  return card.uid;
}
function handMonsters(duel, seat, excludingUid) {
  return privateZone(duel, seat, 'hand')
    .filter(card => card.uid !== excludingUid && getDuelCard(card.id)?.kind === 'monster')
    .map(card => card.uid);
}
function inventory(duel) {
  return tagInventory(duel).map(card => card.uid + '|' + card.id).sort();
}
function setup(first = 0) {
  const duel = makeDuel(first);
  const sourceUid = putCardInHand(duel, first, SPELL_ID);
  const selected = handMonsters(duel, first, sourceUid);
  assert.ok(selected.length >= 3);
  const activation = activateCheerfulCoffin(duel, sourceUid, { cardId: SPELL_ID });
  assert.ok(activation);
  return { duel, sourceUid, selected, activation };
}

test('ativa somente da mão privada do assento físico ativo na Main Phase', () => {
  const { duel, sourceUid, activation } = setup();
  assert.equal(activation.plan.ownerSeat, 0);
  assert.equal(activation.plan.ownerTeam, 0);
  assert.equal(privateZone(activation.state, 0, 'hand').some(card => card.uid === sourceUid), false);
  assert.ok(activation.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.ok(privateZone(duel, 0, 'hand').some(card => card.uid === sourceUid), 'entrada não é mutada');
});

test('rejeita Spell da mão do parceiro físico inativo', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 2, SPELL_ID);
  assert.equal(activateCheerfulCoffin(duel, sourceUid, { cardId: SPELL_ID }), null);
});

test('rejeita Spell da mão adversária', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 1, SPELL_ID);
  assert.equal(activateCheerfulCoffin(duel, sourceUid, { cardId: SPELL_ID }), null);
});

test('rejeita Battle Phase, janela de resposta, corrente e escolha pendente', () => {
  const battle = makeDuel(0);
  const battleUid = putCardInHand(battle, 0, SPELL_ID);
  battle.core.phase = 'battle';
  assert.equal(activateCheerfulCoffin(battle, battleUid, { cardId: SPELL_ID }), null);

  const response = makeDuel(0);
  const responseUid = putCardInHand(response, 0, SPELL_ID);
  response.core.phase = 'response';
  assert.equal(activateCheerfulCoffin(response, responseUid, { cardId: SPELL_ID }), null);

  const chain = makeDuel(0);
  const chainUid = putCardInHand(chain, 0, SPELL_ID);
  chain.core.chain.push({ id: 'fixture' });
  assert.equal(activateCheerfulCoffin(chain, chainUid, { cardId: SPELL_ID }), null);

  const choice = makeDuel(0);
  const choiceUid = putCardInHand(choice, 0, SPELL_ID);
  choice.core.choice = { kind: 'fixture' };
  assert.equal(activateCheerfulCoffin(choice, choiceUid, { cardId: SPELL_ID }), null);
});

test('não aceita um monstro como fonte da Normal Spell', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, MONSTER_ID);
  assert.equal(activateCheerfulCoffin(duel, sourceUid, { cardId: MONSTER_ID }), null);
});

test('descarta três monstros da mão física ativa para o Cemitério da equipe', () => {
  const { activation, selected, sourceUid } = setup();
  const before = inventory(activation.state);
  const result = resolveCheerfulCoffin(activation.state, activation.plan, selected.slice(0, 3), { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(result.discardedUids, selected.slice(0, 3));
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
  for (const uid of selected.slice(0, 3)) {
    assert.ok(result.state.core.players[0].grave.some(card => card.uid === uid));
    assert.equal(privateZone(result.state, 0, 'hand').some(card => card.uid === uid), false);
  }
  assert.deepEqual(inventory(result.state), before);
});

test('permite escolher zero monstros', () => {
  const { activation, sourceUid } = setup();
  const result = resolveCheerfulCoffin(activation.state, activation.plan, [], { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(result.discardedUids, []);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
});

test('permite descartar apenas um monstro', () => {
  const { activation, selected } = setup();
  const result = resolveCheerfulCoffin(activation.state, activation.plan, [selected[0]], { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(result.discardedUids, [selected[0]]);
});

test('rejeita quatro monstros: o limite é três', () => {
  const { activation, selected } = setup();
  assert.equal(resolveCheerfulCoffin(activation.state, activation.plan, selected.slice(0, 4), { cardId: SPELL_ID }), null);
});

test('rejeita UIDs repetidos sem mutação parcial', () => {
  const { activation, selected } = setup();
  const before = inventory(activation.state);
  assert.equal(resolveCheerfulCoffin(activation.state, activation.plan, [selected[0], selected[0]], { cardId: SPELL_ID }), null);
  assert.deepEqual(inventory(activation.state), before);
});

test('rejeita seleção stale ou UID inexistente', () => {
  const { activation } = setup();
  assert.equal(resolveCheerfulCoffin(activation.state, activation.plan, ['m0:not-in-hand'], { cardId: SPELL_ID }), null);
});

test('rejeita Spell/Trap na lista de descarte', () => {
  const { activation, selected } = setup();
  const spellUid = selected[0];
  privateZone(activation.state, 0, 'hand').find(card => card.uid === spellUid).id = SPELL_ID;
  assert.equal(resolveCheerfulCoffin(activation.state, activation.plan, [spellUid], { cardId: SPELL_ID }), null);

  const trap = setup();
  const trapUid = trap.selected[0];
  privateZone(trap.activation.state, 0, 'hand').find(card => card.uid === trapUid).id = TRAP_ID;
  assert.equal(resolveCheerfulCoffin(trap.activation.state, trap.activation.plan, [trapUid], { cardId: SPELL_ID }), null);
});

test('rejeita monstros da mão do parceiro ou do adversário', () => {
  const { activation } = setup();
  const partnerUid = privateZone(activation.state, 2, 'hand')[0].uid;
  const opponentUid = privateZone(activation.state, 1, 'hand')[0].uid;
  assert.equal(resolveCheerfulCoffin(activation.state, activation.plan, [partnerUid], { cardId: SPELL_ID }), null);
  assert.equal(resolveCheerfulCoffin(activation.state, activation.plan, [opponentUid], { cardId: SPELL_ID }), null);
});

test('revalida se a fonte ainda está no Cemitério da equipe proprietária', () => {
  const { activation, sourceUid } = setup();
  const changed = structuredClone(activation.state);
  changed.core.players[0].grave = changed.core.players[0].grave.filter(card => card.uid !== sourceUid);
  assert.equal(resolveCheerfulCoffin(changed, activation.plan, [], { cardId: SPELL_ID }), null);
});

test('não aceita fonte física no Cemitério da equipe errada', () => {
  const { activation, sourceUid } = setup();
  const changed = structuredClone(activation.state);
  const index = changed.core.players[0].grave.findIndex(card => card.uid === sourceUid);
  const [source] = changed.core.players[0].grave.splice(index, 1);
  changed.core.players[1].grave.push(source);
  assert.equal(resolveCheerfulCoffin(changed, activation.plan, [], { cardId: SPELL_ID }), null);
});

test('negação mantém o Spell no Cemitério e não descarta monstros', () => {
  const { activation, selected, sourceUid } = setup();
  const result = resolveCheerfulCoffin(activation.state, activation.plan, [], { cardId: SPELL_ID, negated: true });
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.deepEqual(result.discardedUids, []);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.ok(privateZone(result.state, 0, 'hand').some(card => card.uid === selected[0]));
});

test('negação com seleção de monstros é rejeitada atomicamente', () => {
  const { activation, selected } = setup();
  const before = inventory(activation.state);
  assert.equal(resolveCheerfulCoffin(activation.state, activation.plan, [selected[0]], { cardId: SPELL_ID, negated: true }), null);
  assert.deepEqual(inventory(activation.state), before);
});

test('recibo persistido bloqueia replay inclusive quando a escolha original foi zero', () => {
  const { activation } = setup();
  const first = resolveCheerfulCoffin(activation.state, activation.plan, [], { cardId: SPELL_ID });
  assert.ok(first);
  assert.equal(resolveCheerfulCoffin(first.state, activation.plan, [], { cardId: SPELL_ID }), null);
  const roundTrip = JSON.parse(JSON.stringify(first.state));
  assert.equal(resolveCheerfulCoffin(roundTrip, activation.plan, [], { cardId: SPELL_ID }), null);
});

test('duas cópias físicas podem ser ativadas no mesmo turno', () => {
  const duel = makeDuel(0);
  const hand = privateZone(duel, 0, 'hand');
  const firstUid = hand[0].uid;
  const secondUid = hand[1].uid;
  hand[0].id = SPELL_ID;
  hand[1].id = SPELL_ID;
  const first = activateCheerfulCoffin(duel, firstUid, { cardId: SPELL_ID });
  assert.ok(first);
  const resolved = resolveCheerfulCoffin(first.state, first.plan, [], { cardId: SPELL_ID });
  assert.ok(resolved);
  const second = activateCheerfulCoffin(resolved.state, secondUid, { cardId: SPELL_ID });
  assert.ok(second);
});

test('assento 2 usa sua própria mão física e o Cemitério compartilhado da equipe 0', () => {
  const { activation, selected } = setup(2);
  assert.equal(activation.plan.ownerSeat, 2);
  assert.equal(activation.plan.ownerTeam, 0);
  const result = resolveCheerfulCoffin(activation.state, activation.plan, [selected[0]], { cardId: SPELL_ID });
  assert.ok(result);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === selected[0]));
  assert.equal(privateZone(result.state, 0, 'hand').some(card => card.uid === selected[0]), true);
});

test('entrada original permanece imutável na ativação e resolução', () => {
  const { duel, sourceUid, selected } = (() => {
    const value = setup();
    return { duel: value.duel, sourceUid: value.sourceUid, selected: value.selected };
  })();
  const before = JSON.stringify(duel);
  const activation = activateCheerfulCoffin(duel, sourceUid, { cardId: SPELL_ID });
  assert.ok(activation);
  const activationBefore = JSON.stringify(activation.state);
  const result = resolveCheerfulCoffin(activation.state, activation.plan, [selected[0]], { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(JSON.stringify(duel), before);
  assert.equal(JSON.stringify(activation.state), activationBefore);
});

test('mão acima de seis não é truncada antes da End Phase', () => {
  const duel = makeDuel(0);
  const hand = privateZone(duel, 0, 'hand');
  const deck = privateZone(duel, 0, 'deck');
  hand.push(...deck.splice(0, 3));
  const sourceUid = putCardInHand(duel, 0, SPELL_ID);
  const activation = activateCheerfulCoffin(duel, sourceUid, { cardId: SPELL_ID });
  assert.ok(activation);
  const afterActivation = privateZone(activation.state, 0, 'hand').length;
  const result = resolveCheerfulCoffin(activation.state, activation.plan, [], { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(privateZone(result.state, 0, 'hand').length, afterActivation);
  assert.ok(afterActivation > 6);
});

test('mantém as três Monster Zones e três Spell/Trap Zones; Field Zone é separada', () => {
  const duel = makeDuel(0);
  assertCheerfulCoffinRules(duel);
  assert.equal(duel.core.players[0].monsters.length, 0);
  assert.equal(duel.core.players[0].backrow.length, 0);
  assertPhysicalExtraDeckCounts([0, 0, 0, 0], 5);
  assert.throws(() => assertPhysicalExtraDeckCounts([0, 0, 6, 0], 5));
});

test('rejeita plano adulterado, de outro turno ou com proprietário incompatível', () => {
  const { activation } = setup();
  assert.equal(resolveCheerfulCoffin(activation.state, { ...activation.plan, turn: activation.plan.turn + 1 }, [], { cardId: SPELL_ID }), null);
  assert.equal(resolveCheerfulCoffin(activation.state, { ...activation.plan, ownerTeam: 1 }, [], { cardId: SPELL_ID }), null);
  assert.equal(resolveCheerfulCoffin(activation.state, { ...activation.plan, eventId: 'forged' }, [], { cardId: SPELL_ID }), null);
});

test('inventário e UIDs físicos são conservados após descartar três monstros', () => {
  const { activation, selected } = setup();
  const before = inventory(activation.state);
  const result = resolveCheerfulCoffin(activation.state, activation.plan, selected.slice(0, 3), { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(inventory(result.state), before);
  assert.equal(new Set(inventory(result.state).map(value => value.split('|')[0])).size, inventory(result.state).length);
});
