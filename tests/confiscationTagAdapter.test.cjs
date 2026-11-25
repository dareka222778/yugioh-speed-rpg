const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagNormalCardIds, tagInventory, publicTagDuel } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const {
  CONFISCATION_ID,
  activateConfiscation,
  inspectConfiscationHand,
  resolveConfiscation,
  assertConfiscationRules,
} = require('../dist/confiscationTagAdapter.js');

const MONSTER_ID = tagNormalCardIds.find(id => getDuelCard(id)?.kind === 'monster');
const SPELL_ID = enabledCardIds.find(id => {
  const card = getDuelCard(id);
  return card?.kind === 'spell' && card.field !== true;
});
const TRAP_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'trap');
const FIELD_ID = enabledCardIds.find(id => getDuelCard(id)?.field === true);
const FUSION_ID = enabledCardIds.find(id => getDuelCard(id)?.fusion === true);
assert.ok(MONSTER_ID);
assert.ok(SPELL_ID);
assert.ok(TRAP_ID);
assert.equal(CONFISCATION_ID, '17375316');

function makeDuel(first = 0, extraCount = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  assert.equal(deck.length, 20);
  const extra = extraCount && FUSION_ID ? Array(extraCount).fill(FUSION_ID) : [];
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i, name: 'Member ' + i, cards: [...deck], extra: [...extra],
  }));
  return createTagDuel(players, { seed: 'm625-confiscation', first, classic: true });
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
  const team = first % 2;
  const opponentTeam = 1 - team;
  const opponentSeat = duel.active[opponentTeam];
  const sourceUid = putCardInHand(duel, first, SPELL_ID);
  const activation = activateConfiscation(duel, sourceUid, { cardId: SPELL_ID });
  assert.ok(activation);
  return { duel, sourceUid, team, opponentTeam, opponentSeat, activation };
}

test('ativa da mão privada do assento ativo, paga 1000 LP compartilhados e envia a Spell ao GY', () => {
  const { duel, sourceUid, team, activation } = setup();
  assert.equal(activation.plan.ownerSeat, 0);
  assert.equal(activation.plan.ownerTeam, team);
  assert.equal(activation.state.core.players[team].lp, duel.core.players[team].lp - 1000);
  assert.ok(activation.state.core.players[team].grave.some(card => card.uid === sourceUid));
  assert.equal(privateZone(activation.state, 0, 'hand').some(card => card.uid === sourceUid), false);
  assert.ok(privateZone(duel, 0, 'hand').some(card => card.uid === sourceUid), 'a entrada não é mutada');
});

test('rejeita ativação a partir da mão privada do parceiro inativo', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 2, SPELL_ID);
  assert.equal(activateConfiscation(duel, sourceUid, { cardId: SPELL_ID }), null);
});

test('rejeita ativação a partir da mão adversária', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 1, SPELL_ID);
  assert.equal(activateConfiscation(duel, sourceUid, { cardId: SPELL_ID }), null);
});

test('rejeita monstro como fonte da Normal Spell', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, MONSTER_ID);
  assert.equal(activateConfiscation(duel, sourceUid, { cardId: MONSTER_ID }), null);
});

test('rejeita ativação fora da Main Phase e durante resposta', () => {
  const battle = makeDuel(0);
  const battleUid = putCardInHand(battle, 0, SPELL_ID);
  battle.core.phase = 'battle';
  assert.equal(activateConfiscation(battle, battleUid, { cardId: SPELL_ID }), null);
  const response = makeDuel(0);
  const responseUid = putCardInHand(response, 0, SPELL_ID);
  response.core.phase = 'response';
  assert.equal(activateConfiscation(response, responseUid, { cardId: SPELL_ID }), null);
});

test('rejeita corrente aberta, escolha pendente e descarte de End Phase', () => {
  const chain = makeDuel(0);
  const chainUid = putCardInHand(chain, 0, SPELL_ID);
  chain.core.chain.push({ actor: 0, card: chainUid, id: SPELL_ID, target: '' });
  assert.equal(activateConfiscation(chain, chainUid, { cardId: SPELL_ID }), null);
  const choice = makeDuel(0);
  const choiceUid = putCardInHand(choice, 0, SPELL_ID);
  choice.core.phase = 'choice';
  choice.core.choice = { actor: 0, targets: [] };
  assert.equal(activateConfiscation(choice, choiceUid, { cardId: SPELL_ID }), null);
  const discard = makeDuel(0);
  const discardUid = putCardInHand(discard, 0, SPELL_ID);
  discard.core.phase = 'discard';
  assert.equal(activateConfiscation(discard, discardUid, { cardId: SPELL_ID }), null);
});

test('não ativa se a mão do assento adversário ativo estiver vazia', () => {
  const duel = makeDuel(0);
  const opponent = privateZone(duel, 1, 'hand');
  duel.core.players[1].grave.push(...opponent.splice(0));
  const sourceUid = putCardInHand(duel, 0, SPELL_ID);
  const before = JSON.stringify(duel);
  assert.equal(activateConfiscation(duel, sourceUid, { cardId: SPELL_ID }), null);
  assert.equal(JSON.stringify(duel), before);
});

test('não paga custo se o LP compartilhado for igual ou inferior a 1000', () => {
  for (const lp of [1000, 999, 1, 0]) {
    const duel = makeDuel(0);
    duel.core.players[0].lp = lp;
    const sourceUid = putCardInHand(duel, 0, SPELL_ID);
    const before = JSON.stringify(duel);
    assert.equal(activateConfiscation(duel, sourceUid, { cardId: SPELL_ID }), null);
    assert.equal(JSON.stringify(duel), before);
  }
});

test('assento 2 paga do LP compartilhado da equipe 0 e inspeciona o assento 3', () => {
  const { duel, activation } = setup(2);
  assert.equal(activation.plan.ownerSeat, 2);
  assert.equal(activation.plan.ownerTeam, 0);
  assert.equal(activation.plan.opponentSeat, 3);
  assert.equal(activation.plan.opponentTeam, 1);
  assert.equal(activation.state.core.players[0].lp, duel.core.players[0].lp - 1000);
});

test('plano não guarda alvo nem identidade da mão adversária na ativação', () => {
  const { activation } = setup();
  assert.equal('targetUid' in activation.plan, false);
  assert.equal('targetBinding' in activation.plan, false);
  assert.equal('revealedHand' in activation.plan, false);
});

test('inspeção retorna somente a mão do assento adversário ativo para o assento resolvedor', () => {
  const { activation, opponentSeat } = setup();
  const partnerSeat = opponentSeat === 1 ? 3 : 1;
  const expected = privateZone(activation.state, opponentSeat, 'hand').map(card => ({ uid: card.uid, id: card.id }));
  const partner = privateZone(activation.state, partnerSeat, 'hand').map(card => card.uid);
  const reveal = inspectConfiscationHand(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(reveal);
  assert.equal(reveal.privateToSeat, activation.plan.ownerSeat);
  assert.equal(reveal.opponentSeat, opponentSeat);
  assert.deepEqual(reveal.cards, expected);
  assert.ok(reveal.cards.every(card => !partner.includes(card.uid)));
});

test('inspeção privada é efêmera e não muta o estado', () => {
  const { activation } = setup();
  const before = JSON.stringify(activation.state);
  const reveal = inspectConfiscationHand(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(reveal);
  assert.equal(JSON.stringify(activation.state), before);
  assert.equal('confiscationPrivateReveal' in activation.state, false);
});

test('seleção acontece na resolução e pode escolher carta que entrou na mão depois da ativação', () => {
  const { activation, opponentSeat } = setup();
  const hand = privateZone(activation.state, opponentSeat, 'hand');
  const stale = hand.shift();
  activation.state.core.players[opponentSeat % 2].grave.push(stale);
  const drawn = privateZone(activation.state, opponentSeat, 'deck').shift();
  assert.ok(stale && drawn);
  hand.push(drawn);
  const reveal = inspectConfiscationHand(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(reveal);
  assert.equal(reveal.cards.some(card => card.uid === stale.uid), false);
  assert.ok(reveal.cards.some(card => card.uid === drawn.uid));
  const result = resolveConfiscation(activation.state, activation.plan, drawn.uid, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.discardedUid, drawn.uid);
});

test('descarta exatamente a carta escolhida para o GY da equipe adversária', () => {
  const { activation, opponentSeat, opponentTeam } = setup();
  const selected = privateZone(activation.state, opponentSeat, 'hand')[1];
  const before = inventory(activation.state);
  const result = resolveConfiscation(activation.state, activation.plan, selected.uid, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.discardedUid, selected.uid);
  assert.equal(result.discardedId, selected.id);
  assert.ok(result.state.core.players[opponentTeam].grave.some(card => card.uid === selected.uid));
  assert.equal(privateZone(result.state, opponentSeat, 'hand').some(card => card.uid === selected.uid), false);
  assert.deepEqual(inventory(result.state), before);
});

test('não aceita UID que saiu da mão antes da resolução', () => {
  const { activation, opponentSeat } = setup();
  const selected = privateZone(activation.state, opponentSeat, 'hand').shift();
  activation.state.core.players[opponentSeat % 2].grave.push(selected);
  const before = JSON.stringify(activation.state);
  assert.equal(resolveConfiscation(activation.state, activation.plan, selected.uid, { cardId: SPELL_ID }), null);
  assert.equal(JSON.stringify(activation.state), before);
});

test('não permite descartar carta da mão privada do parceiro inativo', () => {
  const { activation, opponentSeat } = setup();
  const partnerSeat = opponentSeat === 1 ? 3 : 1;
  const partnerCard = privateZone(activation.state, partnerSeat, 'hand')[0];
  assert.equal(resolveConfiscation(activation.state, activation.plan, partnerCard.uid, { cardId: SPELL_ID }), null);
});

test('não permite descartar carta da própria equipe ou de outro assento', () => {
  const { activation } = setup();
  const own = privateZone(activation.state, 0, 'hand')[0];
  assert.equal(resolveConfiscation(activation.state, activation.plan, own.uid, { cardId: SPELL_ID }), null);
});

test('negação conserva o custo de LP e a Spell no GY, sem revelar nem descartar', () => {
  const { activation, opponentSeat, sourceUid, opponentTeam } = setup();
  const handBefore = privateZone(activation.state, opponentSeat, 'hand').map(card => card.uid);
  const lpAfterCost = activation.state.core.players[0].lp;
  const result = resolveConfiscation(activation.state, activation.plan, null, { cardId: SPELL_ID, negated: true });
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.equal(result.discardedUid, null);
  assert.deepEqual(privateZone(result.state, opponentSeat, 'hand').map(card => card.uid), handBefore);
  assert.equal(result.state.core.players[0].lp, lpAfterCost);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.equal(result.state.core.players[opponentTeam].grave.some(card => card.uid === handBefore[0]), false);
});

test('negação com UID selecionado é rejeitada sem mutação', () => {
  const { activation, opponentSeat } = setup();
  const selected = privateZone(activation.state, opponentSeat, 'hand')[0];
  const before = JSON.stringify(activation.state);
  assert.equal(resolveConfiscation(activation.state, activation.plan, selected.uid, { cardId: SPELL_ID, negated: true }), null);
  assert.equal(JSON.stringify(activation.state), before);
});

test('se a mão ficar vazia antes da resolução, o efeito resolve sem descartar carta', () => {
  const { activation, opponentSeat } = setup();
  const hand = privateZone(activation.state, opponentSeat, 'hand');
  activation.state.core.players[opponentSeat % 2].grave.push(...hand.splice(0));
  const result = resolveConfiscation(activation.state, activation.plan, null, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.noCardToDiscard, true);
  assert.equal(result.discardedUid, null);
});

test('recibo serializável impede replay', () => {
  const { activation, opponentSeat } = setup();
  const selected = privateZone(activation.state, opponentSeat, 'hand')[0];
  const first = resolveConfiscation(activation.state, activation.plan, selected.uid, { cardId: SPELL_ID });
  assert.ok(first);
  const restored = JSON.parse(JSON.stringify(first.state));
  assert.equal(resolveConfiscation(restored, activation.plan, selected.uid, { cardId: SPELL_ID }), null);
});

test('rejeita resolução se a fonte não estiver no GY da equipe proprietária', () => {
  const { activation, sourceUid } = setup();
  const changed = structuredClone(activation.state);
  const index = changed.core.players[0].grave.findIndex(card => card.uid === sourceUid);
  const [source] = changed.core.players[0].grave.splice(index, 1);
  privateZone(changed, 0, 'hand').push(source);
  assert.equal(resolveConfiscation(changed, activation.plan, null, { cardId: SPELL_ID }), null);
});

test('rejeita plano adulterado, equipe ou assento adversário incompatível', () => {
  const { activation } = setup();
  assert.equal(resolveConfiscation(activation.state, { ...activation.plan, eventId: 'forged' }, null, { cardId: SPELL_ID }), null);
  assert.equal(resolveConfiscation(activation.state, { ...activation.plan, opponentSeat: 3 }, null, { cardId: SPELL_ID }), null);
  assert.equal(resolveConfiscation(activation.state, { ...activation.plan, ownerTeam: 1 }, null, { cardId: SPELL_ID }), null);
});

test('mão acima de seis não é truncada antes da End Phase', () => {
  const { activation, opponentSeat } = setup();
  const hand = privateZone(activation.state, opponentSeat, 'hand');
  hand.push(...privateZone(activation.state, opponentSeat, 'deck').splice(0, 3));
  assert.equal(hand.length, 8);
  const result = resolveConfiscation(activation.state, activation.plan, hand[0].uid, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(privateZone(result.state, opponentSeat, 'hand').length, 7);
});

test('snapshot público não revela IDs ou UIDs da mão privada', () => {
  const { activation, opponentSeat } = setup();
  const hidden = privateZone(activation.state, opponentSeat, 'hand').map(card => card.uid + card.id);
  const publicSnapshot = JSON.stringify(publicTagDuel(activation.state));
  for (const value of hidden) assert.equal(publicSnapshot.includes(value), false);
  assert.equal(publicSnapshot.includes('revealedHand'), false);
});

test('inventário físico e UIDs são conservados após o descarte', () => {
  const { activation, opponentSeat } = setup();
  const selected = privateZone(activation.state, opponentSeat, 'hand')[0];
  const before = inventory(activation.state);
  const result = resolveConfiscation(activation.state, activation.plan, selected.uid, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(inventory(result.state), before);
  assert.equal(new Set(inventory(result.state).map(value => value.split('|')[0])).size, inventory(result.state).length);
});

test('Deck principal por assento permanece entre 20 e 30 e Extra Deck até cinco', () => {
  const duel = makeDuel(0);
  assertConfiscationRules(duel);
  const short = structuredClone(duel);
  short.core.players[0].deck.pop();
  assert.throws(() => assertConfiscationRules(short), /Deck principal físico/);
  if (FUSION_ID) {
    const oversized = makeDuel(0, 6);
    assert.throws(() => assertConfiscationRules(oversized), /Deck Adicional físico/);
  }
});

test('três zonas de S/T não contam a Field Zone separada', t => {
  if (!FIELD_ID) { t.skip('nenhuma Field Spell habilitada no fixture atual'); return; }
  const duel = makeDuel(0);
  const backrow = duel.core.players[0].backrow;
  for (let i = 0; i < 3; i++) {
    const card = privateZone(duel, 0, 'deck').shift();
    card.id = TRAP_ID;
    backrow.push({ ...card, faceUp: false, setTurn: 0 });
  }
  const fieldCard = privateZone(duel, 0, 'deck').shift();
  fieldCard.id = FIELD_ID;
  duel.core.players[0].field = { ...fieldCard, faceUp: true, setTurn: 0 };
  assertConfiscationRules(duel);
  assert.equal(backrow.length, 3);
  assert.ok(duel.core.players[0].field);
});

test('rejeita quatro cartas no backrow compartilhado da equipe', () => {
  const duel = makeDuel(0);
  const backrow = duel.core.players[0].backrow;
  for (let i = 0; i < 4; i++) {
    const card = privateZone(duel, 0, 'deck').shift();
    card.id = TRAP_ID;
    backrow.push({ ...card, faceUp: false, setTurn: 0 });
  }
  assert.throws(() => assertConfiscationRules(duel), /três Zonas de Magias\/Armadilhas/);
});
