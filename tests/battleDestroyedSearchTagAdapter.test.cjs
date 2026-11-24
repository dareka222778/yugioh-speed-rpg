const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const {
  BIRDFACE_ID, KELDO_ID, HARPIE_LADY_ID,
  prepareBattleDestroyedTrigger, resolveBirdface, resolveKeldo,
} = require('../dist/battleDestroyedSearchTagAdapter.js');

const FIXTURE_BIRDFACE_ID = tagNormalCardIds[0];
const FIXTURE_KELDO_ID = tagNormalCardIds[1];
const FIXTURE_HARPIE_LADY_ID = tagNormalCardIds[2];
const FIXTURE_TARGET_A_ID = tagNormalCardIds[3];
const FIXTURE_TARGET_B_ID = tagNormalCardIds[4];
const FIXTURE_IDS = {
  birdfaceId: FIXTURE_BIRDFACE_ID,
  keldoId: FIXTURE_KELDO_ID,
  harpieLadyId: FIXTURE_HARPIE_LADY_ID,
};
const FUSION_ID = enabledCardIds.find(id => getDuelCard(id)?.fusion);
const BASE_DECK = tagNormalCardIds.slice(0, 20);

function makeDuel(withExtra = false) {
  assert.equal(BASE_DECK.length, 20, 'fixture requires 20 enabled Normal Monsters');
  if (withExtra) assert.ok(FUSION_ID, 'fixture requires one enabled Fusion Monster');
  const players = [0, 1, 2, 3].map(i => ({
    id: 'm' + i,
    name: 'Member ' + i,
    cards: [...BASE_DECK],
    ...(withExtra ? { extra: [FUSION_ID] } : {}),
  }));
  return createTagDuel(players, { seed: 'm580-battle-destroyed', first: 0, classic: true });
}

function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team][zone] : duel.reserves[seat][zone];
}
function moveDeckCardToGrave(duel, seat, id) {
  const card = privateZone(duel, seat, 'deck').pop();
  assert.ok(card, 'physical Deck must contain a card');
  card.id = id;
  duel.core.players[seat % 2].grave.push(card);
  return card.uid;
}
function setOneDeckCardId(duel, seat, id) {
  const card = privateZone(duel, seat, 'deck')[0];
  assert.ok(card, 'physical Deck must contain a search target');
  card.id = id;
  return card.uid;
}
function moveDeckCardToHand(duel, seat) {
  const card = privateZone(duel, seat, 'deck').pop();
  assert.ok(card);
  privateZone(duel, seat, 'hand').push(card);
  return card.uid;
}
function moveExtraCardToGrave(duel, seat) {
  const card = privateZone(duel, seat, 'extra').pop();
  assert.ok(card, 'physical Extra Deck must contain a Fusion fixture');
  duel.core.players[seat % 2].grave.push(card);
  return card.uid;
}
function event(cardUid, patch = {}) {
  return {
    cardUid,
    destroyedByBattle: true,
    sentToGrave: true,
    damageStepComplete: true,
    ...patch,
  };
}
function inventory(duel) {
  return new Map(tagInventory(duel).map(card => [card.uid, card.id]));
}
function sourceFor(duel, seat, id) {
  return moveDeckCardToGrave(duel, seat, id);
}

test('battle trigger waits for battle destruction, GY destination and completed Damage Step', () => {
  const duel = makeDuel();
  const sourceUid = sourceFor(duel, 0, FIXTURE_BIRDFACE_ID);
  setOneDeckCardId(duel, 0, FIXTURE_HARPIE_LADY_ID);
  assert.equal(prepareBattleDestroyedTrigger(duel, event(sourceUid, { destroyedByBattle: false }), FIXTURE_IDS), null);
  assert.equal(prepareBattleDestroyedTrigger(duel, event(sourceUid, { sentToGrave: false }), FIXTURE_IDS), null);
  assert.equal(prepareBattleDestroyedTrigger(duel, event(sourceUid, { damageStepComplete: false }), FIXTURE_IDS), null);
});

test('a source not in its physical owner shared GY cannot create a battle-destroyed trigger', () => {
  const duel = makeDuel();
  const sourceUid = setOneDeckCardId(duel, 0, FIXTURE_BIRDFACE_ID);
  setOneDeckCardId(duel, 0, FIXTURE_HARPIE_LADY_ID);
  assert.equal(prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS), null);
});

test('Birdface searches the active physical owner hand and shuffles that owner Deck', () => {
  const duel = makeDuel();
  const sourceUid = sourceFor(duel, 0, FIXTURE_BIRDFACE_ID);
  const harpieUid = setOneDeckCardId(duel, 0, FIXTURE_HARPIE_LADY_ID);
  const before = JSON.stringify(duel);
  const beforeCounter = duel.core.random.counter;
  const plan = prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS);
  assert.equal(plan.kind, 'birdface');
  const result = resolveBirdface(duel, plan, false, FIXTURE_IDS);
  assert.ok(result);
  assert.equal(result.searched, true);
  assert.equal(result.movedUid, harpieUid);
  assert.ok(privateZone(result.state, 0, 'hand').some(card => card.uid === harpieUid));
  assert.ok(!privateZone(result.state, 0, 'deck').some(card => card.uid === harpieUid));
  assert.ok(result.state.core.random.counter > beforeCounter);
  assert.equal(JSON.stringify(duel), before, 'resolution must not mutate the input snapshot');
  assert.deepEqual(inventory(result.state), inventory(duel));
});

test('Birdface routes to an inactive physical partner and permits a seven-card hand until End Phase', () => {
  const duel = makeDuel();
  const sourceUid = sourceFor(duel, 2, FIXTURE_BIRDFACE_ID);
  const harpieUid = setOneDeckCardId(duel, 2, FIXTURE_HARPIE_LADY_ID);
  while (privateZone(duel, 2, 'hand').length < 6) moveDeckCardToHand(duel, 2);
  const activePartnerHand = privateZone(duel, 0, 'hand').map(card => card.uid);
  const plan = prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS);
  assert.equal(plan.kind, 'birdface');
  const result = resolveBirdface(duel, plan, false, FIXTURE_IDS);
  assert.ok(result);
  assert.equal(privateZone(result.state, 2, 'hand').length, 7);
  assert.ok(privateZone(result.state, 2, 'hand').some(card => card.uid === harpieUid));
  assert.deepEqual(privateZone(result.state, 0, 'hand').map(card => card.uid), activePartnerHand);
  assert.ok(!privateZone(result.state, 2, 'deck').some(card => card.uid === harpieUid));
  assert.ok(result.state.core.random.counter > duel.core.random.counter);
});

test('Birdface does not offer a trigger without Harpie Lady in the physical owner Deck', () => {
  const duel = makeDuel();
  const sourceUid = sourceFor(duel, 3, FIXTURE_BIRDFACE_ID);
  for (const card of privateZone(duel, 3, 'deck')) card.id = FIXTURE_TARGET_A_ID;
  assert.equal(prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS), null);
});

test('a negated Birdface trigger leaves the private Deck and hand unchanged', () => {
  const duel = makeDuel();
  const sourceUid = sourceFor(duel, 2, FIXTURE_BIRDFACE_ID);
  const harpieUid = setOneDeckCardId(duel, 2, FIXTURE_HARPIE_LADY_ID);
  const before = JSON.stringify(duel);
  const plan = prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS);
  const result = resolveBirdface(duel, plan, true, FIXTURE_IDS);
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.equal(result.movedUid, null);
  assert.ok(privateZone(result.state, 2, 'deck').some(card => card.uid === harpieUid));
  assert.equal(JSON.stringify(result.state), before);
});

test('a Birdface plan cannot resolve after the turn has advanced', () => {
  const duel = makeDuel();
  const sourceUid = sourceFor(duel, 0, FIXTURE_BIRDFACE_ID);
  setOneDeckCardId(duel, 0, FIXTURE_HARPIE_LADY_ID);
  const plan = prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS);
  const stale = structuredClone(duel);
  stale.core.turn += 1;
  assert.equal(resolveBirdface(stale, plan, false, FIXTURE_IDS), null);
});

test('Keldo targets only cards in the opposing shared GY, not its own team GY', () => {
  const duel = makeDuel();
  const sourceUid = sourceFor(duel, 2, FIXTURE_KELDO_ID);
  const own = moveDeckCardToGrave(duel, 0, FIXTURE_TARGET_A_ID);
  const opponentA = moveDeckCardToGrave(duel, 1, FIXTURE_TARGET_A_ID);
  const opponentB = moveDeckCardToGrave(duel, 3, FIXTURE_TARGET_B_ID);
  const plan = prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS);
  assert.equal(plan.kind, 'keldo');
  assert.deepEqual(plan.candidates.map(card => card.uid).sort(), [opponentA, opponentB].sort());
  assert.ok(!plan.candidates.some(card => card.uid === own));
});

test('Keldo returns each target to its physical owner Deck, including an inactive partner, and shuffles affected Decks', () => {
  const duel = makeDuel();
  const sourceUid = sourceFor(duel, 0, FIXTURE_KELDO_ID);
  const targetActive = moveDeckCardToGrave(duel, 1, FIXTURE_TARGET_A_ID);
  const targetInactive = moveDeckCardToGrave(duel, 3, FIXTURE_TARGET_B_ID);
  const before = JSON.stringify(duel);
  const beforeCounter = duel.core.random.counter;
  const plan = prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS);
  assert.equal(plan.kind, 'keldo');
  const result = resolveKeldo(duel, plan, [targetActive, targetInactive], false, FIXTURE_IDS);
  assert.ok(result);
  assert.deepEqual(new Set(result.movedUids), new Set([targetActive, targetInactive]));
  assert.ok(privateZone(result.state, 1, 'deck').some(card => card.uid === targetActive));
  assert.ok(privateZone(result.state, 3, 'deck').some(card => card.uid === targetInactive));
  assert.ok(!result.state.core.players[1].grave.some(card => card.uid === targetActive || card.uid === targetInactive));
  assert.ok(result.state.core.random.counter > beforeCounter);
  assert.equal(JSON.stringify(duel), before);
  assert.deepEqual(inventory(result.state), inventory(duel));
});

test('Keldo resolves only targets still in the opposing GY and conserves a stale target elsewhere', () => {
  const duel = makeDuel();
  const sourceUid = sourceFor(duel, 0, FIXTURE_KELDO_ID);
  const targetA = moveDeckCardToGrave(duel, 1, FIXTURE_TARGET_A_ID);
  const targetB = moveDeckCardToGrave(duel, 3, FIXTURE_TARGET_B_ID);
  const plan = prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS);
  const staleIndex = duel.core.players[1].grave.findIndex(card => card.uid === targetA);
  const [staleCard] = duel.core.players[1].grave.splice(staleIndex, 1);
  duel.core.players[1].banished.push(staleCard);
  const result = resolveKeldo(duel, plan, [targetA, targetB], false, FIXTURE_IDS);
  assert.ok(result);
  assert.deepEqual(result.movedUids, [targetB]);
  assert.ok(result.state.core.players[1].banished.some(card => card.uid === targetA));
  assert.ok(privateZone(result.state, 3, 'deck').some(card => card.uid === targetB));
});

test('Keldo rejects fewer than two, duplicate or unoffered target selections', () => {
  const duel = makeDuel();
  const sourceUid = sourceFor(duel, 0, FIXTURE_KELDO_ID);
  const targetA = moveDeckCardToGrave(duel, 1, FIXTURE_TARGET_A_ID);
  const targetB = moveDeckCardToGrave(duel, 3, FIXTURE_TARGET_B_ID);
  const plan = prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS);
  assert.equal(resolveKeldo(duel, plan, [targetA], false, FIXTURE_IDS), null);
  assert.equal(resolveKeldo(duel, plan, [targetA, targetA], false, FIXTURE_IDS), null);
  assert.equal(resolveKeldo(duel, plan, [targetA, 'not-offered'], false, FIXTURE_IDS), null);
});

test('a negated Keldo trigger returns no targets and does not consume random state', () => {
  const duel = makeDuel();
  const sourceUid = sourceFor(duel, 0, FIXTURE_KELDO_ID);
  const targetA = moveDeckCardToGrave(duel, 1, FIXTURE_TARGET_A_ID);
  const targetB = moveDeckCardToGrave(duel, 3, FIXTURE_TARGET_B_ID);
  const plan = prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS);
  const before = JSON.stringify(duel);
  const result = resolveKeldo(duel, plan, [targetA, targetB], true, FIXTURE_IDS);
  assert.ok(result);
  assert.equal(result.negated, true);
  assert.deepEqual(result.movedUids, []);
  assert.equal(JSON.stringify(result.state), before);
});

test('Keldo sends a Fusion target to the physical owner Extra Deck, not the Main Deck', () => {
  const duel = makeDuel(true);
  const sourceUid = sourceFor(duel, 0, FIXTURE_KELDO_ID);
  const normalTarget = moveDeckCardToGrave(duel, 1, FIXTURE_TARGET_A_ID);
  const fusionTarget = moveExtraCardToGrave(duel, 3);
  const plan = prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS);
  const result = resolveKeldo(duel, plan, [normalTarget, fusionTarget], false, FIXTURE_IDS);
  assert.ok(result);
  assert.ok(privateZone(result.state, 3, 'extra').some(card => card.uid === fusionTarget));
  assert.ok(!privateZone(result.state, 3, 'deck').some(card => card.uid === fusionTarget));
  assert.ok(privateZone(result.state, 1, 'deck').some(card => card.uid === normalTarget));
  assert.equal(getDuelCard(FUSION_ID).fusion, true);
});

test('Keldo is unavailable when fewer than two opposing cards remain in the shared GY', () => {
  const duel = makeDuel();
  const sourceUid = sourceFor(duel, 0, FIXTURE_KELDO_ID);
  moveDeckCardToGrave(duel, 1, FIXTURE_TARGET_A_ID);
  assert.equal(prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS), null);
});

test('unknown destroyed cards cannot be interpreted as Birdface or Keldo', () => {
  const duel = makeDuel();
  const sourceUid = sourceFor(duel, 0, FIXTURE_TARGET_B_ID);
  setOneDeckCardId(duel, 0, FIXTURE_HARPIE_LADY_ID);
  assert.equal(prepareBattleDestroyedTrigger(duel, event(sourceUid), FIXTURE_IDS), null);
});

test('the real Birdface, Keldo and Harpie Lady identities stay explicit and uncertified', () => {
  assert.equal(BIRDFACE_ID, '45547649');
  assert.equal(KELDO_ID, '80441106');
  assert.equal(HARPIE_LADY_ID, '76812113');
  assert.notEqual(FIXTURE_BIRDFACE_ID, BIRDFACE_ID);
  assert.notEqual(FIXTURE_KELDO_ID, KELDO_ID);
  assert.notEqual(FIXTURE_HARPIE_LADY_ID, HARPIE_LADY_ID);
});
