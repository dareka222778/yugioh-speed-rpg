const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const {
  EXILED_FORCE_ID, TRIBE_INFECTING_VIRUS_ID, BANISHER_OF_THE_LIGHT_ID,
  activateExiledForce, resolveExiledForceTarget,
  activateTribeInfectingVirus, resolveTribeInfectingVirus,
} = require('../dist/tributeDiscardDestructionTagAdapter.js');

const FIXTURE_IDS = {
  exiledForceId: tagNormalCardIds[0],
  tribeVirusId: tagNormalCardIds[1],
  banisherId: tagNormalCardIds[2],
};
const SPELL_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'spell');
const TRAP_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'trap');

function makeDuel() {
  const deck = tagNormalCardIds.slice(3, 23);
  assert.equal(deck.length, 20, 'fixture requires 20 enabled Normal Monsters');
  const players = [0, 1, 2, 3].map(i => ({
    id: 'Member ' + i, name: 'Member ' + i, cards: [...deck], extra: [],
  }));
  return createTagDuel(players, { seed: 'm585-costed-destruction', first: 0, classic: true });
}

function physicalDeck(duel, seat) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team].deck : duel.reserves[seat].deck;
}

function physicalHand(duel, seat) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team].hand : duel.reserves[seat].hand;
}

function moveDeckCardToField(duel, seat, controllerTeam, id, faceUp = true) {
  const card = physicalDeck(duel, seat).pop();
  assert.ok(card);
  card.id = id;
  const monster = {
    ...card, owner: seat % 2, position: 'atk', faceUp,
    entered: duel.core.turn, changed: duel.core.turn, attacked: 0,
    atkBoost: 0, defBoost: 0,
  };
  duel.core.players[controllerTeam].monsters.push(monster);
  return monster.uid;
}

function moveDeckCardToHand(duel, seat) {
  const card = physicalDeck(duel, seat).pop();
  assert.ok(card);
  physicalHand(duel, seat).push(card);
  return card.uid;
}

function setMain(duel, team) {
  duel.core.current = team;
  duel.cursor = duel.active[team];
  duel.core.teamRotation.cursor = duel.cursor;
  duel.core.phase = 'main';
  duel.core.resume = 'main';
  duel.core.pending = { kind: 'none' };
  duel.core.chain = [];
  duel.core.turnEnding = false;
}

function inventoryMap(duel) {
  return new Map(tagInventory(duel)
    .filter(card => card.entityKind !== 'token')
    .map(card => [card.uid, card.id]));
}

function ownerSeat(uid) {
  const match = /^m([0-3]):/.exec(uid);
  assert.ok(match, 'physical UID must encode a seat');
  return Number(match[1]);
}

test('Exiled Force pays its Tribute before opening a target prompt across both teams', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 2, 0, FIXTURE_IDS.exiledForceId);
  const ownTarget = moveDeckCardToField(duel, 0, 0, tagNormalCardIds[10]);
  const opposingSet = moveDeckCardToField(duel, 1, 1, tagNormalCardIds[11], false);
  const before = inventoryMap(duel);

  const activation = activateExiledForce(duel, sourceUid, 0, FIXTURE_IDS);
  assert.ok(activation);
  assert.equal(activation.state.core.players[0].monsters.some(m => m.uid === sourceUid), false);
  assert.equal(activation.state.core.players[0].grave.some(c => c.uid === sourceUid), true);
  assert.deepEqual(activation.plan.candidates.map(c => c.uid), [ownTarget, opposingSet]);
  assert.equal(ownerSeat(sourceUid), 2, 'tribute keeps the inactive partner physical owner');
  assert.deepEqual(inventoryMap(activation.state), before);
});

test('Exiled Force cannot pay its Tribute if no other monster can be targeted', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.exiledForceId);
  const before = inventoryMap(duel);
  assert.equal(activateExiledForce(duel, sourceUid, 0, FIXTURE_IDS), null);
  assert.equal(duel.core.players[0].monsters.some(m => m.uid === sourceUid), true);
  assert.deepEqual(inventoryMap(duel), before);
});

test('Exiled Force is an open Main Phase effect for the active physical seat only', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.exiledForceId);
  assert.equal(activateExiledForce(duel, sourceUid, 2, FIXTURE_IDS), null);
  duel.core.phase = 'battle';
  duel.core.resume = 'battle';
  assert.equal(activateExiledForce(duel, sourceUid, 0, FIXTURE_IDS), null);
});

test('Exiled Force returns a face-down target to the shared destruction pipeline', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.exiledForceId);
  const targetUid = moveDeckCardToField(duel, 1, 1, tagNormalCardIds[12], false);
  const activation = activateExiledForce(duel, sourceUid, 0, FIXTURE_IDS);
  assert.ok(activation);
  const result = resolveExiledForceTarget(activation.state, activation.plan, targetUid, false, FIXTURE_IDS);
  assert.ok(result);
  assert.equal(result.destroyedUid, targetUid);
  assert.equal(result.negated, false);
});

test('Exiled Force does not destroy a target that left the field before resolution', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.exiledForceId);
  const targetUid = moveDeckCardToField(duel, 1, 1, tagNormalCardIds[13]);
  const activation = activateExiledForce(duel, sourceUid, 0, FIXTURE_IDS);
  assert.ok(activation);
  const stale = structuredClone(activation.state);
  stale.core.players[1].monsters = stale.core.players[1].monsters.filter(m => m.uid !== targetUid);
  stale.core.players[1].grave.push({ uid: targetUid, id: tagNormalCardIds[13] });
  const result = resolveExiledForceTarget(stale, activation.plan, targetUid, false, FIXTURE_IDS);
  assert.ok(result);
  assert.equal(result.destroyedUid, null);
});

test('Exiled Force cost remains paid when its effect is negated in the chain', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.exiledForceId);
  const targetUid = moveDeckCardToField(duel, 1, 1, tagNormalCardIds[14]);
  const activation = activateExiledForce(duel, sourceUid, 0, FIXTURE_IDS);
  assert.ok(activation);
  const result = resolveExiledForceTarget(activation.state, activation.plan, targetUid, true, FIXTURE_IDS);
  assert.ok(result);
  assert.equal(result.destroyedUid, null);
  assert.equal(result.negated, true);
  assert.equal(result.state.core.players[0].grave.some(c => c.uid === sourceUid), true);
});

test('Banisher replacement applies to Exiled Force Tribute cost without losing the physical card', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 1, 1, FIXTURE_IDS.banisherId);
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.exiledForceId);
  moveDeckCardToField(duel, 1, 1, tagNormalCardIds[15]);
  const before = inventoryMap(duel);
  const activation = activateExiledForce(duel, sourceUid, 0, FIXTURE_IDS);
  assert.ok(activation);
  assert.equal(activation.state.core.players[0].grave.some(c => c.uid === sourceUid), false);
  assert.equal(activation.state.core.players[0].banished.some(c => c.uid === sourceUid), true);
  assert.deepEqual(inventoryMap(activation.state), before);
});

test('Tribe discards from the active seat private hand, not the inactive partner hand', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 2, 0, FIXTURE_IDS.tribeVirusId);
  const activeDiscard = duel.core.players[0].hand[0].uid;
  const partnerHandUid = moveDeckCardToHand(duel, 2);
  const partnerBefore = duel.reserves[2].hand.map(c => c.uid);
  const before = inventoryMap(duel);

  const activation = activateTribeInfectingVirus(
    duel, sourceUid, 0, activeDiscard, 'Warrior', FIXTURE_IDS,
  );
  assert.ok(activation);
  assert.equal(activation.state.core.players[0].hand.some(c => c.uid === activeDiscard), false);
  assert.equal(activation.state.core.players[0].grave.some(c => c.uid === activeDiscard), true);
  assert.deepEqual(activation.state.reserves[2].hand.map(c => c.uid), partnerBefore);
  assert.ok(activation.state.reserves[2].hand.some(c => c.uid === partnerHandUid));
  assert.equal(ownerSeat(activeDiscard), 0);
  assert.deepEqual(inventoryMap(activation.state), before);
});

test('Tribe accepts a Spell or Trap as discard cost', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.tribeVirusId);
  assert.ok(SPELL_ID && TRAP_ID);
  const spell = moveDeckCardToHand(duel, 0);
  duel.core.players[0].hand.find(c => c.uid === spell).id = SPELL_ID;
  const activation = activateTribeInfectingVirus(duel, sourceUid, 0, spell, 'Aqua', FIXTURE_IDS);
  assert.ok(activation);
  assert.equal(activation.state.core.players[0].grave.some(c => c.uid === spell && c.id === SPELL_ID), true);
});

test('Tribe is non-targeting and resolves against every face-up monster of the declared Type', () => {
  const duel = makeDuel();
  const raceId = tagNormalCardIds.find(id => !!getDuelCard(id)?.race);
  assert.ok(raceId);
  const race = getDuelCard(raceId).race;
  const otherId = tagNormalCardIds.find(id => getDuelCard(id)?.race && getDuelCard(id).race !== race);
  assert.ok(otherId);
  const ids = { ...FIXTURE_IDS, tribeVirusId: raceId };
  const sourceUid = moveDeckCardToField(duel, 0, 0, raceId);
  const ownMatch = moveDeckCardToField(duel, 0, 0, raceId);
  const opposingMatch = moveDeckCardToField(duel, 1, 1, raceId);
  const faceDownMatch = moveDeckCardToField(duel, 3, 1, raceId, false);
  const otherRace = moveDeckCardToField(duel, 1, 1, otherId);
  const discard = duel.core.players[0].hand[0].uid;
  const activation = activateTribeInfectingVirus(duel, sourceUid, 0, discard, race, ids);
  assert.ok(activation);
  const result = resolveTribeInfectingVirus(activation.state, activation.plan, false, ids);
  assert.ok(result);
  assert.deepEqual(result.destroyedUids.sort(), [sourceUid, ownMatch, opposingMatch].sort());
  assert.equal(result.destroyedUids.includes(faceDownMatch), false);
  assert.equal(result.destroyedUids.includes(otherRace), false);
});

test('Tribe accepts a declared Type with no matching face-up monsters', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.tribeVirusId);
  const discard = duel.core.players[0].hand[0].uid;
  const activation = activateTribeInfectingVirus(duel, sourceUid, 0, discard, 'No Such Type', FIXTURE_IDS);
  assert.ok(activation);
  const result = resolveTribeInfectingVirus(activation.state, activation.plan, false, FIXTURE_IDS);
  assert.ok(result);
  assert.deepEqual(result.destroyedUids, []);
});

test('Tribe discard is not refunded when the effect is negated at resolution', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.tribeVirusId);
  const discard = duel.core.players[0].hand[0].uid;
  const activation = activateTribeInfectingVirus(duel, sourceUid, 0, discard, 'Warrior', FIXTURE_IDS);
  assert.ok(activation);
  const result = resolveTribeInfectingVirus(activation.state, activation.plan, true, FIXTURE_IDS);
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.deepEqual(result.destroyedUids, []);
  assert.equal(result.state.core.players[0].grave.some(c => c.uid === discard), true);
});

test('Banisher replacement applies to Tribe discard cost', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 1, 1, FIXTURE_IDS.banisherId);
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.tribeVirusId);
  const discard = duel.core.players[0].hand[0].uid;
  const activation = activateTribeInfectingVirus(duel, sourceUid, 0, discard, 'Warrior', FIXTURE_IDS);
  assert.ok(activation);
  assert.equal(activation.state.core.players[0].grave.some(c => c.uid === discard), false);
  assert.equal(activation.state.core.players[0].banished.some(c => c.uid === discard), true);
});

test('A seven-card hand is not auto-trimmed; Tribe pays only its one discard cost', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.tribeVirusId);
  moveDeckCardToHand(duel, 0);
  moveDeckCardToHand(duel, 0);
  moveDeckCardToHand(duel, 0);
  assert.equal(duel.core.players[0].hand.length, 7);
  const discard = duel.core.players[0].hand[0].uid;
  const activation = activateTribeInfectingVirus(duel, sourceUid, 0, discard, 'Warrior', FIXTURE_IDS);
  assert.ok(activation);
  assert.equal(activation.state.core.players[0].hand.length, 6);
});

test('M585 does not grant inventory and rejects a team field beyond three Monster Zones', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_IDS.tribeVirusId);
  for (let i = 0; i < 3; i++) moveDeckCardToField(duel, 0, 0, tagNormalCardIds[24 + i]);
  assert.throws(
    () => activateTribeInfectingVirus(duel, sourceUid, 0, duel.core.players[0].hand[0].uid, 'Warrior', FIXTURE_IDS),
    /limite de zonas|Monster Zones/,
  );
});
