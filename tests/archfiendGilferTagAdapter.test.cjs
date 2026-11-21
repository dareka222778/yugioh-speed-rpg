const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, assertTagDuel, tagNormalCardIds } = require('../dist/tagDuel.js');
const {
  ARCHFIEND_OF_GILFER_ID,
  gilferPhysicalSeatFromUid,
  gilferTeamOfSeat,
  listArchfiendGilferTagOffers,
  resolveArchfiendGilferTagOffer,
} = require('../dist/archfiendGilferTagAdapter.js');

const canEquip = target => target.faceUp === true;
const eventFor = (sourceUid, patch = {}) => ({
  kind: 'sendToGy',
  sourceUid,
  lastEventUid: sourceUid,
  lastEventKind: 'sendToGy',
  sequence: 7,
  lastEventSequence: 7,
  activationId: 'm435-gilfer-chain-7',
  effectNegated: false,
  ...patch,
});
function takePhysical(game, seat, id) {
  const held = game.reserves[String(seat)];
  for (const zone of ['deck', 'hand']) {
    const index = held[zone].findIndex(card => card.id === id);
    if (index >= 0) return held[zone].splice(index, 1)[0];
  }
  throw new Error('physical card not found: seat ' + seat + ' / ' + id);
}
function makeActualTagDuel() {
  const normals = tagNormalCardIds.slice(0, 20);
  assert.ok(normals.length >= 20);
  const game = createTagDuel([
    { id: 's0', name: 'Seat 0', cards: [...normals] },
    { id: 's1', name: 'Seat 1', cards: [...normals] },
    { id: 's2', name: 'Seat 2', cards: [...normals] },
    { id: 's3', name: 'Seat 3', cards: [...normals] },
  ], { seed: 'm435-actual-tag-state', first: 0, classic: true });
  assertTagDuel(game);
  const sourceRef = takePhysical(game, 2, normals[0]);
  const targetRef = takePhysical(game, 3, normals[1]);
  const source = { uid: sourceRef.uid, id: ARCHFIEND_OF_GILFER_ID };
  const target = {
    ...targetRef,
    faceUp: true,
    position: 'atk',
    entered: 1,
    changed: 1,
    attacked: 0,
    atkBoost: 0,
    defBoost: 0,
    owner: 1,
  };
  // Gilfer is deliberately injected only into this adapter fixture. It is not
  // certified/playable yet, so the fixture is not re-certified as a full duel.
  game.core.grave.push(source);
  game.core.players[1].monsters.push(target);
  return { game, source, target };
}
function actualOffers(patch = {}, canEquipFn = canEquip) {
  const { game, source, target } = makeActualTagDuel();
  Object.assign(game.core, patch.core || {});
  const event = eventFor(source.uid, patch.event || {});
  return { game, source, target, event, offers: listArchfiendGilferTagOffers(game, source.uid, event, canEquipFn) };
}

test('physical seat parsing preserves all four TagDuel identities', () => {
  assert.deepEqual([0, 1, 2, 3].map(seat => gilferPhysicalSeatFromUid('m' + seat + ':card')), [0, 1, 2, 3]);
  assert.equal(gilferPhysicalSeatFromUid('g2:card'), null);
  assert.equal(gilferPhysicalSeatFromUid('m4:card'), null);
  assert.equal(gilferPhysicalSeatFromUid('unowned'), null);
});
test('seats 0/2 and 1/3 map to the two shared teams', () => {
  assert.deepEqual([0, 1, 2, 3].map(gilferTeamOfSeat), [0, 1, 0, 1]);
});
test('actual TagDuel state maps inactive physical owner seat 2 to active controller seat 0', () => {
  const { game, source, target, event, offers } = actualOffers();
  assert.deepEqual(game.active, [0, 1]);
  assert.equal(source.uid.slice(0, 2), 'm2');
  assert.equal(target.uid.slice(0, 2), 'm3');
  assert.equal(offers.length, 1);
  assert.equal(offers[0].offer.triggerControllerSeat, 0);
  assert.equal(offers[0].offer.sourceTeam, 'even');
  assert.equal(offers[0].targetPhysicalOwnerSeat, 3);
  assert.equal(offers[0].targetControllerSeat, 1);
});
test('resolution preserves physical source and target owners while the trigger team controls Gilfer', () => {
  const { game, source, target, event, offers } = actualOffers();
  const result = resolveArchfiendGilferTagOffer(game, source.uid, event, offers[0], canEquip);
  assert.equal(result.resolved, true);
  assert.deepEqual(result.placement, {
    backrowCard: { uid: source.uid, id: ARCHFIEND_OF_GILFER_ID, setTurn: game.core.turn, faceUp: true, resolved: true, equippedTo: target.uid },
    physicalOwnerSeat: 2,
    controllerSeat: 0,
    controllerTeam: 'even',
    targetUid: target.uid,
    targetPhysicalOwnerSeat: 3,
    targetControllerSeat: 1,
    atkDelta: -500,
    modifierLifetime: 'while-equipped',
    oncePerTurnLimit: false,
  });
});
test('a face-up monster on the source team is also a legal target', () => {
  const { game, source, event } = actualOffers();
  const allyRef = takePhysical(game, 0, tagNormalCardIds[2]);
  game.core.players[0].monsters.push({ ...allyRef, faceUp: true, position: 'def', entered: 1, changed: 1, attacked: 0, atkBoost: 0, defBoost: 0, owner: 0 });
  const offers = listArchfiendGilferTagOffers(game, source.uid, event, canEquip);
  assert.equal(offers.length, 2);
  assert.ok(offers.some(item => item.offer.targetTeam === 'even'));
  assert.ok(offers.some(item => item.offer.targetTeam === 'odd'));
});
test('face-down monsters are never listed or exposed', () => {
  const { game, source, event } = actualOffers();
  game.core.players[1].monsters[0].faceUp = false;
  assert.deepEqual(listArchfiendGilferTagOffers(game, source.uid, event, canEquip), []);
});
test('only the trigger controller team shared backrow capacity is charged', () => {
  const { game, source, event } = actualOffers();
  game.core.players[1].backrow.push({ uid: 'm3:opp-set', id: '00000001', setTurn: 1, faceUp: false });
  assert.equal(listArchfiendGilferTagOffers(game, source.uid, event, canEquip).length, 1);
  game.core.players[0].backrow.push(
    { uid: 'm0:s1', id: '00000002', setTurn: 1, faceUp: false },
    { uid: 'm0:s2', id: '00000003', setTurn: 1, faceUp: false },
    { uid: 'm0:s3', id: '00000004', setTurn: 1, faceUp: false },
  );
  assert.deepEqual(listArchfiendGilferTagOffers(game, source.uid, event, canEquip), []);
});
test('Field Zone is not counted as one of the three shared Spell/Trap Zones', () => {
  const { game, source, event } = actualOffers();
  game.core.players[0].field = { uid: 'm0:field', id: '00000005', setTurn: 1, faceUp: true };
  assert.equal(listArchfiendGilferTagOffers(game, source.uid, event, canEquip).length, 1);
});
test('existing physical Equip UIDs are collected across both teams', () => {
  const { game, source, event } = actualOffers();
  game.core.players[1].backrow.push({ uid: 'm3:existing-equip', id: '00000006', setTurn: 1, faceUp: true, equippedTo: 'm3:some-monster' });
  const offers = listArchfiendGilferTagOffers(game, source.uid, event, canEquip);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].offer.sourceUid, source.uid);
});
test('a source already registered as an Equip UID cannot be equipped again', () => {
  const { game, source, event } = actualOffers();
  game.core.players[0].backrow.push({ uid: source.uid, id: ARCHFIEND_OF_GILFER_ID, setTurn: 1, faceUp: true, equippedTo: 'm1:target' });
  assert.deepEqual(listArchfiendGilferTagOffers(game, source.uid, event, canEquip), []);
});
test('source must be present in the shared Graveyard', () => {
  const { game, source, event } = actualOffers();
  game.core.grave = game.core.grave.filter(card => card.uid !== source.uid);
  assert.deepEqual(listArchfiendGilferTagOffers(game, source.uid, event, canEquip), []);
});
test('wrong card ID in the shared Graveyard cannot use Gilfer adapter', () => {
  const { game, source, event } = actualOffers();
  game.core.grave[0].id = '00000000';
  assert.deepEqual(listArchfiendGilferTagOffers(game, source.uid, event, canEquip), []);
});
test('source team must own the trigger window', () => {
  const { game, source, event } = actualOffers();
  game.core.current = 1;
  assert.deepEqual(listArchfiendGilferTagOffers(game, source.uid, event, canEquip), []);
});
test('send-to-GY must be the last event and match the exact physical source UID', () => {
  const { game, source } = actualOffers();
  assert.deepEqual(listArchfiendGilferTagOffers(game, source.uid, eventFor(source.uid, { lastEventKind: 'other' }), canEquip), []);
  assert.deepEqual(listArchfiendGilferTagOffers(game, source.uid, eventFor(source.uid, { lastEventUid: 'm0:other' }), canEquip), []);
  assert.deepEqual(listArchfiendGilferTagOffers(game, source.uid, eventFor(source.uid, { lastEventSequence: 6 }), canEquip), []);
  assert.deepEqual(listArchfiendGilferTagOffers(game, source.uid, eventFor(source.uid, { sourceUid: 'm0:other' }), canEquip), []);
});
test('negated source effect cannot create an Equip offer', () => {
  const { game, source } = actualOffers();
  assert.deepEqual(listArchfiendGilferTagOffers(game, source.uid, eventFor(source.uid, { effectNegated: true }), canEquip), []);
});
test('an equipability predicate is required and a protected target is rejected', () => {
  const { game, source, event } = actualOffers();
  assert.throws(() => listArchfiendGilferTagOffers(game, source.uid, event, null), /equipability predicate/);
  assert.deepEqual(listArchfiendGilferTagOffers(game, source.uid, event, () => false), []);
});
test('resolution rejects a target that left the shared Monster Zones', () => {
  const { game, source, event, offers } = actualOffers();
  game.core.players[1].monsters = [];
  assert.deepEqual(resolveArchfiendGilferTagOffer(game, source.uid, event, offers[0], canEquip), { resolved: false, reason: 'target-not-in-shared-monster-zones' });
});
test('resolution rejects a target that turns face-down after selection', () => {
  const { game, source, event, offers } = actualOffers();
  game.core.players[1].monsters[0].faceUp = false;
  const result = resolveArchfiendGilferTagOffer(game, source.uid, event, offers[0], canEquip);
  assert.deepEqual(result, { resolved: false, reason: 'target-not-face-up' });
});
test('resolution rejects a target that becomes equip-protected', () => {
  const { game, source, event, offers } = actualOffers();
  const result = resolveArchfiendGilferTagOffer(game, source.uid, event, offers[0], () => false);
  assert.deepEqual(result, { resolved: false, reason: 'target-cannot-be-equipped' });
});
test('resolution rejects a source that leaves the shared Graveyard', () => {
  const { game, source, event, offers } = actualOffers();
  game.core.grave = [];
  assert.deepEqual(resolveArchfiendGilferTagOffer(game, source.uid, event, offers[0], canEquip), { resolved: false, reason: 'source-not-in-shared-graveyard' });
});
test('resolution rechecks the active controller and the target controller team', () => {
  const { game, source, event, offers } = actualOffers();
  game.core.players[0].monsters.push(game.core.players[1].monsters.pop());
  const result = resolveArchfiendGilferTagOffer(game, source.uid, event, offers[0], canEquip);
  assert.deepEqual(result, { resolved: false, reason: 'stale-offer' });
});
test('resolution rejects a full shared Spell/Trap Zone at the trigger controller team', () => {
  const { game, source, event, offers } = actualOffers();
  game.core.players[0].backrow.push(
    { uid: 'm0:s1', id: '00000002', setTurn: 1, faceUp: false },
    { uid: 'm0:s2', id: '00000003', setTurn: 1, faceUp: false },
    { uid: 'm0:s3', id: '00000004', setTurn: 1, faceUp: false },
  );
  assert.deepEqual(resolveArchfiendGilferTagOffer(game, source.uid, event, offers[0], canEquip), { resolved: false, reason: 'no-team-spell-trap-zone' });
});
test('resolution rejects an activation ID that no longer matches the offer', () => {
  const { game, source, event, offers } = actualOffers();
  assert.deepEqual(resolveArchfiendGilferTagOffer(game, source.uid, eventFor(source.uid, { activationId: 'different-link' }), offers[0], canEquip), { resolved: false, reason: 'stale-offer' });
});
test('the adapter does not mutate TagDuel state during listing or resolution', () => {
  const { game, source, event, offers } = actualOffers();
  const before = structuredClone(game);
  resolveArchfiendGilferTagOffer(game, source.uid, event, offers[0], canEquip);
  assert.deepEqual(game, before);
});
test('two different Gilfer activation IDs are not blocked by an invented once-per-turn limit', () => {
  const { game, source } = actualOffers();
  const first = listArchfiendGilferTagOffers(game, source.uid, eventFor(source.uid, { activationId: 'link-1' }), canEquip);
  const second = listArchfiendGilferTagOffers(game, source.uid, eventFor(source.uid, { activationId: 'link-2' }), canEquip);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
});
