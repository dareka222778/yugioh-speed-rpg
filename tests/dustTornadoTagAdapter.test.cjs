const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagNormalCardIds, tagInventory, tagDecisionMember } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard, getEffect } = require('../dist/effectRegistry.js');
const { getMonsterEffect } = require('../dist/monsterEffects.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  DUST_TORNADO_ID,
  activateDustTornado,
  resolveDustTornado,
  assertDustTornadoRules,
  assertPhysicalExtraDeckCounts,
} = require('../dist/dustTornadoTagAdapter.js');

const NORMAL_ID = tagNormalCardIds[0];
const SPELL_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'spell' && getDuelCard(id)?.field !== true);
const TRAP_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'trap');
const FIELD_SPELL_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'spell' && getDuelCard(id)?.field === true);
const MONSTER_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'monster');
const JINZO_ID = enabledCardIds.find(id => getMonsterEffect(id)?.operation.kind === 'negateTraps');
assert.ok(NORMAL_ID);
assert.ok(SPELL_ID);
assert.ok(TRAP_ID);
assert.ok(FIELD_SPELL_ID);
assert.ok(MONSTER_ID);
assert.ok(DUST_TORNADO_ID);

function makeDuel(first = 0) {
  const deck = tagNormalCardIds.slice(0, 20);
  assert.equal(deck.length, 20);
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...deck],
    extra: [],
  }));
  const duel = createTagDuel(players, { seed: 'm623-dust-tornado', first, classic: true });
  duel.core.turn = 3;
  duel.core.phase = 'main';
  duel.core.pending = { kind: 'none' };
  duel.core.chain = [];
  duel.core.priority = duel.core.current;
  duel.core.passes = 0;
  duel.core.damageStep = false;
  duel.core.turnEnding = false;
  duel.core.handFlow = undefined;
  duel.core.choice = undefined;
  return duel;
}

function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat
    ? duel.core.players[team][zone]
    : duel.reserves[String(seat)][zone];
}

function placeBackrow(duel, physicalOwnerSeat, controllerTeam, id, setTurn = 0, faceUp = false) {
  const hand = privateZone(duel, physicalOwnerSeat, 'hand');
  const [card] = hand.splice(0, 1);
  assert.ok(card, 'fixture needs a physical card in hand');
  card.id = id;
  duel.core.players[controllerTeam].backrow.push({
    ...card,
    faceUp,
    setTurn,
  });
  return card.uid;
}

function placeField(duel, physicalOwnerSeat, controllerTeam, id, faceUp = false) {
  const hand = privateZone(duel, physicalOwnerSeat, 'hand');
  const [card] = hand.splice(0, 1);
  assert.ok(card, 'fixture needs a physical card in hand');
  card.id = id;
  duel.core.players[controllerTeam].field = {
    ...card,
    faceUp,
    setTurn: 0,
  };
  return card.uid;
}

function placeMonster(duel, physicalOwnerSeat, controllerTeam, id) {
  const hand = privateZone(duel, physicalOwnerSeat, 'hand');
  const [card] = hand.splice(0, 1);
  assert.ok(card, 'fixture needs a physical card in hand');
  card.id = id;
  duel.core.players[controllerTeam].monsters.push({
    ...card,
    owner: physicalOwnerSeat % 2,
    position: 'atk',
    faceUp: true,
    entered: duel.core.turn,
    changed: duel.core.turn,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
  });
  return card.uid;
}

function putHandCard(duel, seat, id) {
  const card = privateZone(duel, seat, 'hand')[0];
  assert.ok(card);
  card.id = id;
  return card.uid;
}

function partnerSeat(seat) {
  return seat % 2 === 0 ? seat + 2 : seat - 2;
}

function inventory(duel) {
  return tagInventory(duel).filter(card => card.entityKind !== 'token')
    .map(card => card.uid + '|' + card.id).sort();
}

function setup({
  first = 0,
  sourceSeat,
  sourceSetTurn = 2,
  sourceFaceUp = false,
  targetZone = 'backrow',
  targetFaceUp = false,
  targetOwnerSeat,
  targetController,
} = {}) {
  const duel = makeDuel(first);
  const activeTeam = tagDecisionMember(duel).team;
  const activeSeat = duel.active[activeTeam];
  const sourcePhysicalSeat = sourceSeat ?? activeSeat;
  const opponentTeam = (1 - activeTeam);
  const targetPhysicalSeat = targetOwnerSeat ?? opponentTeam;
  const targetControllerTeam = targetController ?? opponentTeam;
  const sourceUid = placeBackrow(duel, sourcePhysicalSeat, activeTeam, TRAP_ID, sourceSetTurn, sourceFaceUp);
  const targetId = targetZone === 'field' ? FIELD_SPELL_ID : SPELL_ID;
  const targetUid = targetZone === 'field'
    ? placeField(duel, targetPhysicalSeat, targetControllerTeam, targetId, targetFaceUp)
    : placeBackrow(duel, targetPhysicalSeat, targetControllerTeam, targetId, 0, targetFaceUp);
  const activation = activateDustTornado(duel, sourceUid, targetUid, { cardId: TRAP_ID });
  return {
    duel,
    activeTeam,
    activeSeat,
    opponentTeam,
    sourcePhysicalSeat,
    sourceUid,
    targetPhysicalSeat,
    targetUid,
    activation,
  };
}

function moveTargetToHand(duel, targetUid, ownerSeat) {
  const team = duel.core.players.findIndex(player => player.backrow.some(card => card.uid === targetUid));
  if (team >= 0) {
    const [card] = duel.core.players[team].backrow.splice(
      duel.core.players[team].backrow.findIndex(item => item.uid === targetUid), 1,
    );
    privateZone(duel, ownerSeat, 'hand').push(card);
  } else {
    const fieldTeam = duel.core.players.findIndex(player => player.field?.uid === targetUid);
    assert.notEqual(fieldTeam, -1);
    const card = duel.core.players[fieldTeam].field;
    duel.core.players[fieldTeam].field = null;
    privateZone(duel, ownerSeat, 'hand').push(card);
  }
  synchronizeCardLifetimes(duel.core);
}

test('Dust Tornado remains unregistered and cannot be certified by adapter import', () => {
  assert.equal(getDuelCard(DUST_TORNADO_ID), undefined);
  assert.equal(getEffect(DUST_TORNADO_ID), undefined);
});

test('activates a partner-set Trap from the active team and hides target identity', () => {
  const duel = makeDuel(0);
  const activeTeam = tagDecisionMember(duel).team;
  const activeSeat = duel.active[activeTeam];
  const sourceSeat = partnerSeat(activeSeat);
  const sourceUid = placeBackrow(duel, sourceSeat, activeTeam, TRAP_ID, 2, false);
  const targetUid = placeBackrow(duel, 1 - activeTeam, 1 - activeTeam, SPELL_ID, 0, false);
  const activation = activateDustTornado(duel, sourceUid, targetUid, { cardId: TRAP_ID });
  assert.ok(activation);
  assert.equal(activation.plan.activeSeat, activeSeat);
  assert.equal(activation.plan.activeTeam, activeTeam);
  assert.equal(activation.plan.sourceOwnerSeat, sourceSeat);
  assert.equal(activation.plan.sourceOwnerTeam, sourceSeat % 2);
  assert.equal('targetId' in activation.plan, false);
  assert.ok(activation.state.core.players[sourceSeat % 2].grave.some(card => card.uid === sourceUid));
  assert.ok(activation.state.core.players[1 - activeTeam].backrow.some(card => card.uid === targetUid));
});

test('rejects a Trap Set this turn', () => {
  const result = setup({ sourceSetTurn: 3 });
  assert.equal(result.activation, null);
});

test('rejects a face-up source', () => {
  const result = setup({ sourceFaceUp: true });
  assert.equal(result.activation, null);
});

test('rejects a source controlled by the opposing team', () => {
  const duel = makeDuel(0);
  const activeTeam = tagDecisionMember(duel).team;
  const activeSeat = duel.active[activeTeam];
  const sourceUid = placeBackrow(duel, 1 - activeTeam, 1 - activeTeam, TRAP_ID, 2, false);
  const targetUid = placeBackrow(duel, activeSeat, activeTeam, SPELL_ID, 0, false);
  assert.equal(activateDustTornado(duel, sourceUid, targetUid, { cardId: TRAP_ID }), null);
});

test('rejects a target controlled by its own team', () => {
  const duel = makeDuel(0);
  const activeTeam = tagDecisionMember(duel).team;
  const activeSeat = duel.active[activeTeam];
  const sourceUid = placeBackrow(duel, activeSeat, activeTeam, TRAP_ID, 2, false);
  const targetUid = placeBackrow(duel, partnerSeat(activeSeat), activeTeam, SPELL_ID, 0, false);
  assert.equal(activateDustTornado(duel, sourceUid, targetUid, { cardId: TRAP_ID }), null);
});

test('rejects a target that is not on either Spell/Trap field zone', () => {
  const duel = makeDuel(0);
  const activeTeam = tagDecisionMember(duel).team;
  const activeSeat = duel.active[activeTeam];
  const sourceUid = placeBackrow(duel, activeSeat, activeTeam, TRAP_ID, 2, false);
  const target = privateZone(duel, 1 - activeTeam, 'hand')[0];
  assert.ok(target);
  assert.equal(activateDustTornado(duel, sourceUid, target.uid, { cardId: TRAP_ID }), null);
});

test('rejects Trap activation while Jinzo blocks activations', { skip: !JINZO_ID }, () => {
  const result = setup();
  placeMonster(result.duel, result.activeSeat, result.activeTeam, JINZO_ID);
  assert.equal(
    activateDustTornado(result.duel, result.sourceUid, result.targetUid, { cardId: TRAP_ID }),
    null,
  );
});

test('rejects activation during the Damage Step', () => {
  const result = setup();
  result.duel.core.damageStep = true;
  assert.equal(
    activateDustTornado(result.duel, result.sourceUid, result.targetUid, { cardId: TRAP_ID }),
    null,
  );
});

test('rejects activation while the turn is ending or a choice is unresolved', () => {
  const first = setup();
  first.duel.core.turnEnding = true;
  assert.equal(
    activateDustTornado(first.duel, first.sourceUid, first.targetUid, { cardId: TRAP_ID }),
    null,
  );
  const second = setup();
  second.duel.core.choice = { actor: second.activeTeam, targets: [] };
  assert.equal(
    activateDustTornado(second.duel, second.sourceUid, second.targetUid, { cardId: TRAP_ID }),
    null,
  );
});

test('destroys an opponent face-down backrow card and sends it to its physical owner GY', () => {
  const result = setup({ targetFaceUp: false });
  assert.ok(result.activation);
  const before = inventory(result.activation.state);
  const resolved = resolveDustTornado(result.activation.state, result.activation.plan);
  assert.ok(resolved);
  assert.equal(resolved.targetDestroyed, true);
  assert.equal(resolved.setUid, null);
  assert.ok(resolved.state.core.players[result.targetPhysicalSeat % 2].grave.some(card => card.uid === result.targetUid));
  assert.ok(!resolved.state.core.players[result.opponentTeam].backrow.some(card => card.uid === result.targetUid));
  assert.deepEqual(inventory(resolved.state), before);
});

test('destroys an opponent face-up backrow card', () => {
  const result = setup({ targetFaceUp: true });
  assert.ok(result.activation);
  const resolved = resolveDustTornado(result.activation.state, result.activation.plan);
  assert.ok(resolved);
  assert.equal(resolved.targetDestroyed, true);
});

test('destroys an opponent Field Spell and frees only the separate Field Zone', () => {
  const result = setup({ targetZone: 'field', targetFaceUp: true });
  assert.ok(result.activation);
  const resolved = resolveDustTornado(result.activation.state, result.activation.plan);
  assert.ok(resolved);
  assert.equal(resolved.targetDestroyed, true);
  assert.equal(resolved.state.core.players[result.opponentTeam].field, null);
  assert.ok(resolved.state.core.players[result.targetPhysicalSeat % 2].grave.some(card => card.uid === result.targetUid));
});

test('a stolen target returns to its original physical owner GY, not the controller GY', () => {
  const result = setup({
    targetOwnerSeat: 0,
    targetController: 1,
  });
  assert.ok(result.activation);
  const ownerTeam = result.targetPhysicalSeat % 2;
  assert.notEqual(ownerTeam, result.opponentTeam);
  const resolved = resolveDustTornado(result.activation.state, result.activation.plan);
  assert.ok(resolved);
  assert.ok(resolved.state.core.players[ownerTeam].grave.some(card => card.uid === result.targetUid));
  assert.ok(!resolved.state.core.players[result.opponentTeam].grave.some(card => card.uid === result.targetUid));
});

test('a target moved out before resolution is not replaced', () => {
  const result = setup();
  assert.ok(result.activation);
  const next = structuredClone(result.activation.state);
  moveTargetToHand(next, result.targetUid, result.targetPhysicalSeat);
  const resolved = resolveDustTornado(next, result.activation.plan);
  assert.ok(resolved);
  assert.equal(resolved.targetDestroyed, false);
  assert.ok(privateZone(resolved.state, result.targetPhysicalSeat, 'hand').some(card => card.uid === result.targetUid));
});

test('a target that leaves and returns to the same zone has a stale lifetime binding', () => {
  const result = setup();
  assert.ok(result.activation);
  const next = structuredClone(result.activation.state);
  moveTargetToHand(next, result.targetUid, result.targetPhysicalSeat);
  const hand = privateZone(next, result.targetPhysicalSeat, 'hand');
  const index = hand.findIndex(card => card.uid === result.targetUid);
  const [card] = hand.splice(index, 1);
  next.core.players[result.opponentTeam].backrow.push({ ...card, faceUp: false, setTurn: 0 });
  synchronizeCardLifetimes(next.core);
  const resolved = resolveDustTornado(next, result.activation.plan);
  assert.ok(resolved);
  assert.equal(resolved.targetDestroyed, false);
});

test('a negated Trap does not destroy the target or Set a card', () => {
  const result = setup();
  assert.ok(result.activation);
  const resolved = resolveDustTornado(result.activation.state, result.activation.plan, { negated: true });
  assert.ok(resolved);
  assert.equal(resolved.negated, true);
  assert.equal(resolved.targetDestroyed, false);
  assert.equal(resolved.setUid, null);
  assert.ok(resolved.state.core.players[result.opponentTeam].backrow.some(card => card.uid === result.targetUid));
});

test('the optional Set uses the active physical seat private hand', () => {
  const result = setup({ sourceSeat: partnerSeat(0) });
  assert.ok(result.activation);
  const setUid = putHandCard(result.activation.state, result.activeSeat, SPELL_ID);
  const resolved = resolveDustTornado(result.activation.state, result.activation.plan, { setUid });
  assert.ok(resolved);
  assert.equal(resolved.targetDestroyed, true);
  assert.equal(resolved.setUid, setUid);
  const setCard = resolved.state.core.players[result.activeTeam].backrow.find(card => card.uid === setUid);
  assert.ok(setCard);
  assert.equal(setCard.faceUp, false);
  assert.equal(setCard.setTurn, resolved.state.core.turn);
});

test('the optional Set can place a Field Spell in the separate Field Zone', () => {
  const result = setup();
  assert.ok(result.activation);
  const setUid = putHandCard(result.activation.state, result.activeSeat, FIELD_SPELL_ID);
  const resolved = resolveDustTornado(result.activation.state, result.activation.plan, { setUid });
  assert.ok(resolved);
  assert.equal(resolved.setUid, setUid);
  assert.equal(resolved.state.core.players[result.activeTeam].field?.uid, setUid);
  assert.equal(resolved.state.core.players[result.activeTeam].backrow.length, 0);
});

test('rejects selecting a card from the inactive partner private hand', () => {
  const result = setup();
  assert.ok(result.activation);
  const setUid = putHandCard(result.activation.state, partnerSeat(result.activeSeat), SPELL_ID);
  const snapshot = JSON.stringify(result.activation.state);
  assert.equal(resolveDustTornado(result.activation.state, result.activation.plan, { setUid }), null);
  assert.equal(JSON.stringify(result.activation.state), snapshot);
});

test('rejects selecting a monster as the optional Set', () => {
  const result = setup();
  assert.ok(result.activation);
  const setUid = putHandCard(result.activation.state, result.activeSeat, MONSTER_ID);
  const snapshot = JSON.stringify(result.activation.state);
  assert.equal(resolveDustTornado(result.activation.state, result.activation.plan, { setUid }), null);
  assert.equal(JSON.stringify(result.activation.state), snapshot);
});

test('does not Set after a stale target or a negated effect', () => {
  const stale = setup();
  assert.ok(stale.activation);
  const staleState = structuredClone(stale.activation.state);
  moveTargetToHand(staleState, stale.targetUid, stale.targetPhysicalSeat);
  const staleSetUid = putHandCard(staleState, stale.activeSeat, SPELL_ID);
  assert.equal(resolveDustTornado(staleState, stale.activation.plan, { setUid: staleSetUid }), null);

  const negated = setup();
  assert.ok(negated.activation);
  const negatedSetUid = putHandCard(negated.activation.state, negated.activeSeat, SPELL_ID);
  assert.equal(resolveDustTornado(negated.activation.state, negated.activation.plan, {
    negated: true,
    setUid: negatedSetUid,
  }), null);
});

test('resolution is idempotent and cannot replay the same event', () => {
  const result = setup();
  assert.ok(result.activation);
  const first = resolveDustTornado(result.activation.state, result.activation.plan);
  assert.ok(first);
  assert.equal(resolveDustTornado(first.state, result.activation.plan), null);
});

test('rejects stale turn plans without mutating the saved state', () => {
  const result = setup();
  assert.ok(result.activation);
  const stale = structuredClone(result.activation.state);
  stale.core.turn++;
  const snapshot = JSON.stringify(stale);
  assert.equal(resolveDustTornado(stale, result.activation.plan), null);
  assert.equal(JSON.stringify(stale), snapshot);
});

test('conserves every physical UID through destruction and optional Set', () => {
  const result = setup();
  assert.ok(result.activation);
  const setUid = putHandCard(result.activation.state, result.activeSeat, SPELL_ID);
  const before = inventory(result.activation.state);
  const resolved = resolveDustTornado(result.activation.state, result.activation.plan, { setUid });
  assert.ok(resolved);
  assert.deepEqual(inventory(resolved.state), before);
});

test('all four opening-seat rotations preserve physical ownership and team routing', () => {
  for (const first of [0, 1, 2, 3]) {
    const result = setup({ first, sourceSeat: partnerSeat(first) });
    assert.ok(result.activation, 'first=' + first);
    const resolved = resolveDustTornado(result.activation.state, result.activation.plan);
    assert.ok(resolved, 'first=' + first);
    assert.equal(resolved.targetDestroyed, true, 'first=' + first);
    assert.ok(resolved.state.core.players[result.targetPhysicalSeat % 2].grave.some(card => card.uid === result.targetUid));
  }
});

test('a hand above six is not truncated before the End Phase', () => {
  const duel = makeDuel(0);
  const activeTeam = tagDecisionMember(duel).team;
  const activeSeat = duel.active[activeTeam];
  const hand = privateZone(duel, activeSeat, 'hand');
  const deck = privateZone(duel, activeSeat, 'deck');
  hand.push(deck.pop(), deck.pop());
  const sourceUid = placeBackrow(duel, partnerSeat(activeSeat), activeTeam, TRAP_ID, 2, false);
  const targetUid = placeBackrow(duel, 1 - activeTeam, 1 - activeTeam, SPELL_ID, 0, false);
  const beforeHand = privateZone(duel, activeSeat, 'hand').length;
  const activation = activateDustTornado(duel, sourceUid, targetUid, { cardId: TRAP_ID });
  assert.ok(activation);
  assert.equal(privateZone(activation.state, activeSeat, 'hand').length, beforeHand);
});

test('Field Zone is separate from three Spell/Trap Zones', () => {
  const duel = makeDuel(0);
  const team = tagDecisionMember(duel).team;
  const seat = duel.active[team];
  placeField(duel, seat, team, FIELD_SPELL_ID, false);
  for (let i = 0; i < 3; i++) placeBackrow(duel, seat, team, i % 2 ? SPELL_ID : TRAP_ID, 0, false);
  assert.doesNotThrow(() => assertDustTornadoRules(duel));
  placeBackrow(duel, seat, team, SPELL_ID, 0, false);
  assert.throws(() => assertDustTornadoRules(duel), /três Zonas de Magias/);
});

test('extra Deck physical limits reject more than five cards', () => {
  assert.doesNotThrow(() => assertPhysicalExtraDeckCounts([0, 1, 2, 3], 5));
  assert.throws(() => assertPhysicalExtraDeckCounts([0, 1, 6, 3], 5), /cinco/);
  assert.throws(() => assertPhysicalExtraDeckCounts([0, -1, 0, 0], 5), /inválida/);
});

test('rejected activation leaves the original state untouched', () => {
  const result = setup({ sourceSetTurn: 3 });
  const snapshot = JSON.stringify(result.duel);
  assert.equal(
    activateDustTornado(result.duel, result.sourceUid, result.targetUid, { cardId: TRAP_ID }),
    null,
  );
  assert.equal(JSON.stringify(result.duel), snapshot);
});

test('the adapter never creates or grants inventory', () => {
  const result = setup();
  assert.ok(result.activation);
  const before = inventory(result.activation.state);
  const resolved = resolveDustTornado(result.activation.state, result.activation.plan);
  assert.ok(resolved);
  assert.deepEqual(inventory(resolved.state), before);
});
