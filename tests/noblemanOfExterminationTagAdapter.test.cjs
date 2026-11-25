const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagNormalCardIds, tagInventory } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  NOBLEMAN_OF_EXTERMINATION_ID,
  activateNoblemanOfExtermination,
  resolveNoblemanOfExtermination,
} = require('../dist/noblemanOfExterminationTagAdapter.js');
const { assertNoblemanRules } = require('../dist/noblemanOfCrossoutTagAdapter.js');

const SPELL_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'spell' && getDuelCard(id)?.field !== true);
const FIELD_SPELL_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'spell' && getDuelCard(id)?.field === true);
const TRAP_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'trap');
const MONSTER_ID = tagNormalCardIds.find(id => getDuelCard(id)?.kind === 'monster');
assert.ok(SPELL_ID);
assert.ok(FIELD_SPELL_ID, 'a Field Spell fixture must be present');
assert.ok(TRAP_ID);
assert.ok(MONSTER_ID);
assert.ok(NOBLEMAN_OF_EXTERMINATION_ID);

function makeDuel(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  assert.equal(deck.length, 20);
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i, name: 'Member ' + i, cards: [...deck], extra: [],
  }));
  return createTagDuel(players, { seed: 'm622-nobleman-extermination', first, classic: true });
}
function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team][zone] : duel.reserves[String(seat)][zone];
}
function putSpell(duel, seat, index = 0) {
  const card = privateZone(duel, seat, 'hand')[index];
  assert.ok(card);
  card.id = SPELL_ID;
  return card.uid;
}
function placeBackrow(duel, seat, controllerTeam, id, zone = 'backrow', faceUp = false) {
  const hand = privateZone(duel, seat, 'hand');
  const [card] = hand.splice(0, 1);
  assert.ok(card);
  card.id = id;
  const row = { ...card, setTurn: duel.core.turn, faceUp };
  if (zone === 'field') duel.core.players[controllerTeam].field = row;
  else duel.core.players[controllerTeam].backrow.push(row);
  return card.uid;
}
function setup({ first = 0, targetKind = 'trap', zone = 'backrow', controller = 1, owner = 0, faceUp = false } = {}) {
  const duel = makeDuel(first);
  const sourceUid = putSpell(duel, first);
  const targetSeat = owner === 0 ? (first === 0 ? 2 : 0) : 1;
  const targetId = targetKind === 'trap' ? TRAP_ID : targetKind === 'field' ? FIELD_SPELL_ID : SPELL_ID;
  const targetUid = placeBackrow(duel, targetSeat, controller, targetId, zone, faceUp);
  const activation = activateNoblemanOfExtermination(duel, sourceUid, targetUid, { cardId: SPELL_ID });
  return { duel, sourceUid, targetUid, targetSeat, targetId, activation };
}
function inventory(duel) {
  return tagInventory(duel).filter(card => card.entityKind !== 'token')
    .map(card => card.uid + '|' + card.id).sort();
}
function setCopiesInAllMainDecks(duel, id = TRAP_ID, count = 2) {
  for (const seat of [0, 1, 2, 3]) {
    const deck = privateZone(duel, seat, 'deck');
    for (let i = 0; i < count; i++) deck[i].id = id;
  }
}

test('ativa da mão privada do assento físico ativo sem expor identidade do alvo', () => {
  const { duel, activation, sourceUid, targetUid } = setup();
  assert.ok(activation);
  assert.equal(activation.plan.ownerSeat, 0);
  assert.equal(activation.plan.ownerTeam, 0);
  assert.equal(activation.plan.targetUid, targetUid);
  assert.equal('targetId' in activation.plan, false);
  assert.ok(activation.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.ok(privateZone(duel, 0, 'hand').some(card => card.uid === sourceUid));
});

test('rejeita fonte na mão do parceiro inativo ou do adversário', () => {
  const partner = makeDuel(0);
  const partnerSource = putSpell(partner, 2);
  const partnerTarget = placeBackrow(partner, 3, 1, TRAP_ID);
  assert.equal(activateNoblemanOfExtermination(partner, partnerSource, partnerTarget, { cardId: SPELL_ID }), null);

  const opponent = makeDuel(0);
  const opponentSource = putSpell(opponent, 1);
  const opponentTarget = placeBackrow(opponent, 2, 1, TRAP_ID);
  assert.equal(activateNoblemanOfExtermination(opponent, opponentSource, opponentTarget, { cardId: SPELL_ID }), null);
});

test('rejeita fonte que não seja Spell', () => {
  const duel = makeDuel(0);
  const hand = privateZone(duel, 0, 'hand');
  hand[0].id = MONSTER_ID;
  const targetUid = placeBackrow(duel, 2, 1, TRAP_ID);
  assert.equal(activateNoblemanOfExtermination(duel, hand[0].uid, targetUid, { cardId: MONSTER_ID }), null);
});

test('rejeita Battle Phase, janela de resposta e corrente aberta', () => {
  for (const phase of ['battle', 'response']) {
    const duel = makeDuel(0);
    const sourceUid = putSpell(duel, 0);
    const targetUid = placeBackrow(duel, 2, 1, TRAP_ID);
    duel.core.phase = phase;
    assert.equal(activateNoblemanOfExtermination(duel, sourceUid, targetUid, { cardId: SPELL_ID }), null);
  }
  const chain = makeDuel(0);
  const sourceUid = putSpell(chain, 0);
  const targetUid = placeBackrow(chain, 2, 1, TRAP_ID);
  chain.core.chain.push({ actor: 0, card: sourceUid, id: SPELL_ID, target: '' });
  assert.equal(activateNoblemanOfExtermination(chain, sourceUid, targetUid, { cardId: SPELL_ID }), null);
});

test('aceita face-down Trap em Spell/Trap Zone', () => {
  const { activation, targetUid } = setup({ targetKind: 'trap', zone: 'backrow' });
  assert.ok(activation);
  assert.equal(activation.plan.targetUid, targetUid);
});

test('aceita face-down Spell em Spell/Trap Zone, mas não revela Decks', () => {
  const { activation, targetUid } = setup({ targetKind: 'spell', zone: 'backrow' });
  assert.ok(activation);
  const result = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedTarget.uid, targetUid);
  assert.equal(result.banishedTarget.kind, 'spell');
  assert.equal(result.trapTarget, false);
  assert.deepEqual(result.revealedDecks, []);
});

test('aceita face-down Field Spell na Field Zone, separada das três zonas de S/T', () => {
  const { activation, targetUid } = setup({ targetKind: 'field', zone: 'field' });
  assert.ok(activation);
  assert.equal(activation.plan.targetBinding.zone, 'field');
  const result = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedTarget.uid, targetUid);
  assert.equal(result.state.core.players[1].field, null);
  assert.ok(result.state.core.players[0].banished?.some(card => card.uid === targetUid));
});

test('rejeita alvo face-up, monstro ou inexistente antes de consumir a Spell', () => {
  const faceUp = setup({ targetKind: 'trap', faceUp: true });
  assert.equal(faceUp.activation, null);

  const duel = makeDuel(0);
  const sourceUid = putSpell(duel, 0);
  const before = inventory(duel);
  assert.equal(activateNoblemanOfExtermination(duel, sourceUid, 'missing', { cardId: SPELL_ID }), null);
  assert.deepEqual(inventory(duel), before);

  const monster = makeDuel(0);
  const monsterSource = putSpell(monster, 0);
  const hand = privateZone(monster, 2, 'hand');
  const [card] = hand.splice(0, 1);
  monster.core.players[1].monsters.push({
    ...card, owner: 0, position: 'def', faceUp: false,
    entered: monster.core.turn, changed: monster.core.turn, attacked: 0, atkBoost: 0, defBoost: 0,
  });
  assert.equal(activateNoblemanOfExtermination(monster, monsterSource, card.uid, { cardId: SPELL_ID }), null);
});

test('Trap alvo revela quatro Decks físicos e bane todas as cópias pelo rulesCardName', () => {
  const { activation, targetUid } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  setCopiesInAllMainDecks(activation.state, TRAP_ID, 2);
  const before = inventory(activation.state);
  const result = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.trapTarget, true);
  assert.equal(result.banishedTarget.uid, targetUid);
  assert.equal(result.banishedTarget.kind, 'trap');
  assert.equal(result.revealedDecks.length, 4);
  assert.deepEqual(result.revealedDecks.map(deck => deck.seat), [0, 1, 2, 3]);
  assert.ok(result.revealedDecks.every(deck => deck.cards.length === 16));
  assert.equal(result.banishedDeckUids.length, 8);
  assert.equal(new Set(result.banishedDeckUids).size, 8);
  assert.deepEqual(inventory(result.state), before);
  assert.ok(result.state.core.players[0].banished?.some(card => card.uid === targetUid));
});

test('cópias banidas dos Decks vão para a equipe do proprietário físico', () => {
  const { activation } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  setCopiesInAllMainDecks(activation.state, TRAP_ID, 1);
  const result = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  const team0 = result.banishedDeckUids.filter(uid => Number(uid[1]) % 2 === 0);
  const team1 = result.banishedDeckUids.filter(uid => Number(uid[1]) % 2 === 1);
  assert.equal(team0.length, 2);
  assert.equal(team1.length, 2);
  assert.ok(team0.every(uid => result.state.core.players[0].banished?.some(card => card.uid === uid)));
  assert.ok(team1.every(uid => result.state.core.players[1].banished?.some(card => card.uid === uid)));
});

test('Spell alvo não revela Decks mesmo se houver cópias com o mesmo nome', () => {
  const { activation } = setup({ targetKind: 'spell' });
  assert.ok(activation);
  setCopiesInAllMainDecks(activation.state, SPELL_ID, 1);
  const result = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.trapTarget, false);
  assert.deepEqual(result.revealedDecks, []);
  assert.deepEqual(result.banishedDeckUids, []);
});

test('snapshot dos Decks é anterior ao banimento e preserva ordem dos não correspondentes', () => {
  const { activation } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  setCopiesInAllMainDecks(activation.state, TRAP_ID, 2);
  const expected = [0, 1, 2, 3].map(seat => privateZone(activation.state, seat, 'deck').map(card => card.id));
  const remaining = [0, 1, 2, 3].map(seat => privateZone(activation.state, seat, 'deck').slice(2).map(card => card.uid));
  const result = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(result.revealedDecks.map(deck => deck.cards.map(card => card.id)), expected);
  assert.deepEqual([0, 1, 2, 3].map(seat => privateZone(result.state, seat, 'deck').map(card => card.uid)), remaining);
});

test('Trap sem cópias ainda revela os quatro Decks, mas não bane cartas do Deck', () => {
  const { activation } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  const result = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.trapTarget, true);
  assert.equal(result.revealedDecks.length, 4);
  assert.deepEqual(result.banishedDeckUids, []);
});

test('alvo que sai do backrow antes da resolução não é substituído nem revela Decks', () => {
  const { activation, targetUid, targetSeat } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const index = changed.core.players[1].backrow.findIndex(card => card.uid === targetUid);
  const [target] = changed.core.players[1].backrow.splice(index, 1);
  privateZone(changed, targetSeat, 'hand').push(target);
  synchronizeCardLifetimes(changed.core);
  const result = resolveNoblemanOfExtermination(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedTarget, null);
  assert.deepEqual(result.revealedDecks, []);
});

test('alvo que sai e retorna ao backrow com o mesmo UID tem binding obsoleto', () => {
  const { activation, targetUid, targetSeat } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const index = changed.core.players[1].backrow.findIndex(card => card.uid === targetUid);
  const [target] = changed.core.players[1].backrow.splice(index, 1);
  privateZone(changed, targetSeat, 'hand').push(target);
  synchronizeCardLifetimes(changed.core);
  const hand = privateZone(changed, targetSeat, 'hand');
  const returned = hand.splice(hand.findIndex(card => card.uid === targetUid), 1)[0];
  changed.core.players[1].backrow.push(returned);
  synchronizeCardLifetimes(changed.core);
  const result = resolveNoblemanOfExtermination(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedTarget, null);
  assert.deepEqual(result.revealedDecks, []);
});

test('mudança de controle sem mudar zona preserva o alvo e o proprietário original', () => {
  const { activation, targetUid } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const index = changed.core.players[1].backrow.findIndex(card => card.uid === targetUid);
  const [target] = changed.core.players[1].backrow.splice(index, 1);
  changed.core.players[0].backrow.push(target);
  const result = resolveNoblemanOfExtermination(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedTarget.uid, targetUid);
  assert.ok(result.state.core.players[0].banished?.some(card => card.uid === targetUid));
});

test('Field Zone pode mudar de equipe sem perder o binding da mesma carta', () => {
  const { activation, targetUid } = setup({ targetKind: 'field', zone: 'field' });
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const [field] = [changed.core.players[1].field];
  changed.core.players[1].field = null;
  changed.core.players[0].field = field;
  const result = resolveNoblemanOfExtermination(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedTarget.uid, targetUid);
  assert.ok(result.state.core.players[0].banished?.some(card => card.uid === targetUid));
});

test('virar o alvo face-up antes da resolução não troca o alvo original', () => {
  const { activation, targetUid } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const target = changed.core.players[1].backrow.find(card => card.uid === targetUid);
  target.faceUp = true;
  const result = resolveNoblemanOfExtermination(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedTarget.uid, targetUid);
  assert.equal(result.trapTarget, true);
  assert.equal(result.revealedDecks.length, 4);
});

test('negação não bane alvo nem revela Decks', () => {
  const { activation, targetUid, sourceUid } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  const result = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID, negated: true });
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.equal(result.banishedTarget, null);
  assert.deepEqual(result.revealedDecks, []);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.ok(result.state.core.players[1].backrow.some(card => card.uid === targetUid));
});

test('recibo serializável impede replay', () => {
  const { activation } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  const first = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(first);
  assert.equal(resolveNoblemanOfExtermination(first.state, activation.plan, { cardId: SPELL_ID }), null);
  const restored = JSON.parse(JSON.stringify(first.state));
  assert.equal(resolveNoblemanOfExtermination(restored, activation.plan, { cardId: SPELL_ID }), null);
});

test('duas cópias podem ser ativadas no mesmo turno', () => {
  const { activation, targetSeat } = setup({ targetKind: 'spell' });
  assert.ok(activation);
  const first = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(first);
  const hand = privateZone(first.state, 0, 'hand');
  hand[0].id = SPELL_ID;
  const secondTarget = placeBackrow(first.state, targetSeat, 1, TRAP_ID);
  const second = activateNoblemanOfExtermination(first.state, hand[0].uid, secondTarget, { cardId: SPELL_ID });
  assert.ok(second);
  assert.ok(resolveNoblemanOfExtermination(second.state, second.plan, { cardId: SPELL_ID }));
});

test('assento físico 2 usa sua mão privada e preserva o dono físico do alvo', () => {
  const { activation, sourceUid, targetUid } = setup({ first: 2, targetKind: 'trap' });
  assert.ok(activation);
  assert.equal(activation.plan.ownerSeat, 2);
  const result = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.ok(result.state.core.players[0].banished?.some(card => card.uid === targetUid));
});

test('mão acima de seis não é truncada antes da End Phase', () => {
  const duel = makeDuel(0);
  const hand = privateZone(duel, 0, 'hand');
  const deck = privateZone(duel, 0, 'deck');
  hand.push(...deck.splice(0, 5));
  const sourceUid = putSpell(duel, 0);
  const targetUid = placeBackrow(duel, 2, 1, TRAP_ID);
  const activation = activateNoblemanOfExtermination(duel, sourceUid, targetUid, { cardId: SPELL_ID });
  assert.ok(activation);
  const size = privateZone(activation.state, 0, 'hand').length;
  const result = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(privateZone(result.state, 0, 'hand').length, size);
  assert.equal(size, 8);
});

test('Deck 20–30, Extra 5, zonas 3+3 e Field Zone separada permanecem válidos', () => {
  const duel = makeDuel(0);
  assertNoblemanRules(duel);
  assert.equal(duel.core.players[0].backrow.length, 0);
  assert.equal(duel.core.players[0].field, null);
});

test('plano adulterado, turno ou equipe incompatível é rejeitado', () => {
  const { activation } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  assert.equal(resolveNoblemanOfExtermination(activation.state, { ...activation.plan, turn: activation.plan.turn + 1 }, { cardId: SPELL_ID }), null);
  assert.equal(resolveNoblemanOfExtermination(activation.state, { ...activation.plan, ownerTeam: 1 }, { cardId: SPELL_ID }), null);
  assert.equal(resolveNoblemanOfExtermination(activation.state, { ...activation.plan, eventId: 'forged' }, { cardId: SPELL_ID }), null);
});

test('inventário e UIDs são conservados após alvo e cópias irem para banidos', () => {
  const { activation } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  setCopiesInAllMainDecks(activation.state, TRAP_ID, 2);
  const before = inventory(activation.state);
  const result = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(inventory(result.state), before);
  assert.equal(new Set(inventory(result.state).map(value => value.split('|')[0])).size, inventory(result.state).length);
});

test('revelação inclui reservas físicas sem alterar mãos privadas', () => {
  const { activation } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  setCopiesInAllMainDecks(activation.state, TRAP_ID, 1);
  const hands = [0, 1, 2, 3].map(seat => privateZone(activation.state, seat, 'hand').map(card => card.uid));
  const result = resolveNoblemanOfExtermination(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual([0, 1, 2, 3].map(seat => privateZone(result.state, seat, 'hand').map(card => card.uid)), hands);
  assert.deepEqual(result.revealedDecks.map(deck => deck.seat), [0, 1, 2, 3]);
});

test('revelação só é publicada na resolução, nunca no plano de ativação', () => {
  const { activation } = setup({ targetKind: 'trap' });
  assert.ok(activation);
  assert.equal('revealedDecks' in activation, false);
  assert.equal('banishedTarget' in activation, false);
  assert.equal('targetId' in activation.plan, false);
});
