'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs/evidence/m662-neko-mane-king.json'), 'utf8'));
const adapter = require('../dist/nekoManeKingTagAdapter');
const { getCardStatus } = require('../dist/effectRegistry');
const { RULES_PROFILE } = require('../dist/rulesProfile');
const card = evidence.card;
assert.equal(card.password, adapter.NEKO_MANE_KING_ID);
assert.equal(card.konamiCardDatabaseId, 5595);
assert.equal(card.ocgFirstRelease, '2004-01-22');
assert.equal(evidence.certification.status, 'not-certified');
assert.equal(evidence.certification.before, 969);
assert.equal(evidence.certification.after, 969);
assert.equal(evidence.certification.new, 0);
assert.equal(evidence.inventoryGrants, 0);
assert.equal(getCardStatus(card.password), undefined, 'isolated adapter must not register/certify a card');
assert.deepEqual({
  mainDeckMin: RULES_PROFILE.mainDeckMin,
  mainDeckMax: RULES_PROFILE.mainDeckMax,
  handLimit: RULES_PROFILE.handLimit,
  handCheck: RULES_PROFILE.handCheck,
  monsterZones: RULES_PROFILE.monsterZones,
  spellTrapZones: RULES_PROFILE.spellTrapZones,
  extraDeckMax: RULES_PROFILE.extraDeckMax,
}, {
  mainDeckMin: 20, mainDeckMax: 30, handLimit: 6, handCheck: 'end',
  monsterZones: 3, spellTrapZones: 3, extraDeckMax: 5,
});
const session = adapter.createNekoManeKingSession();
const captured = adapter.captureNekoManeKingEvent(session, {
  eventId: 'audit-event', activationId: 'audit-activation', cardId: card.password,
  sourceUid: 'm0:audit-uid', fromZone: 'monster', toZone: 'grave', ownerSeat: 0,
  possessorTeam: 0, sourceControllerTeam: 0, turnTeam: 1, turnSeat: 1,
  effectControllerTeam: 1, cause: 'card-effect', chainResolved: true,
  turnNumber: 1, phase: 'battle',
});
assert.ok(captured.trigger);
const resolved = adapter.resolveNekoManeKingTrigger(captured.session, 'audit-activation', {
  turnNumber: 1, turnSeat: 1, phase: 'battle',
});
assert.equal(resolved.resolution.nextPhase, 'end');
assert.equal(resolved.resolution.turnAdvances, false);
assert.equal(resolved.resolution.mustRunEndPhaseProcedures, true);
console.log(JSON.stringify({
  mission: 'M662', card: card.password, officialOcgCutoffEligible: true,
  focusedScenarios: evidence.validation.focusedScenarios,
  certification: evidence.certification,
  inventoryGrants: evidence.inventoryGrants,
  rules: '20-30 / hand 6 at End Phase / 3+3 zones / Extra 5',
  adapter: 'capture + deferred mandatory trigger + idempotent End Phase resolution',
}, null, 2));