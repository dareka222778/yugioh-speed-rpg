const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagNormalCardIds, tagInventory } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { createTokenGroup } = require('../dist/tokens.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  DARK_CORE_ID,
  activateDarkCore,
  resolveDarkCore,
  assertDarkCoreRules,
  assertPhysicalExtraDeckCounts,
} = require('../dist/darkCoreTagAdapter.js');

const MONSTER_ID = tagNormalCardIds.find(id => getDuelCard(id)?.kind === 'monster');
const SPELL_ID = enabledCardIds.find(id => {
  const card = getDuelCard(id);
  return card?.kind === 'spell' && card.field !== true;
});
const TRAP_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'trap');
assert.ok(MONSTER_ID);
assert.ok(SPELL_ID);
assert.ok(TRAP_ID);
assert.ok(DARK_CORE_ID);

function makeDuel(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  assert.equal(deck.length, 20);
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i, name: 'Member ' + i, cards: [...deck], extra: [],
  }));
  return createTagDuel(players, { seed: 'm620-dark-core', first, classic: true });
}
function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team][zone] : duel.reserves[String(seat)][zone];
}
function putCardInHand(duel, seat, index, id) {
  const card = privateZone(duel, seat, 'hand')[index];
  assert.ok(card);
  card.id = id;
  return card.uid;
}
function placeMonster(duel, seat, controllerTeam, ownerTeam = seat % 2, faceUp = true, position = 'atk') {
  const hand = privateZone(duel, seat, 'hand');
  const [card] = hand.splice(0, 1);
  assert.ok(card);
  duel.core.players[controllerTeam].monsters.push({
    ...card,
    owner: ownerTeam,
    position: faceUp ? position : 'def',
    faceUp,
    entered: duel.core.turn,
    changed: duel.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  });
  return card.uid;
}
function inventory(duel) {
  return tagInventory(duel).filter(card => card.entityKind !== 'token')
    .map(card => card.uid + '|' + card.id).sort();
}
function setup(first = 0, targetController = 1, targetOwner = 0, faceUp = true, position = 'atk') {
  const duel = makeDuel(first);
  const sourceUid = putCardInHand(duel, first, 0, SPELL_ID);
  const costUid = putCardInHand(duel, first, 1, TRAP_ID);
  const targetSeat = targetOwner === 0 ? (first === 0 ? 2 : 0) : 1;
  const targetUid = placeMonster(duel, targetSeat, targetController, targetOwner, faceUp, position);
  const activation = activateDarkCore(duel, sourceUid, costUid, targetUid, { cardId: SPELL_ID });
  return { duel, sourceUid, costUid, targetUid, targetSeat, activation };
}

test('paga um card qualquer da mão privada e ativa somente na Main Phase aberta', () => {
  const { duel, sourceUid, costUid, targetUid, activation } = setup();
  assert.ok(activation);
  assert.equal(activation.plan.ownerSeat, 0);
  assert.equal(activation.plan.ownerTeam, 0);
  assert.equal(activation.plan.targetUid, targetUid);
  assert.ok(activation.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.ok(activation.state.core.players[0].grave.some(card => card.uid === costUid));
  assert.ok(privateZone(activation.state, 0, 'hand').every(card => card.uid !== sourceUid && card.uid !== costUid));
  assert.ok(privateZone(duel, 0, 'hand').some(card => card.uid === sourceUid), 'entrada não é mutada');
});

test('o custo aceita uma Magia ou Armadilha, não somente monstros', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, 0, SPELL_ID);
  const costUid = putCardInHand(duel, 0, 1, SPELL_ID);
  const targetUid = placeMonster(duel, 2, 1, 0, true);
  const activation = activateDarkCore(duel, sourceUid, costUid, targetUid, { cardId: SPELL_ID });
  assert.ok(activation);
  assert.ok(activation.state.core.players[0].grave.some(card => card.uid === costUid && card.id === SPELL_ID));
});

test('rejeita a fonte na mão do parceiro físico inativo ou do adversário', () => {
  const partner = makeDuel(0);
  const partnerSource = putCardInHand(partner, 2, 0, SPELL_ID);
  const partnerCost = putCardInHand(partner, 2, 1, TRAP_ID);
  const target = placeMonster(partner, 3, 1, 1);
  assert.equal(activateDarkCore(partner, partnerSource, partnerCost, target, { cardId: SPELL_ID }), null);

  const opponent = makeDuel(0);
  const opponentSource = putCardInHand(opponent, 1, 0, SPELL_ID);
  const opponentCost = putCardInHand(opponent, 1, 1, TRAP_ID);
  const opponentTarget = placeMonster(opponent, 2, 1, 0);
  assert.equal(activateDarkCore(opponent, opponentSource, opponentCost, opponentTarget, { cardId: SPELL_ID }), null);
});

test('rejeita custo vindo da mão do parceiro ou do adversário', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, 0, SPELL_ID);
  const partnerCost = putCardInHand(duel, 2, 0, TRAP_ID);
  const targetUid = placeMonster(duel, 2, 1, 0);
  assert.equal(activateDarkCore(duel, sourceUid, partnerCost, targetUid, { cardId: SPELL_ID }), null);

  const other = makeDuel(0);
  const otherSource = putCardInHand(other, 0, 0, SPELL_ID);
  const opponentCost = putCardInHand(other, 1, 0, TRAP_ID);
  const otherTarget = placeMonster(other, 2, 1, 0);
  assert.equal(activateDarkCore(other, otherSource, opponentCost, otherTarget, { cardId: SPELL_ID }), null);
});

test('rejeita fonte e custo com o mesmo UID', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, 0, SPELL_ID);
  const targetUid = placeMonster(duel, 2, 1, 0);
  assert.equal(activateDarkCore(duel, sourceUid, sourceUid, targetUid, { cardId: SPELL_ID }), null);
});

test('rejeita fonte que não seja uma Normal Spell', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, 0, MONSTER_ID);
  const costUid = putCardInHand(duel, 0, 1, TRAP_ID);
  const targetUid = placeMonster(duel, 2, 1, 0);
  assert.equal(activateDarkCore(duel, sourceUid, costUid, targetUid, { cardId: MONSTER_ID }), null);
});

test('rejeita Battle Phase, janela de resposta e corrente aberta sem pagar o custo', () => {
  for (const phase of ['battle', 'response']) {
    const duel = makeDuel(0);
    const sourceUid = putCardInHand(duel, 0, 0, SPELL_ID);
    const costUid = putCardInHand(duel, 0, 1, TRAP_ID);
    const targetUid = placeMonster(duel, 2, 1, 0);
    duel.core.phase = phase;
    const before = inventory(duel);
    assert.equal(activateDarkCore(duel, sourceUid, costUid, targetUid, { cardId: SPELL_ID }), null);
    assert.deepEqual(inventory(duel), before);
  }
  const chain = makeDuel(0);
  const sourceUid = putCardInHand(chain, 0, 0, SPELL_ID);
  const costUid = putCardInHand(chain, 0, 1, TRAP_ID);
  const targetUid = placeMonster(chain, 2, 1, 0);
  chain.core.chain.push({ actor: 0, card: sourceUid, id: SPELL_ID, target: '' });
  assert.equal(activateDarkCore(chain, sourceUid, costUid, targetUid, { cardId: SPELL_ID }), null);
});

test('rejeita alvo ausente, face-down ou não-monstro antes de pagar o custo', () => {
  const missing = makeDuel(0);
  const missingSource = putCardInHand(missing, 0, 0, SPELL_ID);
  const missingCost = putCardInHand(missing, 0, 1, TRAP_ID);
  const before = inventory(missing);
  assert.equal(activateDarkCore(missing, missingSource, missingCost, 'missing-target', { cardId: SPELL_ID }), null);
  assert.deepEqual(inventory(missing), before);

  const facedown = makeDuel(0);
  const facedownSource = putCardInHand(facedown, 0, 0, SPELL_ID);
  const facedownCost = putCardInHand(facedown, 0, 1, TRAP_ID);
  const facedownTarget = placeMonster(facedown, 2, 1, 0, false);
  const facedownBefore = inventory(facedown);
  assert.equal(activateDarkCore(facedown, facedownSource, facedownCost, facedownTarget, { cardId: SPELL_ID }), null);
  assert.deepEqual(inventory(facedown), facedownBefore);

  const notMonster = makeDuel(0);
  const notMonsterSource = putCardInHand(notMonster, 0, 0, SPELL_ID);
  const notMonsterCost = putCardInHand(notMonster, 0, 1, TRAP_ID);
  assert.equal(activateDarkCore(notMonster, notMonsterSource, notMonsterCost, notMonsterCost, { cardId: SPELL_ID }), null);
});

test('bana o alvo original para a zona da equipe proprietária, não para a controladora', () => {
  const { activation, targetUid, costUid } = setup();
  assert.ok(activation);
  const before = inventory(activation.state);
  const result = resolveDarkCore(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedUid, targetUid);
  assert.ok(result.state.core.players[0].banished?.some(card => card.uid === targetUid));
  assert.equal(result.state.core.players[1].banished?.some(card => card.uid === targetUid), false);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === costUid));
  assert.deepEqual(inventory(result.state), before);
});

test('pode banir monstro face-up em Defesa, inclusive da própria equipe', () => {
  const { activation, targetUid } = setup(0, 0, 0, true, 'def');
  assert.ok(activation);
  const result = resolveDarkCore(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedUid, targetUid);
  assert.ok(result.state.core.players[0].banished?.some(card => card.uid === targetUid));
});

test('pode banir monstro da equipe adversária e envia ao Cemitério removido dessa equipe', () => {
  const { activation, targetUid } = setup(0, 1, 1, true, 'atk');
  assert.ok(activation);
  const result = resolveDarkCore(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.ok(result.state.core.players[1].banished?.some(card => card.uid === targetUid));
  assert.equal(result.state.core.players[0].banished?.some(card => card.uid === targetUid), false);
});

test('negação mantém custo e Spell no Cemitério, sem banir o alvo', () => {
  const { activation, targetUid, sourceUid, costUid } = setup();
  assert.ok(activation);
  const result = resolveDarkCore(activation.state, activation.plan, { cardId: SPELL_ID, negated: true });
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.equal(result.banishedUid, null);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === costUid));
  assert.ok(result.state.core.players[1].monsters.some(card => card.uid === targetUid));
});

test('alvo que saiu do campo antes da resolução não é substituído', () => {
  const { activation, targetUid, targetSeat } = setup();
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const [target] = changed.core.players[1].monsters.splice(
    changed.core.players[1].monsters.findIndex(card => card.uid === targetUid), 1,
  );
  privateZone(changed, targetSeat, 'hand').push(target);
  synchronizeCardLifetimes(changed.core);
  const result = resolveDarkCore(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedUid, null);
  assert.ok(privateZone(result.state, targetSeat, 'hand').some(card => card.uid === targetUid));
});

test('alvo que saiu e voltou com o mesmo UID tem epoch obsoleto', () => {
  const { activation, targetUid, targetSeat } = setup();
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const [target] = changed.core.players[1].monsters.splice(
    changed.core.players[1].monsters.findIndex(card => card.uid === targetUid), 1,
  );
  privateZone(changed, targetSeat, 'hand').push(target);
  synchronizeCardLifetimes(changed.core);
  const returned = privateZone(changed, targetSeat, 'hand').splice(
    privateZone(changed, targetSeat, 'hand').findIndex(card => card.uid === targetUid), 1,
  )[0];
  changed.core.players[1].monsters.push(returned);
  synchronizeCardLifetimes(changed.core);
  const result = resolveDarkCore(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedUid, null);
  assert.ok(changed.core.players[1].monsters.some(card => card.uid === targetUid));
});

test('alvo que fica face-down antes da resolução não é banido', () => {
  const { activation, targetUid } = setup();
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const target = changed.core.players[1].monsters.find(card => card.uid === targetUid);
  target.faceUp = false;
  target.position = 'def';
  const result = resolveDarkCore(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedUid, null);
  assert.ok(result.state.core.players[1].monsters.some(card => card.uid === targetUid));
});

test('mudança de controle sem sair da Zona de Monstros preserva o alvo vinculado', () => {
  const { activation, targetUid } = setup();
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const index = changed.core.players[1].monsters.findIndex(card => card.uid === targetUid);
  const [target] = changed.core.players[1].monsters.splice(index, 1);
  changed.core.players[0].monsters.push(target);
  const result = resolveDarkCore(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedUid, targetUid);
  assert.ok(result.state.core.players[0].banished?.some(card => card.uid === targetUid));
});

test('assento físico 2 paga da própria mão e conserva a identidade no Cemitério compartilhado', () => {
  const { activation, targetUid, costUid } = setup(2);
  assert.ok(activation);
  assert.equal(activation.plan.ownerSeat, 2);
  assert.equal(activation.plan.ownerTeam, 0);
  const result = resolveDarkCore(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === costUid));
  assert.ok(result.state.core.players[0].banished?.some(card => card.uid === targetUid));
});

test('token face-up é removido pelo banimento sem virar carta de inventário', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, 0, SPELL_ID);
  const costUid = putCardInHand(duel, 0, 1, TRAP_ID);
  const token = createTokenGroup(duel.core, 1, 1, 'atk')[0];
  const before = inventory(duel);
  const activation = activateDarkCore(duel, sourceUid, costUid, token.uid, { cardId: SPELL_ID });
  assert.ok(activation);
  const result = resolveDarkCore(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.banishedUid, token.uid);
  assert.equal(result.state.core.players[1].monsters.some(card => card.uid === token.uid), false);
  assert.equal(result.state.core.players[0].banished?.some(card => card.uid === token.uid), false);
  assert.deepEqual(inventory(result.state), before);
});

test('recibo persistido bloqueia replay inclusive após serialização', () => {
  const { activation } = setup();
  assert.ok(activation);
  const first = resolveDarkCore(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(first);
  assert.equal(resolveDarkCore(first.state, activation.plan, { cardId: SPELL_ID }), null);
  const roundTrip = JSON.parse(JSON.stringify(first.state));
  assert.equal(resolveDarkCore(roundTrip, activation.plan, { cardId: SPELL_ID }), null);
});

test('duas cópias físicas podem ser ativadas no mesmo turno', () => {
  const { activation, targetSeat } = setup();
  assert.ok(activation);
  const first = resolveDarkCore(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(first);
  const hand = privateZone(first.state, 0, 'hand');
  const sourceUid = hand[0].uid;
  const costUid = hand[1].uid;
  hand[0].id = SPELL_ID;
  hand[1].id = TRAP_ID;
  const secondTarget = placeMonster(first.state, targetSeat, 1, 0, true);
  const second = activateDarkCore(first.state, sourceUid, costUid, secondTarget, { cardId: SPELL_ID });
  assert.ok(second);
  assert.ok(resolveDarkCore(second.state, second.plan, { cardId: SPELL_ID }));
});

test('mão acima de seis não é truncada antes da End Phase', () => {
  const duel = makeDuel(0);
  const hand = privateZone(duel, 0, 'hand');
  const deck = privateZone(duel, 0, 'deck');
  hand.push(...deck.splice(0, 5));
  const sourceUid = putCardInHand(duel, 0, 0, SPELL_ID);
  const costUid = putCardInHand(duel, 0, 1, TRAP_ID);
  const targetUid = placeMonster(duel, 2, 1, 0, true);
  const activation = activateDarkCore(duel, sourceUid, costUid, targetUid, { cardId: SPELL_ID });
  assert.ok(activation);
  const afterActivation = privateZone(activation.state, 0, 'hand').length;
  const result = resolveDarkCore(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(privateZone(result.state, 0, 'hand').length, afterActivation);
  assert.equal(afterActivation, 7);
});

test('entrada original permanece imutável durante ativação e resolução', () => {
  const { duel, sourceUid, costUid, targetUid } = setup();
  const before = JSON.stringify(duel);
  const activation = activateDarkCore(duel, sourceUid, costUid, targetUid, { cardId: SPELL_ID });
  assert.ok(activation);
  const activationBefore = JSON.stringify(activation.state);
  const result = resolveDarkCore(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(JSON.stringify(duel), before);
  assert.equal(JSON.stringify(activation.state), activationBefore);
});

test('mantém Deck 20–30, Extra 5, zonas 3+3 e Field Zone separada', () => {
  const duel = makeDuel(0);
  assertDarkCoreRules(duel);
  assert.equal(duel.core.players[0].monsters.length, 0);
  assert.equal(duel.core.players[0].backrow.length, 0);
  assertPhysicalExtraDeckCounts([0, 0, 0, 0], 5);
  assert.throws(() => assertPhysicalExtraDeckCounts([0, 0, 6, 0], 5));
});

test('rejeita plano adulterado, de outro turno ou com proprietário incompatível', () => {
  const { activation } = setup();
  assert.ok(activation);
  assert.equal(resolveDarkCore(activation.state, { ...activation.plan, turn: activation.plan.turn + 1 }, { cardId: SPELL_ID }), null);
  assert.equal(resolveDarkCore(activation.state, { ...activation.plan, ownerTeam: 1 }, { cardId: SPELL_ID }), null);
  assert.equal(resolveDarkCore(activation.state, { ...activation.plan, eventId: 'forged' }, { cardId: SPELL_ID }), null);
  assert.equal(resolveDarkCore(activation.state, { ...activation.plan, targetUid: 'm0:forged' }, { cardId: SPELL_ID }), null);
});

test('inventário físico e UIDs permanecem conservados após o banimento', () => {
  const { activation } = setup();
  assert.ok(activation);
  const before = inventory(activation.state);
  const result = resolveDarkCore(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(inventory(result.state), before);
  assert.equal(new Set(inventory(result.state).map(value => value.split('|')[0])).size, inventory(result.state).length);
});

test('alvo face-up com efeito de Magia aplicável pode ser escolhido', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, 0, SPELL_ID);
  const costUid = putCardInHand(duel, 0, 1, TRAP_ID);
  const targetUid = placeMonster(duel, 2, 1, 0, true);
  // A regra é revalidada no momento da ativação e também na resolução.
  assert.ok(activateDarkCore(duel, sourceUid, costUid, targetUid, { cardId: SPELL_ID }));
});
