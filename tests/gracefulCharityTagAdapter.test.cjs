const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagNormalCardIds, tagInventory } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const {
  GRACEFUL_CHARITY_ID,
  activateGracefulCharity,
  resolveGracefulCharity,
  assertGracefulCharityRules,
} = require('../dist/gracefulCharityTagAdapter.js');

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
  return createTagDuel(players, { seed: 'm618-graceful-charity', first, classic: true });
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
function inventory(duel) {
  return tagInventory(duel).map(card => card.uid + '|' + card.id).sort();
}
function setup(first = 0) {
  const duel = makeDuel(first);
  const sourceUid = putCardInHand(duel, first, SPELL_ID);
  const deckBefore = privateZone(duel, first, 'deck').map(card => card.uid);
  const activation = activateGracefulCharity(duel, sourceUid, { cardId: SPELL_ID });
  assert.ok(activation);
  return { duel, sourceUid, deckBefore, activation };
}

test('ativa apenas da mão privada do assento físico ativo na Main Phase', () => {
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
  assert.equal(activateGracefulCharity(duel, sourceUid, { cardId: SPELL_ID }), null);
});

test('rejeita Spell da mão adversária', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 1, SPELL_ID);
  assert.equal(activateGracefulCharity(duel, sourceUid, { cardId: SPELL_ID }), null);
});

test('rejeita Battle Phase, resposta, corrente aberta e hand flow', () => {
  const battle = makeDuel(0);
  const battleUid = putCardInHand(battle, 0, SPELL_ID);
  battle.core.phase = 'battle';
  assert.equal(activateGracefulCharity(battle, battleUid, { cardId: SPELL_ID }), null);

  const response = makeDuel(0);
  const responseUid = putCardInHand(response, 0, SPELL_ID);
  response.core.phase = 'response';
  assert.equal(activateGracefulCharity(response, responseUid, { cardId: SPELL_ID }), null);

  const chain = makeDuel(0);
  const chainUid = putCardInHand(chain, 0, SPELL_ID);
  chain.core.chain.push({ actor: 0, card: chainUid, id: SPELL_ID, target: '' });
  assert.equal(activateGracefulCharity(chain, chainUid, { cardId: SPELL_ID }), null);

  const overflow = makeDuel(0);
  const overflowUid = putCardInHand(overflow, 0, SPELL_ID);
  overflow.core.handFlow = { actor: 0, remaining: 0, mode: 'overflow', returnPhase: 'main', after: [] };
  assert.equal(activateGracefulCharity(overflow, overflowUid, { cardId: SPELL_ID }), null);
});

test('não aceita um monstro como fonte da Normal Spell', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, MONSTER_ID);
  assert.equal(activateGracefulCharity(duel, sourceUid, { cardId: MONSTER_ID }), null);
});

test('compra exatamente três do topo do Deck físico e descarta duas após a compra', () => {
  const { activation, deckBefore, sourceUid } = setup();
  const selected = deckBefore.slice(0, 2);
  const before = inventory(activation.state);
  const result = resolveGracefulCharity(activation.state, activation.plan, selected, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(result.drawnUids, deckBefore.slice(0, 3));
  assert.deepEqual(result.discardedUids, selected);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
  for (const uid of selected) {
    assert.ok(result.state.core.players[0].grave.some(card => card.uid === uid));
    assert.equal(privateZone(result.state, 0, 'hand').some(card => card.uid === uid), false);
  }
  assert.ok(privateZone(result.state, 0, 'hand').some(card => card.uid === deckBefore[2]));
  assert.deepEqual(inventory(result.state), before);
});

test('permite descartar cartas que já estavam na mão antes da compra', () => {
  const { activation } = setup();
  const oldHand = privateZone(activation.state, 0, 'hand').map(card => card.uid);
  const drawn = privateZone(activation.state, 0, 'deck').slice(0, 3).map(card => card.uid);
  const result = resolveGracefulCharity(activation.state, activation.plan, [oldHand[0], drawn[0]], { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(result.discardedUids, [oldHand[0], drawn[0]]);
  assert.ok(result.drawnUids.includes(drawn[2]));
});

test('rejeita descarte de apenas uma carta', () => {
  const { activation, deckBefore } = setup();
  assert.equal(resolveGracefulCharity(activation.state, activation.plan, [deckBefore[0]], { cardId: SPELL_ID }), null);
});

test('rejeita descarte de três cartas', () => {
  const { activation, deckBefore } = setup();
  assert.equal(resolveGracefulCharity(activation.state, activation.plan, deckBefore.slice(0, 3), { cardId: SPELL_ID }), null);
});

test('rejeita UIDs repetidos sem mutação parcial', () => {
  const { activation, deckBefore } = setup();
  const before = JSON.stringify(activation.state);
  assert.equal(resolveGracefulCharity(activation.state, activation.plan, [deckBefore[0], deckBefore[0]], { cardId: SPELL_ID }), null);
  assert.equal(JSON.stringify(activation.state), before);
});

test('rejeita seleção stale ou UID inexistente sem comprar parcialmente', () => {
  const { activation } = setup();
  const before = JSON.stringify(activation.state);
  assert.equal(resolveGracefulCharity(activation.state, activation.plan, ['m0:not-in-hand', 'm0:missing'], { cardId: SPELL_ID }), null);
  assert.equal(JSON.stringify(activation.state), before);
});

test('permite descartar qualquer tipo de carta, incluindo Spell e Trap', () => {
  const { activation } = setup();
  const hand = privateZone(activation.state, 0, 'hand');
  hand[0].id = SPELL_ID;
  hand[1].id = TRAP_ID;
  const selected = [hand[0].uid, hand[1].uid];
  const result = resolveGracefulCharity(activation.state, activation.plan, selected, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(result.discardedUids, selected);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === selected[0]));
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === selected[1]));
});

test('rejeita cartas da mão privada do parceiro ou do adversário', () => {
  const { activation } = setup();
  const partnerUid = privateZone(activation.state, 2, 'hand')[0].uid;
  const opponentUid = privateZone(activation.state, 1, 'hand')[0].uid;
  assert.equal(resolveGracefulCharity(activation.state, activation.plan, [partnerUid, opponentUid], { cardId: SPELL_ID }), null);
});

test('revalida se a fonte ainda está no Cemitério da equipe proprietária', () => {
  const { activation, sourceUid } = setup();
  const changed = structuredClone(activation.state);
  const index = changed.core.players[0].grave.findIndex(card => card.uid === sourceUid);
  const [source] = changed.core.players[0].grave.splice(index, 1);
  privateZone(changed, 0, 'hand').push(source);
  assert.equal(resolveGracefulCharity(changed, activation.plan, ['m0:a', 'm0:b'], { cardId: SPELL_ID }), null);
});

test('não aceita a fonte no Cemitério da equipe errada', () => {
  const { activation, sourceUid } = setup();
  const changed = structuredClone(activation.state);
  const index = changed.core.players[0].grave.findIndex(card => card.uid === sourceUid);
  const [source] = changed.core.players[0].grave.splice(index, 1);
  changed.core.players[1].grave.push(source);
  assert.equal(resolveGracefulCharity(changed, activation.plan, ['m0:a', 'm0:b'], { cardId: SPELL_ID }), null);
});

test('negação não compra nem descarta e mantém a Spell no Cemitério', () => {
  const { activation, sourceUid } = setup();
  const deckBefore = privateZone(activation.state, 0, 'deck').map(card => card.uid);
  const handBefore = privateZone(activation.state, 0, 'hand').map(card => card.uid);
  const result = resolveGracefulCharity(activation.state, activation.plan, [], { cardId: SPELL_ID, negated: true });
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.deepEqual(result.drawnUids, []);
  assert.deepEqual(result.discardedUids, []);
  assert.deepEqual(privateZone(result.state, 0, 'deck').map(card => card.uid), deckBefore);
  assert.deepEqual(privateZone(result.state, 0, 'hand').map(card => card.uid), handBefore);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
});

test('negação com seleção de cartas é rejeitada atomicamente', () => {
  const { activation, deckBefore } = setup();
  const before = JSON.stringify(activation.state);
  assert.equal(resolveGracefulCharity(activation.state, activation.plan, deckBefore.slice(0, 2), { cardId: SPELL_ID, negated: true }), null);
  assert.equal(JSON.stringify(activation.state), before);
});

test('não ativa se o Deck privado tiver menos de três cartas', () => {
  const duel = makeDuel(0);
  const deck = privateZone(duel, 0, 'deck');
  const moved = deck.splice(0, deck.length - 2);
  duel.core.players[0].grave.push(...moved);
  const sourceUid = putCardInHand(duel, 0, SPELL_ID);
  assert.equal(privateZone(duel, 0, 'deck').length, 2);
  assert.equal(activateGracefulCharity(duel, sourceUid, { cardId: SPELL_ID }), null);
});

test('rejeita resolução se o Deck ficar abaixo de três antes da resolução', () => {
  const { activation } = setup();
  const changed = structuredClone(activation.state);
  const deck = privateZone(changed, 0, 'deck');
  const moved = deck.splice(0, deck.length - 2);
  changed.core.players[0].grave.push(...moved);
  const before = JSON.stringify(changed);
  assert.equal(resolveGracefulCharity(changed, activation.plan, ['m0:a', 'm0:b'], { cardId: SPELL_ID }), null);
  assert.equal(JSON.stringify(changed), before);
});

test('recibo persistido bloqueia replay após resolução', () => {
  const { activation, deckBefore } = setup();
  const selected = deckBefore.slice(0, 2);
  const first = resolveGracefulCharity(activation.state, activation.plan, selected, { cardId: SPELL_ID });
  assert.ok(first);
  assert.equal(resolveGracefulCharity(first.state, activation.plan, selected, { cardId: SPELL_ID }), null);
  const roundTrip = JSON.parse(JSON.stringify(first.state));
  assert.equal(resolveGracefulCharity(roundTrip, activation.plan, selected, { cardId: SPELL_ID }), null);
});

test('duas cópias físicas podem ser ativadas no mesmo turno', () => {
  const duel = makeDuel(0);
  const hand = privateZone(duel, 0, 'hand');
  const firstUid = hand[0].uid;
  const secondUid = hand[1].uid;
  hand[0].id = SPELL_ID;
  hand[1].id = SPELL_ID;
  const first = activateGracefulCharity(duel, firstUid, { cardId: SPELL_ID });
  assert.ok(first);
  const firstDraw = privateZone(first.state, 0, 'deck').slice(0, 3).map(card => card.uid);
  const resolved = resolveGracefulCharity(first.state, first.plan, firstDraw.slice(0, 2), { cardId: SPELL_ID });
  assert.ok(resolved);
  const second = activateGracefulCharity(resolved.state, secondUid, { cardId: SPELL_ID });
  assert.ok(second);
});

test('assento 2 usa seu próprio Deck e mão, mantendo o parceiro físico isolado', () => {
  const { activation, deckBefore } = setup(2);
  const partnerDeckBefore = privateZone(activation.state, 0, 'deck').map(card => card.uid);
  const selected = deckBefore.slice(0, 2);
  const result = resolveGracefulCharity(activation.state, activation.plan, selected, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.plan, undefined);
  assert.equal(result.state.active[0], 2);
  assert.deepEqual(privateZone(result.state, 0, 'deck').map(card => card.uid), partnerDeckBefore);
  assert.ok(privateZone(result.state, 2, 'hand').some(card => card.uid === deckBefore[2]));
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === selected[0]));
});

test('mão acima de seis não é truncada: o descarte próprio da carta é exatamente dois', () => {
  const duel = makeDuel(0);
  const hand = privateZone(duel, 0, 'hand');
  const deck = privateZone(duel, 0, 'deck');
  hand.push(...deck.splice(0, 2));
  const sourceUid = putCardInHand(duel, 0, SPELL_ID);
  assert.equal(hand.length, 7);
  const activation = activateGracefulCharity(duel, sourceUid, { cardId: SPELL_ID });
  assert.ok(activation);
  const drawUids = privateZone(activation.state, 0, 'deck').slice(0, 3).map(card => card.uid);
  const result = resolveGracefulCharity(activation.state, activation.plan, drawUids.slice(0, 2), { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(privateZone(result.state, 0, 'hand').length, 7);
  assert.equal(result.state.core.handFlow, null);
  assert.deepEqual(result.discardedUids, drawUids.slice(0, 2));
});

test('entrada original e estado entre ativação/resolução permanecem imutáveis', () => {
  const { duel, activation, deckBefore } = setup();
  const original = JSON.stringify(duel);
  const activated = JSON.stringify(activation.state);
  const result = resolveGracefulCharity(activation.state, activation.plan, deckBefore.slice(0, 2), { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(JSON.stringify(duel), original);
  assert.equal(JSON.stringify(activation.state), activated);
});

test('mantém três Monster Zones e três Spell/Trap Zones; Field Zone é separada', () => {
  const { duel } = setup();
  assertGracefulCharityRules(duel);
  assert.equal(duel.core.players[0].monsters.length, 0);
  assert.equal(duel.core.players[0].backrow.length, 0);
  assert.equal(duel.core.players[0].field, null);
});

test('rejeita plano adulterado, de outro turno ou com equipe incompatível', () => {
  const { activation, deckBefore } = setup();
  const selected = deckBefore.slice(0, 2);
  assert.equal(resolveGracefulCharity(activation.state, { ...activation.plan, turn: activation.plan.turn + 1 }, selected, { cardId: SPELL_ID }), null);
  assert.equal(resolveGracefulCharity(activation.state, { ...activation.plan, ownerTeam: 1 }, selected, { cardId: SPELL_ID }), null);
  assert.equal(resolveGracefulCharity(activation.state, { ...activation.plan, eventId: 'forged' }, selected, { cardId: SPELL_ID }), null);
});

test('inventário e UIDs físicos são conservados após comprar três e descartar duas', () => {
  const { activation, deckBefore } = setup();
  const before = inventory(activation.state);
  const result = resolveGracefulCharity(activation.state, activation.plan, deckBefore.slice(0, 2), { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(inventory(result.state), before);
  assert.equal(new Set(inventory(result.state).map(value => value.split('|')[0])).size, inventory(result.state).length);
});

test('a identidade real permanece explicitamente fora do catálogo usado pelos fixtures', () => {
  assert.equal(enabledCardIds.includes(GRACEFUL_CHARITY_ID), false);
  assert.equal(getDuelCard(GRACEFUL_CHARITY_ID), undefined);
});
