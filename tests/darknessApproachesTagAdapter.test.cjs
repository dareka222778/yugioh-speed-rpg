const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagNormalCardIds, tagInventory } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  DARKNESS_APPROACHES_ID,
  activateDarknessApproaches,
  resolveDarknessApproaches,
  assertDarknessApproachesRules,
} = require('../dist/darknessApproachesTagAdapter.js');

const MONSTER_ID = tagNormalCardIds.find(id => getDuelCard(id)?.kind === 'monster');
const SPELL_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'spell' && !getDuelCard(id)?.field);
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
  return createTagDuel(players, { seed: 'm616-darkness-approaches', first, classic: true });
}
function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team][zone] : duel.reserves[String(seat)][zone];
}
function takeFromSeat(duel, seat, predicate, zones = ['deck', 'hand']) {
  for (const zoneName of zones) {
    const zone = privateZone(duel, seat, zoneName);
    const index = zone.findIndex(predicate);
    if (index >= 0) return zone.splice(index, 1)[0];
  }
  throw new Error('physical fixture card not found');
}
function putCardInHand(duel, seat, id) {
  const card = privateZone(duel, seat, 'hand')[0];
  assert.ok(card);
  card.id = id;
  return card.uid;
}
function addMonster(duel, ownerSeat, controllerTeam, faceUp = true, position = 'atk') {
  const card = takeFromSeat(duel, ownerSeat, ref => ref.id === MONSTER_ID);
  duel.core.players[controllerTeam].monsters.push({
    ...card,
    owner: ownerSeat % 2,
    position,
    faceUp,
    entered: duel.core.turn,
    changed: duel.core.turn,
    attacked: 0,
    atkBoost: 300,
    defBoost: 200,
  });
  synchronizeCardLifetimes(duel.core);
  return card.uid;
}
function inventory(duel) {
  return tagInventory(duel).map(card => card.uid + '|' + card.id).sort();
}
function setup(first = 0, targetOwnerSeat = 1, targetTeam = 1, faceUp = true, position = 'atk') {
  const duel = makeDuel(first);
  const sourceUid = putCardInHand(duel, first, SPELL_ID);
  const costs = privateZone(duel, first, 'hand').filter(card => card.uid !== sourceUid).slice(0, 2).map(card => card.uid);
  assert.equal(costs.length, 2);
  const targetUid = addMonster(duel, targetOwnerSeat, targetTeam, faceUp, position);
  const activation = activateDarknessApproaches(duel, sourceUid, costs, targetUid, { cardId: SPELL_ID });
  return { duel, sourceUid, costs, targetUid, activation };
}

test('ativa na Main Phase aberta da mão física ativa, pagando Spell e dois custos', () => {
  const { duel, sourceUid, costs, targetUid, activation } = setup();
  assert.ok(activation);
  assert.equal(activation.plan.ownerSeat, 0);
  assert.equal(activation.plan.ownerTeam, 0);
  assert.ok(activation.state.core.players[0].grave.some(card => card.uid === sourceUid));
  for (const uid of costs) assert.ok(activation.state.core.players[0].grave.some(card => card.uid === uid));
  assert.ok(activation.state.core.players[1].monsters.some(card => card.uid === targetUid && card.faceUp));
  assert.ok(privateZone(duel, 0, 'hand').some(card => card.uid === sourceUid), 'entrada não é mutada');
});

test('rejeita fonte da mão do parceiro físico inativo', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 2, SPELL_ID);
  const costs = privateZone(duel, 2, 'hand').slice(1, 3).map(card => card.uid);
  const targetUid = addMonster(duel, 1, 1);
  assert.equal(activateDarknessApproaches(duel, sourceUid, costs, targetUid, { cardId: SPELL_ID }), null);
});

test('rejeita fonte da mão adversária', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 1, SPELL_ID);
  const costs = privateZone(duel, 1, 'hand').slice(1, 3).map(card => card.uid);
  const targetUid = addMonster(duel, 1, 1);
  assert.equal(activateDarknessApproaches(duel, sourceUid, costs, targetUid, { cardId: SPELL_ID }), null);
});

test('rejeita Battle Phase, janela de resposta e corrente aberta', () => {
  const battle = makeDuel(0);
  const battleSource = putCardInHand(battle, 0, SPELL_ID);
  const battleCosts = privateZone(battle, 0, 'hand').slice(1, 3).map(card => card.uid);
  const battleTarget = addMonster(battle, 1, 1);
  battle.core.phase = 'battle';
  assert.equal(activateDarknessApproaches(battle, battleSource, battleCosts, battleTarget, { cardId: SPELL_ID }), null);

  const response = makeDuel(0);
  const responseSource = putCardInHand(response, 0, SPELL_ID);
  const responseCosts = privateZone(response, 0, 'hand').slice(1, 3).map(card => card.uid);
  const responseTarget = addMonster(response, 1, 1);
  response.core.phase = 'response';
  assert.equal(activateDarknessApproaches(response, responseSource, responseCosts, responseTarget, { cardId: SPELL_ID }), null);

  const chain = makeDuel(0);
  const chainSource = putCardInHand(chain, 0, SPELL_ID);
  const chainCosts = privateZone(chain, 0, 'hand').slice(1, 3).map(card => card.uid);
  const chainTarget = addMonster(chain, 1, 1);
  chain.core.chain.push({ actor: 0, card: chainSource, id: SPELL_ID, target: '' });
  assert.equal(activateDarknessApproaches(chain, chainSource, chainCosts, chainTarget, { cardId: SPELL_ID }), null);
});

test('não aceita monstro como fonte da Normal Spell', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, MONSTER_ID);
  const costs = privateZone(duel, 0, 'hand').filter(card => card.uid !== sourceUid).slice(0, 2).map(card => card.uid);
  const targetUid = addMonster(duel, 1, 1);
  assert.equal(activateDarknessApproaches(duel, sourceUid, costs, targetUid, { cardId: MONSTER_ID }), null);
});

test('exige exatamente dois custos distintos e separados da fonte', () => {
  const { duel, sourceUid, costs, targetUid } = setup();
  assert.equal(activateDarknessApproaches(duel, sourceUid, [costs[0]], targetUid, { cardId: SPELL_ID }), null);
  assert.equal(activateDarknessApproaches(duel, sourceUid, [...costs, 'm0:extra'], targetUid, { cardId: SPELL_ID }), null);
  assert.equal(activateDarknessApproaches(duel, sourceUid, [costs[0], costs[0]], targetUid, { cardId: SPELL_ID }), null);
  assert.equal(activateDarknessApproaches(duel, sourceUid, [sourceUid, costs[0]], targetUid, { cardId: SPELL_ID }), null);
});

test('custos podem ser quaisquer dois cards, inclusive Spell e Trap', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, SPELL_ID);
  const hand = privateZone(duel, 0, 'hand');
  const costs = hand.filter(card => card.uid !== sourceUid).slice(0, 2);
  costs[0].id = SPELL_ID;
  costs[1].id = TRAP_ID;
  const targetUid = addMonster(duel, 1, 1);
  const result = activateDarknessApproaches(duel, sourceUid, costs.map(card => card.uid), targetUid, { cardId: SPELL_ID });
  assert.ok(result);
});

test('custos só podem vir da mão privada do assento ativo', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, SPELL_ID);
  const ownCost = privateZone(duel, 0, 'hand').find(card => card.uid !== sourceUid).uid;
  const partnerCost = privateZone(duel, 2, 'hand')[0].uid;
  const targetUid = addMonster(duel, 1, 1);
  assert.equal(activateDarknessApproaches(duel, sourceUid, [ownCost, partnerCost], targetUid, { cardId: SPELL_ID }), null);
});

test('aceita alvo face-up controlado pela própria equipe', () => {
  const result = setup(0, 0, 0);
  assert.ok(result.activation);
  assert.equal(result.activation.plan.targetTeamAtActivation, 0);
});

test('aceita alvo face-up controlado pela equipe adversária', () => {
  const result = setup(0, 1, 1);
  assert.ok(result.activation);
  assert.equal(result.activation.plan.targetTeamAtActivation, 1);
});

test('rejeita alvo face-down ou inexistente antes de pagar custos', () => {
  const down = setup(0, 1, 1, false);
  assert.equal(down.activation, null);
  assert.equal(privateZone(down.duel, 0, 'hand').some(card => card.uid === down.sourceUid), true);
  const missing = makeDuel(0);
  const sourceUid = putCardInHand(missing, 0, SPELL_ID);
  const costs = privateZone(missing, 0, 'hand').filter(card => card.uid !== sourceUid).slice(0, 2).map(card => card.uid);
  assert.equal(activateDarknessApproaches(missing, sourceUid, costs, 'm1:not-on-field', { cardId: SPELL_ID }), null);
});

test('resolução transforma o alvo original em face-down Defense Position', () => {
  const { activation, targetUid } = setup();
  assert.ok(activation);
  const result = resolveDarknessApproaches(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.targetApplied, true);
  assert.equal(result.targetLost, false);
  const target = result.state.core.players[1].monsters.find(card => card.uid === targetUid);
  assert.ok(target);
  assert.equal(target.faceUp, false);
  assert.equal(target.position, 'def');
});

test('preserva UID e proprietário físico e limpa modificadores ao virar face-down', () => {
  const { activation, targetUid } = setup(0, 1, 1);
  assert.ok(activation);
  const beforeTarget = activation.state.core.players[1].monsters.find(card => card.uid === targetUid);
  assert.ok(beforeTarget);
  assert.equal(beforeTarget.atkBoost, 300);
  assert.equal(beforeTarget.defBoost, 200);
  const result = resolveDarknessApproaches(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  const afterTarget = result.state.core.players[1].monsters.find(card => card.uid === targetUid);
  assert.ok(afterTarget);
  assert.equal(afterTarget.uid, targetUid);
  assert.equal(afterTarget.owner, beforeTarget.owner);
  assert.equal(afterTarget.atkBoost, 0);
  assert.equal(afterTarget.defBoost, 0);
});

test('alvo face-up em Defesa também termina face-down em Defesa', () => {
  const { activation, targetUid } = setup(0, 1, 1, true, 'def');
  assert.ok(activation);
  const result = resolveDarknessApproaches(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  const target = result.state.core.players[1].monsters.find(card => card.uid === targetUid);
  assert.ok(target);
  assert.equal(target.faceUp, false);
  assert.equal(target.position, 'def');
});

test('se o alvo sair do campo, a resolução não escolhe outro e os custos permanecem pagos', () => {
  const { activation, targetUid, costs } = setup();
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const index = changed.core.players[1].monsters.findIndex(card => card.uid === targetUid);
  const [target] = changed.core.players[1].monsters.splice(index, 1);
  changed.core.players[1].grave.push(target);
  synchronizeCardLifetimes(changed.core);
  const result = resolveDarknessApproaches(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.targetApplied, false);
  assert.equal(result.targetLost, true);
  for (const uid of costs) assert.ok(result.state.core.players[0].grave.some(card => card.uid === uid));
});

test('se o alvo ficar face-down antes da resolução, o efeito não o altera nem retargeta', () => {
  const { activation, targetUid } = setup();
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const target = changed.core.players[1].monsters.find(card => card.uid === targetUid);
  target.faceUp = false;
  target.position = 'def';
  synchronizeCardLifetimes(changed.core);
  const result = resolveDarknessApproaches(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.targetApplied, false);
  assert.equal(result.targetLost, true);
});

test('a identidade do alvo é revalidada por UID e ID', () => {
  const { activation, targetUid } = setup();
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  changed.core.players[1].monsters.find(card => card.uid === targetUid).id = tagNormalCardIds[1];
  const result = resolveDarknessApproaches(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.targetApplied, false);
  assert.equal(result.targetLost, true);
});

test('mesmo alvo movido para a outra equipe continua vinculado pelo UID', () => {
  const { activation, targetUid } = setup(0, 0, 0);
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const index = changed.core.players[0].monsters.findIndex(card => card.uid === targetUid);
  const [target] = changed.core.players[0].monsters.splice(index, 1);
  changed.core.players[1].monsters.push(target);
  synchronizeCardLifetimes(changed.core);
  const result = resolveDarknessApproaches(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.targetApplied, true);
  assert.equal(result.state.core.players[1].monsters.find(card => card.uid === targetUid).faceUp, false);
});

test('negação não vira o alvo e não devolve os dois custos', () => {
  const { activation, targetUid, costs } = setup();
  assert.ok(activation);
  const result = resolveDarknessApproaches(activation.state, activation.plan, { cardId: SPELL_ID, negated: true });
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.equal(result.targetApplied, false);
  assert.equal(result.state.core.players[1].monsters.find(card => card.uid === targetUid).faceUp, true);
  for (const uid of costs) assert.ok(result.state.core.players[0].grave.some(card => card.uid === uid));
});

test('tokens face-up não são alvos válidos para virar face-down', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, SPELL_ID);
  const costs = privateZone(duel, 0, 'hand').filter(card => card.uid !== sourceUid).slice(0, 2).map(card => card.uid);
  const token = privateZone(duel, 1, 'deck').shift();
  duel.core.players[1].monsters.push({
    ...token, entityKind: 'token', owner: 1, position: 'atk', faceUp: true,
    entered: duel.core.turn, changed: duel.core.turn, attacked: 0, atkBoost: 0, defBoost: 0,
  });
  synchronizeCardLifetimes(duel.core);
  assert.equal(activateDarknessApproaches(duel, sourceUid, costs, token.uid, { cardId: SPELL_ID }), null);
});

test('assento 2 paga custos da própria mão e mantém o Cemitério compartilhado da equipe 0', () => {
  const { activation, costs, targetUid } = setup(2, 1, 1);
  assert.ok(activation);
  assert.equal(activation.plan.ownerSeat, 2);
  assert.equal(activation.plan.ownerTeam, 0);
  const result = resolveDarknessApproaches(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  for (const uid of costs) assert.ok(result.state.core.players[0].grave.some(card => card.uid === uid));
  assert.equal(result.state.core.players[1].monsters.find(card => card.uid === targetUid).faceUp, false);
});

test('mão acima de seis não é truncada; somente Spell e dois custos saem da mão', () => {
  const duel = makeDuel(0);
  const hand = privateZone(duel, 0, 'hand');
  const deck = privateZone(duel, 0, 'deck');
  hand.push(...deck.splice(0, 5));
  const sourceUid = putCardInHand(duel, 0, SPELL_ID);
  const costs = hand.filter(card => card.uid !== sourceUid).slice(0, 2).map(card => card.uid);
  const targetUid = addMonster(duel, 1, 1);
  const activation = activateDarknessApproaches(duel, sourceUid, costs, targetUid, { cardId: SPELL_ID });
  assert.ok(activation);
  assert.ok(privateZone(activation.state, 0, 'hand').length > 6);
});

test('ativação e resolução preservam o inventário completo e os UIDs', () => {
  const { duel, sourceUid, activation } = setup();
  assert.ok(activation);
  const before = inventory(duel);
  const result = resolveDarknessApproaches(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(inventory(result.state), before);
  assert.equal(new Set(inventory(result.state).map(value => value.split('|')[0])).size, inventory(result.state).length);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === sourceUid));
});

test('recibo persistido impede resolver duas vezes', () => {
  const { activation } = setup();
  assert.ok(activation);
  const first = resolveDarknessApproaches(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(first);
  assert.equal(resolveDarknessApproaches(first.state, activation.plan, { cardId: SPELL_ID }), null);
  const roundTrip = JSON.parse(JSON.stringify(first.state));
  assert.equal(resolveDarknessApproaches(roundTrip, activation.plan, { cardId: SPELL_ID }), null);
});

test('rejeita plano adulterado, turno incorreto e fonte incompatível', () => {
  const { activation } = setup();
  assert.ok(activation);
  assert.equal(resolveDarknessApproaches(activation.state, { ...activation.plan, turn: activation.plan.turn + 1 }, { cardId: SPELL_ID }), null);
  assert.equal(resolveDarknessApproaches(activation.state, { ...activation.plan, ownerTeam: 1 }, { cardId: SPELL_ID }), null);
  assert.equal(resolveDarknessApproaches(activation.state, { ...activation.plan, targetUid: 'm0:forged' }, { cardId: SPELL_ID }), null);
  assert.equal(resolveDarknessApproaches(activation.state, activation.plan, { cardId: DARKNESS_APPROACHES_ID }), null);
});

test('perfil físico mantém Deck 20–30, Extra 5 e zonas 3+3', () => {
  const duel = makeDuel(0);
  assertDarknessApproachesRules(duel);
  assert.equal(duel.core.players[0].monsters.length, 0);
  assert.equal(duel.core.players[0].backrow.length, 0);
});
