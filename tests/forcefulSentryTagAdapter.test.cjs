const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagNormalCardIds, tagInventory, publicTagDuel } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { tagPrivateDeckForSeat } = require('../dist/tagPrivateHand.js');
const {
  FORCEFUL_SENTRY_ID,
  activateForcefulSentry,
  inspectForcefulSentryHand,
  resolveForcefulSentry,
  assertForcefulSentryRules,
} = require('../dist/forcefulSentryTagAdapter.js');

const MONSTER_ID = tagNormalCardIds.find(id => getDuelCard(id)?.kind === 'monster');
const SPELL_ID = enabledCardIds.find(id => { const c = getDuelCard(id); return c?.kind === 'spell' && c.field !== true; });
const TRAP_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'trap');
const FIELD_ID = enabledCardIds.find(id => getDuelCard(id)?.field === true);
const FUSION_ID = enabledCardIds.find(id => getDuelCard(id)?.fusion === true);
assert.ok(MONSTER_ID);
assert.ok(SPELL_ID);
assert.ok(TRAP_ID);
assert.equal(FORCEFUL_SENTRY_ID, '42829885');

function makeDuel(first = 0, extraCount = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  assert.equal(deck.length, 20);
  const extra = extraCount && FUSION_ID ? Array(extraCount).fill(FUSION_ID) : [];
  const players = [0, 1, 2, 3].map(i => ({ id: 'm' + i, name: 'Member ' + i, cards: [...deck], extra: [...extra] }));
  return createTagDuel(players, { seed: 'm626-forceful-sentry', first, classic: true });
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
function inventory(duel) { return tagInventory(duel).map(card => card.uid + '|' + card.id).sort(); }
function setup(first = 0) {
  const duel = makeDuel(first);
  const team = first % 2;
  const opponentTeam = 1 - team;
  const opponentSeat = duel.active[opponentTeam];
  const sourceUid = putCardInHand(duel, first, SPELL_ID);
  const activation = activateForcefulSentry(duel, sourceUid, { cardId: SPELL_ID });
  assert.ok(activation);
  return { duel, sourceUid, team, opponentTeam, opponentSeat, activation };
}

test('ativa da mão do assento ativo e envia a Spell ao GY sem custo de LP', () => {
  const { duel, sourceUid, team, activation } = setup();
  assert.equal(activation.plan.ownerSeat, 0);
  assert.equal(activation.state.core.players[team].lp, duel.core.players[team].lp);
  assert.ok(activation.state.core.players[team].grave.some(card => card.uid === sourceUid));
  assert.equal(privateZone(activation.state, 0, 'hand').some(card => card.uid === sourceUid), false);
});

test('rejeita fonte na mão do parceiro inativo', () => {
  const duel = makeDuel(0);
  const uid = putCardInHand(duel, 2, SPELL_ID);
  assert.equal(activateForcefulSentry(duel, uid, { cardId: SPELL_ID }), null);
});

test('rejeita fonte na mão adversária', () => {
  const duel = makeDuel(0);
  const uid = putCardInHand(duel, 1, SPELL_ID);
  assert.equal(activateForcefulSentry(duel, uid, { cardId: SPELL_ID }), null);
});

test('rejeita carta que não seja Magia Normal', () => {
  const duel = makeDuel(0);
  const uid = putCardInHand(duel, 0, MONSTER_ID);
  assert.equal(activateForcefulSentry(duel, uid, { cardId: MONSTER_ID }), null);
});

test('rejeita fora da Main Phase e durante encerramento do turno', () => {
  const battle = makeDuel(0);
  const battleUid = putCardInHand(battle, 0, SPELL_ID);
  battle.core.phase = 'battle';
  assert.equal(activateForcefulSentry(battle, battleUid, { cardId: SPELL_ID }), null);
  const ending = makeDuel(0);
  const endingUid = putCardInHand(ending, 0, SPELL_ID);
  ending.core.turnEnding = true;
  assert.equal(activateForcefulSentry(ending, endingUid, { cardId: SPELL_ID }), null);
});

test('rejeita corrente aberta', () => {
  const duel = makeDuel(0);
  const uid = putCardInHand(duel, 0, SPELL_ID);
  duel.core.chain.push({ actor: 0, card: uid, id: SPELL_ID, target: '' });
  assert.equal(activateForcefulSentry(duel, uid, { cardId: SPELL_ID }), null);
});

test('não ativa se a mão do representante adversário ativo estiver vazia', () => {
  const duel = makeDuel(0);
  const hand = privateZone(duel, 1, 'hand');
  duel.core.players[1].grave.push(...hand.splice(0));
  const uid = putCardInHand(duel, 0, SPELL_ID);
  const before = JSON.stringify(duel);
  assert.equal(activateForcefulSentry(duel, uid, { cardId: SPELL_ID }), null);
  assert.equal(JSON.stringify(duel), before);
});

test('plano não armazena alvo ou UIDs da mão adversária', () => {
  const { activation } = setup();
  assert.equal('targetUid' in activation.plan, false);
  assert.equal('targetBinding' in activation.plan, false);
  assert.equal('revealedHand' in activation.plan, false);
});

test('inspeção privada mostra somente a mão do representante ativo', () => {
  const { activation, opponentSeat } = setup();
  const partnerSeat = opponentSeat === 1 ? 3 : 1;
  const partner = privateZone(activation.state, partnerSeat, 'hand').map(card => card.uid);
  const reveal = inspectForcefulSentryHand(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(reveal);
  assert.equal(reveal.privateToSeat, activation.plan.ownerSeat);
  assert.equal(reveal.opponentSeat, opponentSeat);
  assert.ok(reveal.cards.every(card => !partner.includes(card.uid)));
});

test('inspeção é efêmera e não altera o estado', () => {
  const { activation } = setup();
  const before = JSON.stringify(activation.state);
  assert.ok(inspectForcefulSentryHand(activation.state, activation.plan, { cardId: SPELL_ID }));
  assert.equal(JSON.stringify(activation.state), before);
});

test('seleção é feita na resolução e aceita carta que entrou na mão depois da ativação', () => {
  const { activation, opponentSeat } = setup();
  const hand = privateZone(activation.state, opponentSeat, 'hand');
  const stale = hand.shift();
  activation.state.core.players[opponentSeat % 2].grave.push(stale);
  const drawn = privateZone(activation.state, opponentSeat, 'deck').shift();
  hand.push(drawn);
  const reveal = inspectForcefulSentryHand(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(reveal);
  assert.ok(reveal.cards.some(card => card.uid === drawn.uid));
  assert.equal(reveal.cards.some(card => card.uid === stale.uid), false);
  const result = resolveForcefulSentry(activation.state, activation.plan, drawn.uid, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.returnedUid, drawn.uid);
});

test('devolve a carta escolhida ao Deck privado do adversário e embaralha', () => {
  const { activation, opponentSeat } = setup();
  const selected = privateZone(activation.state, opponentSeat, 'hand')[0];
  const counter = activation.state.core.random.counter;
  const result = resolveForcefulSentry(activation.state, activation.plan, selected.uid, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.returnedUid, selected.uid);
  assert.ok(tagPrivateDeckForSeat(result.state, opponentSeat).some(card => card.uid === selected.uid));
  assert.equal(privateZone(result.state, opponentSeat, 'hand').some(card => card.uid === selected.uid), false);
  assert.equal(result.shuffled, true);
  assert.ok(result.state.core.random.counter > counter);
});

test('embaralhamento é determinístico para o mesmo estado e fluxo DuelRandom', () => {
  const a = setup();
  const b = setup();
  const selectedA = privateZone(a.activation.state, a.opponentSeat, 'hand')[0];
  const selectedB = privateZone(b.activation.state, b.opponentSeat, 'hand')[0];
  const ra = resolveForcefulSentry(a.activation.state, a.activation.plan, selectedA.uid, { cardId: SPELL_ID });
  const rb = resolveForcefulSentry(b.activation.state, b.activation.plan, selectedB.uid, { cardId: SPELL_ID });
  assert.ok(ra && rb);
  assert.deepEqual(tagPrivateDeckForSeat(ra.state, a.opponentSeat).map(card => card.uid), tagPrivateDeckForSeat(rb.state, b.opponentSeat).map(card => card.uid));
  assert.equal(ra.state.core.random.counter, rb.state.core.random.counter);
});

test('não aceita UID que saiu da mão antes da resolução', () => {
  const { activation, opponentSeat } = setup();
  const selected = privateZone(activation.state, opponentSeat, 'hand').shift();
  activation.state.core.players[opponentSeat % 2].grave.push(selected);
  assert.equal(resolveForcefulSentry(activation.state, activation.plan, selected.uid, { cardId: SPELL_ID }), null);
});

test('não permite selecionar a mão privada do parceiro inativo', () => {
  const { activation, opponentSeat } = setup();
  const partnerSeat = opponentSeat === 1 ? 3 : 1;
  const partnerCard = privateZone(activation.state, partnerSeat, 'hand')[0];
  assert.equal(resolveForcefulSentry(activation.state, activation.plan, partnerCard.uid, { cardId: SPELL_ID }), null);
});

test('não permite selecionar carta da própria equipe', () => {
  const { activation } = setup();
  const own = privateZone(activation.state, 0, 'hand')[0];
  assert.equal(resolveForcefulSentry(activation.state, activation.plan, own.uid, { cardId: SPELL_ID }), null);
});

test('negação não devolve carta nem avança o fluxo aleatório', () => {
  const { activation, opponentSeat, sourceUid } = setup();
  const hand = privateZone(activation.state, opponentSeat, 'hand').map(card => card.uid);
  const counter = activation.state.core.random.counter;
  const result = resolveForcefulSentry(activation.state, activation.plan, null, { cardId: SPELL_ID, negated: true });
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.equal(result.returnedUid, null);
  assert.equal(result.shuffled, false);
  assert.deepEqual(privateZone(result.state, opponentSeat, 'hand').map(card => card.uid), hand);
  assert.equal(result.state.core.random.counter, counter);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
});

test('negação com UID selecionado é rejeitada sem mutação', () => {
  const { activation, opponentSeat } = setup();
  const selected = privateZone(activation.state, opponentSeat, 'hand')[0];
  const before = JSON.stringify(activation.state);
  assert.equal(resolveForcefulSentry(activation.state, activation.plan, selected.uid, { cardId: SPELL_ID, negated: true }), null);
  assert.equal(JSON.stringify(activation.state), before);
});

test('se a mão ficar vazia antes da resolução, não devolve nem embaralha', () => {
  const { activation, opponentSeat } = setup();
  const hand = privateZone(activation.state, opponentSeat, 'hand');
  activation.state.core.players[opponentSeat % 2].grave.push(...hand.splice(0));
  const counter = activation.state.core.random.counter;
  const result = resolveForcefulSentry(activation.state, activation.plan, null, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.noCardToReturn, true);
  assert.equal(result.shuffled, false);
  assert.equal(result.state.core.random.counter, counter);
});

test('recibo serializável impede resolução duplicada', () => {
  const { activation, opponentSeat } = setup();
  const selected = privateZone(activation.state, opponentSeat, 'hand')[0];
  const first = resolveForcefulSentry(activation.state, activation.plan, selected.uid, { cardId: SPELL_ID });
  assert.ok(first);
  const restored = JSON.parse(JSON.stringify(first.state));
  assert.equal(resolveForcefulSentry(restored, activation.plan, selected.uid, { cardId: SPELL_ID }), null);
});

test('rejeita resolução se a Spell fonte não estiver no GY proprietário', () => {
  const { activation, sourceUid } = setup();
  const changed = structuredClone(activation.state);
  const index = changed.core.players[0].grave.findIndex(card => card.uid === sourceUid);
  const [source] = changed.core.players[0].grave.splice(index, 1);
  privateZone(changed, 0, 'hand').push(source);
  assert.equal(resolveForcefulSentry(changed, activation.plan, null, { cardId: SPELL_ID }), null);
});

test('rejeita plano adulterado ou assento adversário incompatível', () => {
  const { activation } = setup();
  assert.equal(resolveForcefulSentry(activation.state, { ...activation.plan, eventId: 'forged' }, null, { cardId: SPELL_ID }), null);
  assert.equal(resolveForcefulSentry(activation.state, { ...activation.plan, opponentSeat: 3 }, null, { cardId: SPELL_ID }), null);
});

test('mão acima de seis não é truncada antes da End Phase', () => {
  const { activation, opponentSeat } = setup();
  const hand = privateZone(activation.state, opponentSeat, 'hand');
  hand.push(...privateZone(activation.state, opponentSeat, 'deck').splice(0, 4));
  assert.equal(hand.length, 8);
  const result = resolveForcefulSentry(activation.state, activation.plan, hand[0].uid, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(privateZone(result.state, opponentSeat, 'hand').length, 7);
});

test('snapshot público não revela IDs ou UIDs da mão privada', () => {
  const { activation, opponentSeat } = setup();
  const hidden = privateZone(activation.state, opponentSeat, 'hand').map(card => card.uid + card.id);
  const snapshot = JSON.stringify(publicTagDuel(activation.state));
  for (const value of hidden) assert.equal(snapshot.includes(value), false);
});

test('inventário físico é conservado ao devolver carta ao Deck', () => {
  const { activation, opponentSeat } = setup();
  const selected = privateZone(activation.state, opponentSeat, 'hand')[0];
  const before = inventory(activation.state);
  const result = resolveForcefulSentry(activation.state, activation.plan, selected.uid, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(inventory(result.state), before);
});

test('assento 2 devolve a carta ao Deck físico do assento 3', () => {
  const { activation, opponentSeat } = setup(2);
  const selected = privateZone(activation.state, opponentSeat, 'hand')[0];
  const result = resolveForcefulSentry(activation.state, activation.plan, selected.uid, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(opponentSeat, 3);
  assert.ok(result.state.core.players[1].deck.some(card => card.uid === selected.uid));
});

test('Deck principal 20–30 e Extra Deck até cinco por assento', () => {
  const duel = makeDuel(0);
  assertForcefulSentryRules(duel);
  const short = structuredClone(duel);
  short.core.players[0].deck.pop();
  assert.throws(() => assertForcefulSentryRules(short), /Deck principal físico/);
  if (FUSION_ID) assert.throws(() => assertForcefulSentryRules(makeDuel(0, 6)), /Deck Adicional físico/);
});

test('Field Zone é separada das três zonas de S/T', t => {
  if (!FIELD_ID) { t.skip('nenhuma Field Spell habilitada no fixture atual'); return; }
  const duel = makeDuel(0);
  const backrow = duel.core.players[0].backrow;
  for (let i = 0; i < 3; i++) {
    const card = privateZone(duel, 0, 'deck').shift();
    card.id = TRAP_ID;
    backrow.push({ ...card, faceUp: false, setTurn: 0 });
  }
  const field = privateZone(duel, 0, 'deck').shift();
  field.id = FIELD_ID;
  duel.core.players[0].field = { ...field, faceUp: true, setTurn: 0 };
  assertForcefulSentryRules(duel);
});

test('rejeita quatro cartas no backrow compartilhado', () => {
  const duel = makeDuel(0);
  const backrow = duel.core.players[0].backrow;
  for (let i = 0; i < 4; i++) {
    const card = privateZone(duel, 0, 'deck').shift();
    card.id = TRAP_ID;
    backrow.push({ ...card, faceUp: false, setTurn: 0 });
  }
  assert.throws(() => assertForcefulSentryRules(duel));
});
