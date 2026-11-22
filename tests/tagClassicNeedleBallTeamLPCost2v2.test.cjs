const {test} = require('node:test');
const assert = require('node:assert/strict');
const {getPlayableCard} = require('../dist/effectRegistry');

test('Needle Ball 2v2 LP-cost behavior remains explicitly blocked until its card definition and resolver registration are transferred', {
  skip: 'Passcode 94230224 is absent from the shared branch; the Flip LP-cost effect requires the M61 monsterEffects/duelEngineCurrent handoff. Do not certify by import or helper-only coverage.'
}, () => {
  assert.ok(getPlayableCard('94230224'));
});
