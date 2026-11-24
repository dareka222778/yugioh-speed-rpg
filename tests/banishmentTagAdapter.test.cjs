const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { createTokenGroup } = require('../dist/tokens.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const SPELL_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'spell');
const TRAP_ID = enabledCardIds.find(id => getDuelCard(id)?.kind === 'trap');
const {
  BANISHER_OF_THE_LIGHT_ID, BAZOO_THE_SOUL_EATER_ID, BAZOO_BASE_ATK,
  banisherOfTheLightApplies, tagGraveDestination,
  prepareBazooActivation, activateBazoo, resolveBazooActivation, bazooEffectiveAtk,
} = require('../dist/banishmentTagAdapter.js');

const FIXTURE_BANISHER_ID = tagNormalCardIds[0];
const FIXTURE_BAZOO_ID = tagNormalCardIds[1];
const FIXTURE_IDS = {
  banisherId: FIXTURE_BANISHER_ID,
  bazooId: FIXTURE_BAZOO_ID,
  bazooBaseAtk: BAZOO_BASE_ATK,
};

function makeDuel() {
  const deck = tagNormalCardIds.slice(2, 22);
  assert.equal(deck.length, 20, 'fixture requires 20 enabled Normal Monsters');
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i, name: 'Member ' + i, cards: [...deck], extra: [],
  }));
  return createTagDuel(players, { seed: 'm579-banishment', first: 0, classic: true });
}
function physicalDeck(duel, seat) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team].deck : duel.reserves[seat].deck;
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
function moveDeckCardToGrave(duel, seat, id) {
  const card = physicalDeck(duel, seat).pop();
  assert.ok(card);
  card.id = id;
  duel.core.players[seat % 2].grave.push(card);
  return card.uid;
}
function setCurrentTeam(duel, team) {
  duel.core.current = team;
  duel.cursor = duel.active[team];
  duel.core.teamRotation.cursor = duel.cursor;
}
function inventoryMap(duel) {
  return new Map(tagInventory(duel).filter(card => card.entityKind !== 'token').map(card => [card.uid, card.id]));
}
function ownerTeam(uid) {
  const match = /^m([0-3]):/.exec(uid);
  assert.ok(match, 'physical UID must encode a seat');
  return Number(match[1]) % 2;
}

test('Banisher of the Light is global across both teams and routes by physical owner, not controller', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 0, 0, FIXTURE_BANISHER_ID);
  const stolenUid = moveDeckCardToField(duel, 1, 0, tagNormalCardIds[5]);
  assert.equal(banisherOfTheLightApplies(duel, FIXTURE_IDS), true);
  assert.deepEqual(tagGraveDestination(duel, stolenUid, FIXTURE_IDS), {
    zone: 'banished', ownerSeat: 1, ownerTeam: 1, replacement: 'banisher-of-the-light',
  });
});

test('Banisher on the opposing field still replaces a card sent to the other team GY', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 1, 1, FIXTURE_BANISHER_ID);
  const targetUid = moveDeckCardToField(duel, 0, 1, tagNormalCardIds[6]);
  const destination = tagGraveDestination(duel, targetUid, FIXTURE_IDS);
  assert.equal(destination.zone, 'banished');
  assert.equal(destination.ownerTeam, 0);
});

test('face-down Banisher does not replace a GY destination', () => {
  const duel = makeDuel();
  moveDeckCardToField(duel, 0, 0, FIXTURE_BANISHER_ID, false);
  const targetUid = moveDeckCardToField(duel, 1, 1, tagNormalCardIds[7]);
  assert.equal(banisherOfTheLightApplies(duel, FIXTURE_IDS), false);
  assert.equal(tagGraveDestination(duel, targetUid, FIXTURE_IDS).zone, 'grave');
});

test('without a face-up Banisher, normal GY routing remains the default', () => {
  const duel = makeDuel();
  const targetUid = moveDeckCardToField(duel, 2, 0, tagNormalCardIds[8]);
  assert.deepEqual(tagGraveDestination(duel, targetUid), {
    zone: 'grave', ownerSeat: 2, ownerTeam: 0, replacement: 'none',
  });
});

test('tokens cease to exist rather than entering either GY or the Banished Zone', () => {
  const duel = makeDuel();
  const [token] = createTokenGroup(duel.core, 0, 1, 'atk');
  const destination = tagGraveDestination(duel, token.uid, FIXTURE_IDS);
  assert.equal(destination.zone, 'vanish');
  assert.equal(destination.replacement, 'token-ceases-to-exist');
});

test('Bazoo offers only monster cards in its controller team shared GY, including its inactive partner', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 1, 0, FIXTURE_BAZOO_ID);
  const partnerCost = moveDeckCardToGrave(duel, 2, tagNormalCardIds[9]);
  const opponentCost = moveDeckCardToGrave(duel, 1, tagNormalCardIds[10]);
  const plan = prepareBazooActivation(duel, sourceUid, 0, FIXTURE_IDS);
  assert.ok(plan);
  assert.deepEqual(plan.candidates.map(card => card.uid), [partnerCost]);
  assert.equal(ownerTeam(partnerCost), 0);
  assert.equal(ownerTeam(opponentCost), 1);
});

test('Bazoo activation banishes exactly the chosen physical cards and marks once-per-turn use', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 1, 0, FIXTURE_BAZOO_ID);
  const costA = moveDeckCardToGrave(duel, 0, tagNormalCardIds[11]);
  const costB = moveDeckCardToGrave(duel, 2, tagNormalCardIds[12]);
  const before = inventoryMap(duel);
  const plan = prepareBazooActivation(duel, sourceUid, 0, FIXTURE_IDS);
  assert.ok(plan);
  const result = activateBazoo(duel, plan, [costA, costB], FIXTURE_IDS);
  assert.ok(result);
  assert.equal(result.state.core.players[0].grave.some(card => card.uid === costA || card.uid === costB), false);
  assert.deepEqual(result.state.core.players[0].banished.map(card => card.uid).sort(), [costA, costB].sort());
  assert.equal(result.state.core.players[0].monsters.find(card => card.uid === sourceUid).effectUsedTurn, duel.core.turn);
  assert.deepEqual(inventoryMap(result.state), before);
  assert.equal(prepareBazooActivation(result.state, sourceUid, 0, FIXTURE_IDS), null);
});

test('Bazoo accepts one to three costs but rejects zero, four, duplicates and stale selections', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_BAZOO_ID);
  const costs = [0, 1, 2, 3].map(i => moveDeckCardToGrave(duel, 0, tagNormalCardIds[13 + i]));
  const plan = prepareBazooActivation(duel, sourceUid, 0, FIXTURE_IDS);
  assert.ok(plan);
  assert.equal(activateBazoo(duel, plan, [], FIXTURE_IDS), null);
  assert.equal(activateBazoo(duel, plan, costs, FIXTURE_IDS), null);
  assert.equal(activateBazoo(duel, plan, [costs[0], costs[0]], FIXTURE_IDS), null);
  const stale = structuredClone(duel);
  stale.core.players[0].grave = stale.core.players[0].grave.filter(card => card.uid !== costs[0]);
  assert.equal(activateBazoo(stale, plan, [costs[0]], FIXTURE_IDS), null);
});

test('Bazoo excludes Spell/Trap cards and monsters in the opposing GY', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_BAZOO_ID);
  assert.ok(SPELL_ID && TRAP_ID, 'fixture requires enabled Spell and Trap cards');
  const ownSpell = moveDeckCardToGrave(duel, 2, SPELL_ID);
  const ownTrap = moveDeckCardToGrave(duel, 0, TRAP_ID);
  const ownMonster = moveDeckCardToGrave(duel, 2, tagNormalCardIds[16]);
  const opponentMonster = moveDeckCardToGrave(duel, 1, tagNormalCardIds[17]);
  const plan = prepareBazooActivation(duel, sourceUid, 0, FIXTURE_IDS);
  assert.ok(plan);
  assert.deepEqual(plan.candidates.map(card => card.uid), [ownMonster]);
  assert.equal(plan.candidates.some(card => [ownSpell, ownTrap, opponentMonster].includes(card.uid)), false);
});

test('Bazoo is available only in its controller Main Phase with an open chain', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_BAZOO_ID);
  moveDeckCardToGrave(duel, 2, tagNormalCardIds[18]);
  duel.core.phase = 'battle';
  assert.equal(prepareBazooActivation(duel, sourceUid, 0, FIXTURE_IDS), null);
  duel.core.phase = 'main';
  duel.core.pending = { kind: 'monsterEffect', actor: 0, card: sourceUid, id: FIXTURE_BAZOO_ID };
  assert.equal(prepareBazooActivation(duel, sourceUid, 0, FIXTURE_IDS), null);
});

test('Bazoo gains 300 ATK per banished monster through the opponent turn and expires after it', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_BAZOO_ID);
  const costA = moveDeckCardToGrave(duel, 0, tagNormalCardIds[19]);
  const costB = moveDeckCardToGrave(duel, 2, tagNormalCardIds[20]);
  const plan = prepareBazooActivation(duel, sourceUid, 0, FIXTURE_IDS);
  const paid = activateBazoo(duel, plan, [costA, costB], FIXTURE_IDS);
  const resolved = resolveBazooActivation(paid.state, paid.activation, false, FIXTURE_IDS);
  assert.ok(resolved);
  assert.equal(bazooEffectiveAtk(resolved, sourceUid, FIXTURE_IDS), 2200);
  const opponentTurn = structuredClone(resolved);
  opponentTurn.core.turn += 1;
  setCurrentTeam(opponentTurn, 1);
  assert.equal(bazooEffectiveAtk(opponentTurn, sourceUid, FIXTURE_IDS), 2200);
  const afterOpponentTurn = structuredClone(opponentTurn);
  afterOpponentTurn.core.turn += 1;
  setCurrentTeam(afterOpponentTurn, 0);
  assert.equal(bazooEffectiveAtk(afterOpponentTurn, sourceUid, FIXTURE_IDS), 1600);
});

test('a negated Bazoo activation keeps its paid banish cost but gains no ATK', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_BAZOO_ID);
  const costUid = moveDeckCardToGrave(duel, 2, tagNormalCardIds[21]);
  const plan = prepareBazooActivation(duel, sourceUid, 0, FIXTURE_IDS);
  const paid = activateBazoo(duel, plan, [costUid], FIXTURE_IDS);
  const resolved = resolveBazooActivation(paid.state, paid.activation, true, FIXTURE_IDS);
  assert.ok(resolved);
  assert.equal(resolved.core.players[0].banished.some(card => card.uid === costUid), true);
  assert.equal(bazooEffectiveAtk(resolved, sourceUid, FIXTURE_IDS), 1600);
});

test('if Bazoo leaves the field after activation, the cost remains paid but no modifier is attached', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_BAZOO_ID);
  const costUid = moveDeckCardToGrave(duel, 2, tagNormalCardIds[22]);
  const plan = prepareBazooActivation(duel, sourceUid, 0, FIXTURE_IDS);
  const paid = activateBazoo(duel, plan, [costUid], FIXTURE_IDS);
  const sourceIndex = paid.state.core.players[0].monsters.findIndex(card => card.uid === sourceUid);
  const [source] = paid.state.core.players[0].monsters.splice(sourceIndex, 1);
  paid.state.core.players[0].grave.push({ uid: source.uid, id: source.id });
  const resolved = resolveBazooActivation(paid.state, paid.activation, false, FIXTURE_IDS);
  assert.ok(resolved);
  assert.equal(resolved.core.players[0].banished.some(card => card.uid === costUid), true);
  assert.equal(resolved.core.continuousState?.temporary.some(item => item.uid === sourceUid), false);
});

test('the adapter preserves the input snapshot, player hands and the physical inventory', () => {
  const duel = makeDuel();
  const sourceUid = moveDeckCardToField(duel, 0, 0, FIXTURE_BAZOO_ID);
  const costUid = moveDeckCardToGrave(duel, 2, tagNormalCardIds[23]);
  while (duel.core.players[0].hand.length < 7) duel.core.players[0].hand.push(physicalDeck(duel, 0).pop());
  const before = JSON.stringify(duel);
  const beforeInventory = inventoryMap(duel);
  const plan = prepareBazooActivation(duel, sourceUid, 0, FIXTURE_IDS);
  const result = activateBazoo(duel, plan, [costUid], FIXTURE_IDS);
  assert.ok(result);
  assert.equal(JSON.stringify(duel), before);
  assert.deepEqual(inventoryMap(result.state), beforeInventory);
  assert.equal(result.state.core.players[0].hand.length, 7, 'no mid-resolution hand discard; limit is checked at End Phase');
  assert.equal(result.state.reserves[2].hand.length, duel.reserves[2].hand.length);
});

test('the real catalog identities remain explicit and are not silently certified by fixtures', () => {
  assert.equal(BANISHER_OF_THE_LIGHT_ID, '61528025');
  assert.equal(BAZOO_THE_SOUL_EATER_ID, '40133511');
  assert.equal(BAZOO_BASE_ATK, 1600);
  assert.notEqual(FIXTURE_BANISHER_ID, BANISHER_OF_THE_LIGHT_ID);
  assert.notEqual(FIXTURE_BAZOO_ID, BAZOO_THE_SOUL_EATER_ID);
});
