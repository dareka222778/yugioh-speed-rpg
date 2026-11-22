const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  inspectOpponentSetCard,
  projectPrivateSetInspection,
  restoreInspectedSetCard,
} = require('../dist/privateSetInspection.js');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'evidence', 'm401-wdjat-private-set-inspection.json'),
  'utf8',
));

const target = (overrides = {}) => ({
  uid: 'm3:backrow-2',
  id: '53129443',
  name: 'Mystical Space Typhoon',
  physicalOwnerSeat: 3,
  controllerTeam: 1,
  zone: 'backrow',
  index: 1,
  faceUp: false,
  ...overrides,
});

const request = (overrides = {}) => ({
  triggerWindow: 'normalSummon',
  resolverSeat: 0,
  resolverTeam: 0,
  target: target(),
  ...overrides,
});

test('A Man with Wdjat can inspect a face-down opposing backrow card on Normal Summon', () => {
  const result = inspectOpponentSetCard(request());
  assert.ok(result);
  assert.equal(result.resolverSeat, 0);
  assert.equal(result.target.uid, 'm3:backrow-2');
  assert.equal(result.target.faceUp, false);
});

test('A Man with Wdjat can inspect a face-down monster in Defense Position', () => {
  const result = inspectOpponentSetCard(request({
    target: target({ zone: 'monster', position: 'def', id: '46986414', name: 'Dark Magician' }),
  }));
  assert.ok(result);
  assert.equal(result.target.zone, 'monster');
  assert.equal(result.target.position, 'def');
});

test('A Man with Wdjat can inspect during its controller Standby Phase', () => {
  const result = inspectOpponentSetCard(request({ triggerWindow: 'controllerStandby' }));
  assert.ok(result);
});

test('A Man with Wdjat cannot inspect a face-up card', () => {
  assert.equal(inspectOpponentSetCard(request({ target: target({ faceUp: true }) })), null);
});

test('A Man with Wdjat cannot inspect a card controlled by its own team', () => {
  assert.equal(inspectOpponentSetCard(request({
    target: target({ controllerTeam: 0, physicalOwnerSeat: 2 }),
  })), null);
});

test('A face-down monster must be in Defense Position to be inspected', () => {
  assert.equal(inspectOpponentSetCard(request({
    target: target({ zone: 'monster', position: 'atk' }),
  })), null);
});

test('the resolver sees the inspected identity and physical owner', () => {
  const result = inspectOpponentSetCard(request());
  assert.ok(result);
  const view = projectPrivateSetInspection(result, { kind: 'seat', seat: 0 });
  assert.deepEqual(view, {
    inspected: true,
    faceDown: true,
    zone: 'backrow',
    targetUid: 'm3:backrow-2',
    cardId: '53129443',
    cardName: 'Mystical Space Typhoon',
    physicalOwnerSeat: 3,
    revealedToViewer: true,
  });
});

test('the resolver partner receives no card ID, name, UID, or physical owner', () => {
  const result = inspectOpponentSetCard(request());
  assert.ok(result);
  const view = projectPrivateSetInspection(result, { kind: 'seat', seat: 2 });
  assert.deepEqual(view, {
    inspected: true,
    faceDown: true,
    zone: 'backrow',
    revealedToViewer: false,
  });
  assert.equal('cardId' in view, false);
  assert.equal('cardName' in view, false);
  assert.equal('targetUid' in view, false);
  assert.equal('physicalOwnerSeat' in view, false);
});

test('the public Discord projection contains no hidden identity', () => {
  const result = inspectOpponentSetCard(request());
  assert.ok(result);
  const view = projectPrivateSetInspection(result, { kind: 'public' });
  assert.deepEqual(view, {
    inspected: true,
    faceDown: true,
    zone: 'backrow',
    revealedToViewer: false,
  });
});

test('the opposing physical owner does not receive a new identity disclosure', () => {
  const result = inspectOpponentSetCard(request());
  assert.ok(result);
  const view = projectPrivateSetInspection(result, { kind: 'seat', seat: 3 });
  assert.equal(view.revealedToViewer, false);
  assert.equal('cardId' in view, false);
});

test('inspection preserves the original UID, owner, zone, index, and face-down state', () => {
  const original = target();
  const before = JSON.stringify(original);
  const result = inspectOpponentSetCard(request({ target: original }));
  assert.ok(result);
  const restored = restoreInspectedSetCard(result);
  assert.deepEqual(restored, original);
  assert.equal(JSON.stringify(original), before);
});

test('control team, not physical ownership, determines whether the target is opposing', () => {
  const result = inspectOpponentSetCard(request({
    resolverSeat: 2,
    resolverTeam: 0,
    target: target({ physicalOwnerSeat: 0, controllerTeam: 1 }),
  }));
  assert.ok(result);
  assert.equal(result.target.physicalOwnerSeat, 0);
  assert.equal(result.target.controllerTeam, 1);
});

test('inspection rejects malformed target identity and zone index', () => {
  assert.throws(() => inspectOpponentSetCard(request({ target: target({ uid: '' }) })), /UID is required/);
  assert.throws(() => inspectOpponentSetCard(request({ target: target({ index: -1 }) })), /zone index/);
});

test('M401 evidence remains source-linked and explicitly uncertified', () => {
  assert.equal(evidence.mission, 'M401');
  assert.equal(evidence.card.id, '51351302');
  assert.equal(evidence.card.konamiId, 5518);
  assert.equal(evidence.card.sourceVerified, true);
  assert.match(evidence.card.officialSourceUrl, /cid=5518/);
  assert.equal(evidence.card.historicalEligibility, 'pending OCG/TCG first-release audit');
  assert.equal(evidence.card.certificationStatus, 'not-certified');
  assert.equal(evidence.card.automaticCertification, false);
});

test('inspection rejects invalid resolver and viewer seats', () => {
  assert.throws(() => inspectOpponentSetCard(request({ resolverSeat: 4 })), /seat from 0 to 3/);
  const result = inspectOpponentSetCard(request());
  assert.ok(result);
  assert.throws(() => projectPrivateSetInspection(result, { kind: 'seat', seat: 4 }), /seat from 0 to 3/);
});

test('inspection fails closed when face-up state is missing', () => {
  assert.equal(inspectOpponentSetCard(request({ target: target({ faceUp: undefined }) })), null);
});
