const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagNormalCardIds, tagInventory } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { getMonsterEffect } = require('../dist/monsterEffects.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { createTokenGroup } = require('../dist/tokens.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  NOBLEMAN_OF_CROSSOUT_ID,
  activateNoblemanOfCrossout,
  resolveNoblemanOfCrossout,
  assertNoblemanRules,
  assertPhysicalExtraDeckCounts,
} = require('../dist/noblemanOfCrossoutTagAdapter.js');

const MONSTER_ID = tagNormalCardIds.find(id => getDuelCard(id)?.kind === 'monster');
const FLIP_ID = enabledCardIds.find(id => getMonsterEffect(id)?.trigger === 'flip');
const SPELL_ID = enabledCardIds.find(id => {
  const card = getDuelCard(id);
  return card?.kind === 'spell' && card.field !== true;
});
assert.ok(MONSTER_ID);
assert.ok(FLIP_ID, 'a fixture Flip monster must be present in the enabled catalog');
assert.ok(SPELL_ID);
assert.ok(NOBLEMAN_OF_CROSSOUT_ID);
const FLIP_NAME = rulesCardName(getDuelCard(FLIP_ID));

function makeDuel(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  assert.equal(deck.length, 20);
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i, name: 'Member ' + i, cards: [...deck], extra: [],
  }));
  return createTagDuel(players, { seed: 'm621-nobleman', first, classic: true });
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
function placeTarget(duel, seat, controllerTeam, id, faceUp = false) {
  const hand = privateZone(duel, seat, 'hand');
  const [card] = hand.splice(0, 1);
  assert.ok(card);
  card.id = id;
  duel.core.players[controllerTeam].monsters.push({
    ...card,
    owner: seat % 2,
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
function setup({ first = 0, flip = true, controller = 1, owner = 0, faceUp = false } = {}) {
  const duel = makeDuel(first);
  const sourceUid = putSpell(duel, first, 0);
  const targetSeat = owner === 0 ? (first === 0 ? 2 : 0) : 1;
  const targetUid = placeTarget(duel, targetSeat, controller, flip ? FLIP_ID : MONSTER_ID, faceUp);
  const activation = activateNoblemanOfCrossout(duel, sourceUid, targetUid, { cardId: SPELL_ID });
  return { duel, sourceUid, targetUid, targetSeat, activation };
}
function inventory(duel) {
  return tagInventory(duel).filter(card => card.entityKind !== 'token')
    .map(card => card.uid + '|' + card.id).sort();
}
function setCopiesInAllMainDecks(duel, id = FLIP_ID, count = 2) {
  for (const seat of [0, 1, 2, 3]) {
    const deck = privateZone(duel, seat, 'deck');
    for (let i = 0; i < count; i++) deck[i].id = id;
  }
}

test('ativa da mão privada do assento físico ativo e mantém a identidade do alvo oculta', () => {
  const { activation, sourceUid, targetUid, duel } = setup();
  assert.ok(activation);
  assert.equal(activation.plan.ownerSeat, 0);
  assert.equal(activation.plan.ownerTeam, 0);
  assert.equal(activation.plan.targetUid, targetUid);
  assert.equal('targetId' in activation.plan, false);
  assert.ok(activation.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.ok(privateZone(duel, 0, 'hand').some(card => card.uid === sourceUid));
});

test('rejeita fonte na mão do parceiro físico inativo ou do adversário', () => {
  const partner = makeDuel(0);
  const partnerSource = putSpell(partner, 2, 0);
  const partnerTarget = placeTarget(partner, 3, 1, FLIP_ID, false);
  assert.equal(activateNoblemanOfCrossout(partner, partnerSource, partnerTarget, { cardId: SPELL_ID }), null);

  const opponent = makeDuel(0);
  const opponentSource = putSpell(opponent, 1, 0);
  const opponentTarget = placeTarget(opponent, 2, 1, FLIP_ID, false);
  assert.equal(activateNoblemanOfCrossout(opponent, opponentSource, opponentTarget, { cardId: SPELL_ID }), null);
});

test('rejeita fonte que não seja Normal Spell', () => {
  const duel = makeDuel(0);
  const hand = privateZone(duel, 0, 'hand');
  hand[0].id = MONSTER_ID;
  const targetUid = placeTarget(duel, 2, 1, FLIP_ID, false);
  assert.equal(activateNoblemanOfCrossout(duel, hand[0].uid, targetUid, { cardId: MONSTER_ID }), null);
});

test('rejeita Battle Phase, janela de resposta e corrente aberta', () => {
  for (const phase of ['battle', 'response']) {
    const duel = makeDuel(0);
    const sourceUid = putSpell(duel, 0);
    const targetUid = placeTarget(duel, 2, 1, FLIP_ID, false);
    duel.core.phase = phase;
    assert.equal(activateNoblemanOfCrossout(duel, sourceUid, targetUid, { cardId: SPELL_ID }), null);
  }
  const chain = makeDuel(0);
  const sourceUid = putSpell(chain, 0);
  const targetUid = placeTarget(chain, 2, 1, FLIP_ID, false);
  chain.core.chain.push({ actor: 0, card: sourceUid, id: SPELL_ID, target: '' });
  assert.equal(activateNoblemanOfCrossout(chain, sourceUid, targetUid, { cardId: SPELL_ID }), null);
});

test('só aceita um monstro face-down no campo, não um alvo face-up', () => {
  const valid = setup({ flip: false, faceUp: false });
  assert.ok(valid.activation);
  const invalid = setup({ flip: false, faceUp: true });
  assert.equal(invalid.activation, null);
});

test('não aceita token como alvo face-down', () => {
  const duel = makeDuel(0);
  const sourceUid = putSpell(duel, 0);
  const token = createTokenGroup(duel.core, 1, 1, 'atk')[0];
  assert.equal(activateNoblemanOfCrossout(duel, sourceUid, token.uid, { cardId: SPELL_ID }), null);
});

test('rejeita alvo ausente sem consumir a Spell', () => {
  const duel = makeDuel(0);
  const sourceUid = putSpell(duel, 0);
  const before = inventory(duel);
  assert.equal(activateNoblemanOfCrossout(duel, sourceUid, 'missing', { cardId: SPELL_ID }), null);
  assert.deepEqual(inventory(duel), before);
  assert.ok(privateZone(duel, 0, 'hand').some(card => card.uid === sourceUid));
});

test('Spell sai da mão e vai ao Cemitério na ativação, sem custo adicional', () => {
  const { activation, sourceUid } = setup();
  assert.ok(activation);
  assert.ok(activation.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.equal(privateZone(activation.state, 0, 'hand').some(card => card.uid === sourceUid), false);
});

test('alvo não-Flip é destruído/banido sem revelar os Decks', () => {
  const { activation, targetUid } = setup({ flip: false });
  assert.ok(activation);
  const result = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.flipMonster, false);
  assert.equal(result.banishedTarget.uid, targetUid);
  assert.deepEqual(result.revealedDecks, []);
  assert.deepEqual(result.banishedDeckUids, []);
  assert.ok(result.state.core.players[0].banished?.some(card => card.uid === targetUid));
});

test('Flip monster revela os quatro Decks físicos e bane cópias em todos eles', () => {
  const { activation, targetUid } = setup({ flip: true });
  assert.ok(activation);
  setCopiesInAllMainDecks(activation.state, FLIP_ID, 2);
  const before = inventory(activation.state);
  const result = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.flipMonster, true);
  assert.equal(result.banishedTarget.uid, targetUid);
  assert.equal(result.banishedTarget.name, FLIP_NAME);
  assert.equal(result.revealedDecks.length, 4);
  assert.deepEqual(result.revealedDecks.map(deck => deck.seat), [0, 1, 2, 3]);
  assert.ok(result.revealedDecks.every(deck => deck.cards.length === 16));
  assert.ok(result.revealedDecks.every(deck => deck.cards.filter(card => card.name === FLIP_NAME).length === 2));
  assert.equal(result.banishedDeckUids.length, 8);
  assert.equal(new Set(result.banishedDeckUids).size, 8);
  assert.ok(result.state.core.players[0].banished?.some(card => card.uid === targetUid));
  assert.equal(privateZone(result.state, 0, 'deck').length, 14);
  assert.equal(privateZone(result.state, 1, 'deck').length, 14);
  assert.equal(privateZone(result.state, 2, 'deck').length, 14);
  assert.equal(privateZone(result.state, 3, 'deck').length, 14);
  assert.deepEqual(inventory(result.state), before);
});

test('cada cópia banida do Deck vai para a equipe do proprietário físico', () => {
  const { activation } = setup({ flip: true });
  assert.ok(activation);
  setCopiesInAllMainDecks(activation.state, FLIP_ID, 1);
  const result = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  const team0 = result.banishedDeckUids.filter(uid => Number(uid[1]) % 2 === 0);
  const team1 = result.banishedDeckUids.filter(uid => Number(uid[1]) % 2 === 1);
  assert.equal(team0.length, 2);
  assert.equal(team1.length, 2);
  assert.ok(team0.every(uid => result.state.core.players[0].banished?.some(card => card.uid === uid)));
  assert.ok(team1.every(uid => result.state.core.players[1].banished?.some(card => card.uid === uid)));
});

test('revelação é snapshot ordenado anterior ao banimento das cópias', () => {
  const { activation } = setup({ flip: true });
  assert.ok(activation);
  const original = [0, 1, 2, 3].map(seat => [...privateZone(activation.state, seat, 'deck')].map(card => card.id));
  setCopiesInAllMainDecks(activation.state, FLIP_ID, 2);
  const expected = [0, 1, 2, 3].map(seat => [...privateZone(activation.state, seat, 'deck')].map(card => card.id));
  const result = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(result.revealedDecks.map(deck => deck.cards.map(card => card.id)), expected);
  assert.ok(original.every((ids, seat) => ids.length === privateZone(activation.state, seat, 'deck').length));
});

test('cópias não correspondentes permanecem no Deck e mantêm a ordem relativa', () => {
  const { activation } = setup({ flip: true });
  assert.ok(activation);
  setCopiesInAllMainDecks(activation.state, FLIP_ID, 2);
  const expected = [0, 1, 2, 3].map(seat =>
    privateZone(activation.state, seat, 'deck').slice(2).map(card => card.uid),
  );
  const result = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual([0, 1, 2, 3].map(seat =>
    privateZone(result.state, seat, 'deck').map(card => card.uid),
  ), expected);
});

test('se o alvo Flip sair do campo antes da resolução, nenhum Deck é revelado', () => {
  const { activation, targetUid, targetSeat } = setup({ flip: true });
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const index = changed.core.players[1].monsters.findIndex(card => card.uid === targetUid);
  const [target] = changed.core.players[1].monsters.splice(index, 1);
  privateZone(changed, targetSeat, 'hand').push(target);
  synchronizeCardLifetimes(changed.core);
  const result = resolveNoblemanOfCrossout(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedTarget, null);
  assert.deepEqual(result.revealedDecks, []);
});

test('alvo que sai e retorna com o mesmo UID não reutiliza binding antigo', () => {
  const { activation, targetUid, targetSeat } = setup({ flip: true });
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const index = changed.core.players[1].monsters.findIndex(card => card.uid === targetUid);
  const [target] = changed.core.players[1].monsters.splice(index, 1);
  privateZone(changed, targetSeat, 'hand').push(target);
  synchronizeCardLifetimes(changed.core);
  const hand = privateZone(changed, targetSeat, 'hand');
  const returned = hand.splice(hand.findIndex(card => card.uid === targetUid), 1)[0];
  changed.core.players[1].monsters.push(returned);
  synchronizeCardLifetimes(changed.core);
  const result = resolveNoblemanOfCrossout(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedTarget, null);
  assert.deepEqual(result.revealedDecks, []);
});

test('virar o alvo face-up antes da resolução não troca o alvo nem perde o efeito', () => {
  const { activation, targetUid } = setup({ flip: true });
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const target = changed.core.players[1].monsters.find(card => card.uid === targetUid);
  target.faceUp = true;
  target.position = 'atk';
  const result = resolveNoblemanOfCrossout(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedTarget.uid, targetUid);
  assert.equal(result.flipMonster, true);
  assert.equal(result.revealedDecks.length, 4);
});

test('mudança de controle sem sair da Zona de Monstros preserva o alvo original', () => {
  const { activation, targetUid } = setup({ flip: true });
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const index = changed.core.players[1].monsters.findIndex(card => card.uid === targetUid);
  const [target] = changed.core.players[1].monsters.splice(index, 1);
  changed.core.players[0].monsters.push(target);
  const result = resolveNoblemanOfCrossout(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedTarget.uid, targetUid);
  assert.ok(result.state.core.players[0].banished?.some(card => card.uid === targetUid));
});

test('alvo pertencente à equipe adversária vai para a zona de banidos dessa equipe', () => {
  const { activation, targetUid } = setup({ flip: false, controller: 0, owner: 1 });
  assert.ok(activation);
  const result = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.ok(result.state.core.players[1].banished?.some(card => card.uid === targetUid));
  assert.equal(result.state.core.players[0].banished?.some(card => card.uid === targetUid), false);
});

test('negação não destrói alvo nem revela Decks', () => {
  const { activation, targetUid, sourceUid } = setup({ flip: true });
  assert.ok(activation);
  const result = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID, negated: true });
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.equal(result.banishedTarget, null);
  assert.deepEqual(result.revealedDecks, []);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.ok(result.state.core.players[1].monsters.some(card => card.uid === targetUid));
});

test('recibo persistido impede replay após serialização', () => {
  const { activation } = setup({ flip: true });
  assert.ok(activation);
  const first = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(first);
  assert.equal(resolveNoblemanOfCrossout(first.state, activation.plan, { cardId: SPELL_ID }), null);
  const restored = JSON.parse(JSON.stringify(first.state));
  assert.equal(resolveNoblemanOfCrossout(restored, activation.plan, { cardId: SPELL_ID }), null);
});

test('duas cópias podem ser ativadas em Main Phase no mesmo turno', () => {
  const { activation, targetSeat } = setup({ flip: false });
  assert.ok(activation);
  const first = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(first);
  const hand = privateZone(first.state, 0, 'hand');
  hand[0].id = SPELL_ID;
  const secondSource = hand[0].uid;
  const secondTarget = placeTarget(first.state, targetSeat, 1, FLIP_ID, false);
  const second = activateNoblemanOfCrossout(first.state, secondSource, secondTarget, { cardId: SPELL_ID });
  assert.ok(second);
  assert.ok(resolveNoblemanOfCrossout(second.state, second.plan, { cardId: SPELL_ID }));
});

test('assento físico 2 ativa da própria mão sem confundir o parceiro', () => {
  const { activation, sourceUid, targetUid } = setup({ first: 2, flip: false });
  assert.ok(activation);
  assert.equal(activation.plan.ownerSeat, 2);
  assert.equal(activation.plan.ownerTeam, 0);
  const result = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
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
  const targetUid = placeTarget(duel, 2, 1, MONSTER_ID, false);
  const activation = activateNoblemanOfCrossout(duel, sourceUid, targetUid, { cardId: SPELL_ID });
  assert.ok(activation);
  const size = privateZone(activation.state, 0, 'hand').length;
  const result = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(privateZone(result.state, 0, 'hand').length, size);
  assert.equal(size, 8);
});

test('entrada original e estado de ativação permanecem imutáveis', () => {
  const { duel, sourceUid, targetUid } = setup({ flip: true });
  const before = JSON.stringify(duel);
  const activation = activateNoblemanOfCrossout(duel, sourceUid, targetUid, { cardId: SPELL_ID });
  assert.ok(activation);
  const activationBefore = JSON.stringify(activation.state);
  assert.ok(resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID }));
  assert.equal(JSON.stringify(duel), before);
  assert.equal(JSON.stringify(activation.state), activationBefore);
});

test('Deck 20–30, Extra 5, zonas 3+3 e Field Zone separada são preservados', () => {
  const duel = makeDuel(0);
  assertNoblemanRules(duel);
  assert.equal(duel.core.players[0].monsters.length, 0);
  assert.equal(duel.core.players[0].backrow.length, 0);
  assertPhysicalExtraDeckCounts([0, 0, 0, 0], 5);
  assert.throws(() => assertPhysicalExtraDeckCounts([0, 0, 6, 0], 5));
});

test('revelação só acontece depois de destruir e banir o Flip alvo', () => {
  const { activation, targetUid } = setup({ flip: true });
  assert.ok(activation);
  const result = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.ok(result.state.core.players[0].banished?.some(card => card.uid === targetUid));
  assert.equal(result.revealedDecks.length, 4);
});

test('plano adulterado, de outro turno ou com proprietário incompatível é rejeitado', () => {
  const { activation } = setup({ flip: true });
  assert.ok(activation);
  assert.equal(resolveNoblemanOfCrossout(activation.state, { ...activation.plan, turn: activation.plan.turn + 1 }, { cardId: SPELL_ID }), null);
  assert.equal(resolveNoblemanOfCrossout(activation.state, { ...activation.plan, ownerTeam: 1 }, { cardId: SPELL_ID }), null);
  assert.equal(resolveNoblemanOfCrossout(activation.state, { ...activation.plan, eventId: 'forged' }, { cardId: SPELL_ID }), null);
  assert.equal(resolveNoblemanOfCrossout(activation.state, { ...activation.plan, targetUid: 'm0:forged' }, { cardId: SPELL_ID }), null);
});

test('alvo não-Flip não faz varredura de Decks mesmo que existam cópias iguais', () => {
  const { activation } = setup({ flip: false });
  assert.ok(activation);
  setCopiesInAllMainDecks(activation.state, MONSTER_ID, 1);
  const result = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.flipMonster, false);
  assert.deepEqual(result.revealedDecks, []);
  assert.deepEqual(result.banishedDeckUids, []);
});

test('banimento conserva todos os UIDs e não concede inventário', () => {
  const { activation } = setup({ flip: true });
  assert.ok(activation);
  setCopiesInAllMainDecks(activation.state, FLIP_ID, 2);
  const before = inventory(activation.state);
  const result = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(inventory(result.state), before);
  assert.equal(new Set(inventory(result.state).map(value => value.split('|')[0])).size, inventory(result.state).length);
});

test('revelação inclui Decks de reservas físicas e não altera mãos privadas', () => {
  const { activation } = setup({ flip: true });
  assert.ok(activation);
  setCopiesInAllMainDecks(activation.state, FLIP_ID, 1);
  const hands = [0, 1, 2, 3].map(seat => privateZone(activation.state, seat, 'hand').map(card => card.uid));
  const result = resolveNoblemanOfCrossout(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual([0, 1, 2, 3].map(seat => privateZone(result.state, seat, 'hand').map(card => card.uid)), hands);
  assert.deepEqual(result.revealedDecks.map(deck => deck.seat), [0, 1, 2, 3]);
});

test('revelação não é persistida em um campo público antes da resolução', () => {
  const { activation } = setup({ flip: true });
  assert.ok(activation);
  assert.equal('revealedDecks' in activation, false);
  assert.equal('banishedTarget' in activation, false);
  assert.equal('targetId' in activation.plan, false);
});
