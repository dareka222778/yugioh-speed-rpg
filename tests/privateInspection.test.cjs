'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  A_MAN_WITH_WDJAT_ID,
  AMAZONESS_CHAIN_MASTER_ID,
  AMAZONESS_CHAIN_MASTER_LP_COST,
  inspectionTeamOfSeat,
  aManWithWdjatCanInspect,
  aManWithWdjatSetCardOptions,
  createSetCardInspectionGrant,
  canViewPrivateInspection,
  projectSetCardInspection,
  restoreSetCardAfterInspection,
  createAmazonessChainMasterHandGrant,
  projectOpponentHand,
  amazonessChainMasterCanPay,
  payAmazonessChainMasterCost,
  amazonessChainMasterMonsterCandidates,
  resolveAmazonessChainMasterSelection,
} = require('../dist/privateInspection.js');

const ids = {
  monster: 'fixture-monster',
  monster2: 'fixture-monster-2',
  spell: 'fixture-spell',
  trap: 'fixture-trap',
};
const metadata = new Map([
  [ids.monster, card(ids.monster, 'monster')],
  [ids.monster2, card(ids.monster2, 'monster')],
  [ids.spell, card(ids.spell, 'spell')],
  [ids.trap, card(ids.trap, 'trap')],
]);
function card(id, kind) {
  return { id, kind, name: id, englishName: id, konamiId: 0,
    summary: 'private inspection fixture', source: 'https://www.db.yugioh-card.com/' };
}
const lookup = id => metadata.get(id);
function chainGrant(viewerSeat = 0, targetSeat = 1, turn = 5, teamLP = 4000) {
  return createAmazonessChainMasterHandGrant(
    AMAZONESS_CHAIN_MASTER_ID, viewerSeat, targetSeat, turn, teamLP, true, true,
  )?.grant;
}
const setRef = (uid, id, physicalOwnerSeat, controllerTeam, zone = 'backrow', faceUp = false) => ({
  uid, id, physicalOwnerSeat, controllerTeam, zone, faceUp,
});
const handRef = (uid, id, ownerSeat, extra = {}) => ({ uid, id, ownerSeat, ...extra });

test('physical seats map to the two teams without merging private hands', () => {
  assert.equal(inspectionTeamOfSeat(0), 0);
  assert.equal(inspectionTeamOfSeat(2), 0);
  assert.equal(inspectionTeamOfSeat(1), 1);
  assert.equal(inspectionTeamOfSeat(3), 1);
  assert.throws(() => inspectionTeamOfSeat(4), /seat must be/);
});

test('A Man with Wdjat accepts only Normal Summon and controller Standby triggers', () => {
  assert.equal(aManWithWdjatCanInspect(A_MAN_WITH_WDJAT_ID, true, 'normalSummon'), true);
  assert.equal(aManWithWdjatCanInspect(A_MAN_WITH_WDJAT_ID, true, 'standby'), true);
  assert.equal(aManWithWdjatCanInspect(A_MAN_WITH_WDJAT_ID, false, 'standby'), false);
  assert.equal(aManWithWdjatCanInspect('other', true, 'standby'), false);
});

test('A Man with Wdjat options include opposing Set cards across both opponent seats only', () => {
  const own = setRef('m0:own-set', ids.trap, 0, 0);
  const opponentA = setRef('m1:set-a', ids.trap, 1, 1, 'backrow');
  const opponentB = setRef('m3:set-b', ids.spell, 3, 1, 'field');
  const faceUp = setRef('m1:face-up', ids.trap, 1, 1, 'backrow', true);
  const options = aManWithWdjatSetCardOptions(
    0, A_MAN_WITH_WDJAT_ID, true, 'normalSummon', [own, opponentA, opponentB, faceUp],
  );
  assert.deepEqual(options.map(x => x.uid), ['m1:set-a', 'm3:set-b']);
  assert.equal(Object.hasOwn(options[0], 'id'), false);
});

test('A Man with Wdjat does not expose targets for an invalid trigger window', () => {
  const target = setRef('m1:set', ids.trap, 1, 1);
  assert.deepEqual(aManWithWdjatSetCardOptions(
    0, A_MAN_WITH_WDJAT_ID, true, 'standby', [target],
  ), [ { uid: target.uid, physicalOwnerSeat: 1, controllerTeam: 1, zone: 'backrow' } ]);
  assert.deepEqual(aManWithWdjatSetCardOptions(
    0, A_MAN_WITH_WDJAT_ID, false, 'normalSummon', [target],
  ), []);
});

test('set-card inspection grant is restricted to one exact physical viewer', () => {
  const target = setRef('m1:set', ids.trap, 1, 1);
  const grant = createSetCardInspectionGrant(
    0, A_MAN_WITH_WDJAT_ID, true, 'normalSummon', [target], target.uid, 2,
  );
  assert.equal(grant.scope, 'set-card');
  assert.equal(grant.viewerSeat, 0);
  assert.equal(canViewPrivateInspection(grant, 0), true);
  assert.equal(canViewPrivateInspection(grant, 2), false);
  assert.equal(canViewPrivateInspection(grant, 1), false);
});

test('A Man with Wdjat rejects allied, face-up, stale and forged Set targets', () => {
  const own = setRef('m0:own', ids.trap, 0, 0);
  const faceUp = setRef('m1:face-up', ids.trap, 1, 1, 'backrow', true);
  assert.equal(createSetCardInspectionGrant(
    0, A_MAN_WITH_WDJAT_ID, true, 'standby', [own], own.uid, 2,
  ), null);
  assert.equal(createSetCardInspectionGrant(
    0, A_MAN_WITH_WDJAT_ID, true, 'standby', [faceUp], faceUp.uid, 2,
  ), null);
  assert.equal(createSetCardInspectionGrant(
    0, A_MAN_WITH_WDJAT_ID, true, 'standby', [own], 'm9:forged', 2,
  ), null);
});

test('only the authorized viewer receives a Set card identity projection', () => {
  const target = setRef('m1:set', ids.trap, 1, 1);
  const grant = createSetCardInspectionGrant(
    0, A_MAN_WITH_WDJAT_ID, true, 'normalSummon', [target], target.uid, 3,
  );
  const identity = { uid: target.uid, id: ids.trap, name: 'Hidden Trap' };
  assert.deepEqual(projectSetCardInspection(grant, 0, identity), {
    visible: true, uid: target.uid, label: 'Hidden Trap', id: ids.trap, name: 'Hidden Trap',
  });
  const partner = projectSetCardInspection(grant, 2, identity);
  assert.equal(partner.visible, false);
  assert.equal(Object.hasOwn(partner, 'id'), false);
  assert.equal(Object.hasOwn(partner, 'name'), false);
  assert.equal(projectSetCardInspection(grant, 1, identity).visible, false);
});

test('inspection does not move, flip or replace the Set card', () => {
  const target = setRef('m1:set', ids.trap, 1, 1, 'backrow');
  const grant = createSetCardInspectionGrant(
    0, A_MAN_WITH_WDJAT_ID, true, 'standby', [target], target.uid, 4,
  );
  const restored = restoreSetCardAfterInspection(grant, [target]);
  assert.equal(restored, target);
  assert.equal(restored.uid, target.uid);
  assert.equal(restored.zone, 'backrow');
  assert.equal(restored.faceUp, false);
  assert.equal(restored.physicalOwnerSeat, 1);
});

test('stale Set card grant cannot inspect a card that moved or changed controller', () => {
  const target = setRef('m1:set', ids.trap, 1, 1);
  const grant = createSetCardInspectionGrant(
    0, A_MAN_WITH_WDJAT_ID, true, 'standby', [target], target.uid, 4,
  );
  assert.equal(restoreSetCardAfterInspection(grant, []), null);
  assert.equal(restoreSetCardAfterInspection(grant, [
    setRef('m1:set', ids.trap, 1, 0),
  ]), null);
});

test('Amazoness Chain Master grants inspection of one opposing physical hand only', () => {
  const result = createAmazonessChainMasterHandGrant(
    AMAZONESS_CHAIN_MASTER_ID, 0, 1, 5, 4000, true, true,
  );
  assert.equal(result.grant.scope, 'opponent-hand');
  assert.equal(result.grant.targetSeat, 1);
  assert.equal(result.grant.targetTeam, 1);
  assert.equal(result.teamLP, 2500);
  assert.equal(createAmazonessChainMasterHandGrant(
    AMAZONESS_CHAIN_MASTER_ID, 0, 3, 5, 4000, true, true,
  ).grant.targetSeat, 3);
  assert.equal(createAmazonessChainMasterHandGrant(
    AMAZONESS_CHAIN_MASTER_ID, 0, 2, 5, 4000, true, true,
  ), null);
  assert.equal(createAmazonessChainMasterHandGrant(
    'other', 0, 1, 5, 4000, true, true,
  ), null);
  assert.equal(createAmazonessChainMasterHandGrant(
    AMAZONESS_CHAIN_MASTER_ID, 0, 1, 5, 1500, true, true,
  ), null);
  assert.equal(createAmazonessChainMasterHandGrant(
    AMAZONESS_CHAIN_MASTER_ID, 0, 1, 5, 4000, false, true,
  ), null);
});

test('the partner and public view only the opponent hand count, never its card identities', () => {
  const grant = chainGrant();
  const hand = [handRef('m1:a', ids.monster, 1), handRef('m1:b', ids.spell, 1)];
  const privateView = projectOpponentHand(grant, 0, hand, lookup);
  assert.equal(privateView.visible, true);
  assert.equal(privateView.count, 2);
  assert.equal(privateView.cards.length, 2);
  const partnerView = projectOpponentHand(grant, 2, hand, lookup);
  assert.deepEqual(partnerView, { visible: false, count: 2 });
  const publicView = projectOpponentHand(grant, 1, hand, lookup);
  assert.deepEqual(publicView, { visible: false, count: 2 });
});

test('unauthorized hand projection never calls card lookup', () => {
  const grant = chainGrant();
  let called = false;
  const guardedLookup = () => { called = true; return undefined; };
  const result = projectOpponentHand(
    grant, 2, [handRef('m1:a', ids.monster, 1)], guardedLookup,
  );
  assert.equal(result.visible, false);
  assert.equal(called, false);
});

test('Chain Master requires battle destruction to the Graveyard and shared LP above 1500', () => {
  assert.equal(AMAZONESS_CHAIN_MASTER_LP_COST, 1500);
  assert.equal(amazonessChainMasterCanPay(
    AMAZONESS_CHAIN_MASTER_ID, true, true, 4000,
  ), true);
  assert.equal(payAmazonessChainMasterCost(
    AMAZONESS_CHAIN_MASTER_ID, true, true, 4000,
  ), 2500);
  assert.equal(amazonessChainMasterCanPay(
    AMAZONESS_CHAIN_MASTER_ID, false, true, 4000,
  ), false);
  assert.equal(amazonessChainMasterCanPay(
    AMAZONESS_CHAIN_MASTER_ID, true, false, 4000,
  ), false);
  assert.equal(amazonessChainMasterCanPay(
    AMAZONESS_CHAIN_MASTER_ID, true, true, 1500,
  ), false);
});

test('Chain Master pays exactly once and does not mutate the supplied team LP', () => {
  const teamLP = 4000;
  const nextLP = payAmazonessChainMasterCost(
    AMAZONESS_CHAIN_MASTER_ID, true, true, teamLP,
  );
  assert.equal(nextLP, 2500);
  assert.equal(teamLP, 4000);
});

test('Chain Master exposes only monsters from the single granted opponent hand', () => {
  const grant = chainGrant(0, 3, 6);
  const hand = [
    handRef('m3:monster', ids.monster, 3),
    handRef('m3:spell', ids.spell, 3),
    handRef('m3:monster2', ids.monster2, 3),
  ];
  assert.deepEqual(amazonessChainMasterMonsterCandidates(
    grant, 0, 3, hand, lookup,
  ).map(card => card.uid), ['m3:monster', 'm3:monster2']);
});

test('Chain Master never merges both opponents or reads the wrong physical hand', () => {
  const grant = chainGrant(0, 1, 6);
  const otherOpponentHand = [handRef('m3:monster', ids.monster, 3)];
  assert.throws(() => amazonessChainMasterMonsterCandidates(
    grant, 0, 3, otherOpponentHand, lookup,
  ), /single opponent physical hand/);
});

test('the partner cannot use Chain Master grant to inspect the active opponent hand', () => {
  const grant = chainGrant(0, 1, 6);
  let called = false;
  const guardedLookup = () => { called = true; return undefined; };
  assert.deepEqual(amazonessChainMasterMonsterCandidates(
    grant, 2, 1, [handRef('m1:monster', ids.monster, 1)], guardedLookup,
  ), []);
  assert.equal(called, false);
});

test('Chain Master selection preserves original owner metadata and rejects stale UIDs', () => {
  const grant = chainGrant(0, 1, 6);
  const selected = handRef('m1:monster', ids.monster, 1, { marker: 'original-owner' });
  const hand = [selected];
  const result = resolveAmazonessChainMasterSelection(
    grant, 0, 1, hand, selected.uid, lookup,
  );
  assert.equal(result, selected);
  assert.equal(result.ownerSeat, 1);
  assert.equal(result.marker, 'original-owner');
  assert.equal(resolveAmazonessChainMasterSelection(
    grant, 0, 1, hand, 'm9:forged', lookup,
  ), null);
  hand.splice(0, 1);
  assert.equal(resolveAmazonessChainMasterSelection(
    grant, 0, 1, hand, selected.uid, lookup,
  ), null);
});

test('Chain Master ignores tokens and does not mutate the opponent hand', () => {
  const grant = chainGrant(0, 1, 6);
  const hand = [
    handRef('m1:token', ids.monster, 1, { entityKind: 'token' }),
    handRef('m1:monster', ids.monster, 1),
  ];
  const before = [...hand];
  assert.deepEqual(amazonessChainMasterMonsterCandidates(
    grant, 0, 1, hand, lookup,
  ), [hand[1]]);
  assert.deepEqual(hand, before);
  assert.equal(hand[0], before[0]);
  assert.equal(hand[1], before[1]);
});

test('duplicate Set UIDs and malformed physical hand references fail closed', () => {
  assert.throws(() => aManWithWdjatSetCardOptions(
    0, A_MAN_WITH_WDJAT_ID, true, 'standby', [
      setRef('m1:dup', ids.trap, 1, 1),
      setRef('m1:dup', ids.spell, 1, 1),
    ],
  ), /duplicate physical UID/);
  const grant = chainGrant(0, 1, 6);
  assert.throws(() => amazonessChainMasterMonsterCandidates(
    grant, 0, 1, [{}], lookup,
  ), /invalid card reference/);
});
