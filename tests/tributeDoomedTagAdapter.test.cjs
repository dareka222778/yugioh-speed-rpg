const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagNormalCardIds, tagInventory } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const { sendMonsterToGrave } = require('../dist/monsterExit.js');
const {
  TRIBUTE_TO_THE_DOOMED_ID,
  activateTributeToTheDoomed,
  resolveTributeToTheDoomed,
  assertTributeToTheDoomedRules,
} = require('../dist/tributeDoomedTagAdapter.js');

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
  return createTagDuel(players, { seed: 'm617-tribute-to-the-doomed', first, classic: true });
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
function addMonster(duel, ownerSeat, controllerTeam, faceUp = true) {
  const card = takeFromSeat(duel, ownerSeat, ref => ref.id === MONSTER_ID);
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
  synchronizeCardLifetimes(duel.core);
  return card.uid;
}
function inventory(duel) {
  return tagInventory(duel).map(card => card.uid + '|' + card.id).sort();
}
function setup(first = 0, targetOwnerSeat = 1, targetTeam = 1, faceUp = true) {
  const duel = makeDuel(first);
  const sourceUid = putCardInHand(duel, first, SPELL_ID);
  const costUid = privateZone(duel, first, 'hand').find(card => card.uid !== sourceUid).uid;
  const targetUid = addMonster(duel, targetOwnerSeat, targetTeam, faceUp);
  const activation = activateTributeToTheDoomed(duel, sourceUid, costUid, targetUid, { cardId: SPELL_ID });
  return { duel, sourceUid, costUid, targetUid, activation };
}

test('ativa na Main Phase aberta da mão física ativa e paga exatamente um custo', () => {
  const { duel, sourceUid, costUid, targetUid, activation } = setup();
  assert.ok(activation);
  assert.equal(activation.plan.ownerSeat, 0);
  assert.equal(activation.plan.ownerTeam, 0);
  assert.ok(activation.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.ok(activation.state.core.players[0].grave.some(card => card.uid === costUid));
  assert.ok(activation.state.core.players[1].monsters.some(card => card.uid === targetUid));
  assert.ok(privateZone(duel, 0, 'hand').some(card => card.uid === sourceUid), 'entrada não é mutada');
});

test('rejeita Spell da mão do parceiro físico inativo', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 2, SPELL_ID);
  const costUid = privateZone(duel, 2, 'hand').find(card => card.uid !== sourceUid).uid;
  const targetUid = addMonster(duel, 1, 1);
  assert.equal(activateTributeToTheDoomed(duel, sourceUid, costUid, targetUid, { cardId: SPELL_ID }), null);
});

test('rejeita Spell da mão adversária', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 1, SPELL_ID);
  const costUid = privateZone(duel, 1, 'hand').find(card => card.uid !== sourceUid).uid;
  const targetUid = addMonster(duel, 1, 1);
  assert.equal(activateTributeToTheDoomed(duel, sourceUid, costUid, targetUid, { cardId: SPELL_ID }), null);
});

test('rejeita Battle Phase, janela de resposta e corrente aberta', () => {
  const battle = makeDuel(0);
  const bSource = putCardInHand(battle, 0, SPELL_ID);
  const bCost = privateZone(battle, 0, 'hand').find(card => card.uid !== bSource).uid;
  const bTarget = addMonster(battle, 1, 1);
  battle.core.phase = 'battle';
  assert.equal(activateTributeToTheDoomed(battle, bSource, bCost, bTarget, { cardId: SPELL_ID }), null);

  const response = makeDuel(0);
  const rSource = putCardInHand(response, 0, SPELL_ID);
  const rCost = privateZone(response, 0, 'hand').find(card => card.uid !== rSource).uid;
  const rTarget = addMonster(response, 1, 1);
  response.core.phase = 'response';
  assert.equal(activateTributeToTheDoomed(response, rSource, rCost, rTarget, { cardId: SPELL_ID }), null);

  const chain = makeDuel(0);
  const cSource = putCardInHand(chain, 0, SPELL_ID);
  const cCost = privateZone(chain, 0, 'hand').find(card => card.uid !== cSource).uid;
  const cTarget = addMonster(chain, 1, 1);
  chain.core.chain.push({ actor: 0, card: cSource, id: SPELL_ID, target: '' });
  assert.equal(activateTributeToTheDoomed(chain, cSource, cCost, cTarget, { cardId: SPELL_ID }), null);
});

test('não aceita monstro como fonte da Normal Spell', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, MONSTER_ID);
  const costUid = privateZone(duel, 0, 'hand').find(card => card.uid !== sourceUid).uid;
  const targetUid = addMonster(duel, 1, 1);
  assert.equal(activateTributeToTheDoomed(duel, sourceUid, costUid, targetUid, { cardId: MONSTER_ID }), null);
});

test('exige exatamente um custo distinto da fonte', () => {
  const { duel, sourceUid, costUid, targetUid } = setup();
  assert.equal(activateTributeToTheDoomed(duel, sourceUid, '', targetUid, { cardId: SPELL_ID }), null);
  assert.equal(activateTributeToTheDoomed(duel, sourceUid, sourceUid, targetUid, { cardId: SPELL_ID }), null);
  assert.ok(activateTributeToTheDoomed(duel, sourceUid, costUid, targetUid, { cardId: SPELL_ID }));
});

test('custo pode ser qualquer card, inclusive Trap ou Spell', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, SPELL_ID);
  const cost = privateZone(duel, 0, 'hand').find(card => card.uid !== sourceUid);
  cost.id = TRAP_ID;
  const targetUid = addMonster(duel, 1, 1);
  assert.ok(activateTributeToTheDoomed(duel, sourceUid, cost.uid, targetUid, { cardId: SPELL_ID }));
});

test('custo de outra mão física é rejeitado', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, SPELL_ID);
  const partnerCost = privateZone(duel, 2, 'hand')[0].uid;
  const targetUid = addMonster(duel, 1, 1);
  assert.equal(activateTributeToTheDoomed(duel, sourceUid, partnerCost, targetUid, { cardId: SPELL_ID }), null);
});

test('aceita alvo próprio, adversário e face-down', () => {
  assert.ok(setup(0, 0, 0, true).activation);
  assert.ok(setup(0, 1, 1, true).activation);
  assert.ok(setup(0, 1, 1, false).activation);
});

test('Spell/Trap na backrow não é alvo de monstro', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, SPELL_ID);
  const costUid = privateZone(duel, 0, 'hand').find(card => card.uid !== sourceUid).uid;
  const backrow = takeFromSeat(duel, 1, ref => ref.id === MONSTER_ID);
  backrow.id = SPELL_ID;
  duel.core.players[1].backrow.push({ ...backrow, setTurn: 0, faceUp: true });
  synchronizeCardLifetimes(duel.core);
  assert.equal(activateTributeToTheDoomed(duel, sourceUid, costUid, backrow.uid, { cardId: SPELL_ID }), null);
});

test('alvo inexistente é rejeitado sem pagar custo', () => {
  const duel = makeDuel(0);
  const sourceUid = putCardInHand(duel, 0, SPELL_ID);
  const costUid = privateZone(duel, 0, 'hand').find(card => card.uid !== sourceUid).uid;
  assert.equal(activateTributeToTheDoomed(duel, sourceUid, costUid, 'm1:missing', { cardId: SPELL_ID }), null);
  assert.ok(privateZone(duel, 0, 'hand').some(card => card.uid === sourceUid));
  assert.ok(privateZone(duel, 0, 'hand').some(card => card.uid === costUid));
});

test('destrói o alvo original e envia ao Cemitério do proprietário físico da equipe', () => {
  const { activation, targetUid } = setup(0, 1, 1);
  assert.ok(activation);
  const result = resolveTributeToTheDoomed(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.destroyed, true);
  assert.equal(result.targetLost, false);
  assert.ok(result.state.core.players[1].grave.some(card => card.uid === targetUid));
  assert.equal(result.state.core.players[1].monsters.some(card => card.uid === targetUid), false);
});

test('também destrói monstro face-down', () => {
  const { activation, targetUid } = setup(0, 1, 1, false);
  assert.ok(activation);
  const result = resolveTributeToTheDoomed(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.destroyed, true);
  assert.ok(result.state.core.players[1].grave.some(card => card.uid === targetUid));
});

test('alvo que sai do campo antes da resolução não é substituído; custo permanece pago', () => {
  const { activation, targetUid, costUid } = setup();
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  assert.equal(sendMonsterToGrave(changed.core, targetUid), true);
  const result = resolveTributeToTheDoomed(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.destroyed, false);
  assert.equal(result.targetLost, true);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === costUid));
});

test('alvo que sai e retorna com o mesmo UID tem nova época e não é retargetado', () => {
  const { activation, targetUid } = setup();
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  assert.equal(sendMonsterToGrave(changed.core, targetUid), true);
  const index = changed.core.players[1].grave.findIndex(card => card.uid === targetUid);
  const [card] = changed.core.players[1].grave.splice(index, 1);
  changed.core.players[1].monsters.push({
    ...card, owner: 1, position: 'atk', faceUp: true, entered: changed.core.turn,
    changed: changed.core.turn, attacked: 0, atkBoost: 0, defBoost: 0,
  });
  synchronizeCardLifetimes(changed.core);
  const result = resolveTributeToTheDoomed(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.destroyed, false);
  assert.equal(result.targetLost, true);
  assert.ok(result.state.core.players[1].monsters.some(monster => monster.uid === targetUid));
});

test('mudança de controle sem sair do campo mantém o mesmo alvo', () => {
  const { activation, targetUid } = setup(0, 0, 0);
  assert.ok(activation);
  const changed = structuredClone(activation.state);
  const index = changed.core.players[0].monsters.findIndex(card => card.uid === targetUid);
  const [target] = changed.core.players[0].monsters.splice(index, 1);
  changed.core.players[1].monsters.push(target);
  synchronizeCardLifetimes(changed.core);
  const result = resolveTributeToTheDoomed(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.destroyed, true);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === targetUid), 'proprietário original recebe o card');
});

test('negação não destrói o alvo e não devolve o custo', () => {
  const { activation, targetUid, costUid } = setup();
  assert.ok(activation);
  const result = resolveTributeToTheDoomed(activation.state, activation.plan, { cardId: SPELL_ID, negated: true });
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.equal(result.destroyed, false);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === costUid));
  assert.ok(result.state.core.players[1].monsters.some(card => card.uid === targetUid));
});


test('recibo persistido bloqueia replay', () => {
  const { activation } = setup();
  assert.ok(activation);
  const first = resolveTributeToTheDoomed(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(first);
  assert.equal(resolveTributeToTheDoomed(first.state, activation.plan, { cardId: SPELL_ID }), null);
  const roundTrip = JSON.parse(JSON.stringify(first.state));
  assert.equal(resolveTributeToTheDoomed(roundTrip, activation.plan, { cardId: SPELL_ID }), null);
});

test('assento 2 usa sua própria mão física e o Cemitério da equipe 0', () => {
  const { activation, costUid, targetUid } = setup(2, 1, 1);
  assert.ok(activation);
  assert.equal(activation.plan.ownerSeat, 2);
  assert.equal(activation.plan.ownerTeam, 0);
  const result = resolveTributeToTheDoomed(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.ok(result.state.core.players[0].grave.some(card => card.uid === costUid));
  assert.ok(result.state.core.players[1].grave.some(card => card.uid === targetUid));
});

test('mão acima de seis não é truncada; Spell e um custo são os únicos removidos', () => {
  const duel = makeDuel(0);
  const hand = privateZone(duel, 0, 'hand');
  const deck = privateZone(duel, 0, 'deck');
  hand.push(...deck.splice(0, 7));
  const sourceUid = putCardInHand(duel, 0, SPELL_ID);
  const costUid = hand.find(card => card.uid !== sourceUid).uid;
  const targetUid = addMonster(duel, 1, 1);
  const activation = activateTributeToTheDoomed(duel, sourceUid, costUid, targetUid, { cardId: SPELL_ID });
  assert.ok(activation);
  assert.ok(privateZone(activation.state, 0, 'hand').length > 6);
});

test('inventário e UIDs são conservados após ativação e destruição', () => {
  const { duel, activation, targetUid } = setup();
  assert.ok(activation);
  const before = inventory(duel);
  const result = resolveTributeToTheDoomed(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(inventory(result.state), before);
  assert.equal(new Set(inventory(result.state).map(value => value.split('|')[0])).size, inventory(result.state).length);
  assert.ok(result.state.core.players[1].grave.some(card => card.uid === targetUid));
});

test('entrada original permanece imutável', () => {
  const { duel, activation } = setup();
  assert.ok(activation);
  const before = JSON.stringify(duel);
  const activationBefore = JSON.stringify(activation.state);
  const result = resolveTributeToTheDoomed(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(JSON.stringify(duel), before);
  assert.equal(JSON.stringify(activation.state), activationBefore);
});

test('rejeita plano adulterado, turno diferente e carta-fonte incompatível', () => {
  const { activation } = setup();
  assert.ok(activation);
  assert.equal(resolveTributeToTheDoomed(activation.state, { ...activation.plan, turn: activation.plan.turn + 1 }, { cardId: SPELL_ID }), null);
  assert.equal(resolveTributeToTheDoomed(activation.state, { ...activation.plan, ownerTeam: 1 }, { cardId: SPELL_ID }), null);
  assert.equal(resolveTributeToTheDoomed(activation.state, { ...activation.plan, targetUid: 'm0:forged' }, { cardId: SPELL_ID }), null);
  assert.equal(resolveTributeToTheDoomed(activation.state, activation.plan, { cardId: TRIBUTE_TO_THE_DOOMED_ID }), null);
});

test('perfil físico preserva Deck 20–30, Extra 5 e zonas 3+3', () => {
  const duel = makeDuel(0);
  assertTributeToTheDoomedRules(duel);
  assert.equal(duel.core.players[0].monsters.length, 0);
  assert.equal(duel.core.players[0].backrow.length, 0);
});
