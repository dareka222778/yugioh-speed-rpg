const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagNormalCardIds, tagInventory } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const {
  SPIRITUALISM_ID,
  activateSpiritualism,
  resolveSpiritualism,
  assertSpiritualismRules,
} = require('../dist/spiritualismTagAdapter.js');

const MONSTER_ID = tagNormalCardIds.find(id => getDuelCard(id)?.kind === 'monster');
const SPELL_ID = enabledCardIds.find(id => {
  const card = getDuelCard(id);
  return card?.kind === 'spell' && card.field !== true;
});
const TRAP_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'trap');
const FIELD_ID = enabledCardIds.find(id => {
  const card = getDuelCard(id);
  return card?.kind === 'spell' && card.field === true;
});
assert.ok(MONSTER_ID);
assert.ok(SPELL_ID);
assert.ok(TRAP_ID);
assert.ok(FIELD_ID);

function makeDuel(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  assert.equal(deck.length, 20);
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i, name: 'Member ' + i, cards: [...deck], extra: [],
  }));
  return createTagDuel(players, { seed: 'm619-spiritualism', first, classic: true });
}
function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team][zone] : duel.reserves[String(seat)][zone];
}
function putSourceInHand(duel, seat, id) {
  const card = privateZone(duel, seat, 'hand')[0];
  assert.ok(card);
  card.id = id;
  return card.uid;
}
function putTargetInBackrow(duel, ownerSeat, controllerTeam, id, faceUp = false) {
  const hand = privateZone(duel, ownerSeat, 'hand');
  const card = hand.shift();
  assert.ok(card);
  card.id = id;
  duel.core.players[controllerTeam].backrow.push({
    ...card, setTurn: duel.core.turn, faceUp,
  });
  return card.uid;
}
function putTargetInField(duel, ownerSeat, controllerTeam, id) {
  const hand = privateZone(duel, ownerSeat, 'hand');
  const card = hand.shift();
  assert.ok(card);
  card.id = id;
  duel.core.players[controllerTeam].field = {
    ...card, setTurn: duel.core.turn, faceUp: true,
  };
  return card.uid;
}
function inventory(duel) {
  return tagInventory(duel).map(card => card.uid + '|' + card.id).sort();
}
function setup({ first = 0, ownerSeat = 1, controllerTeam = 1, targetId = SPELL_ID, field = false, faceUp = false } = {}) {
  const duel = makeDuel(first);
  const sourceUid = putSourceInHand(duel, first, SPELL_ID);
  const targetUid = field
    ? putTargetInField(duel, ownerSeat, controllerTeam, targetId)
    : putTargetInBackrow(duel, ownerSeat, controllerTeam, targetId, faceUp);
  const activation = activateSpiritualism(duel, sourceUid, targetUid, { cardId: SPELL_ID });
  assert.ok(activation);
  return { duel, sourceUid, targetUid, activation };
}

test('ativa na Main Phase somente da mão privada do assento ativo e envia a Spell ao Cemitério', () => {
  const { duel, sourceUid, activation } = setup();
  assert.equal(activation.plan.ownerSeat, 0);
  assert.equal(activation.plan.ownerTeam, 0);
  assert.equal(activation.plan.targetTeamAtActivation, 1);
  assert.equal(privateZone(activation.state, 0, 'hand').some(card => card.uid === sourceUid), false);
  assert.ok(activation.state.core.players[0].grave.some(card => card.uid === sourceUid));
  assert.ok(privateZone(duel, 0, 'hand').some(card => card.uid === sourceUid));
});

test('rejeita fonte na mão do parceiro físico inativo', () => {
  const duel = makeDuel(0);
  const sourceUid = putSourceInHand(duel, 2, SPELL_ID);
  const targetUid = putTargetInBackrow(duel, 1, 1, TRAP_ID);
  assert.equal(activateSpiritualism(duel, sourceUid, targetUid, { cardId: SPELL_ID }), null);
});

test('rejeita fonte na mão adversária', () => {
  const duel = makeDuel(0);
  const sourceUid = putSourceInHand(duel, 1, SPELL_ID);
  const targetUid = putTargetInBackrow(duel, 1, 1, TRAP_ID);
  assert.equal(activateSpiritualism(duel, sourceUid, targetUid, { cardId: SPELL_ID }), null);
});

test('rejeita Battle Phase, janela de resposta e corrente aberta', () => {
  const battle = makeDuel(0);
  const source1 = putSourceInHand(battle, 0, SPELL_ID);
  const target1 = putTargetInBackrow(battle, 1, 1, TRAP_ID);
  battle.core.phase = 'battle';
  assert.equal(activateSpiritualism(battle, source1, target1, { cardId: SPELL_ID }), null);

  const response = makeDuel(0);
  const source2 = putSourceInHand(response, 0, SPELL_ID);
  const target2 = putTargetInBackrow(response, 1, 1, TRAP_ID);
  response.core.phase = 'response';
  assert.equal(activateSpiritualism(response, source2, target2, { cardId: SPELL_ID }), null);

  const chain = makeDuel(0);
  const source3 = putSourceInHand(chain, 0, SPELL_ID);
  const target3 = putTargetInBackrow(chain, 1, 1, TRAP_ID);
  chain.core.chain.push({ actor: 0, card: source3, id: SPELL_ID, target: '' });
  assert.equal(activateSpiritualism(chain, source3, target3, { cardId: SPELL_ID }), null);
});

test('não aceita monstro como fonte da Normal Spell', () => {
  const duel = makeDuel(0);
  const sourceUid = putSourceInHand(duel, 0, MONSTER_ID);
  const targetUid = putTargetInBackrow(duel, 1, 1, TRAP_ID);
  assert.equal(activateSpiritualism(duel, sourceUid, targetUid, { cardId: MONSTER_ID }), null);
});

test('rejeita alvo na própria equipe, mesmo em zona de Campo separada', () => {
  const duel = makeDuel(0);
  const sourceUid = putSourceInHand(duel, 0, SPELL_ID);
  const targetUid = putTargetInBackrow(duel, 2, 0, TRAP_ID);
  assert.equal(activateSpiritualism(duel, sourceUid, targetUid, { cardId: SPELL_ID }), null);
});

test('rejeita alvo que não seja Magia/Armadilha no campo', () => {
  const duel = makeDuel(0);
  const sourceUid = putSourceInHand(duel, 0, SPELL_ID);
  const monster = privateZone(duel, 1, 'hand').shift();
  assert.ok(monster);
  monster.id = MONSTER_ID;
  duel.core.players[1].monsters.push({
    ...monster, position: 'atk', faceUp: true, entered: duel.core.turn,
    changed: duel.core.turn, attacked: 0, atkBoost: 0, defBoost: 0,
  });
  assert.equal(activateSpiritualism(duel, sourceUid, monster.uid, { cardId: SPELL_ID }), null);
});

test('devolve uma Armadilha face-down controlada pelo oponente à mão do proprietário', () => {
  const { activation, targetUid } = setup({ targetId: TRAP_ID, faceUp: false });
  const result = resolveSpiritualism(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.returned, true);
  assert.equal(result.targetLost, false);
  assert.equal(result.returnedUid, targetUid);
  assert.ok(privateZone(result.state, 1, 'hand').some(card => card.uid === targetUid));
  assert.equal(result.state.core.players[1].backrow.some(card => card.uid === targetUid), false);
});

test('devolve uma Magia face-up controlada pelo oponente', () => {
  const { activation, targetUid } = setup({ targetId: SPELL_ID, faceUp: true });
  const result = resolveSpiritualism(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.returned, true);
  assert.ok(privateZone(result.state, 1, 'hand').some(card => card.uid === targetUid));
});

test('devolve a Magia de Campo do oponente e libera apenas sua Field Zone', () => {
  const { activation, targetUid } = setup({ targetId: FIELD_ID, field: true });
  const result = resolveSpiritualism(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.returned, true);
  assert.equal(result.state.core.players[1].field, null);
  assert.ok(privateZone(result.state, 1, 'hand').some(card => card.uid === targetUid));
});

test('retorna ao proprietário físico inativo, não à mão do controlador atual', () => {
  const { activation, targetUid } = setup({ ownerSeat: 2, controllerTeam: 1, targetId: TRAP_ID });
  assert.equal(activation.plan.targetOwnerSeat, 2);
  const result = resolveSpiritualism(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.ok(privateZone(result.state, 2, 'hand').some(card => card.uid === targetUid));
  assert.equal(privateZone(result.state, 1, 'hand').some(card => card.uid === targetUid), false);
});

test('rejeita alvo inexistente ou fora das zonas Spell/Trap', () => {
  const duel = makeDuel(0);
  const sourceUid = putSourceInHand(duel, 0, SPELL_ID);
  assert.equal(activateSpiritualism(duel, sourceUid, 'm1:not-on-field', { cardId: SPELL_ID }), null);
});

test('revalida se o alvo deixou o campo antes da resolução', () => {
  const { activation, targetUid } = setup();
  const changed = structuredClone(activation.state);
  const index = changed.core.players[1].backrow.findIndex(card => card.uid === targetUid);
  const [target] = changed.core.players[1].backrow.splice(index, 1);
  privateZone(changed, 1, 'hand').push({ uid: target.uid, id: target.id });
  const before = inventory(changed);
  const result = resolveSpiritualism(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.returned, false);
  assert.equal(result.targetLost, true);
  assert.deepEqual(inventory(result.state), before);
});

test('rejeita alvo cuja identidade mudou após a ativação', () => {
  const { activation, targetUid } = setup();
  const changed = structuredClone(activation.state);
  changed.core.players[1].backrow.find(card => card.uid === targetUid).id = TRAP_ID;
  const result = resolveSpiritualism(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.returned, false);
  assert.equal(result.targetLost, true);
});

test('não aceita a fonte fora do Cemitério da equipe proprietária', () => {
  const { activation, sourceUid, targetUid } = setup();
  const changed = structuredClone(activation.state);
  const index = changed.core.players[0].grave.findIndex(card => card.uid === sourceUid);
  const [source] = changed.core.players[0].grave.splice(index, 1);
  privateZone(changed, 0, 'hand').push(source);
  assert.equal(resolveSpiritualism(changed, activation.plan, { cardId: SPELL_ID }), null);
  assert.ok(targetUid);
});

test('não aceita a fonte no Cemitério da equipe errada', () => {
  const { activation, sourceUid } = setup();
  const changed = structuredClone(activation.state);
  const index = changed.core.players[0].grave.findIndex(card => card.uid === sourceUid);
  const [source] = changed.core.players[0].grave.splice(index, 1);
  changed.core.players[1].grave.push(source);
  assert.equal(resolveSpiritualism(changed, activation.plan, { cardId: SPELL_ID }), null);
});

test('não reavalia controle atual: alvo que mudou de equipe continua sendo devolvido ao dono', () => {
  const { activation, targetUid } = setup();
  const changed = structuredClone(activation.state);
  const index = changed.core.players[1].backrow.findIndex(card => card.uid === targetUid);
  const [target] = changed.core.players[1].backrow.splice(index, 1);
  changed.core.players[0].backrow.push(target);
  const result = resolveSpiritualism(changed, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(result.returned, true);
  assert.ok(privateZone(result.state, 1, 'hand').some(card => card.uid === targetUid));
});

test('a ativação/efeito não pode ser negado; flag de negação não cancela a resolução', () => {
  const { activation, targetUid } = setup();
  const result = resolveSpiritualism(activation.state, activation.plan, { cardId: SPELL_ID, negated: true });
  assert.ok(result);
  assert.equal(result.returned, true);
  assert.ok(privateZone(result.state, 1, 'hand').some(card => card.uid === targetUid));
});

test('recibo persistido bloqueia replay após resolução', () => {
  const { activation } = setup();
  const first = resolveSpiritualism(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(first);
  assert.equal(resolveSpiritualism(first.state, activation.plan, { cardId: SPELL_ID }), null);
  const roundTrip = JSON.parse(JSON.stringify(first.state));
  assert.equal(resolveSpiritualism(roundTrip, activation.plan, { cardId: SPELL_ID }), null);
});

test('assento 2 pode ativar com sua própria mão física quando está ativo', () => {
  const { activation, sourceUid } = setup({ first: 2, ownerSeat: 1, controllerTeam: 1, targetId: TRAP_ID });
  assert.equal(activation.plan.ownerSeat, 2);
  assert.equal(activation.plan.ownerTeam, 0);
  assert.ok(activation.state.core.players[0].grave.some(card => card.uid === sourceUid));
});

test('entrada original e estado entre ativação/resolução permanecem imutáveis', () => {
  const { duel, activation } = setup();
  const original = JSON.stringify(duel);
  const activated = JSON.stringify(activation.state);
  const result = resolveSpiritualism(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.equal(JSON.stringify(duel), original);
  assert.equal(JSON.stringify(activation.state), activated);
});

test('mantém três Monster Zones e três Spell/Trap Zones; Field Zone é separada', () => {
  const { duel } = setup();
  assertSpiritualismRules(duel);
  assert.equal(duel.core.players[0].monsters.length, 0);
  assert.equal(duel.core.players[0].backrow.length, 0);
  assert.equal(duel.core.players[0].field, null);
});

test('rejeita plano adulterado, de outro turno ou com equipe incompatível', () => {
  const { activation } = setup();
  assert.equal(resolveSpiritualism(activation.state, { ...activation.plan, turn: activation.plan.turn + 1 }, { cardId: SPELL_ID }), null);
  assert.equal(resolveSpiritualism(activation.state, { ...activation.plan, ownerTeam: 1 }, { cardId: SPELL_ID }), null);
  assert.equal(resolveSpiritualism(activation.state, { ...activation.plan, eventId: 'forged' }, { cardId: SPELL_ID }), null);
});

test('inventário e UIDs físicos são conservados ao devolver uma carta', () => {
  const { activation } = setup();
  const before = inventory(activation.state);
  const result = resolveSpiritualism(activation.state, activation.plan, { cardId: SPELL_ID });
  assert.ok(result);
  assert.deepEqual(inventory(result.state), before);
  assert.equal(new Set(inventory(result.state).map(value => value.split('|')[0])).size, inventory(result.state).length);
});

test('identidade real de Spiritualism permanece fora do catálogo dos fixtures', () => {
  assert.equal(enabledCardIds.includes(SPIRITUALISM_ID), false);
  assert.equal(getDuelCard(SPIRITUALISM_ID), undefined);
});
